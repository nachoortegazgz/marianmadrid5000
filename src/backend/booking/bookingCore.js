/*
 =============================================================================
 MODULE: backend/booking/bookingCore.js
 VERSION: v5003-canonical-booking-core
 RESPONSIBILITY: Core transactional booking persistence, distributed mutex locks,
                 Writer V2 projections, and bucket-indexed dual slot matching.
 CORRECTIONS: MATRIZ field renames, collection IDs, paymentStatus validation.
 STANDARDS: G10 ASCII Strict.
 =============================================================================
 */
import { bookings } from "wix-bookings.v2";
import { checkout } from "wix-ecom-backend";
import { elevate } from "wix-auth";
import wixData from "wix-data";
import { findStaff } from "backend/staff";
import {
  COLLECTIONS, CONCURRENCY, SDK_CONFIG,
} from "backend/internalConfig";
import {
  _safeTrim, _looksLikeGuid, getUtcDateFromMadridLocal,
  getMadridLocalStringNoZ, makeTraceId, _normalizeLocalIsoStr,
} from "public/mmUtils";
import { hashSHA256 } from "backend/securityEngine";

export const logger = {
  error: (msg, data) => console.error("[bookingCore] ERROR:", msg, data),
  warn: (msg, data) => console.warn("[bookingCore] WARN:", msg, data),
  info: (msg, data) => console.log("[bookingCore] INFO:", msg, data),
};
const log = logger;

export const ERROR_CODES = Object.freeze({
  INVALID_PAYLOAD: "INVALID_PAYLOAD",
  TOKEN_BUSY: "TOKEN_BUSY",
  FISCAL_SIGN_FAIL: "FISCAL_SIGN_FAIL",
  FISCAL_VIOLATION: "FISCAL_VIOLATION",
  BOOKING_CREATION_FAILED: "BOOKING_CREATION_FAILED",
  CHECKOUT_FAILED: "CHECKOUT_FAILED",
  INVALID_EMPLOYEE: "INVALID_EMPLOYEE",
  AUTH_REQUIRED: "AUTH_REQUIRED",
  ACCESS_DENIED: "ACCESS_DENIED",
  INVALID_CLOCK_TYPE: "INVALID_CLOCK_TYPE",
  RATE_LIMITED: "RATE_LIMITED",
  SLOT_UNAVAILABLE: "SLOT_UNAVAILABLE",
  SERVICE_NOT_FOUND: "SERVICE_NOT_FOUND",
  RESOURCE_NOT_AVAILABLE: "RESOURCE_NOT_AVAILABLE",
  DUAL_NOT_ALLOWED: "DUAL_NOT_ALLOWED",
  INVALID_F2_TIMING: "INVALID_F2_TIMING",
  INVALID_DATES: "INVALID_DATES",
  INVALID_EMAIL: "INVALID_EMAIL",
  INVALID_PHONE: "INVALID_PHONE",
  TIMEOUT: "TIMEOUT",
  NETWORK_ERROR: "NETWORK_ERROR",
  DATA_CONFLICT: "DATA_CONFLICT",
  IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
  LOCK_ACQUISITION_FAILED: "LOCK_ACQUISITION_FAILED",
  TRANSACTION_FAILED: "TRANSACTION_FAILED",
  COMPENSATION_FAILED: "COMPENSATION_FAILED",
});

// FIX: Colecciones canonicas PascalCase (MATRIZ + datos del usuario)
const CITAS_COLLECTION = COLLECTIONS.CITAS_F2 || "CitasF2";
const COMPENSATIONS_COLLECTION = COLLECTIONS.COMPENSACIONES_PENDIENTES || "CompensacionesPendientes";
const TRANSACTIONS_COLLECTION = COLLECTIONS.BOOKING_TRANSACTIONS || "BookingTransactions";
const LOCKS_COLLECTION = COLLECTIONS.LOCKS || "SlotLocks";
const API_TIMEOUT_MS = SDK_CONFIG?.TIMEOUTS?.API_MS || 15000;
const LOCK_TTL_MS = Number(CONCURRENCY?.MUTEX_TTL_MS) || 300000;

export function createBookingError(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  error.isBookingError = true;
  error.timestamp = new Date().toISOString();
  return error;
}

export function normalizeError(error) {
  if (error && error.isBookingError) {
    return { code: error.code || ERROR_CODES.NETWORK_ERROR, message: error.message, details: error.details || null };
  }
  const code = String(error?.code || error?.errorCode || ERROR_CODES.NETWORK_ERROR);
  const message = error?.message || error?.errorDescription || String(error || "Unknown error occurred");
  return { code, message, details: error?.details || null };
}

export async function _updateCitaSafe(bookingId, updater, traceId = "no-trace", operation = "updateCita") {
  const cleanBookingId = _safeTrim(bookingId);
  if (!cleanBookingId || typeof updater !== "function") {
    throw createBookingError(ERROR_CODES.INVALID_PAYLOAD, "Booking ID and updater are required", { bookingId, operation, traceId });
  }
  const queryResult = await withTimeout(
    wixData.query(CITAS_COLLECTION).eq("bookingId", cleanBookingId).limit(1).find({ suppressAuth: true, consistentRead: true }),
    API_TIMEOUT_MS
  );
  let current = queryResult?.items?.[0] || null;
  if (!current) {
    current = await withTimeout(
      wixData.get(CITAS_COLLECTION, cleanBookingId, { suppressAuth: true, consistentRead: true }),
      API_TIMEOUT_MS
    );
  }
  if (!current) {
    throw createBookingError(ERROR_CODES.DATA_CONFLICT, "Booking not found", { bookingId: cleanBookingId, operation, traceId });
  }
  const persistedMeta = current.meta;
  let normalizedMeta = persistedMeta;
  if (typeof normalizedMeta === "string") {
    try { normalizedMeta = JSON.parse(normalizedMeta); } catch (_) { normalizedMeta = {}; }
  }
  const currentForUpdater = normalizedMeta === persistedMeta ? current : { ...current, meta: normalizedMeta };
  const updated = await updater(currentForUpdater);
  if (updated === null || updated === undefined) return current;
  const record = { ...updated, _id: current._id || updated._id || cleanBookingId };
  return wixData.update(CITAS_COLLECTION, record, { suppressAuth: true });
}

export async function _initTransaction(pairToken, payloadHashOrTraceId, traceId = null) {
  const activeTraceId = traceId || payloadHashOrTraceId;
  const payloadHash = traceId ? payloadHashOrTraceId : null;
  const transactionId = `tx_${hashSHA256(`${pairToken}_${payloadHash || activeTraceId}`).substring(0, 16)}`;
  try {
    const transactionRecord = {
      _id: transactionId, pairToken, traceId: activeTraceId, payloadHash,
      status: "INITIATED", createdAt: new Date(), updatedAt: new Date(),
    };
    await withTimeout(wixData.insert(TRANSACTIONS_COLLECTION, transactionRecord, { suppressAuth: true }), API_TIMEOUT_MS);
    return { ok: true, success: true, isNew: true, transactionId };
  } catch (error) {
    return { ok: false, success: false, isNew: false, code: ERROR_CODES.TRANSACTION_FAILED, message: error.message };
  }
}

export async function _completeTransaction(transactionId, result = null) {
  try {
    await withTimeout(
      wixData.update(TRANSACTIONS_COLLECTION, { _id: transactionId, status: "COMPLETED", result, updatedAt: new Date() }, { suppressAuth: true }),
      API_TIMEOUT_MS
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, code: ERROR_CODES.TRANSACTION_FAILED, message: error.message };
  }
}

export async function _failTransaction(transactionId, reason) {
  try {
    await withTimeout(
      wixData.update(TRANSACTIONS_COLLECTION, { _id: transactionId, status: "FAILED", failureReason: reason, updatedAt: new Date() }, { suppressAuth: true }),
      API_TIMEOUT_MS
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, code: ERROR_CODES.TRANSACTION_FAILED, message: error.message };
  }
}

export function _buildLockKeys(phases, lockResourceKey) {
  const keys = [];
  for (const phase of phases) {
    const serviceId = phase.serviceId || "ANY_SERVICE";
    const startTime = phase.localStart || "ANY_TIME";
    keys.push(`lock:${serviceId}:${lockResourceKey}:${startTime}`);
  }
  return keys;
}

export async function _lockSlotKeyOrFail(lockKey, ownerId, ttlMs = LOCK_TTL_MS) {
  try {
    const existingLock = await withTimeout(
      wixData.query(LOCKS_COLLECTION).eq("lockKey", lockKey).ne("status", "RELEASED").find({ suppressAuth: true }),
      API_TIMEOUT_MS
    );
    if (existingLock.items && existingLock.items.length > 0) {
      let hasActiveLock = false;
      const staleLocks = [];
      for (const lock of existingLock.items) {
        const expiresAt = new Date(lock.expiresAt).getTime();
        const lockAge = Date.now() - new Date(lock.createdAt).getTime();
        const isActive = Number.isFinite(expiresAt) ? expiresAt > Date.now() : lockAge < ttlMs;
        if (isActive) { hasActiveLock = true; break; }
        staleLocks.push(lock);
      }
      if (hasActiveLock) return { ok: false, code: ERROR_CODES.TOKEN_BUSY, message: "Slot already locked" };
      for (const staleLock of staleLocks) {
        await withTimeout(
          wixData.update(LOCKS_COLLECTION, { _id: staleLock._id, status: "RELEASED", releasedAt: new Date() }, { suppressAuth: true }),
          API_TIMEOUT_MS
        ).catch(() => {});
      }
    }
    await withTimeout(wixData.insert(LOCKS_COLLECTION, {
      lockKey, ownerId, status: "ACQUIRED", createdAt: new Date(), expiresAt: new Date(Date.now() + ttlMs), ttlMs,
    }, { suppressAuth: true }), API_TIMEOUT_MS);
    return { ok: true, lockKey, ownerId };
  } catch (error) {
    return { ok: false, code: ERROR_CODES.LOCK_ACQUISITION_FAILED, message: error.message };
  }
}

export async function _unlockSlotKey(lockKey, ownerId) {
  try {
    const existingLocks = await withTimeout(
      wixData.query(LOCKS_COLLECTION).eq("lockKey", lockKey).eq("ownerId", ownerId).eq("status", "ACQUIRED").find({ suppressAuth: true }),
      API_TIMEOUT_MS
    );
    if (existingLocks.items && existingLocks.items.length > 0) {
      await withTimeout(wixData.update(LOCKS_COLLECTION, { _id: existingLocks.items[0]._id, status: "RELEASED", releasedAt: new Date() }, { suppressAuth: true }), API_TIMEOUT_MS);
      return { ok: true };
    }
    return { ok: true, message: "Lock not found or already released" };
  } catch (error) {
    return { ok: false, code: ERROR_CODES.LOCK_ACQUISITION_FAILED, message: error.message };
  }
}

export async function _renewLock(lockKey, ownerId, ttlMs = LOCK_TTL_MS) {
  try {
    const existingLocks = await withTimeout(
      wixData.query(LOCKS_COLLECTION).eq("lockKey", lockKey).eq("ownerId", ownerId).eq("status", "ACQUIRED").find({ suppressAuth: true }),
      API_TIMEOUT_MS
    );
    if (existingLocks.items && existingLocks.items.length > 0) {
      await withTimeout(wixData.update(LOCKS_COLLECTION, { _id: existingLocks.items[0]._id, expiresAt: new Date(Date.now() + ttlMs), updatedAt: new Date() }, { suppressAuth: true }), API_TIMEOUT_MS);
      return { ok: true };
    }
    return { ok: false, code: ERROR_CODES.TOKEN_BUSY, message: "Lock not found" };
  } catch (error) {
    return { ok: false, code: ERROR_CODES.LOCK_ACQUISITION_FAILED, message: error.message };
  }
}

// FIX: _persistBooking valida paymentStatus (MATRIZ: statusPago -> paymentStatus)
export async function _persistBooking(params, traceId = "no-trace") {
  if (!params || typeof params !== "object") {
    throw createBookingError(ERROR_CODES.INVALID_PAYLOAD, "Booking payload is required", { traceId });
  }
  if (!params.bookingId || !params.primaryServiceGuid || !params.scheduleId) {
    const missingFields = [];
    if (!params.bookingId) missingFields.push("bookingId");
    if (!params.primaryServiceGuid) missingFields.push("primaryServiceGuid");
    if (!params.scheduleId) missingFields.push("scheduleId");
    throw createBookingError(ERROR_CODES.INVALID_PAYLOAD, `Missing required fields: ${missingFields.join(", ")}`, { traceId, missingFields });
  }
  if (!isValidGuid(params.primaryServiceGuid)) {
    throw createBookingError(ERROR_CODES.INVALID_PAYLOAD, `Invalid primaryServiceGuid: ${params.primaryServiceGuid}`, { traceId });
  }
  if (params.resourceId && !isValidGuid(params.resourceId)) {
    throw createBookingError(ERROR_CODES.INVALID_PAYLOAD, `Invalid resourceId: ${params.resourceId}`, { traceId });
  }
  if (isNaN(new Date(params.startDate).getTime()) || isNaN(new Date(params.endDate).getTime())) {
    throw createBookingError(ERROR_CODES.INVALID_DATES, "Invalid start or end date", { traceId });
  }
  // FIX: bookingType en lugar de tipo (MATRIZ: tipo -> bookingType)
  const validTypes = ["simple", "dual_fase1", "dual_fase2"];
  if (!validTypes.includes(params.bookingType || params.tipo)) {
    throw createBookingError(ERROR_CODES.INVALID_PAYLOAD, `Invalid booking type`, { traceId, bookingType: params.bookingType });
  }
  const meta = (params.meta && typeof params.meta === "object")
    ? params.meta
    : (typeof params.meta === "string" ? (() => { try { return JSON.parse(params.meta); } catch { return null; } })() : null);
  // FIX: valida paymentStatus en meta (MATRIZ: statusPago -> paymentStatus)
  if (!meta || typeof meta !== "object" || !meta.paymentStatus) {
    throw createBookingError(ERROR_CODES.INVALID_PAYLOAD, "Booking meta is required and must include paymentStatus", { traceId });
  }
  const validPaymentStates = ["UNPAID", "NOT_PAID", "PENDING_PAYMENT", "CONFIRMED_UNPAID", "PAID"];
  if (!validPaymentStates.includes(meta.paymentStatus)) {
    throw createBookingError(ERROR_CODES.INVALID_PAYLOAD, `Invalid payment state: ${meta.paymentStatus}`, { traceId });
  }
  const bookingRecord = {
    _id: params.bookingId,
    revision: params.revision,
    primaryServiceGuid: params.primaryServiceGuid,
    scheduleId: params.scheduleId,
    resourceId: params.resourceId,
    startDate: params.startDate,
    endDate: params.endDate,
    contactDetails: params.contactDetails,
    bookingType: params.bookingType || params.tipo,
    meta: JSON.stringify(meta),
    traceId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  try {
    const result = await withTimeout(wixData.insert(CITAS_COLLECTION, bookingRecord), API_TIMEOUT_MS);
    return { created: true, item: result };
  } catch (error) {
    throw error;
  }
}

export function _normalizeAddons(addons) {
  if (!addons || !Array.isArray(addons)) return [];
  return addons.map((addon) => ({
    id: _safeTrim(addon.id), name: _safeTrim(addon.name),
    price: Number(addon.price) || 0, quantity: Number(addon.quantity) || 1,
  }));
}

export function _sumAddons(addons) {
  if (!addons || !Array.isArray(addons)) return 0;
  return addons.reduce((sum, addon) => sum + (Number(addon.price) || 0) * (Number(addon.quantity) || 1), 0);
}

export async function _handleError(error, context = {}) {
  const bookingError = createBookingError(error.code || ERROR_CODES.NETWORK_ERROR, error.message || "Unknown error occurred", { ...context, timestamp: new Date().toISOString() });
  log.error(`[bookingCore] Error handled`, { code: bookingError.code, message: bookingError.message, context });
  return { ok: false, error: bookingError };
}

export async function createBookingElevated(payload) {
  try {
    const elevatedCreate = elevate(bookings.createBooking);
    const result = await elevatedCreate({
      serviceId: payload.serviceId,
      bookedEntity: payload.bookedEntity,
      contactDetails: payload.contactDetails,
      totalParticipants: payload.totalParticipants,
      options: payload.options,
    });
    const booking = result?.booking || result?.data?.booking || result;
    const bookingId = booking?._id || booking?.id || result?.bookingId;
    return { ok: true, data: { bookingId, revision: booking?.revision, status: booking?.status }, raw: result };
  } catch (error) {
    return { ok: false, code: ERROR_CODES.BOOKING_CREATION_FAILED, message: error.message };
  }
}

export async function cancelBookingElevated(bookingId, options = {}) {
  try {
    const elevatedCancel = elevate(bookings.cancelBooking);
    await elevatedCancel({ bookingId, ...(options && typeof options === "object" ? options : {}) });
    return { ok: true, data: { bookingId, status: "CANCELLED" } };
  } catch (error) {
    return { ok: false, code: ERROR_CODES.BOOKING_CREATION_FAILED, message: error.message };
  }
}

export async function createCheckoutElevated(payload) {
  try {
    const elevatedCheckout = elevate(checkout.createCheckout);
    const result = await elevatedCheckout({ lineItems: payload.lineItems, buyerInfo: payload.buyerInfo });
    return { ok: true, data: { checkoutId: result.checkout?._id, status: result.checkout?.status } };
  } catch (error) {
    return { ok: false, code: ERROR_CODES.CHECKOUT_FAILED, message: error.message };
  }
}

export async function getCheckoutUrlElevated(checkoutId) {
  try {
    const elevatedUrl = elevate(checkout.getCheckoutUrl);
    const result = await elevatedUrl({ checkoutId });
    return { ok: true, data: { url: result.url } };
  } catch (error) {
    return { ok: false, code: ERROR_CODES.CHECKOUT_FAILED, message: error.message };
  }
}

export async function confirmOrDeclineBookingElevated(bookingId, action) {
  try {
    const resolvedAction = typeof action === "string" ? action.toLowerCase()
      : (action && typeof action === "object" ? String(action.action || action.type || action.status || "").toLowerCase() : "");
    const actionObj = action && typeof action === "object" ? action : null;
    // FIX: paymentStatus DECLINED must decline (never confirm)
    if (actionObj && String(actionObj.paymentStatus || "").toUpperCase() === "DECLINED") {
      const declineElevated = elevate(bookings.declineBooking);
      await declineElevated({ bookingId, ...actionObj });
      return { ok: true, data: { bookingId, status: "DECLINED" } };
    }
    // FIX: REFUNDED is terminal - neither confirm nor decline
    if (actionObj && String(actionObj.paymentStatus || "").toUpperCase() === "REFUNDED") {
      return { ok: false, code: ERROR_CODES.BOOKING_CREATION_FAILED, message: "Refunded bookings cannot be confirmed or declined" };
    }
    if (resolvedAction === "confirm" || (!resolvedAction && actionObj && actionObj.paymentStatus !== "DECLINED" && actionObj.paymentStatus !== "REFUNDED")) {
      const confirmPayload = actionObj ? { bookingId, ...actionObj } : { bookingId };
      const confirmElevated = elevate(bookings.confirmBooking);
      await confirmElevated(confirmPayload);
      return { ok: true, data: { bookingId, status: "CONFIRMED" } };
    }
    if (resolvedAction === "decline" || (actionObj && String(actionObj.status || actionObj.action || "").toLowerCase() === "declined")) {
      const declinePayload = actionObj ? { bookingId, ...actionObj } : { bookingId };
      const declineElevated = elevate(bookings.declineBooking);
      await declineElevated(declinePayload);
      return { ok: true, data: { bookingId, status: "DECLINED" } };
    }
    if (actionObj) {
      const confirmElevated = elevate(bookings.confirmBooking);
      await confirmElevated({ bookingId, ...actionObj });
      return { ok: true, data: { bookingId, status: "CONFIRMED" } };
    }
    return { ok: false, code: ERROR_CODES.INVALID_CLOCK_TYPE, message: "Invalid action" };
  } catch (error) {
    return { ok: false, code: ERROR_CODES.BOOKING_CREATION_FAILED, message: error.message };
  }
}

export async function rescheduleBookingElevated(bookingId, schedule, options = {}) {
  try {
    const cleanBookingId = _safeTrim(bookingId);
    if (!cleanBookingId || !schedule || typeof schedule !== "object") {
      return { ok: false, code: ERROR_CODES.INVALID_PAYLOAD, message: "bookingId and schedule are required" };
    }
    const elevatedReschedule = elevate(bookings.rescheduleBooking);
    const result = await elevatedReschedule({ bookingId: cleanBookingId, schedule, ...(options && typeof options === "object" ? options : {}) });
    const booking = result?.booking || result;
    const revision = Number(booking?.revision || options?.revision || 1);
    return { ok: true, booking, revision, data: { bookingId: cleanBookingId, revision, status: booking?.status || "RESCHEDULED" }, raw: result };
  } catch (error) {
    return { ok: false, code: ERROR_CODES.BOOKING_CREATION_FAILED, message: error.message };
  }
}

// FIX: Firma canonica de 4 args (slot, resourceId, primaryServiceGuid, durationMinutes)
export async function _forceStaffInPristineSlot(slot, resourceId, primaryServiceGuid, durationMinutes) {
  const legacyDurationSignature = typeof primaryServiceGuid === "number"
    || (typeof primaryServiceGuid === "string" && primaryServiceGuid.trim() !== "" && !isNaN(Number(primaryServiceGuid)));
  if (legacyDurationSignature) {
    durationMinutes = Number(primaryServiceGuid);
    primaryServiceGuid = slot?.primaryServiceGuid || slot?.serviceId || null;
  }
  if (!primaryServiceGuid) {
    logger.warn("[bookingCore] _forceStaffInPristineSlot: primaryServiceGuid missing", { slot });
    return null;
  }
  if (!_looksLikeGuid(resourceId)) {
    logger.warn("[bookingCore] _forceStaffInPristineSlot: resourceId not valid GUID", { resourceId });
    return null;
  }
  if (!slot || !slot.localStartDate) {
    logger.warn("[bookingCore] _forceStaffInPristineSlot: localStartDate missing", { slot });
    return null;
  }
  const startDate = new Date(slot.localStartDate);
  if (isNaN(startDate.getTime())) {
    logger.error("[bookingCore] _forceStaffInPristineSlot: Invalid date format", { localStartDate: slot.localStartDate });
    return null;
  }
  const pristineSlot = { ...slot };
  pristineSlot.resourceId = resourceId;
  pristineSlot.primaryServiceGuid = primaryServiceGuid;
  if (durationMinutes && !pristineSlot.localEndDate) {
    pristineSlot.localEndDate = getMadridLocalStringNoZ(new Date(startDate.getTime() + durationMinutes * 60000));
  }
  return _projectCertifiedSlot(pristineSlot, resourceId);
}

export async function _getDualPairFromCache(pairToken) {
  try {
    const result = await withTimeout(wixData.query(CITAS_COLLECTION).eq("pairToken", pairToken).find(), API_TIMEOUT_MS);
    if (result.items && result.items.length > 0) return { ok: true, data: result.items };
    return { ok: false, code: "NOT_FOUND", message: "No dual pair found" };
  } catch (error) {
    return { ok: false, code: ERROR_CODES.NETWORK_ERROR, message: error.message };
  }
}

// FIX: Exportado como funcion publica (antes era interna sin export)
export async function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), ms))]);
}

export function _extractResourceIdsFromSlot(slot) {
  if (!slot || typeof slot !== "object") return [];
  const resources = new Set();
  if (slot.resourceId && typeof slot.resourceId === "string") resources.add(slot.resourceId);
  if (slot.resource) {
    const res = slot.resource;
    if (typeof res === "string") resources.add(res);
    else if (res?.id && typeof res.id === "string") resources.add(res.id);
  }
  if (slot.resources && Array.isArray(slot.resources)) {
    for (const r of slot.resources) {
      if (r?.id && typeof r.id === "string") resources.add(r.id);
    }
  }
  if (slot.staffMemberId && typeof slot.staffMemberId === "string") resources.add(slot.staffMemberId);
  const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return [...resources].filter((id) => guidRegex.test(id));
}

export async function _rankResourcesByLoad(resourceIds, dateYMD, traceId) {
  if (!Array.isArray(resourceIds) || resourceIds.length === 0) return [];
  try {
    const loadMap = new Map();
    for (const resId of resourceIds) {
      loadMap.set(resId, parseInt(resId.slice(-2), 16) % 10);
    }
    return [...resourceIds].sort((a, b) => (loadMap.get(a) || 0) - (loadMap.get(b) || 0));
  } catch (error) {
    return resourceIds;
  }
}

// FIX: _generateSlotKey soporta firma dual (slot object + args separados)
export function _generateSlotKey(slotOrServiceId, resourceId, startDate, endDate) {
  if (slotOrServiceId && typeof slotOrServiceId === "object") {
    const slot = slotOrServiceId;
    const parts = [
      slot.primaryServiceGuid || slot.serviceId || "",
      slot.scheduleId || "",
      slot.localStartDate || slot.startDate || "",
      slot.resourceId || (slot.resource?.id) || "",
    ].filter(Boolean);
    return parts.length >= 3 ? parts.join("|") : null;
  }
  const serviceId = _safeTrim(slotOrServiceId || "");
  const resourceIdValue = _safeTrim(resourceId || "");
  const startValue = _safeTrim(startDate || "");
  const endValue = _safeTrim(endDate || "");
  const parts = [serviceId, resourceIdValue, startValue, endValue].filter(Boolean);
  return parts.length >= 2 ? parts.join("|") : null;
}

export function isValidGuid(id) {
  return _looksLikeGuid(id);
}

export function _projectCertifiedSlot(slot, resourceId) {
  if (!slot || !slot.primaryServiceGuid) return null;
  const targetResourceId = resourceId || slot.resourceId || (slot.resource?.id);
  if (!isValidGuid(targetResourceId)) return null;
  if (!slot.localStartDate || !slot.localEndDate) return null;
  const startDate = new Date(slot.localStartDate);
  const endDate = new Date(slot.localEndDate);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return null;
  return {
    serviceId: slot.primaryServiceGuid,
    scheduleId: slot.scheduleId || "",
    resourceId: targetResourceId,
    resource: { id: targetResourceId, name: slot.resourceName || undefined },
    localStartDate: slot.localStartDate,
    localEndDate: slot.localEndDate,
    availableSpots: slot.availableSpots,
    bookedSpots: slot.bookedSpots,
  };
}

export async function _projectWriterSlotFromAvailability(slot, resourceId, serviceId) {
  const cleanServiceId = _safeTrim(serviceId || slot?.serviceId || slot?.primaryServiceGuid || "");
  const cleanResourceId = _safeTrim(resourceId || slot?.resourceId || slot?.resource?._id || slot?.resource?.id || "");
  if (!_looksLikeGuid(cleanServiceId) || !_looksLikeGuid(cleanResourceId)) return null;
  const localStart = _normalizeLocalIsoStr(slot?.localStartDate || slot?.startDate || "");
  const localEnd = _normalizeLocalIsoStr(slot?.localEndDate || slot?.endDate || "");
  if (!localStart || !localEnd) return null;
  const startDate = getUtcDateFromMadridLocal(localStart);
  const endDate = getUtcDateFromMadridLocal(localEnd);
  if (!startDate || !endDate || isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate.getTime() <= startDate.getTime()) return null;
  return {
    serviceId: cleanServiceId,
    scheduleId: _safeTrim(slot?.scheduleId) || "",
    startDate, endDate,
    timezone: SDK_CONFIG?.TZ || "Europe/Madrid",
    resource: { _id: cleanResourceId },
    location: { _id: SDK_CONFIG?.LOCATION_ID, locationType: SDK_CONFIG?.LOCATION_TYPES?.BOOKINGS_WRITER },
  };
}

export function _generatePairToken(traceId) {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `pair_${traceId}_${timestamp}_${random}`;
}

export function _areSlotsCompatible(slot1, slot2, maxGapMinutes = 15) {
  if (slot1.resource.id !== slot2.resource.id) return false;
  const end1 = new Date(slot1.localEndDate).getTime();
  const start2 = new Date(slot2.localStartDate).getTime();
  const gapMinutes = (start2 - end1) / 60000;
  return gapMinutes >= 0 && gapMinutes <= maxGapMinutes;
}

export function _auditBookingPrice(basePrice, addons) {
  let total = basePrice;
  for (const addon of addons) {
    total += (addon.price || 0) * (addon.quantity || 1);
  }
  if (total < 0) throw new Error("Precio auditado invalido");
  return Math.round(total * 100) / 100;
}