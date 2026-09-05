/*
=============================================================================
MODULE: backend/data.js
VERSION: marianmadrid4003-corrected (v21.1.2-LTS-remediated-cas-hooks-guard)
RESPONSIBILITY: Fast, lightweight CMS data hooks for validation and immutability.
STANDARDS: G10 ASCII Strict (0 non-ASCII characters), Zero Dead Code.
=============================================================================
*/
import { getMadridLocalStringNoZ } from "public/mmUtils";
import {
SINGLETONS,
TIPO_FICHAJE,
CITA_FIELDS,
ESTADO_CITA,
SERVICE_CATALOG,
} from "backend/internalConfig";
import { findStaff } from "backend/staff";
const CAJA_ACTUAL_SINGLETON_ID = SINGLETONS?.CAJA || "CAJA_PRINCIPAL";
const SHA256_HEX_RE = /^[0-9a-f]{64}$/i;
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function _toDate(value) {
if (!value) return null;
const date = value instanceof Date ? value : new Date(value);
return isNaN(date.getTime()) ? null : date;
}
function _normalizeDateField(item, field, fallback) {
const date = _toDate(item[field]);
item[field] = date || fallback;
}
const SERVICE_STATES = new Set(SERVICE_CATALOG?.STATES || ["ACTIVO", "INACTIVO", "BORRADOR"]);
function _normalizeCatalogReference(value) {
const candidate = value && typeof value === "object" ? (value.nombreCategoria || value._id || value.id) : value;
return String(candidate || "").trim().toUpperCase();
}
function _normalizeBoundedText(item, field, maxLength) {
if (item[field] === undefined || item[field] === null) return;
const normalized = String(item[field]).trim();
if (normalized.length > maxLength) {
throw new Error(`SERVICE_VALIDATION: ${field} exceeds the permitted length.`);
}
item[field] = normalized;
}
function _readDuration(item, field) {
const raw = item[field];
if (raw === undefined || raw === null || raw === "") return 0;
const value = Number(raw);
if (!Number.isFinite(value) || value < 0 || value > (SERVICE_CATALOG?.MAX_DURATION_MINUTES || 1440)) {
throw new Error(`SERVICE_VALIDATION: ${field} must be between 0 and ${SERVICE_CATALOG?.MAX_DURATION_MINUTES || 1440}.`);
}
return value;
}
function _validateServiciosCatalogo(item, context) {
if (!item || typeof item !== "object" || context?.suppressHooks === true) return item;
_normalizeBoundedText(item, "title", SERVICE_CATALOG?.MAX_TITLE_LENGTH || 160);
_normalizeBoundedText(item, "tagLine", SERVICE_CATALOG?.MAX_SUMMARY_LENGTH || 120);
_normalizeBoundedText(item, "description", SERVICE_CATALOG?.MAX_DESCRIPTION_LENGTH || 6000);
_normalizeBoundedText(item, "tituloServicio", SERVICE_CATALOG?.MAX_TITLE_LENGTH || 160);
_normalizeBoundedText(item, "resumenCorto", SERVICE_CATALOG?.MAX_SUMMARY_LENGTH || 120);
_normalizeBoundedText(item, "descripcionLarga", SERVICE_CATALOG?.MAX_DESCRIPTION_LENGTH || 6000);
const estado = _normalizeCatalogReference(item.estado);
if (estado) {
if (!SERVICE_STATES.has(estado)) {
throw new Error("SERVICE_VALIDATION: estado must be selected from the approved catalog.");
}
item.estado = estado;
}
const categoria = _normalizeCatalogReference(item.categoryName || item.nombreCategoria || item.categoria);
if (categoria) {
item.categoryName = categoria;
item.nombreCategoria = categoria;
}
const moneda = _normalizeCatalogReference(item.moneda || item.monedaCatalogo);
if (moneda && moneda !== (SERVICE_CATALOG?.CURRENCY || "EUR")) {
throw new Error("SERVICE_VALIDATION: only EUR is supported by this catalog.");
}
if (item.price !== undefined && item.price !== null && item.price !== "") {
const precio = Number(item.price);
if (!Number.isFinite(precio) || precio < 0) {
throw new Error("SERVICE_VALIDATION: precio must be a non-negative number.");
}
item.price = precio;
item.precio = precio;
}
const f1 = _readDuration(item, "tiempoFaseUno") || _readDuration(item, "tiempoFase1");
const gap = _readDuration(item, "tiempoExposicion");
const f2 = _readDuration(item, "tiempoFaseDos") || _readDuration(item, "tiempoFase2");
item.tiempoFaseUno = f1;
item.exposureDuration = gap;
item.tiempoFaseDos = f2;
const totalCalculado = f1 + gap + f2;
if (totalCalculado > 0) {
item.totalDuration = Math.round(totalCalculado * 100) / 100;
} else if (!item.totalDuration || Number(item.totalDuration) <= 0) {
item.totalDuration = 30;
}
return item;
}
export function ServiciosCatalogo_beforeInsert(item, context) {
return _validateServiciosCatalogo(item, context);
}
export function ServiciosCatalogo_beforeUpdate(item, context) {
return _validateServiciosCatalogo(item, context);
}
function _validateMapaStaff(item, context) {
if (!item || typeof item !== "object" || context?.suppressHooks === true) return item;
const resourceId = String(item.resourceId || "").trim();
if (!GUID_RE.test(resourceId)) throw new Error("STAFF_VALIDATION: resourceId must be a valid Bookings resource GUID.");
item.resourceId = resourceId;
_normalizeBoundedText(item, "displayName", 80);
_normalizeBoundedText(item, "nombreVisible", 80);
if (!item.displayName && !item.nombreVisible) throw new Error("STAFF_VALIDATION: displayName is required.");
_normalizeBoundedText(item, "idMiembroStaff", 120);
_normalizeBoundedText(item, "email", 254);
_normalizeBoundedText(item, "scheduleId", 120);
_normalizeBoundedText(item, "rol", 60);
if (item.email) item.email = item.email.toLowerCase();
if (!item.staffMemberId && !item.email) throw new Error("STAFF_VALIDATION: idMiembroStaff or email is required.");
item.active = item.active !== false;
item.updatedAt = new Date();
return item;
}
export function MapaStaff_beforeInsert(item, context) {
return _validateMapaStaff(item, context);
}
export function MapaStaff_beforeUpdate(item, context) {
return _validateMapaStaff(item, context);
}
export function SERVICIOS_CATALOGO_beforeInsert(item, context) {
return _validateServiciosCatalogo(item, context);
}
export function SERVICIOS_CATALOGO_beforeUpdate(item, context) {
return _validateServiciosCatalogo(item, context);
}
export function MAPA_STAFF_beforeInsert(item, context) {
return _validateMapaStaff(item, context);
}
export function MAPA_STAFF_beforeUpdate(item, context) {
return _validateMapaStaff(item, context);
}
export function CitasF2_beforeInsert(item, context) {
if (!item || typeof item !== "object" || context?.suppressHooks === true) return item;
const bookingId = String(item.bookingId || "").trim();
if (!bookingId) throw new Error("CITAS_VIOLATION: Missing bookingId.");
item.bookingId = bookingId;
const now = new Date();
_normalizeDateField(item, "startDate", null);
_normalizeDateField(item, "endDate", null);
_normalizeDateField(item, "fechaCreacion", now);
_normalizeDateField(item, "fechaActualizacion", now);
if (!item.dateYmd && item.startDate) {
item.dateYmd = getMadridLocalStringNoZ(item.startDate).slice(0, 10);
}
item[CITA_FIELDS.STATUS] = String(item[CITA_FIELDS.STATUS] || ESTADO_CITA.CONFIRMED).toUpperCase();
item[CITA_FIELDS.STATUS_PAGO] = String(item[CITA_FIELDS.STATUS_PAGO] || "UNPAID").toUpperCase();
item.version = Number(item.version || 1);
return item;
}
export function CitasF2_beforeUpdate(item, context) {
if (!item || typeof item !== "object" || context?.suppressHooks === true) return item;
const bookingId = String(item.bookingId || "").trim();
if (!bookingId) throw new Error("CITAS_VIOLATION: Missing bookingId.");
item.bookingId = bookingId;
const now = new Date();
_normalizeDateField(item, "startDate", null);
_normalizeDateField(item, "endDate", null);
_normalizeDateField(item, "fechaActualizacion", now);
if (!item.dateYmd && item.startDate) {
item.dateYmd = getMadridLocalStringNoZ(item.startDate).slice(0, 10);
}
if (item[CITA_FIELDS.STATUS]) {
item[CITA_FIELDS.STATUS] = String(item[CITA_FIELDS.STATUS]).toUpperCase();
}
if (item[CITA_FIELDS.STATUS_PAGO]) {
item[CITA_FIELDS.STATUS_PAGO] = String(item[CITA_FIELDS.STATUS_PAGO]).toUpperCase();
}
if (item.version !== undefined && item.version !== null) {
item.version = Number(item.version) || 1;
}
return item;
}
export function MovimientosCaja_beforeInsert(item, context) {
if (!item || typeof item !== "object") return item;
if (!SHA256_HEX_RE.test(String(item.currentRecordHash || "").trim())) {
throw new Error("FISCAL_VIOLATION: Missing or invalid hashCadena format.");
}
if (!SHA256_HEX_RE.test(String(item.previousRecordHash || "").trim())) {
throw new Error("FISCAL_VIOLATION: Missing or invalid prevHash format.");
}
const signatureParts = String(item.digitalSignature || "").trim().split("|");
if (signatureParts.length !== 2 || !SHA256_HEX_RE.test(signatureParts[0]) || !SHA256_HEX_RE.test(signatureParts[1])) {
throw new Error("FISCAL_VIOLATION: Invalid firmaDigital format.");
}
if (!String(item.invoiceNumber || item.numeroTicket || "").trim()) {
throw new Error("FISCAL_VIOLATION: Missing numTicketFactura.");
}
_normalizeDateField(item, "fechaCreacion", new Date());
return item;
}
export function MovimientosCaja_beforeUpdate(_item) {
throw new Error("FISCAL_VIOLATION: Direct updates to movimientoCaja are forbidden.");
}
export function MovimientosCaja_beforeRemove(_itemId) {
throw new Error("FISCAL_VIOLATION: Direct removals from movimientoCaja are forbidden.");
}
export async function RegistrosHorariosStaff_beforeInsert(item, context) {
if (!item || typeof item !== "object") return item;
const staff = await findStaff(item.resourceId);
if (!staff) {
throw new Error("INVALID_EMPLOYEE: Employee resourceId is not registered in MAPA_STAFF.");
}
const tipoFichaje = String(item.clockEventType || "").toUpperCase();
if (!Object.values(TIPO_FICHAJE).includes(tipoFichaje)) {
throw new Error(`INVALID_CLOCK_TYPE: Tipo de fichaje invalido "${tipoFichaje}".`);
}
if (tipoFichaje === TIPO_FICHAJE.AJUSTE && !String(item.adjustmentReason || "").trim()) {
throw new Error("INVALID_CLOCK_ADJUSTMENT: motivoAjuste is required for manual adjustments.");
}
const now = new Date();
const recordedAt = _toDate(item.recordedAt || item.fechaHora) || now;
if (recordedAt.getTime() > now.getTime() + 60000) {
throw new Error("INVALID_TIMESTAMP: Future timestamps are forbidden.");
}
const madrid = getMadridLocalStringNoZ(recordedAt);
item.resourceId = staff.resourceId;
item.resourceName = staff.displayName || staff.nombreVisible;
item.clockEventType = tipoFichaje;
item.recordedAt = recordedAt;
item.recordedTime = madrid.slice(11, 19);
item.dayKey = madrid.slice(0, 10);
item.monthKey = madrid.slice(0, 7);
item.fechaHora = recordedAt;
item.fechaCreacion = now;
item.diaKey = item.dayKey;
item.mesKey = item.monthKey;
item.hora = item.recordedTime;
return item;
}
export function RegistrosHorariosStaff_beforeUpdate(_item) {
throw new Error("LABOR_LOG_VIOLATION: Direct updates to REGISTROHORARIO are forbidden.");
}
export function RegistrosHorariosStaff_beforeRemove(_itemId) {
throw new Error("LABOR_LOG_VIOLATION: Direct removals from REGISTROHORARIO are forbidden.");
}
export function HistoricoCierresZ_beforeUpdate(_item) {
throw new Error("FISCAL_VIOLATION: Direct updates to HISTORICOCIERRESZ are forbidden.");
}
export function HistoricoCierresZ_beforeRemove(_itemId) {
throw new Error("FISCAL_VIOLATION: Direct removals from HISTORICOCIERRESZ are forbidden.");
}
export function CajaActual_beforeInsert(item) {
if (item && typeof item === "object") item._id = CAJA_ACTUAL_SINGLETON_ID;
return item;
}
export function CajaActual_beforeUpdate(item) {
if (item && typeof item === "object") item._id = CAJA_ACTUAL_SINGLETON_ID;
return item;
}
export function CajaActual_beforeRemove(_itemId) {
throw new Error("SINGLETON_PROTECTED: Direct deletion of cajaActual is forbidden.");
}
export const MOVIMIENTOS_CAJA_beforeInsert = MovimientosCaja_beforeInsert;
export const MOVIMIENTOS_CAJA_beforeUpdate = MovimientosCaja_beforeUpdate;
export const MOVIMIENTOS_CAJA_beforeRemove = MovimientosCaja_beforeRemove;
export const REGISTROS_HORARIOS_STAFF_beforeInsert = RegistrosHorariosStaff_beforeInsert;
export const REGISTROS_HORARIOS_STAFF_beforeUpdate = RegistrosHorariosStaff_beforeUpdate;
export const REGISTROS_HORARIOS_STAFF_beforeRemove = RegistrosHorariosStaff_beforeRemove;
export const CIERRES_Z_beforeUpdate = HistoricoCierresZ_beforeUpdate;
export const CIERRES_Z_beforeRemove = HistoricoCierresZ_beforeRemove;
export const CAJA_ACTUAL_beforeInsert = CajaActual_beforeInsert;
export const CAJA_ACTUAL_beforeUpdate = CajaActual_beforeUpdate;
export const CAJA_ACTUAL_beforeRemove = CajaActual_beforeRemove;