import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describeAdapterContract } from "../capture/adapter-contract";
import { findEndpoint } from "../capture/interceptor";
import { applyDelta, chatgptConversationEndpoint } from "./chatgpt";
import type { CapturedRequest, ParseOutcome } from "../capture/types";

const matches = (request: CapturedRequest) =>
    findEndpoint({ chatgpt: { endpoints: [chatgptConversationEndpoint] } }, request)?.endpoint ===
    chatgptConversationEndpoint;

function request(overrides: Partial<CapturedRequest> = {}): CapturedRequest {
    return {
        url: new URL("https://chatgpt.com/backend-api/f/conversation"),
        method: "POST",
        body: JSON.stringify({ action: "next", model: "auto" }),
        ...overrides,
    };
}

function fixture(name: string): string {
    return readFileSync(
        new URL(`../../test/fixtures/chatgpt/${name}.sse`, import.meta.url),
        "utf8",
    );
}

function parse(text: string, chunkSize = Infinity, req = request()): ParseOutcome {
    const parser = chatgptConversationEndpoint.createParser(req);
    for (let i = 0; i < text.length; i += chunkSize) parser.push(text.slice(i, i + chunkSize));
    return parser.finish();
}

describeAdapterContract(
    "chatgpt",
    chatgptConversationEndpoint,
    request(),
    Object.fromEntries(
        ["normal-reply", "thinking-reply", "regenerate", "tool-call", "aborted"].map((name) => [
            name,
            fixture(name),
        ]),
    ),
);

describe("chatgptConversationEndpoint matching", () => {
    it.each([
        "https://chatgpt.com/backend-api/conversation",
        "https://chatgpt.com/backend-api/f/conversation",
        "https://chatgpt.com/backend-anon/conversation",
        "https://chatgpt.com/backend-anon/f/conversation",
        "https://chat.openai.com/backend-api/conversation",
    ])("matches POST %s", (url) => {
        expect(matches(request({ url: new URL(url) }))).toBe(true);
    });

    it.each([
        "https://chatgpt.com/backend-api/conversation/init",
        "https://chatgpt.com/backend-api/f/conversation/prepare",
        "https://chatgpt.com/backend-api/conversations",
        "https://chatgpt.com/backend-api/conversation/00000000-0000-4000-8000-00000000c0de",
        "https://evil.example/backend-api/conversation",
        "https://chatgpt.com/unauth-mweb/conversation/updates",
        "https://chatgpt.com/backend-api/conversation/updates",
    ])("ignores %s", (url) => {
        expect(matches(request({ url: new URL(url) }))).toBe(false);
    });

    it("ignores non-POST requests", () => {
        expect(matches(request({ method: "GET" }))).toBe(false);
    });
});

describe("chatgpt fixtures", () => {
    it("parses a recorded reply, skipping hidden system messages", () => {
        expect(parse(fixture("normal-reply"))).toEqual({
            kind: "reply",
            reply: {
                rawModel: "gpt-6",
                outputText: "Test successful! \u2705 I\u2019m here and ready to help.",
                reasoningText: null,
                hiddenReasoning: false,
                messageId: "00000000-0000-4000-8000-00000000000c",
            },
        });
    });

    it("flags hidden reasoning when auto mode switched to reasoning", () => {
        const text = fixture("normal-reply").replace(
            '"did_auto_switch_to_reasoning":false',
            '"did_auto_switch_to_reasoning":true',
        );
        expect(parse(text)).toMatchObject({ reply: { hiddenReasoning: true } });
    });

    it("parses a recorded reply with web search and reasoning, counting fragments once", () => {
        // Recorded and masked (letters → x): the answer is streamed as three hidden fragments
        // around a web search, and as the visible merged message concatenating them.
        const outcome = parse(fixture("thinking-reply"));
        expect(outcome).toMatchObject({
            kind: "reply",
            reply: {
                rawModel: "gpt-6",
                hiddenReasoning: true,
                messageId: "00000000-0000-4000-8000-00000000000d",
            },
        });
        const { reply } = outcome as Extract<ParseOutcome, { kind: "reply" }>;
        expect(reply.outputText).toHaveLength(7562);
        expect(reply.reasoningText).toHaveLength(21);
    });

    it("parses a recorded regenerated reply", () => {
        // Masked "Test successful! ✅ I’m here and ready to help.", streamed with
        // `message_type: "variant"` and no user message echo.
        expect(parse(fixture("regenerate"))).toEqual({
            kind: "reply",
            reply: {
                rawModel: "gpt-6",
                outputText: "xxxx xxxxxxxxxx! \u2705 x\u2019x xxxx xxx xxxxx xx xxxx.",
                reasoningText: null,
                hiddenReasoning: false,
                messageId: "00000000-0000-4000-8000-00000000000c",
            },
        });
    });

    it("counts tool calls as output and reports the visible reply id", () => {
        expect(parse(fixture("tool-call"))).toMatchObject({
            kind: "reply",
            reply: {
                rawModel: "gpt-5-instant",
                outputText:
                    '{"search_query": [{"q": "REDACTED"}]}\n' +
                    "According to recent sources, the event takes place in May.",
                messageId: "00000000-0000-4000-8000-000000000064",
            },
        });
    });

    it("skips a recorded reply stopped by the user", () => {
        expect(parse(fixture("aborted"))).toEqual({
            kind: "skip",
            reason: "stream ended before [DONE]",
        });
    });
});

describe("chatgpt parser edge cases", () => {
    const done = "data: [DONE]\n\n";
    const add = (message: object, c?: number) =>
        `data: ${JSON.stringify({ p: "", o: "add", v: { message, error: null }, c })}\n\n`;
    const assistant = {
        id: "a",
        author: { role: "assistant" },
        content: { content_type: "text", parts: ["Hi"] },
        status: "finished_successfully",
        metadata: {},
        recipient: "all",
    };

    it("skips streams without an assistant reply", () => {
        expect(parse(add({ ...assistant, author: { role: "user" } }) + done)).toEqual({
            kind: "skip",
            reason: "no assistant reply",
        });
    });

    it("skips replies still in progress", () => {
        expect(parse(add({ ...assistant, status: "in_progress" }) + done)).toEqual({
            kind: "skip",
            reason: "reply not finished",
        });
    });

    it("falls back to the requested model when the stream does not expose it", () => {
        const req = request({ body: JSON.stringify({ model: "gpt-5-2-thinking" }) });
        const outcome = parse(add(assistant) + done, Infinity, req);
        expect(outcome).toMatchObject({
            kind: "reply",
            reply: { rawModel: "gpt-5-2-thinking", hiddenReasoning: true },
        });
    });

    it("returns a null model when neither the stream nor the request expose it", () => {
        const outcome = parse(add(assistant) + done, Infinity, request({ body: null }));
        expect(outcome).toMatchObject({ kind: "reply", reply: { rawModel: null } });
    });

    it("ignores keep-alives, unknown events and malformed JSON", () => {
        const noise = ': ping\n\ndata: {not json\n\ndata: {"type":"moderation"}\n\ndata: 42\n\n';
        expect(parse(noise + add(assistant) + noise + done)).toMatchObject({
            kind: "reply",
            reply: { outputText: "Hi" },
        });
    });

    it("applies deltas to the message selected by c", () => {
        const second = { ...assistant, id: "b", content: { content_type: "text", parts: [""] } };
        const text =
            add({ ...assistant, content: { content_type: "text", parts: [""] } }, 0) +
            add(second, 1) +
            `data: ${JSON.stringify({ p: "/message/content/parts/0", o: "append", v: "one", c: 0 })}\n\n` +
            `data: ${JSON.stringify({ p: "/message/content/parts/0", o: "append", v: "two", c: 1 })}\n\n` +
            done;
        expect(parse(text)).toMatchObject({
            kind: "reply",
            reply: { outputText: "one\ntwo", messageId: "b" },
        });
    });
});

describe("chatgpt parser regressions", () => {
    const done = "data: [DONE]\n\n";
    const event = (data: object) => `data: ${JSON.stringify(data)}\n\n`;
    const empty = {
        id: "a",
        author: { role: "assistant" },
        content: { content_type: "text", parts: [""] },
        status: "finished_successfully",
        metadata: {},
        recipient: "all",
    };
    const add = (message: object) => event({ p: "", o: "add", v: { message, error: null } });

    it("continues the last operation of a patch with bare values", () => {
        const explicit =
            add(empty) +
            event({
                p: "",
                o: "patch",
                v: [{ p: "/message/content/parts/0", o: "append", v: "Hel" }],
            }) +
            event({ v: "lo world" }) +
            done;
        const shorthand =
            add(empty) +
            event({ v: [{ p: "/message/content/parts/0", o: "append", v: "Hel" }] }) +
            event({ v: "lo world" }) +
            done;
        for (const text of [explicit, shorthand]) {
            expect(parse(text)).toMatchObject({ reply: { outputText: "Hello world" } });
        }
    });

    it.each([null, "reasoning_skipped", ""])(
        "does not flag reasoning_status %j as hidden reasoning",
        (status) => {
            const text =
                add({
                    ...empty,
                    metadata: { model_slug: "gpt-5-instant", reasoning_status: status },
                }) + done;
            expect(parse(text)).toMatchObject({ reply: { hiddenReasoning: false } });
        },
    );

    it("creates arrays for indexed paths that do not exist yet", () => {
        const thoughts = {
            ...empty,
            id: "t",
            content: { content_type: "thoughts" },
            metadata: { reasoning_status: "is_reasoning" },
        };
        const text =
            event({ p: "", o: "add", v: { message: thoughts }, c: 0 }) +
            event({ p: "/message/content/thoughts/0/summary", o: "append", v: "Plan", c: 0 }) +
            event({ p: "", o: "add", v: { message: { ...empty, content: {} } }, c: 1 }) +
            event({ p: "/message/content/parts/0", o: "append", v: "Answer", c: 1 }) +
            event({ p: "/message/content/content_type", o: "replace", v: "text", c: 1 }) +
            done;
        expect(parse(text)).toMatchObject({
            kind: "reply",
            reply: { outputText: "Answer", reasoningText: "Plan", hiddenReasoning: true },
        });
    });

    it("skips streams carrying an error object", () => {
        const text =
            add(empty) + event({ message: null, error: { message: "Rate limited" } }) + done;
        expect(parse(text)).toEqual({ kind: "skip", reason: "error: Rate limited" });
    });

    it("skips streams whose error is set by a delta", () => {
        const text = add(empty) + event({ p: "/error", o: "replace", v: "Interrupted" }) + done;
        expect(parse(text)).toEqual({ kind: "skip", reason: "error: Interrupted" });
    });

    it("updates id-less legacy snapshots in place", () => {
        const snapshot = (text: string) =>
            event({
                message: {
                    ...empty,
                    id: undefined,
                    content: { content_type: "text", parts: [text] },
                },
            });
        const text =
            snapshot("The") + snapshot("The capital") + snapshot("The capital is Paris.") + done;
        expect(parse(text)).toMatchObject({
            reply: { outputText: "The capital is Paris.", messageId: null },
        });
    });
});

describe("chatgpt merged fragments", () => {
    const done = "data: [DONE]\n\n";
    const add = (id: string, text: string, metadata: object, c: number) =>
        `data: ${JSON.stringify({
            p: "",
            o: "add",
            v: {
                message: {
                    id,
                    author: { role: "assistant" },
                    content: { content_type: "text", parts: [text] },
                    status: "finished_successfully",
                    metadata,
                    recipient: "all",
                },
            },
            c,
        })}\n\n`;
    const fragment = (id: string, text: string, c: number) =>
        add(id, text, { is_message_fragment: true, merged_message_id: "merged" }, c);

    it("counts fragments once when their merged message is streamed", () => {
        const text =
            fragment("f1", "Hello ", 0) +
            add("merged", "Hello world", { is_merged_message: true }, 1) +
            fragment("f2", "world", 2) +
            done;
        expect(parse(text)).toMatchObject({
            reply: { outputText: "Hello world", messageId: "merged" },
        });
    });

    it("counts fragments whose merged message is missing", () => {
        expect(parse(fragment("f1", "Hello", 0) + done)).toMatchObject({
            reply: { outputText: "Hello", messageId: "f1" },
        });
    });
});

describe("applyDelta", () => {
    it("supports append, replace, add, truncate, remove and nested patch", () => {
        const root = { value: { a: "x", list: [1], obj: { k: 1 }, gone: 1 } as never };
        applyDelta(root, { p: "/a", o: "append", v: "y" });
        applyDelta(root, { p: "/list", o: "append", v: [2, 3] });
        applyDelta(root, { p: "/obj", o: "append", v: { j: 2 } });
        applyDelta(root, { p: "/new/deep", o: "add", v: true });
        applyDelta(root, { p: "/list", o: "truncate", v: 2 });
        applyDelta(root, { p: "/gone", o: "remove", v: null });
        applyDelta(root, { p: "", o: "patch", v: [{ p: "/a", o: "replace", v: "z" }] });
        applyDelta(root, { p: "/a", o: "unknown", v: "ignored" });
        expect(root.value).toEqual({
            a: "z",
            list: [1, 2],
            obj: { k: 1, j: 2 },
            new: { deep: true },
        });
    });

    it("creates arrays for missing containers followed by an index", () => {
        const root = { value: {} as never };
        applyDelta(root, { p: "/parts/0", o: "append", v: "x" });
        applyDelta(root, { p: "/obj/key", o: "add", v: 1 });
        expect(root.value).toEqual({ parts: ["x"], obj: { key: 1 } });
    });

    it("never touches prototypes", () => {
        const root = { value: {} as never };
        applyDelta(root, { p: "/__proto__/polluted", o: "add", v: true });
        applyDelta(root, { p: "/constructor/prototype/polluted", o: "add", v: true });
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
        expect(root.value).toEqual({});
    });
});
