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

describe("claude.ai replies", () => {
    /**
     * A reply as rendered on 2026-10-15: heading, content, then the action bar wrapper once
     * complete. Returns the wrapper, before which the badge goes.
     */
    function addClaudeReply(id: string, streaming = false): HTMLElement {
        const reply = document.createElement("div");
        reply.dataset.testid = "assistant-message";
        reply.dataset.turnKey = id;
        reply.dataset.isStreaming = String(streaming);
        const content = document.createElement("div");
        content.textContent = "Hello!";
        reply.append(document.createElement("h2"), content);
        document.body.append(reply);
        const wrapper = document.createElement("div");
        if (!streaming) completeClaudeReply(reply, wrapper);
        return wrapper;
    }

    function completeClaudeReply(reply: HTMLElement, wrapper: HTMLElement): void {
        const actions = document.createElement("div");
        actions.dataset.testid = "message-actions";
        wrapper.append(actions);
        reply.append(wrapper);
        reply.dataset.isStreaming = "false";
    }

    function addUserMessage(id: string): void {
        const message = document.createElement("div");
        message.dataset.cds = "UserMessage";
        message.dataset.turnKey = id;
        document.body.append(message);
    }

    const claude = { provider: "claude" as const };

    it("put the badge before the action bar of the reply with that turn key", () => {
        addUserMessage("u1");
        const wrapper = addClaudeReply(ID);
        addClaudeReply("other");
        const [anchor] = replyAnchors(ID, "claude");
        expect(anchor!.position).toBe("before");
        expect(resolve(anchor!)).toEqual([wrapper]);
    });

    it("targets the last finished reply, not user messages", () => {
        addClaudeReply("a1");
        const last = addClaudeReply("a2");
        addUserMessage("u3");
        expect(resolve(lastReplyAnchor(document, "claude"))).toEqual([last]);
    });

    it("resolves at once when the reply is rendered", async () => {
        const wrapper = addClaudeReply(ID);
        expect(resolve(await findReplyAnchor(document.body, ID, claude))).toEqual([wrapper]);
    });

    it("waits for the action bar of a reply still streaming", async () => {
        addClaudeReply("a1");
        const wrapper = addClaudeReply(ID, true);
        const reply = wrapper.ownerDocument.querySelector<HTMLElement>(`[data-turn-key="${ID}"]`)!;
        const anchor = findReplyAnchor(document.body, ID, { ...claude, timeoutMs: 1000 });
        setTimeout(() => completeClaudeReply(reply, wrapper), 10);
        expect(resolve(await anchor)).toEqual([wrapper]);
    });

    it("falls back to the last reply once it finished streaming", async () => {
        const wrapper = addClaudeReply("rendered-id", true);
        const reply = document.querySelector<HTMLElement>('[data-turn-key="rendered-id"]')!;
        const anchor = findReplyAnchor(document.body, "streamed-id", {
            ...claude,
            timeoutMs: 20,
            settleMs: 5,
        });
        setTimeout(() => completeClaudeReply(reply, wrapper), 60);
        expect(resolve(await anchor)).toEqual([wrapper]);
    });

    it("gives up on a reply stuck streaming", async () => {
        addClaudeReply("a1");
        addClaudeReply("a2", true);
        const anchor = findReplyAnchor(document.body, "streamed-id", {
            ...claude,
            settleMs: 5,
            timeoutMs: 10,
            maxRenderingMs: 40,
        });
        expect(await anchor).toBeNull();
    });

    it("falls back when a chat started from a project gets its id", async () => {
        const last = addClaudeReply("a1");
        let path = "/project/00000000-0000-4000-8000-00000000000a";
        const anchor = findReplyAnchor(document.body, "streamed-id", {
            ...claude,
            timeoutMs: 20,
            conversation: () => path,
        });
        path = "/chat/00000000-0000-4000-8000-000000000001";
        expect(resolve(await anchor)).toEqual([last]);
    });

    it("does not fall back once a new chat moved to another one", async () => {
        addClaudeReply("a1");
        let path = "/new";
        const anchor = findReplyAnchor(document.body, "streamed-id", {
            ...claude,
            timeoutMs: 30,
            conversation: () => path,
        });
        path = "/chat/00000000-0000-4000-8000-000000000001";
        setTimeout(() => addClaudeReply("a2"), 5);
        setTimeout(() => {
            path = "/chat/00000000-0000-4000-8000-000000000002";
            addClaudeReply("a3");
        }, 10);
        expect(await anchor).toBeNull();
    });
});

describe("findReplyAnchor from a new ChatGPT conversation", () => {
    it("does not fall back once it moved to another conversation", async () => {
        addReply("msg-1");
        let path = "/";
        const anchor = findReplyAnchor(document.body, null, {
            settleMs: 30,
            conversation: () => path,
        });
        path = "/c/new";
        setTimeout(() => addReply("msg-2"), 5);
        setTimeout(() => {
            path = "/c/other";
            addReply("msg-3");
        }, 10);
        expect(await anchor).toBeNull();
    });
});
