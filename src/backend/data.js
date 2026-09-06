/*
 =============================================================================
 MODULE: backend/data.js
 VERSION: v5003-canonical-data-hooks
 RESPONSIBILITY: Native Wix Data CMS hooks for schema validation, data integrity,
                 immutability guards for fiscal/labor ledgers, singleton protection.
 CORRECTIONS: MATRIZ field renames, dual-field sync, SIF immutability hooks.
 STANDARDS: G10 ASCII Strict.
 =============================================================================
 */
import { getMadridLocalStringNoZ } from "public/mmUtils";
import { SINGLETONS, TIPO_FICHAJE, CITA_FIELDS, ESTADO_CITA, SERVICE_CATALOG } from "backend/internalConfig";
import { findStaff } from "backend/staff";

const CAJA_ACTUAL_ID = SINGLETONS?.CAJA || "CAJA_PRINCIPAL";
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
  if (normalized.length > maxLength) throw new Error(`SERVICE_VALIDATION: ${field} exceeds permitted length.`);
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

// --- SERVICIOS_CATALOGO ---
function _validateServiceCatalog(item, context) {
  if (!item || typeof item !== "object" || context?.suppressHooks === true) return item;
  _normalizeBoundedText(item, "title", SERVICE_CATALOG?.MAX_TITLE_LENGTH || 160);
  _normalizeBoundedText(item, "tagLine", SERVICE_CATALOG?.MAX_SUMMARY_LENGTH || 120);
  _normalizeBoundedText(item, "description", SERVICE_CATALOG?.MAX_DESCRIPTION_LENGTH || 6000);
  const rawState = item.status || (item.hidden ? "INACTIVO" : "ACTIVO");
  const estado = _normalizeCatalogReference(rawState);
  if (estado && SERVICE_STATES.has(estado)) { item.status = estado; }
  const rawPrice = item.price;
  if (rawPrice !== undefined && rawPrice !== null && rawPrice !== "") {
    const precio = Number(rawPrice);
    if (!Number.isFinite(precio) || precio < 0) throw new Error("SERVICE_VALIDATION: price must be a non-negative number.");
    item.price = precio;
  }
  const f1 = _readDuration(item, "phase1Duration");
  const gap = _readDuration(item, "exposureDuration");
  const f2 = _readDuration(item, "phase2Duration");
  item.phase1Duration = f1; item.exposureDuration = gap; item.phase2Duration = f2;
  const totalCalculado = f1 + gap + f2;
  if (totalCalculado > 0) item.totalDuration = Math.round(totalCalculado * 100) / 100;
  else if (!item.totalDuration || Number(item.totalDuration) <= 0) item.totalDuration = 30;
  return item;
}

export function ServiciosCatalogo_beforeInsert(item, context) { return _validateServiceCatalog(item, context); }
export function ServiciosCatalogo_beforeUpdate(item, context) { return _validateServiceCatalog(item, context); }
export function SERVICIOS_RESERVA_beforeInsert(item, context) { return _validateServiceCatalog(item, context); }
export function SERVICIOS_RESERVA_beforeUpdate(item, context) { return _validateServiceCatalog(item, context); }

// --- MAPA_STAFF ---
function _validateMapaStaff(item, context) {
  if (!item || typeof item !== "object" || context?.suppressHooks === true) return item;
  const resourceId = String(item.resourceId || "").trim();
  if (!GUID_RE.test(resourceId)) throw new Error("STAFF_VALIDATION: resourceId must be a valid Bookings resource GUID.");
  item.resourceId = resourceId;
  _normalizeBoundedText(item, "displayName", 80);
  _normalizeBoundedText(item, "staffMemberId", 120);
  _normalizeBoundedText(item, "email", 254);
  _normalizeBoundedText(item, "scheduleId", 120);
  if (item.email) item.email = String(item.email).trim().toLowerCase();
  item.active = item.active !== false;
  item._updatedDate = new Date();
  return item;
}

export function MapaStaff_beforeInsert(item, context) { return _validateMapaStaff(item, context); }
export function MapaStaff_beforeUpdate(item, context) { return _validateMapaStaff(item, context); }
export function MAPA_STAFF_beforeInsert(item, context) { return _validateMapaStaff(item, context); }
export function MAPA_STAFF_beforeUpdate(item, context) { return _validateMapaStaff(item, context); }

// --- CITAS_F2 ---
function _validateCitasF2(item, context) {
  if (!item || typeof item !== "object" || context?.suppressHooks === true) return item;
  const bookingId = String(item.bookingId || item._id || "").trim();
  if (!bookingId) throw new Error("CITAS_VIOLATION: Missing bookingId.");
  item.bookingId = bookingId;
  const now = new Date();
  _normalizeDateField(item, "startDate", null);
  _normalizeDateField(item, "endDate", null);
  // FIX: dateYmd is canonical (fechaYmdMadrid removed)
  if (!item.dateYmd && item.startDate) item.dateYmd = getMadridLocalStringNoZ(item.startDate).slice(0, 10);
  item.status = String(item.status || ESTADO_CITA.CONFIRMED).toUpperCase();
  item.paymentStatus = String(item.paymentStatus || "UNPAID").toUpperCase();
  item.revision = Number(item.revision || 1);
  return item;
}

export function CitasF2_beforeInsert(item, context) { return _validateCitasF2(item, context); }
export function CitasF2_beforeUpdate(item, context) { return _validateCitasF2(item, context); }

// --- CAJA_ACTUAL (Singleton) ---
export function CajaActual_beforeInsert(item) { if (item && typeof item === "object") item._id = CAJA_ACTUAL_ID; return item; }
export function CajaActual_beforeUpdate(item) { if (item && typeof item === "object") item._id = CAJA_ACTUAL_ID; return item; }
export function CajaActual_beforeRemove() { throw new Error("SINGLETON_PROTECTED: Direct deletion of CajaActual is forbidden."); }
export function cajaActual_beforeInsert(item) { return CajaActual_beforeInsert(item); }
export function cajaActual_beforeUpdate(item) { return CajaActual_beforeUpdate(item); }
export function cajaActual_beforeRemove() { return CajaActual_beforeRemove(); }

// --- MOVIMIENTOS_CAJA (Inmutabilidad Veri*factu) ---
// FIX: Valida currentRecordHash Y previousRecordHash (MATRIZ)
export function MovimientosCaja_beforeInsert(item) {
  if (!item || typeof item !== "object") return item;
  const hashActual = String(item.currentRecordHash || item.hashCadena || "").trim();
  const hashPrevio = String(item.previousRecordHash || item.prevHash || "").trim();
  if (!SHA256_HEX_RE.test(hashActual)) throw new Error("FISCAL_VIOLATION: Missing or invalid currentRecordHash format.");
  if (!SHA256_HEX_RE.test(hashPrevio)) throw new Error("FISCAL_VIOLATION: Missing or invalid previousRecordHash format.");
  const sig = String(item.digitalSignature || item.firmaDigital || "").trim();
  const parts = sig.split("|");
  if (parts.length !== 2 || !SHA256_HEX_RE.test(parts[0]) || !SHA256_HEX_RE.test(parts[1])) throw new Error("FISCAL_VIOLATION: Invalid digitalSignature format.");
  if (!String(item.invoiceNumber || item.numTicketFactura || "").trim()) throw new Error("FISCAL_VIOLATION: Missing invoiceNumber.");
  _normalizeDateField(item, "registeredAt", new Date());
  return item;
}
export function MovimientosCaja_beforeUpdate() { throw new Error("FISCAL_VIOLATION: Direct updates to MovimientosCaja are forbidden."); }
export function MovimientosCaja_beforeRemove() { throw new Error("FISCAL_VIOLATION: Direct removals from MovimientosCaja are forbidden."); }
export function movimientoCaja_beforeInsert(item) { return MovimientosCaja_beforeInsert(item); }
export function movimientoCaja_beforeUpdate() { return MovimientosCaja_beforeUpdate(); }
export function movimientoCaja_beforeRemove() { return MovimientosCaja_beforeRemove(); }

// --- CIERRES_Z (Inmutabilidad) ---
export function CierresZ_beforeUpdate() { throw new Error("FISCAL_VIOLATION: Direct updates to CierresZ are forbidden."); }
export function CierresZ_beforeRemove() { throw new Error("FISCAL_VIOLATION: Direct removals from CierresZ are forbidden."); }
export function HISTORICOCIERRESZ_beforeUpdate() { return CierresZ_beforeUpdate(); }
export function HISTORICOCIERRESZ_beforeRemove() { return CierresZ_beforeRemove(); }

// --- EVENTOS_SISTEMA_FACTURACION (RD 1007/2023) ---
export function EventosSistemaFacturacion_beforeUpdate() { throw new Error("SIF_VIOLATION: Direct updates forbidden by RD 1007/2023."); }
export function EventosSistemaFacturacion_beforeRemove() { throw new Error("SIF_VIOLATION: Direct removals forbidden by RD 1007/2023."); }

// --- REGISTROS_HORARIOS_STAFF (Art. 34.9 ET) ---
export async function RegistrosHorariosStaff_beforeInsert(item) {
  if (!item || typeof item !== "object") return item;
  const staff = await findStaff(item.resourceId);
  if (!staff) throw new Error("INVALID_EMPLOYEE: Employee resourceId is not registered in MapaStaff.");
  const tipo = String(item.clockEventType || "").toUpperCase();
  if (!Object.values(TIPO_FICHAJE).includes(tipo)) throw new Error(`INVALID_CLOCK_TYPE: "${tipo}".`);
  if (tipo === TIPO_FICHAJE.AJUSTE && !String(item.adjustmentReason || "").trim()) throw new Error("INVALID_CLOCK_ADJUSTMENT: adjustmentReason is required.");
  const now = new Date();
  const fechaHora = _toDate(item.recordedAt) || now;
  if (fechaHora.getTime() > now.getTime() + 60000) throw new Error("INVALID_TIMESTAMP: Future timestamps are forbidden.");
  const madrid = getMadridLocalStringNoZ(fechaHora);
  item.resourceId = staff.resourceId;
  item.resourceName = staff.displayName;
  item.clockEventType = tipo;
  item.recordedAt = fechaHora;
  item.recordedTime = madrid.slice(11, 19);
  item.dayKey = madrid.slice(0, 10);
  item.monthKey = madrid.slice(0, 7);
  item._createdDate = now;
  return item;
}
export function RegistrosHorariosStaff_beforeUpdate() { throw new Error("LABOR_LOG_VIOLATION: Direct updates forbidden by Art. 34.9 ET."); }
export function RegistrosHorariosStaff_beforeRemove() { throw new Error("LABOR_LOG_VIOLATION: Direct removals forbidden by Art. 34.9 ET."); }
export function REGISTROHORARIO_beforeInsert(item) { return RegistrosHorariosStaff_beforeInsert(item); }
export function REGISTROHORARIO_beforeUpdate() { return RegistrosHorariosStaff_beforeUpdate(); }
export function REGISTROHORARIO_beforeRemove() { return RegistrosHorariosStaff_beforeRemove(); }