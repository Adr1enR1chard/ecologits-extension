/** Where a badge goes: next to the element matched by `selector`. */
export interface ReplyAnchor {
    selector: string;
    position: "after" | "before";
}

interface ReplyMarkup {
    /** Matches the element of any reply. */
    reply: string;
    /** Attribute holding the message id of a reply element. */
    idAttribute: string;
    /** Where the badge of the reply with that (CSS-escaped) id goes. */
    anchor(escapedId: string): ReplyAnchor;
}

/**
 * How chatgpt.com renders assistant replies, newest markup first. The badge goes between the
 * reply text and its action bar.
 */
const MARKUPS: readonly ReplyMarkup[] = [
    // Logged in: the reply block, followed by the action bar.
    {
        reply: "[data-chatgpt-selection-message-id]",
        idAttribute: "data-chatgpt-selection-message-id",
        anchor: (id) => ({
            selector: `[data-chatgpt-selection-message-id="${id}"]`,
            position: "after",
        }),
    },
    // Logged out: `<li>` holding the reply text, then the action bar.
    {
        reply: 'li[data-message-role="assistant"][id]',
        idAttribute: "id",
        anchor: (id) => ({
            selector: `li[data-message-role="assistant"][id="${id}"] > [data-assistant-message-actions]`,
            position: "before",
        }),
    },
    // Former logged-in markup.
    {
        reply: '[data-message-author-role="assistant"][data-message-id]',
        idAttribute: "data-message-id",
        anchor: (id) => ({
            selector: `[data-message-author-role="assistant"][data-message-id="${id}"]`,
            position: "after",
        }),
    },
];

/** Matches the element of any reply. */
export const ANY_REPLY = MARKUPS.map((m) => m.reply).join(", ");

/** Attributes that may give a reply its id once rendered. */
const ID_ATTRIBUTES = [...new Set(MARKUPS.map((m) => m.idAttribute))];

/** Anchors of the reply with that id, one per markup; selectors stay valid across re-renders. */
export function replyAnchors(messageId: string): ReplyAnchor[] {
    const id = CSS.escape(messageId);
    return MARKUPS.map((m) => m.anchor(id));
}

/** First anchor of the reply with that id present on the page. */
function renderedAnchor(root: ParentNode, messageId: string): ReplyAnchor | null {
    return replyAnchors(messageId).find((a) => root.querySelector(a.selector)) ?? null;
}

/** Anchor of the last reply on the page, when the captured message id is not rendered. */
export function lastReplyAnchor(root: ParentNode): ReplyAnchor | null {
    const replies = root.querySelectorAll(ANY_REPLY);
    const last = replies[replies.length - 1];
    if (!last) return null;
    const markup = MARKUPS.find((m) => last.matches(m.reply));
    const id = markup && last.getAttribute(markup.idAttribute);
    return markup && id ? markup.anchor(CSS.escape(id)) : null;
}

export interface FindReplyOptions {
    /** How long the reply with the message id is awaited before falling back to the last one. */
    timeoutMs?: number;
    /** Without message id: how long the page must stop adding nodes before the last reply is used. */
    settleMs?: number;
    /** Path of the current conversation. */
    conversation?: () => string;
}

/**
 * Resolves where the badge of a reply goes. The page may render the reply a bit after the
 * stream ends, so the message id is awaited up to `timeoutMs`; then the last reply is used
 * (e.g. when the rendered id differs from the streamed one). Without message id, the last reply
 * is used once the page stops rendering. There is no fallback once the user has moved to
 * another conversation, whose last reply is unrelated. `null` when there is no reply.
 */
export function findReplyAnchor(
    root: ParentNode & Node,
    messageId: string | null,
    options: FindReplyOptions = {},
): Promise<ReplyAnchor | null> {
    const { timeoutMs = 3000, settleMs = 300, conversation = () => location.pathname } = options;
    const startedIn = conversation();
    // A new conversation gets its id in the path during the first reply ("/" to "/c/<id>"),
    // which is not a move to another one.
    const fallback = () => (conversation().startsWith(startedIn) ? lastReplyAnchor(root) : null);
    if (messageId !== null) {
        const rendered = renderedAnchor(root, messageId);
        if (rendered) return Promise.resolve(rendered);
    }
    return new Promise((resolve) => {
        let settleTimer: ReturnType<typeof setTimeout> | undefined;
        const finish = (result: ReplyAnchor | null) => {
            observer.disconnect();
            clearTimeout(timer);
            clearTimeout(settleTimer);
            resolve(result);
        };
        const settle = () => {
            clearTimeout(settleTimer);
            settleTimer = setTimeout(() => finish(fallback()), settleMs);
        };
        const observer = new MutationObserver(() => {
            if (messageId === null) {
                settle();
                return;
            }
            const anchor = renderedAnchor(root, messageId);
            if (anchor) finish(anchor);
        });
        const timer = setTimeout(() => finish(fallback()), timeoutMs);
        if (messageId === null) settle();
        // Only the id attributes: the page changes others (classes, styles) all along the stream.
        observer.observe(root, { childList: true, subtree: true, attributeFilter: ID_ATTRIBUTES });
    });
}
