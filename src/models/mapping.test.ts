import { models } from "@ecologits/ecologits.js";
import { describe, expect, it } from "vitest";
import { WEB_PROVIDERS, type WebProvider } from "../messaging";
import { MODEL_MAPPINGS, resolveModel, type ProviderModelMapping } from "./mapping";
import { canonicalizeChatGptSlug, isChatGptReasoningSlug } from "./chatgpt-slugs";
import { canonicalizeClaudeSlug } from "./claude-slugs";

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

describe("ChatGPT slugs", () => {
    it.each([
        ["gpt-5", "gpt-5"],
        ["gpt-5-thinking", "gpt-5"],
        ["gpt-5-instant", "gpt-5-chat-latest"],
        ["gpt-5-t-mini", "gpt-5-mini"],
        ["gpt-5-thinking-mini", "gpt-5-mini"],
        ["gpt-5-pro", "gpt-5-pro"],
        ["gpt-5-1", "gpt-5.1"],
        ["gpt-5-1-thinking", "gpt-5.1"],
        ["gpt-5-1-instant", "gpt-5.1-chat-latest"],
        ["gpt-5-2-thinking", "gpt-5.2"],
        ["gpt-5-2-pro", "gpt-5.2-pro"],
        ["gpt-5-3-instant", "gpt-5.3-chat-latest"],
        ["gpt-5-5", "gpt-5.5"],
        ["gpt-4-1-mini", "gpt-4.1-mini"],
        ["gpt-4o", "gpt-4o"],
        ["chatgpt-4o-latest", "gpt-4o"],
        ["o4-mini", "o4-mini"],
        ["GPT-5-2-Thinking", "gpt-5.2"],
    ])("%s → %s", (slug, model) => {
        expect(resolveModel("chatgpt", slug)).toEqual({
            ecologitsProvider: "openai",
            modelName: model,
            approximated: false,
        });
    });

    it.each(["auto", "o3", "gpt-4-5", "research"])("%s falls back to gpt-5", (slug) => {
        expect(resolveModel("chatgpt", slug)).toEqual({
            ecologitsProvider: "openai",
            modelName: "gpt-5",
            approximated: true,
        });
    });

    it("only rewrites single-digit minor versions", () => {
        expect(canonicalizeChatGptSlug("gpt-4-0613")).toBe("gpt-4-0613");
    });
});

describe("isChatGptReasoningSlug", () => {
    it.each([
        "o3",
        "o4-mini",
        "gpt-5-thinking",
        "gpt-5-2-thinking",
        "gpt-5-thinking-mini",
        "gpt-5-t-mini",
        "gpt-5-pro",
        "gpt-5-2-pro",
        " GPT-5-Thinking ",
    ])("%s reasons", (slug) => expect(isChatGptReasoningSlug(slug)).toBe(true));

    it.each(["auto", "gpt-5-instant", "gpt-4o", "gpt-5-mini", "gpt-5", "chatgpt-4o-latest"])(
        "%s does not always reason",
        (slug) => expect(isChatGptReasoningSlug(slug)).toBe(false),
    );
});

describe("Claude model names", () => {
    it.each([
        ["claude-sonnet-4-5", "claude-sonnet-4-5"],
        // EcoLogits knows some dated IDs as-is.
        ["claude-sonnet-4-5-20250929", "claude-sonnet-4-5-20250929"],
        ["claude-haiku-4-5-20251001", "claude-haiku-4-5-20251001"],
        ["claude-sonnet-4-6-20260217", "claude-sonnet-4-6"],
        ["claude-sonnet-4-6", "claude-sonnet-4-6"],
        ["claude-opus-4-7-latest", "claude-opus-4-7"],
        ["Claude Opus 4.5", "claude-opus-4-5"],
        ["claude-sonnet-5.5", "claude-sonnet-5-5"],
        ["sonnet-5-5", "claude-sonnet-5-5"],
        ["claude-fable-5-1", "claude-fable-5-1"],
    ])("%s → %s", (slug, model) => {
        expect(resolveModel("claude", slug)).toEqual({
            ecologitsProvider: "anthropic",
            modelName: model,
            approximated: false,
        });
    });

    it.each(["claude-3-7-sonnet-20250219", "claude-opus-4-1-20250805", "claude-2.1"])(
        "%s falls back",
        (slug) => {
            expect(resolveModel("claude", slug)).toMatchObject({
                modelName: MODEL_MAPPINGS.claude.fallback,
                approximated: true,
            });
        },
    );

    it("drops the date of dated IDs and keeps undated ones", () => {
        expect(canonicalizeClaudeSlug("claude-opus-4-5-20251101")).toBe("claude-opus-4-5");
        expect(canonicalizeClaudeSlug("claude-opus-4-5")).toBe("claude-opus-4-5");
    });
});
