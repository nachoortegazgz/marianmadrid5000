/*
 =============================================================================
 MODULE: backend/security.js
 VERSION: v5003-rbac-security
 RESPONSIBILITY: RBAC authorization engine, member role validation,
                 sliding-window rate limiter, and persistent block checks.
 CORRECTIONS: Added persistent block verification, fixed email cache.
 STANDARDS: G10 ASCII Strict.
 =============================================================================
 */
import { getSecret } from "wix-secrets-backend";
import { currentMember } from "wix-members-backend";
import wixData from "wix-data";
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
  cachedAdminEmails = String(raw || "").split(",").map((e) => _safeEmail(e)).filter(Boolean);
  adminCacheTime = now;
  return cachedAdminEmails;
}

async function _getCachedCajeroEmails() {
  const now = Date.now();
  if (cachedCajeroEmails && now - cajeroCacheTime < ROLE_CACHE_TTL_MS) return cachedCajeroEmails;
  const raw = await getSecret(SECRETS.CAJERO_EMAILS).catch(() => "");
  cachedCajeroEmails = String(raw || "").split(",").map((e) => _safeEmail(e)).filter(Boolean);
  cajeroCacheTime = now;
  return cachedCajeroEmails;
}

// FIX: Implementada verificacion de bloqueos persistentes
export async function isKeyPersistentlyBlocked(surface, key) {
  const cleanKey = String(key || "anon");
  const cleanSurface = String(surface || "global");
  try {
    const recent = await wixData.query(COLLECTIONS.RATE_LIMIT_BLOCKS || "RateLimitBlocks")
      .eq("surface", cleanSurface)
      .eq("key", cleanKey)
      .gt("expiresAt", new Date())
      .limit(1)
      .find({ suppressAuth: true });
    return Boolean(recent?.items?.length);
  } catch (_) {
    return false;
  }
}

const PERSIST_THRESHOLD = 3;

export function rateLimiter({ surface, key }, maxRequests, windowMs) {
  const cleanKey = `${surface || "global"}:${key || "anon"}`;
  const now = Date.now();
  const max = maxRequests || RATE_LIMIT_MAX_REQUESTS;
  const window = windowMs || RATE_LIMIT_WINDOW_MS;
  const entry = rateLimitCache.get(cleanKey);
  if (!entry || now - entry.windowStart > window) {
    rateLimitCache.set(cleanKey, { count: 1, windowStart: now, violations: 0 });
    return { allowed: true, retryAfter: 0 };
  }
  entry.count++;
  if (entry.count > max) {
    entry.violations = (entry.violations || 0) + 1;
    if (entry.violations >= PERSIST_THRESHOLD) {
      const blockKey = `RL-${cleanKey}-${now}`;
      wixData.insert(COLLECTIONS.RATE_LIMIT_BLOCKS || "RateLimitBlocks", {
        _id: blockKey,
        surface: surface || "global",
        key: key || "anon",
        violations: entry.violations,
        expiresAt: new Date(now + 60 * 60 * 1000),
        _createdDate: new Date(),
      }, { suppressAuth: true }).catch(() => {});
    }
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
    return roles.some((r) => _safeTrim(r.name || r.title || r).toUpperCase() === COLLAB_ROLES.ADMIN);
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
    return roles.some((r) => [COLLAB_ROLES.ADMIN, COLLAB_ROLES.GESTION].includes(_safeTrim(r.name || r.title || r).toUpperCase()));
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
    return roles.some((r) => allowedRoles.includes(_safeTrim(r.name || r.title || r).toUpperCase()));
  } catch (error) {
    log.error("isStaffCollaborator check failed", { traceId: activeTraceId, error: error?.message });
    return false;
  }
}

export async function requireAdmin(traceId) {
  const activeTraceId = traceId || makeTraceId("rbac");
  if (!(await isAdmin(activeTraceId))) {
    throw createBookingError(ERROR_CODES.ACCESS_DENIED, "Admin access required", { traceId: activeTraceId });
  }
  return true;
}

export async function requireCajero(traceId) {
  const activeTraceId = traceId || makeTraceId("rbac");
  if (!(await isCajero(activeTraceId))) {
    throw createBookingError(ERROR_CODES.ACCESS_DENIED, "Cajero access required", { traceId: activeTraceId });
  }
  return true;
}

export async function requireMarianManager(traceId) {
  const activeTraceId = traceId || makeTraceId("rbac");
  if (!(await isCajero(activeTraceId))) {
    throw createBookingError(ERROR_CODES.ACCESS_DENIED, "Marian manager access required", { traceId: activeTraceId });
  }
  return true;
}