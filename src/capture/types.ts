import type { CapturedResponse } from "../messaging";

/** The parts of an outgoing `fetch` call adapters need to recognise a reply request. */
export interface CapturedRequest {
    url: URL;
    method: string;
    /** Request body, when it was passed as a string. */
    body: string | null;
}

/** What an adapter extracts from a stream; the interceptor adds the provider and latency. */
export type ParsedReply = Omit<CapturedResponse, "provider" | "latencyMs">;

/**
 * How a response stream ended:
 * - `done`: the body was read to its end;
 * - `aborted`: the page aborted the request, because the user stopped the reply or left the
 *   page, or because the app no longer needed a complete stream;
 * - `failed`: the network or the server failed.
 */
export type StreamEnd = "done" | "aborted" | "failed";

export type ParseOutcome =
    | { kind: "reply"; reply: ParsedReply }
    /** The stream is valid but must not be recorded (error, unfinished, no assistant reply…). */
    | { kind: "skip"; reason: string };

/** Parses one response stream. Methods may throw: the interceptor reports it as a failure. */
export interface StreamParser {
    /** Feeds decoded response text, in arbitrary chunks. */
    push(text: string): void;
    /**
     * Called once the stream ended or was interrupted (the page may abort its own request once
     * it has the whole reply). Return a reply if the stream showed it was complete, or a
     * `partial` one if the page aborted it before (the user stopped the reply).
     */
    finish(end: StreamEnd): ParseOutcome;
}

/**
 * A request returning an assistant reply stream. The interceptor checks that the request goes to
 * one of the provider's hosts, then matches its method and path.
 */
export interface ReplyEndpoint {
    /** `"POST"` when omitted. */
    method?: "POST" | "GET";
    /** Matches the URL path. */
    path: RegExp;
    createParser(request: CapturedRequest): StreamParser;
}

/** What the interceptor needs to capture a provider's replies. */
export interface ProviderCapture {
    endpoints: readonly ReplyEndpoint[];
}
