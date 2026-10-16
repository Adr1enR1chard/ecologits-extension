import type { FixtureRules } from "./types";

/** Claude: SSE from `…/completion`, mirroring the Anthropic Messages API stream. */
export const claudeRules: FixtureRules = {
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
    keepAlive: new Set(["ping"]),
};
