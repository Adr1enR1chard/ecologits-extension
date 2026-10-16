/**
 * `pnpm fixtures:anonymise <provider> <stream> [page.html]`: anonymises, in place, a stream copied
 * from the DevTools console and, when given, the page's body HTML saved with it. The page is cut
 * down to the element holding the replies, as `PAGES[provider]` finds them, and sanitised with
 * the stream's ids, so that its last reply keeps the stream's message id. See
 * `test/fixtures/README.md`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { isSupportedProvider, SUPPORTED_PROVIDERS } from "../../src/providers/registry";
import { anonymiseStream } from "./anonymise";
import { findReplies } from "./page-replies";
import { ZeroedIds } from "./personal-data";
import { sanitiseSnapshot } from "./snapshot";

const [provider, streamFile, pageFile] = process.argv.slice(2);
if (!isSupportedProvider(provider) || streamFile === undefined) {
    console.error(
        `Usage: pnpm fixtures:anonymise <${SUPPORTED_PROVIDERS.join("|")}> <stream> [page.html]`,
    );
    process.exit(1);
}

// The stream first, so that its ids come first, as in the existing fixtures.
const ids = new ZeroedIds();
writeFileSync(streamFile, anonymiseStream(provider, readFileSync(streamFile, "utf8"), ids));
console.log(`anonymised ${streamFile}`);

if (pageFile !== undefined) {
    const html = readFileSync(pageFile, "utf8");
    const replies = findReplies(provider, html);
    writeFileSync(pageFile, sanitiseSnapshot(replies?.snapshot ?? html, ids));
    console.log(`sanitised ${pageFile}`);
    if (replies === null) {
        console.log("no reply found on the page: the snapshot is the whole page body, to trim");
    } else if (replies.rendering) {
        console.log("the last reply was still rendering: save the page once it has finished");
    }
}
console.log("Check the diff before committing: no test can tell a reply text from a neutral one.");
