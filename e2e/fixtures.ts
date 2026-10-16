import path from "node:path";
import { test as base, chromium, type BrowserContext } from "@playwright/test";

const EXTENSION = path.resolve(import.meta.dirname, "../.output/chrome-mv3-dev");

/** A browser with the development build of the extension loaded, and the extension's ID. */
export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
    context: async ({ viewport }, use) => {
        const context = await chromium.launchPersistentContext("", {
            // Headless Chromium, not Chrome headless shell: the shell does not load extensions.
            channel: "chromium",
            viewport,
            args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
        });
        await use(context);
        await context.close();
    },
    extensionId: async ({ context }, use) => {
        const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
        await use(new URL(worker.url()).host);
    },
});

export { expect } from "@playwright/test";
