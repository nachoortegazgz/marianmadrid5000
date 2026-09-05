/*
=============================================================================
MODULE: pages/calendario-2.js
VERSION: v5001-optimized (base v19.6.7-ready-only-context)
RESPONSIBILITY: Calendar page controller for booking flow.
STANDARDS: G10 ASCII Strict (0 non-ASCII characters).
=============================================================================
*/
import wixLocation from "wix-location";
import wixWindowFrontend from "wix-window-frontend";
import {
MESSAGE_TYPES,
URLS,
UI,
makeTraceId,
_safeTrim,
_safeSlugOrId,
_looksLikeGuid,
withTimeout,
} from "public/mmUtils";
import { createWidgetBridge } from "public/widgetBridge";
import { processDualBooking } from "backend/citasManager.web";
let currentServiceId = null;
let currentSlug = null;
let bridge = null;
function _parseUrlParams() {
const query = wixLocation.query || {};
const serviceId = _safeTrim(query.serviceId || "");
const slug = _safeSlugOrId(query.slug || "");
const referral = _safeTrim(query.referral || "");
return { serviceId, slug, referral };
}
async function _resolveServiceFromParams(params) {
if (params.serviceId && _looksLikeGuid(params.serviceId)) {
return { serviceId: params.serviceId, slug: params.slug || null };
}
if (params.slugUrl) {
return { serviceId: null, slugUrl: params.slugUrl };
}
return null;
}
$w.onReady(async function () {
const traceId = makeTraceId("calendario");
const params = _parseUrlParams();
const resolved = await _resolveServiceFromParams(params);
if (!resolved) {
console.error("[calendario-2] No service resolved from URL params", { traceId });
return;
}
currentServiceId = resolved.serviceId;
currentSlug = resolved.slug;
const widget = $w("#htmlWidgetCalendario");
if (!widget || typeof widget.postMessage !== "function") {
console.error("[calendario-2] HTML widget not found or incompatible", { traceId });
return;
}
bridge = createWidgetBridge(widget, {
slug: currentSlug || currentServiceId || "calendario",
traceId,
handshakeTimeoutMs: UI.HANDSHAKE_TIMEOUT_MS,
contextTimeoutMs: UI.CONTEXT_TIMEOUT_MS,
onContextReady: async () => {
return {
serviceId: currentServiceId,
slug: currentSlug,
referral: params.referral,
};
},
onWidgetMessage: async (message, reply) => {
const type = String(message?.type || "").toUpperCase();
const payload = message?.payload || {};
if (type === MESSAGE_TYPES.NAV) {
const target = _safeTrim(payload.target || "");
if (target === "SERVICIOS") {
wixLocation.to(URLS.SERVICIOS);
} else if (target === "PRIVACY") {
wixLocation.to(URLS.PRIVACY_POLICY);
}
return;
}
if (type === MESSAGE_TYPES.BOOK) {
const bookingData = payload.bookingData || payload;
console.info("[calendario-2] Booking initiated", { traceId, bookingData });
try {
const result = await withTimeout(
processDualBooking({ ...bookingData, traceId }),
UI.FRONTEND_API_TIMEOUT_MS,
"processDualBooking"
);
reply("BOOK_RES", result);
return result;
} catch (error) {
const result = { status: "ERROR", data: null, error: { code: "BOOKING_TIMEOUT", message: "No se pudo completar la reserva." } };
reply("BOOK_RES", result);
return result;
}
}
},
onError: (error) => {
console.error("[calendario-2] Widget bridge error", { traceId, error: error?.message });
},
});
});
