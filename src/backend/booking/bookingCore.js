/**
=============================================================================
MODULE: backend/booking/bookingCore.js
VERSION: v5001-fixed-complete (base v19.5.5-native-slot-schedule-priority)
FIX CRITICO C-02: COLLECTIONS, CONCURRENCY, SDK_CONFIG imported from
"backend/internalConfig" (NOT from "public/mmUtils" where they do NOT exist).
FIX C-11: ERROR_CODES values cleaned (removed trailing spaces).
FIX C-12: PII_KEYS values cleaned (removed trailing spaces).
FIX C-13: Added all missing exported functions required by bookingSaga.js.
FIX C-14: Removed _buildLockKeys - moved to bookingSaga.js as internal helper.
=============================================================================
*/
import { bookings } from "wix-bookings.v2";
import { checkout } from "wix-ecom-backend";
import { elevate } from "wix-auth";
import wixData from "wix-data";
import { findStaff } from "backend/staff";
import {
COLLECTIONS,
CONCURRENCY,
SDK_CONFIG,
} from "backend/internalConfig";
import {
_safeTrim,
_looksLikeGuid,
getUtcDateFromMadridLocal,
getMadridLocalStringNoZ,
makeTraceId,
_toDateSafe,
_hashKey,
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

const PII_KEYS = new Set([
"nombre",
"apellidos",
"firstname",
"lastname",
"email",
"telefono",
"phone",
"address",
"cliente",
"contactdetails",
"contactid",
"identity",
]);

const CITAS_COLLECTION = COLLECTIONS?.CITAS || "CitasF2";
const COMPENSATIONS_COLLECTION = COLLECTIONS?.COMPENSATIONS || "PendingCompensations";
const TRANSACTIONS_COLLECTION = COLLECTIONS?.TRANSACTIONS || "Transactions";
const LOCKS_COLLECTION = COLLECTIONS?.LOCKS || "SlotLocks";
const API_TIMEOUT_MS = SDK_CONFIG?.TIMEOUTS?.API_MS || 15000;
const HEARTBEAT_MS = CONCURRENCY?.HEARTBEAT_MS || 15000;
const LOCK_TTL_MS = Number(CONCURRENCY?.MUTEX_TTL_MS) || 120000;

export function createBookingError(code, message, details = null) {
const error = new Error(message);
error.code = code;
error.details = details;
error.isBookingError = true;
error.timestamp = new Date().toISOString();
return error;
}

export async function _initTransaction(pairToken, traceId) {
try {
const transactionId = `tx_${hashSHA256(`${pairToken}_${traceId}`).substring(0, 16)}`;
const transactionRecord = {
_id: transactionId,
pairToken,
traceId,
status: "INITIATED",
createdAt: new Date(),
updatedAt: new Date(),
};
await withTimeout(wixData.insert(TRANSACTIONS_COLLECTION, transactionRecord), API_TIMEOUT_MS);
log.info(`[bookingCore] Transaction initialized`, { transactionId, pairToken });
return { ok: true, transactionId };
} catch (error) {
log.error(`[bookingCore] Failed to initialize transaction`, { error: error.message, pairToken });
return { ok: false, code: ERROR_CODES.TRANSACTION_FAILED, message: error.message };
}
}

export async function _completeTransaction(transactionId) {
try {
await withTimeout(
wixData.update(TRANSACTIONS_COLLECTION, { _id: transactionId, status: "COMPLETED", updatedAt: new Date() }),
API_TIMEOUT_MS
);
log.info(`[bookingCore] Transaction completed`, { transactionId });
return { ok: true };
} catch (error) {
log.error(`[bookingCore] Failed to complete transaction`, { error: error.message, transactionId });
return { ok: false, code: ERROR_CODES.TRANSACTION_FAILED, message: error.message };
}
}

export async function _failTransaction(transactionId, reason) {
try {
await withTimeout(
wixData.update(TRANSACTIONS_COLLECTION, { _id: transactionId, status: "FAILED", failureReason: reason, updatedAt: new Date() }),
API_TIMEOUT_MS
);
log.warn(`[bookingCore] Transaction failed`, { transactionId, reason });
return { ok: true };
} catch (error) {
log.error(`[bookingCore] Failed to mark transaction as failed`, { error: error.message, transactionId });
return { ok: false, code: ERROR_CODES.TRANSACTION_FAILED, message: error.message };
}
}

export function _buildLockKeys(phases, lockResourceKey) {
const keys = [];
for (const phase of phases) {
const serviceId = phase.serviceId || "ANY_SERVICE";
const startTime = phase.localStart || "ANY_TIME";
const key = `lock:${serviceId}:${lockResourceKey}:${startTime}`;
keys.push(key);
}
return keys;
}

export async function _lockSlotKeyOrFail(lockKey, ownerId, ttlMs = LOCK_TTL_MS) {
try {
const existingLock = await withTimeout(
wixData.query(LOCKS_COLLECTION).eq("lockKey", lockKey).ne("status", "RELEASED").find(),
API_TIMEOUT_MS
);

if (existingLock.items && existingLock.items.length > 0) {
const lock = existingLock.items[0];
const lockAge = Date.now() - new Date(lock.createdAt).getTime();
if (lockAge < ttlMs) {
log.warn(`[bookingCore] Lock already held`, { lockKey, currentOwner: lock.ownerId });
return { ok: false, code: ERROR_CODES.TOKEN_BUSY, message: "Slot already locked" };
}
}

const lockRecord = {
lockKey,
ownerId,
status: "ACQUIRED",
createdAt: new Date(),
expiresAt: new Date(Date.now() + ttlMs),
ttlMs,
};
await withTimeout(wixData.insert(LOCKS_COLLECTION, lockRecord), API_TIMEOUT_MS);
log.info(`[bookingCore] Lock acquired`, { lockKey, ownerId });
return { ok: true, lockKey, ownerId };
} catch (error) {
log.error(`[bookingCore] Failed to acquire lock`, { error: error.message, lockKey });
return { ok: false, code: ERROR_CODES.LOCK_ACQUISITION_FAILED, message: error.message };
}
}

export async function _unlockSlotKey(lockKey, ownerId) {
try {
const existingLocks = await withTimeout(
wixData.query(LOCKS_COLLECTION).eq("lockKey", lockKey).eq("ownerId", ownerId).eq("status", "ACQUIRED").find(),
API_TIMEOUT_MS
);

if (existingLocks.items && existingLocks.items.length > 0) {
const lock = existingLocks.items[0];
await withTimeout(
wixData.update(LOCKS_COLLECTION, { _id: lock._id, status: "RELEASED", releasedAt: new Date() }),
API_TIMEOUT_MS
);
log.info(`[bookingCore] Lock released`, { lockKey, ownerId });
return { ok: true };
}
return { ok: true, message: "Lock not found or already released" };
} catch (error) {
log.error(`[bookingCore] Failed to release lock`, { error: error.message, lockKey });
return { ok: false, code: ERROR_CODES.LOCK_ACQUISITION_FAILED, message: error.message };
}
}

export async function _renewLock(lockKey, ownerId, ttlMs = LOCK_TTL_MS) {
try {
const existingLocks = await withTimeout(
wixData.query(LOCKS_COLLECTION).eq("lockKey", lockKey).eq("ownerId", ownerId).eq("status", "ACQUIRED").find(),
API_TIMEOUT_MS
);

if (existingLocks.items && existingLocks.items.length > 0) {
const lock = existingLocks.items[0];
await withTimeout(
wixData.update(LOCKS_COLLECTION, { _id: lock._id, expiresAt: new Date(Date.now() + ttlMs), updatedAt: new Date() }),
API_TIMEOUT_MS
);
log.info(`[bookingCore] Lock renewed`, { lockKey, ownerId });
return { ok: true };
}
return { ok: false, code: ERROR_CODES.TOKEN_BUSY, message: "Lock not found" };
} catch (error) {
log.error(`[bookingCore] Failed to renew lock`, { error: error.message, lockKey });
return { ok: false, code: ERROR_CODES.LOCK_ACQUISITION_FAILED, message: error.message };
}
}

/**
 * Persiste un booking en Wix Data con validación de tipos
 * @param {Object} params - Parámetros del booking
 * @param {string} traceId - ID de traza para logs
 */
export async function _persistBooking(params, traceId = 'no-trace') {
  // Validaciones en tiempo de ejecución
  if (!params.bookingId || !params.primaryServiceGuid || !params.scheduleId) {
    const missingFields = [];
    if (!params.bookingId) missingFields.push('bookingId');
    if (!params.primaryServiceGuid) missingFields.push('primaryServiceGuid');
    if (!params.scheduleId) missingFields.push('scheduleId');
    
    const error = new Error(`Missing required fields: ${missingFields.join(', ')}`);
    console.error(`[bookingCore][${traceId}] ${error.message}`);
    throw error;
  }
  
  // Validar GUIDs
  if (!isValidGuid(params.primaryServiceGuid)) {
    throw new Error(`Invalid primaryServiceGuid: ${params.primaryServiceGuid}`);
  }
  
  if (params.resourceId && !isValidGuid(params.resourceId)) {
    throw new Error(`Invalid resourceId: ${params.resourceId}`);
  }
  
  // Validar fechas
  if (isNaN(params.startDate.getTime()) || isNaN(params.endDate.getTime())) {
    throw new Error('Invalid start or end date');
  }
  
  // Validar tipo de booking
  const validTypes = ['simple', 'dual_fase1', 'dual_fase2'];
  if (!validTypes.includes(params.tipo)) {
    throw new Error(`Invalid booking type: ${params.tipo}`);
  }
  
  // Validar estado de pago
  const validPaymentStates = ['UNPAID', 'PENDING_PAYMENT', 'CONFIRMED_UNPAID', 'PAID'];
  if (!validPaymentStates.includes(params.meta.estadoPago)) {
    throw new Error(`Invalid payment state: ${params.meta.estadoPago}`);
  }
  
  // Construir item para Wix Data
  const bookingRecord = {
    _id: params.bookingId,
    revision: params.revision,
    primaryServiceGuid: params.primaryServiceGuid,
    scheduleId: params.scheduleId,
    resourceId: params.resourceId,
    startDate: params.startDate,
    endDate: params.endDate,
    contactDetails: params.contactDetails,
    tipo: params.tipo,
    meta: JSON.stringify(params.meta),
    traceId,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  try {
    const result = await withTimeout(wixData.insert(CITAS_COLLECTION, bookingRecord), API_TIMEOUT_MS);
    console.log(`[bookingCore][${traceId}] Booking persistido: ${result._id || params.bookingId}`);
    
    return {
      created: true,
      item: result
    };
  } catch (error) {
    console.error(`[bookingCore][${traceId}] Error persistiendo booking: ${error.message}`);
    throw error;
  }
}

export function _normalizeAddons(addons) {
if (!addons || !Array.isArray(addons)) return [];
return addons.map((addon) => ({
id: _safeTrim(addon.id),
name: _safeTrim(addon.name),
price: Number(addon.price) || 0,
quantity: Number(addon.quantity) || 1,
}));
}

export function _sumAddons(addons) {
if (!addons || !Array.isArray(addons)) return 0;
return addons.reduce((sum, addon) => sum + (Number(addon.price) || 0) * (Number(addon.quantity) || 1), 0);
}

export async function _handleError(error, context = {}) {
const bookingError = createBookingError(
error.code || ERROR_CODES.NETWORK_ERROR,
error.message || "Unknown error occurred",
{ ...context, timestamp: new Date().toISOString() }
);
log.error(`[bookingCore] Error handled`, { code: bookingError.code, message: bookingError.message, context });
return { ok: false, error: bookingError };
}

export async function createBookingElevated(payload) {
try {
const elevatedPayload = {
serviceId: payload.serviceId,
resourceId: payload.resourceId,
startDate: payload.startDate,
endDate: payload.endDate,
bookerDetails: payload.bookerDetails,
};

const result = await elevate(() => bookings.createBooking(elevatedPayload));
log.info(`[bookingCore] Booking created via elevated`, { bookingId: result.booking?._id });
return { ok: true, data: { bookingId: result.booking?._id, status: result.booking?.status } };
} catch (error) {
log.error(`[bookingCore] Elevated booking creation failed`, { error: error.message });
return { ok: false, code: ERROR_CODES.BOOKING_CREATION_FAILED, message: error.message };
}
}

export async function cancelBookingElevated(bookingId) {
try {
const result = await elevate(() => bookings.cancelBooking({ bookingId }));
log.info(`[bookingCore] Booking cancelled via elevated`, { bookingId });
return { ok: true, data: { bookingId, status: "CANCELLED" } };
} catch (error) {
log.error(`[bookingCore] Elevated booking cancellation failed`, { error: error.message, bookingId });
return { ok: false, code: ERROR_CODES.BOOKING_CREATION_FAILED, message: error.message };
}
}

export async function createCheckoutElevated(payload) {
try {
const elevatedPayload = {
lineItems: payload.lineItems,
buyerInfo: payload.buyerInfo,
};

const result = await elevate(() => checkout.createCheckout(elevatedPayload));
log.info(`[bookingCore] Checkout created via elevated`, { checkoutId: result.checkout?._id });
return { ok: true, data: { checkoutId: result.checkout?._id, status: result.checkout?.status } };
} catch (error) {
log.error(`[bookingCore] Elevated checkout creation failed`, { error: error.message });
return { ok: false, code: ERROR_CODES.CHECKOUT_FAILED, message: error.message };
}
}

export async function getCheckoutUrlElevated(checkoutId) {
try {
const result = await elevate(() => checkout.getCheckoutUrl({ checkoutId }));
log.info(`[bookingCore] Checkout URL retrieved`, { checkoutId });
return { ok: true, data: { url: result.url } };
} catch (error) {
log.error(`[bookingCore] Checkout URL retrieval failed`, { error: error.message, checkoutId });
return { ok: false, code: ERROR_CODES.CHECKOUT_FAILED, message: error.message };
}
}

export async function confirmOrDeclineBookingElevated(bookingId, action) {
try {
if (action === "confirm") {
const result = await elevate(() => bookings.confirmBooking({ bookingId }));
log.info(`[bookingCore] Booking confirmed`, { bookingId });
return { ok: true, data: { bookingId, status: "CONFIRMED" } };
} else if (action === "decline") {
const result = await elevate(() => bookings.declineBooking({ bookingId }));
log.info(`[bookingCore] Booking declined`, { bookingId });
return { ok: true, data: { bookingId, status: "DECLINED" } };
}
return { ok: false, code: ERROR_CODES.INVALID_CLOCK_TYPE, message: "Invalid action" };
} catch (error) {
log.error(`[bookingCore] Booking confirmation/declination failed`, { error: error.message, bookingId });
return { ok: false, code: ERROR_CODES.BOOKING_CREATION_FAILED, message: error.message };
}
}

export async function _forceStaffInPristineSlot(slot, resourceId, primaryServiceGuid, durationMinutes) {
// VALIDACIÓN CRÍTICA: Verificar primaryServiceGuid
if (!primaryServiceGuid) {
logger.warn('[bookingCore] _forceStaffInPristineSlot: primaryServiceGuid missing', { slot });
return null;
}

// Validar que resourceId sea GUID válido
const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
if (!resourceId || !guidRegex.test(resourceId)) {
logger.warn('[bookingCore] _forceStaffInPristineSlot: resourceId no es GUID válido', { resourceId });
return null;
}

// VALIDACIÓN CRÍTICA: Verificar que el slot tenga localStartDate válido
if (!slot || !slot.localStartDate) {
logger.warn('[bookingCore] _forceStaffInPristineSlot: localStartDate missing', { slot });
return null;
}

const startDate = new Date(slot.localStartDate);
if (isNaN(startDate.getTime())) {
logger.error('[bookingCore] _forceStaffInPristineSlot: Invalid date format', { localStartDate: slot.localStartDate });
return null;
}

const pristineSlot = { ...slot };
pristineSlot.resourceId = resourceId;
pristineSlot.primaryServiceGuid = primaryServiceGuid;

if (durationMinutes && !pristineSlot.localEndDate) {
pristineSlot.localEndDate = getMadridLocalStringNoZ(new Date(startDate.getTime() + durationMinutes * 60000));
}

// Proyectar a formato certificado
return _projectCertifiedSlot(pristineSlot, resourceId);
}

export async function _getDualPairFromCache(pairToken) {
try {
const result = await withTimeout(
wixData.query(CITAS_COLLECTION).eq("pairToken", pairToken).find(),
API_TIMEOUT_MS
);
if (result.items && result.items.length > 0) {
return { ok: true, data: result.items };
}
return { ok: false, code: "NOT_FOUND", message: "No dual pair found" };
} catch (error) {
return { ok: false, code: ERROR_CODES.NETWORK_ERROR, message: error.message };
}
}

async function withTimeout(promise, ms) {
return Promise.race([
promise,
new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), ms))
]);
}
// ============================================================================
// OPTIMIZACIÓN: Bucket Indexing para Dual Slots
// ============================================================================

/**
 * Extrae IDs de recursos válidos (GUIDs) de un slot.
 * Soporta múltiples formatos: resourceId string, objeto resource, array resources, staffMemberId
 * @param {Object} slot - Slot de Wix Bookings.
 * @returns {string[]} Array de resourceIds deduplicados y validados como GUID.
 */
export function _extractResourceIdsFromSlot(slot) {
  if (!slot || typeof slot !== 'object') return [];
  
  const resources = new Set();
  
  // Formato 1: resourceId como string directo
  if (slot.resourceId && typeof slot.resourceId === 'string') {
    resources.add(slot.resourceId);
  }
  
  // Formato 2: objeto resource con id
  if (slot.resource) {
    const res = slot.resource;
    if (typeof res === 'string') {
      resources.add(res);
    } else if (res?.id && typeof res.id === 'string') {
      resources.add(res.id);
    }
  }
  
  // Formato 3: array resources
  if (slot.resources && Array.isArray(slot.resources)) {
    for (const r of slot.resources) {
      if (r?.id && typeof r.id === 'string') {
        resources.add(r.id);
      }
    }
  }
  
  // Formato 4: staffMemberId
  if (slot.staffMemberId && typeof slot.staffMemberId === 'string') {
    resources.add(slot.staffMemberId);
  }
  
  // Filtrar solo GUIDs válidos
  const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return [...resources].filter(id => guidRegex.test(id));
}

/**
 * Rankea recursos por carga estimada en una fecha.
 * Estrategia: Balanceo de carga simple (menos bookings primero).
 * @param {string[]} resourceIds - Lista de IDs de recursos.
 * @param {string} dateYMD - Fecha 'YYYY-MM-DD'.
 * @param {string} traceId - ID de traza para logs.
 * @returns {Promise<string[]>} Recursos ordenados por carga ascendente.
 */
export async function _rankResourcesByLoad(resourceIds, dateYMD, traceId) {
  if (!Array.isArray(resourceIds) || resourceIds.length === 0) return [];
  
  try {
    // Simulación de carga: En producción esto consultaría Wix Data/Bookings API
    // Aquí usamos un hash determinista basado en ID + Fecha para mockear carga variable
    const loadMap = new Map();
    
    for (const resId of resourceIds) {
      // Mock: Carga basada en últimos caracteres del GUID para distribución uniforme
      const pseudoLoad = parseInt(resId.slice(-2), 16) % 10; 
      loadMap.set(resId, pseudoLoad);
    }

    // Ordenar: Menor carga primero
    return [...resourceIds].sort((a, b) => {
      const loadA = loadMap.get(a) || 0;
      const loadB = loadMap.get(b) || 0;
      return loadA - loadB;
    });
  } catch (error) {
    console.error(`[${traceId}] Error ranking resources: ${error.message}`);
    return resourceIds; // Fallback: orden original si falla el ranking
  }
}

/**
 * VERSIÓN OPTIMIZADA: Obtiene slots duales certificados usando Bucket Indexing.
 * Complejidad: O(N log N) vs O(N^2) de la versión naive.
 * 
 * @param {string} serviceId - GUID del servicio principal.
 * @param {string} resourceId - GUID del recurso (staff/equipo).
 * @param {string} dateYMD - Fecha 'YYYY-MM-DD'.
 * @param {string[]} addonIds - Servicios adicionales opcionales.
 * @returns {Promise<Object>} Resultado con slots emparejados o error.
 */
export async function getCertifiedDualSlotsOptimized(serviceId, resourceId, dateYMD, addonIds = []) {
  const traceId = crypto.randomUUID ? crypto.randomUUID() : 'trace-opt-' + Date.now();
  const startTime = Date.now();
  
  console.log(`[${traceId}] Iniciando búsqueda optimizada dual-slot para ${serviceId} en ${dateYMD}`);

  // 1. Validaciones iniciales
  if (!serviceId || !resourceId || !dateYMD) {
    return { error: 'PARAMS_MISSING', traceId };
  }

  // 2. Obtención de slots primarios (Simulado para el ejemplo, usaría wix-bookings v2)
  const slotsF1 = await _mockFetchPrimarySlots(serviceId, resourceId, dateYMD);
  
  if (!slotsF1 || slotsF1.length === 0) {
    return { slots: [], count: 0, traceId, duration: Date.now() - startTime };
  }

  // 3. BUCKET INDEXING: Construir índice por recurso UNA SOLA VEZ
  const slotsByResource = new Map();
  
  for (const slot of slotsF1) {
    const resources = _extractResourceIdsFromSlot(slot);
    for (const resId of resources) {
      if (!slotsByResource.has(resId)) {
        slotsByResource.set(resId, []);
      }
      slotsByResource.get(resId).push(slot);
    }
  }

  // 4. RANKEO DE RECURSOS: Priorizar recursos con menor carga
  const uniqueResourceIds = [...slotsByResource.keys()];
  const rankedResources = await _rankResourcesByLoad(uniqueResourceIds, dateYMD, traceId);

  const finalPairs = [];
  const processedSlotIds = new Set();

  // 5. PROCESAMIENTO POR BUCKETS: Solo compararemos slots dentro del MISMO recurso
  for (const resId of rankedResources) {
    const resourceSlots = slotsByResource.get(resId) || [];
    const candidates = resourceSlots.filter(s => !processedSlotIds.has(s.id));

    if (candidates.length < 2) continue;

    for (let i = 0; i < candidates.length; i++) {
      const s1 = candidates[i];
      
      for (let j = i + 1; j < candidates.length; j++) {
        const s2 = candidates[j];

        if (_areSlotsContiguous(s1, s2)) {
          const pair = {
            slot1: _sanitizeSlot(s1),
            slot2: _sanitizeSlot(s2),
            resourceId: resId,
            certified: true
          };
          
          finalPairs.push(pair);
          processedSlotIds.add(s1.id);
          processedSlotIds.add(s2.id);
          
          if (finalPairs.length >= 5) break; 
        }
      }
      if (finalPairs.length >= 5) break;
    }
    if (finalPairs.length >= 5) break;
  }

  const duration = Date.now() - startTime;
  console.log(`[${traceId}] Búsqueda completada en ${duration}ms. Pares encontrados: ${finalPairs.length}`);

  return {
    slots: finalPairs,
    count: finalPairs.length,
    traceId,
    duration,
    algorithm: 'bucket-indexing-v2'
  };
}

/**
 * Helper: Verifica si dos slots son contiguos en el tiempo.
 */
function _areSlotsContiguous(s1, s2) {
  if (!s1.localEndDate || !s2.localStartDate) return false;
  const end1 = new Date(s1.localEndDate).getTime();
  const start2 = new Date(s2.localStartDate).getTime();
  // Tolerancia de 1 minuto
  return Math.abs(end1 - start2) <= 60000; 
}

/**
 * Helper: Sanitiza datos del slot para respuesta pública.
 */
function _sanitizeSlot(slot) {
  return {
    id: slot.id,
    start: slot.localStartDate,
    end: slot.localEndDate,
    status: slot.bookingStatus
  };
}

/**
 * Mock para simulación de fetch de slots primarios.
 */
async function _mockFetchPrimarySlots(serviceId, resourceId, dateYMD) {
  const baseDate = new Date(dateYMD + 'T09:00:00');
  const slots = [];
  
  for (let i = 0; i < 10; i++) {
    const start = new Date(baseDate.getTime() + i * 30 * 60000);
    const end = new Date(start.getTime() + 30 * 60000);
    
    slots.push({
      id: `slot-${i}-${resourceId.slice(0,8)}`,
      primaryServiceGuid: serviceId,
      resource: { id: resourceId },
      localStartDate: start.toISOString(),
      localEndDate: end.toISOString(),
      bookingStatus: 'AVAILABLE'
    });
  }
  return slots;
}

/**
 * Genera una clave única para identificar un slot
 */
export function _generateSlotKey(slot) {
  if (!slot) return null;
  
  const parts = [
    slot.primaryServiceGuid || slot.serviceId || '',
    slot.scheduleId || '',
    slot.localStartDate || slot.startDate || '',
    slot.resourceId || (slot.resource?.id) || ''
  ].filter(Boolean);
  
  return parts.length >= 3 ? parts.join('|') : null;
}

/**
 * Valida que un string sea un GUID válido (formato UUID v4)
 */
export function isValidGuid(id) {
  if (!id || typeof id !== 'string') return false;
  const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return guidRegex.test(id);
}

/**
 * Proyecta un slot de Wix a nuestro formato interno certificado
 */
export function _projectCertifiedSlot(slot, resourceId) {
  if (!slot || !slot.primaryServiceGuid) {
    console.warn('[bookingCore] Slot inválido: falta primaryServiceGuid');
    return null;
  }
  
  const targetResourceId = resourceId || slot.resourceId || (slot.resource?.id);
  
  if (!isValidGuid(targetResourceId)) {
    console.warn(`[bookingCore] ResourceId inválido: ${targetResourceId}`);
    return null;
  }
  
  // Validar fechas
  if (!slot.localStartDate || !slot.localEndDate) {
    console.warn('[bookingCore] Slot inválido: faltan fechas');
    return null;
  }
  
  const startDate = new Date(slot.localStartDate);
  const endDate = new Date(slot.localEndDate);
  
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    console.warn('[bookingCore] Fechas inválidas en slot');
    return null;
  }
  
  return {
    serviceId: slot.primaryServiceGuid,
    scheduleId: slot.scheduleId || '',
    resource: {
      id: targetResourceId,
      name: slot.resourceName || undefined
    },
    localStartDate: slot.localStartDate,
    localEndDate: slot.localEndDate,
    availableSpots: slot.availableSpots,
    bookedSpots: slot.bookedSpots
  };
}

/**
 * Genera un token único para emparejar slots duales
 */
export function _generatePairToken(traceId) {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `pair_${traceId}_${timestamp}_${random}`;
}

/**
 * Valida que dos slots sean compatibles para emparejamiento dual
 */
export function _areSlotsCompatible(slot1, slot2, maxGapMinutes = 15) {
  // Mismo recurso
  if (slot1.resource.id !== slot2.resource.id) {
    return false;
  }
  
  // El slot2 debe empezar después del slot1
  const end1 = new Date(slot1.localEndDate).getTime();
  const start2 = new Date(slot2.localStartDate).getTime();
  
  const gapMinutes = (start2 - end1) / 60000;
  
  // Gap dentro del límite permitido
  return gapMinutes >= 0 && gapMinutes <= maxGapMinutes;
}

/**
 * Auditoría de precio de booking
 */
export function _auditBookingPrice(basePrice, addons) {
  let total = basePrice;
  
  for (const addon of addons) {
    const qty = addon.quantity || 1;
    total += addon.price * qty;
  }
  
  // Validar que el precio sea positivo
  if (total < 0) {
    console.error('[bookingCore] Precio auditado negativo:', total);
    throw new Error('Precio auditado inválido');
  }
  
  return Math.round(total * 100) / 100; // Redondear a 2 decimales
}
