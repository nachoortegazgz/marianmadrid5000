/*
=============================================================================
MODULE: backend/security.js
VERSION: v5001-optimized (base v19.5.1-rbac-ssot-cleanup)
RESPONSIBILITY: RBAC authorization engine and rate limiter.
STANDARDS: G10 ASCII Strict (0 non-ASCII characters).
=============================================================================
*/
import { getSecret } from "wix-secrets-backend";
import { currentMember } from "wix-members-backend";
import { SECRETS } from "backend/mmSecrets";
import { COLLAB_ROLES } from "backend/internalConfig";
import { makeTraceId, _safeEmail, _safeTrim } from "public/mmUtils";
import { logger, ERROR_CODES, createBookingError } from "backend/booking/bookingCore";
const log = logger;
const ROLE_CACHE_TTL_MS = 300000;
let cachedAdminEmails = null;
let cachedCajeroEmails = null;
let adminCacheTime = 0;
let cajeroCacheTime = 0;
const rateLimitCache = new Map();
const RATE_LIMIT_WINDOW_MS = 5000;
const RATE_LIMIT_MAX_REQUESTS = 20;
async function _getCachedAdminEmails() {
const now = Date.now();
if (cachedAdminEmails && now - adminCacheTime < ROLE_CACHE_TTL_MS) return cachedAdminEmails;
const raw = await getSecret(SECRETS.ADMIN_EMAILS).catch(() => "");
cachedAdminEmails = raw
.split(",")
.map((e) => _safeEmail(e))
.filter(Boolean);
adminCacheTime = now;
return cachedAdminEmails;
}
async function _getCachedCajeroEmails() {
const now = Date.now();
if (cachedCajeroEmails && now - cajeroCacheTime < ROLE_CACHE_TTL_MS) return cachedCajeroEmails;
const raw = await getSecret(SECRETS.CAJERO_EMAILS).catch(() => "");
cachedCajeroEmails = raw
.split(",")
.map((e) => _safeEmail(e))
.filter(Boolean);
cajeroCacheTime = now;
return cachedCajeroEmails;
}
export function rateLimiter({ surface, key }, maxRequests, windowMs) {
const cleanKey = `${surface || "global"}:${key || "anon"}`;
const now = Date.now();
const max = maxRequests || RATE_LIMIT_MAX_REQUESTS;
const window = windowMs || RATE_LIMIT_WINDOW_MS;
const entry = rateLimitCache.get(cleanKey);
if (!entry || now - entry.windowStart > window) {
rateLimitCache.set(cleanKey, { count: 1, windowStart: now });
return { allowed: true, retryAfter: 0 };
}
entry.count++;
if (entry.count > max) {
const retryAfter = window - (now - entry.windowStart);
return { allowed: false, retryAfter: Math.max(0, retryAfter) };
}
return { allowed: true, retryAfter: 0 };
}
export async function isAdmin(traceId) {
const activeTraceId = traceId || makeTraceId("rbac");
try {
const member = await currentMember.getMember({ fieldsets: ["FULL"] }).catch(() => null);
if (!member) return false;
const memberEmail = _safeEmail(member.loginEmail);
const adminEmails = await _getCachedAdminEmails();
if (adminEmails.includes(memberEmail)) return true;
const roles = member.roles || [];
const isAdminRole = roles.some((r) => {
const roleName = _safeTrim(r.name || r.title || r);
return roleName.toUpperCase() === COLLAB_ROLES.ADMIN;
});
return isAdminRole;
} catch (error) {
log.error("isAdmin check failed", { traceId: activeTraceId, error: error?.message });
return false;
}
}
export async function isCajero(traceId) {
const activeTraceId = traceId || makeTraceId("rbac");
try {
const member = await currentMember.getMember({ fieldsets: ["FULL"] }).catch(() => null);
if (!member) return false;
const memberEmail = _safeEmail(member.loginEmail);
const cajeroEmails = await _getCachedCajeroEmails();
if (cajeroEmails.includes(memberEmail)) return true;
const adminEmails = await _getCachedAdminEmails();
if (adminEmails.includes(memberEmail)) return true;
const roles = member.roles || [];
const isCajeroRole = roles.some((r) => {
const roleName = _safeTrim(r.name || r.title || r);
return [COLLAB_ROLES.ADMIN, COLLAB_ROLES.GESTION].includes(roleName.toUpperCase());
});
return isCajeroRole;
} catch (error) {
log.error("isCajero check failed", { traceId: activeTraceId, error: error?.message });
return false;
}
}
export async function isStaffCollaborator(traceId) {
const activeTraceId = traceId || makeTraceId("rbac");
try {
const member = await currentMember.getMember({ fieldsets: ["FULL"] }).catch(() => null);
if (!member) return false;
const memberEmail = _safeEmail(member.loginEmail);
const adminEmails = await _getCachedAdminEmails();
if (adminEmails.includes(memberEmail)) return true;
const cajeroEmails = await _getCachedCajeroEmails();
if (cajeroEmails.includes(memberEmail)) return true;
const roles = member.roles || [];
const allowedRoles = [COLLAB_ROLES.ADMIN, COLLAB_ROLES.GESTION, COLLAB_ROLES.ESTILISTA];
const hasAllowedRole = roles.some((r) => {
const roleName = _safeTrim(r.name || r.title || r);
return allowedRoles.includes(roleName.toUpperCase());
});
return hasAllowedRole;
} catch (error) {
log.error("isStaffCollaborator check failed", { traceId: activeTraceId, error: error?.message });
return false;
}
}
export async function requireAdmin(traceId) {
const activeTraceId = traceId || makeTraceId("rbac");
const admin = await isAdmin(activeTraceId);
if (!admin) {
throw createBookingError(ERROR_CODES.ACCESS_DENIED, "Admin access required", { traceId: activeTraceId });
}
return true;
}
export async function requireCajero(traceId) {
const activeTraceId = traceId || makeTraceId("rbac");
const cajero = await isCajero(activeTraceId);
if (!cajero) {
throw createBookingError(ERROR_CODES.ACCESS_DENIED, "Cajero access required", { traceId: activeTraceId });
}
return true;
}
export async function requireMarianManager(traceId) {
const activeTraceId = traceId || makeTraceId("rbac");
// The Marian manager is the owner-level role (covers ADMIN and GESTION).
const manager = await isCajero(activeTraceId);
if (!manager) {
throw createBookingError(ERROR_CODES.ACCESS_DENIED, "Marian manager access required", { traceId: activeTraceId });
}
return true;
}