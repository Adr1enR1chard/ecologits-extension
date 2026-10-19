import { describe, expect, it } from "vitest";
import { resolveModel } from "../../models/mapping";
import { canonicalizeChatGptSlug, isChatGptReasoningSlug } from "./slugs";

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
            model: model,
            approximated: false,
        });
    });

    it.each([
        ["gpt-6", "gpt-6-sol"],
        ["gpt-6-pro", "gpt-6-astra"],
    ])("%s is estimated as %s, as approximated", (slug, model) => {
        expect(resolveModel("chatgpt", slug)).toEqual({
            ecologitsProvider: "openai",
            model,
            approximated: true,
        });
    });

    it.each(["gpt-6-t-mini", "gpt-6-thinking-mini"])(
        "%s is estimated as GPT-6 Luna, as approximated",
        (slug) => {
            expect(resolveModel("chatgpt", slug)).toEqual({
                ecologitsProvider: "openai",
                model: "gpt-6-luna",
                approximated: true,
            });
        },
    );

    it.each(["auto", "o3", "gpt-4-5", "research"])("%s falls back to gpt-5", (slug) => {
        expect(resolveModel("chatgpt", slug)).toEqual({
            ecologitsProvider: "openai",
            model: "gpt-5",
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
