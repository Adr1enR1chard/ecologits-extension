import type { CapturedRequest, ProviderAdapter } from "../adapters/types";
import type { CaptureMessage } from "./channel";

type FetchWindow = Pick<typeof globalThis, "fetch"> & { location: { href: string } };

export interface InterceptorOptions {
    adapters: readonly ProviderAdapter[];
    emit: (message: CaptureMessage) => void;
    /** Milliseconds, monotonic. */
    now?: () => number;
    /** Receives a trace of each capture step, for development builds. */
    debug?: Debug;
}

export type Debug = (step: string, details?: unknown) => void;

const noDebug: Debug = () => undefined;

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
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
 * Reads a copy of a reply stream with the adapter's parser and emits the outcome. Never throws:
 * parse errors become adapter failures. Interrupted streams are still handed to the parser,
 * which only returns a reply if it saw the reply complete.
 */
async function capture(
    adapter: ProviderAdapter,
    request: CapturedRequest,
    requestBody: Promise<string | null>,
    body: ReadableStream<Uint8Array>,
    startedAt: number,
    emit: InterceptorOptions["emit"],
    now: () => number,
    debug: Debug,
): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let parser;
    try {
        parser = adapter.createParser({ ...request, body: await requestBody });
    } catch (error) {
        void reader.cancel();
        debug("parser creation failed", error);
        emit({ type: "adapter-failure", provider: adapter.provider, error: errorMessage(error) });
        return;
    }
    let parseError: unknown = null;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            try {
                parser.push(decoder.decode(value, { stream: true }));
            } catch (error) {
                parseError = error;
                break;
            }
        }
    } catch (error) {
        // The page aborted the request or the network failed. ChatGPT aborts its own request
        // once the reply is complete, so let the parser decide from what it received.
        debug("stream interrupted", error);
    }
    if (parseError !== null) {
        void reader.cancel();
    } else {
        try {
            parser.push(decoder.decode());
            const outcome = parser.finish();
            if (outcome.kind === "reply") {
                const latencyMs = now() - startedAt;
                const payload = { ...outcome.reply, provider: adapter.provider, latencyMs };
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
    emit({ type: "adapter-failure", provider: adapter.provider, error: errorMessage(parseError) });
}

/**
 * Wraps `win.fetch` so reply streams matched by an adapter are copied and parsed. The page
 * always gets the original response, untouched, and the patch never throws on its own.
 */
export function installFetchInterceptor(win: FetchWindow, options: InterceptorOptions): void {
    const originalFetch = win.fetch;
    const now = options.now ?? (() => performance.now());
    const debug = options.debug ?? noDebug;

    async function fetch(this: unknown, ...args: Parameters<typeof win.fetch>): Promise<Response> {
        const startedAt = now();
        let described: DescribedRequest | null = null;
        let adapter: ProviderAdapter | undefined;
        let requestBody: Promise<string | null> = Promise.resolve(null);
        try {
            const [input, init] = args;
            described = describeRequest(input, init, win.location.href);
            const { request } = described;
            adapter = options.adapters.find((a) => a.matches(request));
            if (adapter) requestBody = readBody(described);
        } catch {
            adapter = undefined;
        }

        const pending: Promise<Response> = Reflect.apply(originalFetch, this, args);
        if (!adapter || described === null) {
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
                    void capture(adapter, request, requestBody, copy, startedAt, emit, now, debug);
                }
            }
        } catch {
            // Never let the capture affect the page.
        }
        return response;
    }

    win.fetch = fetch as typeof win.fetch;
}
