import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { findEndpoint, type RecordedStream } from "../../src/capture/interceptor";
import type { ParseOutcome, StreamEnd } from "../../src/capture/types";
import { CAPTURES } from "../../src/providers/capture";
import type { SupportedProvider } from "../../src/providers/registry";
import { anonymiseStream } from "./anonymise";
import type { FixtureCase, OutcomeKind } from "./cases/types";
import { findReplies, type PageReplies } from "./page-replies";
import { ZeroedIds } from "./personal-data";
import { sanitiseSnapshot } from "./snapshot";

/** The browser tab the person records in. */
export interface RecorderPage {
    goto(url: string): Promise<void>;
    /** The next stream the interceptor records from now on; earlier ones are dropped. */
    nextStream(): Promise<RecordedStream>;
    /** The page's body HTML as it is now. */
    html(): Promise<string>;
}

/**
 * What to do with a case that did not record as expected: record it again, skip it, or write it
 * anyway, unchecked, to fix the parser or the page markup against it (or, when checking drift,
 * report it).
 */
export type ProblemChoice = "redo" | "skip" | "write";

/** The person recording. */
export interface Prompter {
    say(text: string): void;
    /** Asks what to do with a case that did not record as expected. */
    onProblem(problem: string): Promise<ProblemChoice>;
}

/** How the cases are run, whatever is done with their recordings. */
export interface CaseOptions {
    page: RecorderPage;
    prompter: Prompter;
    /** How long the reply is awaited on the page once its stream ended, in milliseconds. */
    replyTimeoutMs?: number;
    /** How often the page is looked at while awaiting the reply, in milliseconds. */
    pollMs?: number;
}

export interface RecordOptions extends CaseOptions {
    /** Where the stream and snapshot files are written: `test/fixtures/<provider>`. */
    outDir: string;
}

export interface CaseReport {
    id: string;
    /** The files written, empty when the case was skipped. */
    written: string[];
    /** Why the files were written unchecked, `null` when they passed the checks. */
    unchecked: string | null;
}

/** What a case recorded, anonymised: what `fixtures:record` writes. */
export interface CaseRecording {
    /** The anonymised stream. */
    stream: string;
    /** The sanitised DOM snapshot. */
    snapshot: string;
    /** How the stream ended. */
    end: StreamEnd;
    /** Why the recording did not pass the checks, `null` when it did. */
    unchecked: string | null;
    /** The markup found no reply: the snapshot is the whole page body. */
    wholePage: boolean;
}

/** Says `text` about a case, prefixed with the provider and the case. */
export function sayAbout(prompter: Prompter, provider: SupportedProvider, fixture: FixtureCase) {
    return (text: string) => prompter.say(`[${provider}/${fixture.id}] ${text}`);
}

/**
 * Records `cases` one after the other (`runCase`) and writes the stream and the snapshot of each
 * case not skipped.
 */
export async function recordCases(
    provider: SupportedProvider,
    cases: readonly FixtureCase[],
    options: RecordOptions,
): Promise<CaseReport[]> {
    const reports: CaseReport[] = [];
    for (const fixture of cases) {
        const recording = await runCase(provider, fixture, options);
        if (recording === null) {
            reports.push({ id: fixture.id, written: [], unchecked: null });
            continue;
        }
        const say = sayAbout(options.prompter, provider, fixture);
        if (recording.unchecked !== null) {
            say("written unchecked: the tests may fail on it until the code is fixed");
            if (recording.wholePage) {
                say("no reply found on the page: the snapshot is the whole page body, to trim");
            }
        }
        await mkdir(options.outDir, { recursive: true });
        const files = [
            [fixture.file, recording.stream],
            [`${fixture.id}.html`, recording.snapshot],
        ] as const;
        const written: string[] = [];
        for (const [file, text] of files) {
            const path = join(options.outDir, file);
            await writeFile(path, text);
            say(`wrote ${path}`);
            written.push(path);
        }
        reports.push({ id: fixture.id, written, unchecked: recording.unchecked });
    }
    return reports;
}

/**
 * Runs a case: opens its URL, shows its instruction, then checks the next recorded stream against
 * the case's expectations, waits for the reply on the page, and anonymises the stream and the
 * snapshot. A case that does not record as expected is redone, skipped (`null`), or kept anyway,
 * unchecked, as the person chooses.
 */
export async function runCase(
    provider: SupportedProvider,
    fixture: FixtureCase,
    { page, prompter, replyTimeoutMs = 30_000, pollMs = 500 }: CaseOptions,
): Promise<CaseRecording | null> {
    const say = sayAbout(prompter, provider, fixture);
    await page.goto(fixture.url);
    for (;;) {
        // Awaited from before the instruction shows: the person may be quick.
        const next = page.nextStream();
        say(fixture.instruction);
        const stream = await next;
        const end = streamEnd(stream.end);
        const result = await recordStream(
            provider,
            fixture,
            stream,
            end,
            page,
            replyTimeoutMs,
            pollMs,
        );
        if (typeof result !== "string")
            return { ...result, end, unchecked: null, wholePage: false };
        say(result);
        const choice = await prompter.onProblem(result);
        if (choice === "redo") continue;
        if (choice === "skip") return null;
        return { ...(await uncheckedRecording(provider, stream, page)), end, unchecked: result };
    }
}

/**
 * The anonymised stream and snapshot of a case that did not record as expected: the page as it
 * is now, its replies as the page markup finds them, or its whole body when it finds none (the
 * markup may be the very thing to fix).
 */
async function uncheckedRecording(
    provider: SupportedProvider,
    stream: RecordedStream,
    page: RecorderPage,
): Promise<Recording & { wholePage: boolean }> {
    const ids = new ZeroedIds();
    const anonymised = anonymiseStream(provider, stream.text, ids);
    const html = await page.html();
    const replies = findReplies(provider, html);
    return {
        stream: anonymised,
        snapshot: sanitiseSnapshot(replies?.snapshot ?? html, ids),
        wholePage: replies === null,
    };
}

interface Recording {
    stream: string;
    snapshot: string;
}

/** The anonymised stream and snapshot of a case, or what is wrong with the recording. */
async function recordStream(
    provider: SupportedProvider,
    fixture: FixtureCase,
    stream: RecordedStream,
    end: StreamEnd,
    page: RecorderPage,
    timeoutMs: number,
    pollMs: number,
): Promise<Recording | string> {
    if (end !== fixture.expect.end) {
        return `the stream ended with ${stream.end}, not ${fixture.expect.end}`;
    }
    const outcome = parseStream(provider, stream, stream.text, end);
    if (typeof outcome === "string") return outcome;
    const kind = outcomeKind(outcome);
    if (kind !== fixture.expect.outcome) {
        const reason = outcome.kind === "skip" ? ` (${outcome.reason})` : "";
        return `the parser made a ${kind}${reason} of the stream, not a ${fixture.expect.outcome}`;
    }
    const problem = fixture.check?.(outcome, stream.text);
    if (problem) return problem;

    const messageId = outcome.kind === "reply" ? outcome.reply.messageId : null;
    const replies = await waitForReply(provider, page, messageId, timeoutMs, pollMs);
    if (typeof replies === "string") return replies;

    // The stream first, so that its ids come first, as in the existing fixtures.
    const ids = new ZeroedIds();
    const anonymised = anonymiseStream(provider, stream.text, ids);
    const snapshot = sanitiseSnapshot(replies.snapshot, ids);
    const reparsed = parseStream(provider, stream, anonymised, end);
    if (typeof reparsed === "string" || outcomeKind(reparsed) !== kind) {
        const got = typeof reparsed === "string" ? reparsed : `a ${outcomeKind(reparsed)}`;
        return `the anonymised stream parses to ${got}, not a ${kind}`;
    }
    const lastId = findReplies(provider, snapshot)?.lastId ?? null;
    const expectedId = messageId === null ? lastId : ids.map(messageId);
    if (lastId === null || lastId !== expectedId) {
        return `the sanitised snapshot's last reply is ${lastId}, not ${expectedId}`;
    }
    return { stream: anonymised, snapshot };
}

/** How a recorded stream ended: `end` is `"done"` or the error that interrupted it. */
export function streamEnd(end: string): StreamEnd {
    if (end === "done") return "done";
    return end.startsWith("AbortError") ? "aborted" : "failed";
}

export function outcomeKind(outcome: ParseOutcome): OutcomeKind {
    if (outcome.kind === "skip") return "skip";
    return outcome.reply.partial ? "partial" : "reply";
}

/**
 * What the provider's parser makes of `text`, streamed from a request to `url` that ended with
 * `end`.
 */
export function parseStream(
    provider: SupportedProvider,
    { url, method }: { url: string; method: string },
    text: string,
    end: StreamEnd,
): ParseOutcome | string {
    const request = { url: new URL(url), method, body: null };
    const matched = findEndpoint(CAPTURES, request);
    if (matched?.provider !== provider) return `no ${provider} reply endpoint for ${url}`;
    try {
        const parser = matched.endpoint.createParser(request);
        parser.push(text);
        return parser.finish(end);
    } catch (error) {
        return `the parser failed: ${error instanceof Error ? error.message : String(error)}`;
    }
}

/**
 * The replies on the page once its last finished reply is the streamed one (any, without
 * message id) and none is rendering, or why that did not happen within `timeoutMs`.
 */
async function waitForReply(
    provider: SupportedProvider,
    page: RecorderPage,
    messageId: string | null,
    timeoutMs: number,
    pollMs: number,
): Promise<PageReplies | string> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const replies = findReplies(provider, await page.html());
        let problem: string;
        if (replies === null) problem = "no finished reply on the page";
        else if (replies.rendering) problem = "the last reply is still rendering";
        else if (messageId !== null && replies.lastId !== messageId) {
            problem = `the last reply on the page is ${replies.lastId}, not ${messageId}`;
        } else return replies;
        if (Date.now() >= deadline) return `${problem} after ${timeoutMs / 1000} s`;
        await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
}
