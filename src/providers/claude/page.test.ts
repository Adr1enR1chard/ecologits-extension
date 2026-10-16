// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { describePageSnapshots, loadSnapshot } from "../page-contract";
import { PAGE_SNAPSHOTS } from "../page-snapshots";
import { claudePage } from "./page";

describePageSnapshots("claude");

describe("claude normal-reply.html while the last reply streams", () => {
    const [markup] = claudePage.markups;
    const [snapshot] = PAGE_SNAPSHOTS.claude;

    it("only matches the previous reply, and is rendering", () => {
        const root = loadSnapshot("claude", snapshot!.file);
        root.querySelector(`[data-turn-key="${snapshot!.lastId}"]`)!.setAttribute(
            "data-is-streaming",
            "true",
        );
        const replies = root.querySelectorAll(markup!.reply);
        expect(replies).toHaveLength(1);
        expect(replies[0]!.getAttribute(markup!.idAttribute)).not.toBe(snapshot!.lastId);
        expect(markup!.rendering!(root)).toBe(true);
    });
});
