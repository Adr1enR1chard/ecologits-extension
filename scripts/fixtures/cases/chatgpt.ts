import type { FixtureCase } from "./types";

const HOME = "https://chatgpt.com/";
const CONVERSATION = "https://chatgpt.com/backend-api/f/conversation";
const LOGGED_OUT_UPDATES = "https://chatgpt.com/unauth-mweb/conversation/updates";

const LOGGED_OUT =
    "Log out first (log in again once the logged-out cases are recorded: the profile is kept).";

export const chatgptCases: readonly FixtureCase[] = [
    {
        id: "logged-out-reply",
        file: "logged-out-reply.ndjson",
        url: HOME,
        endpoint: LOGGED_OUT_UPDATES,
        instruction: `${LOGGED_OUT} Send a short message and wait for the whole reply.`,
        expect: { end: "done", outcome: "reply" },
    },
    {
        id: "logged-out-stopped",
        file: "logged-out-stopped.ndjson",
        url: HOME,
        endpoint: LOGGED_OUT_UPDATES,
        instruction: `${LOGGED_OUT} Ask a long question and press Stop mid-reply.`,
        expect: { end: "aborted", outcome: "partial" },
    },
    {
        id: "normal-reply",
        file: "normal-reply.sse",
        url: HOME,
        endpoint: CONVERSATION,
        instruction: "Pick an Instant model, send a short message and wait for the whole reply.",
        expect: { end: "done", outcome: "reply" },
    },
    {
        id: "thinking-reply",
        file: "thinking-reply.sse",
        url: HOME,
        endpoint: CONVERSATION,
        instruction:
            "Pick a Thinking model, ask a question that needs a web search and wait for the whole reply.",
        expect: { end: "done", outcome: "reply" },
        check: (outcome, text) => {
            if (outcome.kind === "reply" && !outcome.reply.reasoningText) {
                return "no reasoning streamed: pick a Thinking model";
            }
            return text.includes('"recipient":"web.run"') ? undefined : "no web search";
        },
    },
    {
        id: "regenerate",
        file: "regenerate.sse",
        url: HOME,
        endpoint: CONVERSATION,
        instruction:
            "Open a conversation from the sidebar, regenerate its last reply (Try again) and wait for the whole reply.",
        expect: { end: "done", outcome: "reply" },
        check: (_, text) =>
            text.includes('"message_type":"variant"') ? undefined : "not a regenerated reply",
    },
    {
        id: "tool-call",
        file: "tool-call.sse",
        url: HOME,
        endpoint: CONVERSATION,
        instruction:
            "Ask for a chart of a few numbers, so that ChatGPT runs code, and wait for the whole reply.",
        expect: { end: "done", outcome: "reply" },
        check: (_, text) =>
            /"content_type": ?"code"/.test(text) ? undefined : "no code tool call",
    },
    {
        id: "aborted",
        file: "aborted.sse",
        url: HOME,
        endpoint: CONVERSATION,
        instruction: "Ask a long question and press Stop mid-reply.",
        expect: { end: "aborted", outcome: "partial" },
    },
];
