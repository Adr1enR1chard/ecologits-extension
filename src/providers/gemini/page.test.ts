// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import geminiFixtures from "../../../test/fixtures/gemini/fixtures";
import { lastReplyId, loadSnapshot } from "../page-contract";
import { geminiPage } from "./page";

describe("gemini normal-reply.html while the last reply streams", () => {
    const snapshot = geminiFixtures.snapshots.find((s) => s.file === "normal-reply.html");
    const markup = geminiPage.markups[snapshot!.markup];

    it("no longer matches the last reply, and is rendering", () => {
        const root = loadSnapshot("gemini", snapshot!.file);
        const replies = root.querySelectorAll(markup!.reply).length;
        const id = lastReplyId(root, markup!)!;
        root.querySelector(`[id="${id}"] .response-footer`)!.classList.remove("complete");
        expect(root.querySelectorAll(markup!.reply)).toHaveLength(replies - 1);
        expect(lastReplyId(root, markup!)).not.toBe(id);
        expect(markup!.rendering!(root)).toBe(true);
    });
});

describe("gemini isNewConversation", () => {
    it.each(["/app", "/app/", "/u/1/app", "/gem/abc", "/u/2/gem/abc"])("%s is new", (path) => {
        expect(geminiPage.isNewConversation(path)).toBe(true);
    });

    it.each(["/app/0a1b2c", "/u/1/app/0a1b2c", "/gem/abc/0a1b2c", "/mystuff"])(
        "%s is not",
        (path) => {
            expect(geminiPage.isNewConversation(path)).toBe(false);
        },
    );
});
