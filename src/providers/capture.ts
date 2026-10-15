import type { ProviderCapture } from "../capture/types";
import { chatgptCapture } from "./chatgpt/capture";
import { claudeCapture } from "./claude/capture";
import type { SupportedProvider } from "./registry";

/** Reply endpoints of each supported provider. Imported only by the main-world interceptor. */
export const CAPTURES: Readonly<Record<SupportedProvider, ProviderCapture>> = {
    chatgpt: chatgptCapture,
    claude: claudeCapture,
};
