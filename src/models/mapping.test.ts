import { models } from "@ecologits/ecologits.js";
import { describe, expect, it } from "vitest";
import { WEB_PROVIDERS, type WebProvider } from "../messaging";
import { MODEL_MAPPINGS, resolveModel, type ProviderModelMapping } from "./mapping";

describe("MODEL_MAPPINGS", () => {
    for (const provider of WEB_PROVIDERS) {
        const { ecologitsProvider, fallback, aliases } = MODEL_MAPPINGS[provider];

        it(`${provider}: fallback resolves in EcoLogits`, () => {
            expect(models.findModel(ecologitsProvider, fallback)).toBeDefined();
        });

        it(`${provider}: every alias target resolves in EcoLogits`, () => {
            for (const target of Object.values(aliases)) {
                expect(models.findModel(ecologitsProvider, target), target).toBeDefined();
            }
        });

        it(`${provider}: alias keys are normalised`, () => {
            for (const slug of Object.keys(aliases)) {
                expect(slug).toBe(slug.trim().toLowerCase());
            }
        });
    }
});

describe("resolveModel", () => {
    const mappings: Record<WebProvider, ProviderModelMapping> = {
        ...MODEL_MAPPINGS,
        chatgpt: { ecologitsProvider: "openai", fallback: "gpt-5", aliases: { auto: "gpt-5.5" } },
    };

    it("uses the alias table first", () => {
        expect(resolveModel("chatgpt", "Auto", mappings)).toEqual({
            ecologitsProvider: "openai",
            modelName: "gpt-5.5",
            approximated: false,
        });
    });

    it("accepts slugs EcoLogits knows as-is, after normalisation", () => {
        expect(resolveModel("chatgpt", " GPT-4o ")).toEqual({
            ecologitsProvider: "openai",
            modelName: "gpt-4o",
            approximated: false,
        });
    });

    it("falls back to the provider model for unknown slugs", () => {
        expect(resolveModel("claude", "claude-unknown")).toEqual({
            ecologitsProvider: "anthropic",
            modelName: MODEL_MAPPINGS.claude.fallback,
            approximated: true,
        });
    });

    it("ignores inherited object keys", () => {
        for (const slug of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
            expect(resolveModel("chatgpt", slug, mappings), slug).toEqual({
                ecologitsProvider: "openai",
                modelName: "gpt-5",
                approximated: true,
            });
        }
    });

    it("falls back when the model is not exposed", () => {
        expect(resolveModel("gemini", null)).toEqual({
            ecologitsProvider: "google_genai",
            modelName: MODEL_MAPPINGS.gemini.fallback,
            approximated: true,
        });
        expect(resolveModel("gemini", "  ").approximated).toBe(true);
    });
});
