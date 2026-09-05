/*
 =============================================================================
 MODULE: backend/staff.js
 VERSION: v5003-canonical-mapa-staff
 RESPONSIBILITY: Staff catalog resolution and caching from MapaStaff collection.
 CORRECTIONS: MATRIZ field renames (activo->active, idMiembroStaff fallback).
 STANDARDS: G10 ASCII Strict.
 =============================================================================
 */
import wixData from "wix-data";
import { COLLECTIONS } from "backend/internalConfig";
import { _safeTrim, _looksLikeGuid, _safeEmail } from "public/mmUtils";
import { logger } from "backend/booking/bookingCore";

const log = logger;
const MAPA_STAFF_COL = COLLECTIONS.MAPA_STAFF || "MapaStaff";
const STAFF_CACHE_TTL_MS = 300000;
let staffCache = null;
let staffCacheTime = 0;

async function _loadStaffCatalog() {
  const now = Date.now();
  if (staffCache && now - staffCacheTime < STAFF_CACHE_TTL_MS) return staffCache;
  try {
    const res = await wixData.query(MAPA_STAFF_COL).eq("active", true).limit(100).find({ suppressAuth: true });
    let items = res?.items || [];
    if (!items.length) {
      const fallbackRes = await wixData.query(MAPA_STAFF_COL).eq("activo", true).limit(100).find({ suppressAuth: true }).catch(() => null);
      items = fallbackRes?.items || [];
    }
    staffCache = items.map((s) => ({
      ...s,
      resourceId: _safeTrim(s.resourceId),
      staffMemberId: _safeTrim(s.staffMemberId || s.idMiembroStaff),
      scheduleId: _safeTrim(s.scheduleId),
      email: _safeEmail(s.email),
      displayName: _safeTrim(s.displayName || s.nombreVisible || s.name),
      active: s.active !== false && s.activo !== false,
    }));
    staffCacheTime = now;
    return staffCache;
  } catch (error) {
    log.error("Failed to load MapaStaff", { error: error?.message });
    return staffCache || [];
  }
}

export function clearStaffCache() { staffCache = null; staffCacheTime = 0; }
export async function getAllStaff() { return await _loadStaffCatalog(); }

export async function findStaff(identifier) {
  const cleanId = _safeTrim(identifier);
  if (!cleanId) return null;
  const catalog = await _loadStaffCatalog();
  if (cleanId.toLowerCase() === "any" || cleanId.toLowerCase() === "all") return null;
  const byResourceId = catalog.find((s) => s.resourceId === cleanId);
  if (byResourceId) return byResourceId;
  const byMemberId = catalog.find((s) => s.staffMemberId === cleanId || s.idMiembroStaff === cleanId);
  if (byMemberId) return byMemberId;
  const byScheduleId = catalog.find((s) => s.scheduleId === cleanId);
  if (byScheduleId) return byScheduleId;
  const cleanEmail = _safeEmail(cleanId);
  if (cleanEmail) {
    const byEmail = catalog.find((s) => _safeEmail(s.email) === cleanEmail);
    if (byEmail) return byEmail;
  }
  const byName = catalog.find((s) => _safeTrim(s.displayName || s.nombreVisible || "").toLowerCase() === cleanId.toLowerCase());
  if (byName) return byName;
  return null;
}

export async function findStaffByResourceId(resourceId) {
  const cleanId = _safeTrim(resourceId);
  if (!cleanId || !_looksLikeGuid(cleanId)) return null;
  return await findStaff(cleanId);
}

export async function getStaffDisplayName(resourceId) {
  const staff = await findStaff(resourceId);
  if (!staff) return "";
  return _safeTrim(staff.displayName || staff.nombreVisible || staff.name || "");
}

export async function getStaffScheduleId(resourceId) {
  const staff = await findStaff(resourceId);
  if (!staff) return null;
  return _safeTrim(staff.scheduleId) || null;
}