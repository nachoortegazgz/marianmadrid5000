/*
=============================================================================
MODULE: backend/horario.web.js
RESPONSIBILITY: Employee time tracking and labor registry (No Mutex).
STANDARDS: G10 ASCII Strict, Velo Native Optimized.
=============================================================================
*/

import { webMethod, Permissions } from "wix-web-module";
import wixData from "wix-data";
import { currentMember } from "wix-members-backend";
import { STAFF_DEFAULT_NAME, makeTraceId, _safeTrim, _maskIp, getMadridLocalStringNoZ } from "public/mmUtils";
import { COLLECTIONS, TIPO_FICHAJE } from "backend/internalConfig";
import { BookingError, ERROR_CODES } from "backend/booking/bookingCore";
import { findStaff } from "backend/staff";
import { isAdmin, rateLimiter } from "backend/security";

const REGISTRO_COL = COLLECTIONS.REGISTRO_HORARIO;

async function _getEstadoJornadaInternal(resourceId) {
    const res = await wixData.query(REGISTRO_COL)
        .eq("resourceId", resourceId)
        .ne("tipoFichaje", TIPO_FICHAJE.AJUSTE)
        .descending("fechaHora")
        .limit(1)
        .find({ suppressAuth: true });

    const lastRecord = res.items?.[0] || null;
    if (!lastRecord) return { estadoActual: "INACTIVO", enJornada: false, enPausa: false, ultimoFichaje: null };

    const tipo = String(lastRecord.tipoFichaje || "").toUpperCase();
    let estadoActual = "INACTIVO", enJornada = false, enPausa = false;

    if (tipo === TIPO_FICHAJE.ENTRADA || tipo === TIPO_FICHAJE.PAUSA_FIN) {
        estadoActual = "TRABAJANDO"; enJornada = true;
    } else if (tipo === TIPO_FICHAJE.PAUSA_INICIO) {
        estadoActual = "EN_PAUSA"; enJornada = true; enPausa = true;
    }

    return {
        estadoActual, enJornada, enPausa,
        ultimoFichaje: { fechaHora: lastRecord.fechaHora || lastRecord._createdDate }
    };
}

async function _registrarFichajeInternal(payload, traceId) {
    const resourceId = _safeTrim(payload.resourceId);
    const tipo = String(payload.tipoFichaje || "").trim().toUpperCase();
    
    const estadoJornada = await _getEstadoJornadaInternal(resourceId);
    
    // Debounce de 5 segundos para evitar dobles clics accidentales
    const lastTime = estadoJornada.ultimoFichaje?.fechaHora?.getTime() || 0;
    if (Date.now() - lastTime < 5000) {
        throw new BookingError(ERROR_CODES.RATE_LIMITED, "Por favor, espera unos segundos antes de volver a fichar.");
    }

    if (tipo === TIPO_FICHAJE.ENTRADA && estadoJornada.enJornada) throw new BookingError(ERROR_CODES.INVALID_CLOCK_TYPE, "Turno ya activo.");
    if (tipo === TIPO_FICHAJE.SALIDA && !estadoJornada.enJornada) throw new BookingError(ERROR_CODES.INVALID_CLOCK_TYPE, "No hay turno activo.");

    const ahora = new Date();
    const madridStr = getMadridLocalStringNoZ(ahora);
    
    const record = {
        resourceId,
        resourceName: payload.resourceName || STAFF_DEFAULT_NAME,
        tipoFichaje: tipo,
        diaKey: madridStr.slice(0, 10),
        mesKey: madridStr.slice(0, 7),
        hora: madridStr.slice(11, 19),
        fechaHora: ahora,
        ipDispositivo: _maskIp(payload.ipDispositivo || "SYSTEM"),
        registradoPor: payload.registradoPor || "SELF",
    };

    const inserted = await wixData.insert(REGISTRO_COL, record, { suppressAuth: true });
    return { status: "SUCCESS", data: inserted, error: null };
}