import { readdirSync, readFileSync } from "node:fs";
import { models } from "@ecologits/ecologits.js";
import { describe, expect, it } from "vitest";
import { CAPTURES } from "./capture";
import { MODEL_MAPPINGS } from "./models";
import { PAGES } from "./page";
import {
    PROVIDERS,
    PROVIDER_META,
    SUPPORTED_PROVIDERS,
    WEB_PROVIDERS,
    isSupportedProvider,
    matchPatterns,
    providerForHost,
} from "./registry";

const LOCALES = new URL("../../public/_locales/", import.meta.url);
const messages = readdirSync(LOCALES).map((locale) => ({
    locale,
    messages: JSON.parse(
        readFileSync(new URL(`${locale}/messages.json`, LOCALES), "utf8"),
    ) as Record<string, { message: string }>,
}));

describe("provider registry", () => {
    it("has unique ids and hosts", () => {
        expect(new Set(WEB_PROVIDERS).size).toBe(PROVIDERS.length);
        const hosts = PROVIDERS.flatMap((p) => p.hosts);
        expect(new Set(hosts).size).toBe(hosts.length);
    });

    it("derives the supported providers from their status", () => {
        expect(SUPPORTED_PROVIDERS).toEqual(
            PROVIDERS.filter((p) => p.status === "supported").map((p) => p.id),
        );
        for (const provider of WEB_PROVIDERS) {
            expect(isSupportedProvider(provider), provider).toBe(
                PROVIDER_META[provider].status === "supported",
            );
        }
        expect(isSupportedProvider("example")).toBe(false);
    });

    it("only registers supported providers in the per-context registries", () => {
        for (const registry of [CAPTURES, MODEL_MAPPINGS, PAGES]) {
            expect(Object.keys(registry).sort()).toEqual([...SUPPORTED_PROVIDERS].sort());
        }
    });

    describe.each(PROVIDERS)("$id", (meta) => {
        it("has a name and a logo", () => {
            expect(meta.name).not.toBe("");
            expect(meta.logo).toMatch(/^M[\d.\s-]/);
        });

        it.each(messages)("is named in the $locale extension description", ({ messages }) => {
            expect(messages.extDescription?.message).toContain(meta.name);
        });
    });

    describe.each(SUPPORTED_PROVIDERS)("%s", (provider) => {
        it("captures at least one endpoint", () => {
            expect(CAPTURES[provider].endpoints.length).toBeGreaterThan(0);
        });

        it("knows at least one reply markup", () => {
            expect(PAGES[provider].markups.length).toBeGreaterThan(0);
        });

        const { ecologitsProvider, fallback, aliases, proxies } = MODEL_MAPPINGS[provider];

        it("has a fallback model EcoLogits knows", () => {
            expect(models.findModel(ecologitsProvider, fallback)).toBeDefined();
        });

        it("only aliases normalised slugs to models EcoLogits knows", () => {
            for (const [slug, target] of Object.entries(aliases)) {
                expect(slug).toBe(slug.trim().toLowerCase());
                expect(models.findModel(ecologitsProvider, target), target).toBeDefined();
            }
        });

        it("only proxies normalised slugs to models EcoLogits knows", () => {
            for (const [slug, target] of Object.entries(proxies)) {
                expect(slug).toBe(slug.trim().toLowerCase());
                const targets = typeof target === "string" ? [target] : [target.low, target.high];
                for (const t of targets) {
                    expect(models.findModel(ecologitsProvider, t), t).toBeDefined();
                }
            }
        });

        // A proxy for a model EcoLogits now knows is never used: drop it.
        it("only proxies slugs EcoLogits does not know", () => {
            for (const slug of Object.keys(proxies)) {
                expect(models.findModel(ecologitsProvider, slug), slug).toBeUndefined();
            }
        });
    });
});

describe("providerForHost", () => {
    it("maps every declared host to its provider", () => {
        for (const { id, hosts } of PROVIDERS) {
            for (const host of hosts) expect(providerForHost(host), host).toBe(id);
        }
    });

    it("ignores other hosts", () => {
        expect(providerForHost("example.com")).toBeNull();
        expect(providerForHost("evil.chatgpt.com.example")).toBeNull();
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
