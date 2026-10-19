import type { ProviderModels } from "../types";

/**
 * Gemini model names, as sent by gemini.google.com: the label of the model picker
 * (`3.5 Flash-Lite`), without the `Gemini` of the product. EcoLogits knows the API IDs
 * (`gemini-3.5-flash-lite`).
 */

const SEPARATORS = /[\s_]+/g;

/** Rewrites a normalised Gemini model label into its EcoLogits form. */
export function canonicalizeGeminiSlug(slug: string): string {
    const id = slug.replace(SEPARATORS, "-");
    return id.startsWith("gemini-") ? id : `gemini-${id}`;
}

export const geminiModels: ProviderModels = {
    ecologitsProvider: "google_genai",
    // Used when the turn carries no label: the API's alias of the current Flash.
    fallback: "gemini-flash-latest",
    aliases: {},
    proxies: {},
    canonicalize: canonicalizeGeminiSlug,
};

export default geminiModels;
