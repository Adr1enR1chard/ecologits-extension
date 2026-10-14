import { models, type Providers } from "@ecologits/ecologits.js";
import type { WebProvider } from "../messaging";

export interface ProviderModelMapping {
    ecologitsProvider: Providers;
    /** EcoLogits model used when the web model is unknown or not exposed. */
    fallback: string;
    /** Normalised web slug → EcoLogits model ID, for slugs EcoLogits does not know as-is. */
    aliases: Readonly<Record<string, string>>;
}

// Aliases are filled in by each provider adapter phase.
export const MODEL_MAPPINGS: Readonly<Record<WebProvider, ProviderModelMapping>> = {
    chatgpt: { ecologitsProvider: "openai", fallback: "gpt-5", aliases: {} },
    claude: { ecologitsProvider: "anthropic", fallback: "claude-sonnet-4-5", aliases: {} },
    gemini: { ecologitsProvider: "google_genai", fallback: "gemini-2.5-flash", aliases: {} },
};

export interface ResolvedModel {
    ecologitsProvider: Providers;
    modelName: string;
    approximated: boolean;
}

export function normalizeSlug(slug: string): string {
    return slug.trim().toLowerCase();
}

/** Resolves a web model slug: alias table, then EcoLogits as-is, then the provider fallback. */
export function resolveModel(
    provider: WebProvider,
    rawModel: string | null,
    mappings: Readonly<Record<WebProvider, ProviderModelMapping>> = MODEL_MAPPINGS,
): ResolvedModel {
    const { ecologitsProvider, fallback, aliases } = mappings[provider];
    if (rawModel !== null) {
        const slug = normalizeSlug(rawModel);
        // Own keys only: slugs come from the page and could be "constructor" or "__proto__".
        if (Object.hasOwn(aliases, slug)) {
            return { ecologitsProvider, modelName: aliases[slug]!, approximated: false };
        }
        if (slug !== "" && models.findModel(ecologitsProvider, slug) !== undefined) {
            return { ecologitsProvider, modelName: slug, approximated: false };
        }
    }
    return { ecologitsProvider, modelName: fallback, approximated: true };
}
