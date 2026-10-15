import { isObject, parseJson, stringOrNull, type JsonObject } from "../../capture/decoders/json";
import { NdjsonDecoder } from "../../capture/decoders/ndjson";
import type { ParseOutcome, ReplyEndpoint, StreamParser } from "../../capture/types";

/**
 * ChatGPT web app when logged out (chatgpt.com).
 *
 * The app calls `POST /unauth-mweb/conversation/prepare`, then streams the reply from
 * `POST /unauth-mweb/conversation/updates?operationId=…` as newline-delimited JSON, one
 * `{ version: 1, type, … }` object per line:
 * - `content`: `{ messageId, mode: "replace" | "append", markdown, status }`, the reply text;
 * - `control`: lifecycle in `detail.kind`; `assistant-content-started` names the assistant
 *   message, `terminal-received` ends the turn with `terminalKind` (`"complete"` on success);
 * - `end`: last line. `shared` (HTML partials) and `state` lines are ignored.
 *
 * The model is not exposed, so the provider fallback applies.
 */

const UPDATES_PATH = /^\/unauth-mweb\/(?:f\/)?conversation\/updates\/?$/;

class LoggedOutParser implements StreamParser {
    private readonly decoder = new NdjsonDecoder();
    /** Markdown of each message, by id, in order of appearance. */
    private readonly texts = new Map<string, string>();
    private readonly assistantIds = new Set<string>();
    private replyId: string | null = null;
    private terminalKind: string | null = null;

    push(text: string): void {
        for (const line of this.decoder.push(text)) this.handleLine(line);
    }

    finish(): ParseOutcome {
        for (const line of this.decoder.flush()) this.handleLine(line);
        if (this.terminalKind === null) {
            return { kind: "skip", reason: "stream ended before terminal-received" };
        }
        if (this.terminalKind !== "complete") {
            return { kind: "skip", reason: `terminal: ${this.terminalKind}` };
        }
        // Without an assistant marker, every content line belongs to the reply.
        const ids = [...this.texts.keys()].filter(
            (id) => this.assistantIds.size === 0 || this.assistantIds.has(id),
        );
        if (ids.length === 0) return { kind: "skip", reason: "no assistant reply" };
        return {
            kind: "reply",
            reply: {
                rawModel: null,
                outputText: ids.map((id) => this.texts.get(id)).join("\n"),
                reasoningText: null,
                hiddenReasoning: false,
                messageId: this.replyId ?? ids.at(-1) ?? null,
            },
        };
    }

    private handleLine(text: string): void {
        const line = parseJson(text);
        if (line === null) return;
        if (line.type === "content") this.handleContent(line);
        else if (line.type === "control" && isObject(line.detail)) this.handleControl(line.detail);
    }

    private handleContent(line: JsonObject): void {
        const id = stringOrNull(line.messageId);
        if (id === null || typeof line.markdown !== "string") return;
        const previous = line.mode === "append" ? (this.texts.get(id) ?? "") : "";
        this.texts.set(id, previous + line.markdown);
    }

    private handleControl(detail: JsonObject): void {
        const id = stringOrNull(detail.messageId);
        if (detail.kind === "assistant-content-started" && id !== null) {
            this.assistantIds.add(id);
        } else if (detail.kind === "terminal-received") {
            this.terminalKind = stringOrNull(detail.terminalKind) ?? "unknown";
            if (id !== null) {
                this.assistantIds.add(id);
                this.replyId = id;
            }
        }
    }
}

export const chatgptLoggedOutEndpoint: ReplyEndpoint = {
    method: "POST",
    path: UPDATES_PATH,
    createParser: () => new LoggedOutParser(),
};
