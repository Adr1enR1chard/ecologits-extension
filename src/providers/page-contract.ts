import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { lastReplyAnchor } from "../badge/anchor";
import { PAGES } from "./page";
import type { SupportedProvider } from "./registry";
import type { ReplyMarkup } from "./types";

/**
 * Replays a provider's DOM snapshots (`test/fixtures/<provider>/<case>.html`) against its
 * `ProviderPage`. Imported by tests only, which run in happy-dom.
 */

export interface PageSnapshot {
    /** `<case>.html` under `test/fixtures/<provider>/`. */
    file: string;
    /** Index in `PAGES[provider].markups` of the markup the snapshot is rendered with. */
    markup: number;
    /** Finished replies the `reply` selector matches. */
    replies: number;
    /** Message id of the last reply, read from `idAttribute`. */
    lastId: string;
    /** Element the badge anchor depends on (action bar, reply block…): removing it must lose the anchor. */
    anchorDependsOn: string;
}

/** Loads a snapshot into the document body, which holds nothing else. */
export function loadSnapshot(provider: SupportedProvider, file: string): HTMLElement {
    // Not `import.meta.url`, which is not a file URL in happy-dom.
    const path = join(import.meta.dirname, "../../test/fixtures", provider, file);
    document.body.innerHTML = readFileSync(path, "utf8");
    return document.body;
}

/** What the page markup gets wrong on that DOM; empty when it finds the last reply's anchor. */
export function checkSnapshot(
    root: ParentNode,
    markup: ReplyMarkup,
    expected: Pick<PageSnapshot, "replies" | "lastId">,
): string[] {
    const problems: string[] = [];
    const replies = root.querySelectorAll(markup.reply);
    if (replies.length !== expected.replies) {
        problems.push(`${replies.length} replies match ${markup.reply}, not ${expected.replies}`);
    }
    const id = replies[replies.length - 1]?.getAttribute(markup.idAttribute) ?? null;
    if (id !== expected.lastId) problems.push(`last reply id is ${id}, not ${expected.lastId}`);
    if (markup.rendering?.(root)) problems.push("the last reply is still rendering");
    const { selector } = markup.anchor(CSS.escape(expected.lastId));
    const anchors = root.querySelectorAll(selector).length;
    if (anchors !== 1) problems.push(`${anchors} elements match the anchor ${selector}`);
    return problems;
}

export function describePageSnapshots(
    provider: SupportedProvider,
    snapshots: readonly PageSnapshot[],
): void {
    const { markups } = PAGES[provider];

    describe(`${provider} DOM snapshots`, () => {
        afterEach(() => {
            document.body.replaceChildren();
        });

        it("cover every markup", () => {
            expect(new Set(snapshots.map((s) => s.markup))).toEqual(
                new Set(markups.map((_, i) => i)),
            );
        });

        describe.each(snapshots)("$file", (snapshot) => {
            const markup = markups[snapshot.markup]!;

            it("is found by its markup: replies, last id, not rendering, one anchor", () => {
                const root = loadSnapshot(provider, snapshot.file);
                expect(checkSnapshot(root, markup, snapshot)).toEqual([]);
            });

            it("gets the badge of its last reply", () => {
                const root = loadSnapshot(provider, snapshot.file);
                expect(lastReplyAnchor(root, provider)).toEqual(
                    markup.anchor(CSS.escape(snapshot.lastId)),
                );
            });

            it(`loses the anchor without ${snapshot.anchorDependsOn}`, () => {
                const root = loadSnapshot(provider, snapshot.file);
                root.querySelectorAll(snapshot.anchorDependsOn).forEach((e) => e.remove());
                expect(checkSnapshot(root, markup, snapshot)).toContainEqual(
                    expect.stringMatching(/^0 elements match the anchor/),
                );
            });
        });
    });
}
