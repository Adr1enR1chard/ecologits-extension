import { describe, expect, it, vi } from "vitest";
import { capturedResponse, impactResult } from "../test-utils";
import { relay, toCaptureMessage } from "./bridge";

describe("toCaptureMessage", () => {
    const captured = { type: "captured-response", payload: capturedResponse() };

    it("accepts captures and failures for the page's provider", () => {
        expect(toCaptureMessage(captured, "chatgpt")).toEqual(captured);
        const failure = { type: "adapter-failure", provider: "chatgpt", error: "x" };
        expect(toCaptureMessage(failure, "chatgpt")).toEqual(failure);
    });

    it("rejects other providers, other message types and malformed data", () => {
        expect(toCaptureMessage(captured, "claude")).toBeNull();
        expect(toCaptureMessage({ type: "get-adapter-status" }, "chatgpt")).toBeNull();
        expect(
            toCaptureMessage(
                { type: "captured-response", payload: { provider: "chatgpt" } },
                "chatgpt",
            ),
        ).toBeNull();
        expect(toCaptureMessage("captured-response", "chatgpt")).toBeNull();
    });
});

describe("relay", () => {
    const captured = { type: "captured-response", payload: capturedResponse() };

    it("forwards valid messages and resolves with the computed impacts", async () => {
        const result = impactResult();
        const send = vi.fn(async () => ({ ok: true, value: result }));
        expect(await relay(captured, "chatgpt", send)).toEqual(result);
        expect(send).toHaveBeenCalledWith(captured);
    });

    it("does not forward invalid messages", async () => {
        const send = vi.fn();
        expect(await relay({ type: "get-adapter-status" }, "chatgpt", send)).toBeNull();
        expect(send).not.toHaveBeenCalled();
    });

    it("resolves with null on background errors or a lost extension context", async () => {
        expect(
            await relay(captured, "chatgpt", async () => ({ ok: false, error: "x" })),
        ).toBeNull();
        expect(await relay(captured, "chatgpt", async () => undefined)).toBeNull();
        const lost = async () => {
            throw new Error("Extension context invalidated.");
        };
        expect(await relay(captured, "chatgpt", lost)).toBeNull();
    });

    it("resolves with null for failure reports", async () => {
        const failure = { type: "adapter-failure", provider: "chatgpt", error: "x" };
        expect(await relay(failure, "chatgpt", async () => ({ ok: true, value: null }))).toBeNull();
    });
});
