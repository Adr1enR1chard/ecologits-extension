import { defineFixtures, removeAll } from "../provider-fixtures";

/** The event of an update, and the turn it carries. */
const EVENT = "2.7.1";
const TURN = `${EVENT}.4.4`;

/**
 * Gemini: the WebChannel back channel of `…/processSession`, length-prefixed batches of base64
 * protobuf messages, anonymised field by field. The paths below start at the update
 * `{ 2: { 7: { 1: event } } }`, whose turn is `event.4.4` (see `src/providers/gemini/capture.ts`).
 */
export default defineFixtures({
    endpoints: {
        session:
            "https://geminiweb-pa.clients6.google.com/v1/processSession?VER=8&RID=rpc&TYPE=xmlhttp",
    },
    cases: [
        // Reply (`3.5 Flash-Lite`): keep-alives, the conversation and response ids, three
        // updates of the turn repeating its whole text, the last one final, then the title.
        {
            file: "normal-reply.sse",
            endpoint: "session",
            end: "done",
            outcome: "reply",
            howToRecord: "send a short message and wait for the whole reply",
        },
        // A reply over several updates (`3.5 Flash-Lite`), each repeating the whole text so far,
        // the last of six final, then the title.
        {
            file: "long-reply.sse",
            endpoint: "session",
            end: "done",
            outcome: "reply",
            howToRecord: "ask for a word repeated on ten lines and wait for the whole reply",
        },
        // Stopped by the user after a web search and several updates of the text: no final update
        // follows, only the updates of the stopped turn and its title.
        {
            file: "aborted.sse",
            endpoint: "session",
            end: "aborted",
            outcome: "partial",
            howToRecord: "ask a long question and press Stop mid-reply",
        },
    ],
    snapshots: [
        // Signed out: one finished `.conversation-container`, its `<message-actions>` in the
        // response footer. Its id, the real response id, was replaced by hand with the message id
        // of `normal-reply.sse` before sanitising, which leaves non-UUID ids as they are.
        {
            file: "normal-reply.html",
            markup: 1,
            breakAnchor: removeAll("message-actions"),
        },
        // Signed out: the turn of `aborted.sse`, stopped, without action bar, the stop notice in
        // the response footer. Its id was replaced by hand as for `normal-reply.html`.
        {
            file: "aborted.html",
            markup: 0,
            breakAnchor: removeAll("response-info-line"),
        },
    ],
    rules: {
        // The model's label; the final flag and other numbers are kept anyway.
        structural: new Set([`${TURN}.43`]),
        ids: new Set([
            // The update's response id (r_…, a UUID before there is one).
            `${EVENT}.2.1`,
            // Conversation (c_…) and response ids, again the response id.
            `${TURN}.2.1`,
            `${TURN}.2.2`,
            `${TURN}.18`,
            // Candidate (rc_…), and an id of the turn.
            `${TURN}.5.1`,
            `${TURN}.40`,
        ]),
        tokens: new Set([`${TURN}.21.1`, `${TURN}.26`]),
        // The location the reply was given for: place, description, map link.
        account: new Set([`${TURN}.6`]),
    },
});
