import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { chatgptAdapter } from "../adapters/chatgpt";
import { claudeAdapter } from "../adapters/claude";
import type { ProviderAdapter } from "../adapters/types";
import type { CaptureMessage } from "./channel";
import { installFetchInterceptor } from "./interceptor";

const URL_CONVERSATION = "https://chatgpt.com/backend-api/f/conversation";
const fixture = (name: string) =>
    readFileSync(new URL(`../../test/fixtures/chatgpt/${name}.sse`, import.meta.url), "utf8");

/** A response streaming `text` in small chunks, optionally erroring after `failAfter` chunks. */
function streamResponse(text: string, { status = 200, failAfter = Infinity } = {}): Response {
    const bytes = new TextEncoder().encode(text);
    let offset = 0;
    let chunks = 0;
    const body = new ReadableStream<Uint8Array>({
        pull(controller) {
            if (chunks++ >= failAfter) {
                controller.error(new DOMException("The user aborted a request.", "AbortError"));
            } else if (offset >= bytes.length) {
                controller.close();
            } else {
                // Split inside multi-byte characters too.
                controller.enqueue(bytes.slice(offset, offset + 50));
                offset += 50;
            }
        },
    });
    return new Response(body, { status, headers: { "content-type": "text/event-stream" } });
}

function setup(response: () => Response, adapters: ProviderAdapter[] = [chatgptAdapter]) {
    const original = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response());
    const win = { fetch: original as typeof fetch, location: { href: "https://chatgpt.com/c/1" } };
    const messages: CaptureMessage[] = [];
    let clock = 1000;
    installFetchInterceptor(win, {
        adapters,
        emit: (m) => messages.push(m),
        now: () => (clock += 500),
    });
    const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
    return { win, original, messages, settle };
}

const post = { method: "POST", body: JSON.stringify({ action: "next", model: "auto" }) };

describe("installFetchInterceptor", () => {
    it("emits one captured response per reply, with the latency", async () => {
        const { win, messages, settle } = setup(() => streamResponse(fixture("normal-reply")));
        const response = await win.fetch(URL_CONVERSATION, post);
        await response.text();
        await settle();

        expect(messages).toHaveLength(1);
        expect(messages[0]).toMatchObject({
            type: "captured-response",
            payload: {
                provider: "chatgpt",
                rawModel: "gpt-6",
                messageId: "00000000-0000-4000-8000-00000000000c",
                latencyMs: 500,
            },
        });
    });

    it("returns the original response and body to the page", async () => {
        const text = fixture("normal-reply");
        const { win, original, settle } = setup(() => streamResponse(text));
        const response = await win.fetch("/backend-api/conversation", post);

        expect(await response.text()).toBe(text);
        expect(response.headers.get("content-type")).toBe("text/event-stream");
        expect(original).toHaveBeenCalledWith("/backend-api/conversation", post);
        await settle();
    });

    it("captures replies the page never reads", async () => {
        const { win, messages, settle } = setup(() => streamResponse(fixture("normal-reply")));
        await win.fetch(URL_CONVERSATION, post);
        await settle();
        expect(messages).toHaveLength(1);
    });

    it("accepts Request objects", async () => {
        const { win, messages, settle } = setup(() => streamResponse(fixture("normal-reply")));
        await win.fetch(new Request(URL_CONVERSATION, post));
        await settle();
        expect(messages).toHaveLength(1);
    });

    it("reads the requested model from a Request body", async () => {
        const stream =
            'data: {"p": "", "o": "add", "v": {"message": {"id": "a", "author": {"role": "assistant"}, ' +
            '"content": {"content_type": "text", "parts": ["Hi"]}, "status": "finished_successfully", ' +
            '"metadata": {}, "recipient": "all"}}}\n\ndata: [DONE]\n\n';
        const { win, original, messages, settle } = setup(() => streamResponse(stream));
        const req = new Request(URL_CONVERSATION, {
            method: "POST",
            body: JSON.stringify({ model: "gpt-5-2-thinking" }),
        });
        await win.fetch(req);
        await settle();

        expect(original).toHaveBeenCalledWith(req);
        expect(messages[0]).toMatchObject({ payload: { rawModel: "gpt-5-2-thinking" } });
    });

    it("records the raw text of matched streams and how they ended", async () => {
        const text = fixture("normal-reply");
        const records: unknown[] = [];
        const original = async () => streamResponse(text);
        const win = { fetch: original as typeof fetch, location: { href: "https://chatgpt.com/" } };
        installFetchInterceptor(win, {
            adapters: [chatgptAdapter],
            emit: () => undefined,
            record: (stream) => records.push(stream),
        });
        await (await win.fetch(URL_CONVERSATION, post)).text();
        await new Promise((resolve) => setTimeout(resolve, 20));

        expect(records).toEqual([{ url: URL_CONVERSATION, end: "done", text }]);
    });

    it("leaves unmatched requests alone", async () => {
        const { win, original, messages, settle } = setup(() => new Response("{}"));
        const response = await win.fetch("https://chatgpt.com/backend-api/me");
        expect(await response.text()).toBe("{}");
        expect(original).toHaveBeenCalledTimes(1);
        await settle();
        expect(messages).toEqual([]);
    });

    it("captures replies the page aborts once complete, before [DONE]", async () => {
        // ChatGPT aborts its request as soon as `message_stream_complete` arrives.
        const text = fixture("normal-reply").split("data: [DONE]")[0]!;
        const chunks = Math.ceil(new TextEncoder().encode(text).length / 50);
        const { win, messages, settle } = setup(() => streamResponse(text, { failAfter: chunks }));
        const response = await win.fetch(URL_CONVERSATION, post);
        await response.text().catch(() => undefined);
        await settle();

        expect(messages).toHaveLength(1);
        expect(messages[0]).toMatchObject({
            type: "captured-response",
            payload: { messageId: "00000000-0000-4000-8000-00000000000c" },
        });
    });

    it("emits nothing for aborted, incomplete or failed replies", async () => {
        for (const make of [
            () => streamResponse(fixture("normal-reply"), { failAfter: 3 }),
            () => streamResponse(fixture("aborted")),
            () => streamResponse("Too many requests", { status: 429 }),
        ]) {
            const { win, messages, settle } = setup(make);
            const response = await win.fetch(URL_CONVERSATION, post);
            await response.text().catch(() => undefined);
            await settle();
            expect(messages).toEqual([]);
        }
    });

    it("propagates network errors to the page unchanged", async () => {
        const error = new TypeError("Failed to fetch");
        const { win } = setup(() => {
            throw error;
        });
        await expect(win.fetch(URL_CONVERSATION, post)).rejects.toBe(error);
    });

    it("reports parser exceptions as adapter failures without affecting the page", async () => {
        const broken: ProviderAdapter = {
            ...chatgptAdapter,
            createParser: () => ({
                push: () => {
                    throw new Error("unexpected format");
                },
                finish: () => ({ kind: "skip", reason: "" }),
            }),
        };
        const text = fixture("normal-reply");
        const { win, messages, settle } = setup(() => streamResponse(text), [broken]);
        const response = await win.fetch(URL_CONVERSATION, post);

        expect(await response.text()).toBe(text);
        await settle();
        expect(messages).toEqual([
            { type: "adapter-failure", provider: "chatgpt", error: "unexpected format" },
        ]);
    });

    it("ignores adapters that throw while matching", async () => {
        const throwing: ProviderAdapter = {
            ...chatgptAdapter,
            matches: () => {
                throw new Error("boom");
            },
        };
        const { win, messages, settle } = setup(() => new Response("ok"), [throwing]);
        expect(await (await win.fetch(URL_CONVERSATION, post)).text()).toBe("ok");
        await settle();
        expect(messages).toEqual([]);
    });
});

describe("installFetchInterceptor on claude.ai", () => {
    const COMPLETION =
        "https://claude.ai/api/organizations/00000000-0000-4000-8000-0000000000aa/chat_conversations/00000000-0000-4000-8000-0000000000bb/completion";
    const claudeFixture = (name: string) =>
        readFileSync(new URL(`../../test/fixtures/claude/${name}.sse`, import.meta.url), "utf8");

    it("captures a recorded reply and ignores one stopped by the user", async () => {
        const responses = [claudeFixture("normal-reply"), claudeFixture("aborted")];
        const { win, messages, settle } = setup(
            () => streamResponse(responses.shift()!),
            [chatgptAdapter, claudeAdapter],
        );
        for (let i = 0; i < 2; i++) {
            const response = await win.fetch(COMPLETION, { method: "POST", body: "{}" });
            await response.text();
        }
        await settle();

        expect(messages).toEqual([
            {
                type: "captured-response",
                payload: {
                    provider: "claude",
                    rawModel: "claude-sonnet-5-5",
                    outputText: "Hello! How can I help you today?",
                    reasoningText: null,
                    hiddenReasoning: false,
                    latencyMs: 500,
                    messageId: "00000000-0000-4000-8000-000000000002",
                },
            },
        ]);
    });
});
