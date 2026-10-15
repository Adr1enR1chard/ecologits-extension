import type {
    AdapterStatus,
    ImpactRange,
    ImpactResult,
    Impacts,
    WebProvider,
} from "@/src/messaging";
import { addToAggregates, type DailyAggregates } from "@/src/storage/aggregates";

const HOUR = 3_600_000;

function range(median: number, spread = 0.5): ImpactRange {
    return { min: median * (1 - spread), median, max: median * (1 + spread) };
}

/** Plausible impacts of a reply consuming `energy` kWh. */
function impacts(energy: number): Impacts {
    const usage = {
        energy: range(energy),
        gwp: range(energy * 0.4),
        adpe: range(energy * 2e-8),
        pe: range(energy * 9),
        wcf: range(energy * 1.8),
    };
    const embodied = { gwp: range(energy * 0.02), adpe: range(energy * 4e-8), pe: range(0.01) };
    return {
        usage,
        embodied,
        total: {
            ...usage,
            gwp: range(usage.gwp.median + embodied.gwp.median),
            adpe: range(usage.adpe.median + embodied.adpe.median),
            pe: range(usage.pe.median + embodied.pe.median),
        },
    };
}

export function sampleResult(overrides: Partial<ImpactResult> = {}): ImpactResult {
    return {
        messageId: "sample",
        provider: "chatgpt",
        rawModel: "gpt-5",
        model: "gpt-5",
        timestamp: Date.now(),
        outputTokens: 742,
        latencySeconds: 9,
        impacts: impacts(0.0042),
        flags: { lowerBound: false, approximatedModel: false },
        warnings: [],
        errors: [],
        ...overrides,
    };
}

const REPLIES: [WebProvider, string, number, Partial<ImpactResult["flags"]>][] = [
    ["chatgpt", "gpt-5", 0.0042, {}],
    ["chatgpt", "gpt-5", 0.0031, { lowerBound: true }],
    ["chatgpt", "gpt-5-mini", 0.0006, {}],
    ["claude", "claude-sonnet-5-5", 0.0027, {}],
    ["claude", "claude-opus-5-5", 0.0089, { approximatedModel: true }],
];

/** A few days of replies on several providers and models. */
export function sampleAggregates(now = Date.now()): DailyAggregates {
    let aggregates: DailyAggregates = {};
    for (let day = 0; day < 10; day++) {
        REPLIES.forEach(([provider, model, energy, flags], i) => {
            aggregates = addToAggregates(
                aggregates,
                sampleResult({
                    provider,
                    model,
                    timestamp: now - day * 24 * HOUR - i * HOUR,
                    impacts: impacts(energy),
                    flags: { lowerBound: false, approximatedModel: false, ...flags },
                }),
            );
        });
    }
    return aggregates;
}

export function sampleStatuses(now = Date.now()): Partial<Record<WebProvider, AdapterStatus>> {
    return {
        chatgpt: {
            provider: "chatgpt",
            lastSuccessAt: now - HOUR,
            lastFailureAt: null,
            lastError: null,
        },
        claude: {
            provider: "claude",
            lastSuccessAt: now - 3 * HOUR,
            lastFailureAt: now - HOUR,
            lastError: "No model in the completion request",
        },
    };
}
