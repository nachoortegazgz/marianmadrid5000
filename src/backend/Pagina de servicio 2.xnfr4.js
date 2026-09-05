/*
 =============================================================================
 MODULE: pages/servicio-2.js
 VERSION: v5002.2-canonical-service-detail
 RESPONSIBILITY: Velo page controller for the Service Details widget.
 STANDARDS: G10 ASCII Strict, Lightweight, Velo V3 SDK.
 CORRECTIONS:
   - wix-location -> wix-location-frontend (Velo V3)
   - slugUrl maintained as canonical field (user correction)
 =============================================================================
 */
 import wixLocation from "wix-location-frontend";
 import { getServiceBySlugOrId } from "backend/reservas.web";
 import { MESSAGE_TYPES, URLS, makeTraceId, _safeSlugOrId } from "public/mmUtils";
 import { createWidgetBridge } from "public/widgetBridge";
 function showError(message) {
   const safeMessage = String(message || "No se pudo cargar el servicio.");
   console.error("[servicio-2] Error:", safeMessage);
   try {
     const banner = $w("#errorBanner");
     if (banner && "text" in banner) {
       banner.text = `Error: ${safeMessage}`;
       if (typeof banner.show === "function") banner.show();
     }
   } catch (_) {}
 }
 async function resolveServiceLookup() {
   const query = wixLocation.query || {};
   const slugCandidates = [query.slugUrl, query.slug, query.serviceKey];
   for (const candidate of slugCandidates) {
     const slugUrl = _safeSlugOrId(candidate);
     if (slugUrl) return slugUrl;
   }
   const path = Array.isArray(wixLocation.path) ? wixLocation.path : [];
   const pathCandidate = _safeSlugOrId(path[path.length - 1] || "");
   const excludedPaths = new Set(["servicios", "service", "servicio", "servicio-2"]);
   if (pathCandidate && !excludedPaths.has(pathCandidate)) {
     return pathCandidate;
   }
   return null;
 }
 $w.onReady(async () => {
   const traceId = makeTraceId("servicio");
   const widget = $w("#htmlWidgetCustomService");
   if (!widget || typeof widget.postMessage !== "function") {
     showError("HTML widget not found.");
     return;
   }
   try {
     const lookupValue = await resolveServiceLookup();
     if (!lookupValue) {
       showError("No se pudo localizar el servicio en la URL.");
       return;
     }
     let resolvedService = null;
     createWidgetBridge(widget, {
       slug: lookupValue,
       traceId,
       onContextReady: async () => {
         const result = await getServiceBySlugOrId(lookupValue);
         if (!result || result.status !== "SUCCESS" || !result.data) {
           throw new Error(result?.error?.message || "Service not found");
         }
         resolvedService = result.data;
         return resolvedService;
       },
       onWidgetMessage: async (message) => {
         const type = String(message?.type || "").toUpperCase();
         const payload = message?.payload || {};
         if (!resolvedService) return;
         if (type === MESSAGE_TYPES.BOOK) {
           const base = URLS?.CALENDARIO_2 || "/booking-calendar/calendario-2";
           const query = [
             `slugUrl=${encodeURIComponent(resolvedService.slugUrl || resolvedService.slug || lookupValue)}`,
             `serviceId=${encodeURIComponent(resolvedService.serviceId)}`,
             "referral=servicio-2",
           ];
           if (Array.isArray(payload.addons) && payload.addons.length > 0) {
             const addonIds = payload.addons.map((a) => (typeof a === "object" ? a.addonId : a)).filter(Boolean);
             if (addonIds.length > 0) query.push(`addonIds=${encodeURIComponent(addonIds.join(","))}`);
           }
           wixLocation.to(`${base}?${query.join("&")}`);
           return;
         }
         if (type === MESSAGE_TYPES.NAV) {
           wixLocation.to(URLS?.SERVICIOS || "/reserva-online");
         }
       },
       onError: (error) => showError(error?.message),
     });
   } catch (error) {
     showError(error?.message);
   }
 });