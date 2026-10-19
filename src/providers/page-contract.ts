import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FIXTURES } from "../../test/fixtures";
import { lastReplyAnchor } from "../badge/anchor";
import { PAGES } from "./page";
import type { CapturedProvider } from "./registry";
import type { ReplyMarkup } from "./types";

/**
 * Replays a provider's DOM snapshots (`test/fixtures/<provider>/fixtures.ts`) against its
 * `ProviderPage`. Imported by tests only, which run in happy-dom.
 */

/** Loads a snapshot into the document body, which holds nothing else. */
export function loadSnapshot(provider: CapturedProvider, file: string): HTMLElement {
    // Not `import.meta.url`, which is not a file URL in happy-dom.
    const path = join(import.meta.dirname, "../../test/fixtures", provider, file);
    document.body.innerHTML = readFileSync(path, "utf8");
    return document.body;
}

/** Message id of the last reply `markup` matches in `root`, `null` without one. */
export function lastReplyId(root: ParentNode, markup: ReplyMarkup): string | null {
    const replies = root.querySelectorAll(markup.reply);
    return replies[replies.length - 1]?.getAttribute(markup.idAttribute) ?? null;
}

/** What the page markup gets wrong on that DOM; empty when it finds the last reply's anchor. */
export function checkSnapshot(root: ParentNode, markup: ReplyMarkup): string[] {
    const problems: string[] = [];
    const id = lastReplyId(root, markup);
    if (id === null)
        problems.push(`no reply with an ${markup.idAttribute} matches ${markup.reply}`);
    if (markup.rendering?.(root)) problems.push("the last reply is still rendering");
    if (id !== null) {
        const { selector } = markup.anchor(CSS.escape(id));
        const anchors = root.querySelectorAll(selector).length;
        if (anchors !== 1) problems.push(`${anchors} elements match the anchor ${selector}`);
    }
    return problems;
}

/** Replays the snapshots of a provider, once it has a `page.ts` and snapshots. */
export function describePageSnapshots(provider: CapturedProvider): void {
    const markups = PAGES[provider]?.markups ?? [];
    const snapshots = FIXTURES[provider]?.snapshots ?? [];
    if (markups.length === 0 || snapshots.length === 0) return;

    describe(`${provider} DOM snapshots`, () => {
        afterEach(() => {
            document.body.replaceChildren();
        });

        describe.each(snapshots)("$file", (snapshot) => {
            const markup = markups[snapshot.markup]!;

            it("is found by its markup: a last reply with an id, not rendering, one anchor", () => {
                const root = loadSnapshot(provider, snapshot.file);
                expect(checkSnapshot(root, markup)).toEqual([]);
            });

            it("gets the badge of its last reply", () => {
                const root = loadSnapshot(provider, snapshot.file);
                const id = lastReplyId(root, markup);
                expect(id).not.toBeNull();
                expect(lastReplyAnchor(root, provider)).toEqual(markup.anchor(CSS.escape(id!)));
            });

            it("loses the anchor without what it depends on", () => {
                const root = loadSnapshot(provider, snapshot.file);
                snapshot.breakAnchor(root);
                expect(checkSnapshot(root, markup)).not.toEqual([]);
            });
        });
    });
}
