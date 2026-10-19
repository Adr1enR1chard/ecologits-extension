import type { ProviderPage } from "../types";

/** The latest turn is still being answered: its footer is not `.complete` yet. */
function rendering(root: ParentNode): boolean {
    const turns = root.querySelectorAll(".conversation-container");
    const last = turns[turns.length - 1];
    return last?.querySelector(".response-footer:not(.complete)") != null;
}

/**
 * gemini.google.com: each turn is a `.conversation-container` whose `id` is the response id
 * without its `r_` prefix, holding the `<user-query>` then the `<model-response>`. The reply text
 * is followed by a `.response-footer`, `.complete` once the reply has finished, then by
 * `.response-container-footer`, which holds the action bar (`<message-actions>`). The badge goes
 * inside the footer: the page indents each block of the reply with its own margin, which a
 * badge between them would not get.
 */
export const geminiPage: ProviderPage = {
    markups: [
        // Stopped by the user: no action bar, the footer holds a `<response-info-line>` saying
        // the reply was stopped. The badge goes after it. First, as a stopped reply matches both.
        {
            reply: ".conversation-container[id]:has(.response-footer.complete):has(response-info-line)",
            idAttribute: "id",
            attributes: ["id", "class"],
            rendering,
            anchor: (id) => ({
                selector: `.conversation-container[id="${id}"] .response-footer > response-info-line`,
                position: "after",
            }),
        },
        // Finished: the badge goes before the action bar.
        {
            reply: ".conversation-container[id]:has(.response-footer.complete)",
            idAttribute: "id",
            attributes: ["id", "class"],
            rendering,
            anchor: (id) => ({
                selector: `.conversation-container[id="${id}"] .response-container-footer > message-actions`,
                position: "before",
            }),
        },
    ],
    // "/app" or a gem's "/gem/<id>" (under "/u/<n>" for another account) to "…/<conversation id>".
    isNewConversation: (path) => /^(\/u\/\d+)?\/(app|gem\/[^/]+)\/?$/.test(path),
};

export default geminiPage;
