/*
=============================================================================
MODULE: backend/security.js
RESPONSIBILITY: RBAC (roles + allowlists) and lightweight rate limiter.
STANDARDS: G10 ASCII Strict, Velo Native Optimized.
=============================================================================
*/

import { getSecret } from "wix-secrets-backend";
import { currentMember } from "wix-members-backend";
import { COLLAB_ROLES, SDK_CONFIG, STAFF_ACCESS } from "backend/internalConfig";
import { findStaff } from "backend/staff";
import { _safeTrim, _isValidEmail } from "public/mmUtils";
import { SECRETS } from "backend/mmSecrets";
import { hmacSha256Hex as generateHMAC, verifyHMAC, timingSafeEqual } from "backend/securityEngine";

export { generateHMAC, verifyHMAC, timingSafeEqual };

// Rate Limiter ultra-ligero. Se vacía si crece mucho para evitar memory leaks.
let _rateLimitCache = new Map();
const MAX_RATE_LIMIT_CACHE_SIZE = 1000;

function _makeAccessDeniedError(code, message, meta) {
    const err = new Error(message);
    err.code = code || "ACCESS_DENIED";
    if (meta && typeof meta === "object") err.meta = meta;
    return err;
}

function _throwAccessDenied(code, message, meta) {
    throw _makeAccessDeniedError(code, message, meta);
}

function _roleMatches(role, allowedNamesUpper) {
    if (!role || typeof role !== "object") return false;
    const roleName = String(role.name || role.title || "").trim().toUpperCase();
    return roleName && Array.isArray(allowedNamesUpper) && allowedNamesUpper.includes(roleName);
}

async function _getMemberFull() {
    return currentMember.getMember({ fieldsets: ["FULL"] }).catch(() => null);
}

export function rateLimiter(key, maxRequests, windowMs) {
    const now = Date.now();
    const maxReq = Number.isFinite(maxRequests) ? Number(maxRequests) : Number(SDK_CONFIG?.RATE_LIMIT?.MAX_REQUESTS || 20);
    const winMs = Number.isFinite(windowMs) ? Number(windowMs) : Number(SDK_CONFIG?.RATE_LIMIT?.WINDOW_MS || 5000);

    // Auto-limpieza drástica para evitar memory leaks en serverless
    if (_rateLimitCache.size > MAX_RATE_LIMIT_CACHE_SIZE) {
        _rateLimitCache.clear();
    }

    let surface = "default";
    let rawKey = key;
    if (key && typeof key === "object") {
        surface = String(key.surface || "default").trim() || "default";
        rawKey = key.key;
    }

    const cleanRaw = String(rawKey ?? "").trim() || "anon:empty";
    const k = `${surface}:${cleanRaw}`;

    const entry = _rateLimitCache.get(k);
    if (!entry || now - entry.windowStart > winMs) {
        _rateLimitCache.set(k, { count: 1, windowStart: now });
        return { allowed: true, retryAfter: 0 };
    }

    entry.count++;
    if (entry.count > maxReq) {
        const retryAfter = winMs - (now - entry.windowStart);
        return { allowed: false, retryAfter: Math.max(0, retryAfter) };
    }
    return { allowed: true, retryAfter: 0 };
}

export function clearRateLimitCache() {
    _rateLimitCache.clear();
}

function _parseEmails(csv) {
    return String(csv || "").split(",").map((e) => _safeTrim(e).toLowerCase()).filter(_isValidEmail);
}

async function _getSecretEmails(secretName) {
    try {
        const raw = await getSecret(secretName);
        return _parseEmails(raw);
    } catch (_) {
        return [];
    }
}

export async function isAdmin(traceId = "unknown") {
    const member = await _getMemberFull();
    if (!member) return false;
    const roles = member.roles || [];
    if (roles.some((r) => _roleMatches(r, [COLLAB_ROLES.ADMIN]))) return true;
    
    const email = _safeTrim(member.loginEmail || "").toLowerCase();
    const admins = await _getSecretEmails(SECRETS.ADMIN_EMAILS);
    return admins.includes(email);
}

export async function isCajero(traceId = "unknown") {
    const member = await _getMemberFull();
    if (!member) return false;
    const roles = member.roles || [];
    if (roles.some((r) => _roleMatches(r, [COLLAB_ROLES.ADMIN, COLLAB_ROLES.GESTION]))) return true;
    
    const email = _safeTrim(member.loginEmail || "").toLowerCase();
    const [admins, cajeros] = await Promise.all([
        _getSecretEmails(SECRETS.ADMIN_EMAILS),
        _getSecretEmails(SECRETS.CAJERO_EMAILS)
    ]);
    return admins.includes(email) || cajeros.includes(email);
}

export async function isMarianManager(traceId = "unknown") {
    if (!(await isAdmin(traceId))) return false;
    const member = await _getMemberFull();
    if (!member) return false;
    const email = _safeTrim(member.loginEmail || member.email || "").toLowerCase();
    const staff = (await findStaff(email)) || (await findStaff(member._id));
    return String(staff?.resourceId || "") === String(STAFF_ACCESS.MARIAN_RESOURCE_ID || "");
}

export async function requireMarianManager(traceId = "unknown") {
    if (!(await isMarianManager(traceId))) {
        _throwAccessDenied("MARIAN_MANAGER_REQUIRED", "Acceso exclusivo de Marian requerido.", { traceId });
    }
    return true;
}

export async function isStaffCollaborator(traceId = "unknown") {
    const member = await _getMemberFull();
    if (!member) return false;
    const roles = member.roles || [];
    if (roles.some((r) => _roleMatches(r, [COLLAB_ROLES.ADMIN, COLLAB_ROLES.GESTION, COLLAB_ROLES.ESTILISTA]))) return true;
    
    const email = _safeTrim(member.loginEmail || member.email || "").toLowerCase();
    const [admins, cajeros] = await Promise.all([
        _getSecretEmails(SECRETS.ADMIN_EMAILS),
        _getSecretEmails(SECRETS.CAJERO_EMAILS)
    ]);
    return admins.includes(email) || cajeros.includes(email);
}

export async function requireAdmin(traceId = "unknown") {
    if (!(await isAdmin(traceId))) {
        _throwAccessDenied("ADMIN_REQUIRED", "ACCESS_DENIED: Admin privileges required.", { traceId });
    }
    return true;
}

export async function requireCajero(traceId = "unknown") {
    if (!(await isCajero(traceId))) {
        _throwAccessDenied("CAJERO_REQUIRED", "ACCESS_DENIED: Cashier privileges required.", { traceId });
    }
    return true;
}

export async function requireStaffCollaborator(traceId = "unknown") {
    if (!(await isStaffCollaborator(traceId))) {
        _throwAccessDenied("COLLAB_REQUIRED", "ACCESS_DENIED: Collaborator role required.", { traceId });
    }
    return true;
}