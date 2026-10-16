import type { ParseOutcome } from "../../../src/capture/types";

/** What a parser makes of a stream: a complete reply, a partial one, or a skip. */
export type OutcomeKind = "reply" | "partial" | "skip";

/** A fixture the person records with `pnpm fixtures:record`, by doing what `instruction` says. */
export interface FixtureCase {
    /** Names the DOM snapshot, `<id>.html`, and selects the case on the command line. */
    id: string;
    /** The stream file under `test/fixtures/<provider>/`, `<id>.sse` or `<id>.ndjson`. */
    file: string;
    /** Opened before the instruction is shown. */
    url: string;
    /** A URL of the reply endpoint the stream is requested from, to parse the committed fixture. */
    endpoint: string;
    instruction: string;
    expect: {
        /** How the stream must end: read to its end, or aborted by the page. */
        end: "done" | "aborted";
        outcome: OutcomeKind;
    };
    /** What is wrong with the recorded stream for this case, if anything. */
    check?(outcome: ParseOutcome, text: string): string | undefined;
}
