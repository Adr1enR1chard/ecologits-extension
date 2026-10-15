import type { CapturedResponse, ImpactRange, ImpactResult, Impacts } from "./messaging";

export function capturedResponse(overrides: Partial<CapturedResponse> = {}): CapturedResponse {
    return {
        provider: "chatgpt",
        rawModel: "gpt-5",
        outputText: "The quick brown fox jumps over the lazy dog.",
        reasoningText: null,
        hiddenReasoning: false,
        latencyMs: 4000,
        messageId: "msg-1",
        partial: false,
        ...overrides,
    };
}

function range(value: number): ImpactRange {
    return { min: value / 2, median: value, max: value * 1.5 };
}

/** Impacts where every criterion equals `value` (min = value / 2, max = value × 1.5). */
export function uniformImpacts(value: number): Impacts {
    return {
        total: {
            energy: range(value),
            gwp: range(value),
            adpe: range(value),
            pe: range(value),
            wcf: range(value),
        },
        usage: {
            energy: range(value),
            gwp: range(value),
            adpe: range(value),
            pe: range(value),
            wcf: range(value),
        },
        embodied: { gwp: range(value), adpe: range(value), pe: range(value) },
    };
}

export function impactResult(overrides: Partial<ImpactResult> = {}): ImpactResult {
    return {
        messageId: "msg-1",
        provider: "chatgpt",
        rawModel: "gpt-5",
        model: "gpt-5",
        timestamp: new Date(2026, 9, 14, 12).getTime(),
        outputTokens: 100,
        latencySeconds: 4,
        impacts: uniformImpacts(1),
        flags: { lowerBound: false, approximatedModel: false, partial: false },
        warnings: [],
        errors: [],
        ...overrides,
    };
}
