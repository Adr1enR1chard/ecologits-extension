import { existsSync, readdirSync, readFileSync } from "node:fs";
import { models } from "@ecologits/ecologits.js";
import { describe, expect, it } from "vitest";
import { FIXTURES } from "../../test/fixtures";
import { CAPTURES } from "./capture";
import { MODEL_MAPPINGS } from "./models";
import { PAGES } from "./page";
import {
    CAPTURED_PROVIDERS,
    PROVIDERS,
    SUPPORTED_PROVIDERS,
    WEB_PROVIDERS,
    isCapturedProvider,
    matchPatterns,
    providerForHost,
} from "./registry";
import type { ProviderMeta } from "./types";

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

    it("derives the supported and captured providers from their status", () => {
        const withStatus = (...statuses: ProviderMeta["status"][]) =>
            PROVIDERS.filter((p) => statuses.includes(p.status)).map((p) => p.id);
        expect(SUPPORTED_PROVIDERS).toEqual(withStatus("supported"));
        // Tests run as a development build: beta providers are captured.
        expect(CAPTURED_PROVIDERS).toEqual(withStatus("supported", "beta"));
        for (const provider of WEB_PROVIDERS) {
            expect(isCapturedProvider(provider), provider).toBe(
                CAPTURED_PROVIDERS.includes(provider as never),
            );
        }
        expect(isCapturedProvider("example")).toBe(false);
    });

    // A folder named otherwise would be silently left out of the registries.
    it.each([
        ["src/providers/", "./"],
        ["test/fixtures/", "../../test/fixtures/"],
    ])("names each folder of %s after a provider", (_, path) => {
        const folders = readdirSync(new URL(path, import.meta.url), { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name);
        for (const folder of folders) expect(WEB_PROVIDERS, folder).toContain(folder);
    });

    it("only registers captured providers in the per-context registries", () => {
        for (const registry of [CAPTURES, MODEL_MAPPINGS, PAGES, FIXTURES]) {
            for (const provider of Object.keys(registry)) {
                expect(CAPTURED_PROVIDERS).toContain(provider);
            }
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

    // What the compiler cannot check of a provider found from its folders.
    describe.each(SUPPORTED_PROVIDERS)("%s is complete", (provider) => {
        it("captures at least one endpoint", () => {
            expect(CAPTURES[provider]?.endpoints.length).toBeGreaterThan(0);
        });

        it("maps its models", () => {
            expect(MODEL_MAPPINGS[provider]).toBeDefined();
        });

        it("knows at least one reply markup", () => {
            expect(PAGES[provider]?.markups.length).toBeGreaterThan(0);
        });

        it("has at least one recorded case", () => {
            expect(FIXTURES[provider]?.cases.length).toBeGreaterThan(0);
        });

        it("has a DOM snapshot of every reply markup", () => {
            const snapshots = FIXTURES[provider]?.snapshots ?? [];
            expect(new Set(snapshots.map((s) => s.markup))).toEqual(
                new Set(PAGES[provider]?.markups.map((_, i) => i)),
            );
        });
    });

    describe.each(CAPTURED_PROVIDERS)("%s fixtures", (provider) => {
        const { cases = [], snapshots = [] } = FIXTURES[provider] ?? {};

        it.each([...cases, ...snapshots].map((f) => f.file))("%s exists", (file) => {
            expect(
                existsSync(new URL(`../../test/fixtures/${provider}/${file}`, import.meta.url)),
            ).toBe(true);
        });
    });

    describe.each(
        CAPTURED_PROVIDERS.flatMap((provider) => {
            const mapping = MODEL_MAPPINGS[provider];
            return mapping ? [{ provider, ...mapping }] : [];
        }),
    )("$provider models", ({ ecologitsProvider, fallback, aliases, proxies }) => {
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
