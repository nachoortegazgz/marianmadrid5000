/*
=============================================================================
MODULE: backend/booking/bookingSaga.js
RESPONSIBILITY: Transactional Saga Orchestrator Engine for simple and dual bookings.
STANDARDS: G10 ASCII Strict, Velo Native Optimized, Atomic Idempotency.
=============================================================================
*/

import wixData from 'wix-data';
import {
  COLLECTIONS, APP_IDS, MONEY, STAFF_DEFAULT_NAME,
  makeTraceId, _safeTrim, _safeEmail, _safePhone, _looksLikeGuid,
  _normalizeLocalIsoStr, getUtcDateFromMadridLocal, getMadridLocalStringNoZ,
  findStaff, _isValidEmail
} from 'public/mmUtils';
import {
  createBookingElevated, cancelBookingElevated, createCheckoutElevated, getCheckoutUrlElevated,
  confirmOrDeclineBookingElevated, _forceStaffInPristineSlot, _persistBooking,
  _normalizeAddons, _sumAddons, _handleError, createBookingError, logger,
  _initTransaction, _completeTransaction, _failTransaction
} from 'backend/booking/bookingCore';
import { hashSHA256 } from 'backend/securityEngine';
import { _getServiceBySlugOrIdInternal, _resolveStaffForSlotInternal, _resolvePrimaryServiceIdInternal, _invalidateCachesInternal } from 'backend/reservas.web';

const log = logger;
const CITAS_COLLECTION = COLLECTIONS.CITAS;
const COMPENSATIONS_COLLECTION = COLLECTIONS.COMPENSATIONS;

function _resolveStablePairToken({ metaCita, unsafePayload, email, phaseOneServiceId, slotF1, slotF2, resourceId }) {
  const fromMeta = _safeTrim(metaCita?.pairToken || metaCita?.uiPairToken);
  const fromPayload = _safeTrim(unsafePayload?.uiPairToken || unsafePayload?.pairToken);
  if (fromMeta || fromPayload) return fromMeta || fromPayload;

  const emailHash = hashSHA256(email || '').substring(0, 8);
  const f1Start = _safeTrim(slotF1?.localStartDate || slotF1?.startDate || '');
  const f2Start = slotF2 ? _safeTrim(slotF2.localStartDate || slotF2.startDate || '') : '';
  const srvId = _safeTrim(phaseOneServiceId || '');
  const resId = _safeTrim(resourceId || slotF1?.resourceId || '');

  const hashInput = f2Start ? `${srvId}_${resId}_${f1Start}_${f2Start}` : `${srvId}_${resId}_${f1Start}`;
  return `pt_${hashSHA256(hashInput).substring(0, 16)}_${emailHash}`;
}

function _extractCheckoutId(checkoutSession) {
  return checkoutSession?.checkout?._id || checkoutSession?.checkout?.id || checkoutSession?._id || null;
}

class SagaStep {
  constructor(name, executeFn, compensateFn = null) {
    this.name = name;
    this.executeFn = executeFn;
    this.compensateFn = compensateFn;
  }
}

export class BookingSagaOrchestrator {
  constructor(traceId) {
    this.traceId = traceId || makeTraceId('saga');
    this.executedSteps = [];
  }

  async execute(steps) {
    for (const step of steps) {
      try {
        const stepResult = await step.executeFn();
        if (stepResult && stepResult.ok === false) {
          throw createBookingError(stepResult.code || 'SAGA_STEP_FAILED', stepResult.message || `Fallo en el paso: ${step.name}`);
        }
        this.executedSteps.push(step);
      } catch (error) {
        log.error(`[SagaOrchestrator] Step '${step.name}' failed. Initiating rollback...`, { error: error?.message, traceId: this.traceId });
        await this._rollback();
        throw error;
      }
    }
  }

  async _rollback() {
    const reversedSteps = [...this.executedSteps].reverse();
    for (const step of reversedSteps) {
      if (typeof step.compensateFn === 'function') {
        try {
          await step.compensateFn();
        } catch (compError) {
          log.error(`[SagaOrchestrator] Compensation for step '${step.name}' failed`, { error: compError?.message, traceId: this.traceId });
        }
      }
    }
  }
}

export async function executeBookingSaga(unsafePayload) {
  const traceId = unsafePayload?.traceId || makeTraceId('saga-book');
  let pairToken = null;
  let sagaSteps = [];

  try {
    if (!unsafePayload || !unsafePayload.cliente || !unsafePayload.metaCita) {
      throw createBookingError('INVALID_PAYLOAD', 'Payload transaccional no valido.');
    }

    const email = _safeEmail(unsafePayload.cliente.email);
    if (!email || !_isValidEmail(email)) throw createBookingError('INVALID_EMAIL', 'Correo electronico no valido.');

    const { slotF1, slotF2, cliente, metaCita } = unsafePayload;
    if (!slotF1) throw createBookingError('INVALID_PAYLOAD', 'La primera fase (slotF1) es obligatoria.');

    const primaryServiceIdRaw = _safeTrim(metaCita?.primaryServiceId || unsafePayload?.primaryServiceId || slotF1?.serviceId);
    const phaseOneServiceId = await _resolvePrimaryServiceIdInternal(primaryServiceIdRaw);
    if (!phaseOneServiceId) return { status: 'ERROR', error: { code: 'SERVICE_NOT_FOUND', message: 'Servicio principal no valido.' } };

    const f1LocalStart = _normalizeLocalIsoStr(slotF1.localStartDate);
    if (!f1LocalStart) throw createBookingError('INVALID_DATES', 'La hora de inicio de la Fase 1 es obligatoria.');

    const isDualRequested = !!slotF2;
    const rawFilter = metaCita?.resourceFilterId ?? unsafePayload?.resourceFilterId ?? null;
    const isAnyResourceRequested = !rawFilter || ['all', 'any', ''].includes(String(rawFilter).trim().toLowerCase());
    
    const assignedResource = _looksLikeGuid(rawFilter) ? rawFilter : (_looksLikeGuid(slotF1.resourceId) ? slotF1.resourceId : null);
    const resourceIdForResolve = isAnyResourceRequested ? null : assignedResource;

    const svc = await _getServiceBySlugOrIdInternal(phaseOneServiceId, traceId);
    if (!svc || svc.status !== 'SUCCESS' || !svc.data) {
      return { status: 'ERROR', error: { code: 'SERVICE_NOT_FOUND', message: 'No se pudo cargar el servicio.' } };
    }

    const serviceData = svc.data;
    if (isDualRequested && !serviceData.permitirCombinar) {
      return { status: 'ERROR', error: { code: 'DUAL_NOT_ALLOWED', message: 'Este servicio no permite combinacion.' } };
    }

    const tiempoFase1Ms = (Number(serviceData.tiempoFase1) || 0) * 60 * 1000;
    const f1StartUtc = getUtcDateFromMadridLocal(f1LocalStart);
    const f1LocalEndSSOT = _normalizeLocalIsoStr(slotF1.localEndDate) || getMadridLocalStringNoZ(new Date(f1StartUtc.getTime() + tiempoFase1Ms));

    const isDual = !!(isDualRequested && serviceData.permitirCombinar && serviceData.secondaryServiceGuid);
    let phaseTwoServiceId = null;
    let f2LocalStart = null;
    let f2LocalEnd = null;

    if (isDual) {
      phaseTwoServiceId = await _resolvePrimaryServiceIdInternal(serviceData.secondaryServiceGuid);
      f2LocalStart = _normalizeLocalIsoStr(slotF2?.localStartDate);
      f2LocalEnd = _normalizeLocalIsoStr(slotF2?.localEndDate);
      if (!f2LocalStart || !f2LocalEnd) return { status: 'ERROR', error: { code: 'INVALID_F2_TIMING', message: 'Tiempos de la segunda fase no validos.' } };
    }

    const resourceValidation = await _resolveStaffForSlotInternal(
      String(phaseOneServiceId), f1LocalStart, f1LocalEndSSOT, f2LocalStart, f2LocalEnd, resourceIdForResolve
    );

    if (resourceValidation?.status !== 'SUCCESS' || !resourceValidation?.data?.slotF1) {
      return { status: 'ERROR', error: { code: 'SLOT_UNAVAILABLE', message: 'El horario seleccionado ya no esta disponible.' } };
    }

    const finalResourceId = resourceValidation?.data?.resourceId || assignedResource;
    if (!finalResourceId) return { status: 'ERROR', error: { code: 'SLOT_UNAVAILABLE', message: 'No se pudo asignar profesional.' } };

    const resourceObj = findStaff(finalResourceId);
    const finalResourceName = resourceObj?.displayName || STAFF_DEFAULT_NAME;

    const stableToken = _resolveStablePairToken({
      metaCita, unsafePayload, email, phaseOneServiceId, slotF1, slotF2: isDual ? slotF2 : null, resourceId: finalResourceId
    });
    pairToken = stableToken;

    const phases = [{
      key: 'F1', serviceId: String(phaseOneServiceId), validatedSlot: resourceValidation.data.slotF1,
      localStart: f1LocalStart, localEnd: f1LocalEndSSOT, tipo: isDual ? 'dual_fase1' : 'simple', isDual
    }];
    if (isDual && resourceValidation.data.slotF2) {
      phases.push({
        key: 'F2', serviceId: String(phaseTwoServiceId), validatedSlot: resourceValidation.data.slotF2,
        localStart: f2LocalStart, localEnd: f2LocalEnd, tipo: 'dual_fase2', isDual: true
      });
    }

    // =====================================================================
    // ATOMIC IDEMPOTENCY GUARD (Replaces Mutex Locks)
    // =====================================================================
    const payloadHash = hashSHA256(JSON.stringify({
      slotF1: { serviceId: String(phaseOneServiceId), start: f1LocalStart, end: f1LocalEndSSOT },
      slotF2: isDual ? { serviceId: String(phaseTwoServiceId), start: f2LocalStart, end: f2LocalEnd } : null,
      pairToken: stableToken
    }));

    const txResult = await _initTransaction(stableToken, payloadHash, traceId);
    if (!txResult.success) {
      return { status: 'ERROR', error: { code: 'TRANSACTION_BUSY', message: 'Ya hay una reserva en proceso para este horario.' } };
    }

    if (!txResult.isNew) {
      if (txResult.existing && txResult.existing.status === 'COMPLETED') {
        return { status: 'SUCCESS', data: txResult.existing.result, idempotent: true, error: null };
      }
      return { status: 'PROCESSING', data: { retryAfter: 2, message: 'La reserva esta siendo procesada.' }, error: null };
    }

    const saga = new BookingSagaOrchestrator(traceId);
    const createdBookings = [];
    let checkoutSession = null;
    let checkoutUrl = null;

    const rawName = cliente.nombre || cliente.firstName || 'Cliente';
    const nameParts = String(rawName).trim().split(/\s+/);
    const contactDetails = {
      firstName: nameParts[0] || 'Cliente',
      lastName: nameParts.slice(1).join(' ') || '',
      email,
      phone: _safePhone(cliente.telefono || cliente.phone)
    };

    const addonsNorm = _normalizeAddons(metaCita?.addons || []);
    const addonsTotal = _sumAddons(addonsNorm);
    const serviceName = metaCita?.servicioNombre || serviceData?.metadata?.titulo || 'Servicio';
    const basePrice = Number(metaCita?.precioBase || serviceData?.metadata?.pricing?.base || 0);
    const totalBilled = basePrice + addonsTotal;
    const madridDateYMD = f1LocalStart.slice(0, 10);

    for (const p of phases) {
      const durationMinutes = p.key === 'F2' ? Number(serviceData.tiempoFase2) || 30 : Number(serviceData.tiempoFase1) || 30;
      p.pristineSlot = await _forceStaffInPristineSlot(p.validatedSlot, finalResourceId, durationMinutes);
      if (!p.pristineSlot) throw createBookingError('INVALID_SLOT', `Formato de slot invalido (${p.key})`);
    }

    sagaSteps.push(
      new SagaStep(
        'CreateBookings',
        async () => {
          const createPhase = async (p) => {
            const res = await createBookingElevated({
              serviceId: p.serviceId,
              bookedEntity: { slot: p.pristineSlot },
              contactDetails,
              totalParticipants: 1,
              options: { flowControlSettings: { skipAvailabilityValidation: false, skipBusinessConfirmation: false } }
            });
            const bId = res?.booking?._id || res?._id;
            const rev = Number(res?.booking?.revision || res?.revision || 1);
            if (!bId) throw new Error(`Falta bookingId para la Fase ${p.key}`);
            createdBookings.push({ bookingId: bId, revision: rev, phase: p });
          };

          if (isDual) {
            await Promise.all([createPhase(phases[0]), createPhase(phases[1])]);
          } else {
            await createPhase(phases[0]);
          }
          return { ok: true };
        },
        async () => {
          for (const b of createdBookings) {
            await cancelBookingElevated(b.bookingId, { revision: b.revision, flowControlSettings: { ignoreCancellationPolicy: true } })
              .catch(() => {
                wixData.insert(COMPENSATIONS_COLLECTION, { bookingId: b.bookingId, phase: b.phase.key, status: 'PENDING', attempts: 0, traceId }, { suppressAuth: true }).catch(() => {});
              });
          }
        }
      )
    );

    const isOnlinePayment = metaCita?.metodoPago === 'ONLINE';
    const needsCheckout = !!isOnlinePayment;
    const f1Booking = createdBookings.find((b) => b.phase?.key === 'F1');
    const f2Booking = createdBookings.find((b) => b.phase?.key === 'F2');

    if (needsCheckout) {
      sagaSteps.push(
        new SagaStep('CreateCheckout', async () => {
          const lineItems = createdBookings.map((b) => ({
            quantity: 1, catalogReference: { appId: APP_IDS.BOOKINGS, catalogItemId: String(b.bookingId) }
          }));
          checkoutSession = await createCheckoutElevated({ lineItems, channelType: 'WEB' });
          const checkoutId = _extractCheckoutId(checkoutSession);
          if (!checkoutId) throw new Error('CHECKOUT_ID_MISSING');
          const urlRes = await getCheckoutUrlElevated(checkoutId);
          checkoutUrl = urlRes?.checkoutUrl || null;
          return { ok: true };
        })
      );
    } else {
      sagaSteps.push(
        new SagaStep('ConfirmPresencial', async () => {
          for (const b of createdBookings) {
            await confirmOrDeclineBookingElevated(b.bookingId, { paymentStatus: 'NOT_PAID', revision: b.revision });
          }
          return { ok: true };
        })
      );
    }

    await saga.execute(sagaSteps);

    const paymentPlan = {
      metodoPago: needsCheckout ? 'ONLINE' : 'PRESENCIAL',
      estadoPago: needsCheckout ? 'PENDING_PAYMENT' : 'CONFIRMED_UNPAID',
      checkoutId: _extractCheckoutId(checkoutSession)
    };

    const baseMeta = {
      pairToken: stableToken, addons: addonsNorm, addonsTotal,
      resourceId: finalResourceId || null, resourceFilterId: rawFilter || null,
      resourceFilterName: isAnyResourceRequested ? 'PROFESIONAL SEGUN HORARIO' : finalResourceName,
      primaryServiceId: phaseOneServiceId, secondaryServiceId: phaseTwoServiceId || null,
      traceId, esCombinado: isDual, fechaYmdMadrid: madridDateYMD, servicioNombre: serviceName,
      uiPairToken: stableToken, bookingIdF2: isDual ? f2Booking?.bookingId || null : null,
      ...(paymentPlan.checkoutId ? { checkoutId: paymentPlan.checkoutId } : {})
    };

    const persistPromises = createdBookings.map((b) => {
      const phase = b.phase;
      const startUtc = getUtcDateFromMadridLocal(phase.localStart);
      const endUtc = getUtcDateFromMadridLocal(phase.localEnd);
      return _persistBooking({
        bookingId: b.bookingId, revision: b.revision, serviceId: phase.serviceId,
        scheduleId: phase.pristineSlot?.scheduleId || '', resourceId: finalResourceId,
        startDate: startUtc, endDate: endUtc, contactDetails, tipo: phase.tipo,
        meta: { ...baseMeta, estadoPago: paymentPlan.estadoPago, metodoPago: paymentPlan.metodoPago, precioAuditado: totalBilled }
      }, traceId);
    });

    await Promise.all(persistPromises);

    const f1StartUtcFinal = getUtcDateFromMadridLocal(phases[0].localStart);
    const f2StartUtcFinal = isDual && phases[1]?.localStart ? getUtcDateFromMadridLocal(phases[1].localStart) : null;

    const resultData = {
      requiresPayment: needsCheckout, checkoutUrl,
      bookingIdF1: f1Booking?.bookingId || null, bookingIdF2: f2Booking?.bookingId || null,
      isCombined: isDual,
      confirmation: !needsCheckout ? {
        cliente: contactDetails.firstName, servicio: serviceName, fecha: madridDateYMD,
        hora: f1StartUtcFinal ? (getMadridLocalStringNoZ(f1StartUtcFinal).split('T')[1] || '').slice(0, 5) : null,
        horaF2: isDual && f2StartUtcFinal ? (getMadridLocalStringNoZ(f2StartUtcFinal).split('T')[1] || '').slice(0, 5) : null,
        estilista: finalResourceName, total: totalBilled, moneda: MONEY?.DISPLAY_CURRENCY || 'EUR'
      } : null
    };

    await _completeTransaction(stableToken, resultData);

    try {
      await _invalidateCachesInternal(String(phaseOneServiceId), madridDateYMD, finalResourceId, traceId);
    } catch (e) {
      log.warn('invalidateCachesInternal failed (best-effort)', { traceId, message: e?.message });
    }

    return { status: 'SUCCESS', data: resultData, error: null };
  } catch (error) {
    if (pairToken) await _failTransaction(pairToken, error?.message || String(error)).catch(() => {});
    return _handleError(error, 'executeBookingSaga', traceId, log);
  }
}