import { describe, expect, it } from "vitest";
import { resolveModel } from "../../models/mapping";
import { canonicalizeGeminiSlug, geminiModels } from "./models";

describe("Gemini model names", () => {
    it.each([
        ["3.5 Flash-Lite", "gemini-3.5-flash-lite"],
        ["3.5 Flash", "gemini-3.5-flash"],
        ["3.8 Flash", "gemini-3.8-flash"],
        ["Gemini 3.5 Flash", "gemini-3.5-flash"],
        ["gemini-3.1-pro-preview", "gemini-3.1-pro-preview"],
    ])("%s → %s", (slug, model) => {
        expect(resolveModel("gemini", slug)).toEqual({
            ecologitsProvider: "google_genai",
            model,
            approximated: false,
        });
    });

    it.each(["Nano Banana", "1.0 Ultra", ""])("%s falls back", (slug) => {
        expect(resolveModel("gemini", slug)).toMatchObject({
            model: geminiModels.fallback,
            approximated: true,
        });
    });

    it("prefixes labels with gemini once", () => {
        expect(canonicalizeGeminiSlug("3.5 flash-lite")).toBe("gemini-3.5-flash-lite");
        expect(canonicalizeGeminiSlug("gemini 3.5 flash")).toBe("gemini-3.5-flash");
    });
});
