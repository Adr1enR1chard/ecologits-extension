import {
    isRangeValue,
    llmImpacts,
    type BaseImpact,
    type StatusMessage,
    type ValueOrRange,
} from "@ecologits/ecologits.js";
import { countTokens as countO200kTokens } from "gpt-tokenizer/encoding/o200k_base";
import type {
    CapturedResponse,
    CriterionImpacts,
    ImpactRange,
    ImpactResult,
    Impacts,
    StatusCode,
} from "../messaging";
import { resolveModel } from "../models/mapping";
import { MODEL_MAPPINGS } from "../providers/models";

// Replies may legitimately contain special-token strings such as "<|endoftext|>": count them
// as plain text instead of throwing.
const ENCODE_OPTIONS = { disallowedSpecial: new Set<string>() };

/** Counts tokens with `o200k_base`; an approximation for non-OpenAI providers. */
export function countTokens(text: string): number {
    return text === "" ? 0 : countO200kTokens(text, ENCODE_OPTIONS);
}

export function toRange(value: ValueOrRange): ImpactRange {
    if (isRangeValue(value)) {
        return { min: value.min, median: value.mean, max: value.max };
    }
    return { min: value, median: value, max: value };
}

function rangeOf(impact: BaseImpact): ImpactRange {
    return toRange(impact.value);
}

function toStatusCodes(messages: readonly StatusMessage[] | null): StatusCode[] {
    return (messages ?? []).map(({ code, message }) => ({ code, message }));
}

/** Seconds, or `null` when the measured latency is unusable. */
function toLatencySeconds(latencyMs: number): number | null {
    return Number.isFinite(latencyMs) && latencyMs > 0 ? latencyMs / 1000 : null;
}

export function computeImpact(
    captured: CapturedResponse,
    timestamp: number = Date.now(),
    mappings = MODEL_MAPPINGS,
): ImpactResult {
    const resolved = resolveModel(captured.provider, captured.rawModel, mappings);
    const outputTokens =
        countTokens(captured.outputText) + countTokens(captured.reasoningText ?? "");
    const latencySeconds = toLatencySeconds(captured.latencyMs);

    const output = llmImpacts({
        provider: resolved.ecologitsProvider,
        modelName: resolved.modelName,
        outputTokenCount: outputTokens,
        // An unknown latency leaves the generation time unbounded.
        requestLatency: latencySeconds ?? Infinity,
    });

    let impacts: Impacts | null = null;
    const { energy, gwp, adpe, pe, wcf, usage, embodied } = output;
    if (energy && gwp && adpe && pe && wcf && usage && embodied) {
        const total: CriterionImpacts = {
            energy: rangeOf(energy),
            gwp: rangeOf(gwp),
            adpe: rangeOf(adpe),
            pe: rangeOf(pe),
            wcf: rangeOf(wcf),
        };
        impacts = {
            total,
            usage: {
                energy: rangeOf(usage.energy),
                gwp: rangeOf(usage.gwp),
                adpe: rangeOf(usage.adpe),
                pe: rangeOf(usage.pe),
                wcf: rangeOf(usage.wcf),
            },
            embodied: {
                gwp: rangeOf(embodied.gwp),
                adpe: rangeOf(embodied.adpe),
                pe: rangeOf(embodied.pe),
            },
        };
    }

    return {
        messageId: captured.messageId,
        provider: captured.provider,
        rawModel: captured.rawModel,
        model: resolved.modelName,
        timestamp,
        outputTokens,
        latencySeconds,
        impacts,
        flags: {
            lowerBound: captured.hiddenReasoning,
            approximatedModel: resolved.approximated,
        },
        warnings: toStatusCodes(output.warnings),
        errors: toStatusCodes(output.errors),
    };
}
