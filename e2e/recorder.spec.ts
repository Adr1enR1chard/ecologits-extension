import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeCompletionEndpoint } from "../src/providers/claude/capture";
import { anonymiseStream } from "../scripts/fixtures/anonymise";
import { recorderPage } from "../scripts/fixtures/browser";
import type { FixtureCase } from "../scripts/fixtures/cases/types";
import { findReplies } from "../scripts/fixtures/page-replies";
import { ZeroedIds } from "../scripts/fixtures/personal-data";
import { recordCases } from "../scripts/fixtures/recorder";
import { expect, test } from "./fixtures";

const COMPLETION =
    "https://claude.ai/api/organizations/org/chat_conversations/conversation/completion";
const STREAM = readFileSync(
    join(import.meta.dirname, "../test/fixtures/claude/normal-reply.sse"),
    "utf8",
);
/** The message id of `STREAM`, as the parser reads it. */
const MESSAGE_ID = (() => {
    const parser = claudeCompletionEndpoint.createParser({
        url: new URL(COMPLETION),
        method: "POST",
        body: null,
    });
    parser.push(STREAM);
    const outcome = parser.finish("done");
    if (outcome.kind !== "reply" || outcome.reply.messageId === null) {
        throw new Error("the claude normal-reply fixture holds no reply id");
    }
    return outcome.reply.messageId;
})();

/**
 * A claude.ai conversation page: `send()` posts a message to the completion endpoint, reads the
 * reply stream, then renders the finished reply.
 */
const CONVERSATION = `<!doctype html>
<html><body><main><div class="thread"></div></main><script>
async function send() {
    const response = await fetch(
        "/api/organizations/org/chat_conversations/conversation/completion",
        { method: "POST", body: "{}" },
    );
    await response.text();
    document.querySelector(".thread").innerHTML =
        '<div data-testid="assistant-message" data-turn-key="${MESSAGE_ID}" data-is-streaming="false">' +
        '<p>Hello Bob</p><div><div data-testid="message-actions"></div></div></div>';
}
</script></body></html>`;

const CASE: FixtureCase = {
    id: "normal-reply",
    file: "normal-reply.sse",
    url: "https://claude.ai/new",
    endpoint: COMPLETION,
    instruction: "Send a short message.",
    expect: { end: "done", outcome: "reply" },
};

let outDir: string;

test.beforeEach(() => {
    outDir = mkdtempSync(join(tmpdir(), "recorder-"));
});

test.afterEach(() => {
    rmSync(outDir, { recursive: true, force: true });
});

test("records a case through the interceptor's development hook", async ({ context }) => {
    // claude.ai is served by the test, so the extension's content scripts run on it.
    await context.route("https://claude.ai/**", (route) =>
        new URL(route.request().url()).pathname.endsWith("/completion")
            ? route.fulfill({ contentType: "text/event-stream", body: STREAM })
            : route.fulfill({ contentType: "text/html", body: CONVERSATION }),
    );
    const page = await recorderPage(context);
    const said: string[] = [];

    const reports = await recordCases("claude", [CASE], {
        page,
        prompter: {
            // The person sends the message once told to.
            say: (text) => {
                said.push(text);
                if (text.endsWith(CASE.instruction)) {
                    void context
                        .pages()[0]!
                        .evaluate(() => (window as unknown as { send(): Promise<void> }).send());
                }
            },
            onProblem: (problem) => Promise.reject(new Error(problem)),
        },
        outDir,
    });

    const files = [join(outDir, "normal-reply.sse"), join(outDir, "normal-reply.html")];
    expect(reports).toEqual([{ id: "normal-reply", written: files, unchecked: null }]);
    expect(said).toContain(`[claude/normal-reply] wrote ${files[1]}`);
    const ids = new ZeroedIds();
    expect(readFileSync(files[0]!, "utf8")).toBe(anonymiseStream("claude", STREAM, ids));
    const snapshot = readFileSync(files[1]!, "utf8");
    expect(findReplies("claude", snapshot)).toMatchObject({
        lastId: ids.map(MESSAGE_ID),
        rendering: false,
    });
    expect(snapshot).toMatch(/^<div class="thread">.*<p>xxxxx xxx<\/p>/);
});
