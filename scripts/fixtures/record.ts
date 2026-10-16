/**
 * `pnpm fixtures:record <provider> [case]`: records the fixtures of `FIXTURE_CASES[provider]`, or
 * only `case`, in a real browser with the development build. The person does what each case says
 * in the browser; the recorder captures, checks, anonymises and writes the stream and the DOM
 * snapshot to `test/fixtures/<provider>/`. See `test/fixtures/README.md`.
 */
import { join } from "node:path";
import { isSupportedProvider, SUPPORTED_PROVIDERS } from "../../src/providers/registry";
import { launchRecorder, recorderPage, terminalPrompter } from "./browser";
import { FIXTURE_CASES } from "./cases";
import { recordCases } from "./recorder";

const [provider, only] = process.argv.slice(2);
if (!isSupportedProvider(provider)) {
    console.error(`Usage: pnpm fixtures:record <${SUPPORTED_PROVIDERS.join("|")}> [case]`);
    process.exit(1);
}
const cases = FIXTURE_CASES[provider].filter((c) => only === undefined || c.id === only);
if (cases.length === 0) {
    const ids = FIXTURE_CASES[provider].map((c) => c.id).join(", ");
    console.error(`No ${provider} case ${only}: ${ids}`);
    process.exit(1);
}

const context = await launchRecorder(provider);
const prompter = terminalPrompter();
try {
    const reports = await recordCases(provider, cases, {
        page: await recorderPage(context),
        prompter,
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
} finally {
    prompter.close();
    await context.close();
}
