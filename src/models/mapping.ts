import { models, type Providers } from "@ecologits/ecologits.js";
import type { WebProvider } from "../messaging";
import { canonicalizeChatGptSlug } from "./chatgpt-slugs";
import { canonicalizeClaudeSlug } from "./claude-slugs";

export interface ProviderModelMapping {
    ecologitsProvider: Providers;
    /** EcoLogits model used when the web model is unknown or not exposed. */
    fallback: string;
    /** Normalised web slug → EcoLogits model ID, for slugs EcoLogits does not know as-is. */
    aliases: Readonly<Record<string, string>>;
    /** Rewrites a normalised web slug into its EcoLogits form, tried after the aliases. */
    canonicalize?: (slug: string) => string;
}

// Aliases are filled in by each provider adapter phase.
export const MODEL_MAPPINGS: Readonly<Record<WebProvider, ProviderModelMapping>> = {
    chatgpt: {
        ecologitsProvider: "openai",
        // Also used for "auto", where ChatGPT picks the model.
        fallback: "gpt-5",
        aliases: {
            // ChatGPT's former default, absent from EcoLogits as `gpt-4o-chat-latest`.
            "chatgpt-4o-latest": "gpt-4o",
        },
        canonicalize: canonicalizeChatGptSlug,
    },
    claude: {
        ecologitsProvider: "anthropic",
        // claude.ai only sends the model when it is not the default one.
        fallback: "claude-sonnet-4-5",
        aliases: {},
        canonicalize: canonicalizeClaudeSlug,
    },
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

/**
 * Resolves a web model slug: alias table, then EcoLogits as-is, then the same with the
 * canonical slug, then the provider fallback.
 */
export function resolveModel(
    provider: WebProvider,
    rawModel: string | null,
    mappings: Readonly<Record<WebProvider, ProviderModelMapping>> = MODEL_MAPPINGS,
): ResolvedModel {
    const { ecologitsProvider, fallback, aliases, canonicalize } = mappings[provider];
    if (rawModel !== null) {
        const normalized = normalizeSlug(rawModel);
        const candidates = [normalized];
        if (canonicalize) candidates.push(canonicalize(normalized));
        for (const slug of candidates) {
            // Own keys only: slugs come from the page and could be "constructor" or "__proto__".
            if (Object.hasOwn(aliases, slug)) {
                return { ecologitsProvider, modelName: aliases[slug]!, approximated: false };
            }
            if (slug !== "" && models.findModel(ecologitsProvider, slug) !== undefined) {
                return { ecologitsProvider, modelName: slug, approximated: false };
            }
        }
    }
    return { ecologitsProvider, modelName: fallback, approximated: true };
}
