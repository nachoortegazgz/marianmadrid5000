/**
=============================================================================
MODULE: backend/booking/bookingCore.js
VERSION: v5001-fixed-complete (base v19.5.5-native-slot-schedule-priority)
FIX CRITICO C-02: COLLECTIONS, CONCURRENCY, SDK_CONFIG imported from
"backend/internalConfig" (NOT from "public/mmUtils" where they do NOT exist).
FIX C-11: ERROR_CODES values cleaned (removed trailing spaces).
FIX C-12: PII_KEYS values cleaned (removed trailing spaces).
FIX C-13: Added all missing exported functions required by bookingSaga.js.
FIX C-14: Removed _buildLockKeys_DEPRECATED - moved to bookingSaga.js as internal helper.
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
_normalizeLocalIsoStr,
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
const COMPENSATIONS_COLLECTION = COLLECTIONS?.COMPENSATIONS || "COMPENSACIONES_PENDIENTES";
const TRANSACTIONS_COLLECTION = COLLECTIONS?.TRANSACTIONS || "BOOKING_TRANSACTIONS";
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

export function normalizeError(error) {
  if (error && error.isBookingError) {
    return {
      code: error.code || ERROR_CODES.NETWORK_ERROR,
      message: error.message || "Unknown error occurred",
      details: error.details || null,
    };
  }

  const code = String(error?.code || error?.errorCode || ERROR_CODES.NETWORK_ERROR);
  const message = error?.message || error?.errorDescription || String(error || "Unknown error occurred");
  return { code, message, details: error?.details || null };
}

export async function _updateCitaSafe(bookingId, updater, traceId = "no-trace", operation = "updateCita") {
  const cleanBookingId = _safeTrim(bookingId);
  if (!cleanBookingId || typeof updater !== "function") {
    throw createBookingError(ERROR_CODES.INVALID_PAYLOAD, "Booking ID and updater are required", {
      bookingId,
      operation,
      traceId,
    });
  }

  const queryResult = await withTimeout(
    wixData.query(CITAS_COLLECTION)
      .eq("bookingId", cleanBookingId)
      .limit(1)
      .find({ suppressAuth: true, consistentRead: true }),
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
    throw createBookingError(ERROR_CODES.DATA_CONFLICT, "Booking not found", {
      bookingId: cleanBookingId,
      operation,
      traceId,
    });
  }

  // FIX: normalize persisted meta. _persistBooking stores meta as a JSON
  // string, and consumers spread it (e.g. { ...meta }). Spreading a string
  // corrupts the record with index keys, so parse it back into an object
  // before passing it to the updater.
  const persistedMeta = current.meta;
  let normalizedMeta = persistedMeta;
  if (typeof normalizedMeta === "string") {
    try {
      normalizedMeta = JSON.parse(normalizedMeta);
    } catch (_) {
      normalizedMeta = {};
    }
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
_id: transactionId,
pairToken,
traceId: activeTraceId,
payloadHash,
status: "INITIATED",
createdAt: new Date(),
updatedAt: new Date(),
};
await withTimeout(wixData.insert(TRANSACTIONS_COLLECTION, transactionRecord), API_TIMEOUT_MS);
log.info(`[bookingCore] Transaction initialized`, { transactionId, pairToken });
return { ok: true, success: true, isNew: true, transactionId };
} catch (error) {
log.error(`[bookingCore] Failed to initialize transaction`, { error: error.message, pairToken });
return { ok: false, success: false, isNew: false, code: ERROR_CODES.TRANSACTION_FAILED, message: error.message };
}
}

export async function _completeTransaction(transactionId, result = null) {
try {
await withTimeout(
wixData.update(TRANSACTIONS_COLLECTION, { _id: transactionId, status: "COMPLETED", result, updatedAt: new Date() }),
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

export function _buildLockKeys_DEPRECATED(phases, lockResourceKey) {
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
let hasActiveLock = false;
const staleLocks = [];
for (const lock of existingLock.items) {
    const expiresAt = new Date(lock.expiresAt).getTime();
    const lockAge = Date.now() - new Date(lock.createdAt).getTime();
    const isActive = Number.isFinite(expiresAt)
      ? expiresAt > Date.now()
      : !Number.isFinite(lockAge) || lockAge < ttlMs;
    if (isActive) {
hasActiveLock = true;
break;
}
staleLocks.push(lock);
}
if (hasActiveLock) {
log.warn(`[bookingCore] Lock already held`, { lockKey, currentOwner: existingLock.items[0].ownerId });
return { ok: false, code: ERROR_CODES.TOKEN_BUSY, message: "Slot already locked" };
}
// FIX: release expired locks before acquiring. Without this, orphan ACQUIRED
// records accumulate per lockKey and can block future acquisitions or allow
// a stale record to be treated as an active lock (double-booking).
for (const staleLock of staleLocks) {
await withTimeout(
wixData.update(LOCKS_COLLECTION, { _id: staleLock._id, status: "RELEASED", releasedAt: new Date() }),
API_TIMEOUT_MS
).catch(() => {});
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
 * Persiste un booking en Wix Data con validacion de tipos
 * @param {Object} params - Parametros del booking
 * @param {string} traceId - ID de traza para logs
 */
export async function _persistBooking(params, traceId = 'no-trace') {
  // Validaciones en tiempo de ejecucion
  if (!params || typeof params !== 'object') {
    throw createBookingError(ERROR_CODES.INVALID_PAYLOAD, 'Booking payload is required', { traceId });
  }

  const serviceId = params.serviceId;
  if (!params.bookingId || !serviceId || !params.scheduleId) {
    const missingFields = [];
    if (!params.bookingId) missingFields.push('bookingId');
    if (!serviceId) missingFields.push('serviceId');
    if (!params.scheduleId) missingFields.push('scheduleId');

    const error = createBookingError(ERROR_CODES.INVALID_PAYLOAD, `Missing required fields: ${missingFields.join(', ')}`, { traceId, missingFields });
    console.error(`[bookingCore][${traceId}] ${error.message}`);
    throw error;
  }

  // Validar GUIDs
  if (!isValidGuid(serviceId)) {
    throw createBookingError(ERROR_CODES.INVALID_PAYLOAD, `Invalid serviceId: ${serviceId}`, { traceId, serviceId });
  }

  if (params.resourceId && !isValidGuid(params.resourceId)) {
    throw createBookingError(ERROR_CODES.INVALID_PAYLOAD, `Invalid resourceId: ${params.resourceId}`, { traceId, resourceId: params.resourceId });
  }

  // Validar fechas
  if (isNaN(new Date(params.startDate).getTime()) || isNaN(new Date(params.endDate).getTime())) {
    throw createBookingError(ERROR_CODES.INVALID_DATES, 'Invalid start or end date', { traceId, startDate: params.startDate, endDate: params.endDate });
  }

  // Validar tipo de booking
  const validTypes = ['simple', 'dual_fase1', 'dual_fase2'];
  if (!validTypes.includes(params.tipo)) {
    throw createBookingError(ERROR_CODES.INVALID_PAYLOAD, `Invalid booking type: ${params.tipo}`, { traceId, tipo: params.tipo });
  }

  const meta = (params.meta && typeof params.meta === 'object') ? params.meta : (typeof params.meta === 'string' ? (() => { try { return JSON.parse(params.meta); } catch { return null; } })() : null);
  if (!meta || typeof meta !== 'object' || !('paymentStatus' in meta) || !meta.paymentStatus) {
    throw createBookingError(ERROR_CODES.INVALID_PAYLOAD, 'Booking meta is required and must include paymentStatus', { traceId, meta: params.meta });
  }

  // Validar estado de pago
  const validPaymentStates = ['UNPAID', 'PENDING_PAYMENT', 'CONFIRMED_UNPAID', 'PAID'];
  if (!validPaymentStates.includes(meta.paymentStatus)) {
    throw createBookingError(ERROR_CODES.INVALID_PAYLOAD, `Invalid payment state: ${meta.paymentStatus}`, { traceId, paymentStatus: meta.paymentStatus });
  }

  // Construir item para Wix Data
  const bookingRecord = {
    _id: params.bookingId,
    revision: params.revision,
    serviceId,
    scheduleId: params.scheduleId,
    resourceId: params.resourceId,
    startDate: params.startDate,
    endDate: params.endDate,
    contactDetails: params.contactDetails,
    tipo: params.tipo,
    meta: JSON.stringify(meta),
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
bookedEntity: payload.bookedEntity,
contactDetails: payload.contactDetails,
totalParticipants: payload.totalParticipants,
options: payload.options,
};

const result = await elevate(() => bookings.createBooking(elevatedPayload));
const booking = result?.booking || result?.data?.booking || result;
const bookingId = booking?._id || booking?.id || result?.bookingId;
log.info(`[bookingCore] Booking created via elevated`, { bookingId });
return { ok: true, data: { bookingId, revision: booking?.revision, status: booking?.status }, raw: result };
} catch (error) {
log.error(`[bookingCore] Elevated booking creation failed`, { error: error.message });
return { ok: false, code: ERROR_CODES.BOOKING_CREATION_FAILED, message: error.message };
}
}

export async function cancelBookingElevated(bookingId, options = {}) {
try {
const cancelPayload = {
bookingId,
...(options && typeof options === "object" ? options : {}),
};
const result = await elevate(() => bookings.cancelBooking(cancelPayload));
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
const isObjectAction = !!(action && typeof action === 'object');
const paymentStatus = isObjectAction ? String(action.paymentStatus || '').toUpperCase() : '';
const resolvedAction = typeof action === 'string'
? action.toLowerCase()
: (isObjectAction ? String(action.action || action.type || action.status || '').toLowerCase() : '');

if (resolvedAction === 'confirm' || (!resolvedAction && isObjectAction && paymentStatus !== 'DECLINED' && paymentStatus !== 'REFUNDED')) {
const confirmPayload = isObjectAction ? { bookingId, ...action } : { bookingId };
const result = await elevate(() => bookings.confirmBooking(confirmPayload));
log.info(`[bookingCore] Booking confirmed`, { bookingId });
return { ok: true, data: { bookingId, status: "CONFIRMED" } };
}

if (resolvedAction === 'decline' || paymentStatus === 'DECLINED' || (isObjectAction && String(action.status || action.action || '').toLowerCase() === 'declined')) {
const declinePayload = isObjectAction ? { bookingId, ...action } : { bookingId };
const result = await elevate(() => bookings.declineBooking(declinePayload));
log.info(`[bookingCore] Booking declined`, { bookingId });
return { ok: true, data: { bookingId, status: "DECLINED" } };
}

if (isObjectAction && paymentStatus !== 'DECLINED' && paymentStatus !== 'REFUNDED') {
const confirmPayload = { bookingId, ...action };
const result = await elevate(() => bookings.confirmBooking(confirmPayload));
log.info(`[bookingCore] Booking confirmed`, { bookingId });
return { ok: true, data: { bookingId, status: "CONFIRMED" } };
}

return { ok: false, code: ERROR_CODES.INVALID_CLOCK_TYPE, message: "Invalid action" };
} catch (error) {
log.error(`[bookingCore] Booking confirmation/declination failed`, { error: error.message, bookingId });
return { ok: false, code: ERROR_CODES.BOOKING_CREATION_FAILED, message: error.message };
}
}

export async function rescheduleBookingElevated(bookingId, schedule, options = {}) {
try {
const cleanBookingId = _safeTrim(bookingId);
if (!cleanBookingId || !schedule || typeof schedule !== "object") {
return { ok: false, code: ERROR_CODES.INVALID_PAYLOAD, message: "bookingId and schedule are required" };
}
const payload = {
bookingId: cleanBookingId,
schedule,
...(options && typeof options === "object" ? options : {}),
};
const result = await elevate(() => bookings.rescheduleBooking(payload));
const booking = result?.booking || result;
const revision = Number(booking?.revision || options?.revision || 1);
log.info(`[bookingCore] Booking rescheduled via elevated`, { bookingId: cleanBookingId, revision });
return {
ok: true,
booking,
revision,
data: { bookingId: cleanBookingId, revision, status: booking?.status || "RESCHEDULED" },
raw: result,
};
} catch (error) {
log.error(`[bookingCore] Elevated booking reschedule failed`, { error: error.message, bookingId });
return { ok: false, code: ERROR_CODES.BOOKING_CREATION_FAILED, message: error.message };
}
}

export async function _forceStaffInPristineSlot(slot, resourceId, serviceId, durationMinutes) {
const legacyDurationSignature = durationMinutes === undefined && (
  typeof serviceId === 'number' ||
  (typeof serviceId === 'string' && /^\d+(?:\.\d+)?$/.test(serviceId.trim()))
);
if (legacyDurationSignature) {
durationMinutes = Number(serviceId);
serviceId = slot?.serviceId || null;
}

// VALIDACION CRITICA: Verificar serviceId
if (!serviceId) {
logger.warn('[bookingCore] _forceStaffInPristineSlot: serviceId missing', { slot });
return null;
}

// Validar que resourceId sea GUID valido
if (!_looksLikeGuid(resourceId)) {
logger.warn('[bookingCore] _forceStaffInPristineSlot: resourceId no es GUID valido', { resourceId });
return null;
}

// VALIDACION CRITICA: Verificar que el slot tenga localStartDate valido
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
pristineSlot.serviceId = serviceId;

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
// OPTIMIZACION: Bucket Indexing para Dual Slots
// ============================================================================

/**
 * Extrae IDs de recursos validos (GUIDs) de un slot.
 * Soporta multiples formatos: resourceId string, objeto resource, array resources, staffMemberId
 * @param {Object|null|undefined} slot - Slot de Wix Bookings.
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
  
  // Filtrar solo GUIDs validos
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
    // Simulacion de carga: En produccion esto consultaria Wix Data/Bookings API
    // Aqui usamos un hash determinista basado en ID + Fecha para mockear carga variable
    const loadMap = new Map();
    
    for (const resId of resourceIds) {
      // Mock: Carga basada en ultimos caracteres del GUID para distribucion uniforme
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
 * VERSION OPTIMIZADA: Obtiene slots duales certificados usando Bucket Indexing.
 * Complejidad: O(N log N) vs O(N^2) de la version naive.
 * 
 * @param {string} serviceId - GUID del servicio principal.
 * @param {string} resourceId - GUID del recurso (staff/equipo).
 * @param {string} dateYMD - Fecha 'YYYY-MM-DD'.
 * @param {string[]} addonIds - Servicios adicionales opcionales.
 * @returns {Promise<Object>} Resultado con slots emparejados o error.
 */
export async function getCertifiedDualSlotsOptimized(serviceId, resourceId, dateYMD, addonIds = []) {
  const traceId = makeTraceId('opt');
  const startTime = Date.now();
  
  console.log(`[${traceId}] Iniciando busqueda optimizada dual-slot para ${serviceId} en ${dateYMD}`);

  // 1. Validaciones iniciales
  if (!serviceId || !resourceId || !dateYMD) {
    return { error: 'PARAMS_MISSING', traceId };
  }

  // 2. Obtencion de slots primarios (Simulado para el ejemplo, usaria wix-bookings v2)
  const slotsF1 = await _mockFetchPrimarySlots(serviceId, resourceId, dateYMD);
  
  if (!slotsF1 || slotsF1.length === 0) {
    return { slots: [], count: 0, traceId, duration: Date.now() - startTime };
  }

  // 3. BUCKET INDEXING: Construir indice por recurso UNA SOLA VEZ
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
  console.log(`[${traceId}] Busqueda completada en ${duration}ms. Pares encontrados: ${finalPairs.length}`);

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
export function _areSlotsContiguous(s1, s2) {
  if (!s1.localEndDate || !s2.localStartDate) return false;
  const end1 = new Date(s1.localEndDate).getTime();
  const start2 = new Date(s2.localStartDate).getTime();
  // Tolerancia de 1 minuto
  return Math.abs(end1 - start2) <= 60000; 
}

/**
 * Helper: Sanitiza datos del slot para respuesta publica.
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
 * Mock para simulacion de fetch de slots primarios.
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
 * Genera una clave unica para identificar un slot
 */
export function _generateSlotKey(slotOrServiceId, resourceId, startDate, endDate) {
  if (slotOrServiceId && typeof slotOrServiceId === 'object') {
    const slot = slotOrServiceId;
    const parts = [
      slot.serviceId || slot.serviceId || '',
      slot.scheduleId || '',
      slot.localStartDate || slot.startDate || '',
      slot.resourceId || (slot.resource?.id) || ''
    ].filter(Boolean);

    return parts.length >= 3 ? parts.join('|') : null;
  }

  const serviceId = _safeTrim(slotOrServiceId || '');
  const resourceIdValue = _safeTrim(resourceId || '');
  const startValue = _safeTrim(startDate || '');
  const endValue = _safeTrim(endDate || '');
  const parts = [serviceId, resourceIdValue, startValue, endValue].filter(Boolean);

  return parts.length >= 2 ? parts.join('|') : null;
}

/**
 * Valida que un string sea un GUID valido (formato UUID v4)
 */
export function isValidGuid(id) {
  return _looksLikeGuid(id);
}

/**
 * Proyecta un slot de Wix a nuestro formato interno certificado
 */
export function _projectCertifiedSlot(slot, resourceId) {
  const serviceId = slot?.serviceId || slot?.primaryServiceGuid;
  if (!slot || !serviceId) {
    console.warn('[bookingCore] Slot invalido: falta primaryServiceGuid');
    return null;
  }
  
  const targetResourceId = resourceId || slot.resourceId || (slot.resource?.id);
  
  if (!isValidGuid(targetResourceId)) {
    console.warn(`[bookingCore] ResourceId invalido: ${targetResourceId}`);
    return null;
  }
  
  // Validar fechas
  if (!slot.localStartDate || !slot.localEndDate) {
    console.warn('[bookingCore] Slot invalido: faltan fechas');
    return null;
  }
  
  const startDate = new Date(slot.localStartDate);
  const endDate = new Date(slot.localEndDate);
  
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    console.warn('[bookingCore] Fechas invalidas en slot');
    return null;
  }
  
  return {
    serviceId,
    scheduleId: slot.scheduleId || '',
    resourceId: targetResourceId,
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
 * Proyecta un slot de availability al formato Writer V2 para reschedule.
 * Compatible con el slot shape que consume `_getBookingSlotFromCita` y el
 * motor de reschedule de Wix Bookings V2 (startDate/endDate como Date).
 */
export async function _projectWriterSlotFromAvailability(slot, resourceId, serviceId) {
  const cleanServiceId = _safeTrim(serviceId || slot?.serviceId || slot?.primaryServiceGuid || "");
  const cleanResourceId = _safeTrim(
    resourceId || slot?.resourceId || slot?.resource?._id || slot?.resource?.id || ""
  );
  if (!_looksLikeGuid(cleanServiceId) || !_looksLikeGuid(cleanResourceId)) {
    logger.warn("[bookingCore] _projectWriterSlotFromAvailability: invalid service/resource id", {
      serviceId: cleanServiceId,
      resourceId: cleanResourceId,
    });
    return null;
  }

  const localStart = _normalizeLocalIsoStr(slot?.localStartDate || slot?.startDate || "");
  const localEnd = _normalizeLocalIsoStr(slot?.localEndDate || slot?.endDate || "");
  if (!localStart || !localEnd) {
    logger.warn("[bookingCore] _projectWriterSlotFromAvailability: missing or invalid dates", { slot });
    return null;
  }

  const startDate = getUtcDateFromMadridLocal(localStart);
  const endDate = getUtcDateFromMadridLocal(localEnd);
  if (!startDate || !endDate || isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate.getTime() <= startDate.getTime()) {
    logger.warn("[bookingCore] _projectWriterSlotFromAvailability: invalid date range", { localStart, localEnd });
    return null;
  }

  return {
    serviceId: cleanServiceId,
    scheduleId: _safeTrim(slot?.scheduleId) || "",
    startDate,
    endDate,
    timezone: SDK_CONFIG?.TZ || "Europe/Madrid",
    resource: { _id: cleanResourceId },
    location: {
      _id: SDK_CONFIG?.LOCATION_ID,
      locationType: SDK_CONFIG?.LOCATION_TYPES?.BOOKINGS_WRITER,
    },
  };
}

/**
 * Genera un token unico para emparejar slots duales
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
  
  // El slot2 debe empezar despues del slot1
  const end1 = new Date(slot1.localEndDate).getTime();
  const start2 = new Date(slot2.localStartDate).getTime();
  
  const gapMinutes = (start2 - end1) / 60000;
  
  // Gap dentro del limite permitido
  return gapMinutes >= 0 && gapMinutes <= maxGapMinutes;
}

/**
 * Auditoria de precio de booking
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
    throw new Error('Precio auditado invalido');
  }
  
  return Math.round(total * 100) / 100; // Redondear a 2 decimales
}
