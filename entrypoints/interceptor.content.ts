import { chatgptAdapter } from "@/src/adapters/chatgpt";
import { offerChannel } from "@/src/capture/channel";
import { installFetchInterceptor } from "@/src/capture/interceptor";
import { matchPatterns } from "@/src/providers";

// Main world: no extension APIs here, results go to the bridge content script.
export default defineContentScript({
    matches: matchPatterns("chatgpt"),
    world: "MAIN",
    runAt: "document_start",
    main() {
        const debug = import.meta.env.DEV
            ? (step: string, details?: unknown) => console.debug("[ecologits]", step, details ?? "")
            : undefined;
        const emit = offerChannel(window, window.location.origin);
        installFetchInterceptor(window, { adapters: [chatgptAdapter], emit, debug });
        debug?.("interceptor installed");
    },
});
