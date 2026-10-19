import { computeImpact } from "./impacts/compute";
import type {
    BackgroundMessage,
    BackgroundReplies,
    BackgroundReply,
    CapturedResponse,
    ImpactResult,
} from "./messaging";
import { MODEL_MAPPINGS } from "./providers/models";
import { clearUsageData, recordImpact } from "./storage";
import { getAdapterStatuses, recordAdapterFailure, recordAdapterSuccess } from "./storage/health";

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Computes, persists and returns the impacts of a captured reply. Replies EcoLogits cannot
 * compute are reported as adapter failures, so the popup never shows a silent success. A beta
 * provider without models yet has nothing to compute: its replies are refused, without failure.
 */
export async function processCapturedResponse(
    captured: CapturedResponse,
    now: number = Date.now(),
): Promise<ImpactResult> {
    if (MODEL_MAPPINGS[captured.provider] === undefined) {
        throw new Error(`no models for ${captured.provider} yet`);
    }
    let result: ImpactResult;
    try {
        result = computeImpact(captured, now);
    } catch (error) {
        await recordAdapterFailure(captured.provider, errorMessage(error), now);
        throw error;
    }
    if (result.impacts === null) {
        const codes = result.errors.map((e) => e.code).join(", ");
        await recordAdapterFailure(captured.provider, codes || "no impacts computed", now);
    } else {
        await Promise.all([recordImpact(result), recordAdapterSuccess(captured.provider, now)]);
    }
    return result;
}

export function handleBackgroundMessage<T extends BackgroundMessage>(
    message: T,
    now?: number,
): Promise<BackgroundReplies[T["type"]]>;
export async function handleBackgroundMessage(
    message: BackgroundMessage,
    now: number = Date.now(),
): Promise<BackgroundReplies[BackgroundMessage["type"]]> {
    switch (message.type) {
        case "captured-response":
            return processCapturedResponse(message.payload, now);
        case "adapter-failure":
            await recordAdapterFailure(message.provider, message.error, now);
            return null;
        case "get-adapter-status":
            return getAdapterStatuses();
        case "clear-usage-data":
            await clearUsageData();
            return null;
    }
}

/** Handles a message and wraps the outcome, so callers never receive an untyped failure. */
export async function replyToMessage<T extends BackgroundMessage>(
    message: T,
    now?: number,
): Promise<BackgroundReply<BackgroundReplies[T["type"]]>> {
    try {
        return { ok: true, value: await handleBackgroundMessage(message, now) };
    } catch (error) {
        return { ok: false, error: errorMessage(error) };
    }
}
