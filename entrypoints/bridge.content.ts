import { relay } from "@/src/capture/bridge";
import { acceptChannel } from "@/src/capture/channel";
import { matchPatterns, providerForHost } from "@/src/providers";

export default defineContentScript({
    matches: matchPatterns("chatgpt"),
    runAt: "document_start",
    main() {
        const provider = providerForHost(window.location.hostname);
        if (provider === null) return;
        const debug = import.meta.env.DEV
            ? (step: string, details?: unknown) => console.debug("[ecologits]", step, details ?? "")
            : () => undefined;
        const send = async (message: unknown) => {
            const reply: unknown = await browser.runtime.sendMessage(message);
            debug("background reply", reply);
            return reply;
        };
        acceptChannel(window, window.location.origin, (data) => {
            debug("bridge received", data);
            // The in-page badge (phase 3) renders the result.
            void relay(data, provider, send);
        });
        debug("bridge installed", provider);
    },
});
