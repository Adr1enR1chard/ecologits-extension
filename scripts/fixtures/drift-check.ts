import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { StreamEnd } from "../../src/capture/types";
import type { SupportedProvider } from "../../src/providers/registry";
import type { FixtureCase } from "./cases/types";
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
 * the same shape: the stream's (`compareStreams`), what the parser makes of it (kind, model,
 * partial flag), and the page's (`comparePages`).
 */
export function caseDrift(
    provider: SupportedProvider,
    fixture: FixtureCase,
    committed: CaseFiles,
    fresh: CaseFiles & { snapshot: string },
): string[] {
    const diff = compareStreams(streamShape(committed.stream), streamShape(fresh.stream));
    const [before, now] = [committed, fresh].map(({ stream, end }) => {
        const outcome = parseStream(
            provider,
            { url: fixture.endpoint, method: "POST" },
            stream,
            end,
        );
        if (typeof outcome === "string") return outcome;
        const model = outcome.kind === "reply" ? ` of ${outcome.reply.rawModel}` : "";
        return `a ${outcomeKind(outcome)}${model}`;
    });
    if (before !== now) diff.push(`outcome changed: ${before} → ${now}`);
    const committedPage =
        committed.snapshot === null ? null : pageShape(provider, committed.snapshot);
    diff.push(...comparePages(committedPage, pageShape(provider, fresh.snapshot)));
    return diff;
}

/** A case's committed fixtures in `fixturesDir` (`test/fixtures/<provider>`). */
export function committedFiles(fixturesDir: string, fixture: FixtureCase): CaseFiles {
    const snapshot = join(fixturesDir, `${fixture.id}.html`);
    return {
        stream: readFileSync(join(fixturesDir, fixture.file), "utf8"),
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
 * recording with the case's committed fixtures in `fixturesDir`, writing nothing. A recording the
 * person keeps although it did not pass the recorder's checks drifted by that very failure.
 */
export async function checkDrift(
    provider: SupportedProvider,
    cases: readonly FixtureCase[],
    options: CaseOptions & { fixturesDir: string },
): Promise<DriftReport[]> {
    const reports: DriftReport[] = [];
    for (const fixture of cases) {
        const recording = await runCase(provider, fixture, options);
        if (recording === null) {
            reports.push({ id: fixture.id, drift: null });
            continue;
        }
        const committed = committedFiles(options.fixturesDir, fixture);
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
        .map(({ id, drift }) => {
            const status = drift === null ? "skipped" : drift.length === 0 ? "ok" : "drift";
            return [`${provider}/${id}: ${status}`, ...(drift ?? []).map((line) => `    ${line}`)];
        })
        .flat()
        .join("\n");
}
