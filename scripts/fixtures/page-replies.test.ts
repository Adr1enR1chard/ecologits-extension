import { describe, expect, it } from "vitest";
import { findReplies } from "./page-replies";

/** A Claude conversation whose last reply has that id. */
function conversation(lastId: string, streaming = false): string {
    const reply = (id: string, rendering: boolean) =>
        `<div data-testid="assistant-message" data-turn-key="${id}" data-is-streaming="${rendering}">` +
        `<p>Reply to Bob</p><div><div data-testid="message-actions"></div></div></div>`;
    return (
        `<nav><a href="/chat/x">Bob's chats</a></nav>` +
        `<main><div class="thread">${reply("11111111-2222-4333-8444-555555555555", false)}` +
        `<div data-testid="user-message"><p>Hi</p></div>${reply(lastId, streaming)}</div></main>`
    );
}

describe("findReplies", () => {
    it("finds none on a page without finished reply", () => {
        expect(findReplies("claude", "<main><p>Hi</p></main>")).toBeNull();
    });

    it("keeps the element holding the replies, without the rest of the page", () => {
        const id = "00000000-0000-4000-8000-000000000002";
        const replies = findReplies("claude", conversation(id));
        expect(replies).toMatchObject({ rendering: false });
        expect(replies!.snapshot).toMatch(/^<div class="thread">/);
        expect(replies!.snapshot).not.toContain("Bob's chats");
    });

    it("keeps the parent of a lone reply, so that what follows it is kept", () => {
        const html =
            '<main><section><div data-chatgpt-selection-message-id="a"></div>' +
            '<div class="actions"></div></section></main>';
        expect(findReplies("chatgpt", html)).toEqual({
            rendering: false,
            snapshot:
                '<section><div data-chatgpt-selection-message-id="a"></div><div class="actions"></div></section>',
        });
    });

    it("tells a reply is rendering", () => {
        expect(
            findReplies("claude", conversation("00000000-0000-4000-8000-000000000002", true)),
        ).toMatchObject({ rendering: true });
    });
});
