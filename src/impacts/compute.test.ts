import { RangeValue, logger } from "@ecologits/ecologits.js";
import { beforeAll, describe, expect, it } from "vitest";
import { CRITERIA, EMBODIED_CRITERIA, type ImpactRange } from "../messaging";
import { MODEL_MAPPINGS } from "../providers/models";
import { capturedResponse } from "../test-utils";
import { computeImpact, countTokens, toRange } from "./compute";

beforeAll(() => {
    logger.setSink(() => undefined);
});

function expectOrdered({ min, median, max }: ImpactRange) {
    expect(min).toBeGreaterThan(0);
    expect(min).toBeLessThanOrEqual(median);
    expect(median).toBeLessThanOrEqual(max);
}

describe("countTokens", () => {
    it("counts o200k_base tokens", () => {
        expect(countTokens("")).toBe(0);
        expect(countTokens("hello world")).toBe(2);
    });

    it("counts special-token strings as plain text", () => {
        expect(countTokens("<|endoftext|>")).toBeGreaterThan(1);
    });
});

describe("toRange", () => {
    it("expands scalars", () => {
        expect(toRange(2)).toEqual({ min: 2, median: 2, max: 2 });
    });

    it("uses the midpoint of a RangeValue as median", () => {
        expect(toRange(new RangeValue(1, 3))).toEqual({ min: 1, median: 2, max: 3 });
    });
});

describe("computeImpact", () => {
    const timestamp = 1_760_000_000_000;

    it("computes every criterion as an ordered range", () => {
        const result = computeImpact(capturedResponse(), timestamp);

        expect(result).toMatchObject({
            messageId: "msg-1",
            provider: "chatgpt",
            rawModel: "gpt-5",
            model: "gpt-5",
            timestamp,
            outputTokens: countTokens(capturedResponse().outputText),
            latencySeconds: 4,
            flags: { lowerBound: false, approximatedModel: false },
            errors: [],
        });
        const impacts = result.impacts!;
        for (const c of CRITERIA) {
            expectOrdered(impacts.total[c]);
            expectOrdered(impacts.usage[c]);
        }
        for (const c of EMBODIED_CRITERIA) expectOrdered(impacts.embodied[c]);
        expect(impacts.total.energy).toEqual(impacts.usage.energy);
    });

    it("never stores message content", () => {
        const captured = capturedResponse({ outputText: "secret answer", reasoningText: "hmm" });
        const serialized = JSON.stringify(computeImpact(captured, timestamp));
        expect(serialized).not.toContain("secret answer");
        expect(serialized).not.toContain("hmm");
    });

    it("propagates EcoLogits warnings", () => {
        const result = computeImpact(capturedResponse(), timestamp);
        expect(result.warnings.map((w) => w.code)).toContain("model-arch-not-released");
    });

    it("counts streamed reasoning as output", () => {
        const plain = computeImpact(capturedResponse(), timestamp);
        const reasoning = computeImpact(
            capturedResponse({ reasoningText: "Let me think about this." }),
            timestamp,
        );
        expect(reasoning.outputTokens).toBe(
            plain.outputTokens + countTokens("Let me think about this."),
        );
        expect(reasoning.impacts!.total.energy.median).toBeGreaterThan(
            plain.impacts!.total.energy.median,
        );
    });

    it("flags hidden reasoning as a lower bound", () => {
        const result = computeImpact(capturedResponse({ hiddenReasoning: true }), timestamp);
        expect(result.flags.lowerBound).toBe(true);
    });

    it("flags replies stopped by the user as partial", () => {
        expect(computeImpact(capturedResponse(), timestamp).flags.partial).toBe(false);
        const result = computeImpact(capturedResponse({ partial: true }), timestamp);
        expect(result.flags.partial).toBe(true);
        expect(result.impacts).not.toBeNull();
    });

    it("falls back for unknown models and flags it", () => {
        const result = computeImpact(capturedResponse({ rawModel: "gpt-unknown" }), timestamp);
        expect(result.model).toBe(MODEL_MAPPINGS.chatgpt.fallback);
        expect(result.flags.approximatedModel).toBe(true);
        expect(result.impacts).not.toBeNull();
    });

    it("treats an unusable latency as unknown", () => {
        const result = computeImpact(capturedResponse({ latencyMs: 0 }), timestamp);
        expect(result.latencySeconds).toBeNull();
        expect(result.impacts).not.toBeNull();
    });

    it("returns EcoLogits errors without impacts", () => {
        const mappings = {
            ...MODEL_MAPPINGS,
            chatgpt: { ...MODEL_MAPPINGS.chatgpt, fallback: "not-a-model" },
        };
        const result = computeImpact(capturedResponse({ rawModel: null }), timestamp, mappings);
        expect(result.impacts).toBeNull();
        expect(result.errors.map((e) => e.code)).toEqual(["model-not-registered"]);
    });
});
