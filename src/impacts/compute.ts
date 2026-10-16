import {
    isRangeValue,
    llmImpacts,
    type BaseImpact,
    type ImpactsOutput,
    type StatusMessage,
    type ValueOrRange,
} from "@ecologits/ecologits.js";
import { countTokens as countO200kTokens } from "gpt-tokenizer/encoding/o200k_base";
import type {
    CapturedResponse,
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

function toImpacts({ energy, gwp, adpe, pe, wcf, usage, embodied }: ImpactsOutput): Impacts | null {
    if (!(energy && gwp && adpe && pe && wcf && usage && embodied)) return null;
    return {
        total: {
            energy: rangeOf(energy),
            gwp: rangeOf(gwp),
            adpe: rangeOf(adpe),
            pe: rangeOf(pe),
            wcf: rangeOf(wcf),
        },
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

/** From the low bound of `low` to the high bound of `high`, with its midpoint as median. */
function spanRange(low: ImpactRange, high: ImpactRange): ImpactRange {
    const min = Math.min(low.min, high.min);
    const max = Math.max(low.max, high.max);
    return { min, median: (min + max) / 2, max };
}

function spanCriteria<K extends string>(
    low: Record<K, ImpactRange>,
    high: Record<K, ImpactRange>,
): Record<K, ImpactRange> {
    const keys = Object.keys(low) as K[];
    return Object.fromEntries(keys.map((k) => [k, spanRange(low[k], high[k])])) as Record<
        K,
        ImpactRange
    >;
}

function spanImpacts(low: Impacts, high: Impacts): Impacts {
    return {
        total: spanCriteria(low.total, high.total),
        usage: spanCriteria(low.usage, high.usage),
        embodied: spanCriteria(low.embodied, high.embodied),
    };
}

function uniqueCodes(a: StatusCode[], b: StatusCode[] = []): StatusCode[] {
    const codes = new Set(a.map((s) => s.code));
    return [...a, ...b.filter((s) => !codes.has(s.code))];
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

    const compute = (modelName: string) => {
        const output = llmImpacts({
            provider: resolved.ecologitsProvider,
            modelName,
            outputTokenCount: outputTokens,
            // An unknown latency leaves the generation time unbounded.
            requestLatency: latencySeconds ?? Infinity,
        });
        return {
            impacts: toImpacts(output),
            warnings: toStatusCodes(output.warnings),
            errors: toStatusCodes(output.errors),
        };
    };
    const low = compute(resolved.modelName);
    const { upperModelName } = resolved;
    const high = upperModelName === undefined ? null : compute(upperModelName);
    const impacts =
        high === null
            ? low.impacts
            : low.impacts && high.impacts && spanImpacts(low.impacts, high.impacts);

    return {
        messageId: captured.messageId,
        provider: captured.provider,
        rawModel: captured.rawModel,
        model:
            upperModelName === undefined
                ? resolved.modelName
                : `${resolved.modelName} – ${upperModelName}`,
        timestamp,
        outputTokens,
        latencySeconds,
        impacts,
        flags: {
            lowerBound: captured.hiddenReasoning,
            approximatedModel: resolved.approximated,
            partial: captured.partial,
        },
        warnings: uniqueCodes(low.warnings, high?.warnings),
        errors: uniqueCodes(low.errors, high?.errors),
    };
}
