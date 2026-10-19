import type { EcoLogitsModel } from "../messaging";
import { byProvider, CAPTURED_PROVIDERS, type CapturedProvider } from "./registry";
import type { ProviderModels } from "./types";

export type ModelMappings = Readonly<Partial<Record<CapturedProvider, ProviderModels>>>;

/** Model mapping of each captured provider. Used by the background. */
export const MODEL_MAPPINGS: ModelMappings = byProvider(
    import.meta.glob<ProviderModels>("./*/models.ts", { eager: true, import: "default" }),
);

/** A web model estimated with a stand-in EcoLogits model, or range of models. */
export interface ProxyEntry {
    provider: CapturedProvider;
    slug: string;
    model: EcoLogitsModel;
}

/** Every proxy of the captured providers, in display order, for the methodology. */
export function proxyEntries(mappings = MODEL_MAPPINGS): ProxyEntry[] {
    return CAPTURED_PROVIDERS.flatMap((provider) =>
        Object.entries(mappings[provider]?.proxies ?? {}).map(([slug, model]) => ({
            provider,
            slug,
            model,
        })),
    );
}
