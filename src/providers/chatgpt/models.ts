import type { ProviderModels } from "../types";
import { canonicalizeChatGptSlug } from "./slugs";

export const chatgptModels: ProviderModels = {
    ecologitsProvider: "openai",
    // Also used for "auto", where ChatGPT picks the model.
    fallback: "gpt-5",
    aliases: {
        // ChatGPT's former default, absent from EcoLogits as `gpt-4o-chat-latest`.
        "chatgpt-4o-latest": "gpt-4o",
    },
    canonicalize: canonicalizeChatGptSlug,
};
