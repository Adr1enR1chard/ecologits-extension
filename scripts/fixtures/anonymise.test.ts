import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseText } from "../../src/capture/adapter-contract";
import type { CapturedRequest, ParseOutcome, StreamEnd } from "../../src/capture/types";
import { findEndpoint } from "../../src/capture/interceptor";
import { CAPTURES } from "../../src/providers/capture";
import { CAPTURED_PROVIDERS } from "../../src/providers/registry";
import { FIXTURES } from "../../test/fixtures";
import chatgptFixtures from "../../test/fixtures/chatgpt/fixtures";
import claudeFixtures from "../../test/fixtures/claude/fixtures";
import { anonymiseStream } from "./anonymise";
import { findPersonalData, maskText } from "./personal-data";

const ID_A = "3f2b8c1e-9d4a-4e7b-8c2d-1a5f6e7d8c9b";
const ID_B = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const ZERO_1 = "00000000-0000-4000-8000-000000000001";
const ZERO_2 = "00000000-0000-4000-8000-000000000002";
const JWT =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";

describe("maskText", () => {
    it("masks letters and digits, keeping punctuation, spaces and lengths", () => {
        expect(maskText("Hello, World 42!")).toBe("xxxxx, xxxxx 00!");
        expect(maskText("Été à 23,5 °C ✅")).toBe("xxx x 00,0 °x ✅");
        const astral = "𝐀b";
        expect(maskText(astral)).toHaveLength(astral.length);
    });

    it("turns email addresses into something that is not one", () => {
        expect(maskText("write to jane.doe@example.com")).toBe("xxxxx xx xxxx.xxxxxxxxxxx.xxx");
        expect(findPersonalData(maskText("jane.doe@example.com"))).toEqual([]);
    });
});

describe("anonymiseStream: SSE", () => {
    it("masks text, keeps structural values and the event structure untouched", () => {
        const text = [
            "event: delta_encoding",
            'data: "v1"',
            "",
            ": keep-alive",
            "event: delta",
            'data: {"type":"text" ,  "role":"assistant","text":"Hi Bob, 42!"}   ',
            "",
            "data: [DONE]",
            "",
        ].join("\r\n");
        expect(anonymiseStream(chatgptFixtures.rules, text)).toBe(
            text.replace('"Hi Bob, 42!"', '"xx xxx, 00!"'),
        );
    });

    it("keeps Claude's padded events and model slug", () => {
        const text =
            "event: message_start\n" +
            'data: {"type":"message_start","message":{"model":"claude-sonnet-5-5","content":[]}   }\n\n' +
            "event: content_block_delta\n" +
            'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Bonjour"}}\n\n';
        expect(anonymiseStream(claudeFixtures.rules, text)).toBe(
            text.replace("Bonjour", "xxxxxxx"),
        );
    });

    it("maps each id to the same zeroed UUID, wherever it appears", () => {
        const text = [
            `data: {"message":{"id":"${ID_A}","metadata":{"parent_id":"${ID_B}"}}}`,
            "",
            `data: {"v":{"message":{"id":"${ID_B}","metadata":{"merged_message_id":"${ID_A}"}}}}`,
            "",
            `data: {"p":"/message/metadata/results/${ID_A}","o":"add","v":"see /c/${ID_B} now"}`,
            "",
            "",
        ].join("\n");
        expect(anonymiseStream(chatgptFixtures.rules, text)).toBe(
            [
                `data: {"message":{"id":"${ZERO_1}","metadata":{"parent_id":"${ZERO_2}"}}}`,
                "",
                `data: {"v":{"message":{"id":"${ZERO_2}","metadata":{"merged_message_id":"${ZERO_1}"}}}}`,
                "",
                `data: {"p":"/message/metadata/results/${ZERO_1}","o":"add","v":"xxx /x/${ZERO_2} xxx"}`,
                "",
                "",
            ].join("\n"),
        );
    });

    it("maps the UUIDs of object keys like those of values, keeping other keys", () => {
        const text = `data: {"results":{"${ID_A}":{"status":"resolved"},"item-${ID_B}":{"id":"${ID_A}"}}}\n\n`;
        expect(anonymiseStream(chatgptFixtures.rules, text)).toBe(
            `data: {"results":{"${ZERO_1}":{"status":"resolved"},"item-${ZERO_2}":{"id":"${ZERO_1}"}}}\n\n`,
        );
    });

    it("maps ids that are not UUIDs under id keys, and restarts the mapping per stream", () => {
        const text =
            'data: {"type":"message_start","message":{"id":"chatcompl_01abc","uuid":"u1"}}\n\n' +
            'data: {"type":"content_block_start","content_block":{"tool_use_id":"chatcompl_01abc"}}\n\n';
        const expected =
            `data: {"type":"message_start","message":{"id":"${ZERO_1}","uuid":"${ZERO_2}"}}\n\n` +
            `data: {"type":"content_block_start","content_block":{"tool_use_id":"${ZERO_1}"}}\n\n`;
        expect(anonymiseStream(claudeFixtures.rules, text)).toBe(expected);
        expect(anonymiseStream(claudeFixtures.rules, text)).toBe(expected);
    });

    it("redacts tokens, by key and by shape", () => {
        const text =
            'data: {"type":"resume_conversation_token","token":"abc.def","conversation_id":"c1"}\n\n' +
            `data: {"type":"x","auth":"${JWT}","key":"Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MEFCQ0RFRkdISUpL"}\n\n`;
        expect(anonymiseStream(chatgptFixtures.rules, text)).toBe(
            `data: {"type":"resume_conversation_token","token":"REDACTED","conversation_id":"${ZERO_1}"}\n\n` +
                'data: {"type":"x","auth":"REDACTED","key":"REDACTED"}\n\n',
        );
    });

    it("redacts account details, strings and numbers", () => {
        const chatgpt =
            'data: {"type":"server_ste_metadata","metadata":{"plan_type":"plus","email":"a@b.co","account":{"user_id":"user-123"}}}\n\n';
        expect(anonymiseStream(chatgptFixtures.rules, chatgpt)).toBe(
            'data: {"type":"server_ste_metadata","metadata":{"plan_type":"REDACTED","email":"REDACTED","account":{"user_id":"REDACTED"}}}\n\n',
        );
        const claude =
            'data: {"type":"message_limit","message_limit":{"type":"within_limit","windows":{"5h":{"utilization":37,"resets_at":1791989725}}}}\n\n';
        expect(anonymiseStream(claudeFixtures.rules, claude)).toBe(
            'data: {"type":"message_limit","message_limit":{"type":"within_limit","windows":{"5h":{"utilization":0,"resets_at":0}}}}\n\n',
        );
    });

    it("keeps the values a ChatGPT delta writes to a structural key, and masks the others", () => {
        const text = [
            'data: {"p":"/message/content/parts/0","o":"append","v":"Hello"}',
            "",
            'data: {"v":" world"}',
            "",
            'data: {"p":"","o":"patch","v":[{"p":"/message/content/parts/0","o":"append","v":"!"},{"p":"/message/status","o":"replace","v":"finished_successfully"}]}',
            "",
            'data: {"v":"in_progress"}',
            "",
            'data: {"p":"/message/metadata","o":"append","v":{"model_slug":"gpt-6","title":"Paris"}}',
            "",
            "",
        ].join("\n");
        expect(anonymiseStream(chatgptFixtures.rules, text)).toBe(
            text
                .replace('"Hello"', '"xxxxx"')
                .replace('" world"', '" xxxxx"')
                .replace('"Paris"', '"xxxxx"'),
        );
    });

    it("masks an event cut mid-string by an abort", () => {
        const text = 'data: {"p":"/message/content/parts/0","o":"append","v":"Bonjour à to';
        expect(anonymiseStream(chatgptFixtures.rules, text)).toBe(
            'data: {"p":"/message/content/parts/0","o":"append","v":"xxxxxxx x xx',
        );
    });

    it("masks escaped text by its decoded value", () => {
        const text = 'data: {"text":"caf\\u00e9\\n\\"ok\\""}\n\n';
        expect(anonymiseStream(claudeFixtures.rules, text)).toBe(
            'data: {"text":"xxxx\\n\\"xx\\""}\n\n',
        );
    });

    it("parses an event's data lines as one value, keeping each line in place", () => {
        const text = [
            "event: content_block_delta",
            'data: {"type":"content_block_delta",',
            'data:  "delta":{"type":"text_delta",',
            `data:"text":"Hello Bob", "id":"${ID_A}"}}`,
            "",
            "",
        ].join("\r\n");
        expect(anonymiseStream(claudeFixtures.rules, text)).toBe(
            text.replace('"Hello Bob"', '"xxxxx xxx"').replace(ID_A, ZERO_1),
        );
    });

    it("masks each line's part of a string left open over several data lines", () => {
        const text = 'data: {"text":"Hello\ndata: Bob"}\n\n';
        expect(anonymiseStream(claudeFixtures.rules, text)).toBe(
            'data: {"text":"xxxxx\ndata: xxx"}\n\n',
        );
    });
});

describe("anonymiseStream: NDJSON", () => {
    it("anonymises each line, keeping the lines, their order and the blank ones", () => {
        const text = [
            `{"version":1,"type":"control","detail":{"operationId":"${ID_A}","kind":"conversation-id","canonicalPath":"/c/${ID_B}"},"stopConduitToken":"tok"}`,
            "",
            `{"version":1,"type":"content","messageId":"${ID_B}","mode":"append","markdown":"Hi 2 you","status":"streaming"}`,
            `  {"version":1,"type":"control","detail":{"kind":"terminal-received","terminalKind":"complete","messageId":"${ID_B}"}}`,
            "",
        ].join("\n");
        expect(anonymiseStream(chatgptFixtures.rules, text)).toBe(
            [
                `{"version":1,"type":"control","detail":{"operationId":"${ZERO_1}","kind":"conversation-id","canonicalPath":"/x/${ZERO_2}"},"stopConduitToken":"REDACTED"}`,
                "",
                `{"version":1,"type":"content","messageId":"${ZERO_2}","mode":"append","markdown":"xx 0 xxx","status":"streaming"}`,
                `  {"version":1,"type":"control","detail":{"kind":"terminal-received","terminalKind":"complete","messageId":"${ZERO_2}"}}`,
                "",
            ].join("\n"),
        );
    });
});

const FIXTURE_DIR = new URL("../../test/fixtures/", import.meta.url);

/** What anonymising must not change: the kind of outcome, the model, the flags and lengths. */
function shape(outcome: ParseOutcome) {
    if (outcome.kind === "skip") return outcome;
    const { reply } = outcome;
    return {
        kind: outcome.kind,
        rawModel: reply.rawModel,
        partial: reply.partial,
        hiddenReasoning: reply.hiddenReasoning,
        outputLength: reply.outputText.length,
        reasoningLength: reply.reasoningText?.length ?? null,
        hasMessageId: reply.messageId !== null,
    };
}

/** Every recorded stream, with the parser of its endpoint and its provider's rules. */
const recorded = CAPTURED_PROVIDERS.flatMap((provider) => {
    const fixtures = FIXTURES[provider];
    if (fixtures === undefined) return [];
    return fixtures.cases.map(({ file, endpoint }) => {
        const url = new URL(fixtures.endpoints[endpoint]!);
        const request: CapturedRequest = { url, method: "POST", body: null };
        const parser = findEndpoint(CAPTURES, request)!.endpoint;
        return { provider, file, rules: fixtures.rules, parser, request };
    });
});

describe("anonymiseStream on the recorded fixtures", () => {
    it.each(recorded)(
        "$provider/$file: same parser outcome",
        ({ provider, file, rules, parser, request }) => {
            const text = readFileSync(new URL(`${provider}/${file}`, FIXTURE_DIR), "utf8");
            const anonymised = anonymiseStream(rules, text);
            for (const end of ["done", "aborted", "failed"] as const satisfies StreamEnd[]) {
                const parse = (t: string) => shape(parseText(parser, request, t, Infinity, end));
                expect(parse(anonymised), end).toEqual(parse(text));
            }
            expect(findPersonalData(anonymised)).toEqual([]);
        },
    );
});
