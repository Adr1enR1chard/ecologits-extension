import { logger } from "@ecologits/ecologits.js";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { handleBackgroundMessage, processCapturedResponse, replyToMessage } from "./handler";
import type * as compute from "./impacts/compute";
import { computeImpact } from "./impacts/compute";
import { isBackgroundMessage } from "./messaging";
import { getAggregates } from "./storage/aggregates";
import { MAX_EVENTS, getEvents } from "./storage/events";
import { emptyStatus, getAdapterStatuses } from "./storage/health";
import { capturedResponse, impactResult } from "./test-utils";

vi.mock("./impacts/compute", async (importOriginal) => {
    const actual = await importOriginal<typeof compute>();
    return { ...actual, computeImpact: vi.fn(actual.computeImpact) };
});

const now = new Date(2026, 9, 14, 12).getTime();

beforeAll(() => {
    logger.setSink(() => undefined);
});

beforeEach(() => {
    fakeBrowser.reset();
    vi.mocked(computeImpact).mockClear();
});

describe("processCapturedResponse", () => {
    it("returns the impact result and updates storage", async () => {
        const result = await processCapturedResponse(capturedResponse(), now);

        expect(result.impacts!.total.energy.median).toBeGreaterThan(0);
        expect(await getEvents()).toEqual([result]);
        const aggregates = await getAggregates();
        expect(aggregates["2026-10-14/chatgpt/gpt-5"]).toMatchObject({
            requests: 1,
            outputTokens: result.outputTokens,
            impacts: result.impacts,
        });
    });

    it("records concurrent replies without losing updates", async () => {
        await Promise.all(
            Array.from({ length: 10 }, (_, i) =>
                processCapturedResponse(capturedResponse({ messageId: String(i) }), now),
            ),
        );
        expect(await getEvents()).toHaveLength(10);
        expect((await getAggregates())["2026-10-14/chatgpt/gpt-5"]!.requests).toBe(10);
    });

    it(`caps the event log at ${MAX_EVENTS} while aggregates keep counting`, async () => {
        const total = MAX_EVENTS + 5;
        for (let i = 0; i < total; i++) {
            await processCapturedResponse(capturedResponse({ messageId: String(i) }), now);
        }
        const events = await getEvents();
        expect(events).toHaveLength(MAX_EVENTS);
        expect(events[0]!.messageId).toBe("5");
        expect((await getAggregates())["2026-10-14/chatgpt/gpt-5"]!.requests).toBe(total);
    });

    it("records each reply once per provider and message id", async () => {
        await processCapturedResponse(capturedResponse({ messageId: "same" }), now);
        await processCapturedResponse(capturedResponse({ messageId: "same" }), now);
        await processCapturedResponse(
            capturedResponse({ provider: "claude", rawModel: null, messageId: "same" }),
            now,
        );
        await processCapturedResponse(capturedResponse({ messageId: null }), now);
        await processCapturedResponse(capturedResponse({ messageId: null }), now);

        expect(await getEvents()).toHaveLength(4);
        expect((await getAggregates())["2026-10-14/chatgpt/gpt-5"]!.requests).toBe(3);
    });

    it("reports replies EcoLogits cannot compute as failures", async () => {
        vi.mocked(computeImpact).mockReturnValueOnce(
            impactResult({
                impacts: null,
                errors: [{ code: "model-not-registered", message: "unknown" }],
            }),
        );
        const result = await processCapturedResponse(capturedResponse(), now);

        expect(result.impacts).toBeNull();
        expect(await getEvents()).toEqual([]);
        expect(await getAggregates()).toEqual({});
        expect((await getAdapterStatuses())[0]).toEqual({
            provider: "chatgpt",
            lastSuccessAt: null,
            lastFailureAt: now,
            lastError: "model-not-registered",
        });
    });

    it("reports computation exceptions as failures and rethrows", async () => {
        vi.mocked(computeImpact).mockImplementationOnce(() => {
            throw new Error("boom");
        });
        await expect(processCapturedResponse(capturedResponse(), now)).rejects.toThrow("boom");
        expect((await getAdapterStatuses())[0]).toMatchObject({
            lastFailureAt: now,
            lastError: "boom",
        });
    });

    it("stores unknown models under the fallback with a flag", async () => {
        const result = await processCapturedResponse(
            capturedResponse({ provider: "claude", rawModel: "claude-next" }),
            now,
        );
        expect(result.flags.approximatedModel).toBe(true);
        expect(await getAggregates()).toHaveProperty(
            "2026-10-14/claude/claude-sonnet-4-5.approximatedModelRequests",
            1,
        );
    });
});

describe("handleBackgroundMessage", () => {
    it("tracks adapter health", async () => {
        await handleBackgroundMessage(
            { type: "captured-response", payload: capturedResponse() },
            now,
        );
        await handleBackgroundMessage(
            { type: "adapter-failure", provider: "claude", error: "parse error" },
            now + 1,
        );
        const statuses = await handleBackgroundMessage({ type: "get-adapter-status" });
        expect(statuses).toEqual([
            { provider: "chatgpt", lastSuccessAt: now, lastFailureAt: null, lastError: null },
            {
                provider: "claude",
                lastSuccessAt: null,
                lastFailureAt: now + 1,
                lastError: "parse error",
            },
            { provider: "gemini", lastSuccessAt: null, lastFailureAt: null, lastError: null },
        ]);
    });
});

describe("clear-usage-data", () => {
    it("clears the recorded usage", async () => {
        await handleBackgroundMessage(
            { type: "captured-response", payload: capturedResponse() },
            now,
        );
        expect(await handleBackgroundMessage({ type: "clear-usage-data" })).toBeNull();
        expect(await getEvents()).toEqual([]);
        expect((await handleBackgroundMessage({ type: "get-adapter-status" }))[0]).toEqual(
            emptyStatus("chatgpt"),
        );
    });
});

describe("replyToMessage", () => {
    it("wraps the reply value", async () => {
        const reply = await replyToMessage({ type: "get-adapter-status" });
        expect(reply).toMatchObject({ ok: true, value: expect.any(Array) });
    });

    it("turns failures into an error reply instead of throwing", async () => {
        vi.mocked(computeImpact).mockImplementationOnce(() => {
            throw new Error("boom");
        });
        const reply = await replyToMessage(
            { type: "captured-response", payload: capturedResponse() },
            now,
        );
        expect(reply).toEqual({ ok: false, error: "boom" });
    });
});

describe("isBackgroundMessage", () => {
    it("accepts well-formed messages", () => {
        expect(
            isBackgroundMessage({ type: "captured-response", payload: capturedResponse() }),
        ).toBe(true);
        expect(isBackgroundMessage({ type: "get-adapter-status" })).toBe(true);
        expect(isBackgroundMessage({ type: "clear-usage-data" })).toBe(true);
    });

    it("rejects malformed messages", () => {
        expect(isBackgroundMessage(null)).toBe(false);
        expect(isBackgroundMessage({ type: "unknown" })).toBe(false);
        expect(
            isBackgroundMessage({
                type: "captured-response",
                payload: { ...capturedResponse(), provider: "mistral" },
            }),
        ).toBe(false);
        expect(
            isBackgroundMessage({ type: "adapter-failure", provider: "chatgpt", error: 1 }),
        ).toBe(false);
    });
});
