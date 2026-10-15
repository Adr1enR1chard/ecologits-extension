import { PAGES } from "../providers/page";
import type { SupportedProvider } from "../providers/registry";
import type { ReplyAnchor } from "../providers/types";

export type { ReplyAnchor };

/** Matches the element of any reply, whatever the provider. */
export const ANY_REPLY = Object.values(PAGES)
    .flatMap((page) => page.markups.map((m) => m.reply))
    .join(", ");

/** Anchors of the reply with that id, one per markup; selectors stay valid across re-renders. */
export function replyAnchors(messageId: string, provider: SupportedProvider): ReplyAnchor[] {
    const id = CSS.escape(messageId);
    return PAGES[provider].markups.map((m) => m.anchor(id));
}

/** First anchor of the reply with that id present on the page. */
function renderedAnchor(
    root: ParentNode,
    messageId: string,
    provider: SupportedProvider,
): ReplyAnchor | null {
    return replyAnchors(messageId, provider).find((a) => root.querySelector(a.selector)) ?? null;
}

/** Anchor of the last reply on the page, when the captured message id is not rendered. */
export function lastReplyAnchor(root: ParentNode, provider: SupportedProvider): ReplyAnchor | null {
    const { markups } = PAGES[provider];
    if (markups.length === 0) return null;
    const replies = root.querySelectorAll(markups.map((m) => m.reply).join(", "));
    const last = replies[replies.length - 1];
    if (!last) return null;
    const markup = markups.find((m) => last.matches(m.reply));
    const id = markup && last.getAttribute(markup.idAttribute);
    return markup && id ? markup.anchor(CSS.escape(id)) : null;
}

export interface FindReplyOptions {
    /** How long the reply with the message id is awaited before falling back to the last one. */
    timeoutMs?: number;
    /** Without message id: how long the page must stop adding nodes before the last reply is used. */
    settleMs?: number;
    /** How long a reply still being rendered is awaited, at most. */
    maxRenderingMs?: number;
    /** Path of the current conversation. */
    conversation?: () => string;
}

/**
 * Resolves where the badge of a reply goes. The page may render the reply a bit after the
 * stream ends, so the message id is awaited up to `timeoutMs`; then the last reply is used
 * (e.g. when the rendered id differs from the streamed one). Without message id, the last reply
 * is used once the page stops rendering and no reply is being rendered (up to `maxRenderingMs`).
 * There is no fallback once the user has moved to another conversation, whose last reply is
 * unrelated: from a new conversation, only its first move (to its own path) is allowed.
 * `null` when there is no reply.
 */
export function findReplyAnchor(
    root: ParentNode & Node,
    messageId: string | null,
    provider: SupportedProvider,
    options: FindReplyOptions = {},
): Promise<ReplyAnchor | null> {
    const {
        timeoutMs = 3000,
        settleMs = 300,
        maxRenderingMs = 30_000,
        conversation = () => location.pathname,
    } = options;
    const { markups, isNewConversation } = PAGES[provider];
    const startedIn = conversation();
    // A new conversation moves to its own path during the first reply, which is not a move to
    // another one; a second move is.
    let firstMove: string | null = null;
    const sameConversation = () => {
        const path = conversation();
        if (path === startedIn) return true;
        if (!isNewConversation(startedIn)) return path.startsWith(startedIn);
        firstMove ??= path;
        return path === firstMove;
    };
    const rendering = () => markups.some((m) => m.rendering?.(root));
    const fallback = () => (sameConversation() ? lastReplyAnchor(root, provider) : null);
    if (messageId !== null) {
        const rendered = renderedAnchor(root, messageId, provider);
        if (rendered) return Promise.resolve(rendered);
    }
    return new Promise((resolve) => {
        let settleTimer: ReturnType<typeof setTimeout> | undefined;
        const finish = (result: ReplyAnchor | null) => {
            observer.disconnect();
            clearTimeout(timer);
            clearTimeout(maxTimer);
            clearTimeout(settleTimer);
            resolve(result);
        };
        // While the latest reply is rendering, the last finished one is not it: keep waiting.
        const settle = () => {
            clearTimeout(settleTimer);
            settleTimer = setTimeout(() => (rendering() ? settle() : finish(fallback())), settleMs);
        };
        const observer = new MutationObserver(() => {
            // Notices each move while waiting, not only the path at the end.
            sameConversation();
            if (messageId === null) {
                settle();
                return;
            }
            const anchor = renderedAnchor(root, messageId, provider);
            if (anchor) finish(anchor);
        });
        const timer = setTimeout(() => {
            if (rendering()) settle();
            else finish(fallback());
        }, timeoutMs);
        // A reply rendering for that long is stuck: its badge is not shown.
        const maxTimer = setTimeout(() => finish(null), Math.max(timeoutMs, maxRenderingMs));
        if (messageId === null) settle();
        // Only the attributes that make replies match: the page changes others (classes, styles)
        // all along the stream.
        const attributeFilter = [...new Set(markups.flatMap((m) => m.attributes))];
        observer.observe(root, { childList: true, subtree: true, attributeFilter });
    });
}
