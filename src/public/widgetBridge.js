/*
=============================================================================
MODULE: public/widgetBridge.js
RESPONSIBILITY: Centralized, lightweight postMessage transport between Velo 
                pages and HTML widgets/Custom Elements.
STANDARDS: G10 ASCII Strict, Velo Native Optimized, Reactive Flow.
=============================================================================
*/

import { MESSAGE_TYPES, makeTraceId, _safeSlugOrId, withTimeout } from "public/mmUtils";

export function createWidgetBridge(widgetElement, options = {}) {
    const traceId = options.traceId || makeTraceId("bridge");
    // [W-01] slugUrl canonical (Biblia v5002.4); options.slug is accepted only as
    // migration tolerance until every caller passes slugUrl.
    const slugUrl = _safeSlugOrId(options.slugUrl || options.slug || "") || "unknown";

    if (!widgetElement || typeof widgetElement.postMessage !== "function") {
        console.error("[widgetBridge] HTML widget component not found or incompatible.");
        if (typeof options.onError === "function") options.onError(new Error("Widget not found"));
        return null;
    }

    let contextSent = false;
    let contextPromise = null;
    const handshakeTimeoutMs = Number(options.handshakeTimeoutMs) || 30000;
    const contextTimeoutMs = Number(options.contextTimeoutMs) || 30000;
    const messageTimeoutMs = Number(options.messageTimeoutMs) || 30000;
    let handshakeTimer = setTimeout(() => {
        if (!contextSent && typeof options.onError === "function") {
            options.onError(new Error("Widget handshake timeout"));
        }
    }, handshakeTimeoutMs);

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
        if (contextPromise) return contextPromise;
        contextPromise = (async () => {
            try {
                const contextData = typeof options.onContextReady === "function"
                    ? await withTimeout(options.onContextReady(), contextTimeoutMs, "widget context")
                    : {};
                // [W-01] slugUrl canonical; deprecated wire alias slug kept until
                // the HTML widgets finish migrating to slugUrl.
                post(MESSAGE_TYPES.CONTEXT, { ...contextData, slugUrl, slug: slugUrl });
                contextSent = true;
                clearTimeout(handshakeTimer);
                handshakeTimer = null;
            } catch (error) {
                console.error("[widgetBridge] Failed to prepare context:", error?.message);
                if (typeof options.onError === "function") options.onError(error);
                throw error;
            } finally {
                contextPromise = null;
            }
        })();
        return contextPromise;
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
            let responseSent = false;
            try {
                const reply = (responseType, responsePayload, replyMessageId) => {
                    responseSent = true;
                    post(responseType, responsePayload, replyMessageId || messageId);
                };
                await withTimeout(options.onWidgetMessage(message, reply), messageTimeoutMs, `widget message ${type}`);
            } catch (error) {
                console.error("[widgetBridge] onWidgetMessage error:", error?.message);
                if (!responseSent) {
                    post(`${type}_RES`, {
                        status: "ERROR",
                        data: null,
                        error: { code: error?.code || "WIDGET_MESSAGE_FAILED", message: error?.message || "Widget message failed" },
                    }, messageId);
                }
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