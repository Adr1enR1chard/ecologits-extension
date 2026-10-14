import { browser } from "wxt/browser";
import type { BackgroundMessage, BackgroundReplies, BackgroundReply } from "@/src/messaging";

/** Sends a message to the background and returns its reply value; rejects when it failed. */
export async function sendToBackground<T extends BackgroundMessage>(
    message: T,
): Promise<BackgroundReplies[T["type"]]> {
    const reply = (await browser.runtime.sendMessage(message)) as BackgroundReply<
        BackgroundReplies[T["type"]]
    >;
    if (!reply.ok) throw new Error(reply.error);
    return reply.value;
}
