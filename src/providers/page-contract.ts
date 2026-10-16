import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { lastReplyAnchor } from "../badge/anchor";
import { PAGES } from "./page";
import { checkSnapshot, lastReplyId } from "./page-check";
import { PAGE_SNAPSHOTS } from "./page-snapshots";
import type { SupportedProvider } from "./registry";

/**
 * Replays a provider's DOM snapshots (`PAGE_SNAPSHOTS`) against its `ProviderPage`. Imported by
 * tests only, which run in happy-dom.
 */

/** Loads a snapshot into the document body, which holds nothing else. */
export function loadSnapshot(provider: SupportedProvider, file: string): HTMLElement {
    // Not `import.meta.url`, which is not a file URL in happy-dom.
    const path = join(import.meta.dirname, "../../test/fixtures", provider, file);
    document.body.innerHTML = readFileSync(path, "utf8");
    return document.body;
}

export function describePageSnapshots(provider: SupportedProvider): void {
    const { markups } = PAGES[provider];

    describe(`${provider} DOM snapshots`, () => {
        afterEach(() => {
            document.body.replaceChildren();
        });

        describe.each(PAGE_SNAPSHOTS[provider])("$file", (snapshot) => {
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
