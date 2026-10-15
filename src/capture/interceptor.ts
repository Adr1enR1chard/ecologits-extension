import {
    isSupportedProvider,
    providerForHost,
    type SupportedProvider,
} from "../providers/registry";
import type { CaptureMessage } from "./channel";
import type { CapturedRequest, ProviderCapture, ReplyEndpoint, StreamEnd } from "./types";

type FetchWindow = Pick<typeof globalThis, "fetch"> & { location: { href: string } };

export type Captures = Readonly<Partial<Record<SupportedProvider, ProviderCapture>>>;

export interface InterceptorOptions {
    captures: Captures;
    emit: (message: CaptureMessage) => void;
    /** Milliseconds, monotonic. */
    now?: () => number;
    /** Receives a trace of each capture step, for development builds. */
    debug?: Debug;
    /** Receives the raw text of each matched stream, to record fixtures in development builds. */
    record?: (stream: RecordedStream) => void;
}

export interface RecordedStream {
    url: string;
    /** Why the stream ended: `"done"`, or the interruption error. */
    end: string;
    text: string;
}

interface CaptureContext {
    emit: InterceptorOptions["emit"];
    now: () => number;
    debug: Debug;
    record: InterceptorOptions["record"];
}

export type Debug = (step: string, details?: unknown) => void;

const noDebug: Debug = () => undefined;

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** An aborted fetch rejects its body reads with a `DOMException` named `AbortError`. */
function isAbort(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        "name" in error &&
        error.name === "AbortError"
    );
}

interface DescribedRequest {
    /** The body is `null` until read from `bodySource`. */
    request: CapturedRequest;
    /** The `Request` carrying the body, when it was not passed in `init`. */
    bodySource: Request | null;
}

function describeRequest(
    input: RequestInfo | URL,
    init: RequestInit | undefined,
    base: string,
): DescribedRequest {
    const isRequest = typeof Request !== "undefined" && input instanceof Request;
    const url = new URL(isRequest ? input.url : String(input), base);
    const method = (init?.method ?? (isRequest ? input.method : "GET")).toUpperCase();
    const body = typeof init?.body === "string" ? init.body : null;
    const bodySource = isRequest && init?.body === undefined ? input : null;
    return { request: { url, method, body }, bodySource };
}

/** A provider endpoint a request was matched to. */
export interface MatchedEndpoint {
    provider: SupportedProvider;
    endpoint: ReplyEndpoint;
}

/** The endpoint of the provider of the request host matching its method and path, if any. */
export function findEndpoint(
    captures: Captures,
    { url, method }: CapturedRequest,
): MatchedEndpoint | null {
    const host = providerForHost(url.hostname);
    const provider = isSupportedProvider(host) ? host : null;
    const endpoint = provider
        ? captures[provider]?.endpoints.find(
              (e) => (e.method ?? "POST") === method && e.path.test(url.pathname),
          )
        : undefined;
    return provider && endpoint ? { provider, endpoint } : null;
}

/** Reads a copy of the request body; must run before `fetch` consumes the request. */
function readBody({ request, bodySource }: DescribedRequest): Promise<string | null> {
    if (bodySource === null || bodySource.body === null) return Promise.resolve(request.body);
    try {
        return bodySource
            .clone()
            .text()
            .catch(() => null);
    } catch {
        return Promise.resolve(null);
    }
}

/**
 * Reads a copy of a reply stream with the endpoint's parser and emits the outcome. Never throws:
 * parse errors become adapter failures. Interrupted streams are still handed to the parser, with
 * how they ended: it returns a reply if it saw the reply complete, or a partial one if the page
 * aborted it before.
 */
async function capture(
    { provider, endpoint }: MatchedEndpoint,
    request: CapturedRequest,
    requestBody: Promise<string | null>,
    body: ReadableStream<Uint8Array>,
    startedAt: number,
    { emit, now, debug, record }: CaptureContext,
): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let parser;
    try {
        parser = endpoint.createParser({ ...request, body: await requestBody });
    } catch (error) {
        void reader.cancel();
        debug("parser creation failed", error);
        emit({ type: "adapter-failure", provider, error: errorMessage(error) });
        return;
    }
    let parseError: unknown = null;
    const recorded: string[] = [];
    let end = "done";
    let streamEnd: StreamEnd = "done";
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            const text = decoder.decode(value, { stream: true });
            if (record) recorded.push(text);
            try {
                parser.push(text);
            } catch (error) {
                parseError = error;
                break;
            }
        }
    } catch (error) {
        // The page aborted the request or the network failed. ChatGPT aborts its own request
        // once the reply is complete, so let the parser decide from what it received.
        debug("stream interrupted", error);
        end = String(error);
        streamEnd = isAbort(error) ? "aborted" : "failed";
    }
    record?.({ url: request.url.href, end, text: recorded.join("") });
    if (parseError !== null) {
        void reader.cancel();
    } else {
        try {
            parser.push(decoder.decode());
            const outcome = parser.finish(streamEnd);
            if (outcome.kind === "reply") {
                const latencyMs = now() - startedAt;
                const payload = { ...outcome.reply, provider, latencyMs };
                debug("reply captured", {
                    ...payload,
                    outputText: `${payload.outputText.length} chars`,
                    reasoningText: `${payload.reasoningText?.length ?? 0} chars`,
                });
                emit({ type: "captured-response", payload });
            } else {
                debug("reply skipped", outcome.reason);
            }
            return;
        } catch (error) {
            parseError = error;
        }
    }
    debug("parse failed", parseError);
    emit({ type: "adapter-failure", provider, error: errorMessage(parseError) });
}

/**
 * Wraps `win.fetch` so reply streams matched by a provider endpoint are copied and parsed. The page
 * always gets the original response, untouched, and the patch never throws on its own.
 */
export function installFetchInterceptor(win: FetchWindow, options: InterceptorOptions): void {
    const originalFetch = win.fetch;
    const now = options.now ?? (() => performance.now());
    const debug = options.debug ?? noDebug;

    async function fetch(this: unknown, ...args: Parameters<typeof win.fetch>): Promise<Response> {
        const startedAt = now();
        let described: DescribedRequest | null = null;
        let matched: MatchedEndpoint | null = null;
        let requestBody: Promise<string | null> = Promise.resolve(null);
        try {
            const [input, init] = args;
            described = describeRequest(input, init, win.location.href);
            const { request } = described;
            matched = findEndpoint(options.captures, request);
            if (matched) requestBody = readBody(described);
        } catch {
            matched = null;
        }

        const pending: Promise<Response> = Reflect.apply(originalFetch, this, args);
        if (matched === null || described === null) {
            if (described && described.request.method !== "GET") {
                debug("request ignored", `${described.request.method} ${described.request.url}`);
            }
            return pending;
        }

        const response = await pending;
        try {
            const { request } = described;
            debug("request matched", {
                url: request.url.href,
                status: response.status,
                contentType: response.headers.get("content-type"),
            });
            if (response.ok && response.body !== null) {
                const copy = response.clone().body;
                if (copy) {
                    const { emit } = options;
                    const context = { emit, now, debug, record: options.record };
                    void capture(matched, request, requestBody, copy, startedAt, context);
                }
            }
        } catch {
            // Never let the capture affect the page.
        }
        return response;
    }

    win.fetch = fetch as typeof win.fetch;
}
