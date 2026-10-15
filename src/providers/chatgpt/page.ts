import type { ProviderPage } from "../types";

/** chatgpt.com: the badge goes between the reply text and its action bar. */
export const chatgptPage: ProviderPage = {
    markups: [
        // Logged in: the reply block, followed by the action bar.
        {
            reply: "[data-chatgpt-selection-message-id]",
            idAttribute: "data-chatgpt-selection-message-id",
            attributes: ["data-chatgpt-selection-message-id"],
            anchor: (id) => ({
                selector: `[data-chatgpt-selection-message-id="${id}"]`,
                position: "after",
            }),
        },
        // Logged out: `<li>` holding the reply text, then the action bar.
        {
            reply: 'li[data-message-role="assistant"][id]',
            idAttribute: "id",
            attributes: ["id"],
            anchor: (id) => ({
                selector: `li[data-message-role="assistant"][id="${id}"] > [data-assistant-message-actions]`,
                position: "before",
            }),
        },
        // Former logged-in markup.
        {
            reply: '[data-message-author-role="assistant"][data-message-id]',
            idAttribute: "data-message-id",
            attributes: ["data-message-id"],
            anchor: (id) => ({
                selector: `[data-message-author-role="assistant"][data-message-id="${id}"]`,
                position: "after",
            }),
        },
    ],
    // "/" to "/c/<id>" (also from a GPT or project page, whose path the conversation extends).
    isNewConversation: (path) => path === "/",
};
