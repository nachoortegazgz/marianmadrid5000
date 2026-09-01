/*
=============================================================================
MODULE: backend/booking/bookingCore.js
RESPONSIBILITY: Elevated proxies, slot sanitization, atomic transactions, 
                persistence, and error handling.
STANDARDS: G10 ASCII Strict, Velo Native Optimized, No Mutex Over-engineering.
=============================================================================
*/
import { bookings } from "wix-bookings.v2";
import { checkout } from "wix-ecom-backend";
import { elevate } from "wix-auth";
import wixData from "wix-data";
import { findStaff } from "backend/staff";

import {
    COLLECTIONS,
    SDK_CONFIG,
    _safeTrim,
    _looksLikeGuid,
    getUtcDateFromMadridLocal,
    getMadridLocalStringNoZ,
    makeTraceId,
} from "public/mmUtils";

export const logger = {
    error: (msg, data) => console.error("[bookingCore] ERROR:", msg, data),
    warn: (msg, data) => console.warn("[bookingCore] WARN:", msg, data),
    info: (msg, data) => console.info("[bookingCore] INFO:", msg, data),
};

const log = logger;

export const ERROR_CODES = Object.freeze({
    INVALID_PAYLOAD: "INVALID_PAYLOAD",
    TOKEN_BUSY: "TOKEN_BUSY",
    BOOKING_CREATION_FAILED: "BOOKING_CREATION_FAILED",
    CHECKOUT_FAILED: "CHECKOUT_FAILED",
    INVALID_EMPLOYEE: "INVALID_EMPLOYEE",
    AUTH_REQUIRED: "AUTH_REQUIRED",
    ACCESS_DENIED: "ACCESS_DENIED",
    RATE_LIMITED: "RATE_LIMITED",
});

export const createBookingElevated = elevate(bookings.createBooking);
export const cancelBookingElevated = elevate(bookings.cancelBooking);
export const confirmOrDeclineBookingElevated = elevate(bookings.confirmOrDeclineBooking);
export const rescheduleBookingElevated = elevate(bookings.rescheduleBooking);
export const createCheckoutElevated = elevate(checkout.createCheckout);
export const getCheckoutUrlElevated = elevate(checkout.getCheckoutUrl);

async function _resolveScheduleIdByResourceId(resourceId) {
    const resourceIdClean = _safeTrim(resourceId);
    if (!resourceIdClean || !_looksLikeGuid(resourceIdClean)) return null;
    const staff = await findStaff(resourceIdClean);
    const scheduleId = _safeTrim(staff?.scheduleId);
    return scheduleId && _looksLikeGuid(scheduleId) ? scheduleId : null;
}

export async function _forceStaffInPristineSlot(slot, resourceId, defaultDurationMinutes) {
    if (!slot || typeof slot !== "object") return null;

    const primaryServiceGuid = _safeTrim(slot.primaryServiceGuid || slot.serviceId);
    const resourceIdClean = _safeTrim(resourceId || slot.resourceId || slot.resource?.id);
    
    if (!primaryServiceGuid || !_looksLikeGuid(primaryServiceGuid) || !resourceIdClean || !_looksLikeGuid(resourceIdClean)) {
        return null;
    }

    let scheduleId = _safeTrim(slot.scheduleId || slot.slot?.scheduleId || slot.schedule?.id || slot.resource?.scheduleId);
    if (!scheduleId) {
        scheduleId = await _resolveScheduleIdByResourceId(resourceIdClean);
    }
    if (!scheduleId || !_looksLikeGuid(scheduleId)) return null;

    let localStartDate = _safeTrim(slot.localStartDate || slot.startDate);
    if (!localStartDate) return null;

    let localEndDate = _safeTrim(slot.localEndDate || slot.endDate);
    if (!localEndDate) {
        const startUtc = getUtcDateFromMadridLocal(localStartDate);
        if (!startUtc) return null;
        const durationMin = Number(defaultDurationMinutes || 30);
        const endUtc = new Date(startUtc.getTime() + durationMin * 60 * 1000);
        localEndDate = getMadridLocalStringNoZ(endUtc);
    }

    const startDate = getUtcDateFromMadridLocal(localStartDate);
    const endDate = getUtcDateFromMadridLocal(localEndDate);
    if (!startDate || !endDate) return null;

    return {
        serviceId: primaryServiceGuid,
        scheduleId,
        startDate,
        endDate,
        timezone: SDK_CONFIG?.TZ || "Europe/Madrid",
        resource: { id: resourceIdClean },
        location: {
            id: SDK_CONFIG?.LOCATION_ID,
            locationType: SDK_CONFIG?.LOCATION_TYPES?.BOOKINGS_WRITER || "OWNER_BUSINESS",
        },
    };
}

export function _extractCheckoutId(checkoutSession) {
    return checkoutSession?.checkout?._id || checkoutSession?._id || null;
}

// =============================================================================
// ATOMIC TRANSACTIONS (Replaces Mutex Locks)
// =============================================================================
const TRANSACTIONS_COL = COLLECTIONS.TRANSACTIONS;

function _isDuplicateItemError(error) {
    const message = String(error?.message || "");
    return message.includes("WDE0123") || message.includes("WD_ITEM_ALREADY_EXISTS") || message.includes("Duplicated");
}

export async function _initTransaction(pairToken, payloadHash, traceId) {
    const id = String(pairToken || "").trim();
    if (!id) return { success: false, error: "INVALID_PAIR_TOKEN" };

    try {
        // Inserción atómica. Si el _id ya existe, Wix Data lanzará un error WDE0123.
        await wixData.insert(
            TRANSACTIONS_COL,
            {
                _id: id,
                pairToken: id,
                status: "PENDING",
                payloadHash,
                traceId,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
            { suppressAuth: true }
        );
        return { success: true, isNew: true };
    } catch (error) {
        if (_isDuplicateItemError(error)) {
            const existing = await wixData.get(TRANSACTIONS_COL, id, { suppressAuth: true, consistentRead: true });
            if (existing) {
                if (String(existing.payloadHash) !== String(payloadHash)) {
                    return { success: false, error: "PAIR_TOKEN_PAYLOAD_MISMATCH" };
                }
                return { success: true, isNew: false, existing };
            }
        }
        throw error;
    }
}

export async function _completeTransaction(pairToken, result) {
    const id = String(pairToken || "").trim();
    if (!id) return;
    const existing = await wixData.get(TRANSACTIONS_COL, id, { suppressAuth: true, consistentRead: true });
    if (existing && existing.status === "COMPLETED") return;

    const doc = {
        ...(existing || {}),
        _id: id,
        status: "COMPLETED",
        result,
        updatedAt: new Date(),
    };
    if (existing) await wixData.update(TRANSACTIONS_COL, doc, { suppressAuth: true });
    else await wixData.insert(TRANSACTIONS_COL, doc, { suppressAuth: true });
}

export async function _failTransaction(pairToken, errorMessage) {
    const id = String(pairToken || "").trim();
    if (!id) return;
    const existing = await wixData.get(TRANSACTIONS_COL, id, { suppressAuth: true, consistentRead: true });
    if (existing && existing.status === "COMPLETED") return;

    const doc = {
        ...(existing || {}),
        _id: id,
        status: "FAILED",
        error: String(errorMessage || "UNKNOWN_ERROR"),
        updatedAt: new Date(),
    };
    if (existing) await wixData.update(TRANSACTIONS_COL, doc, { suppressAuth: true }).catch(() => null);
}

// =============================================================================
// PERSISTENCE & ERRORS
// =============================================================================
const CITAS_COL = COLLECTIONS.CITAS;

export async function _persistBooking(params, traceId) {
    const { bookingId, revision, serviceId, scheduleId, resourceId, startDate, endDate, contactDetails, tipo, meta } = params || {};
    
    const startLocal = getMadridLocalStringNoZ(startDate);
    const endLocal = getMadridLocalStringNoZ(endDate);
    const fechaYmdMadrid = startLocal ? startLocal.slice(0, 10) : "";
    const metaPago = String(meta?.statusPago || "UNPAID");
    const statusCita = metaPago === "PENDING_PAYMENT" ? "PENDING_PAYMENT" : "CONFIRMED";

    const doc = {
        bookingId: String(bookingId),
        pairToken: String(meta?.pairToken || meta?.uiPairToken || ""),
        uiPairToken: String(meta?.uiPairToken || meta?.pairToken || ""),
        revision: Number(revision) || 1,
        primaryServiceGuid: String(serviceId),
        scheduleId: scheduleId ? String(scheduleId) : null,
        resourceId: String(resourceId),
        startDate,
        endDate,
        startDateLocal: startLocal,
        endDateLocal: endLocal,
        fechaYmdMadrid,
        tipo: tipo || "simple",
        status: statusCita,
        statusPago: metaPago,
        meta: { ...meta, status: statusCita, estado: statusCita, statusPago: metaPago },
        contactDetails: contactDetails || {},
        traceId: String(traceId || ""),
        fechaCreacion: new Date(),
        fechaActualizacion: new Date(),
    };

    const existing = await wixData.query(CITAS_COL).eq("bookingId", String(bookingId)).limit(1).find({ suppressAuth: true });
    if (existing?.items?.length > 0) {
        const updated = { ...existing.items[0], ...doc };
        delete updated._createdDate; delete updated._updatedDate; delete updated._owner;
        const item = await wixData.update(CITAS_COL, updated, { suppressAuth: true });
        return { created: false, item };
    }
    const item = await wixData.insert(CITAS_COL, doc, { suppressAuth: true });
    return { created: true, item };
}

export async function _updateCitaSafe(bookingId, updateFn, traceId, contextLabel) {
    const cleanId = String(bookingId || "").trim();
    if (!cleanId) return null;
    try {
        const res = await wixData.query(CITAS_COL).eq("bookingId", cleanId).limit(1).find({ suppressAuth: true, consistentRead: true });
        const cita = res?.items?.[0];
        if (!cita) return null;
        
        const updated = updateFn(cita);
        if (!updated) return cita; // No changes needed
        
        delete updated._createdDate; delete updated._updatedDate; delete updated._owner;
        updated.fechaActualizacion = new Date();
        return await wixData.update(CITAS_COL, updated, { suppressAuth: true });
    } catch (error) {
        log.error(`_updateCitaSafe failed in ${contextLabel}`, { bookingId, traceId, error: error?.message });
        return null;
    }
}

export function _normalizeAddons(addons) {
    if (!Array.isArray(addons)) return [];
    return addons.map((a) => ({
        id: a.id || a._id || "",
        nombre: a.nombre || a.name || "Complemento",
        precio: Number(a.precio || a.price || 0),
    }));
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
        this.details = details;
    }
}

export function createBookingError(code, message, details) {
    return new BookingError(code, message, details);
}

export function normalizeError(err) {
    if (err instanceof BookingError) return { code: err.code, message: err.message, details: err.details };
    if (err instanceof Error) return { code: err.code || err.name || "UNKNOWN_ERROR", message: err.message };
    if (typeof err === "string") return { code: "UNKNOWN_ERROR", message: err };
    return { code: "UNKNOWN_ERROR", message: "Unknown error" };
}

export function _handleError(error, context, traceId, logFn = log) {
    const norm = normalizeError(error);
    logFn.error(`[${context}] ${norm.code}: ${norm.message}`, { traceId });
    return { status: "ERROR", data: null, error: { code: norm.code, message: norm.message } };
}