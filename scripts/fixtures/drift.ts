/**
 * `pnpm fixtures:drift <provider> [case]`: goes through the cases of `FIXTURE_CASES[provider]`,
 * or only `case`, as `fixtures:record` does, but writes nothing: it compares each fresh recording
 * with the committed fixtures by shape, and exits with 1 when any drifted. Local only: it needs a
 * signed-in session. See `test/fixtures/README.md`.
 */
import { join } from "node:path";
import { runFromCommandLine } from "./cli";
import { checkDrift, formatDrift } from "./drift-check";

await runFromCommandLine(
    "fixtures:drift",
    "write it in the report",
    async (provider, cases, options) => {
        const reports = await checkDrift(provider, cases, {
            ...options,
            fixturesDir: join(import.meta.dirname, "../../test/fixtures", provider),
        });
        console.log(formatDrift(provider, reports));
        if (reports.some(({ drift }) => drift !== null && drift.length > 0)) process.exitCode = 1;
    },
);
