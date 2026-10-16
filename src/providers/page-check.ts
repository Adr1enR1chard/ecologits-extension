import type { ReplyMarkup } from "./types";

/**
 * The checks a DOM snapshot must pass for the badge to find its last reply, shared by the page
 * tests (`page-contract.ts`) and the fixture drift check (`scripts/fixtures/drift.ts`).
 */

/** Message id of the last reply `markup` matches in `root`, `null` without one. */
export function lastReplyId(root: ParentNode, markup: ReplyMarkup): string | null {
    const replies = root.querySelectorAll(markup.reply);
    return replies[replies.length - 1]?.getAttribute(markup.idAttribute) ?? null;
}

/**
 * What the page markup gets wrong on that DOM; empty when it finds the last reply's anchor.
 * `escape` is the `CSS.escape` of the window holding `root`.
 */
export function checkSnapshot(
    root: ParentNode,
    markup: ReplyMarkup,
    escape: (id: string) => string = CSS.escape,
): string[] {
    const problems: string[] = [];
    const id = lastReplyId(root, markup);
    if (id === null)
        problems.push(`no reply with an ${markup.idAttribute} matches ${markup.reply}`);
    if (markup.rendering?.(root)) problems.push("the last reply is still rendering");
    if (id !== null) {
        const { selector } = markup.anchor(escape(id));
        const anchors = root.querySelectorAll(selector).length;
        if (anchors !== 1) problems.push(`${anchors} elements match the anchor ${selector}`);
    }
    return problems;
}
