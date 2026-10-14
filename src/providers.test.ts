import { describe, expect, it } from "vitest";
import { WEB_PROVIDERS } from "./messaging";
import { PROVIDER_HOSTS, matchPatterns, providerForHost } from "./providers";

describe("providerForHost", () => {
    it("maps provider hostnames", () => {
        expect(providerForHost("chatgpt.com")).toBe("chatgpt");
        expect(providerForHost("chat.openai.com")).toBe("chatgpt");
        expect(providerForHost("claude.ai")).toBe("claude");
        expect(providerForHost("gemini.google.com")).toBe("gemini");
        expect(providerForHost("example.com")).toBeNull();
    });

    it("round-trips every declared host", () => {
        for (const provider of WEB_PROVIDERS) {
            for (const host of PROVIDER_HOSTS[provider])
                expect(providerForHost(host)).toBe(provider);
        }
    });
});

describe("matchPatterns", () => {
    it("builds HTTPS match patterns for the given providers", () => {
        expect(matchPatterns("chatgpt")).toEqual([
            "https://chatgpt.com/*",
            "https://chat.openai.com/*",
        ]);
        expect(matchPatterns("claude", "gemini")).toEqual([
            "https://claude.ai/*",
            "https://gemini.google.com/*",
        ]);
    });
});
