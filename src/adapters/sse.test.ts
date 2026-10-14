import { describe, expect, it } from "vitest";
import { SseDecoder, type SseEvent } from "./sse";

function decodeAll(chunks: string[]): SseEvent[] {
    const decoder = new SseDecoder();
    return [...chunks.flatMap((c) => decoder.push(c)), ...decoder.flush()];
}

describe("SseDecoder", () => {
    it("decodes named and unnamed events", () => {
        expect(decodeAll(['event: delta\ndata: {"v":1}\n\ndata: [DONE]\n\n'])).toEqual([
            { event: "delta", data: '{"v":1}' },
            { event: "message", data: "[DONE]" },
        ]);
    });

    it("joins multi-line data and ignores comments and unknown fields", () => {
        expect(decodeAll([": ping\nid: 1\ndata: a\ndata:b\nretry: 10\n\n"])).toEqual([
            { event: "message", data: "a\nb" },
        ]);
    });

    it("handles every line ending, split anywhere", () => {
        const text = "data: one\r\n\r\ndata: two\r\rdata: three\n\n";
        const expected = [
            { event: "message", data: "one" },
            { event: "message", data: "two" },
            { event: "message", data: "three" },
        ];
        for (let i = 0; i <= text.length; i++) {
            expect(decodeAll([text.slice(0, i), text.slice(i)]), `split at ${i}`).toEqual(expected);
        }
        expect(decodeAll([...text])).toEqual(expected);
    });

    it("dispatches an unterminated final event on flush", () => {
        expect(decodeAll(["data: [DONE]"])).toEqual([{ event: "message", data: "[DONE]" }]);
    });

    it("skips events without data", () => {
        expect(decodeAll(["event: ping\n\n"])).toEqual([]);
    });
});
