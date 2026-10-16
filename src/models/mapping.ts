import { models, type Providers } from "@ecologits/ecologits.js";
import { MODEL_MAPPINGS } from "../providers/models";
import type { SupportedProvider } from "../providers/registry";
import type { ProviderModels } from "../providers/types";

export interface ResolvedModel {
    ecologitsProvider: Providers;
    /** EcoLogits model the impacts are computed with: the low end, with `upperModelName`. */
    modelName: string;
    /** EcoLogits model of the high end, when the web model spans a range of models. */
    upperModelName?: string;
    approximated: boolean;
}

export function normalizeSlug(slug: string): string {
    return slug.trim().toLowerCase();
}

/**
 * Resolves a web model slug: alias table, then proxies, then EcoLogits as-is, then the same with the
 * canonical slug, then the provider fallback.
 */
export function resolveModel(
    provider: SupportedProvider,
    rawModel: string | null,
    mappings: Readonly<Record<SupportedProvider, ProviderModels>> = MODEL_MAPPINGS,
): ResolvedModel {
    const { ecologitsProvider, fallback, aliases, proxies = {}, canonicalize } = mappings[provider];
    if (rawModel !== null) {
        const normalized = normalizeSlug(rawModel);
        const candidates = [normalized];
        if (canonicalize) candidates.push(canonicalize(normalized));
        for (const slug of candidates) {
            // Own keys only: slugs come from the page and could be "constructor" or "__proto__".
            if (Object.hasOwn(aliases, slug)) {
                return { ecologitsProvider, modelName: aliases[slug]!, approximated: false };
            }
            if (Object.hasOwn(proxies, slug)) {
                const proxy = proxies[slug]!;
                if (typeof proxy === "string") {
                    return { ecologitsProvider, modelName: proxy, approximated: true };
                }
                const { low, high } = proxy;
                return {
                    ecologitsProvider,
                    modelName: low,
                    upperModelName: high,
                    approximated: true,
                };
            }
            if (slug !== "" && models.findModel(ecologitsProvider, slug) !== undefined) {
                return { ecologitsProvider, modelName: slug, approximated: false };
            }
        }
    }
    return { ecologitsProvider, modelName: fallback, approximated: true };
}
