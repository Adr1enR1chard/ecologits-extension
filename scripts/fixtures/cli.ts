import {
    isSupportedProvider,
    SUPPORTED_PROVIDERS,
    type SupportedProvider,
} from "../../src/providers/registry";
import { launchRecorder, recorderPage, terminalPrompter } from "./browser";
import { FIXTURE_CASES } from "./cases";
import type { FixtureCase } from "./cases/types";
import type { CaseOptions } from "./recorder";

/**
 * Runs `pnpm <command> <provider> [case]`: the cases of `FIXTURE_CASES[provider]`, or only `case`,
 * in the recorder's browser (`launchRecorder`), answered in the terminal, where `keep` names what
 * the person can do with a case that did not record as expected, besides redoing or skipping it.
 */
export async function runFromCommandLine(
    command: string,
    keep: string,
    run: (provider: SupportedProvider, cases: FixtureCase[], options: CaseOptions) => Promise<void>,
): Promise<void> {
    const [provider, only] = process.argv.slice(2);
    if (!isSupportedProvider(provider)) {
        console.error(`Usage: pnpm ${command} <${SUPPORTED_PROVIDERS.join("|")}> [case]`);
        process.exit(1);
    }
    const cases = FIXTURE_CASES[provider].filter((c) => only === undefined || c.id === only);
    if (cases.length === 0) {
        const ids = FIXTURE_CASES[provider].map((c) => c.id).join(", ");
        console.error(`No ${provider} case ${only}: ${ids}`);
        process.exit(1);
    }

    const context = await launchRecorder(provider);
    const prompter = terminalPrompter(keep);
    try {
        await run(provider, cases, { page: await recorderPage(context), prompter });
    } finally {
        prompter.close();
        await context.close();
    }
}
