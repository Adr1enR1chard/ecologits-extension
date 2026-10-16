import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { RecordedStream } from "../../src/capture/interceptor";
import { SUPPORTED_PROVIDERS } from "../../src/providers/registry";
import { FIXTURE_CASES } from "./cases";
import { caseDrift, checkDrift, committedFiles, formatDrift } from "./drift-check";
import type { Prompter, RecorderPage } from "./recorder";

const FIXTURES = join(import.meta.dirname, "../../test/fixtures");

describe.each(SUPPORTED_PROVIDERS)("%s committed fixtures", (provider) => {
    it.each(FIXTURE_CASES[provider])("$id does not drift from itself", (fixture) => {
        const committed = committedFiles(join(FIXTURES, provider), fixture);
        // A case without committed snapshot is compared with the snapshot of another one.
        const snapshot =
            committed.snapshot ??
            committedFiles(
                join(FIXTURES, provider),
                FIXTURE_CASES[provider].find((c) => c.id === "normal-reply")!,
            ).snapshot!;
        expect(caseDrift(provider, fixture, committed, { ...committed, snapshot })).toEqual([]);
    });
});

const NORMAL = FIXTURE_CASES.claude.find((c) => c.id === "normal-reply")!;
const ABORTED = FIXTURE_CASES.claude.find((c) => c.id === "aborted")!;
const COMMITTED = committedFiles(join(FIXTURES, "claude"), NORMAL);
const ABORTED_STREAM = committedFiles(join(FIXTURES, "claude"), ABORTED).stream;

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
