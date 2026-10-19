import { byProvider } from "../../src/providers/registry";
import type { ProviderFixtures } from "./provider-fixtures";

/** The fixtures each captured provider declares in `<provider>/fixtures.ts`. Tests only. */
export const FIXTURES = byProvider(
    import.meta.glob<ProviderFixtures>("./*/fixtures.ts", { eager: true, import: "default" }),
);
