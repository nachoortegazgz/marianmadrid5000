/*
=============================================================================
MODULE: backend/events.js
RESPONSIBILITY: Server-to-server native webhooks for Wix Bookings V2 and
                Wix eCommerce V2. Fast, synchronous, and idempotent.
STANDARDS: G10 ASCII Strict, Velo Native Optimized.
=============================================================================
*/

import wixData from "wix-data";
import { makeTraceId, _normalizeIdPart, _roundMoney } from "public/mmUtils";
import { COLLECTIONS, APP_IDS, TIPO_MOVIMIENTO, FORMA_PAGO, ESTADO_CITA, ESTADO_PAGO, CITA_FIELDS } from "backend/internalConfig";
import { logger, normalizeError, _updateCitaSafe } from "backend/booking/bookingCore";
import { registerBookingPayment, queueFiscalRecovery } from "backend/cajas.web";
import { recordOnlineInventoryOrderInternal, recordOnlineInventoryRefundInternal } from "backend/inventario.web";

const log = logger;

function _handleError(error, context, traceId) {
    const normalized = normalizeError(error);
    log.error(`Error in ${context}`, { error: normalized.message, traceId });
    return { code: normalized.code, message: normalized.message };
}

async function _logAuditEvent(tipoEvento, level, message, data = {}, traceId, entityId = "system") {
    try {
        const logId = `AUDIT_${_normalizeIdPart(tipoEvento, 30)}_${_normalizeIdPart(entityId, 40)}_${_normalizeIdPart(traceId, 40)}`;
        await wixData.insert(COLLECTIONS.AUDIT_LOG, {
            _id: logId, tipoEvento, level, message, data,
            resourceId: "SYSTEM", source: "backend/events.js", fechaLog: new Date(), traceId,
        }, { suppressAuth: true });
    } catch (err) {
        log.error("Failed to write to AUDIT_LOG", { error: err?.message, traceId });
    }
}

async function _updateCitaEstado(bookingId, nuevoEstado, traceId) {
    await _updateCitaSafe(bookingId, (cita) => {
        if (String(cita[CITA_FIELDS.STATUS] || "").toUpperCase() === String(nuevoEstado || "").toUpperCase()) return null;
        return { ...cita, [CITA_FIELDS.STATUS]: String(nuevoEstado || ESTADO_CITA.CONFIRMED).toUpperCase() };
    }, traceId, "events_updateCitaEstado");
}

async function _markCitasPaidByBookingIds(bookingIds, orderId, traceId) {
    const ids = Array.from(new Set(Array.isArray(bookingIds) ? bookingIds.map(String).filter(Boolean) : []));
    for (const bookingId of ids) {
        await _updateCitaSafe(bookingId, (cita) => {
            const meta = cita.meta || {};
            if (String(meta.statusPago || cita.statusPago || "").toUpperCase() === ESTADO_PAGO.PAID) return null;
            return {
                ...cita,
                [CITA_FIELDS.STATUS]: ESTADO_CITA.CONFIRMED,
                [CITA_FIELDS.STATUS_PAGO]: ESTADO_PAGO.PAID,
                meta: { ...meta, [CITA_FIELDS.STATUS_PAGO]: ESTADO_PAGO.PAID, orderId: orderId || null, fechaConfirmacionPago: new Date() },
            };
        }, traceId, "events_markPaid");
    }
}

export async function wixBookingsV2_onBookingConfirmed(event) {
    const traceId = makeTraceId("whook-conf");
    try {
        const bookingId = event?.booking?.id || event?.entity?._id || "unknown";
        await _updateCitaEstado(bookingId, ESTADO_CITA.CONFIRMED, traceId);
        return { status: "OK" };
    } catch (error) {
        _handleError(error, "wixBookingsV2_onBookingConfirmed", traceId);
        return { status: "OK" };
    }
}

export async function wixBookingsV2_onBookingCanceled(event) {
    const traceId = makeTraceId("whook-cancel");
    try {
        const bookingId = event?.booking?.id || event?.entity?._id || "unknown";
        await _updateCitaEstado(bookingId, ESTADO_CITA.CANCELED, traceId);
        return { status: "OK" };
    } catch (error) {
        _handleError(error, "wixBookingsV2_onBookingCanceled", traceId);
        return { status: "OK" };
    }
}

export async function wixEcom_onOrderPaymentStatusUpdated(event) {
    const traceId = makeTraceId("whook-pay-status");
    try {
        const order = event?.order || event?.data?.order || event?.entity || event || {};
        const orderId = String(order?._id || order?.id || "").trim();
        if (!orderId || orderId === "unknown") return { status: "OK" };

        const paymentStatus = String(order.paymentStatus || "").toUpperCase();
        if (!["PAID", "FULLY_PAID", "PAID_FULL"].includes(paymentStatus)) return { status: "OK" };

        const lineItems = Array.isArray(order.lineItems) ? order.lineItems : [];
        await recordOnlineInventoryOrderInternal(order, traceId).catch(() => null);

        const bookingIds = lineItems
            .filter((item) => item?.catalogReference?.appId === APP_IDS.BOOKINGS)
            .map((item) => String(item?.catalogReference?.catalogItemId || "").trim())
            .filter(Boolean);
        const linkedBookingIds = bookingIds.join(",");

        const orderTotal = Number(order?.priceSummary?.total?.amount ?? order?.totals?.total?.amount ?? 0) || 0;
        const transactionId = `ORDER-${orderId}`;

        const existingLedgerRes = await wixData.query(COLLECTIONS.MOVIMIENTOS_CAJA).eq("transactionId", transactionId).limit(1).find({ suppressAuth: true });
        if (existingLedgerRes?.items?.length > 0) {
            if (bookingIds.length) await _markCitasPaidByBookingIds(bookingIds, orderId, traceId);
            return { status: "OK" };
        }

        if (orderTotal <= 0) {
            if (bookingIds.length) await _markCitasPaidByBookingIds(bookingIds, orderId, traceId);
            return { status: "OK" };
        }

        const orderConcept = bookingIds.length > 0 ? `Reserva Online ${orderId}` : `Venta Online Tienda ${orderId}`;
        const ledgerRes = await registerBookingPayment(linkedBookingIds || null, orderTotal, FORMA_PAGO.ONLINE, {
            concept: orderConcept, resourceId: "online", traceId, transactionId, orderId,
            origen: "WIX_ECOM_PAYMENT_WEBHOOK", tipoMovimiento: TIPO_MOVIMIENTO.VENTA_ONLINE,
        });

        if (ledgerRes?.status === "SUCCESS") {
            if (bookingIds.length) await _markCitasPaidByBookingIds(bookingIds, orderId, traceId);
            return { status: "OK" };
        }

        await queueFiscalRecovery({
            bookingIds: linkedBookingIds, amount: orderTotal, paymentMethod: FORMA_PAGO.ONLINE,
            transactionId, orderId, origin: "WIX_ECOM_PAYMENT_WEBHOOK", concept: orderConcept,
            resourceId: "online", tipoMovimiento: TIPO_MOVIMIENTO.VENTA_ONLINE, traceId,
            lastError: ledgerRes?.error?.message || "LEDGER_REGISTRATION_FAILED",
        });

        return { status: "OK" };
    } catch (error) {
        _handleError(error, "wixEcom_onOrderPaymentStatusUpdated", traceId);
        return { status: "OK" };
    }
}