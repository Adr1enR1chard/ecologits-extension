// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { describePageSnapshots, lastReplyId, loadSnapshot } from "../page-contract";
import { PAGE_SNAPSHOTS } from "../page-snapshots";
import { claudePage } from "./page";

describePageSnapshots("claude");

describe("claude normal-reply.html while the last reply streams", () => {
    const [markup] = claudePage.markups;
    const [snapshot] = PAGE_SNAPSHOTS.claude;

    it("no longer matches the last reply, and is rendering", () => {
        const root = loadSnapshot("claude", snapshot!.file);
        const replies = root.querySelectorAll(markup!.reply).length;
        const id = lastReplyId(root, markup!)!;
        root.querySelector(`[${markup!.idAttribute}="${id}"]`)!.setAttribute(
            "data-is-streaming",
            "true",
        );
        expect(root.querySelectorAll(markup!.reply)).toHaveLength(replies - 1);
        expect(lastReplyId(root, markup!)).not.toBe(id);
        expect(markup!.rendering!(root)).toBe(true);
    });
});
