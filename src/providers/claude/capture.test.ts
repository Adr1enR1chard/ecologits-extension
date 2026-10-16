import { describe, expect, it } from "vitest";
import { findEndpoint } from "../../capture/interceptor";
import { claudeCompletionEndpoint } from "./capture";
import type { CapturedRequest, ParseOutcome, StreamEnd } from "../../capture/types";

const matches = (request: CapturedRequest) =>
    findEndpoint({ claude: { endpoints: [claudeCompletionEndpoint] } }, request)?.endpoint ===
    claudeCompletionEndpoint;

const COMPLETION_URL =
    "https://claude.ai/api/organizations/00000000-0000-4000-8000-0000000000aa/chat_conversations/00000000-0000-4000-8000-0000000000bb/completion";

function request(overrides: Partial<CapturedRequest> = {}): CapturedRequest {
    return {
        url: new URL(COMPLETION_URL),
        method: "POST",
        body: JSON.stringify({ prompt: "REDACTED", rendering_mode: "messages" }),
        ...overrides,
    };
}

function parse(
    text: string,
    chunkSize = Infinity,
    req = request(),
    end: StreamEnd = "done",
): ParseOutcome {
    const parser = claudeCompletionEndpoint.createParser(req);
    for (let i = 0; i < text.length; i += chunkSize) parser.push(text.slice(i, i + chunkSize));
    return parser.finish(end);
}

const event = (data: object) =>
    `event: ${(data as { type: string }).type}\ndata: ${JSON.stringify(data)}\n\n`;
const start = (model = "claude-sonnet-4-5") =>
    event({ type: "message_start", message: { id: "chatcompl_1", uuid: "u1", model } });
const textBlock = (index: number, text: string) =>
    event({ type: "content_block_start", index, content_block: { type: "text", text: "" } }) +
    event({ type: "content_block_delta", index, delta: { type: "text_delta", text } });
const stop = event({ type: "message_stop" });

describe("claudeCompletionEndpoint matching", () => {
    it.each([COMPLETION_URL, COMPLETION_URL.replace("/completion", "/retry_completion")])(
        "matches POST %s",
        (url) => {
            expect(matches(request({ url: new URL(url) }))).toBe(true);
        },
    );

    it.each([
        COMPLETION_URL.replace("/completion", ""),
        COMPLETION_URL.replace("/completion", "/title"),
        "https://claude.ai/api/organizations/x/chat_conversations",
        COMPLETION_URL.replace("claude.ai", "evil.example"),
    ])("ignores %s", (url) => {
        expect(matches(request({ url: new URL(url) }))).toBe(false);
    });

    it("ignores non-POST requests", () => {
        expect(matches(request({ method: "GET" }))).toBe(false);
    });
});

describe("claude parser edge cases", () => {
    it("skips streams with an error event", () => {
        const error = event({
            type: "error",
            error: { type: "overloaded_error", message: "Overloaded" },
        });
        expect(parse(start() + textBlock(0, "Hi") + error + stop)).toEqual({
            kind: "skip",
            reason: "error: Overloaded",
        });
    });

    it("skips an aborted stream with an error event", () => {
        const text =
            start() +
            textBlock(0, "Hi") +
            event({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } });
        expect(parse(text, Infinity, request(), "aborted")).toEqual({
            kind: "skip",
            reason: "error: Overloaded",
        });
    });

    it("skips completed streams without text", () => {
        expect(parse(start() + stop)).toEqual({ kind: "skip", reason: "no assistant reply" });
    });

    it("flags redacted thinking as hidden reasoning", () => {
        const redacted = event({
            type: "content_block_start",
            index: 0,
            content_block: { type: "redacted_thinking", data: "REDACTED" },
        });
        expect(parse(start() + redacted + textBlock(1, "Hi") + stop)).toMatchObject({
            reply: { outputText: "Hi", reasoningText: null, hiddenReasoning: true },
        });
    });

    it("flags thinking blocks without streamed text as hidden reasoning", () => {
        const thinking = event({
            type: "content_block_start",
            index: 0,
            content_block: { type: "thinking", thinking: "", summaries: [] },
        });
        expect(parse(start() + thinking + textBlock(1, "Hi") + stop)).toMatchObject({
            reply: { reasoningText: null, hiddenReasoning: true },
        });
    });

    it("falls back to the requested model, then to null", () => {
        const text = start("") + textBlock(0, "Hi") + stop;
        const req = request({ body: JSON.stringify({ model: "claude-haiku-4-5-20251001" }) });
        expect(parse(text, Infinity, req)).toMatchObject({
            reply: { rawModel: "claude-haiku-4-5-20251001" },
        });
        expect(parse(text)).toMatchObject({ reply: { rawModel: null } });
        expect(parse(text, Infinity, request({ body: "{not json" }))).toMatchObject({
            reply: { rawModel: null },
        });
    });

    it("counts streamed thinking rather than its summaries", () => {
        const thinking =
            event({
                type: "content_block_start",
                index: 0,
                content_block: { type: "thinking", thinking: "", summaries: [] },
            }) +
            event({
                type: "content_block_delta",
                index: 0,
                delta: { type: "thinking_delta", thinking: "17 * 23 = 391." },
            }) +
            event({
                type: "content_block_delta",
                index: 0,
                delta: { type: "thinking_summary_delta", summary: { summary: "Multiplying." } },
            }) +
            event({
                type: "content_block_delta",
                index: 0,
                delta: { type: "signature_delta", signature: "REDACTED" },
            });
        expect(parse(start() + thinking + textBlock(1, "391") + stop)).toMatchObject({
            reply: { outputText: "391", reasoningText: "17 * 23 = 391.", hiddenReasoning: false },
        });
    });

    it("counts summaries listed in the thinking block start", () => {
        const thinking = event({
            type: "content_block_start",
            index: 0,
            content_block: {
                type: "thinking",
                thinking: "",
                summaries: [{ summary: "One." }, { summary: "Two." }, "invalid"],
            },
        });
        expect(parse(start() + thinking + textBlock(1, "Hi") + stop)).toMatchObject({
            reply: { reasoningText: "One.\nTwo.", hiddenReasoning: true },
        });
    });

    it("keeps the message id when a later message_start has none", () => {
        const bare = event({ type: "message_start", message: { model: "" } });
        expect(parse(start() + bare + textBlock(0, "Hi") + stop)).toMatchObject({
            reply: { messageId: "u1", rawModel: "claude-sonnet-4-5" },
        });
    });

    it("joins text blocks in index order", () => {
        expect(parse(start() + textBlock(1, "two") + textBlock(0, "one") + stop)).toMatchObject({
            reply: { outputText: "one\ntwo" },
        });
    });

    it("counts a tool input sent whole in its start event", () => {
        const tool = event({
            type: "content_block_start",
            index: 0,
            content_block: { type: "tool_use", name: "artifacts", input: { command: "create" } },
        });
        expect(parse(start() + tool + textBlock(1, "Done") + stop)).toMatchObject({
            reply: { outputText: '{"command":"create"}\nDone' },
        });
    });

    it("counts a streamed tool call as output, not the tool result", () => {
        const tool =
            event({
                type: "content_block_start",
                index: 0,
                content_block: { type: "tool_use", name: "weather", input: {} },
            }) +
            event({
                type: "content_block_delta",
                index: 0,
                delta: { type: "input_json_delta", partial_json: '{"city": "Paris"}' },
            }) +
            event({
                type: "content_block_start",
                index: 1,
                content_block: { type: "tool_result", content: [] },
            }) +
            event({
                type: "content_block_delta",
                index: 1,
                delta: { type: "text_delta", text: "Sunny" },
            });
        expect(parse(start() + tool + textBlock(2, "It is sunny.") + stop)).toMatchObject({
            reply: { outputText: '{"city": "Paris"}\nIt is sunny.' },
        });
    });

    it("ignores keep-alives, unknown events, malformed JSON and deltas of unknown blocks", () => {
        const noise =
            ": comment\n\ndata: {not json\n\ndata: 42\n\n" +
            event({
                type: "content_block_delta",
                index: 9,
                delta: { type: "text_delta", text: "x" },
            });
        expect(parse(noise + start() + noise + textBlock(0, "Hi") + noise + stop)).toMatchObject({
            kind: "reply",
            reply: { outputText: "Hi" },
        });
    });

    it("accepts the former completion events", () => {
        const completion = (completion: string, stop_reason: string | null) =>
            `data: ${JSON.stringify({ type: "completion", completion, stop_reason, model: "claude-2.1", id: "c1" })}\n\n`;
        expect(parse(completion("Hel", null) + completion("lo", "stop_sequence"))).toEqual({
            kind: "reply",
            reply: {
                rawModel: "claude-2.1",
                outputText: "Hello",
                reasoningText: null,
                hiddenReasoning: false,
                messageId: "c1",
                partial: false,
            },
        });
        expect(parse(completion("Hel", null))).toMatchObject({ kind: "skip" });
    });
});
