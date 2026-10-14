import { logger } from "@ecologits/ecologits.js";
import { replyToMessage } from "@/src/handler";
import { isBackgroundMessage } from "@/src/messaging";

export default defineBackground(() => {
    // EcoLogits warnings are returned with each result; keep the worker console quiet.
    logger.setSink(() => undefined);

    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (sender.id !== browser.runtime.id || !isBackgroundMessage(message)) return;
        void replyToMessage(message).then((reply) => {
            if (!reply.ok) console.error("[ecologits] failed to handle", message.type, reply.error);
            sendResponse(reply);
        });
        // Keep the channel open for the async reply (works on Chrome and Firefox).
        return true;
    });
});
