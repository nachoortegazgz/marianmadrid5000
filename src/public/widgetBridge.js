/*
=============================================================================
MODULE: public/widgetBridge.js
RESPONSIBILITY: Centralized, lightweight postMessage transport between Velo 
                pages and HTML widgets/Custom Elements.
STANDARDS: G10 ASCII Strict, Velo Native Optimized, Reactive Flow.
=============================================================================
*/

import { MESSAGE_TYPES, makeTraceId, _safeSlugOrId } from "public/mmUtils";

export function createWidgetBridge(widgetElement, options = {}) {
    const traceId = options.traceId || makeTraceId("bridge");
    const slug = _safeSlugOrId(options.slug || "") || "unknown";

    if (!widgetElement || typeof widgetElement.postMessage !== "function") {
        console.error("[widgetBridge] HTML widget component not found or incompatible.");
        if (typeof options.onError === "function") options.onError(new Error("Widget not found"));
        return null;
    }

    let contextSent = false;

    function post(type, payload = {}, messageId = null) {
        const normalizedType = String(type || "").trim().toUpperCase();
        if (!normalizedType) return;

        try {
            const message = {
                type: normalizedType,
                payload: { ...(payload || {}), traceId },
            };
            if (messageId) message.messageId = messageId;
            widgetElement.postMessage(message);
        } catch (error) {
            console.warn("[widgetBridge] postMessage failed:", error?.message);
        }
    }

    async function postContext() {
        if (contextSent) return;
        try {
            const contextData = typeof options.onContextReady === "function" ? await options.onContextReady() : {};
            post(MESSAGE_TYPES.CONTEXT, { ...contextData, slug });
            contextSent = true;
        } catch (error) {
            console.error("[widgetBridge] Failed to prepare context:", error?.message);
            if (typeof options.onError === "function") options.onError(error);
        }
    }

    const handler = async (event) => {
        const message = event?.data || event || {};
        const type = String(message.type || message.action || "").trim().toUpperCase();
        const messageId = message.messageId || null;
        
        if (!type) return;

        // Flujo reactivo: El widget avisa que esta listo, Velo responde con el contexto.
        if (type === MESSAGE_TYPES.READY || type === "MM_READY") {
            post(MESSAGE_TYPES.READY, { status: "ACK" }, messageId);
            await postContext();
            return;
        }

        if (typeof options.onWidgetMessage === "function") {
            try {
                const reply = (responseType, responsePayload, replyMessageId) => {
                    post(responseType, responsePayload, replyMessageId || messageId);
                };
                await options.onWidgetMessage(message, reply);
            } catch (error) {
                console.error("[widgetBridge] onWidgetMessage error:", error?.message);
                if (typeof options.onError === "function") options.onError(error);
            }
        }
    };

    // Suscripcion nativa de Velo
    widgetElement.onMessage(handler);

    return {
        post,
        postContext,
        getTraceId: () => traceId,
        isReady: () => contextSent
    };
}