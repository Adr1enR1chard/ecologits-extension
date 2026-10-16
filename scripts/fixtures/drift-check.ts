import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ParseOutcome, StreamEnd } from "../../src/capture/types";
import type { SupportedProvider } from "../../src/providers/registry";
import type { FixtureCase } from "./cases/types";
import { FIXTURE_RULES } from "./providers";
import { outcomeKind, parseStream, runCase, type CaseOptions } from "./recorder";
import { comparePages, compareStreams, pageShape, streamShape } from "./shape";

/** A case's stream and DOM snapshot, committed or freshly recorded and anonymised. */
export interface CaseFiles {
    stream: string;
    /** `null` when the case has no committed snapshot. */
    snapshot: string | null;
    /** How the stream ended. */
    end: StreamEnd;
}

/**
 * What changed from a case's `committed` fixtures to a `fresh` recording, empty when they have
 * the same shape: the stream's (`compareStreams`, keep-alive events left out), what the parser
 * makes of it (kind, model, partial flag; a stream it cannot parse always drifted), and the
 * page's (`comparePages`).
 */
export function caseDrift(
    provider: SupportedProvider,
    fixture: FixtureCase,
    committed: CaseFiles,
    fresh: CaseFiles & { snapshot: string },
): string[] {
    const { keepAlive } = FIXTURE_RULES[provider];
    const diff = compareStreams(
        streamShape(committed.stream, keepAlive),
        streamShape(fresh.stream, keepAlive),
    );
    const request = { url: fixture.endpoint, method: "POST" };
    const before = parseStream(provider, request, committed.stream, committed.end);
    const now = parseStream(provider, request, fresh.stream, fresh.end);
    if (typeof before === "string") diff.push(`committed stream not parsed: ${before}`);
    if (typeof now === "string") diff.push(`fresh stream not parsed: ${now}`);
    if (typeof before !== "string" && typeof now !== "string") {
        const [a, b] = [describeOutcome(before), describeOutcome(now)];
        if (a !== b) diff.push(`outcome changed: ${a} → ${b}`);
    }
    const committedPage =
        committed.snapshot === null ? null : pageShape(provider, committed.snapshot);
    diff.push(...comparePages(committedPage, pageShape(provider, fresh.snapshot)));
    return diff;
}

function describeOutcome(outcome: ParseOutcome): string {
    const model = outcome.kind === "reply" ? ` of ${outcome.reply.rawModel}` : "";
    return `a ${outcomeKind(outcome)}${model}`;
}

/**
 * A case's committed fixtures in `fixturesDir` (`test/fixtures/<provider>`), `null` when it has
 * no committed stream.
 */
export function committedFiles(fixturesDir: string, fixture: FixtureCase): CaseFiles | null {
    const stream = join(fixturesDir, fixture.file);
    if (!existsSync(stream)) return null;
    const snapshot = join(fixturesDir, `${fixture.id}.html`);
    return {
        stream: readFileSync(stream, "utf8"),
        snapshot: existsSync(snapshot) ? readFileSync(snapshot, "utf8") : null,
        end: fixture.expect.end,
    };
}

export interface DriftReport {
    id: string;
    /** What drifted, empty when nothing did; `null` when the case was skipped. */
    drift: string[] | null;
}

/**
 * Records `cases` one after the other, as `fixtures:record` does (`runCase`), and compares each
 * recording with the case's committed fixtures in `fixturesDir`, writing nothing. A case without
 * committed stream is not recorded, and reported. A recording the person keeps although it did
 * not pass the recorder's checks drifted by that very failure.
 */
export async function checkDrift(
    provider: SupportedProvider,
    cases: readonly FixtureCase[],
    options: CaseOptions & { fixturesDir: string },
): Promise<DriftReport[]> {
    const reports: DriftReport[] = [];
    for (const fixture of cases) {
        // Read first: the person would record the case for nothing.
        const committed = committedFiles(options.fixturesDir, fixture);
        if (committed === null) {
            const missing = `no committed stream ${fixture.file}: record the case with pnpm fixtures:record`;
            reports.push({ id: fixture.id, drift: [missing] });
            continue;
        }
        const recording = await runCase(provider, fixture, options);
        if (recording === null) {
            reports.push({ id: fixture.id, drift: null });
            continue;
        }
        const drift = caseDrift(provider, fixture, committed, recording);
        if (recording.unchecked !== null)
            drift.unshift(`recorder check failed: ${recording.unchecked}`);
        reports.push({ id: fixture.id, drift });
    }
    return reports;
}

/** One line per case, `ok`, `skipped`, or `drift` followed by what drifted, indented. */
export function formatDrift(provider: SupportedProvider, reports: readonly DriftReport[]): string {
    return reports
        .flatMap(({ id, drift }) => {
            const status = drift === null ? "skipped" : drift.length === 0 ? "ok" : "drift";
            return [`${provider}/${id}: ${status}`, ...(drift ?? []).map((line) => `    ${line}`)];
        })
        .join("\n");
}
