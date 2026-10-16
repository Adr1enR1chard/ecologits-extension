import { stringEntry } from "../json-tree";
import type { FixtureRules } from "./types";

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
export const chatgptRules: FixtureRules = {
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
};
