import { Window, type Element } from "happy-dom";
import { PAGES } from "../../src/providers/page";
import type { SupportedProvider } from "../../src/providers/registry";

/** What the badge would see of a page: its last finished reply, and the snapshot holding it. */
export interface PageReplies {
    /** Message id of the last finished reply, read like the badge does. */
    lastId: string | null;
    /** The latest reply is still being rendered. */
    rendering: boolean;
    /**
     * The outerHTML of the innermost element holding the replies of the last reply's markup and
     * the anchor of the last one; its parent when that element is the reply or the anchor
     * itself, so that what follows the reply (an action bar) is kept.
     */
    snapshot: string;
}

/** The replies `PAGES[provider]` finds in a page's body HTML, `null` when it finds none. */
export function findReplies(provider: SupportedProvider, html: string): PageReplies | null {
    const window = new Window();
    try {
        // A template's content is inert: no script runs, no resource loads.
        const template = window.document.createElement("template");
        template.innerHTML = html;
        const root = template.content;
        const { markups } = PAGES[provider];
        const last = [...root.querySelectorAll(markups.map((m) => m.reply).join(", "))].at(-1);
        const markup = last && markups.find((m) => last.matches(m.reply));
        if (!last || !markup) return null;
        const lastId = last.getAttribute(markup.idAttribute);
        const anchor = lastId
            ? root.querySelector(markup.anchor(window.CSS.escape(lastId)).selector)
            : null;
        const held = [...root.querySelectorAll(markup.reply)];
        if (anchor) held.push(anchor);
        let holder = commonAncestor(held);
        if (holder && (holder.matches(markup.reply) || holder === anchor)) {
            holder = holder.parentElement;
        }
        return {
            lastId,
            // `ParentNode` of the DOM library, which happy-dom implements.
            rendering: markups.some((m) => m.rendering?.(root as unknown as ParentNode)),
            snapshot: holder ? holder.outerHTML : template.innerHTML,
        };
    } finally {
        void window.happyDOM.close();
    }
}

/** The innermost element holding all `elements`. */
function commonAncestor(elements: Element[]): Element | null {
    const [first, ...rest] = elements;
    let ancestor = first ?? null;
    while (ancestor && !rest.every((element) => ancestor!.contains(element))) {
        ancestor = ancestor.parentElement;
    }
    return ancestor;
}
