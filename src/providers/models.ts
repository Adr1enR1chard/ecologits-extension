import { chatgptModels } from "./chatgpt/models";
import { claudeModels } from "./claude/models";
import type { SupportedProvider } from "./registry";
import type { ProviderModels } from "./types";

/** Model mapping of each supported provider. Used by the background. */
export const MODEL_MAPPINGS: Readonly<Record<SupportedProvider, ProviderModels>> = {
    chatgpt: chatgptModels,
    claude: claudeModels,
};
