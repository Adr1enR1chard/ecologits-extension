import { describe, expect, it } from "vitest";
import type { CapturedRequest, ParseOutcome, StreamEnd, StreamParser } from "./types";

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
    end: StreamEnd = "done",
): ParseOutcome {
    const parser = adapter.createParser(request);
    for (let i = 0; i < text.length; i += chunkSize) parser.push(text.slice(i, i + chunkSize));
    return parser.finish(end);
}

const ENDS: readonly StreamEnd[] = ["done", "aborted", "failed"];

/** Whether an outcome is a skip or a reply flagged as partial. */
function isSkipOrPartial(outcome: ParseOutcome): boolean {
    return outcome.kind === "skip" || outcome.reply.partial;
}

/**
 * Checks that an adapter parses its recorded `fixtures` (name → stream text) the same way
 * whatever the chunking, only returns complete replies from complete streams and partial ones
 * from streams the page aborted, and survives malformed input.
 */
export function describeAdapterContract(
    name: string,
    adapter: ParserFactory,
    request: CapturedRequest,
    fixtures: Readonly<Record<string, string>>,
): void {
    const parse = (text: string, chunkSize?: number, end?: StreamEnd) =>
        parseText(adapter, request, text, chunkSize, end);

    describe(`${name}: adapter contract`, () => {
        it.each(Object.keys(fixtures))("%s: same result whatever the chunking", (fixture) => {
            const text = fixtures[fixture]!;
            for (const end of ENDS) {
                const expected = parse(text, Infinity, end);
                for (const size of [1, 7, 64]) {
                    expect(parse(text, size, end), `${end}, chunk ${size}`).toEqual(expected);
                }
            }
        });

        it.each(ENDS)("skips an empty stream (%s)", (end) => {
            expect(parse("", Infinity, end)).toMatchObject({ kind: "skip" });
        });

        it.each(Object.keys(fixtures))(
            "%s: skips the stream truncated halfway, unless aborted: then partial",
            (fixture) => {
                const half = fixtures[fixture]!.slice(0, fixtures[fixture]!.length / 2);
                expect(parse(half, Infinity, "done")).toMatchObject({ kind: "skip" });
                expect(parse(half, Infinity, "failed")).toMatchObject({ kind: "skip" });
                expect(isSkipOrPartial(parse(half, Infinity, "aborted"))).toBe(true);
            },
        );

        it.each(Object.keys(fixtures))(
            "%s: an abort after the end of a complete reply changes nothing",
            (fixture) => {
                const text = fixtures[fixture]!;
                const complete = parse(text);
                if (complete.kind === "reply") {
                    expect(complete.reply.partial).toBe(false);
                    expect(parse(text, Infinity, "aborted")).toEqual(complete);
                    expect(parse(text, Infinity, "failed")).toEqual(complete);
                }
            },
        );

        it.each(ENDS)(
            "skips malformed input without throwing nor touching prototypes (%s)",
            (end) => {
                expect(parse(NOISE, Infinity, end)).toMatchObject({ kind: "skip" });
                expect(parse(NOISE, 1, end)).toMatchObject({ kind: "skip" });
                expect(({} as Record<string, unknown>).polluted).toBeUndefined();
            },
        );

        it.each(Object.keys(fixtures))(
            "%s: ignores malformed lines before the stream",
            (fixture) => {
                const text = fixtures[fixture]!;
                for (const end of ENDS) {
                    expect(parse(NOISE + text, Infinity, end)).toEqual(parse(text, Infinity, end));
                }
            },
        );
    });
}
