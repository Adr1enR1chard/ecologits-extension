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
    proxies: {
        // EcoLogits knows no `gpt-6`: GPT-6 Sol answers every thinking level of GPT-6 but Pro, and
        // only paid plans reach it, Free and Go getting GPT-5.6 Luna.
        // https://help.openai.com/en/articles/20001354-gpt-6-and-other-models-in-chatgpt
        "gpt-6": "gpt-6-sol",
        // Nor `gpt-6-pro`, GPT-6 at Pro effort, which GPT-6 Astra powers. That the Pro effort
        // sends its own slug, as `gpt-5-pro` did, is an assumption: no recording shows it.
        "gpt-6-pro": "gpt-6-astra",
        // Nor `gpt-6-mini`, the canonical slug of GPT-6 Thinking mini (`gpt-6-t-mini`): Luna is
        // the smallest GPT-6 it knows.
        "gpt-6-mini": "gpt-6-luna",
    },
    canonicalize: canonicalizeChatGptSlug,
};

export default chatgptModels;
