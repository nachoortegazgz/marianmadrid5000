/*
=============================================================================
MODULE: backend/staff.js
VERSION: v5001-optimized (base v19.6.2-canonical-staff-labels)
RESPONSIBILITY: Staff catalog resolution from MAPA_STAFF collection.
STANDARDS: G10 ASCII Strict (0 non-ASCII characters).
=============================================================================
*/
import wixData from "wix-data";
import { COLLECTIONS } from "backend/internalConfig";
import { makeTraceId, _safeTrim, _looksLikeGuid, _safeEmail } from "public/mmUtils";
import { logger } from "backend/booking/bookingCore";
const log = logger;
const MAPA_STAFF_COL = COLLECTIONS.MAPA_STAFF;
const STAFF_CACHE_TTL_MS = 300000;
let staffCache = null;
let staffCacheTime = 0;
async function _loadStaffCatalog() {
const now = Date.now();
if (staffCache && now - staffCacheTime < STAFF_CACHE_TTL_MS) return staffCache;
try {
const res = await wixData
.query(MAPA_STAFF_COL)
.eq("activo", true)
.limit(100)
.find({ suppressAuth: true });
staffCache = res?.items || [];
staffCacheTime = now;
return staffCache;
} catch (error) {
log.error("Failed to load MAPA_STAFF", { error: error?.message });
return staffCache || [];
}
}
export function clearStaffCache() {
staffCache = null;
staffCacheTime = 0;
}
export async function getAllStaff() {
return await _loadStaffCatalog();
}
export async function findStaff(identifier) {
const cleanId = _safeTrim(identifier);
if (!cleanId) return null;
const catalog = await _loadStaffCatalog();
if (cleanId.toLowerCase() === "any" || cleanId.toLowerCase() === "all") return null;
const byResourceId = catalog.find((s) => s.resourceId === cleanId);
if (byResourceId) return byResourceId;
const byMemberId = catalog.find((s) => s.idMiembroStaff === cleanId);
if (byMemberId) return byMemberId;
const byScheduleId = catalog.find((s) => s.scheduleId === cleanId);
if (byScheduleId) return byScheduleId;
const cleanEmail = _safeEmail(cleanId);
if (cleanEmail) {
const byEmail = catalog.find((s) => _safeEmail(s.email) === cleanEmail);
if (byEmail) return byEmail;
}
const byName = catalog.find((s) => {
const displayName = _safeTrim(s.displayName || s.nombreVisible || "").toLowerCase();
return displayName === cleanId.toLowerCase();
});
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