/*
=============================================================================
MODULE: backend/http-functions.js
VERSION: v5001-optimized (base v19.6.2-serviceid-linkfases-contract)
RESPONSIBILITY: REST endpoints for M365/Power Automate integration.
STANDARDS: G10 ASCII Strict (0 non-ASCII characters).
=============================================================================
*/
import { ok, badRequest, unauthorized, serverError } from "wix-http-functions";
import { getSecret } from "wix-secrets-backend";
import { SECRETS } from "backend/mmSecrets";
import { makeTraceId, _safeTrim, _safeSlugOrId, _looksLikeGuid } from "public/mmUtils";
import { hmacSha256Hex } from "backend/securityEngine";
import { _getServiceBySlugOrIdInternal } from "backend/reservas.web";
import { logger } from "backend/booking/bookingCore";
const log = logger;
const HMAC_MAX_CLOCK_SKEW_SECONDS = 60;
function _safeTraceId(prefix) {
return makeTraceId(prefix || "http");
}
function _extractBearerToken(request) {
const authHeader = request.headers?.authorization || request.headers?.Authorization || "";
if (authHeader.startsWith("Bearer ")) {
return authHeader.substring(7).trim();
}
return "";
}
async function _validateHMACSignature(request, bodyString, traceId) {
const signature = request.headers["x-mm-signature"] || "";
const timestamp = request.headers["x-mm-timestamp"] || "";
if (!signature || !timestamp) return false;
const now = Math.floor(Date.now() / 1000);
const reqTimestamp = parseInt(timestamp, 10);
if (isNaN(reqTimestamp) || Math.abs(now - reqTimestamp) > HMAC_MAX_CLOCK_SKEW_SECONDS) {
return false;
}
const secret = await getSecret(SECRETS.POWER_AUTOMATE).catch((error) => {
log.error("M365 webhook secret lookup failed", { traceId, error: error?.message });
return "";
});
if (!secret) return false;
const payload = `${timestamp}.${bodyString}`;
const expectedSignature = hmacSha256Hex(secret, payload);
return signature === expectedSignature;
}
export async function get_service(request) {
const traceId = _safeTraceId("http-svc");
try {
const slugOrId = _safeTrim(request.path?.[0] || request.query?.slug || request.query?.serviceId || "");
if (!slugOrId) {
return badRequest({ body: { error: "SLUG_OR_ID_REQUIRED" } });
}
const result = await _getServiceBySlugOrIdInternal(slugOrId, traceId);
if (result.status !== "SUCCESS") {
return badRequest({ body: { error: result.error?.code || "SERVICE_NOT_FOUND" } });
}
return ok({ body: result.data });
} catch (error) {
log.error("get_service failed", { traceId, error: error?.message });
return serverError({ body: { error: "INTERNAL_ERROR" } });
}
}
export async function get_services_list(request) {
const traceId = _safeTraceId("http-svc-list");
try {
const wixData = await import("wix-data");
const { COLLECTIONS } = await import("backend/internalConfig");
const res = await wixData.default
.query(COLLECTIONS.SERVICIOS_RESERVA)
.eq("oculto", false)
.limit(100)
.find({ suppressAuth: true });
const services = (res?.items || []).map((s) => ({
serviceId: s.serviceId || s.serviceId || s._id,
title: s.title || "",
slug: s.slug || "",
price: Number(s.price || 0),
totalDuration: Number(s.totalDuration || 0),
allowCombine: s.allowCombine === true,
linkedPhases: _safeTrim(s.linkedPhases || ""),
}));
return ok({ body: { services } });
} catch (error) {
log.error("get_services_list failed", { traceId, error: error?.message });
return serverError({ body: { error: "INTERNAL_ERROR" } });
}
}
export async function post_webhook_m365(request) {
const traceId = _safeTraceId("http-m365");
try {
const bodyString = typeof request.body === "string" ? request.body : JSON.stringify(request.body || {});
const isValid = await _validateHMACSignature(request, bodyString, traceId);
if (!isValid) {
log.warn("M365 webhook HMAC validation failed", { traceId });
return unauthorized({ body: { error: "UNAUTHORIZED" } });
}
const payload = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
const eventType = _safeTrim(payload.eventType || payload.type || "");
log.info("M365 webhook received", { traceId, eventType });
return ok({ body: { received: true, eventType } });
} catch (error) {
log.error("post_webhook_m365 failed", { traceId, error: error?.message });
return serverError({ body: { error: "INTERNAL_ERROR" } });
}
}
export async function get_health(request) {
const traceId = _safeTraceId("http-health");
return ok({
body: {
status: "OK",
timestamp: new Date().toISOString(),
traceId,
version: "v5001-optimized",
},
});
}