/**
 * `pnpm fixtures:anonymise <provider> <stream> [page.html]`: anonymises, in place, a stream copied
 * from the DevTools console with the rules of `test/fixtures/<provider>/fixtures.ts` and, when
 * given, the page's body HTML saved with it. The page is cut down to the element holding the
 * replies, as `src/providers/<provider>/page.ts` finds them, and sanitised with the stream's ids,
 * so that its last reply keeps the stream's message id. See `test/fixtures/README.md`.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { ProviderPage } from "../../src/providers/types";
import type { ProviderFixtures } from "../../test/fixtures/provider-fixtures";
import { anonymiseStream } from "./anonymise";
import { findReplies } from "./page-replies";
import { ZeroedIds } from "./personal-data";
import { sanitiseSnapshot } from "./snapshot";

// Found from their folders: `import.meta.glob` only exists under Vite, not `tsx`.
const FIXTURES = new URL("../../test/fixtures/", import.meta.url);
const PROVIDERS = new URL("../../src/providers/", import.meta.url);
const providers = readdirSync(FIXTURES).filter((id) =>
    existsSync(new URL(`${id}/fixtures.ts`, FIXTURES)),
);

const [provider, streamFile, pageFile] = process.argv.slice(2);
if (provider === undefined || !providers.includes(provider) || streamFile === undefined) {
    console.error(`Usage: pnpm fixtures:anonymise <${providers.join("|")}> <stream> [page.html]`);
    process.exit(1);
}

const { rules } = (
    (await import(new URL(`${provider}/fixtures.ts`, FIXTURES).href)) as {
        default: ProviderFixtures;
    }
).default;

// The stream first, so that its ids come first, as in the existing fixtures.
const ids = new ZeroedIds();
writeFileSync(streamFile, anonymiseStream(rules, readFileSync(streamFile, "utf8"), ids));
console.log(`anonymised ${streamFile}`);

if (pageFile !== undefined) {
    const pageModule = new URL(`${provider}/page.ts`, PROVIDERS);
    const page = existsSync(pageModule)
        ? ((await import(pageModule.href)) as { default: ProviderPage }).default
        : null;
    const html = readFileSync(pageFile, "utf8");
    const replies = page && findReplies(page, html);
    writeFileSync(pageFile, sanitiseSnapshot(replies?.snapshot ?? html, ids));
    console.log(`sanitised ${pageFile}`);
    if (page === null) {
        console.log(
            `no src/providers/${provider}/page.ts yet: the snapshot is the whole page body`,
        );
    } else if (replies === null) {
        console.log("no reply found on the page: the snapshot is the whole page body, to trim");
    } else if (replies.rendering) {
        console.log("the last reply was still rendering: save the page once it has finished");
    }
}
console.log("Check the diff before committing: no test can tell a reply text from a neutral one.");
