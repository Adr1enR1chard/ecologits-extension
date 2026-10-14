import {
    isBackgroundMessage,
    type BackgroundReply,
    type ImpactResult,
    type WebProvider,
} from "../messaging";
import type { CaptureMessage } from "./channel";

/** Accepts only well-formed capture messages for the provider of the current page. */
export function toCaptureMessage(data: unknown, provider: WebProvider): CaptureMessage | null {
    if (!isBackgroundMessage(data)) return null;
    switch (data.type) {
        case "captured-response":
            return data.payload.provider === provider ? data : null;
        case "adapter-failure":
            return data.provider === provider ? data : null;
        default:
            return null;
    }
}

export type SendToBackground = (message: CaptureMessage) => Promise<unknown>;

/**
 * Validates a message from the interceptor and forwards it to the background. Resolves with the
 * computed impacts of a captured reply, or `null`; never rejects.
 */
export async function relay(
    data: unknown,
    provider: WebProvider,
    send: SendToBackground,
): Promise<ImpactResult | null> {
    const message = toCaptureMessage(data, provider);
    if (message === null) return null;
    let reply: BackgroundReply<unknown> | undefined;
    try {
        reply = (await send(message)) as BackgroundReply<unknown> | undefined;
    } catch {
        // The extension was reloaded or updated: this page's context is gone.
        return null;
    }
    if (message.type !== "captured-response" || !reply?.ok) return null;
    return reply.value as ImpactResult;
}
