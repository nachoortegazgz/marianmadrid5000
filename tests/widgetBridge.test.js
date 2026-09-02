import { describe, expect, it, vi } from "vitest";
import { createWidgetBridge } from "../src/public/widgetBridge.js";

function createWidget() {
  let handler;
  return {
    onMessage: vi.fn((callback) => { handler = callback; }),
    postMessage: vi.fn(),
    emit(message) {
      return handler({ data: message });
    },
  };
}

describe("widgetBridge", () => {
  it("envía ACK y contexto al recibir READY", async () => {
    const widget = createWidget();
    createWidgetBridge(widget, {
      traceId: "trace-test",
      onContextReady: async () => ({ serviceId: "service-1" }),
    });

    await widget.emit({ type: "MM_READY", messageId: "ready-1" });

    expect(widget.postMessage).toHaveBeenCalledTimes(2);
    expect(widget.postMessage.mock.calls[0][0]).toMatchObject({
      type: "MM_READY",
      messageId: "ready-1",
    });
    expect(widget.postMessage.mock.calls[1][0]).toMatchObject({
      type: "MM_CONTEXT",
      payload: { serviceId: "service-1", traceId: "trace-test" },
    });
  });

  it("responde mensajes y conserva su messageId", async () => {
    const widget = createWidget();
    createWidgetBridge(widget, {
      onWidgetMessage: async (_message, reply) => reply("BOOK_RES", { status: "SUCCESS" }),
    });

    await widget.emit({ type: "MM_BOOK", messageId: "book-1", payload: {} });

    expect(widget.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "BOOK_RES",
      messageId: "book-1",
      payload: expect.objectContaining({ status: "SUCCESS" }),
    }));
  });
});