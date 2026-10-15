import { describe, expect, it } from "vitest";
import type { CapturedRequest, ParseOutcome, StreamParser } from "./types";

/** Test suite every adapter must pass, whatever its stream format. Imported by tests only. */

interface ParserFactory {
    createParser(request: CapturedRequest): StreamParser;
}

/** Lines that are neither valid SSE events nor valid NDJSON objects for any adapter. */
const NOISE = [
    ": keep-alive",
    "",
    "data: {not json",
    "",
    "{not json",
    "",
    "data: 42",
    "",
    "[1]",
    "",
    'data: {"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}',
    "",
    '{"__proto__":{"polluted":true},"type":"content","messageId":"__proto__","markdown":"x"}',
    "",
    "",
].join("\n");

export function parseText(
    adapter: ParserFactory,
    request: CapturedRequest,
    text: string,
    chunkSize = Infinity,
): ParseOutcome {
    const parser = adapter.createParser(request);
    for (let i = 0; i < text.length; i += chunkSize) parser.push(text.slice(i, i + chunkSize));
    return parser.finish();
}

/**
 * Checks that an adapter parses its recorded `fixtures` (name → stream text) the same way
 * whatever the chunking, only returns replies from complete streams, and survives malformed
 * input.
 */
export function describeAdapterContract(
    name: string,
    adapter: ParserFactory,
    request: CapturedRequest,
    fixtures: Readonly<Record<string, string>>,
): void {
    const parse = (text: string, chunkSize?: number) =>
        parseText(adapter, request, text, chunkSize);

    describe(`${name}: adapter contract`, () => {
        it.each(Object.keys(fixtures))("%s: same result whatever the chunking", (fixture) => {
            const text = fixtures[fixture]!;
            const expected = parse(text);
            for (const size of [1, 7, 64]) {
                expect(parse(text, size), `chunk ${size}`).toEqual(expected);
            }
        });

        it("skips an empty stream", () => {
            expect(parse("")).toMatchObject({ kind: "skip" });
        });

        it.each(Object.keys(fixtures))("%s: skips the stream truncated halfway", (fixture) => {
            const text = fixtures[fixture]!;
            expect(parse(text.slice(0, text.length / 2))).toMatchObject({ kind: "skip" });
        });

        it("skips malformed input without throwing nor touching prototypes", () => {
            expect(parse(NOISE)).toMatchObject({ kind: "skip" });
            expect(parse(NOISE, 1)).toMatchObject({ kind: "skip" });
            expect(({} as Record<string, unknown>).polluted).toBeUndefined();
        });

        it.each(Object.keys(fixtures))(
            "%s: ignores malformed lines before the stream",
            (fixture) => {
                const text = fixtures[fixture]!;
                expect(parse(NOISE + text)).toEqual(parse(text));
            },
        );
    });
}
