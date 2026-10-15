import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describeAdapterContract } from "../../capture/adapter-contract";
import { findEndpoint } from "../../capture/interceptor";
import { chatgptLoggedOutEndpoint } from "./logged-out";
import type { CapturedRequest, ParseOutcome } from "../../capture/types";

const matches = (request: CapturedRequest) =>
    findEndpoint({ chatgpt: { endpoints: [chatgptLoggedOutEndpoint] } }, request)?.endpoint ===
    chatgptLoggedOutEndpoint;

const UPDATES = "https://chatgpt.com/unauth-mweb/conversation/updates?operationId=1";
const read = (name: string) =>
    readFileSync(new URL(`../../../test/fixtures/chatgpt/${name}.ndjson`, import.meta.url), "utf8");
const fixture = read("logged-out-reply");
const stopped = read("logged-out-stopped");

function request(url = UPDATES, method = "POST"): CapturedRequest {
    return { url: new URL(url), method, body: null };
}

function parse(text: string, chunkSize = Infinity): ParseOutcome {
    const parser = chatgptLoggedOutEndpoint.createParser(request());
    for (let i = 0; i < text.length; i += chunkSize) parser.push(text.slice(i, i + chunkSize));
    return parser.finish();
}

const line = (data: object) => JSON.stringify({ version: 1, ...data }) + "\n";
const terminal = (terminalKind: string, messageId = "a") =>
    line({ type: "control", detail: { kind: "terminal-received", messageId, terminalKind } });

describeAdapterContract("chatgpt logged out", chatgptLoggedOutEndpoint, request(), {
    "logged-out-reply": fixture,
    "logged-out-stopped": stopped,
});

describe("chatgptLoggedOutEndpoint matching", () => {
    it("matches the logged-out updates stream", () => {
        expect(matches(request())).toBe(true);
    });

    it.each([
        "https://chatgpt.com/unauth-mweb/conversation/prepare?lightweight_authenticated=0",
        "https://chatgpt.com/unauth-mweb/events/page-view",
        "https://chatgpt.com/backend-api/f/conversation",
        "https://evil.example/unauth-mweb/conversation/updates",
    ])("ignores %s", (url) => {
        expect(matches(request(url))).toBe(false);
    });

    it("ignores non-POST requests", () => {
        expect(matches(request(UPDATES, "GET"))).toBe(false);
    });
});

describe("chatgpt logged-out stream", () => {
    it("parses a recorded reply", () => {
        expect(parse(fixture)).toEqual({
            kind: "reply",
            reply: {
                rawModel: null,
                outputText: "Test successful! ✅ I'm here and ready to help.",
                reasoningText: null,
                hiddenReasoning: false,
                messageId: "00000000-0000-4000-8000-000000000072",
            },
        });
    });

    it("skips replies stopped by the user: the stream just ends", () => {
        expect(parse(stopped)).toEqual({
            kind: "skip",
            reason: "stream ended before terminal-received",
        });
    });

    it("concatenates recorded append lines", () => {
        const completed = stopped + terminal("complete", "00000000-0000-4000-8000-000000000082");
        expect(parse(completed)).toMatchObject({
            reply: {
                outputText:
                    "Mais bien évidemment, prépare-toi mentalement, installe-toi confortablement, " +
                    "prends un petit verre d’eau, mets-toi dans les meilleures conditions possibles " +
                    "et assure-toi d’avoir suffisamment de batterie sur ton téléphone, parce que si " +
                    "tu veux un gros pavé, alors tu vas avoir un GROS pavé. Pas trois",
                messageId: "00000000-0000-4000-8000-000000000082",
            },
        });
    });

    it("skips streams cut before terminal-received", () => {
        const cut = fixture.slice(0, fixture.indexOf('"kind":"terminal-received"'));
        expect(parse(cut.slice(0, cut.lastIndexOf("\n") + 1))).toEqual({
            kind: "skip",
            reason: "stream ended before terminal-received",
        });
    });

    it("skips turns that did not complete", () => {
        const text =
            line({ type: "content", messageId: "a", mode: "replace", markdown: "Hi" }) +
            terminal("aborted");
        expect(parse(text)).toEqual({ kind: "skip", reason: "terminal: aborted" });
    });

    it("applies replace and append modes per message", () => {
        const content = (mode: string, markdown: string) =>
            line({ type: "content", messageId: "a", mode, markdown });
        const text =
            content("replace", "Hel") +
            content("append", "lo") +
            content("replace", "Hello") +
            content("append", " world") +
            terminal("complete") +
            line({ type: "end" });
        expect(parse(text)).toMatchObject({ reply: { outputText: "Hello world", messageId: "a" } });
    });

    it("only counts assistant messages once they are known", () => {
        const text =
            line({ type: "content", messageId: "user", mode: "replace", markdown: "Question" }) +
            line({ type: "content", messageId: "a", mode: "replace", markdown: "Answer" }) +
            line({
                type: "control",
                detail: { kind: "assistant-content-started", messageId: "a" },
            }) +
            terminal("complete");
        expect(parse(text)).toMatchObject({ reply: { outputText: "Answer" } });
    });

    it("ignores malformed lines", () => {
        const text =
            "not json\n[1]\n" +
            line({ type: "content", messageId: "a", mode: "replace", markdown: "Hi" }) +
            terminal("complete");
        expect(parse(text)).toMatchObject({ reply: { outputText: "Hi" } });
    });
});
