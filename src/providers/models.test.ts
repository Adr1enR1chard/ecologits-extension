import { describe, expect, it } from "vitest";
import chatgptModels from "./chatgpt/models";
import claudeModels from "./claude/models";
import { MODEL_MAPPINGS, proxyEntries } from "./models";

describe("proxyEntries", () => {
    it("lists every proxy of every captured provider", () => {
        const mappings = {
            ...MODEL_MAPPINGS,
            chatgpt: {
                ...chatgptModels,
                proxies: { next: "gpt-5.5", "next-wide": { low: "gpt-5-mini", high: "gpt-5.5" } },
            },
            claude: { ...claudeModels, proxies: { "claude-next": "claude-opus-4-5" } },
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
            chatgpt: { ...chatgptModels, proxies: {} },
            claude: { ...claudeModels, proxies: {} },
        };
        expect(proxyEntries(mappings)).toEqual([]);
    });
});
