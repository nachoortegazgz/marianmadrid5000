/*
=============================================================================
MODULE: backend/data.js
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

function _validateServiceCatalog(item, context) {
    if (!item || typeof item !== "object" || context?.suppressHooks === true) return item;

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

    const categoria = _normalizeCatalogReference(item.nombreCategoria || item.categoria);
    if (categoria) {
        item.nombreCategoria = categoria;
    }

    const moneda = _normalizeCatalogReference(item.moneda || item.monedaCatalogo);
    if (moneda && moneda !== (SERVICE_CATALOG?.CURRENCY || "EUR")) {
        throw new Error("SERVICE_VALIDATION: only EUR is supported by this catalog.");
    }

    if (item.precio !== undefined && item.precio !== null && item.precio !== "") {
        const precio = Number(item.precio);
        if (!Number.isFinite(precio) || precio < 0) {
            throw new Error("SERVICE_VALIDATION: precio must be a non-negative number.");
        }
        item.precio = precio;
    }

    const f1 = _readDuration(item, "tiempoFaseUno") || _readDuration(item, "tiempoFase1");
    const gap = _readDuration(item, "tiempoExposicion");
    const f2 = _readDuration(item, "tiempoFaseDos") || _readDuration(item, "tiempoFase2");
    item.tiempoFaseUno = f1;
    item.tiempoExposicion = gap;
    item.tiempoFaseDos = f2;

    const totalCalculado = f1 + gap + f2;
    if (totalCalculado > 0) {
        item.duracionTotal = Math.round(totalCalculado * 100) / 100;
    } else if (!item.duracionTotal || Number(item.duracionTotal) <= 0) {
        item.duracionTotal = 30;
    }

    return item;
}

// -----------------------------------------------------------------------------
// GANCHOS: SERVICIOS_RESERVA
// -----------------------------------------------------------------------------
export function SERVICIOS_RESERVA_beforeInsert(item, context) {
    return _validateServiceCatalog(item, context);
}

export function SERVICIOS_RESERVA_beforeUpdate(item, context) {
    return _validateServiceCatalog(item, context);
}

// -----------------------------------------------------------------------------
// GANCHOS: MAPA_STAFF
// -----------------------------------------------------------------------------
function _validateMapaStaff(item, context) {
    if (!item || typeof item !== "object" || context?.suppressHooks === true) return item;
    const resourceId = String(item.resourceId || "").trim();
    if (!GUID_RE.test(resourceId)) throw new Error("STAFF_VALIDATION: resourceId must be a valid Bookings resource GUID.");
    item.resourceId = resourceId;

    _normalizeBoundedText(item, "nombreVisible", 80);
    if (!item.nombreVisible) throw new Error("STAFF_VALIDATION: nombreVisible is required.");
    _normalizeBoundedText(item, "idMiembroStaff", 120);
    _normalizeBoundedText(item, "email", 254);
    _normalizeBoundedText(item, "scheduleId", 120);
    _normalizeBoundedText(item, "rol", 60);
    if (item.email) item.email = item.email.toLowerCase();
    if (!item.idMiembroStaff && !item.email) throw new Error("STAFF_VALIDATION: idMiembroStaff or email is required.");
    item.activo = item.activo !== false;
    item.updatedAt = new Date();
    return item;
}

export function MAPA_STAFF_beforeInsert(item, context) {
    return _validateMapaStaff(item, context);
}

export function MAPA_STAFF_beforeUpdate(item, context) {
    return _validateMapaStaff(item, context);
}

// -----------------------------------------------------------------------------
// GANCHOS: CitasF2
// -----------------------------------------------------------------------------
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

    if (!item.fechaYmdMadrid && item.startDate) {
        item.fechaYmdMadrid = getMadridLocalStringNoZ(item.startDate).slice(0, 10);
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

    if (!item.fechaYmdMadrid && item.startDate) {
        item.fechaYmdMadrid = getMadridLocalStringNoZ(item.startDate).slice(0, 10);
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

// -----------------------------------------------------------------------------
// GANCHOS: movimientoCaja (Inmutabilidad Fiscal Veri*Factu)
// -----------------------------------------------------------------------------
export function movimientoCaja_beforeInsert(item, context) {
    if (!item || typeof item !== "object") return item;

    if (!SHA256_HEX_RE.test(String(item.hashCadena || "").trim())) {
        throw new Error("FISCAL_VIOLATION: Missing or invalid hashCadena format.");
    }
    if (!SHA256_HEX_RE.test(String(item.prevHash || "").trim())) {
        throw new Error("FISCAL_VIOLATION: Missing or invalid prevHash format.");
    }

    const signatureParts = String(item.firmaDigital || "").trim().split("|");
    if (signatureParts.length !== 2 || !SHA256_HEX_RE.test(signatureParts[0]) || !SHA256_HEX_RE.test(signatureParts[1])) {
        throw new Error("FISCAL_VIOLATION: Invalid firmaDigital format.");
    }
    if (!String(item.numTicketFactura || item.numeroTicket || "").trim()) {
        throw new Error("FISCAL_VIOLATION: Missing numTicketFactura.");
    }

    _normalizeDateField(item, "fechaCreacion", new Date());
    return item;
}

export function movimientoCaja_beforeUpdate(_item) {
    throw new Error("FISCAL_VIOLATION: Direct updates to movimientoCaja are forbidden.");
}

export function movimientoCaja_beforeRemove(_itemId) {
    throw new Error("FISCAL_VIOLATION: Direct removals from movimientoCaja are forbidden.");
}

// -----------------------------------------------------------------------------
// GANCHOS: REGISTROHORARIO (Inmutabilidad Laboral RD-Ley 8/2019)
// -----------------------------------------------------------------------------
export async function REGISTROHORARIO_beforeInsert(item, context) {
    if (!item || typeof item !== "object") return item;

    const staff = await findStaff(item.resourceId);
    if (!staff) {
        throw new Error("INVALID_EMPLOYEE: Employee resourceId is not registered in MAPA_STAFF.");
    }

    const tipoFichaje = String(item.tipoFichaje || "").toUpperCase();
    if (!Object.values(TIPO_FICHAJE).includes(tipoFichaje)) {
        throw new Error(`INVALID_CLOCK_TYPE: Tipo de fichaje invalido "${tipoFichaje}".`);
    }
    if (tipoFichaje === TIPO_FICHAJE.AJUSTE && !String(item.motivoAjuste || "").trim()) {
        throw new Error("INVALID_CLOCK_ADJUSTMENT: motivoAjuste is required for manual adjustments.");
    }

    const now = new Date();
    const fechaHora = _toDate(item.fechaHora) || now;
    if (fechaHora.getTime() > now.getTime() + 60000) {
        throw new Error("INVALID_TIMESTAMP: Future timestamps are forbidden.");
    }

    const madrid = getMadridLocalStringNoZ(fechaHora);
    item.resourceId = staff.resourceId;
    item.resourceName = staff.displayName || staff.nombreVisible;
    item.tipoFichaje = tipoFichaje;
    item.fechaHora = fechaHora;
    item.fechaCreacion = now;
    item.diaKey = madrid.slice(0, 10);
    item.mesKey = madrid.slice(0, 7);
    item.hora = madrid.slice(11, 19);
    return item;
}

export function REGISTROHORARIO_beforeUpdate(_item) {
    throw new Error("LABOR_LOG_VIOLATION: Direct updates to REGISTROHORARIO are forbidden.");
}

export function REGISTROHORARIO_beforeRemove(_itemId) {
    throw new Error("LABOR_LOG_VIOLATION: Direct removals from REGISTROHORARIO are forbidden.");
}

// -----------------------------------------------------------------------------
// GANCHOS: HISTORICOCIERRESZ (Inmutabilidad Cierres Z)
// -----------------------------------------------------------------------------
export function HISTORICOCIERRESZ_beforeUpdate(_item) {
    throw new Error("FISCAL_VIOLATION: Direct updates to HISTORICOCIERRESZ are forbidden.");
}

export function HISTORICOCIERRESZ_beforeRemove(_itemId) {
    throw new Error("FISCAL_VIOLATION: Direct removals from HISTORICOCIERRESZ are forbidden.");
}

// -----------------------------------------------------------------------------
// GANCHOS: cajaActual (Proteccion Singleton)
// -----------------------------------------------------------------------------
export function cajaActual_beforeInsert(item) {
    if (item && typeof item === "object") item._id = CAJA_ACTUAL_ID;
    return item;
}

export function cajaActual_beforeUpdate(item) {
    if (item && typeof item === "object") item._id = CAJA_ACTUAL_ID;
    return item;
}

export function cajaActual_beforeRemove(_itemId) {
    throw new Error("SINGLETON_PROTECTED: Direct deletion of cajaActual is forbidden.");
}
