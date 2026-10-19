import { stringEntry } from "../../../scripts/fixtures/json-tree";
import { defineFixtures, removeAll } from "../provider-fixtures";

/** The last segment of a JSON-patch path that is not an array index, `null` for the root. */
function lastNamedSegment(path: string): string | null {
    return (
        path
            .split("/")
            .filter((s) => s !== "" && !/^\d+$/.test(s))
            .at(-1) ?? null
    );
}

/**
 * ChatGPT: SSE from `/backend-api/conversation`, delta-encoded (`{ p, o, v }`, where a bare
 * `{ v }` continues the previous operation), and NDJSON from `/unauth-mweb/…/updates`.
 */
export default defineFixtures({
    endpoints: {
        conversation: "https://chatgpt.com/backend-api/f/conversation",
        loggedOut: "https://chatgpt.com/unauth-mweb/conversation/updates",
    },
    cases: [
        // Logged-out reply (NDJSON).
        {
            file: "logged-out-reply.ndjson",
            endpoint: "loggedOut",
            end: "done",
            outcome: "reply",
            howToRecord: "log out, send a short message and wait for the whole reply",
        },
        // Logged-out reply stopped by the user: `append` lines, then the stream just ends (no
        // `terminal-received`, no `end`).
        {
            file: "logged-out-stopped.ndjson",
            endpoint: "loggedOut",
            end: "aborted",
            outcome: "partial",
            howToRecord: "log out, ask a long question and press Stop mid-reply",
        },
        // Logged-in reply (`gpt-6`, instant): user echo, hidden system messages, delta-encoded
        // reply, trailing metadata, `[DONE]`.
        {
            file: "normal-reply.sse",
            endpoint: "conversation",
            end: "done",
            outcome: "reply",
            howToRecord: "pick an Instant model, send a short message and wait for the whole reply",
        },
        // Web search and reasoning: tool call (`web.run`), tool results, reasoning summaries,
        // reasoning recap, and the answer streamed both as hidden fragments
        // (`is_message_fragment`) and as the visible merged message.
        {
            file: "thinking-reply.sse",
            endpoint: "conversation",
            end: "done",
            outcome: "reply",
            howToRecord:
                "pick a Thinking model, ask a question that needs a web search and wait for the whole reply",
            check: (outcome, text) => {
                if (outcome.kind === "reply" && !outcome.reply.reasoningText) {
                    return "no reasoning streamed: pick a Thinking model";
                }
                return text.includes('"recipient":"web.run"') ? undefined : "no web search";
            },
        },
        // Regenerated reply: `message_type: "variant"`, no user message echo.
        {
            file: "regenerate.sse",
            endpoint: "conversation",
            end: "done",
            outcome: "reply",
            howToRecord:
                "open a conversation from the sidebar, regenerate its last reply (Try again) and wait for the whole reply",
            check: (_, text) =>
                text.includes('"message_type":"variant"') ? undefined : "not a regenerated reply",
        },
        // Written by hand: a tool call carrying code text (the recorded `web.run` call has empty
        // parts). To record instead: ask for a chart of a few numbers, so that ChatGPT runs code.
        {
            file: "tool-call.sse",
            endpoint: "conversation",
            end: "done",
            outcome: "reply",
            check: (_, text) =>
                /"content_type": ?"code"/.test(text) ? undefined : "no code tool call",
        },
        // Stopped by the user: the stream ends mid-patch, without `message_stream_complete` nor
        // `[DONE]`.
        {
            file: "aborted.sse",
            endpoint: "conversation",
            end: "aborted",
            outcome: "partial",
            howToRecord: "ask a long question and press Stop mid-reply",
        },
    ],
    snapshots: [
        // Written by hand, logged-in markup: two turns, each reply block
        // (`data-chatgpt-selection-message-id`) followed by its action bar; the badge goes after
        // the reply block, found by its id.
        {
            file: "normal-reply.html",
            markup: 0,
            breakAnchor: (root) =>
                root
                    .querySelectorAll("[data-chatgpt-selection-message-id]")
                    .forEach((reply) => reply.removeAttribute("data-chatgpt-selection-message-id")),
        },
        // Logged-out markup: `<li data-message-role>` per message, the assistant one ending with
        // `[data-assistant-message-actions]`.
        {
            file: "logged-out-reply.html",
            markup: 1,
            breakAnchor: removeAll("[data-assistant-message-actions]"),
        },
        // Logged-out markup, of the reply stopped by the user.
        {
            file: "logged-out-stopped.html",
            markup: 1,
            breakAnchor: removeAll("[data-assistant-message-actions]"),
        },
    ],
    rules: {
        structural: new Set([
            // SSE event announcing the encoding: `event: delta_encoding`, `data: "v1"`.
            "delta_encoding",
            "p",
            "o",
            "type",
            "kind",
            "role",
            "status",
            "content_type",
            "recipient",
            "channel",
            "message_type",
            "reasoning_status",
            "cot_version",
            "model_slug",
            "resolved_model_slug",
            "default_model_slug",
            "requested_model_slug",
            "intended_default_model_slug",
            "marker",
            "event",
            // Logged-out NDJSON.
            "mode",
            "streamType",
            "terminalKind",
            "renderer",
            "interactionSurface",
        ]),
        ids: new Set([
            "id",
            "conversation_id",
            "parent_id",
            "message_id",
            "request_id",
            "turn_exchange_id",
            "working_turn_id",
            "turn_trace_id",
            "merged_message_id",
            "streaming_parent_id",
            "continuation_message_id",
            "source_message_ids",
            "reasoning_group_id",
            "messageId",
            "conversationId",
            "operationId",
            "requestId",
        ]),
        tokens: new Set([
            "token",
            "resume_conversation_token",
            "conduit_token",
            "stopConduitToken",
            "resumeToken",
        ]),
        account: new Set([
            "email",
            "user_id",
            "account_id",
            "account_user_id",
            "plan_type",
            "plan_type_bucket",
            "cluster_region",
        ]),
        keyResolver: () => {
            // The key the previous operation wrote to, for a bare `{ v }`.
            let lastKey = "v";
            return (object, key) => {
                if (key !== "v") return key;
                const path = stringEntry(object, "p");
                if (path !== null) lastKey = lastNamedSegment(path) ?? "v";
                return lastKey;
            };
        },
    },
});
