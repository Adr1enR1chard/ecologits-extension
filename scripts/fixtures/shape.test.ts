import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { comparePages, compareStreams, pageShape, streamShape } from "./shape";

const STREAM = [
    "event: message_start",
    'data: {"type":"message_start","message":{"id":"m1","model":"claude-x","content":[]}}',
    "",
    "event: content_block_delta",
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}',
    "",
    "event: content_block_delta",
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" Bob"}}',
    "",
    "event: message_stop",
    'data: {"type":"message_stop"}',
    "",
    "data: [DONE]",
    "",
    "",
].join("\n");

function drift(committed: string, fresh: string): string[] {
    return compareStreams(streamShape(committed), streamShape(fresh));
}

describe("streamShape", () => {
    it("lists event types in order, consecutive repeats collapsed, markers by their text", () => {
        expect(streamShape(STREAM).events).toEqual([
            "message_start",
            "content_block_delta",
            "message_stop",
            "message:[DONE]",
        ]);
    });

    it("names an event without SSE name by its JSON type, an NDJSON line too", () => {
        const sse = 'data: {"type":"resume_conversation_token","token":"x"}\n\n';
        expect(streamShape(sse).events).toEqual(["message:resume_conversation_token"]);
        const ndjson = '{"type":"control","detail":{}}\n{"type":"end"}\n';
        expect(streamShape(ndjson).events).toEqual(["control", "end"]);
    });

    it("keeps each key path with the types of its values, ids as <id>", () => {
        const { paths } = streamShape(
            'data: {"v":[1,"a"],"ok":true,"none":null,"by":{"00000000-0000-4000-8000-000000000001":{}}}\n\n',
        );
        expect(Object.fromEntries([...paths].map(([path, types]) => [path, [...types]]))).toEqual({
            message: ["object"],
            "message.v": ["array"],
            "message.v[]": ["number", "string"],
            "message.ok": ["boolean"],
            "message.none": ["null"],
            "message.by": ["object"],
            "message.by.<id>": ["object"],
        });
    });

    it("keeps the paths of an event cut by an abort", () => {
        const cut = 'event: delta\ndata: {"type":"delta","delta":{"text":"Hel';
        expect([...streamShape(cut).paths.keys()]).toContain("delta.delta.text");
    });
});

describe("compareStreams", () => {
    it("finds no drift between identical streams", () => {
        expect(drift(STREAM, STREAM)).toEqual([]);
    });

    it("finds no drift when only text changes, nor in the number of deltas", () => {
        const masked = STREAM.replace("Hello", "xxxxx").replace(" Bob", " xxxxxxxxxxx");
        expect(drift(STREAM, masked)).toEqual([]);
        const longer = STREAM.replace(
            "event: message_stop",
            'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"!"}}\n\nevent: message_stop',
        );
        expect(drift(STREAM, longer)).toEqual([]);
    });

    it("reports an added event type", () => {
        const added = STREAM.replace(
            "event: message_stop",
            'event: message_limit\ndata: {"type":"message_limit"}\n\nevent: message_stop',
        );
        expect(drift(STREAM, added)).toEqual([
            "added event types: message_limit",
            "added key path: message_limit (object)",
            "added key path: message_limit.type (string)",
        ]);
    });

    it("reports a missing event type", () => {
        const missing = STREAM.replace("data: [DONE]\n\n", "");
        expect(drift(STREAM, missing)).toEqual(["missing event types: message:[DONE]"]);
    });

    it("reports events coming in another order", () => {
        const reordered = STREAM.replace("data: [DONE]\n\n", "").replace(
            "event: message_start",
            "data: [DONE]\n\nevent: message_start",
        );
        expect(drift(STREAM, reordered)).toEqual([
            "event order changed: message_start → content_block_delta → message_stop → message:[DONE]",
            "                 now: message:[DONE] → message_start → content_block_delta → message_stop",
        ]);
    });

    it("reports a removed key", () => {
        const removed = STREAM.replace(',"model":"claude-x"', "");
        expect(drift(STREAM, removed)).toEqual([
            "missing key path: message_start.message.model (string)",
        ]);
    });

    it("reports an added key", () => {
        const added = STREAM.replace('"model":"claude-x"', '"model":"claude-x","usage":{}');
        expect(drift(STREAM, added)).toEqual([
            "added key path: message_start.message.usage (object)",
        ]);
    });

    it("reports a changed value type", () => {
        const changed = STREAM.replaceAll('"index":0', '"index":"0"');
        expect(drift(STREAM, changed)).toEqual([
            "changed type: content_block_delta.index: number → string",
        ]);
    });
});

const REPLY = (attributes = 'class="actions"') =>
    `<div class="thread">` +
    `<div data-testid="assistant-message" data-turn-key="00000000-0000-4000-8000-000000000001" data-is-streaming="false"><p>x</p>` +
    `<div ${attributes}><div data-testid="message-actions"></div></div></div></div>`;

describe("pageShape", () => {
    it("passes the page checks and gives the path from the last reply to its anchor", () => {
        expect(pageShape("claude", REPLY())).toEqual({
            markup: 0,
            problems: [],
            anchorPath: "div[data-is-streaming,data-testid,data-turn-key] ↓ div[class]",
        });
    });

    it("tells what the page checks find wrong, without anchor path", () => {
        const shape = pageShape(
            "claude",
            REPLY().replace('data-is-streaming="false"', 'data-is-streaming="true"'),
        );
        expect(shape.problems).not.toEqual([]);
        expect(pageShape("claude", "<div><p>x</p></div>")).toMatchObject({
            markup: null,
            problems: [expect.stringContaining("no reply")],
            anchorPath: null,
        });
    });
});

describe("comparePages", () => {
    it("finds no drift between identical snapshots, nor when only text changes", () => {
        expect(comparePages(pageShape("claude", REPLY()), pageShape("claude", REPLY()))).toEqual(
            [],
        );
        const text = REPLY().replace("<p>x</p>", "<p>xxxx xxx</p>");
        expect(comparePages(pageShape("claude", REPLY()), pageShape("claude", text))).toEqual([]);
    });

    it("reports a renamed attribute on the anchor path", () => {
        const renamed = pageShape("claude", REPLY('data-actions="1"'));
        expect(comparePages(pageShape("claude", REPLY()), renamed)).toEqual([
            "anchor path changed: div[data-is-streaming,data-testid,data-turn-key] ↓ div[class]",
            "                now: div[data-is-streaming,data-testid,data-turn-key] ↓ div[data-actions]",
        ]);
    });

    it("reports a failing page check, with or without committed snapshot", () => {
        const lost = pageShape("claude", REPLY().replace('data-testid="message-actions"', ""));
        const expected = [expect.stringMatching(/^page check failed: 0 elements match the anchor/)];
        expect(comparePages(pageShape("claude", REPLY()), lost)).toEqual(expected);
        expect(comparePages(null, lost)).toEqual(expected);
    });

    it("compares a committed snapshot of the repository with itself without drift", () => {
        const html = readFileSync(
            join(import.meta.dirname, "../../test/fixtures/claude/normal-reply.html"),
            "utf8",
        );
        expect(comparePages(pageShape("claude", html), pageShape("claude", html))).toEqual([]);
    });
});
