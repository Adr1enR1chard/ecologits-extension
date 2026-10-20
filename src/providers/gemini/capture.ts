import { ProtoMessage } from "../../capture/decoders/protobuf";
import { WebChannelDecoder } from "../../capture/decoders/webchannel";
import type {
    ParseOutcome,
    ProviderCapture,
    ReplyEndpoint,
    StreamEnd,
    StreamParser,
} from "../../capture/types";

/**
 * Gemini web app (gemini.google.com).
 *
 * A conversation turn is a WebChannel session (`VER=8`) on
 * `geminiweb-pa.clients6.google.com/v1/processSession`, over XHR:
 * - `POST ?RID={n}` without `SID` opens it, answering `[[0,["c",SID,…]]]`;
 * - `POST ?SID=…&RID={n}` forward requests send base64 protobuf messages in a form-encoded
 *   `req0___data__` field (session settings, the prompt text, then the submit);
 * - `GET ?SID=…&RID=rpc&TYPE=xmlhttp` streams the server messages, the reply among them;
 * - `POST ?…&TYPE=terminate` closes it once the reply is complete.
 *
 * The back channel streams `["noop"]` keep-alives and `[base64 protobuf]` messages. Their
 * schema is not public; the fields read here were found in recorded streams. Each message is an
 * update `{ 2: { 1: sequence, 7: { 1: event } } }`, whose event `{ 1: final, 4: { 4: turn } }`
 * carries the state of the turn so far:
 * - `2: { 1: conversation id (c_…), 2: response id (r_…) }`; the page keys the turn by the
 *   response id without its `r_` prefix, which the message id drops too;
 * - `5: candidate { 1: id (rc_…), 2: { 1: whole text so far } }`;
 * - `43`: the model's label, as in the model picker (`3.5 Flash-Lite`);
 * - `45: { 2: action }`: the "Answer now" action that skips the thinking, offered by a reasoning
 *   model only (`3.8 Raisonnement` in French), whose thoughts are not streamed, nor any summary;
 * - other updates: settings, the conversation title (`11`), tokens.
 * The update with `final: 1` closes the reply; the session goes on with the title.
 */

const SESSION_PATH = /^\/v1\/processSession$/;

class GeminiParser implements StreamParser {
    private readonly decoder = new WebChannelDecoder();
    private text = "";
    private model: string | null = null;
    private messageId: string | null = null;
    private hiddenReasoning = false;
    private done = false;

    push(text: string): void {
        for (const payload of this.decoder.push(text)) this.handlePayload(payload);
    }

    finish(end: StreamEnd): ParseOutcome {
        const partial = !this.done && end === "aborted";
        if (!this.done && !partial)
            return { kind: "skip", reason: "stream ended before the final update" };
        if (this.text === "") return { kind: "skip", reason: "no assistant reply" };
        return {
            kind: "reply",
            reply: {
                rawModel: this.model,
                outputText: this.text,
                reasoningText: null,
                hiddenReasoning: this.hiddenReasoning,
                messageId: this.messageId,
                partial,
            },
        };
    }

    private handlePayload(payload: unknown): void {
        if (!Array.isArray(payload) || typeof payload[0] !== "string") return;
        const event = ProtoMessage.fromBase64(payload[0])?.message(2, 7, 1);
        const turn = event?.message(4, 4);
        if (!event || !turn || this.done) return;
        // Each update repeats the whole text so far.
        const text = turn.message(5, 2)?.string(1);
        if (text) this.text = text;
        this.model = turn.string(43) ?? this.model;
        this.messageId = turn.message(2)?.string(2)?.replace(/^r_/, "") ?? this.messageId;
        if (turn.message(45, 2)) this.hiddenReasoning = true;
        if (event.varint(1) === 1 && this.text !== "") this.done = true;
    }
}

export const geminiSessionEndpoint: ReplyEndpoint = {
    method: "GET",
    host: "geminiweb-pa.clients6.google.com",
    path: SESSION_PATH,
    createParser: () => new GeminiParser(),
};

export const geminiCapture: ProviderCapture = { endpoints: [geminiSessionEndpoint] };

export default geminiCapture;
