import type { ProviderPage } from "../types";

/**
 * claude.ai: `[data-testid="assistant-message"]`, whose `data-turn-key` is the message uuid,
 * holds a screen-reader heading, the reply content, then a wrapper of the action bar
 * (`[data-testid="message-actions"]`, rendered once the reply is complete). The badge goes
 * before that wrapper.
 */
export const claudePage: ProviderPage = {
    markups: [
        {
            reply: '[data-testid="assistant-message"][data-turn-key][data-is-streaming="false"]',
            idAttribute: "data-turn-key",
            attributes: ["data-turn-key", "data-is-streaming"],
            rendering: (root) => {
                const replies = root.querySelectorAll('[data-testid="assistant-message"]');
                return replies[replies.length - 1]?.getAttribute("data-is-streaming") === "true";
            },
            anchor: (id) => ({
                selector: `[data-testid="assistant-message"][data-turn-key="${id}"] > div:has(> [data-testid="message-actions"])`,
                position: "before",
            }),
        },
    ],
    // "/new", a project page or any other entry point to "/chat/<id>".
    isNewConversation: (path) => !path.startsWith("/chat/"),
};

export default claudePage;
