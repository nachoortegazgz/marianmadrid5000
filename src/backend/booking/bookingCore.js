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

export async function _persistBooking(bookingData) {
try {
const bookingRecord = {
...bookingData,
createdAt: new Date(),
updatedAt: new Date(),
};
const result = await withTimeout(wixData.insert(CITAS_COLLECTION, bookingRecord), API_TIMEOUT_MS);
log.info(`[bookingCore] Booking persisted`, { bookingId: result._id });
return { ok: true, data: result };
} catch (error) {
log.error(`[bookingCore] Failed to persist booking`, { error: error.message });
return { ok: false, code: ERROR_CODES.BOOKING_CREATION_FAILED, message: error.message };
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

export async function _forceStaffInPristineSlot(slot, resourceId, durationMinutes) {
// VALIDACIÓN CRÍTICA: Verificar que el slot tenga localStartDate válido
if (!slot || !slot.localStartDate) {
logger.warn('[bookingCore] _forceStaffInPristineSlot: localStartDate missing', { slot });
return null;
}

const pristineSlot = { ...slot };
pristineSlot.resourceId = resourceId;
if (durationMinutes && !pristineSlot.localEndDate) {
const startDate = new Date(pristineSlot.localStartDate);
if (isNaN(startDate.getTime())) {
logger.error('[bookingCore] _forceStaffInPristineSlot: Invalid date format', { localStartDate: pristineSlot.localStartDate });
return null;
}
pristineSlot.localEndDate = getMadridLocalStringNoZ(new Date(startDate.getTime() + durationMinutes * 60000));
}
return pristineSlot;
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