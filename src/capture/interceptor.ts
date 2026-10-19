import { isCapturedProvider, providerForHost, type CapturedProvider } from "../providers/registry";
import type { CaptureMessage } from "./channel";
import type {
    CapturedRequest,
    ProviderCapture,
    ReplyEndpoint,
    StreamEnd,
    StreamParser,
} from "./types";

type FetchWindow = Pick<typeof globalThis, "fetch"> & { location: { href: string } };

export type Captures = Readonly<Partial<Record<CapturedProvider, ProviderCapture>>>;

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
    provider: CapturedProvider;
    endpoint: ReplyEndpoint;
}

/**
 * The endpoint matching the request method and path, among those of the provider of the request
 * host and those declaring the request host as their API host.
 */
export function findEndpoint(
    captures: Captures,
    { url, method }: CapturedRequest,
): MatchedEndpoint | null {
    const hostProvider = providerForHost(url.hostname);
    for (const [provider, capture] of Object.entries(captures)) {
        if (!isCapturedProvider(provider)) continue;
        const endpoint = capture?.endpoints.find(
            (e) =>
                (e.host === undefined ? provider === hostProvider : e.host === url.hostname) &&
                (e.method ?? "POST") === method &&
                e.path.test(url.pathname),
        );
        if (endpoint) return { provider, endpoint };
    }
    return null;
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
 * One matched stream fed to the endpoint's parser, whatever transport carries it. Never throws:
 * parse errors become adapter failures. Interrupted streams are still handed to the parser, with
 * how they ended: it returns a reply if it saw the reply complete, or a partial one if the page
 * aborted it before.
 */
class StreamCapture {
    private readonly recorded: string[] = [];
    private parseError: unknown = null;

    private constructor(
        private readonly provider: CapturedProvider,
        private readonly request: CapturedRequest,
        private readonly parser: StreamParser,
        private readonly startedAt: number,
        private readonly context: CaptureContext,
    ) {}

    /** The capture of `request`, or `null` when its parser could not be created. */
    static open(
        { provider, endpoint }: MatchedEndpoint,
        request: CapturedRequest,
        startedAt: number,
        context: CaptureContext,
    ): StreamCapture | null {
        try {
            const parser = endpoint.createParser(request);
            return new StreamCapture(provider, request, parser, startedAt, context);
        } catch (error) {
            context.debug("parser creation failed", error);
            context.emit({ type: "adapter-failure", provider, error: errorMessage(error) });
            return null;
        }
    }

    /** Feeds decoded text; false once the parser threw, when the rest is not needed. */
    push(text: string): boolean {
        if (this.parseError !== null) return false;
        if (this.context.record) this.recorded.push(text);
        try {
            this.parser.push(text);
            return true;
        } catch (error) {
            this.parseError = error;
            return false;
        }
    }

    /** Emits the outcome, `end` being `"done"` or the interruption error. */
    end(streamEnd: StreamEnd, end: string): void {
        const { provider, request, context } = this;
        const { emit, now, debug, record } = context;
        record?.({ url: request.url.href, end, text: this.recorded.join("") });
        if (this.parseError === null) {
            try {
                const outcome = this.parser.finish(streamEnd);
                if (outcome.kind === "reply") {
                    const latencyMs = now() - this.startedAt;
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
                this.parseError = error;
            }
        }
        debug("parse failed", this.parseError);
        emit({ type: "adapter-failure", provider, error: errorMessage(this.parseError) });
    }
}

/** Reads a copy of a `fetch` reply stream into a `StreamCapture`. */
async function capture(
    matched: MatchedEndpoint,
    request: CapturedRequest,
    requestBody: Promise<string | null>,
    body: ReadableStream<Uint8Array>,
    startedAt: number,
    context: CaptureContext,
): Promise<void> {
    const reader = body.getReader();
    const run = StreamCapture.open(
        matched,
        { ...request, body: await requestBody },
        startedAt,
        context,
    );
    if (run === null) {
        void reader.cancel();
        return;
    }
    const decoder = new TextDecoder();
    let end = "done";
    let streamEnd: StreamEnd = "done";
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!run.push(decoder.decode(value, { stream: true }))) {
                void reader.cancel();
                break;
            }
        }
    } catch (error) {
        // The page aborted the request or the network failed. ChatGPT aborts its own request
        // once the reply is complete, so let the parser decide from what it received.
        context.debug("stream interrupted", error);
        end = String(error);
        streamEnd = isAbort(error) ? "aborted" : "failed";
    }
    run.push(decoder.decode());
    run.end(streamEnd, end);
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

type XhrWindow = { XMLHttpRequest: typeof XMLHttpRequest; location: { href: string } };

/**
 * Patches `win.XMLHttpRequest` so reply streams matched by a provider endpoint are parsed as they
 * load (Gemini streams its replies over XHR). The new part of `responseText` is fed on each
 * progress; the page's requests and listeners are left untouched, and the patch never throws on
 * its own.
 */
export function installXhrInterceptor(win: XhrWindow, options: InterceptorOptions): void {
    const proto = win.XMLHttpRequest.prototype;
    const { open, send } = proto;
    const now = options.now ?? (() => performance.now());
    const debug = options.debug ?? noDebug;
    const context: CaptureContext = { emit: options.emit, now, debug, record: options.record };
    const opened = new WeakMap<XMLHttpRequest, Omit<CapturedRequest, "body">>();

    function watch(xhr: XMLHttpRequest, body: unknown): void {
        const target = opened.get(xhr);
        if (target === undefined) return;
        const request = { ...target, body: typeof body === "string" ? body : null };
        const matched = findEndpoint(options.captures, request);
        if (matched === null) {
            if (request.method !== "GET") {
                debug("request ignored", `${request.method} ${request.url}`);
            }
            return;
        }
        const startedAt = now();
        // `undefined` until the headers arrive, `null` when the stream is not captured.
        let run: StreamCapture | null | undefined;
        let read = 0;
        // `XMLHttpRequest.HEADERS_RECEIVED` and `LOADING`.
        const [headersReceived, loading] = [2, 3];
        const progress = () => {
            try {
                if (run === undefined && xhr.readyState >= headersReceived) {
                    debug("request matched", {
                        url: request.url.href,
                        status: xhr.status,
                        contentType: xhr.getResponseHeader("content-type"),
                    });
                    const isText = xhr.responseType === "" || xhr.responseType === "text";
                    const ok = xhr.status >= 200 && xhr.status < 300;
                    run =
                        ok && isText
                            ? StreamCapture.open(matched, request, startedAt, context)
                            : null;
                }
                if (!run || xhr.readyState < loading) return;
                // An aborted request empties `responseText`.
                const text = xhr.responseText;
                if (text.length > read) {
                    run.push(text.slice(read));
                    read = text.length;
                }
            } catch {
                run = null;
            }
        };
        const finish = (streamEnd: StreamEnd, end: string) => () => {
            progress();
            if (run) run.end(streamEnd, end);
            else if (run === undefined) debug("stream interrupted", end);
            run = null;
        };
        xhr.addEventListener("readystatechange", progress);
        xhr.addEventListener("progress", progress);
        xhr.addEventListener("load", finish("done", "done"));
        xhr.addEventListener("abort", finish("aborted", "AbortError"));
        xhr.addEventListener("error", finish("failed", "error"));
        xhr.addEventListener("timeout", finish("failed", "timeout"));
    }

    proto.open = function (this: XMLHttpRequest, ...args: unknown[]) {
        try {
            const [method, url] = args;
            opened.set(this, {
                method: String(method).toUpperCase(),
                url: new URL(String(url), win.location.href),
            });
        } catch {
            opened.delete(this);
        }
        return Reflect.apply(open, this, args) as void;
    } as typeof proto.open;

    proto.send = function (this: XMLHttpRequest, ...args: Parameters<typeof send>) {
        try {
            watch(this, args[0]);
        } catch {
            // Never let the capture affect the page.
        }
        return Reflect.apply(send, this, args);
    };
}
