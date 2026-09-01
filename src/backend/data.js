/*
=============================================================================
MODULE: backend/data.js
RESPONSIBILITY: CMS data hooks for canonical dates, immutable fiscal records,
                immutable labor records, and optimistic versioning for CitasF2.
STANDARDS: G10 ASCII Strict (0 non-ASCII characters).
=============================================================================
*/

import wixData from "wix-data";
import { getMadridLocalStringNoZ, _extractRelationalId } from "public/mmUtils";
import {
    COLLECTIONS,
    SINGLETONS,
    TIPO_FICHAJE,
    CITA_FIELDS,
    ESTADO_CITA,
    SERVICE_CATALOG,
} from "backend/internalConfig";
import { clearStaffCache, findStaff } from "backend/staff";
import { enqueueBookingsServiceSync } from "backend/bookingsServiceSync";

const CAJA_ACTUAL_ID = SINGLETONS?.CAJA || "CAJA_PRINCIPAL";
const DUAL_CACHE_COL = COLLECTIONS.DUAL_CACHE;
const DAYS_CACHE_COL = COLLECTIONS.DAYS_CACHE;
const SLOTS_CACHE_COL = COLLECTIONS.SLOTS_CACHE;
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

    const total = f1 + gap + f2;
    if (total > (SERVICE_CATALOG?.MAX_DURATION_MINUTES || 1440)) {
        throw new Error("SERVICE_VALIDATION: total duration is invalid.");
    }
    item.duracionTotal = Math.round(total * 100) / 100;
    return item;
}

export function SERVICIOS_RESERVA_beforeInsert(item, context) {
    return _validateServiceCatalog(item, context);
}

export function SERVICIOS_RESERVA_beforeUpdate(item, context) {
    return _validateServiceCatalog(item, context);
}

async function _removeCollectionItemsByServiceId(collectionId, fields, serviceId) {
    const cleanServiceId = _extractRelationalId(serviceId);
    if (!GUID_RE.test(cleanServiceId)) return;

    const matches = await Promise.allSettled(
        fields.map((field) => wixData.query(collectionId).eq(field, cleanServiceId).limit(1000).find({ suppressAuth: true }))
    );
    const ids = new Set(
        matches
            .filter((result) => result.status === "fulfilled")
            .flatMap((result) => result.value?.items || [])
            .map((item) => item?._id)
            .filter(Boolean)
    );
    await Promise.allSettled(
        [...ids].map((itemId) => wixData.remove(collectionId, itemId, { suppressAuth: true }))
    );
}

async function _invalidateServiceCaches(serviceId) {
    await Promise.allSettled([
        _removeCollectionItemsByServiceId(DUAL_CACHE_COL, ["serviceId", "phaseOneServiceId", "idServicioFaseUno"], serviceId),
        _removeCollectionItemsByServiceId(DAYS_CACHE_COL, ["serviceId", "phaseOneServiceId", "idServicioFaseUno"], serviceId),
        _removeCollectionItemsByServiceId(SLOTS_CACHE_COL, ["phaseOneServiceId", "idServicioFaseUno"], serviceId),
    ]);
}

async function _enqueueBookingsServiceSyncSafely(item) {
    if (item?.bookingsSyncEnabled !== true) return null;
    try {
        return await enqueueBookingsServiceSync(item);
    } catch (_) {
        return null;
    }
}

export async function SERVICIOS_RESERVA_afterInsert(item, context) {
    if (!item || context?.suppressHooks === true) return item;
    await _enqueueBookingsServiceSyncSafely(item);
    return item;
}

export async function SERVICIOS_RESERVA_afterUpdate(item, context) {
    if (!item || context?.suppressHooks === true) return item;
    const s1 = item.idServicio || item.serviceId;
    const s2 = item.idServicioFaseDos || item.linkFases;
    await _invalidateServiceCaches(s1);
    if (s2) await _invalidateServiceCaches(s2);
    await _enqueueBookingsServiceSyncSafely(item);
    return item;
}

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
    if (item.activo !== undefined && typeof item.activo !== "boolean") {
        throw new Error("STAFF_VALIDATION: activo must be boolean.");
    }
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

export function MAPA_STAFF_afterInsert(item) {
    clearStaffCache();
    return item;
}

export function MAPA_STAFF_afterUpdate(item) {
    clearStaffCache();
    return item;
}

export function MAPA_STAFF_afterRemove(itemId) {
    clearStaffCache();
    return itemId;
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
        item[CITA_FIELDS.STATUS