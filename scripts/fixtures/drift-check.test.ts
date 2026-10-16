import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { RecordedStream } from "../../src/capture/interceptor";
import { SUPPORTED_PROVIDERS, type SupportedProvider } from "../../src/providers/registry";
import { FIXTURE_CASES } from "./cases";
import type { FixtureCase } from "./cases/types";
import { caseDrift, checkDrift, committedFiles, formatDrift } from "./drift-check";
import type { Prompter, RecorderPage } from "./recorder";

const FIXTURES = join(import.meta.dirname, "../../test/fixtures");

function committed(provider: SupportedProvider, fixture: FixtureCase) {
    const files = committedFiles(join(FIXTURES, provider), fixture);
    if (files === null) throw new Error(`${provider}/${fixture.id}: no committed stream`);
    return files;
}

function fixtureCase(provider: SupportedProvider, id: string): FixtureCase {
    return FIXTURE_CASES[provider].find((c) => c.id === id)!;
}

describe.each(SUPPORTED_PROVIDERS)("%s committed fixtures", (provider) => {
    it.each(FIXTURE_CASES[provider])("$id does not drift from itself", (fixture) => {
        const files = committed(provider, fixture);
        // A case without committed snapshot is compared with the snapshot of another one.
        const snapshot =
            files.snapshot ?? committed(provider, fixtureCase(provider, "normal-reply")).snapshot!;
        expect(caseDrift(provider, fixture, files, { ...files, snapshot })).toEqual([]);
    });
});

const NORMAL = fixtureCase("claude", "normal-reply");
const ABORTED = fixtureCase("claude", "aborted");
const COMMITTED = committed("claude", NORMAL);
const ABORTED_STREAM = committed("claude", ABORTED).stream;
const FRESH = { ...COMMITTED, snapshot: COMMITTED.snapshot! };

describe("caseDrift", () => {
    it("reports a changed outcome", () => {
        const stream = COMMITTED.stream.replace("claude-sonnet-5-5", "claude-opus-5-5");
        const fresh = { ...COMMITTED, stream, snapshot: COMMITTED.snapshot! };
        expect(caseDrift("claude", NORMAL, COMMITTED, fresh)).toEqual([
            "outcome changed: a reply of claude-sonnet-5-5 → a reply of claude-opus-5-5",
        ]);
        const partial = { ...fresh, stream: ABORTED_STREAM, end: "aborted" as const };
        expect(caseDrift("claude", NORMAL, COMMITTED, partial)).toContainEqual(
            expect.stringMatching(/^outcome changed: a reply of claude-sonnet-5-5 → a partial of/),
        );
    });

    it("reports a stream the parser cannot parse, even when both cannot be", () => {
        const elsewhere = { ...NORMAL, endpoint: "https://claude.ai/api/elsewhere" };
        const reason = "no claude reply endpoint for https://claude.ai/api/elsewhere";
        expect(caseDrift("claude", elsewhere, COMMITTED, FRESH)).toEqual([
            `committed stream not parsed: ${reason}`,
            `fresh stream not parsed: ${reason}`,
        ]);
    });

    it("leaves out keep-alive events: a reply without ping does not drift", () => {
        const stream = COMMITTED.stream.replace(/event: ping\ndata: [^\n]*\n\n/g, "");
        expect(stream).not.toContain("ping");
        expect(caseDrift("claude", NORMAL, COMMITTED, { ...FRESH, stream })).toEqual([]);
    });
});

/** A page streaming the committed Claude reply and showing the committed snapshot. */
function committedPage(text: string): RecorderPage {
    const stream: RecordedStream = { url: NORMAL.endpoint, method: "POST", end: "done", text };
    return {
        goto: async () => {},
        nextStream: async () => stream,
        html: async () => COMMITTED.snapshot!,
    };
}

const quiet: Prompter = {
    say: () => {},
    onProblem: async () => "write",
};

describe("checkDrift", () => {
    it("finds no drift when the provider streams and renders what is committed", async () => {
        const reports = await checkDrift("claude", [NORMAL], {
            page: committedPage(COMMITTED.stream),
            prompter: quiet,
            fixturesDir: join(FIXTURES, "claude"),
            replyTimeoutMs: 50,
            pollMs: 5,
        });
        expect(reports).toEqual([{ id: "normal-reply", drift: [] }]);
        expect(formatDrift("claude", reports)).toBe("claude/normal-reply: ok");
    });

    it("reports a recording that failed the recorder's checks, with its drift", async () => {
        const reports = await checkDrift("claude", [ABORTED], {
            page: committedPage(COMMITTED.stream),
            prompter: quiet,
            fixturesDir: join(FIXTURES, "claude"),
            replyTimeoutMs: 50,
            pollMs: 5,
        });
        const [report] = reports;
        expect(report?.drift?.[0]).toBe(
            "recorder check failed: the stream ended with done, not aborted",
        );
        expect(report?.drift?.length).toBeGreaterThan(1);
        expect(formatDrift("claude", reports)).toMatch(
            /^claude\/aborted: drift\n {4}recorder check failed/,
        );
    });

    it("reports a case without committed stream without recording it", async () => {
        const unrecorded = { ...NORMAL, id: "unrecorded", file: "unrecorded.sse" };
        const page = committedPage(COMMITTED.stream);
        const reports = await checkDrift("claude", [unrecorded], {
            page: { ...page, goto: async () => expect.fail("the case is not recorded") },
            prompter: quiet,
            fixturesDir: join(FIXTURES, "claude"),
        });
        expect(reports).toEqual([
            {
                id: "unrecorded",
                drift: [
                    "no committed stream unrecorded.sse: record the case with pnpm fixtures:record",
                ],
            },
        ]);
    });

    it("reports a skipped case as skipped", async () => {
        const reports = await checkDrift("claude", [ABORTED], {
            page: committedPage(COMMITTED.stream),
            prompter: { say: () => {}, onProblem: async () => "skip" },
            fixturesDir: join(FIXTURES, "claude"),
        });
        expect(reports).toEqual([{ id: "aborted", drift: null }]);
        expect(formatDrift("claude", reports)).toBe("claude/aborted: skipped");
    });
});
