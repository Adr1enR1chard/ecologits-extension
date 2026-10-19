import { byProvider } from "./registry";
import type { ProviderPage } from "./types";

/** Reply markup of each captured provider. Used by the bridge content script. */
export const PAGES = byProvider(
    import.meta.glob<ProviderPage>("./*/page.ts", { eager: true, import: "default" }),
);
