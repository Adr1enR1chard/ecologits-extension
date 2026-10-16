/**
 * `pnpm fixtures:record <provider> [case]`: records the fixtures of `FIXTURE_CASES[provider]`, or
 * only `case`, in a real browser with the development build. The person does what each case says
 * in the browser; the recorder captures, checks, anonymises and writes the stream and the DOM
 * snapshot to `test/fixtures/<provider>/`. See `test/fixtures/README.md`.
 */
import { join } from "node:path";
import { runFromCommandLine } from "./cli";
import { recordCases } from "./recorder";

await runFromCommandLine("fixtures:record", "write unchecked", async (provider, cases, options) => {
    const reports = await recordCases(provider, cases, {
        ...options,
        outDir: join(import.meta.dirname, "../../test/fixtures", provider),
    });
    const skipped = reports.filter((r) => r.written.length === 0).map((r) => r.id);
    if (skipped.length > 0) console.log(`Skipped: ${skipped.join(", ")}`);
    for (const { id, unchecked } of reports) {
        if (unchecked !== null) console.log(`Written unchecked: ${id} (${unchecked})`);
    }
    console.log(
        "Check the diff, restore the text the tests assert on, and update the fixture tables " +
            "(test/fixtures/README.md) and PAGE_SNAPSHOTS (src/providers/page-snapshots.ts).",
    );
});
