import { describe, expect, it } from "vitest";
import { NdjsonDecoder } from "./ndjson";

function decodeAll(chunks: string[]): string[] {
    const decoder = new NdjsonDecoder();
    return [...chunks.flatMap((c) => decoder.push(c)), ...decoder.flush()];
}

describe("NdjsonDecoder", () => {
    it("splits lines, trimming them and dropping blank ones", () => {
        expect(decodeAll(['{"a":1}\r\n\n  {"b":2}  \n'])).toEqual(['{"a":1}', '{"b":2}']);
    });

    it("handles lines split anywhere", () => {
        const text = '{"a":1}\n{"b":2}\n';
        for (let i = 0; i <= text.length; i++) {
            expect(decodeAll([text.slice(0, i), text.slice(i)]), `split at ${i}`).toEqual([
                '{"a":1}',
                '{"b":2}',
            ]);
        }
    });

    it("returns an unterminated final line on flush", () => {
        expect(decodeAll(['{"a":1}\n{"b"', ":2}"])).toEqual(['{"a":1}', '{"b":2}']);
    });

    it("returns nothing for an empty stream", () => {
        expect(decodeAll([])).toEqual([]);
        expect(decodeAll(["", "\n"])).toEqual([]);
    });
});
