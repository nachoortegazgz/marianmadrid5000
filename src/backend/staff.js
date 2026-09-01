/*
=============================================================================
MODULE: backend/staff.js
RESPONSIBILITY: Staff resolution from MAPA_STAFF collection.
STANDARDS: G10 ASCII Strict, 100% Velo Native, No RAM Caching.
=============================================================================
*/

import wixData from "wix-data";
import { COLLECTIONS } from "backend/internalConfig";
import { _safeTrim, _looksLikeGuid } from "public/mmUtils";

const STAFF_COL = COLLECTIONS.MAPA_STAFF;

function _mapStaffItem(item) {
    if (!item) return null;
    return {
        resourceId: _safeTrim(item.resourceId),
        displayName: _safeTrim(item.nombreVisible || item.displayName || "ESTILISTA"),
        nombreVisible: _safeTrim(item.nombreVisible || item.displayName || "ESTILISTA"),
        email: _safeTrim(item.email).toLowerCase(),
        memberId: _safeTrim(item.idMiembroStaff || item.memberId),
        idMiembroStaff: _safeTrim(item.idMiembroStaff || item.memberId),
        scheduleId: _safeTrim(item.scheduleId || item.idHorario),
        rol: _safeTrim(item.rol || "ESTILISTA"),
        activo: item.activo !== false,
    };
}

export async function findStaff(identifier) {
    const clean = _safeTrim(identifier);
    if (!clean) return null;

    const lower = clean.toLowerCase();
    
    // Consulta optimizada usando .or() para buscar por ID, Email o MemberID en una sola pasada
    const query = wixData.query(STAFF_COL)
        .eq("resourceId", clean)
        .or(wixData.query(STAFF_COL).eq("email", lower))
        .or(wixData.query(STAFF_COL).eq("idMiembroStaff", clean))
        .or(wixData.query(STAFF_COL).eq("memberId", clean));

    const res = await query.limit(1).find({ suppressAuth: true, consistentRead: false });
    return _mapStaffItem(res.items[0]);
}

export async function getAllStaff() {
    const res = await wixData.query(STAFF_COL)
        .eq("activo", true)
        .limit(100)
        .find({ suppressAuth: true, consistentRead: false });
        
    return res.items.map(_mapStaffItem);
}

export async function resolveStaffResourceIds(personalDisponible) {
    const items = Array.isArray(personalDisponible) ? personalDisponible : [];
    const resourceIds = [];
    for (const entry of items) {
        const candidate = typeof entry === "object" && entry !== null ? (entry.resourceId || entry.id || entry._id) : entry;
        const clean = _safeTrim(candidate);
        if (_looksLikeGuid(clean)) {
            resourceIds.push(clean);
        } else {
            const found = await findStaff(clean);
            if (found?.resourceId) resourceIds.push(found.resourceId);
        }
    }
    return Array.from(new Set(resourceIds)).sort();
}

// Mantenemos la firma de la función para no romper dependencias, pero ya no hace nada.
export function clearStaffCache() {
    return true; 
}