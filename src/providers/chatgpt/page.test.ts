// @vitest-environment happy-dom
import { describePageSnapshots } from "../page-contract";

describePageSnapshots("chatgpt", [
    // Logged in: the badge goes after the reply block, whatever follows it.
    {
        file: "normal-reply.html",
        markup: 0,
        replies: 2,
        lastId: "00000000-0000-4000-8000-00000000000c",
    },
    {
        file: "logged-out-reply.html",
        markup: 1,
        replies: 1,
        lastId: "00000000-0000-4000-8000-000000000072",
        actionBar: "[data-assistant-message-actions]",
    },
    {
        file: "legacy-reply.html",
        markup: 2,
        replies: 1,
        lastId: "00000000-0000-4000-8000-00000000000c",
    },
]);
