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
