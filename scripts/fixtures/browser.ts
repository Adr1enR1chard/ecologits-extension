import { existsSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import type { RecordedStream } from "../../src/capture/interceptor";
import type { SupportedProvider } from "../../src/providers/registry";
import type { ProblemChoice, Prompter, RecorderPage } from "./recorder";

const ROOT = join(import.meta.dirname, "../..");

/** The development build: only it calls `__ecologitsOnStream`. */
export const DEV_EXTENSION = join(ROOT, ".output/chrome-mv3-dev");

/**
 * A headed Chromium with the development build loaded, as in `e2e/fixtures.ts`, and a profile
 * kept per provider in `.recorder/<provider>/`, so that the person signs in once.
 */
export async function launchRecorder(provider: SupportedProvider): Promise<BrowserContext> {
    if (!existsSync(join(DEV_EXTENSION, "manifest.json"))) {
        throw new Error(`No development build in ${DEV_EXTENSION}: run pnpm fixtures:record`);
    }
    return chromium.launchPersistentContext(join(ROOT, ".recorder", provider), {
        channel: "chromium",
        headless: false,
        viewport: null,
        args: [`--disable-extensions-except=${DEV_EXTENSION}`, `--load-extension=${DEV_EXTENSION}`],
    });
}

/**
 * Records in the tabs of `context`: streams come from the interceptor's development hook,
 * `window.__ecologitsOnStream`, defined here in every page; the snapshot is taken in the tab of
 * the last stream.
 */
export async function recorderPage(context: BrowserContext): Promise<RecorderPage> {
    let current: Page = context.pages()[0] ?? (await context.newPage());
    let waiting: ((stream: RecordedStream) => void)[] = [];
    await context.exposeBinding("__ecologitsOnStream", ({ page }, stream: RecordedStream) => {
        current = page;
        const resolvers = waiting;
        waiting = [];
        for (const resolve of resolvers) resolve(stream);
    });
    return {
        goto: async (url) => {
            if (current.isClosed()) current = await context.newPage();
            await current.bringToFront();
            await current.goto(url, { waitUntil: "domcontentloaded" });
        },
        nextStream: () => new Promise((resolve) => waiting.push(resolve)),
        html: () => current.evaluate(() => document.body.innerHTML),
    };
}

const CHOICES: readonly ProblemChoice[] = ["redo", "skip", "write"];

/**
 * Asks in the terminal; `keep` names the `write` choice: what is done with a case that did not
 * record as expected, but is kept.
 */
export function terminalPrompter(keep: string): Prompter & { close(): void } {
    const terminal = createInterface({ input: process.stdin, output: process.stdout });
    return {
        say: (text) => console.log(text),
        onProblem: async () => {
            for (;;) {
                const answer = await terminal.question(`Redo, skip, or ${keep}? [r/s/w] `);
                const choice = CHOICES.find((c) => [c, c[0]].includes(answer.trim().toLowerCase()));
                if (choice) return choice;
            }
        },
        close: () => terminal.close(),
    };
}
