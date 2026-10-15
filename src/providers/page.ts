import { chatgptPage } from "./chatgpt/page";
import { claudePage } from "./claude/page";
import type { SupportedProvider } from "./registry";
import type { ProviderPage } from "./types";

/** Reply markup of each supported provider. Used by the bridge content script. */
export const PAGES: Readonly<Record<SupportedProvider, ProviderPage>> = {
    chatgpt: chatgptPage,
    claude: claudePage,
};
