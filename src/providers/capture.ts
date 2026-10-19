import type { ProviderCapture } from "../capture/types";
import { byProvider } from "./registry";

/** Reply endpoints of each captured provider. Imported only by the main-world interceptor. */
export const CAPTURES = byProvider(
    import.meta.glob<ProviderCapture>("./*/capture.ts", { eager: true, import: "default" }),
);
