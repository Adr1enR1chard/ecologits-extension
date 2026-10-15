import { describe, expect, it } from "vitest";
import { MODEL_MAPPINGS } from "../providers/models";
import type { SupportedProvider } from "../providers/registry";
import type { ProviderModels } from "../providers/types";
import { resolveModel } from "./mapping";

describe("resolveModel", () => {
    const mappings: Record<SupportedProvider, ProviderModels> = {
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
        expect(resolveModel("claude", null)).toEqual({
            ecologitsProvider: "anthropic",
            modelName: MODEL_MAPPINGS.claude.fallback,
            approximated: true,
        });
        expect(resolveModel("claude", "  ").approximated).toBe(true);
    });
});
