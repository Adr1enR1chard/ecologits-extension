import { describe, expect, it } from "vitest";
import { MODEL_MAPPINGS, proxyEntries } from "./models";

describe("proxyEntries", () => {
    it("lists every proxy of every supported provider", () => {
        const mappings = {
            ...MODEL_MAPPINGS,
            chatgpt: {
                ...MODEL_MAPPINGS.chatgpt,
                proxies: { next: "gpt-5.5", "next-wide": { low: "gpt-5-mini", high: "gpt-5.5" } },
            },
            claude: { ...MODEL_MAPPINGS.claude, proxies: { "claude-next": "claude-opus-4-5" } },
        };
        expect(proxyEntries(mappings)).toEqual([
            { provider: "chatgpt", slug: "next", model: "gpt-5.5" },
            {
                provider: "chatgpt",
                slug: "next-wide",
                model: { low: "gpt-5-mini", high: "gpt-5.5" },
            },
            { provider: "claude", slug: "claude-next", model: "claude-opus-4-5" },
        ]);
    });

    it("lists nothing for a provider without proxies", () => {
        const mappings = {
            ...MODEL_MAPPINGS,
            chatgpt: { ...MODEL_MAPPINGS.chatgpt, proxies: {} },
            claude: { ...MODEL_MAPPINGS.claude, proxies: {} },
        };
        expect(proxyEntries(mappings)).toEqual([]);
    });
});
