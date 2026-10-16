import type { FixtureCase } from "./types";

const NEW = "https://claude.ai/new";
const COMPLETION =
    "https://claude.ai/api/organizations/00000000-0000-4000-8000-0000000000aa/chat_conversations/00000000-0000-4000-8000-0000000000bb/completion";

export const claudeCases: readonly FixtureCase[] = [
    {
        id: "normal-reply",
        file: "normal-reply.sse",
        url: NEW,
        endpoint: COMPLETION,
        instruction: "Send a short message, extended thinking off, and wait for the whole reply.",
        expect: { end: "done", outcome: "reply" },
    },
    {
        id: "tool-call",
        file: "tool-call.sse",
        url: NEW,
        endpoint: COMPLETION,
        instruction:
            "Ask for the weather in a city, so that Claude calls a tool, and wait for the whole reply.",
        expect: { end: "done", outcome: "reply" },
        check: (_, text) =>
            text.includes('"tool_use"') ? undefined : "no tool_use block: Claude called no tool",
    },
    {
        id: "aborted",
        file: "aborted.sse",
        url: NEW,
        endpoint: COMPLETION,
        instruction: "Turn on extended thinking, ask a long question, press Stop mid-reply.",
        expect: { end: "aborted", outcome: "partial" },
        check: (_, text) =>
            text.includes('"thinking"')
                ? undefined
                : "no thinking block: turn on extended thinking",
    },
];
