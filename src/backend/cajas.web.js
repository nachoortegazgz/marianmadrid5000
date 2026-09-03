/*
=============================================================================
MODULE: backend/cajas.web.js
VERSION: marianmadrid4003 (v21.1.2-LTS-remediated-phase2-deterministic-hash)
RESPONSIBILITY: Internal financial ledger with SHA-256 hash chains and
atomic optimistic concurrency (No Mutex).
STANDARDS: G10 ASCII Strict, Velo Native Optimized.
=============================================================================
*/
import { webMethod, Permissions } from "wix-web-module";
import wixData from "wix-data";
import { getSecret } from "wix-secrets-backend";
import { makeTraceId, _roundMoney, _cleanText, _stableSerialize, _normalizeIdPart } from "public/mmUtils";
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
function _canonicalPayload(prevHash, transactionId, tipoMovimiento, importeContable, formaPago) {
return `${String(prevHash)}|${String(transactionId)}|${String(tipoMovimiento)}|${Number(importeContable)}|${String(formaPago)}`;
}
async function _getAndIncrementLedgerState(year, payloadData) {
let retries = 5;
while (retries > 0) {
try {
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
await wixData.update(COLLECTIONS.CONTADORES_FISCALES, state, { suppressAuth: true });
return { nextYearSeq, nextGlobalSeq, prevHash, newHash, payloadCanonico };
} catch (error) {
retries--;
if (retries === 0) throw error;
}
}
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
let retries = 3;
while (retries > 0) {
try {
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
} catch (error) {
retries--;
if (retries === 0) throw error;
}
}
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
function _movementNature(tipoMovimiento) {
if (tipoMovimiento === TIPO_MOVIMIENTO.PROPINA) return "PROPINA";
if (tipoMovimiento === TIPO_MOVIMIENTO.REEMBOLSO) return "DEVOLUCION";
if (tipoMovimiento === TIPO_MOVIMIENTO.AJUSTE) return "AJUSTE";
return "VENTA";
}
function _buildDocumentLines(concept, absAmount, baseImponible, cuotaIva, tasaIva) {
return [{
linea: 1,
descripcion: String(concept || "Movimiento de caja").trim().slice(0, 180),
cantidad: 1,
baseImponible: _roundMoney(baseImponible),
cuotaIva: _roundMoney(cuotaIva),
tasaIva: Number(tasaIva) || 0,
importeTotal: _roundMoney(absAmount),
}];
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
export async function _verifyIntegrityInternal(diaKey, options = {}) {
const traceId = options.traceId || makeTraceId("verify-integrity");
const fiscalKey = await _getCachedCashierSecret();
const items = await _getAllDailyMovements(diaKey, { ascendingCreated: true });
if (items.length === 0) return { integrityOk: true, inconsistencies: [], totalVerified: 0 };
const inconsistencies = [];
let expectedTicketNum = null;
const firstSeqGlobal = Number(items[0]?.seqGlobal || 0);
let expectedPrevHash = SEED_SIGNATURE;
if (firstSeqGlobal > 0) {
const predecessor = await wixData
.query(COLLECTIONS.MOVIMIENTOS_CAJA)
.lt("seqGlobal", firstSeqGlobal)
.descending("seqGlobal")
.limit(1)
.find({ suppressAuth: true, consistentRead: true });
expectedPrevHash = predecessor?.items?.[0]?.hashCadena || SEED_SIGNATURE;
}
for (let i = 0; i < items.length; i++) {
const m = items[i];
if (m.prevHash !== expectedPrevHash) {
inconsistencies.push({ index: i, id: m._id, reason: "prevHash mismatch with global predecessor hashCadena" });
}
expectedPrevHash = m.hashCadena || "";
const payloadCanonico = m.integrityPayloadVersion === "LEDGER_V2" ?
_canonicalPayloadV2(m) :
_canonicalPayload(m.prevHash, m.transactionId, m.tipoMovimiento, m.importeContable, m.formaPago);
const computedHashCadena = hashChain(m.prevHash, payloadCanonico);
const computedFirma = hmacSha256Hex(fiscalKey, payloadCanonico);
const firmaExpectedFull = `${computedFirma}|${computedHashCadena}`;
if (m.hashCadena !== computedHashCadena) inconsistencies.push({ index: i, id: m._id, reason: "hashCadena mismatch" });
if (m.firmaDigital !== firmaExpectedFull) inconsistencies.push({ index: i, id: m._id, reason: "signature mismatch" });
if (m.numTicketFactura && typeof m.numTicketFactura === "string") {
const parts = m.numTicketFactura.split("-");
if (parts.length === 3) {
const ticketNum = parseInt(parts[2], 10);
if (!isNaN(ticketNum)) {
if (i === 0) expectedTicketNum = ticketNum;
else {
expectedTicketNum++;
if (ticketNum !== expectedTicketNum) {
inconsistencies.push({
index: i,
id: m._id,
reason: `Ticket number sequence mismatch: expected ${expectedTicketNum}, got ${ticketNum}`,
});
}
}
}
}
}
}
const integrityOk = inconsistencies.length === 0;
if (!integrityOk) {
log.error("Integrity violation detected", { diaKey, inconsistenciesCount: inconsistencies.length, traceId });
wixData.insert(
COLLECTIONS.AUDIT_LOG, {
_id: `ALERT_${String(diaKey)}_${Date.now()}`,
tipoEvento: "AUDIT_ALERT_INTEGRITY_VIOLATION",
level: "ERROR",
message: `Integrity violation day ${String(diaKey)}`,
data: { inconsistencies },
traceId,
fechaLog: new Date(),
resourceId: "SYSTEM",
source: "backend/cajas.web.js",
}, { suppressAuth: true }
).catch(() => {});
}
return { integrityOk, inconsistencies, totalVerified: items.length };
}
function _buildZClosingSummary(diaKey, movements, integrity, source) {
const items = [...(movements || [])].sort((a, b) => Number(a?.seqGlobal || 0) - Number(b?.seqGlobal || 0));
const totalsByPayment = { efectivo: 0, tarjeta: 0, bizum: 0, online: 0 };
const totalsByMovement = {};
const totalsByVatRate = {};
let totalVentas = 0;
let totalReembolsos = 0;
let totalPropinas = 0;
let totalAjustes = 0;
let baseImponibleNeta = 0;
let cuotaIvaNeta = 0;
for (const movement of items) {
const amount = Number(movement?.importeContable) || 0;
const base = Number(movement?.baseImponible) || 0;
const vat = Number(movement?.cuotaIva) || 0;
const payment = String(movement?.formaPago || "").toLowerCase();
const type = String(movement?.tipoMovimiento || "AJUSTE").toUpperCase();
const vatRate = String(Number(movement?.tasaIva) || 0);
if (Object.prototype.hasOwnProperty.call(totalsByPayment, payment)) totalsByPayment[payment] += amount;
totalsByMovement[type] = _roundMoney((totalsByMovement[type] || 0) + amount);
if (!totalsByVatRate[vatRate]) totalsByVatRate[vatRate] = { baseImponible: 0, cuotaIva: 0, total: 0, operaciones: 0 };
totalsByVatRate[vatRate].baseImponible = _roundMoney(totalsByVatRate[vatRate].baseImponible + base);
totalsByVatRate[vatRate].cuotaIva = _roundMoney(totalsByVatRate[vatRate].cuotaIva + vat);
totalsByVatRate[vatRate].total = _roundMoney(totalsByVatRate[vatRate].total + amount);
totalsByVatRate[vatRate].operaciones++;
baseImponibleNeta += base;
cuotaIvaNeta += vat;
if (type === TIPO_MOVIMIENTO.REEMBOLSO || amount < 0) totalReembolsos += amount;
else if (type === TIPO_MOVIMIENTO.PROPINA) totalPropinas += amount;
else if (type === TIPO_MOVIMIENTO.AJUSTE) totalAjustes += amount;
else totalVentas += amount;
}
const first = items[0] || null;
const last = items[items.length - 1] || null;
const payload = {
version: "Z_V2",
diaKey: String(diaKey),
timezone: SDK_CONFIG?.TZ || "Europe/Madrid",
source,
seqInicio: Number(first?.seqGlobal || 0),
seqFin: Number(last?.seqGlobal || 0),
hashInicio: String(first?.prevHash || SEED_SIGNATURE),
hashFin: String(last?.hashCadena || SEED_SIGNATURE),
ticketInicio: String(first?.numTicketFactura || ""),
ticketFin: String(last?.numTicketFactura || ""),
totalEfectivo: _roundMoney(totalsByPayment.efectivo),
totalTarjeta: _roundMoney(totalsByPayment.tarjeta),
totalBizum: _roundMoney(totalsByPayment.bizum),
totalOnline: _roundMoney(totalsByPayment.online),
totalVentas: _roundMoney(totalVentas),
totalReembolsos: _roundMoney(totalReembolsos),
totalPropinas: _roundMoney(totalPropinas),
totalAjustes: _roundMoney(totalAjustes),
baseImponibleNeta: _roundMoney(baseImponibleNeta),
cuotaIvaNeta: _roundMoney(cuotaIvaNeta),
resumenTiposMovimiento: totalsByMovement,
resumenTipoIva: totalsByVatRate,
numOperaciones: items.length,
integridadVerificada: Boolean(integrity?.integrityOk),
totalRegistrosVerificados: Number(integrity?.totalVerified || 0),
};
return payload;
}
export async function _registerZClosingInternal(diaKey, options = {}) {
const traceId = options.traceId || makeTraceId("z-closing-cron");
try {
if (!diaKey) throw createBookingError(ERROR_CODES.INVALID_PAYLOAD, "diaKey required", { traceId });
const zId = `Z_${String(diaKey)}`;
const existingZ = await wixData.query(COLLECTIONS.HISTORICO_CIERRES_Z).eq("_id", zId).limit(1).find({ suppressAuth: true, consistentRead: true });
if (existingZ?.items?.length) {
return { status: "SUCCESS", data: { ...existingZ.items[0], idempotent: true }, error: null };
}
const integrity = await _verifyIntegrityInternal(diaKey, { traceId });
if (!integrity?.integrityOk) {
throw createBookingError(ERROR_CODES.FISCAL_VIOLATION, "Integrity violation in Z closing", { traceId });
}
const items = await _getAllDailyMovements(diaKey, { ascendingCreated: true });
const source = options.autoCron ? "CRON" : "ADMIN";
const summary = _buildZClosingSummary(diaKey, items, integrity, source);
const fiscalKey = await _getCachedCashierSecret();
const hashCierre = hashChain(summary.hashFin, _stableSerialize(summary));
const firmaCierre = hmacSha256Hex(fiscalKey, hashCierre);
const record = {
_id: zId,
diaKey: String(diaKey),
...summary,
totalGeneral: _roundMoney(summary.totalEfectivo + summary.totalTarjeta + summary.totalBizum + summary.totalOnline),
estado: CAJA_STATUS.CLOSED,
fechaCierre: new Date(),
fechaVerificacion: new Date(),
hashCierre,
firmaCierre,
traceId,
};
const result = await wixData.insert(COLLECTIONS.HISTORICO_CIERRES_Z, record, { suppressAuth: true });
await _upsertCurrentCashProjection(diaKey, { closed: true });
return { status: "SUCCESS", data: result, error: null };
} catch (error) {
return { status: "ERROR", data: null, error: _toPublicError(error, "Z_CLOSING_FAIL") };
}
}
const FISCAL_RECOVERY_KIND = "FISCAL_LEDGER";
const FISCAL_RECOVERY_MAX_RETRIES = 3;
async function _markCitasPaidAfterFiscalRecovery(bookingIds, orderId, traceId) {
const ids = String(bookingIds || "").split(",").map((id) => id.trim()).filter(Boolean);
for (const bookingId of ids) {
try {
const res = await wixData.query(COLLECTIONS.CITAS).eq("bookingId", bookingId).limit(1).find({ suppressAuth: true, consistentRead: true });
const cita = res?.items?.[0];
if (!cita) continue;
const meta = cita.meta || {};
const paymentState = String(meta[CITA_FIELDS.STATUS_PAGO] || cita[CITA_FIELDS.STATUS_PAGO] || "").toUpperCase();
if (paymentState === ESTADO_PAGO.REFUNDED || paymentState === ESTADO_PAGO.PARTIALLY_REFUNDED) continue;
        const { _createdDate, _updatedDate, _owner, ...safeCita } = cita;
         await wixData.update(COLLECTIONS.CITAS, {
             ...safeCita,
             [CITA_FIELDS.STATUS]: ESTADO_CITA.CONFIRMED,
             [CITA_FIELDS.STATUS_PAGO]: ESTADO_PAGO.PAID,
             fechaActualizacion: new Date(),
             meta: {
                 ...meta,
                 [CITA_FIELDS.STATUS_PAGO]: ESTADO_PAGO.PAID,
                 orderId: orderId || meta.orderId || null,
                 fechaRegistroFiscal: new Date(),
             },
         }, { suppressAuth: true });
     } catch (error) {
         log.error("Fiscal recovery could not finalize CitasF2 payment state", { bookingId, traceId, message: error?.message });
     }
 }
}
export async function queueFiscalRecovery(payload = {}) {
const transactionId = _normalizeIdPart(payload.transactionId, 120);
const bookingIds = String(payload.bookingIds || "").trim();
const amount = Number(payload.amount);
const paymentMethod = String(payload.paymentMethod || FORMA_PAGO.ONLINE).toUpperCase();
const traceId = String(payload.traceId || makeTraceId("fiscal-recovery"));
if (!transactionId || !Number.isFinite(amount) || amount === 0) {
     throw createBookingError(ERROR_CODES.INVALID_PAYLOAD, "Invalid fiscal recovery payload", { traceId });
 }
 const recordId = `FISCAL_${transactionId}`;
 const existing = await wixData
     .get(COLLECTIONS.COMPENSATIONS, recordId, { suppressAuth: true, consistentRead: true })
     .catch(() => null);
 const now = new Date();
 const document = {
     ...(existing || {}),
     _id: recordId,
     kind: FISCAL_RECOVERY_KIND,
     status: "PENDING",
     attempts: Number(existing?.attempts || 0),
     bookingIds,
     amount,
     paymentMethod,
     transactionId,
     orderId: String(payload.orderId || existing?.orderId || ""),
     refundId: String(payload.refundId || existing?.refundId || ""),
     origin: String(payload.origin || existing?.origin || "FISCAL_RECOVERY"),
     concept: String(payload.concept || "Fiscal ledger recovery"),
     resourceId: String(payload.resourceId || "online"),
     tipoMovimiento: String(payload.tipoMovimiento || TIPO_MOVIMIENTO.VENTA_ONLINE),
     phase: String(payload.phase || existing?.phase || ""),
     traceId,
     lastError: String(payload.lastError || existing?.lastError || ""),
     createdAt: existing?.createdAt || now,
     updatedAt: now,
 };
 if (existing) {
     await wixData.update(COLLECTIONS.COMPENSATIONS, document, { suppressAuth: true });
 } else {
     try {
         await wixData.insert(COLLECTIONS.COMPENSATIONS, document, { suppressAuth: true });
     } catch (error) {
         if (String(error?.message || "").includes("WDE0123") || String(error?.message || "").includes("WD_ITEM_ALREADY_EXISTS")) {
             return { status: "SUCCESS", data: { _id: recordId, idempotent: true }, error: null };
         }
         throw error;
     }
 }
 return { status: "SUCCESS", data: { _id: recordId, idempotent: !!existing }, error: null };
}
export async function processPendingFiscalRecoveries(options = {}) {
const traceId = String(options.traceId || makeTraceId("fiscal-recovery-cron"));
const limit = Math.max(1, Math.min(Number(options.limit) || 25, 100));
const result = await wixData
.query(COLLECTIONS.COMPENSATIONS)
.eq("kind", FISCAL_RECOVERY_KIND)
.eq("status", "PENDING")
.ascending("createdAt")
.limit(limit)
.find({ suppressAuth: true, consistentRead: true });
let completed = 0;
 let failed = 0;
 for (const item of result?.items || []) {
     const waitForOriginal = String(item.phase || "") === "WAIT_FOR_ORIGINAL_ORDER_LEDGER";
     if (waitForOriginal) {
         const originalTransactionId = `ORDER-${String(item.orderId || "").trim()}`;
         const original = await wixData.query(COLLECTIONS.MOVIMIENTOS_CAJA).eq("transactionId", originalTransactionId).limit(1).find({ suppressAuth: true, consistentRead: true }).catch(() => ({ items: [] }));
         if (!original?.items?.length) continue;
     }
     const attempt = Number(item.attempts || 0) + 1;
     const ledger = await registerBookingPayment(item.bookingIds || null, item.amount, item.paymentMethod, {
         concept: item.concept,
         resourceId: item.resourceId,
         traceId: item.traceId || traceId,
         transactionId: item.transactionId,
         orderId: item.orderId || null,
         refundId: item.refundId || null,
         origen: item.origin || "FISCAL_RECOVERY",
         tipoMovimiento: item.tipoMovimiento,
     });
     const { _createdDate, _updatedDate, _owner, ...safeItem } = item;
     if (ledger?.status === "SUCCESS") {
         if (String(item.tipoMovimiento || "").toUpperCase() === TIPO_MOVIMIENTO.VENTA_ONLINE && String(item.bookingIds || "").trim()) {
             await _markCitasPaidAfterFiscalRecovery(item.bookingIds, item.orderId, item.traceId || traceId);
         }
         await wixData.update(COLLECTIONS.COMPENSATIONS, {
             ...safeItem,
             status: "COMPLETED",
             attempts: attempt,
             completedAt: new Date(),
             updatedAt: new Date(),
             lastError: "",
         }, { suppressAuth: true });
         completed++;
         continue;
     }
     const isTerminalFailure = attempt >= FISCAL_RECOVERY_MAX_RETRIES;
     const lastError = String(ledger?.error?.message || "FISCAL_RECOVERY_FAILED");
     await wixData.update(COLLECTIONS.COMPENSATIONS, {
         ...safeItem,
         status: isTerminalFailure ? "FAILED" : "PENDING",
         attempts: attempt,
         updatedAt: new Date(),
         lastError,
         ...(isTerminalFailure ? { alertRequired: true, failedAt: new Date() } : {}),
     }, { suppressAuth: true });
     if (isTerminalFailure) {
         log.error("Fiscal recovery exhausted retries and requires administrator review", { transactionId: item.transactionId, traceId: item.traceId || traceId, lastError });
     }
     failed++;
 }
 return { status: "SUCCESS", data: { completed, failed, scanned: result?.items?.length || 0 }, error: null };
}
export const registerManualTransaction = webMethod(Permissions.SiteMember, async (payload = {}) => {
const traceId = payload.traceId || makeTraceId("manual-tx");
try {
_rateLimitOrThrow("cajas.registerManualTransaction", "cashier", traceId);
await requireCajero(traceId);
const { amount, paymentMethod, tipoMovimiento, concept, resourceId = "TPV" } = payload;
const normalizedMethod = String(paymentMethod || "").toUpperCase();
const requestedType = String(tipoMovimiento || "").toUpperCase();
const inferredType = _resolveMovementType(normalizedMethod, amount, requestedType);
const isTip = requestedType === TIPO_MOVIMIENTO.PROPINA;
return await registerBookingPayment(null, amount, normalizedMethod, {
concept: concept || (isTip ? "Propina TPV" : "Manual TPV"),
resourceId,
traceId,
tipoMovimiento: isTip ? TIPO_MOVIMIENTO.PROPINA : inferredType,
transactionId: `MANUAL_${traceId}_${Date.now()}`,
origen: isTip ? "ONLY_STAFF_MANUAL_TIP" : "ONLY_STAFF_MANUAL",
});
} catch (err) {
return { status: "ERROR", data: null, error: _toPublicError(err, "MANUAL_TX_FAIL") };
}
});
export const registerXCount = webMethod(Permissions.SiteMember, async (diaKey, options = {}) => {
const traceId = options.traceId || makeTraceId("x-count");
try {
_rateLimitOrThrow("cajas.registerXCount", "cashier", traceId);
await requireCajero(traceId);
if (!diaKey) throw createBookingError(ERROR_CODES.INVALID_PAYLOAD, "diaKey required", { traceId });
const metalicoCaja = Number(options.metalicoCaja);
if (!Number.isFinite(metalicoCaja) || metalicoCaja < 0) {
throw createBookingError(ERROR_CODES.INVALID_PAYLOAD, "metalicoCaja must be a non-negative number", { traceId });
}
const movements = await _getAllDailyMovements(String(diaKey));
const cashProjection = _buildCashierProjection(movements);
const countedCash = _roundMoney(metalicoCaja);
const totalEfectivoTeorico = cashProjection.saldoEfectivo;
const descuadre = _roundMoney(countedCash - totalEfectivoTeorico);
const record = {
diaKey: String(diaKey),
metalicoCaja: countedCash,
totalEfectivoTeorico,
descuadre,
estadoCuadre: Math.abs(descuadre) < 0.01 ? "CUADRADO" : "DESCUADRE",
fechaConteo: new Date(),
fechaArqueo: new Date(),
traceId,
};
const result = await wixData.insert(COLLECTIONS.CONTEOS_X, record, { suppressAuth: true });
return { status: "SUCCESS", data: result, error: null };
} catch (error) {
return { status: "ERROR", data: null, error: _toPublicError(error, "X_COUNT_FAIL") };
}
});
export const registerZClosing = webMethod(Permissions.Admin, async (diaKey, options = {}) => {
const traceId = options.traceId || makeTraceId("z-closing");
try {
_rateLimitOrThrow("cajas.registerZClosing", "admin", traceId);
await requireAdmin(traceId);
if (!diaKey) throw createBookingError(ERROR_CODES.INVALID_PAYLOAD, "diaKey required", { traceId });
return await _registerZClosingInternal(String(diaKey), { traceId, autoCron: false });
} catch (err) {
return { status: "ERROR", data: null, error: _toPublicError(err, "Z_CLOSING_FAIL") };
}
});
export const verifyIntegrity = webMethod(Permissions.Admin, async (diaKey, options = {}) => {
const traceId = options.traceId || makeTraceId("verify-integrity");
try {
_rateLimitOrThrow("cajas.verifyIntegrity", "admin", traceId);
await requireAdmin(traceId);
const result = await _verifyIntegrityInternal(diaKey, { ...options, traceId });
return { status: "SUCCESS", data: result, error: null };
} catch (err) {
return { status: "ERROR", data: null, error: _toPublicError(err, "VERIFY_INTEGRITY_FAIL") };
}
});
export const getCashierState = webMethod(Permissions.SiteMember, async (options = {}) => {
const traceId = options.traceId || makeTraceId("cashier-state");
try {
_rateLimitOrThrow("cajas.getCashierState", "cashier", traceId);
await requireCajero(traceId);
const tz = SDK_CONFIG?.TZ || "Europe/Madrid";
const hoyStr = new Date().toLocaleString("sv-SE", { timeZone: tz });
const diaKey = options.diaKey || hoyStr.substring(0, 10);
const items = await _getAllDailyMovements(diaKey);
const projection = _buildCashierProjection(items);
return {
status: "SUCCESS",
data: { diaKey, ...projection },
error: null,
};
} catch (err) {
return { status: "ERROR", data: null, error: _toPublicError(err, "CASHIER_STATE_FAIL") };
}
});
