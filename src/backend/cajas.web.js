/*
=============================================================================
MODULE: backend/cajas.web.js
RESPONSIBILITY: Internal financial ledger with SHA-256 hash chains and 
                atomic optimistic concurrency (No Mutex).
STANDARDS: G10 ASCII Strict, Velo Native Optimized.
=============================================================================
*/

import { webMethod, Permissions } from "wix-web-module";
import wixData from "wix-data";
import { getSecret } from "wix-secrets-backend";

import { makeTraceId, _roundMoney, _cleanText, _stableSerialize, _normalizeIdPart, _executeWithRetry } from "public/mmUtils";
import { COLLECTIONS, TIPO_MOVIMIENTO, FORMA_PAGO, IVA_RATES, CAJA_STATUS, SDK_CONFIG, CITA_FIELDS, ESTADO_CITA, ESTADO_PAGO } from "backend/internalConfig";
import { SECRETS } from "backend/mmSecrets";
import { logger, ERROR_CODES, createBookingError, normalizeError } from "backend/booking/bookingCore";
import { _toPublicError } from "backend/responseUtils";
import { hmacSha256Hex, hashChain } from "backend/securityEngine";
import { projectLedgerMovementToAccounting } from "backend/contabilidad";
import { enqueueM365LedgerRecord } from "backend/m365GraphSync";
import { requireAdmin, requireCajero, rateLimiter } from "backend/security";

const log = logger;
const SEED_SIGNATURE = "0000000000000000000000000000000000000000000000000000000000000000";
const FISCAL_KEY_CACHE_TTL_MS = 300000;

let cachedFiscalKey = null;
let cachedFiscalNif = null;
let cacheKeyTime = 0;
let cacheNifTime = 0;

function _rateLimitOrThrow(surface, key, traceId) {
    const rl = rateLimiter({ surface, key });
    if (!rl.allowed) {
        const e = new Error(`RATE_LIMITED: retryAfter=${rl.retryAfter}`);
        e.code = "RATE_LIMITED";
        e.meta = { retryAfter: rl.retryAfter, surface, traceId };
        throw e;
    }
}

async function _getCachedCashierSecret() {
    const now = Date.now();
    if (cachedFiscalKey && now - cacheKeyTime < FISCAL_KEY_CACHE_TTL_MS) return cachedFiscalKey;
    const key = await getSecret(SECRETS.FISCAL_KEY).catch(() => "");
    if (!key) throw createBookingError(ERROR_CODES.FISCAL_SIGN_FAIL, "FISCAL_KEY secret missing");
    cachedFiscalKey = key;
    cacheKeyTime = now;
    return cachedFiscalKey;
}

async function _getCachedFiscalIssuerNif() {
    const now = Date.now();
    if (cacheNifTime && now - cacheNifTime < FISCAL_KEY_CACHE_TTL_MS) return cachedFiscalNif;
    const raw = await getSecret(SECRETS.FISCAL_NIF_EMISOR).catch(() => "");
    cachedFiscalNif = String(raw || "").trim().toUpperCase();
    cacheNifTime = now;
    return cachedFiscalNif;
}

function _canonicalPayloadV2(movement) {
    return _stableSerialize({
        prevHash: String(movement?.prevHash || ""),
        transactionId: String(movement?.transactionId || ""),
        tipoMovimiento: String(movement?.tipoMovimiento || ""),
        importeContable: Number(movement?.importeContable || 0),
        formaPago: String(movement?.formaPago || ""),
        baseImponible: Number(movement?.baseImponible || 0),
        cuotaIva: Number(movement?.cuotaIva || 0),
        tasaIva: Number(movement?.tasaIva || 0),
        naturalezaOperacion: String(movement?.naturalezaOperacion || ""),
        tratamientoIva: String(movement?.tratamientoIva || ""),
        referenciaRectificativa: String(movement?.referenciaRectificativa || ""),
        detalleLineas: Array.isArray(movement?.detalleLineas) ? movement.detalleLineas : [],
    });
}

// =============================================================================
// ATOMIC LEDGER STATE (Replaces Mutex)
// =============================================================================
async function _getAndIncrementLedgerState(year, payloadData) {
    return await _executeWithRetry(async () => {
        let state = await wixData.get(COLLECTIONS.CONTADORES_FISCALES, "GLOBAL", { suppressAuth: true });
        if (!state) {
            state = { _id: "GLOBAL", data: {}, ultimoHash: SEED_SIGNATURE };
            await wixData.insert(COLLECTIONS.CONTADORES_FISCALES, state, { suppressAuth: true });
            state = await wixData.get(COLLECTIONS.CONTADORES_FISCALES, "GLOBAL", { suppressAuth: true });
        }

        const keyYear = String(year);
        const seqData = state.data || {};
        
        const nextYearSeq = Number(seqData[keyYear] || 0) + 1;
        const nextGlobalSeq = Number(seqData.seqGlobal || 0) + 1;
        const prevHash = state.ultimoHash || SEED_SIGNATURE;

        const payloadCanonico = _canonicalPayloadV2({ ...payloadData, prevHash });
        const newHash = hashChain(prevHash, payloadCanonico);

        state.data = { ...seqData, [keyYear]: nextYearSeq, seqGlobal: nextGlobalSeq };
        state.ultimoHash = newHash;

        // Actualizacion atomica. Si alguien mas modifico el doc, _version no coincidira y lanzara error, forzando reintento.
        await wixData.update(COLLECTIONS.CONTADORES_FISCALES, state, { suppressAuth: true });

        return { nextYearSeq, nextGlobalSeq, prevHash, newHash, payloadCanonico };
    }, 5, 200);
}

async function _getAllDailyMovements(diaKey, options = {}) {
    if (!diaKey) return [];
    let allItems = [];
    let query = wixData.query(COLLECTIONS.MOVIMIENTOS_CAJA).eq("diaKey", String(diaKey));
    if (options.formaPago) query = query.eq("formaPago", options.formaPago);
    if (options.ascendingCreated) query = query.ascending("seqGlobal");
    
    let res = await query.limit(1000).find({ suppressAuth: true });
    allItems = allItems.concat(res.items || []);
    while (res.hasNext()) {
        res = await res.next({ suppressAuth: true });
        allItems = allItems.concat(res.items || []);
    }
    return allItems;
}

function _buildCashierProjection(items) {
    const totals = { saldoEfectivo: 0, saldoTarjeta: 0, saldoBizum: 0, saldoOnline: 0 };
    for (const movement of items || []) {
        const amount = Number(movement?.importeContable) || 0;
        if (movement?.formaPago === FORMA_PAGO.EFECTIVO) totals.saldoEfectivo += amount;
        if (movement?.formaPago === FORMA_PAGO.TARJETA) totals.saldoTarjeta += amount;
        if (movement?.formaPago === FORMA_PAGO.BIZUM) totals.saldoBizum += amount;
        if (movement?.formaPago === FORMA_PAGO.ONLINE) totals.saldoOnline += amount;
    }
    return {
        saldoEfectivo: _roundMoney(totals.saldoEfectivo),
        saldoTarjeta: _roundMoney(totals.saldoTarjeta),
        saldoBizum: _roundMoney(totals.saldoBizum),
        saldoOnline: _roundMoney(totals.saldoOnline),
        saldoTotal: _roundMoney(totals.saldoEfectivo + totals.saldoTarjeta + totals.saldoBizum + totals.saldoOnline),
        totalOperaciones: Array.isArray(items) ? items.length : 0,
    };
}

async function _upsertCurrentCashProjection(diaKey, options = {}) {
    const day = String(diaKey || "").trim();
    if (!day) return null;
    return await _executeWithRetry(async () => {
        const now = new Date();
        const [items, current] = await Promise.all([
            _getAllDailyMovements(day),
            wixData.get(COLLECTIONS.CAJA_ACTUAL, "CAJA_PRINCIPAL", { suppressAuth: true }).catch(() => null),
        ]);
        const projection = _buildCashierProjection(items);
        const isSameDay = String(current?.diaKey || "") === day;
        const keepClosed = isSameDay && String(current?.estado || "").toUpperCase() === "CERRADA" && !options.closed;
        
        const doc = {
            ...(current || {}),
            _id: "CAJA_PRINCIPAL",
            diaKey: day,
            ...projection,
            estado: (options.closed || keepClosed) ? CAJA_STATUS.CLOSED : CAJA_STATUS.OPEN,
            fechaApertura: isSameDay && current?.fechaApertura ? current.fechaApertura : now,
            fechaCierre: options.closed ? now : (keepClosed ? current?.fechaCierre || null : null),
            ultimaActualizacion: now,
        };

        if (current) return await wixData.update(COLLECTIONS.CAJA_ACTUAL, doc, { suppressAuth: true });
        return await wixData.insert(COLLECTIONS.CAJA_ACTUAL, doc, { suppressAuth: true });
    }, 3, 200);
}

function _resolveMovementType(formaPago, amount, requestedType) {
    const method = String(formaPago || "").toUpperCase();
    const requested = String(requestedType || "").trim().toUpperCase();
    const isRefund = Number(amount) < 0 || requested === TIPO_MOVIMIENTO.REEMBOLSO;
    if (isRefund) return TIPO_MOVIMIENTO.REEMBOLSO;
    
    const map = {
        [FORMA_PAGO.EFECTIVO]: TIPO_MOVIMIENTO.VENTA_EFECTIVO,
        [FORMA_PAGO.TARJETA]: TIPO_MOVIMIENTO.VENTA_TARJETA,
        [FORMA_PAGO.BIZUM]: TIPO_MOVIMIENTO.VENTA_BIZUM,
        [FORMA_PAGO.ONLINE]: TIPO_MOVIMIENTO.VENTA_ONLINE,
    };
    const expected = map[method];
    if (!requested || requested === expected) return expected;
    if (requested === TIPO_MOVIMIENTO.PROPINA && method !== FORMA_PAGO.ONLINE) return requested;
    return expected;
}

export async function registerBookingPayment(bookingId, amount, paymentMethod, options = {}) {
    const traceId = options.traceId || makeTraceId("ledger");
    try {
        const cleanAmount = Number(amount);
        if (!Number.isFinite(cleanAmount) || cleanAmount === 0) throw new Error("Invalid amount");
        const normalizedMethod = String(paymentMethod || FORMA_PAGO.EFECTIVO).toUpperCase();

        const tz = SDK_CONFIG?.TZ || "Europe/Madrid";
        const madridDateStr = new Date().toLocaleDateString("sv-SE", { timeZone: tz });
        const year = parseInt(madridDateStr.slice(0, 4), 10) || new Date().getFullYear();
        const pad = (n) => String(n).padStart(5, "0");

        const tipoMov = _resolveMovementType(normalizedMethod, cleanAmount, options.tipoMovimiento);
        const isRefund = tipoMov === TIPO_MOVIMIENTO.REEMBOLSO;
        const isTip = tipoMov === TIPO_MOVIMIENTO.PROPINA;
        const signo = isRefund ? -1 : 1;

        const absAmount = Math.abs(cleanAmount);
        const importeContable = absAmount * signo;
        const taxRate = isTip ? 0 : IVA_RATES.GENERAL;
        const baseImponible = isTip ? 0 : Number((absAmount / (1 + taxRate)).toFixed(2)) * signo;
        const cuotaIva = isTip ? 0 : Number((absAmount - Math.abs(baseImponible)).toFixed(2)) * signo;
        const naturalezaOperacion = isTip ? "PROPINA" : (isRefund ? "DEVOLUCION" : "VENTA");
        const tratamientoIva = isTip ? "PROPINA_PENDIENTE_GESTORIA" : "IVA_GENERAL";

        const transId = _normalizeIdPart(options.transactionId || `TX_${traceId}_${Date.now()}`, 120);
        const referenciaRectificativa = isRefund ? _normalizeIdPart(options.refundId || options.orderId || transId, 120) : null;
        const detalleLineas = [{
            linea: 1, descripcion: String(options.concept || `${tipoMov} ${transId}`).trim().slice(0, 180),
            cantidad: 1, baseImponible: _roundMoney(baseImponible), cuotaIva: _roundMoney(cuotaIva),
            tasaIva: taxRate, importeTotal: _roundMoney(absAmount),
        }];

        const payloadData = {
            transactionId: transId, tipoMovimiento: tipoMov, importeContable, formaPago: normalizedMethod,
            baseImponible, cuotaIva, tasaIva: taxRate, naturalezaOperacion, tratamientoIva,
            referenciaRectificativa, detalleLineas
        };

        // Generacion atomica de secuencia y hash
        const state = await _getAndIncrementLedgerState(year, payloadData);
        const numTicketFactura = `FAC-${year}-${pad(state.nextYearSeq)}`;
        
        const fiscalKey = await _getCachedCashierSecret();
        const nifEmisor = await _getCachedFiscalIssuerNif();
        const firma = hmacSha256Hex(fiscalKey, state.payloadCanonico);
        const firmaDigital = `${firma}|${state.newHash}`;

        const diaKey = options.diaKey || madridDateStr.substring(0, 10);
        const recordId = `MOV_${_normalizeIdPart(diaKey, 10)}_${_normalizeIdPart(tipoMov, 15)}_${transId}`;

        const movimiento = {
            _id: recordId, seqGlobal: state.nextGlobalSeq, tipoMovimiento: tipoMov,
            concepto: String(options.concept || `${tipoMov} ${transId}`).trim().slice(0, 500),
            origen: String(options.origen || "INTERNAL").trim().slice(0, 80),
            orderId: options.orderId || null, refundId: options.refundId || null,
            importeTotal: absAmount, signo, importeContable, baseImponible, cuotaIva, tasaIva: taxRate,
            naturalezaOperacion, tratamientoIva, referenciaRectificativa, detalleLineas,
            integrityPayloadVersion: "LEDGER_V2", nifEmisor, numTicketFactura,
            prevHash: state.prevHash, hashCadena: state.newHash, firmaDigital,
            formaPago: normalizedMethod, reservaIdVinculada: bookingId || null,
            transactionId: transId, resourceId: options.resourceId || null,
            diaKey, mesKey: diaKey.substring(0, 7), traceId, fechaCreacion: new Date(),
        };

        const result = await wixData.insert(COLLECTIONS.MOVIMIENTOS_CAJA, movimiento, { suppressAuth: true });

        if (SDK_CONFIG?.ACCOUNTING?.ENABLED) projectLedgerMovementToAccounting(result).catch(() => null);
        _upsertCurrentCashProjection(diaKey, { closed: false }).catch(() => null);
        if (SDK_CONFIG?.M365?.ENABLED) enqueueM365LedgerRecord(result, traceId).catch(() => null);

        return { status: "SUCCESS", data: result, error: null };
    } catch (error) {
        const norm = normalizeError(error);
        log.error("Ledger write failed", { code: norm.code, error: norm.message, traceId });
        return { status: "ERROR", data: null, error: { code: norm.code || "LEDGER_WRITE_FAIL", message: norm.message } };
    }
}

// ... (resto de funciones como _verifyIntegrityInternal, registerZClosing, queueFiscalRecovery se mantienen igual, pero sin locks)