// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { findReplyAnchor, lastReplyAnchor, replyAnchors, type ReplyAnchor } from "./anchor";

/** A logged-in reply: the text block, then the action bar. */
function addReply(id: string): HTMLElement {
    const turn = document.createElement("div");
    turn.dataset.chatgptSearchMessageIds = `${id} ${id}`;
    const reply = document.createElement("div");
    reply.dataset.chatgptSelectionMessageId = id;
    const actions = document.createElement("div");
    turn.append(reply, actions);
    document.body.append(turn);
    return reply;
}

/** A logged-out message: `<li>` with the text, then the action bar of assistant replies. */
function addLoggedOutMessage(id: string, role = "assistant"): HTMLElement {
    const list =
        document.querySelector("ol") ?? document.body.appendChild(document.createElement("ol"));
    const item = document.createElement("li");
    item.id = id;
    item.dataset.messageRole = role;
    const text = document.createElement("div");
    item.append(text);
    const actions = document.createElement("div");
    actions.dataset.assistantMessageActions = "";
    if (role === "assistant") item.append(actions);
    list.append(item);
    return actions;
}

/** A reply in the former logged-in markup. */
function addLegacyReply(id: string, role = "assistant"): HTMLElement {
    const element = document.createElement("div");
    element.dataset.messageAuthorRole = role;
    element.dataset.messageId = id;
    document.body.append(element);
    return element;
}

function resolve(anchor: ReplyAnchor | null): Element[] {
    return anchor ? [...document.querySelectorAll(anchor.selector)] : [];
}

const ID = "2e86d615-d61b-4533-8a8e-779fea26264b";

afterEach(() => {
    document.body.replaceChildren();
});

describe("replyAnchors", () => {
    it("put the badge after the logged-in reply block", () => {
        const reply = addReply(ID);
        addReply("other");
        const [anchor] = replyAnchors(ID);
        expect(anchor!.position).toBe("after");
        expect(resolve(anchor!)).toEqual([reply]);
    });

    it("put the badge before the action bar of the logged-out reply", () => {
        addLoggedOutMessage(ID, "user");
        const actions = addLoggedOutMessage(ID);
        const anchor = replyAnchors(ID)[1]!;
        expect(anchor.position).toBe("before");
        expect(resolve(anchor)).toEqual([actions]);
    });

    it("match the former assistant message element, not user messages", () => {
        const reply = addLegacyReply(ID);
        addLegacyReply(ID, "user");
        expect(resolve(replyAnchors(ID)[2]!)).toEqual([reply]);
    });

    it("escape the id", () => {
        expect(replyAnchors('a"b')[0]!.selector).toBe(
            '[data-chatgpt-selection-message-id="a\\"b"]',
        );
    });
});

describe("lastReplyAnchor", () => {
    it("targets the last reply, whatever its markup", () => {
        addLegacyReply("1");
        const last = addReply("2");
        addLegacyReply("3", "user");
        expect(resolve(lastReplyAnchor(document))).toEqual([last]);

        const actions = addLoggedOutMessage("4");
        addLoggedOutMessage("5", "user");
        expect(resolve(lastReplyAnchor(document))).toEqual([actions]);
    });

    it("returns null without replies", () => {
        expect(lastReplyAnchor(document)).toBeNull();
    });
});

describe("findReplyAnchor", () => {
    it("resolves at once when the reply is rendered", async () => {
        const reply = addReply("msg-1");
        addReply("msg-2");
        expect(resolve(await findReplyAnchor(document.body, "msg-1"))).toEqual([reply]);
    });

    it("waits for the reply to be rendered", async () => {
        addLoggedOutMessage("msg-1");
        const anchor = findReplyAnchor(document.body, "msg-2");
        let actions: HTMLElement | undefined;
        setTimeout(() => (actions = addLoggedOutMessage("msg-2")), 10);
        expect(resolve(await anchor)).toEqual([actions]);
    });

    it("notices a rendered reply getting its id", async () => {
        const reply = addReply("temporary-id");
        const anchor = findReplyAnchor(document.body, "msg-1");
        setTimeout(() => (reply.dataset.chatgptSelectionMessageId = "msg-1"), 10);
        expect(resolve(await anchor)).toEqual([reply]);
    });

    it("falls back to the last reply after the timeout", async () => {
        addReply("msg-1");
        const last = addReply("rendered-id");
        const anchor = findReplyAnchor(document.body, "streamed-id", { timeoutMs: 20 });
        expect(resolve(await anchor)).toEqual([last]);
    });

    it("without id, takes the last reply once the page stops rendering", async () => {
        addReply("msg-1");
        const anchor = findReplyAnchor(document.body, null, { settleMs: 20 });
        let last: HTMLElement | undefined;
        setTimeout(() => (last = addReply("msg-2")), 10);
        expect(resolve(await anchor)).toEqual([last]);
    });

    it("does not fall back once the user moved to another conversation", async () => {
        addReply("msg-1");
        let path = "/c/first";
        const conversation = () => path;
        const anchor = findReplyAnchor(document.body, "streamed-id", {
            timeoutMs: 20,
            conversation,
        });
        path = "/c/second";
        expect(await anchor).toBeNull();
    });

    it("falls back when a new conversation gets its id", async () => {
        const last = addReply("msg-1");
        let path = "/";
        const conversation = () => path;
        const anchor = findReplyAnchor(document.body, null, { settleMs: 20, conversation });
        path = "/c/new";
        expect(resolve(await anchor)).toEqual([last]);
    });
});
