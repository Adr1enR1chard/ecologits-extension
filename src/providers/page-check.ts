import type { ReplyMarkup } from "./types";

/**
 * How the badge finds the last reply of a page, and the checks a DOM snapshot must pass for it to
 * find its anchor, shared by the badge (`src/badge/anchor.ts`), the page tests
 * (`page-contract.ts`) and the fixture scripts (`scripts/fixtures/page-replies.ts`, `shape.ts`).
 */

/** The last reply of a page, whatever markup it is rendered with. */
export interface LastReply {
    element: Element;
    /** Index in `markups` of the markup it matches. */
    index: number;
    markup: ReplyMarkup;
    /** Its message id, `null` without one. */
    id: string | null;
}

/** The last element matching the `reply` of any of `markups`, `null` without one. */
export function findLastReply(root: ParentNode, markups: readonly ReplyMarkup[]): LastReply | null {
    if (markups.length === 0) return null;
    const replies = root.querySelectorAll(markups.map((m) => m.reply).join(", "));
    const element = replies[replies.length - 1];
    if (!element) return null;
    const index = markups.findIndex((m) => element.matches(m.reply));
    const markup = markups[index];
    if (!markup) return null;
    return { element, index, markup, id: element.getAttribute(markup.idAttribute) };
}

/** Whether the latest reply is still being rendered, whatever markup it is rendered with. */
export function isRendering(root: ParentNode, markups: readonly ReplyMarkup[]): boolean {
    return markups.some((m) => m.rendering?.(root) ?? false);
}

/** Message id of the last reply `markup` matches in `root`, `null` without one. */
export function lastReplyId(root: ParentNode, markup: ReplyMarkup): string | null {
    return findLastReply(root, [markup])?.id ?? null;
}

/** What the page checks found on a DOM: its last reply's id, the anchors of that id, problems. */
export interface SnapshotInspection {
    id: string | null;
    /** The elements matching the anchor of the last reply. */
    anchors: Element[];
    /** What the page markup gets wrong; empty when it finds the last reply's anchor. */
    problems: string[];
}

export interface InspectOptions {
    /** The `CSS.escape` of the window holding the DOM. */
    escape?: (id: string) => string;
    /** Whether the latest reply is still being rendered: by default, as `markup` tells. */
    rendering?: (root: ParentNode) => boolean;
}

/** Runs the page checks of `markup` on a DOM: a last reply with an id, not rendering, one anchor. */
export function inspectSnapshot(
    root: ParentNode,
    markup: ReplyMarkup,
    { escape = CSS.escape, rendering = (r) => markup.rendering?.(r) ?? false }: InspectOptions = {},
): SnapshotInspection {
    const problems: string[] = [];
    const id = lastReplyId(root, markup);
    if (id === null)
        problems.push(`no reply with an ${markup.idAttribute} matches ${markup.reply}`);
    if (rendering(root)) problems.push("the last reply is still rendering");
    let anchors: Element[] = [];
    if (id !== null) {
        const { selector } = markup.anchor(escape(id));
        anchors = [...root.querySelectorAll(selector)];
        if (anchors.length !== 1) {
            problems.push(`${anchors.length} elements match the anchor ${selector}`);
        }
    }
    return { id, anchors, problems };
}

/** What the page markup gets wrong on that DOM; empty when it finds the last reply's anchor. */
export function checkSnapshot(root: ParentNode, markup: ReplyMarkup): string[] {
    return inspectSnapshot(root, markup).problems;
}
