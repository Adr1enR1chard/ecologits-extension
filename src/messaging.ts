/**
 * Typed contracts exchanged between the main-world interceptor, the isolated content script,
 * the background service worker and the extension pages.
 */

export const WEB_PROVIDERS = ["chatgpt", "claude", "gemini"] as const;
export type WebProvider = (typeof WEB_PROVIDERS)[number];

/** Impact criteria reported by EcoLogits. */
export const CRITERIA = ["energy", "gwp", "adpe", "pe", "wcf"] as const;
export type Criterion = (typeof CRITERIA)[number];

/** Criteria that have an embodied counterpart (water is usage-only). */
export const EMBODIED_CRITERIA = ["gwp", "adpe", "pe"] as const;
export type EmbodiedCriterion = (typeof EMBODIED_CRITERIA)[number];

/** Units of every stored value, as returned by EcoLogits. */
export const CRITERION_UNITS: Readonly<Record<Criterion, string>> = {
    energy: "kWh",
    gwp: "kgCO2eq",
    adpe: "kgSbeq",
    pe: "MJ",
    wcf: "L",
};

/** A criterion value; scalars from EcoLogits have `min === median === max`. */
export interface ImpactRange {
    min: number;
    /** Midpoint of the EcoLogits range. */
    median: number;
    max: number;
}

export type CriterionImpacts = Record<Criterion, ImpactRange>;
export type EmbodiedImpacts = Record<EmbodiedCriterion, ImpactRange>;

export interface Impacts {
    total: CriterionImpacts;
    usage: CriterionImpacts;
    embodied: EmbodiedImpacts;
}

export interface ImpactFlags {
    /** Hidden reasoning tokens were not counted: the estimate is a lower bound. */
    lowerBound: boolean;
    /** The web model could not be mapped and the provider fallback model was used. */
    approximatedModel: boolean;
}

/** An EcoLogits warning or error, serialised. */
export interface StatusCode {
    code: string;
    message: string;
}

/** What an adapter extracts from a provider response stream. */
export interface CapturedResponse {
    provider: WebProvider;
    /** Model slug as exposed by the web app, `null` when not exposed. */
    rawModel: string | null;
    outputText: string;
    /** Streamed reasoning text, when the provider exposes it. */
    reasoningText: string | null;
    /** The model reasoned but the reasoning was not streamed. */
    hiddenReasoning: boolean;
    /** Request start to stream end, in milliseconds. */
    latencyMs: number;
    messageId: string | null;
}

/** Computed impacts of one assistant reply. Never contains message content. */
export interface ImpactResult {
    messageId: string | null;
    provider: WebProvider;
    rawModel: string | null;
    /** EcoLogits model ID actually used for the computation. */
    model: string;
    /** Epoch milliseconds. */
    timestamp: number;
    outputTokens: number;
    /** `null` when the measured latency was unusable. */
    latencySeconds: number | null;
    /** `null` when EcoLogits returned an error. */
    impacts: Impacts | null;
    flags: ImpactFlags;
    warnings: StatusCode[];
    errors: StatusCode[];
}

export interface AdapterStatus {
    provider: WebProvider;
    lastSuccessAt: number | null;
    lastFailureAt: number | null;
    lastError: string | null;
}

export type BackgroundMessage =
    | { type: "captured-response"; payload: CapturedResponse }
    | { type: "adapter-failure"; provider: WebProvider; error: string }
    | { type: "get-adapter-status" };

/** Reply value for each background message. */
export interface BackgroundReplies {
    "captured-response": ImpactResult;
    "adapter-failure": null;
    "get-adapter-status": AdapterStatus[];
}

/** What the background actually sends back: the reply value, or why it could not be produced. */
export type BackgroundReply<T> = { ok: true; value: T } | { ok: false; error: string };

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isNullableString(value: unknown): value is string | null {
    return value === null || typeof value === "string";
}

export function isWebProvider(value: unknown): value is WebProvider {
    return (WEB_PROVIDERS as readonly unknown[]).includes(value);
}

export function isCapturedResponse(value: unknown): value is CapturedResponse {
    return (
        isRecord(value) &&
        isWebProvider(value.provider) &&
        isNullableString(value.rawModel) &&
        typeof value.outputText === "string" &&
        isNullableString(value.reasoningText) &&
        typeof value.hiddenReasoning === "boolean" &&
        typeof value.latencyMs === "number" &&
        isNullableString(value.messageId)
    );
}

export function isBackgroundMessage(value: unknown): value is BackgroundMessage {
    if (!isRecord(value)) return false;
    switch (value.type) {
        case "captured-response":
            return isCapturedResponse(value.payload);
        case "adapter-failure":
            return isWebProvider(value.provider) && typeof value.error === "string";
        case "get-adapter-status":
            return true;
        default:
            return false;
    }
}
