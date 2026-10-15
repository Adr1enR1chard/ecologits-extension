import { isObject, parseJson, requestedModel, stringOrNull } from "../capture/decoders/json";
import { SseDecoder, type SseEvent } from "../capture/decoders/sse";
import type { CapturedRequest, ParseOutcome, ReplyEndpoint, StreamParser } from "../capture/types";
import { isChatGptReasoningSlug } from "../models/chatgpt-slugs";

/**
 * ChatGPT web app (chatgpt.com).
 *
 * Replies are streamed as SSE by `POST /backend-api/conversation` (`/backend-api/f/conversation`
 * in newer clients, `/backend-anon/...` in older logged-out clients; see `chatgpt-logged-out.ts`
 * for the current logged-out app). Each stream holds one or more messages
 * (tool calls, reasoning summaries, the visible reply), sent either as full snapshots
 * (`{ message, conversation_id, error }`) or, with `delta_encoding: "v1"`, as JSON-patch-like
 * operations: `{ p: path, o: op, v: value, c: messageIndex }`, where a bare `{ v }` repeats the
 * previous path and operation. The reply is complete once `message_stream_complete` or
 * `data: [DONE]` arrives; the web app aborts its own request right after, so the stream copy
 * usually ends with an `AbortError` rather than `[DONE]`.
 */

const CONVERSATION_PATH = /^\/backend-(?:api|anon)\/(?:f\/)?conversation\/?$/;

/** Message content types holding text the model generated. */
const TEXT_CONTENT_TYPES = new Set(["text", "code", "multimodal_text"]);
/** Content types that only exist when the model reasoned. */
const REASONING_CONTENT_TYPES = new Set(["thoughts", "reasoning_recap"]);
/** `metadata.reasoning_status` values set while or after the model reasoned. */
const REASONING_STATUSES = new Set(["is_reasoning", "reasoning_ended"]);
/** Path segments that would reach the prototype chain of the page's objects. */
const UNSAFE_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

interface DeltaOp {
    p: string;
    o: string;
    v: Json;
}

interface ChatMessage {
    id?: Json;
    author?: { role?: string };
    recipient?: string;
    status?: string;
    content?: {
        content_type?: string;
        parts?: Json;
        text?: Json;
        thoughts?: Json;
    };
    metadata?: {
        model_slug?: Json;
        reasoning_status?: Json;
        is_message_fragment?: Json;
        merged_message_id?: Json;
    };
}

function isDeltaOp(value: unknown): value is DeltaOp {
    return isObject(value) && typeof value.p === "string" && typeof value.o === "string";
}

function parsePath(path: string): string[] {
    if (path === "") return [];
    return path
        .slice(1)
        .split("/")
        .map((s) => s.replaceAll("~1", "/").replaceAll("~0", "~"));
}

/** Applies one delta operation to `root.value`. Unknown operations are ignored. */
export function applyDelta(root: { value: Json }, op: DeltaOp): void {
    const segments = parsePath(op.p);
    if (segments.some((s) => UNSAFE_SEGMENTS.has(s))) return;

    if (op.o === "patch") {
        if (!Array.isArray(op.v)) return;
        for (const sub of op.v) {
            if (isDeltaOp(sub)) applyDelta(root, { p: op.p + sub.p, o: sub.o, v: sub.v ?? null });
        }
        return;
    }

    // Walk to the parent of the target, creating missing containers: an array when the next
    // segment is an index, so `parts` and `thoughts` stay arrays.
    let parent: { [key: string]: Json } | Json[] = root as unknown as { [key: string]: Json };
    const keys = ["value", ...segments];
    for (let i = 0; i < keys.length - 1; i++) {
        const container = parent as { [key: string]: Json };
        const key = keys[i]!;
        let child = container[key];
        if (typeof child !== "object" || child === null) {
            child = /^\d+$/.test(keys[i + 1]!) ? [] : {};
            container[key] = child;
        }
        parent = child;
    }
    const container = parent as { [key: string]: Json };
    const key = keys[keys.length - 1]!;
    const current = container[key];

    switch (op.o) {
        case "add":
        case "replace":
            container[key] = op.v;
            break;
        case "append":
            if (typeof current === "string" && typeof op.v === "string") {
                container[key] = current + op.v;
            } else if (Array.isArray(current)) {
                current.push(...(Array.isArray(op.v) ? op.v : [op.v]));
            } else if (isObject(current) && isObject(op.v)) {
                Object.assign(current, op.v);
            } else if (current === undefined) {
                container[key] = op.v;
            }
            break;
        case "truncate":
            if (
                (typeof current === "string" || Array.isArray(current)) &&
                typeof op.v === "number"
            ) {
                container[key] = current.slice(0, op.v);
            }
            break;
        case "remove":
            if (Array.isArray(container)) container.splice(Number(key), 1);
            else delete container[key];
            break;
    }
}

function messageOf(root: Json): ChatMessage | null {
    return isObject(root) && isObject(root.message) ? (root.message as ChatMessage) : null;
}

function strings(values: Json[]): string[] {
    return values.filter((v): v is string => typeof v === "string" && v !== "");
}

function textOf(message: ChatMessage): string {
    const content = message.content;
    if (!isObject(content)) return "";
    if (typeof content.text === "string") return content.text;
    return Array.isArray(content.parts) ? strings(content.parts).join("\n") : "";
}

function thoughtsOf(message: ChatMessage): string {
    const thoughts = message.content?.thoughts;
    if (!Array.isArray(thoughts)) return "";
    return strings(
        thoughts
            .filter((t): t is JsonObject => isObject(t))
            .flatMap((t) => [t.summary ?? null, t.content ?? null]),
    ).join("\n");
}

function idOf(message: ChatMessage | null): string | null {
    return stringOrNull(message?.id);
}

/** The error carried by a stream root or event, `null` when there is none. */
function errorOf(value: Json | undefined): string | null {
    if (value === undefined || value === null || value === "" || value === false) return null;
    if (typeof value === "string") return value;
    if (isObject(value)) {
        return stringOrNull(value.message) ?? stringOrNull(value.code) ?? JSON.stringify(value);
    }
    return String(value);
}

class ChatGptParser implements StreamParser {
    private readonly decoder = new SseDecoder();
    /** Stream roots (`{ message, conversation_id, error }`), indexed by the `c` counter. */
    private readonly roots: { value: Json }[] = [];
    private current = -1;
    private lastOp: Omit<DeltaOp, "v"> | null = null;
    private done = false;
    private error: string | null = null;
    private metadataModel: string | null = null;
    /** `server_ste_metadata` reported that auto mode switched to a reasoning model. */
    private autoSwitchedToReasoning = false;

    constructor(private readonly request: CapturedRequest) {}

    push(text: string): void {
        for (const event of this.decoder.push(text)) this.handleEvent(event);
    }

    finish(): ParseOutcome {
        for (const event of this.decoder.flush()) this.handleEvent(event);
        const error =
            this.error ??
            this.roots
                .map((r) => (isObject(r.value) ? errorOf(r.value.error) : null))
                .find(Boolean);
        if (error) return { kind: "skip", reason: `error: ${error}` };
        if (!this.done) return { kind: "skip", reason: "stream ended before [DONE]" };

        const assistant = this.roots
            .map((r) => messageOf(r.value))
            .filter((m): m is ChatMessage => m?.author?.role === "assistant");
        // Replies interrupted by tool calls are streamed twice: as hidden fragments, and as the
        // visible merged message that concatenates them. Count the merged message only.
        const ids = new Set(assistant.map(idOf));
        const isMergedFragment = (m: ChatMessage) =>
            m.metadata?.is_message_fragment === true &&
            ids.has(stringOrNull(m.metadata.merged_message_id));
        const texts = assistant.filter(
            (m) => TEXT_CONTENT_TYPES.has(m.content?.content_type ?? "") && !isMergedFragment(m),
        );
        const reply = texts.findLast((m) => (m.recipient ?? "all") === "all") ?? texts.at(-1);
        if (!reply) return { kind: "skip", reason: "no assistant reply" };
        if (reply.status === "in_progress") return { kind: "skip", reason: "reply not finished" };

        const outputText = texts
            .map(textOf)
            .filter((t) => t !== "")
            .join("\n");
        const reasoningText = assistant
            .map(thoughtsOf)
            .filter((t) => t !== "")
            .join("\n");
        const rawModel =
            stringOrNull(reply.metadata?.model_slug) ??
            assistant.map((m) => stringOrNull(m.metadata?.model_slug)).find(Boolean) ??
            this.metadataModel ??
            requestedModel(this.request.body);
        // ChatGPT only streams reasoning summaries, never the full chain of thought.
        const reasoned =
            this.autoSwitchedToReasoning ||
            assistant.some(
                (m) =>
                    REASONING_CONTENT_TYPES.has(m.content?.content_type ?? "") ||
                    REASONING_STATUSES.has(String(m.metadata?.reasoning_status)),
            ) ||
            (rawModel !== null && isChatGptReasoningSlug(rawModel));

        return {
            kind: "reply",
            reply: {
                rawModel,
                outputText,
                reasoningText: reasoningText === "" ? null : reasoningText,
                hiddenReasoning: reasoned,
                messageId: idOf(reply),
            },
        };
    }

    private handleEvent({ data }: SseEvent): void {
        if (data === "[DONE]") {
            this.done = true;
            return;
        }
        // `null` for keep-alive pings and non-object values, e.g. the `delta_encoding` announcement.
        const parsed = parseJson(data) as JsonObject | null;
        if (parsed === null) return;

        const error = errorOf(parsed.error);
        if (error !== null) {
            this.error = error;
            return;
        }
        if (typeof parsed.type === "string") {
            this.handleTypedEvent(parsed);
            return;
        }
        if (isObject(parsed.message) && parsed.o === undefined) {
            this.handleSnapshot(parsed);
            return;
        }
        this.handleDelta(parsed);
    }

    private handleTypedEvent(event: JsonObject): void {
        if (event.type === "message_stream_complete") {
            this.done = true;
        } else if (event.type === "server_ste_metadata" && isObject(event.metadata)) {
            const slug = event.metadata.model_slug;
            if (typeof slug === "string") this.metadataModel = slug;
            if (event.metadata.did_auto_switch_to_reasoning === true) {
                this.autoSwitchedToReasoning = true;
            }
        }
    }

    /**
     * Legacy encoding: every event carries the whole message so far. Messages are told apart by
     * id; one without id updates the current message if it has none either.
     */
    private handleSnapshot(root: JsonObject): void {
        const id = idOf(messageOf(root));
        const currentRoot = this.roots[this.current];
        const index =
            id !== null
                ? this.roots.findIndex((r) => idOf(messageOf(r.value)) === id)
                : currentRoot && idOf(messageOf(currentRoot.value)) === null
                  ? this.current
                  : -1;
        if (index === -1) {
            this.roots.push({ value: root });
            this.current = this.roots.length - 1;
        } else {
            this.roots[index] = { value: root };
            this.current = index;
        }
    }

    private handleDelta(event: JsonObject): void {
        if (typeof event.c === "number") this.current = event.c;
        let op: DeltaOp;
        if (isDeltaOp(event)) {
            op = { p: event.p, o: event.o, v: event.v ?? null };
        } else if (Array.isArray(event.v) && event.v.length > 0 && event.v.every(isDeltaOp)) {
            op = { p: "", o: "patch", v: event.v };
        } else if (this.lastOp !== null && "v" in event) {
            op = { ...this.lastOp, v: event.v ?? null };
        } else {
            return;
        }
        // A bare `{ v }` after a patch continues its last operation.
        if (op.o !== "patch") {
            this.lastOp = { p: op.p, o: op.o };
        } else if (Array.isArray(op.v)) {
            const last = (op.v as unknown[]).filter(isDeltaOp).at(-1);
            if (last) this.lastOp = { p: op.p + last.p, o: last.o };
        }

        if (op.p === "" && op.o === "add" && isObject(op.v)) {
            // A new message: `c` is its index, otherwise it follows the previous one.
            if (typeof event.c !== "number") this.current = this.roots.length;
            this.roots[this.current] = { value: op.v };
            return;
        }
        const root = this.roots[this.current];
        if (root) applyDelta(root, op);
    }
}

export const chatgptConversationEndpoint: ReplyEndpoint = {
    method: "POST",
    path: CONVERSATION_PATH,
    createParser: (request) => new ChatGptParser(request),
};
