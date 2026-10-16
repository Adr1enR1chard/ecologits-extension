// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { checkSnapshot, describePageSnapshots, loadSnapshot } from "../page-contract";
import { claudePage } from "./page";

const NORMAL_REPLY = {
    file: "normal-reply.html",
    markup: 0,
    replies: 2,
    lastId: "00000000-0000-4000-8000-000000000002",
    anchorDependsOn: '[data-testid="message-actions"]',
};

describePageSnapshots("claude", [NORMAL_REPLY]);

describe("claude normal-reply.html while the reply streams", () => {
    it("counts the previous reply only, and is rendering", () => {
        const root = loadSnapshot("claude", NORMAL_REPLY.file);
        root.querySelector(`[data-turn-key="${NORMAL_REPLY.lastId}"]`)!.setAttribute(
            "data-is-streaming",
            "true",
        );
        expect(checkSnapshot(root, claudePage.markups[0]!, NORMAL_REPLY)).toEqual([
            "1 replies match " + claudePage.markups[0]!.reply + ", not 2",
            "last reply id is 00000000-0000-4000-8000-0000000000e1, not " + NORMAL_REPLY.lastId,
            "the last reply is still rendering",
        ]);
    });
});
