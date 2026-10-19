import { findEndpoint, type MatchedEndpoint } from "../../src/capture/interceptor";
import type { CapturedRequest } from "../../src/capture/types";
import { CAPTURES } from "../../src/providers/capture";
import { byProvider } from "../../src/providers/registry";
import type { ProviderFixtures } from "./provider-fixtures";

/** The fixtures each captured provider declares in `<provider>/fixtures.ts`. Tests only. */
export const FIXTURES = byProvider(
    import.meta.glob<ProviderFixtures>("./*/fixtures.ts", { eager: true, import: "default" }),
);

/** A request to a fixture's endpoint URL, with the method of the endpoint it matches, if any. */
export function fixtureRequest(url: string): {
    request: CapturedRequest;
    matched: MatchedEndpoint | null;
} {
    for (const method of ["POST", "GET"]) {
        const request = { url: new URL(url), method, body: null };
        const matched = findEndpoint(CAPTURES, request);
        if (matched) return { request, matched };
    }
    return { request: { url: new URL(url), method: "POST", body: null }, matched: null };
}
