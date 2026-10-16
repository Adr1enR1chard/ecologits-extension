import type { ModelRange, ProviderModels } from "../types";
import { canonicalizeChatGptSlug } from "./slugs";

const GPT_6: ModelRange = { low: "gpt-6-luna", high: "gpt-6-sol" };

export const chatgptModels: ProviderModels = {
    ecologitsProvider: "openai",
    // Also used for "auto", where ChatGPT picks the model.
    fallback: "gpt-5",
    aliases: {
        // ChatGPT's former default, absent from EcoLogits as `gpt-4o-chat-latest`.
        "chatgpt-4o-latest": "gpt-4o",
    },
    ranges: {
        // EcoLogits knows no `gpt-6`: ChatGPT serves GPT-6 Luna on free plans and GPT-6 Sol on
        // paid ones, and the plan is unknown.
        "gpt-6": GPT_6,
        "gpt-6-mini": GPT_6,
    },
    canonicalize: canonicalizeChatGptSlug,
};
