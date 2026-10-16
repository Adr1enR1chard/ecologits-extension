import type { EcoLogitsModel } from "../messaging";
import { chatgptModels } from "./chatgpt/models";
import { claudeModels } from "./claude/models";
import { SUPPORTED_PROVIDERS, type SupportedProvider } from "./registry";
import type { ProviderModels } from "./types";

/** Model mapping of each supported provider. Used by the background. */
export const MODEL_MAPPINGS: Readonly<Record<SupportedProvider, ProviderModels>> = {
    chatgpt: chatgptModels,
    claude: claudeModels,
};

/** A web model estimated with a stand-in EcoLogits model, or range of models. */
export interface ProxyEntry {
    provider: SupportedProvider;
    slug: string;
    model: EcoLogitsModel;
}

/** Every proxy of the supported providers, in display order, for the methodology. */
export function proxyEntries(mappings = MODEL_MAPPINGS): ProxyEntry[] {
    return SUPPORTED_PROVIDERS.flatMap((provider) =>
        Object.entries(mappings[provider].proxies).map(([slug, model]) => ({
            provider,
            slug,
            model,
        })),
    );
}
