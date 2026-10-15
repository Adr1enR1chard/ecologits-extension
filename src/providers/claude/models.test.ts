import { describe, expect, it } from "vitest";
import { resolveModel } from "../../models/mapping";
import { canonicalizeClaudeSlug, claudeModels } from "./models";

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
                modelName: claudeModels.fallback,
                approximated: true,
            });
        },
    );

    it("drops the date of dated IDs and keeps undated ones", () => {
        expect(canonicalizeClaudeSlug("claude-opus-4-5-20251101")).toBe("claude-opus-4-5");
        expect(canonicalizeClaudeSlug("claude-opus-4-5")).toBe("claude-opus-4-5");
    });
});
