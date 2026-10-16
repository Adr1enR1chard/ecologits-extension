import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RecordedStream } from "../../src/capture/interceptor";
import { anonymiseStream } from "./anonymise";
import { FIXTURE_CASES } from "./cases";
import type { FixtureCase } from "./cases/types";
import { findReplies } from "./page-replies";
import { ZeroedIds } from "./personal-data";
import { recordCases, type ProblemChoice, type Prompter, type RecorderPage } from "./recorder";
import { sanitiseSnapshot } from "./snapshot";

const COMPLETION =
    "https://claude.ai/api/organizations/org/chat_conversations/conversation/completion";
const ABORT = "AbortError: signal is aborted without reason";

/** Message ids of the Claude fixtures. */
const NORMAL_ID = "00000000-0000-4000-8000-000000000002";
const ABORTED_ID = "00000000-0000-4000-8000-000000000009";

function fixture(name: string): string {
    return readFileSync(join(import.meta.dirname, "../../test/fixtures/claude", name), "utf8");
}

function stream(file: string, end = "done", url = COMPLETION): RecordedStream {
    return { url, method: "POST", end, text: fixture(file) };
}

/** A Claude conversation whose last reply has that id. */
function conversation(lastId: string, streaming = false): string {
    const reply = (id: string, rendering: boolean) =>
        `<div data-testid="assistant-message" data-turn-key="${id}" data-is-streaming="${rendering}">` +
        `<p>Reply to Bob</p><div><div data-testid="message-actions"></div></div></div>`;
    return (
        `<nav><a href="/chat/x">Bob's chats</a></nav>` +
        `<main><div class="thread">${reply("11111111-2222-4333-8444-555555555555", false)}` +
        `<div data-testid="user-message"><p>Hi</p></div>${reply(lastId, streaming)}</div></main>`
    );
}

const NORMAL: FixtureCase = {
    id: "normal-reply",
    file: "normal-reply.sse",
    url: "https://claude.ai/new",
    endpoint: COMPLETION,
    instruction: "Send a message.",
    expect: { end: "done", outcome: "reply" },
};

const ABORTED: FixtureCase = {
    id: "aborted",
    file: "aborted.sse",
    url: "https://claude.ai/new",
    endpoint: COMPLETION,
    instruction: "Press Stop.",
    expect: { end: "aborted", outcome: "partial" },
};

/** Hands out `streams` in order, and `pages` in order, the last one for good. */
function fakePage(streams: RecordedStream[], pages: string[]) {
    const visited: string[] = [];
    const page: RecorderPage = {
        goto: async (url) => {
            visited.push(url);
        },
        nextStream: async () => {
            const next = streams.shift();
            if (!next) throw new Error("no more streams");
            return next;
        },
        html: async () => (pages.length > 1 ? pages.shift()! : pages[0]!),
    };
    return { page, visited };
}

/** Answers `onProblem` with `answers` in order, and keeps what it was told. */
function fakePrompter(answers: ProblemChoice[] = []) {
    const said: string[] = [];
    const asked: string[] = [];
    const prompter: Prompter = {
        say: (text) => said.push(text),
        onProblem: async (problem) => {
            asked.push(problem);
            const answer = answers.shift();
            if (!answer) throw new Error(`unexpected question: ${problem}`);
            return answer;
        },
    };
    return { prompter, said, asked };
}

let outDir: string;

beforeEach(() => {
    outDir = mkdtempSync(join(tmpdir(), "recorder-"));
});

afterEach(() => {
    rmSync(outDir, { recursive: true, force: true });
});

const options = { replyTimeoutMs: 50, pollMs: 5 };

describe("recordCases", () => {
    it("writes the anonymised stream and the sanitised snapshot of a case", async () => {
        const html = conversation(NORMAL_ID);
        const { page, visited } = fakePage([stream("normal-reply.sse")], [html]);
        const { prompter, said, asked } = fakePrompter();

        const reports = await recordCases("claude", [NORMAL], {
            page,
            prompter,
            outDir,
            ...options,
        });

        const files = [join(outDir, "normal-reply.sse"), join(outDir, "normal-reply.html")];
        expect(reports).toEqual([{ id: "normal-reply", written: files, unchecked: null }]);
        expect(visited).toEqual(["https://claude.ai/new"]);
        expect(asked).toEqual([]);
        expect(said).toEqual([
            "[claude/normal-reply] Send a message.",
            `[claude/normal-reply] wrote ${files[0]}`,
            `[claude/normal-reply] wrote ${files[1]}`,
        ]);
        const ids = new ZeroedIds();
        expect(readFileSync(files[0]!, "utf8")).toBe(
            anonymiseStream("claude", fixture("normal-reply.sse"), ids),
        );
        const snapshot = readFileSync(files[1]!, "utf8");
        expect(snapshot).toBe(sanitiseSnapshot(findReplies("claude", html)!.snapshot, ids));
        // The thread only, its ids mapped like the stream's, its text masked.
        expect(snapshot).toMatch(/^<div class="thread">/);
        expect(findReplies("claude", snapshot)?.lastId).toBe(ids.map(NORMAL_ID));
        expect(snapshot).not.toMatch(/Bob|11111111/);
    });

    it("records a stream stopped by the user as a partial reply", async () => {
        const { page } = fakePage([stream("aborted.sse", ABORT)], [conversation(ABORTED_ID)]);
        const { prompter } = fakePrompter();

        const [report] = await recordCases("claude", [ABORTED], {
            page,
            prompter,
            outDir,
            ...options,
        });

        expect(report?.written).toHaveLength(2);
    });

    it("waits until the reply is rendered before taking the snapshot", async () => {
        const pages = ["<main></main>", conversation(NORMAL_ID, true), conversation(NORMAL_ID)];
        const { page } = fakePage([stream("normal-reply.sse")], pages);
        const { prompter, asked } = fakePrompter();

        const [report] = await recordCases("claude", [NORMAL], {
            page,
            prompter,
            outDir,
            ...options,
        });

        expect(asked).toEqual([]);
        expect(report?.written).toHaveLength(2);
    });

    it("asks again after a stream that ended otherwise than expected, and records the redo", async () => {
        const streams = [stream("normal-reply.sse", ABORT), stream("normal-reply.sse")];
        const { page, visited } = fakePage(streams, [conversation(NORMAL_ID)]);
        const { prompter, said, asked } = fakePrompter(["redo"]);

        const [report] = await recordCases("claude", [NORMAL], {
            page,
            prompter,
            outDir,
            ...options,
        });

        expect(asked).toEqual([`the stream ended with ${ABORT}, not done`]);
        expect(said.filter((line) => line.endsWith("Send a message."))).toHaveLength(2);
        // The redo happens where the person is.
        expect(visited).toHaveLength(1);
        expect(report?.written).toHaveLength(2);
    });

    it("skips a case whose stream parses to another outcome, writing nothing", async () => {
        // Stopped by the user, but completed: a full reply, not a partial one.
        const { page } = fakePage([stream("normal-reply.sse", ABORT)], [conversation(NORMAL_ID)]);
        const { prompter, asked } = fakePrompter(["skip"]);

        const reports = await recordCases("claude", [ABORTED], {
            page,
            prompter,
            outDir,
            ...options,
        });

        expect(asked).toEqual(["the parser made a reply of the stream, not a partial"]);
        expect(reports).toEqual([{ id: "aborted", written: [], unchecked: null }]);
        expect(readdirSync(outDir)).toEqual([]);
    });

    it("writes a case that did not record as expected when asked to, unchecked", async () => {
        const { page } = fakePage([stream("normal-reply.sse", ABORT)], [conversation(NORMAL_ID)]);
        const { prompter, said } = fakePrompter(["write"]);

        const [report] = await recordCases("claude", [ABORTED], {
            page,
            prompter,
            outDir,
            ...options,
        });

        const problem = "the parser made a reply of the stream, not a partial";
        const files = [join(outDir, "aborted.sse"), join(outDir, "aborted.html")];
        expect(report).toEqual({ id: "aborted", written: files, unchecked: problem });
        expect(said).toContain(
            "[claude/aborted] written unchecked: the tests may fail on it until the code is fixed",
        );
        const ids = new ZeroedIds();
        expect(readFileSync(files[0]!, "utf8")).toBe(
            anonymiseStream("claude", fixture("normal-reply.sse"), ids),
        );
        expect(findReplies("claude", readFileSync(files[1]!, "utf8"))?.lastId).toBe(
            ids.map(NORMAL_ID),
        );
    });

    it("writes the whole page body as the snapshot when the markup finds no reply", async () => {
        const html = '<main><div class="new-markup">Reply to Bob</div></main>';
        const { page } = fakePage([stream("normal-reply.sse")], [html]);
        const { prompter, said } = fakePrompter(["write"]);

        const [report] = await recordCases("claude", [NORMAL], {
            page,
            prompter,
            outDir,
            ...options,
        });

        expect(report?.unchecked).toBe("no finished reply on the page after 0.05 s");
        expect(said).toContain(
            "[claude/normal-reply] no reply found on the page: the snapshot is the whole page body, to trim",
        );
        expect(readFileSync(join(outDir, "normal-reply.html"), "utf8")).toBe(
            '<main><div class="new-markup">xxxxx xx xxx</div></main>',
        );
    });

    it("reports the skip reason of a stream the parser skips", async () => {
        // Cut before `message_stop` without abort: skipped.
        const partial: FixtureCase = { ...ABORTED, expect: { end: "done", outcome: "partial" } };
        const { page } = fakePage([stream("aborted.sse")], [conversation(ABORTED_ID)]);
        const { prompter, asked } = fakePrompter(["skip"]);

        await recordCases("claude", [partial], { page, prompter, outDir, ...options });

        expect(asked).toEqual([
            expect.stringMatching(/^the parser made a skip \(.+\) of the stream, not a partial$/),
        ]);
    });

    it("skips a case its own check rejects", async () => {
        const toolCall = FIXTURE_CASES.claude.find((c) => c.id === "tool-call")!;
        const { page } = fakePage([stream("normal-reply.sse")], [conversation(NORMAL_ID)]);
        const { prompter, asked } = fakePrompter(["skip"]);

        await recordCases("claude", [toolCall], { page, prompter, outDir, ...options });

        expect(asked).toEqual(["no tool_use block: Claude called no tool"]);
    });

    it("rejects a stream from another provider's endpoint", async () => {
        const chatgpt = stream(
            "normal-reply.sse",
            "done",
            "https://chatgpt.com/backend-api/f/conversation",
        );
        const { page } = fakePage([chatgpt], [conversation(NORMAL_ID)]);
        const { prompter, asked } = fakePrompter(["skip"]);

        await recordCases("claude", [NORMAL], { page, prompter, outDir, ...options });

        expect(asked).toEqual([`no claude reply endpoint for ${chatgpt.url}`]);
    });

    it.each([
        ["no reply", "<main></main>", "no finished reply on the page after 0.05 s"],
        [
            "a reply still rendering",
            conversation(NORMAL_ID, true),
            "the last reply is still rendering after 0.05 s",
        ],
        [
            "another last reply",
            conversation(ABORTED_ID),
            `the last reply on the page is ${ABORTED_ID}, not ${NORMAL_ID} after 0.05 s`,
        ],
    ])("gives up on the snapshot with %s on the page", async (_, html, problem) => {
        const { page } = fakePage([stream("normal-reply.sse")], [html]);
        const { prompter, asked } = fakePrompter(["skip"]);

        await recordCases("claude", [NORMAL], { page, prompter, outDir, ...options });

        expect(asked).toEqual([problem]);
        expect(readdirSync(outDir)).toEqual([]);
    });

    it("records each case in turn", async () => {
        const streams = [stream("normal-reply.sse"), stream("aborted.sse", ABORT)];
        const pages = [conversation(NORMAL_ID), conversation(ABORTED_ID)];
        const { page, visited } = fakePage(streams, pages);
        const { prompter } = fakePrompter();

        const reports = await recordCases("claude", [NORMAL, ABORTED], {
            page,
            prompter,
            outDir,
            ...options,
        });

        expect(reports.map((r) => r.written.length)).toEqual([2, 2]);
        expect(visited).toHaveLength(2);
        expect(readdirSync(outDir).sort()).toEqual([
            "aborted.html",
            "aborted.sse",
            "normal-reply.html",
            "normal-reply.sse",
        ]);
    });
});

describe("findReplies", () => {
    it("finds none on a page without finished reply", () => {
        expect(findReplies("claude", "<main><p>Hi</p></main>")).toBeNull();
    });

    it("keeps the parent of a lone reply, so that what follows it is kept", () => {
        const html =
            '<main><section><div data-chatgpt-selection-message-id="a"></div>' +
            '<div class="actions"></div></section></main>';
        expect(findReplies("chatgpt", html)).toEqual({
            lastId: "a",
            rendering: false,
            snapshot:
                '<section><div data-chatgpt-selection-message-id="a"></div><div class="actions"></div></section>',
        });
    });

    it("tells a reply is rendering", () => {
        expect(findReplies("claude", conversation(NORMAL_ID, true))).toMatchObject({
            lastId: "11111111-2222-4333-8444-555555555555",
            rendering: true,
        });
    });
});

describe("FIXTURE_CASES", () => {
    it.each(Object.entries(FIXTURE_CASES))("%s: case ids and files are unique", (_, cases) => {
        expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
        expect(new Set(cases.map((c) => c.file)).size).toBe(cases.length);
        for (const { id, file } of cases)
            expect(file).toMatch(new RegExp(`^${id}\\.(sse|ndjson)$`));
    });
});
