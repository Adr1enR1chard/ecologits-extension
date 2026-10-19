import { models, type Providers } from "@ecologits/ecologits.js";
import type { EcoLogitsModel } from "../messaging";
import { MODEL_MAPPINGS, type ModelMappings } from "../providers/models";
import type { CapturedProvider } from "../providers/registry";

export interface ResolvedModel {
    ecologitsProvider: Providers;
    /** EcoLogits model, or range of models, the impacts are computed with. */
    model: EcoLogitsModel;
    approximated: boolean;
}

export function normalizeSlug(slug: string): string {
    return slug.trim().toLowerCase();
}

/**
 * Resolves a web model slug: alias table, then EcoLogits as-is, then the same with the
 * canonical slug, then the proxies, then the provider fallback. Proxies come after EcoLogits,
 * so a model it learns wins over the proxy standing in for it.
 */
export function resolveModel(
    provider: CapturedProvider,
    rawModel: string | null,
    mappings: ModelMappings = MODEL_MAPPINGS,
): ResolvedModel {
    const providerModels = mappings[provider];
    // A beta provider may not have its `models.ts` yet.
    if (providerModels === undefined) throw new Error(`no models for ${provider}`);
    const { ecologitsProvider, fallback, aliases, proxies, canonicalize } = providerModels;
    if (rawModel !== null) {
        const normalized = normalizeSlug(rawModel);
        const candidates = [normalized];
        if (canonicalize) candidates.push(canonicalize(normalized));
        for (const slug of candidates) {
            // Own keys only: slugs come from the page and could be "constructor" or "__proto__".
            if (Object.hasOwn(aliases, slug)) {
                return { ecologitsProvider, model: aliases[slug]!, approximated: false };
            }
            if (slug !== "" && models.findModel(ecologitsProvider, slug) !== undefined) {
                return { ecologitsProvider, model: slug, approximated: false };
            }
        }
        const proxied = candidates.find((slug) => Object.hasOwn(proxies, slug));
        if (proxied !== undefined) {
            return { ecologitsProvider, model: proxies[proxied]!, approximated: true };
        }
    }
    return { ecologitsProvider, model: fallback, approximated: true };
}
