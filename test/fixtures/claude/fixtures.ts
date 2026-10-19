import { defineFixtures, removeAll } from "../provider-fixtures";

/** Claude: SSE from `…/completion`, mirroring the Anthropic Messages API stream. */
export default defineFixtures({
    endpoints: {
        completion:
            "https://claude.ai/api/organizations/00000000-0000-4000-8000-0000000000aa/chat_conversations/00000000-0000-4000-8000-0000000000bb/completion",
    },
    cases: [
        // Reply (`claude-sonnet-5-5`): `ping` and `conversation_ready` keep-alives, one text
        // block, `message_limit` (account usage neutralised), `message_stop`.
        {
            file: "normal-reply.sse",
            endpoint: "completion",
            end: "done",
            outcome: "reply",
            howToRecord: "extended thinking off, send a short message and wait for the whole reply",
        },
        // A tool call (`weather_fetch`): `tool_use` input streamed as `input_json_delta`,
        // `tool_result` from the server, then the text. The location is replaced with
        // `REDACTED` and `0.0000`.
        {
            file: "tool-call.sse",
            endpoint: "completion",
            end: "done",
            outcome: "reply",
            howToRecord:
                "ask for the weather in a city, so that Claude calls a tool, and wait for the whole reply",
            check: (_, text) =>
                text.includes('"tool_use"')
                    ? undefined
                    : "no tool_use block: Claude called no tool",
        },
        // Thinking, stopped by the user: the thinking block only streams a summary
        // (`thinking_summary_delta`), then the text ends mid-block, without `message_stop`.
        {
            file: "aborted.sse",
            endpoint: "completion",
            end: "aborted",
            outcome: "partial",
            howToRecord: "turn on extended thinking, ask a long question and press Stop mid-reply",
            check: (_, text) =>
                text.includes('"thinking"')
                    ? undefined
                    : "no thinking block: turn on extended thinking",
        },
    ],
    snapshots: [
        // Written by hand: two finished `[data-testid="assistant-message"]` replies, each ending
        // with the wrapper of `[data-testid="message-actions"]`.
        {
            file: "normal-reply.html",
            markup: 0,
            breakAnchor: removeAll('[data-testid="message-actions"]'),
        },
    ],
    rules: {
        structural: new Set([
            "type",
            "role",
            "model",
            "stop_reason",
            "status",
            "kind",
            "group",
            "severity",
            "representativeClaim",
        ]),
        ids: new Set(["id", "uuid", "parent_uuid", "discarded_parent_message_uuid", "tool_use_id"]),
        tokens: new Set(["trace_id", "request_id", "signature"]),
        account: new Set([
            "email",
            "user_id",
            "account_uuid",
            "organization_uuid",
            "utilization",
            "remaining",
            "resets_at",
            "resetsAt",
            "percent",
        ]),
    },
});
