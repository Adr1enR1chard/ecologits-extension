import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { describeAdapterContract, parseText } from "../src/capture/adapter-contract";
import { findEndpoint } from "../src/capture/interceptor";
import type { CapturedRequest, ParseOutcome, ReplyEndpoint } from "../src/capture/types";
import { CAPTURES } from "../src/providers/capture";
import { SUPPORTED_PROVIDERS, type SupportedProvider } from "../src/providers/registry";

/**
 * Replays every recorded stream against the parser of its endpoint: the outcome must be the one
 * the case is recorded for (a reply, a partial one, a skip), whatever the provider and whatever
 * the recorded values, so that recording a case again never breaks a test. How to record each
 * case is in `fixtures/README.md`.
 */

const FIXTURES = join(import.meta.dirname, "fixtures");

interface RecordedCase {
    /** The stream file under `test/fixtures/<provider>/`. */
    file: string;
    /** A URL of the reply endpoint the stream is requested from, to pick its parser. */
    endpoint: string;
    /** How the stream ended: read to its end, or aborted by the page. */
    end: "done" | "aborted";
    /** What the parser makes of it: a complete reply, a partial one, or a skip. */
    outcome: "reply" | "partial" | "skip";
    /** What is wrong with the recorded stream for this case, if anything. */
    check?(outcome: ParseOutcome, text: string): string | undefined;
}

const CHATGPT_CONVERSATION = "https://chatgpt.com/backend-api/f/conversation";
const CHATGPT_LOGGED_OUT = "https://chatgpt.com/unauth-mweb/conversation/updates";
const CLAUDE_COMPLETION =
    "https://claude.ai/api/organizations/00000000-0000-4000-8000-0000000000aa/chat_conversations/00000000-0000-4000-8000-0000000000bb/completion";

const CASES: Readonly<Record<SupportedProvider, readonly RecordedCase[]>> = {
    chatgpt: [
        {
            file: "logged-out-reply.ndjson",
            endpoint: CHATGPT_LOGGED_OUT,
            end: "done",
            outcome: "reply",
        },
        {
            file: "logged-out-stopped.ndjson",
            endpoint: CHATGPT_LOGGED_OUT,
            end: "aborted",
            outcome: "partial",
        },
        { file: "normal-reply.sse", endpoint: CHATGPT_CONVERSATION, end: "done", outcome: "reply" },
        {
            file: "thinking-reply.sse",
            endpoint: CHATGPT_CONVERSATION,
            end: "done",
            outcome: "reply",
            check: (outcome, text) => {
                if (outcome.kind === "reply" && !outcome.reply.reasoningText) {
                    return "no reasoning streamed: pick a Thinking model";
                }
                return text.includes('"recipient":"web.run"') ? undefined : "no web search";
            },
        },
        {
            file: "regenerate.sse",
            endpoint: CHATGPT_CONVERSATION,
            end: "done",
            outcome: "reply",
            check: (_, text) =>
                text.includes('"message_type":"variant"') ? undefined : "not a regenerated reply",
        },
        {
            file: "tool-call.sse",
            endpoint: CHATGPT_CONVERSATION,
            end: "done",
            outcome: "reply",
            check: (_, text) =>
                /"content_type": ?"code"/.test(text) ? undefined : "no code tool call",
        },
        { file: "aborted.sse", endpoint: CHATGPT_CONVERSATION, end: "aborted", outcome: "partial" },
    ],
    claude: [
        { file: "normal-reply.sse", endpoint: CLAUDE_COMPLETION, end: "done", outcome: "reply" },
        {
            file: "tool-call.sse",
            endpoint: CLAUDE_COMPLETION,
            end: "done",
            outcome: "reply",
            check: (_, text) =>
                text.includes('"tool_use"')
                    ? undefined
                    : "no tool_use block: Claude called no tool",
        },
        {
            file: "aborted.sse",
            endpoint: CLAUDE_COMPLETION,
            end: "aborted",
            outcome: "partial",
            check: (_, text) =>
                text.includes('"thinking"')
                    ? undefined
                    : "no thinking block: turn on extended thinking",
        },
    ],
};

interface Recorded {
    fixture: RecordedCase;
    endpoint: ReplyEndpoint;
    request: CapturedRequest;
    text: string;
}

describe.each(SUPPORTED_PROVIDERS)("%s recorded cases", (provider) => {
    const recorded: Recorded[] = CASES[provider].map((fixture) => {
        const request = { url: new URL(fixture.endpoint), method: "POST", body: null };
        const matched = findEndpoint(CAPTURES, request);
        if (matched?.provider !== provider) {
            throw new Error(`${fixture.file}: no ${provider} endpoint for ${fixture.endpoint}`);
        }
        const text = readFileSync(join(FIXTURES, provider, fixture.file), "utf8");
        return { fixture, endpoint: matched.endpoint, request, text };
    });

    for (const endpoint of new Set(recorded.map((r) => r.endpoint))) {
        const cases = recorded.filter((r) => r.endpoint === endpoint);
        describeAdapterContract(
            `${provider} ${endpoint.path}`,
            endpoint,
            cases[0]!.request,
            Object.fromEntries(cases.map((r) => [r.fixture.file, r.text])),
        );
    }

    describe.each(recorded)("$fixture.file", ({ fixture, endpoint, request, text }) => {
        const outcome = parseText(endpoint, request, text, Infinity, fixture.end);

        it(`is a ${fixture.outcome}`, () => {
            const kind =
                outcome.kind === "skip" ? "skip" : outcome.reply.partial ? "partial" : "reply";
            expect(kind).toBe(fixture.outcome);
        });

        if (fixture.outcome !== "skip") {
            it("has an output and a message id", () => {
                expect(outcome.kind).toBe("reply");
                const { reply } = outcome as Extract<ParseOutcome, { kind: "reply" }>;
                expect(reply.outputText).not.toBe("");
                expect(reply.messageId).toEqual(expect.any(String));
            });
        }

        if (fixture.outcome === "partial") {
            it("is skipped when cut by a network error or a closed stream instead", () => {
                for (const end of ["done", "failed"] as const) {
                    expect(parseText(endpoint, request, text, Infinity, end)).toMatchObject({
                        kind: "skip",
                    });
                }
            });
        }

        if (fixture.check) {
            it("is still what the case asks for", () => {
                expect(fixture.check!(outcome, text)).toBeUndefined();
            });
        }
    });
});
