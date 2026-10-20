import { describe, expect, it } from "vitest";
import { findEndpoint } from "../../capture/interceptor";
import type { CapturedRequest, ParseOutcome, StreamEnd } from "../../capture/types";
import { geminiSessionEndpoint } from "./capture";

const SESSION_URL =
    "https://geminiweb-pa.clients6.google.com/v1/processSession?VER=8&SID=s1&RID=rpc&TYPE=xmlhttp";

const matches = (url: string, method: "GET" | "POST" = "GET") =>
    findEndpoint(
        { gemini: { endpoints: [geminiSessionEndpoint] } },
        { url: new URL(url), method, body: null },
    )?.endpoint === geminiSessionEndpoint;

const request: CapturedRequest = { url: new URL(SESSION_URL), method: "GET", body: null };

function parse(text: string, chunkSize = Infinity, end: StreamEnd = "done"): ParseOutcome {
    const parser = geminiSessionEndpoint.createParser(request);
    for (let i = 0; i < text.length; i += chunkSize) parser.push(text.slice(i, i + chunkSize));
    return parser.finish(end);
}

type Field = [number, number | string | Uint8Array];

function varint(value: number): number[] {
    const bytes: number[] = [];
    for (; value > 0x7f; value >>>= 7) bytes.push((value & 0x7f) | 0x80);
    bytes.push(value);
    return bytes;
}

/** A protobuf message of varint, string and sub-message fields, in order. */
function proto(...fields: Field[]): Uint8Array {
    return Uint8Array.from(
        fields.flatMap(([number, value]) => {
            if (typeof value === "number") return [...varint(number * 8), ...varint(value)];
            const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
            return [...varint(number * 8 + 2), ...varint(bytes.length), ...bytes];
        }),
    );
}

const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

/** A WebChannel back channel of `payloads`, one batch each. */
function channel(...payloads: unknown[]): string {
    return payloads
        .map((payload, i) => JSON.stringify([[i + 1, payload]]))
        .map((batch) => `${batch.length}\n${batch}`)
        .join("");
}

/** The payload of an update `{ 2: { 7: { 1: event } } }` whose event carries `turn`. */
const update = (final: number, ...turn: Field[]) => [
    base64(
        proto([
            2,
            proto([1, 1], [7, proto([1, proto([1, final], [4, proto([4, proto(...turn)])])])]),
        ]),
    ),
];

const text = (value: string): Field => [5, proto([1, "rc_1"], [2, proto([1, value])])];
const ids = (response = "r_1"): Field => [2, proto([1, "c_1"], [2, response])];
const model = (label = "3.5 Flash-Lite"): Field => [43, label];

const reply = channel(
    ["noop"],
    update(0, ids(), text("Hel"), model()),
    update(0, ids(), text("Hello")),
    update(1, ids(), text("Hello!"), model()),
);

describe("geminiSessionEndpoint matching", () => {
    it("matches the back channel GET on the API host", () => {
        expect(matches(SESSION_URL)).toBe(true);
    });

    it.each([
        SESSION_URL.replace("geminiweb-pa.clients6.google.com", "gemini.google.com"),
        SESSION_URL.replace("geminiweb-pa.clients6.google.com", "evil.example"),
        SESSION_URL.replace("processSession", "processSessions"),
    ])("ignores %s", (url) => {
        expect(matches(url)).toBe(false);
    });

    it("ignores the forward channel POSTs", () => {
        expect(matches(SESSION_URL, "POST")).toBe(false);
    });
});

describe("gemini parser", () => {
    it("reads the whole text, model and response id (without `r_`) of the final update", () => {
        expect(parse(reply)).toEqual({
            kind: "reply",
            reply: {
                rawModel: "3.5 Flash-Lite",
                outputText: "Hello!",
                reasoningText: null,
                hiddenReasoning: false,
                messageId: "1",
                partial: false,
            },
        });
    });

    it("decodes batches split at any point", () => {
        expect(parse(reply, 7)).toEqual(parse(reply));
    });

    it("ignores the updates after the final one", () => {
        const title = update(0, ids("r_2"), text("Greetings"), model("3.5 Flash"));
        expect(parse(reply + channel(title))).toMatchObject({
            reply: { outputText: "Hello!", rawModel: "3.5 Flash-Lite", messageId: "1" },
        });
    });

    it("keeps the model and id when later updates omit them", () => {
        const stream = channel(update(0, ids(), text("Hi"), model()), update(1, text("Hi!")));
        expect(parse(stream)).toMatchObject({
            reply: { outputText: "Hi!", rawModel: "3.5 Flash-Lite", messageId: "1" },
        });
    });

    it("leaves the model null when no update carries it", () => {
        expect(parse(channel(update(1, ids(), text("Hi"))))).toMatchObject({
            reply: { rawModel: null },
        });
    });

    it("flags hidden reasoning when the turn offers to skip the thinking", () => {
        const answerNow: Field = [45, proto([2, proto([1, "Answer now"], [3, 2])])];
        const stream = channel(
            update(0, ids(), text("Hel"), model("3.8 Raisonnement"), answerNow),
            update(1, ids(), text("Hello!")),
        );
        expect(parse(stream)).toMatchObject({
            reply: { outputText: "Hello!", reasoningText: null, hiddenReasoning: true },
        });
    });

    it("captures a stream stopped before the final update as partial", () => {
        const stopped = channel(update(0, ids(), text("Hel"), model()));
        expect(parse(stopped, Infinity, "aborted")).toMatchObject({
            kind: "reply",
            reply: { outputText: "Hel", partial: true },
        });
    });

    it.each<StreamEnd>(["done", "failed"])(
        "skips a stream that ended (%s) before the final update",
        (end) => {
            const cut = channel(update(0, ids(), text("Hel")));
            expect(parse(cut, Infinity, end)).toEqual({
                kind: "skip",
                reason: "stream ended before the final update",
            });
        },
    );

    it("does not close the reply on a final update without text", () => {
        const empty = channel(update(1, ids()), update(1, ids(), text("Hi")));
        expect(parse(empty)).toMatchObject({ reply: { outputText: "Hi" } });
    });

    it("skips a stopped stream without text", () => {
        expect(parse(channel(["noop"], update(0, ids())), Infinity, "aborted")).toEqual({
            kind: "skip",
            reason: "no assistant reply",
        });
    });

    it("ignores keep-alives, other payloads, other messages and malformed lines", () => {
        const noise =
            "garbage\n" +
            channel(
                ["noop"],
                ["c", "s1", null],
                [base64(proto([1, "not an update"]))],
                ["%%% not base64"],
                [42],
            );
        expect(parse(noise + reply + noise)).toEqual(parse(reply));
    });
});
