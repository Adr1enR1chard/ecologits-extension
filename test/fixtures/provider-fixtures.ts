import type { FixtureRules } from "../../scripts/fixtures/rules";
import type { ParseOutcome } from "../../src/capture/types";

/**
 * What `<provider>/fixtures.ts` declares of the fixtures recorded in `<provider>/`: the streams
 * `recorded-cases.test.ts` replays, the DOM snapshots `page-snapshots.test.ts` replays, and how
 * `pnpm fixtures:anonymise` anonymises them. See `README.md`.
 */
export interface ProviderFixtures<Endpoint extends string = string> {
    /** A URL of each reply endpoint, by name: the cases requested from it name it. */
    endpoints: Readonly<Record<Endpoint, string>>;
    cases: readonly RecordedCase<Endpoint>[];
    snapshots: readonly PageSnapshot[];
    rules: FixtureRules;
}

/** A recorded stream, `<provider>/<file>`, and what the parser must make of it. */
export interface RecordedCase<Endpoint extends string = string> {
    file: string;
    /** The reply endpoint the stream is requested from, to pick its parser. */
    endpoint: Endpoint;
    /** How the stream ended: read to its end, or aborted by the page. */
    end: "done" | "aborted";
    /** What the parser makes of it: a complete reply, a partial one, or a skip. */
    outcome: "reply" | "partial" | "skip";
    /** What to do in the web app to record it again; none for a stream written by hand. */
    howToRecord?: string;
    /** What is wrong with the recorded stream for this case, if anything. */
    check?(outcome: ParseOutcome, text: string): string | undefined;
}

/** A DOM snapshot of a conversation page, `<provider>/<file>`. */
export interface PageSnapshot {
    /** `<case>.html`, saved with the stream of the same case. */
    file: string;
    /** Index in the provider's `page.ts` markups of the markup the snapshot is rendered with. */
    markup: number;
    /** Removes what the badge anchor depends on (action bar, reply id…): the anchor must be lost. */
    breakAnchor(root: ParentNode): void;
}

/** Checks a provider's fixtures, keeping its endpoint names for its cases. */
export function defineFixtures<Endpoint extends string>(
    fixtures: ProviderFixtures<Endpoint>,
): ProviderFixtures<Endpoint> {
    return fixtures;
}

/** A `breakAnchor` removing every element matching `selector`. */
export const removeAll = (selector: string) => (root: ParentNode) =>
    root.querySelectorAll(selector).forEach((element) => element.remove());
