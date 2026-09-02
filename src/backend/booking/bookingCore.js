/**
=============================================================================
MODULE: backend/booking/bookingCore.js
VERSION: v19.6.17-corrections-applied
RESPONSIBILITY: Elevated proxies, slot sanitization, mutex locks, atomic
transactions, persistence, and error handling.
STANDARDS: G10 ASCII Strict (0 non-ASCII characters).
CORRECTIONS APPLIED:
  [FIX-1]  ERROR_CODES.INVALID_PAYLOAD: removed trailing space
  [FIX-2]  ERROR_CODES.TOKEN_BUSY: removed trailing space
  [FIX-3]  ERROR_CODES.FISCAL_SIGN_FAIL: removed trailing space
  [FIX-4]  ERROR_CODES.FISCAL_VIOLATION: removed trailing space
  [FIX-5]  ERROR_CODES.BOOKING_CREATION_FAILED: removed trailing space
  [FIX-6]  ERROR_CODES.CHECKOUT_FAILED: removed trailing space
  [FIX-7]  ERROR_CODES.INVALID_EMPLOYEE: removed trailing space
  [FIX-8]  ERROR_CODES.AUTH_REQUIRED: removed trailing space
  [FIX-9]  ERROR_CODES.ACCESS_DENIED: removed trailing space
  [FIX-10] ERROR_CODES.INVALID_CLOCK_TYPE: removed trailing space
  [FIX-11] ERROR_CODES.RATE_LIMITED: removed trailing space
  [FIX-12] PII_KEYS: removed trailing spaces from all 12 values
=============================================================================
*/
import { bookings } from "@wix/bookings";
import { checkout } from "wix-ecom-backend";
import { elevate } from "wix-auth";
import wixData from "wix-data";
import {
_safeTrim,
_looksLikeGuid,
getUtcDateFromMadridLocal,
getMadridLocalStringNoZ,
makeTraceId,
_toDateSafe,
} from "public/mmUtils";
import {
COLLECTIONS,
CONCURRENCY,
SDK_CONFIG,
} from "backend/internalConfig";
import { createHash } from "crypto";
export const logger = {
error: (msg, data) => console.error("[bookingCore] ERROR:", msg, data),
warn: (msg, data) => console.warn("[bookingCore] WARN:", msg, data),
info: (msg, data) => console.log("[bookingCore] INFO:", msg, data),
};
const log = logger;
export const ERROR_CODES = Object.freeze({
INVALID_PAYLOAD: "INVALID_PAYLOAD",                     // [FIX-1] was "INVALID_PAYLOAD "
TOKEN_BUSY: "TOKEN_BUSY",                               // [FIX-2] was "TOKEN_BUSY "
FISCAL_SIGN_FAIL: "FISCAL_SIGN_FAIL",                   // [FIX-3] was "FISCAL_SIGN_FAIL "
FISCAL_VIOLATION: "FISCAL_VIOLATION",                   // [FIX-4] was "FISCAL_VIOLATION "
BOOKING_CREATION_FAILED: "BOOKING_CREATION_FAILED",     // [FIX-5] was "BOOKING_CREATION_FAILED "
CHECKOUT_FAILED: "CHECKOUT_FAILED",                     // [FIX-6] was "CHECKOUT_FAILED "
INVALID_EMPLOYEE: "INVALID_EMPLOYEE",                   // [FIX-7] was "INVALID_EMPLOYEE "
AUTH_REQUIRED: "AUTH_REQUIRED",                         // [FIX-8] was "AUTH_REQUIRED "
ACCESS_DENIED: "ACCESS_DENIED",                         // [FIX-9] was "ACCESS_DENIED "
INVALID_CLOCK_TYPE: "INVALID_CLOCK_TYPE",               // [FIX-10] was "INVALID_CLOCK_TYPE "
RATE_LIMITED: "RATE_LIMITED",                           // [FIX-11] was "RATE_LIMITED "
});
export const createBookingElevated = elevate(bookings.createBooking);
export const cancelBookingElevated = elevate(bookings.cancelBooking);
export const confirmOrDeclineBookingElevated = elevate(bookings.confirmOrDeclineBooking);
export const rescheduleBookingElevated = elevate(bookings.rescheduleBooking);
export const createCheckoutElevated = elevate(checkout.createCheckout);
export const getCheckoutUrlElevated = elevate(checkout.getCheckoutUrl);
function _toUtcDateFromAvailability(value) {
if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
const raw = _safeTrim(value);
if (!raw) return null;
if (raw.endsWith("Z")) {
const utc = new Date(raw);
return isNaN(utc.getTime()) ? null : utc;
}
return getUtcDateFromMadridLocal(raw);
}
export function _projectWriterSlotFromAvailability(slot, resourceId, expectedServiceId) {
const s = slot && typeof slot === "object" ? slot : null;
if (!s) return null;
const serviceId = _safeTrim(s.serviceId || expectedServiceId);
const resourceIdClean = _safeTrim(resourceId || s.resource?._id || s.resource?.id || s.resourceId);
const scheduleId = _safeTrim(s.scheduleId || s.slot?.scheduleId || s.schedule?.id || s.resource?.scheduleId);
const startDate = _toUtcDateFromAvailability(s.startDate || s.localStartDate);
const endDate = _toUtcDateFromAvailability(s.endDate || s.localEndDate);
const location = s.location && typeof s.location === "object" ? s.location : null;
const locationId = _safeTrim(location?._id || location?.id);
if (
!_looksLikeGuid(serviceId) ||
!_looksLikeGuid(resourceIdClean) ||
!_looksLikeGuid(scheduleId) ||
!startDate ||
!endDate ||
endDate.getTime() <= startDate.getTime() ||
!_looksLikeGuid(locationId)
) {
return null;
}
return {
...s,
serviceId,
scheduleId,
startDate,
endDate,
timezone: _safeTrim(s.timezone) || _safeTrim(SDK_CONFIG?.TZ),
resource: { _id: resourceIdClean },
location: {
_id: locationId,
locationType: _safeTrim(SDK_CONFIG?.LOCATION_TYPES?.BOOKINGS_WRITER),
},
};
}
export function _extractCheckoutId(checkoutSession) {
return checkoutSession?.checkout?._id || checkoutSession?._id || null;
}
export async function getCheckoutUrlSafe(checkoutSessionOrId) {
const direct = checkoutSessionOrId?.checkoutUrl || checkoutSessionOrId?.checkout?.checkoutUrl || null;
if (direct) return direct;
const checkoutId =
    typeof checkoutSessionOrId === "string" ? checkoutSessionOrId : _extractCheckoutId(checkoutSessionOrId);
if (!checkoutId) return null;
try {
    const result = await getCheckoutUrlElevated(checkoutId, {});
    return result?.checkoutUrl || null;
} catch (error) {
    log.warn("getCheckoutUrlSafe failed", { checkoutId, error: error?.message });
    return null;
}
}
const MUTEX_TTL_MS = Number(CONCURRENCY?.MUTEX_TTL_MS) || 120000;
const LOCKS_COL = COLLECTIONS.LOCKS;
export function _safeLockId(key) {
const k = String(key || "").trim();
if (!k) return "";
return `lk_${createHash("sha256").update(k).digest("hex")}`;
}
async function _getLock(slotKey) {
const k = String(slotKey || "");
if (!k) return null;
const id = _safeLockId(k);
const item = await wixData
    .get(LOCKS_COL, id, { suppressAuth: true, consistentRead: true })
    .catch(() => null);
if (!item) return null;
if (item.expiresAt) item.expiresAt = _toDateSafe(item.expiresAt);
if (item.createdAt) item.createdAt = _toDateSafe(item.createdAt);
if (item.updatedAt) item.updatedAt = _toDateSafe(item.updatedAt);
return item;
}
function _isDuplicateItemError(error) {
const message = String(error?.message || "");
return message.includes("WDE0123") || message.includes("WD_ITEM_ALREADY_EXISTS") || message.includes("Duplicated");
}
function _buildLockDocument(slotKey, lockOwnerId, ttlMs, existing = null) {
const now = new Date();
const safeId = _safeLockId(slotKey);
if (!safeId) throw new Error("LOCK_KEY_INVALID");
return {
    ...(existing || {}),
    _id: safeId,
    slotKey: String(slotKey),
    traceId: String(lockOwnerId || makeTraceId("lock")),
    expiresAt: new Date(Date.now() + (Number(ttlMs) || MUTEX_TTL_MS)),
    createdAt: existing?.createdAt ? _toDateSafe(existing.createdAt) || now : now,
    updatedAt: now,
};
}
export async function _lockSlotKeyOrFail(slotKey, lockOwnerId, ttlMs) {
const k = String(slotKey || "");
const owner = String(lockOwnerId || "").trim();
if (!k || !owner) return { ok: false, message: "LOCK_KEY_OR_OWNER_INVALID" };
try {
     const lockDocument = _buildLockDocument(k, owner, ttlMs);
     await wixData.insert(LOCKS_COL, lockDocument, { suppressAuth: true });
     return { ok: true, acquired: true };
 } catch (error) {
     if (!_isDuplicateItemError(error)) {
         log.error("_lockSlotKeyOrFail failed", { slotKey: k, lockOwnerId: owner, error: error?.message });
         return { ok: false, message: error?.message || "Lock acquisition failed" };
     }
     const existing = await _getLock(k);
     if (existing?.traceId === owner) {
         const renewed = await _renewLock(k, owner, ttlMs);
         return renewed.ok ? { ok: true, renewed: true } : { ok: false, message: "LOCK_RENEWAL_FAILED" };
     }
     const expiresAt = _toDateSafe(existing?.expiresAt);
     const expired = expiresAt ? expiresAt.getTime() < Date.now() : false;
     return {
         ok: false,
         message: expired ? "LOCK_EXPIRED_PENDING_CLEANUP" : "LOCK_HELD_BY_ANOTHER_OWNER",
         retryAfterMs: expired ? Number(CONCURRENCY?.LOCK_CLEANUP_GRACE_MS) || 60000 : 0,
     };
 }
}
export async function _unlockSlotKey(slotKey, lockOwnerId) {
const owner = String(lockOwnerId || "").trim();
const existing = await _getLock(slotKey);
if (!existing) return { ok: true, missing: true };
if (!owner || existing.traceId !== owner) return { ok: false, skipped: true };
await wixData.remove(LOCKS_COL, existing._id, { suppressAuth: true });
return { ok: true };
}
export async function _renewLock(slotKey, lockOwnerId, ttlMs) {
try {
const owner = String(lockOwnerId || "").trim();
const existing = await _getLock(slotKey);
if (!existing || !owner || existing.traceId !== owner) return { ok: false };
    const updated = _buildLockDocument(slotKey, owner, ttlMs, existing);
    await wixData.update(LOCKS_COL, updated, { suppressAuth: true });
    return { ok: true };
} catch (error) {
    log.error("_renewLock failed", { slotKey, lockOwnerId, error: error?.message });
    return { ok: false };
}
}
const DUAL_CACHE_COL = COLLECTIONS.DUAL_CACHE;
export async function _getDualPairFromCache(pairToken, traceId) {
const token = _safeTrim(pairToken);
if (!token) return null;
const result = await wixData
     .query(DUAL_CACHE_COL)
     .eq("_id", token)
     .limit(1)
     .find({ suppressAuth: true })
     .catch(() => ({ items: [] }));
 const item = Array.isArray(result?.items) ? result.items[0] || null : null;
 if (!item) return null;
 const exp = _toDateSafe(item.expiresAt);
 if (exp && exp.getTime() < Date.now()) {
     await wixData.remove(DUAL_CACHE_COL, item._id, { suppressAuth: true }).catch((error) => {
         log.warn("Expired dual cache cleanup failed", { traceId, error: error?.message });
     });
     return null;
 }
 return item;
}
export function _generateSlotKey(serviceId, resourceId, startDate, endDate) {
const startUtc = startDate instanceof Date ? startDate : getUtcDateFromMadridLocal(startDate);
const endUtc = endDate instanceof Date ? endDate : getUtcDateFromMadridLocal(endDate);
const startEpochMin = startUtc ? Math.floor(startUtc.getTime() / 60000) : 0;
const endEpochMin = endUtc ? Math.floor(endUtc.getTime() / 60000) : 0;
const raw = `${String(serviceId || "").trim()}|${String(resourceId || "").trim()}|${startEpochMin}|${endEpochMin}`;
return `slot_${createHash("sha256").update(raw).digest("hex")}`;
}
export function _buildLockKeys(phases, resourceId) {
const keys = (phases || []).map((p) => {
const slot = p?.rawSlot || {};
return _generateSlotKey(slot.serviceId, resourceId, p.localStart, p.localEnd);
});
return Array.from(new Set(keys)).sort();
}
export const TRANSACTIONS_COL = COLLECTIONS.TRANSACTIONS;
const TRANSACTION_POLL_BASE_MS = Number(CONCURRENCY?.TRANSACTION_POLL_BASE_MS) || 250;
const TRANSACTION_MAX_WAIT_MS = Number(CONCURRENCY?.TRANSACTION_MAX_WAIT_MS) || 3000;
async function _getTransactionById(pairToken) {
const id = String(pairToken || "");
if (!id) return null;
return await wixData.get(TRANSACTIONS_COL, id, { suppressAuth: true, consistentRead: true }).catch(() => null);
}
export async function _initTransaction(pairToken, payloadHash, traceId) {
const id = String(pairToken || "");
if (!id) return { success: false, error: "INVALID_PAIR_TOKEN" };
try {
     await wixData.insert(
         TRANSACTIONS_COL, {
             _id: id,
             pairToken: id,
             status: "PENDING",
             payloadHash,
             traceId,
             createdAt: new Date(),
             updatedAt: new Date(),
         }, { suppressAuth: true }
     );
     return { success: true, isNew: true };
 } catch (error) {
     if (_isDuplicateItemError(error)) {
         const startTime = Date.now();
         let pollAttempt = 0;
         while (Date.now() - startTime < TRANSACTION_MAX_WAIT_MS) {
             const existing = await _getTransactionById(id);
             if (existing) {
                 if (String(existing.payloadHash || "") !== String(payloadHash || "")) {
                     return { success: false, error: "PAIR_TOKEN_PAYLOAD_MISMATCH" };
                 }
                 if (existing.status === "COMPLETED") return { success: true, isNew: false, existing };
                 if (existing.status === "FAILED") {
                     return { success: false, error: "TRANSACTION_PREVIOUSLY_FAILED", existing };
                 }
             }
             const elapsedMs = Date.now() - startTime;
             const remainingMs = TRANSACTION_MAX_WAIT_MS - elapsedMs;
             const exponentialDelayMs = TRANSACTION_POLL_BASE_MS * Math.pow(2, Math.min(pollAttempt, 3));
             const jitteredDelayMs = Math.floor(exponentialDelayMs * (0.5 + Math.random()));
             const waitMs = Math.max(0, Math.min(jitteredDelayMs, remainingMs));
             if (waitMs <= 0) break;
             pollAttempt++;
             await new Promise((resolve) => setTimeout(resolve, waitMs));
         }
         const existing = await _getTransactionById(id);
         if (existing) {
             if (String(existing.payloadHash || "") !== String(payloadHash || "")) {
                 return { success: false, error: "PAIR_TOKEN_PAYLOAD_MISMATCH" };
             }
             return { success: true, isNew: false, existing, timeout: true };
         }
         return { success: false, error: "TRANSACTION_TIMEOUT" };
     }
     throw error;
 }
}
export async function _completeTransaction(pairToken, result) {
const id = String(pairToken || "");
if (!id) return;
const existing = await _getTransactionById(id);
if (existing && existing.status === "COMPLETED") return;
const doc = {
    ...(existing || {}),
    _id: id,
    pairToken: id,
    status: "COMPLETED",
    result,
    updatedAt: new Date(),
    createdAt: existing?.createdAt || new Date(),
};
if (existing) await wixData.update(TRANSACTIONS_COL, doc, { suppressAuth: true });
else await wixData.insert(TRANSACTIONS_COL, doc, { suppressAuth: true });
}
export async function _failTransaction(pairToken, errorMessage) {
const id = String(pairToken || "");
if (!id) return;
const existing = await _getTransactionById(id);
 if (existing && existing.status === "COMPLETED") return;
 const doc = {
     ...(existing || {}),
     _id: id,
     pairToken: id,
     status: "FAILED",
     error: String(errorMessage || "UNKNOWN_ERROR"),
     updatedAt: new Date(),
     createdAt: existing?.createdAt || new Date(),
 };
 const action = existing ? "update" : "insert";
 const persist = existing ?
     wixData.update(TRANSACTIONS_COL, doc, { suppressAuth: true }) :
     wixData.insert(TRANSACTIONS_COL, doc, { suppressAuth: true });
 await persist.catch((error) => {
     log.error("_failTransaction persistence failed", {
         pairToken: id,
         action,
         message: error?.message || "UNKNOWN_ERROR",
     });
 });
}
const CITAS_COL = COLLECTIONS.CITAS;
const CITA_STATUS_BY_PAYMENT = Object.freeze({
UNPAID: "CONFIRMED",
PENDING_PAYMENT: "PENDING_PAYMENT",
PENDING_LEDGER: "CONFIRMED",
PAID: "CONFIRMED",
REFUNDED: "CANCELED",
PARTIALLY_REFUNDED: "CONFIRMED",
});
function _getCitaStatusFromPayment(statusPago) {
const payment = String(statusPago || "").trim().toUpperCase();
const status = CITA_STATUS_BY_PAYMENT[payment];
if (!status) throw new Error(`Unsupported payment status: ${payment || "EMPTY"}`);
return status;
}
export async function _persistBooking(params, traceId) {
const {
bookingId,
revision,
serviceId,
scheduleId,
resourceId,
startDate,
endDate,
contactDetails,
tipo,
meta,
} = params || {};
if (!bookingId || !serviceId || !resourceId || !startDate || !endDate) {
     throw new Error("Missing required fields for persistBooking");
 }
 const startDateObj = startDate instanceof Date ? startDate : new Date(startDate);
 const endDateObj = endDate instanceof Date ? endDate : new Date(endDate);
 if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
     throw new Error("Invalid startDate/endDate for persistBooking");
 }
 const startLocal = getMadridLocalStringNoZ(startDateObj);
 const endLocal = getMadridLocalStringNoZ(endDateObj);
 const fechaYmdMadrid = startLocal ? startLocal.slice(0, 10) : "";
 const now = new Date();
 const metaPago = String(meta?.statusPago || "UNPAID").trim().toUpperCase();
 const statusCita = _getCitaStatusFromPayment(metaPago);
 const citaId = `booking_${String(bookingId).trim()}`;
 const doc = {
     _id: citaId,
     bookingId: String(bookingId),
     pairToken: String(meta?.pairToken || meta?.uiPairToken || ""),
     uiPairToken: String(meta?.uiPairToken || meta?.pairToken || ""),
     revision: Number(revision) || 1,
     serviceId: String(serviceId),
     scheduleId: scheduleId ? String(scheduleId) : null,
     resourceId: String(resourceId),
     startDate: startDateObj,
     endDate: endDateObj,
     startDateLocal: startLocal,
     endDateLocal: endLocal,
     fechaYmdMadrid,
     tipo: tipo || "simple",
     status: statusCita,
     statusPago: metaPago,
     meta: {
         ...(meta || {}),
         status: statusCita,
         estado: statusCita,
         statusPago: metaPago,
     },
     contactDetails: contactDetails || {},
     traceId: String(traceId || ""),
     fechaCreacion: now,
     fechaActualizacion: now,
 };
 if (!doc.pairToken) throw new Error("Missing pairToken for persistBooking");
 try {
     const item = await wixData.insert(CITAS_COL, doc, { suppressAuth: true, suppressHooks: true });
     return { created: true, item };
 } catch (error) {
     if (!_isDuplicateItemError(error)) throw error;
     const existing = await wixData.get(CITAS_COL, citaId, { suppressAuth: true, consistentRead: true }).catch(() => null);
     if (!existing || String(existing.bookingId || "") !== String(bookingId) || String(existing.pairToken || "") !== doc.pairToken) {
         throw new Error("CITAS_IDEMPOTENCY_CONFLICT");
     }
     return { created: false, item: existing };
 }
}
export function _sumAddons(addons) {
if (!Array.isArray(addons)) return 0;
return addons.reduce((acc, a) => acc + Number(a.precio || a.price || 0), 0);
}
export class BookingError extends Error {
constructor(code, message, details = {}) {
super(String(message || "Unknown error"));
this.name = "BookingError";
this.code = String(code || "UNKNOWN_ERROR");
this.details = details && typeof details === "object" ? details : { details };
this.timestamp = new Date().toISOString();
if (Error.captureStackTrace) Error.captureStackTrace(this, BookingError);
}
}
export function createBookingError(code, message, details) {
return new BookingError(code, message, details);
}
const PII_KEYS = new Set([
 "nombre",              // [FIX-12] was "nombre "
 "apellidos",           // [FIX-12] was "apellidos "
 "firstname",           // [FIX-12] was "firstname "
 "lastname",            // [FIX-12] was "lastname "
 "email",               // [FIX-12] was "email "
 "telefono",            // [FIX-12] was "telefono "
 "phone",               // [FIX-12] was "phone "
 "address",             // [FIX-12] was "address "
 "cliente",             // [FIX-12] was "cliente "
 "contactdetails",      // [FIX-12] was "contactdetails "
 "contactid",           // [FIX-12] was "contactid "
 "identity",            // [FIX-12] was "identity "
]);
function _sanitizeDetails(details) {
if (!details) return details;
if (Array.isArray(details)) return details.map((v) => _sanitizeDetails(v));
if (typeof details !== "object") return details;
const sanitized = {};
for (const [key, value] of Object.entries(details)) {
    const k = String(key || "").toLowerCase();
    if (PII_KEYS.has(k)) sanitized[key] = "[REDACTED]";
    else if (typeof value === "object" && value !== null) sanitized[key] = _sanitizeDetails(value);
    else sanitized[key] = value;
}
return sanitized;
}
export function normalizeError(err) {
if (err && typeof err === "object" && err.name === "BookingError") {
return {
code: String(err.code || "UNKNOWN_ERROR"),
message: String(err.message || "Unknown error"),
stack: err.stack || null,
details: err.details || {},
};
}
if (err instanceof Error) {
     return {
         code: String(err.code || err.errorCode || err.name || "UNKNOWN_ERROR"),
         message: String(err.message || "Unknown error"),
         stack: err.stack || null,
         details: err.details && typeof err.details === "object" ? err.details : {},
         statusCode: err.statusCode || err.status || null,
     };
 }
 if (typeof err === "string") return { code: "UNKNOWN_ERROR", message: err, stack: null, details: {} };
 if (!err) return { code: "UNKNOWN_ERROR", message: "Unknown error", stack: null, details: {} };
 if (typeof err === "object") {
     const code = err.code || err.errorCode || err.name || "UNKNOWN_ERROR";
     const message = err.message || err.error || err.description || JSON.stringify(err);
     const details = err.details && typeof err.details === "object" ? err.details : {};
     return {
         code: String(code),
         message: String(message),
         stack: err.stack || null,
         details,
         statusCode: err.statusCode || err.status || null,
     };
 }
 return { code: "UNKNOWN_ERROR", message: String(err), stack: null, details: {} };
}
export function _handleError(error, context, traceId, logFn) {
const loggerInstance = logFn || log;
const norm = normalizeError(error);
const sanitizedDetails = _sanitizeDetails(norm.details || {});
loggerInstance.error(`[${context}] ${norm.code}: ${norm.message}`, { traceId, details: sanitizedDetails });
return {
    status: "ERROR",
    data: null,
    error: {
        code: norm.code || "UNKNOWN_ERROR",
        message: norm.message || "Unknown error",
        ...(Object.keys(sanitizedDetails).length ? { details: sanitizedDetails } : {}),
    },
};
}