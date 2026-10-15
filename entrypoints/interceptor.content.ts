import { chatgptConversationEndpoint } from "@/src/adapters/chatgpt";
import { chatgptLoggedOutEndpoint } from "@/src/adapters/chatgpt-logged-out";
import { claudeCompletionEndpoint } from "@/src/adapters/claude";
import { offerChannel } from "@/src/capture/channel";
import { installFetchInterceptor, type RecordedStream } from "@/src/capture/interceptor";
import { SUPPORTED_PROVIDERS, matchPatterns } from "@/src/providers";

// Main world: no extension APIs here, results go to the bridge content script.
export default defineContentScript({
    matches: matchPatterns(...SUPPORTED_PROVIDERS),
    world: "MAIN",
    runAt: "document_start",
    main() {
        const debug = import.meta.env.DEV
            ? (step: string, details?: unknown) => console.debug("[ecologits]", step, details ?? "")
            : undefined;
        // Development only: keep the last raw streams to record fixtures from the console, with
        // `copy(__ecologitsStreams.at(-1).text)`. They contain the conversation: never ship this.
        const record = import.meta.env.DEV
            ? (stream: RecordedStream) => {
                  const target = window as unknown as { __ecologitsStreams?: RecordedStream[] };
                  target.__ecologitsStreams = [...(target.__ecologitsStreams ?? []), stream].slice(
                      -5,
                  );
                  debug?.("stream recorded", `${stream.text.length} chars, end: ${stream.end}`);
              }
            : undefined;
        const emit = offerChannel(window, window.location.origin);
        installFetchInterceptor(window, {
            captures: {
                chatgpt: { endpoints: [chatgptConversationEndpoint, chatgptLoggedOutEndpoint] },
                claude: { endpoints: [claudeCompletionEndpoint] },
            },
            emit,
            debug,
            record,
        });
        debug?.("interceptor installed");
    },
});
