import {
    isObject,
    parseJson,
    requestedModel,
    stringOrNull,
    type JsonObject,
} from "../../capture/decoders/json";
import { SseDecoder, type SseEvent } from "../../capture/decoders/sse";
import type {
    CapturedRequest,
    ParseOutcome,
    ProviderCapture,
    ReplyEndpoint,
    StreamEnd,
    StreamParser,
} from "../../capture/types";

/**
 * Claude web app (claude.ai).
 *
 * Replies are streamed as SSE by
 * `POST /api/organizations/{org}/chat_conversations/{conversation}/completion`
 * (`/retry_completion` for a regenerated reply), with `rendering_mode: "messages"`: the events
 * mirror the Anthropic Messages API stream:
 * - `message_start`: `{ message: { id, uuid, model, … } }`;
 * - `content_block_start` / `content_block_delta` / `content_block_stop`, per `index`: `text`
 *   blocks (`text_delta`), `thinking` blocks, `redacted_thinking` blocks, `tool_use` blocks
 *   (`input_json_delta`) and `tool_result` blocks filled by the server;
 * - `message_delta` (stop reason), `message_limit`, then `message_stop`;
 * - `conversation_ready` and `ping` keep-alives before the reply, and `error` events.
 * claude.ai does not stream the thinking itself, only summaries of it
 * (`thinking_summary_delta`, also listed in the block's `summaries`); `thinking_delta` text, as
 * in the API, is counted if it ever comes.
 * The reply is complete once `message_stop` arrives; a reply stopped by the user ends with an
 * `AbortError` before it.
 *
 * Former clients streamed `{ type: "completion", completion, stop_reason, model }` events
 * (`rendering_mode: "raw"`), still accepted as a fallback.
 */

const COMPLETION_PATH =
    /^\/api\/organizations\/[^/]+\/chat_conversations\/[^/]+\/(?:retry_)?completion\/?$/;

interface ContentBlock {
    type: string;
    text: string;
    /** `thinking` blocks: the streamed summaries of the thinking. */
    summaries: string[];
    /** `tool_use` input: the JSON of its deltas, or of its start event when not streamed. */
    input: string;
    startInput: unknown;
}

function errorOf(event: JsonObject): string {
    const error = event.error;
    if (isObject(error)) {
        return stringOrNull(error.message) ?? stringOrNull(error.type) ?? JSON.stringify(error);
    }
    return stringOrNull(error) ?? "unknown error";
}

/** Text of a thinking summary: `{ summary }`. */
function summaryOf(value: unknown): string | null {
    return isObject(value) ? stringOrNull(value.summary) : null;
}

/** Generated text of a `tool_use` block: its input, as the model wrote it. */
function toolInputOf(block: ContentBlock): string {
    if (block.input !== "") return block.input;
    const input = block.startInput;
    if (isObject(input) && Object.keys(input).length > 0) return JSON.stringify(input);
    return "";
}

/** Blocks holding the model's tool calls; `tool_result` blocks come from the server. */
const TOOL_USE_TYPES = new Set(["tool_use", "server_tool_use"]);

class ClaudeParser implements StreamParser {
    private readonly decoder = new SseDecoder();
    /** Content blocks, by `index`. */
    private readonly blocks: ContentBlock[] = [];
    private model: string | null = null;
    private messageId: string | null = null;
    private done = false;
    private error: string | null = null;
    /** Legacy `completion` events. */
    private legacyText = "";

    constructor(private readonly request: CapturedRequest) {}

    push(text: string): void {
        for (const event of this.decoder.push(text)) this.handleEvent(event);
    }

    finish(end: StreamEnd): ParseOutcome {
        for (const event of this.decoder.flush()) this.handleEvent(event);
        const partial = !this.done && end === "aborted";
        if (this.error !== null) return { kind: "skip", reason: `error: ${this.error}` };
        if (!this.done && !partial)
            return { kind: "skip", reason: "stream ended before message_stop" };

        const blocks = this.blocks.filter((b): b is ContentBlock => b !== undefined);
        const output = [
            ...(this.legacyText === "" ? [] : [this.legacyText]),
            ...blocks.map((b) =>
                b.type === "text" ? b.text : TOOL_USE_TYPES.has(b.type) ? toolInputOf(b) : "",
            ),
        ].filter((t) => t !== "");
        if (output.length === 0) return { kind: "skip", reason: "no assistant reply" };

        const thinking = blocks.filter((b) => b.type === "thinking");
        // The thinking itself when streamed, otherwise its summaries.
        const reasoningText = thinking
            .map((b) => (b.text !== "" ? b.text : b.summaries.join("\n")))
            .filter((t) => t !== "")
            .join("\n");
        // Summaries and redacted blocks stand for reasoning that was not streamed.
        const hiddenReasoning =
            blocks.some((b) => b.type === "redacted_thinking") ||
            thinking.some((b) => b.text === "");

        return {
            kind: "reply",
            reply: {
                rawModel: this.model ?? requestedModel(this.request.body),
                outputText: output.join("\n"),
                reasoningText: reasoningText === "" ? null : reasoningText,
                hiddenReasoning,
                messageId: this.messageId,
                partial,
            },
        };
    }

    private handleEvent({ event, data }: SseEvent): void {
        const parsed = parseJson(data);
        if (parsed === null) return;
        const type = typeof parsed.type === "string" ? parsed.type : event;

        switch (type) {
            case "error":
                this.error = errorOf(parsed);
                break;
            case "message_start":
                if (isObject(parsed.message)) {
                    const message = parsed.message;
                    this.model = stringOrNull(message.model) ?? this.model;
                    this.messageId =
                        stringOrNull(message.uuid) ?? stringOrNull(message.id) ?? this.messageId;
                }
                break;
            case "content_block_start":
                this.startBlock(parsed);
                break;
            case "content_block_delta":
                this.applyDelta(parsed);
                break;
            case "message_stop":
                this.done = true;
                break;
            case "completion":
                this.handleLegacy(parsed);
                break;
        }
    }

    private startBlock(event: JsonObject): void {
        const { index, content_block: block } = event;
        if (typeof index !== "number" || !isObject(block) || typeof block.type !== "string") return;
        this.blocks[index] = {
            type: block.type,
            text:
                typeof block.text === "string"
                    ? block.text
                    : typeof block.thinking === "string"
                      ? block.thinking
                      : "",
            summaries: Array.isArray(block.summaries)
                ? block.summaries.map(summaryOf).filter((s): s is string => s !== null)
                : [],
            input: "",
            startInput: block.input,
        };
    }

    private applyDelta(event: JsonObject): void {
        const { index, delta } = event;
        if (typeof index !== "number" || !isObject(delta)) return;
        const block = this.blocks[index];
        if (!block) return;
        switch (delta.type) {
            case "text_delta":
                if (typeof delta.text === "string") block.text += delta.text;
                break;
            case "thinking_delta":
                if (typeof delta.thinking === "string") block.text += delta.thinking;
                break;
            case "thinking_summary_delta": {
                const summary = summaryOf(delta.summary);
                if (summary !== null) block.summaries.push(summary);
                break;
            }
            case "input_json_delta":
                if (typeof delta.partial_json === "string") block.input += delta.partial_json;
                break;
            // `signature_delta` is not text.
        }
    }

    private handleLegacy(event: JsonObject): void {
        if (typeof event.completion === "string") this.legacyText += event.completion;
        this.model = stringOrNull(event.model) ?? this.model;
        this.messageId = stringOrNull(event.id) ?? this.messageId;
        if (stringOrNull(event.stop_reason) !== null) this.done = true;
    }
}

export const claudeCompletionEndpoint: ReplyEndpoint = {
    method: "POST",
    path: COMPLETION_PATH,
    createParser: (request) => new ClaudeParser(request),
};

export const claudeCapture: ProviderCapture = { endpoints: [claudeCompletionEndpoint] };
