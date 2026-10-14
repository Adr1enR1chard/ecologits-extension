import { describe, expect, it, vi } from "vitest";
import { acceptChannel, offerChannel, OFFER, type CaptureMessage } from "./channel";

type Listener = (event: MessageEvent) => void;

/** A window whose `postMessage` dispatches asynchronously, like the real one. */
function fakeWindow() {
    const listeners = new Set<Listener>();
    const win = {
        addEventListener: (_type: string, l: Listener) => listeners.add(l),
        removeEventListener: (_type: string, l: Listener) => listeners.delete(l),
        postMessage: (data: unknown, _origin: string, ports: MessagePort[] = []) => {
            setTimeout(() => {
                const event = { data, source: win, ports } as unknown as MessageEvent;
                for (const l of [...listeners]) l(event);
            });
        },
    };
    return win as unknown as Window & { postMessage: typeof win.postMessage };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const failure = (error: string): CaptureMessage => ({
    type: "adapter-failure",
    provider: "chatgpt",
    error,
});

describe("capture channel", () => {
    for (const order of ["interceptor first", "bridge first"]) {
        it(`delivers queued and later messages once connected (${order})`, async () => {
            const win = fakeWindow();
            const received: unknown[] = [];
            let send!: (m: CaptureMessage) => void;
            if (order === "interceptor first") {
                send = offerChannel(win, "https://chatgpt.com");
                send(failure("queued"));
                acceptChannel(win, "https://chatgpt.com", (d) => received.push(d));
            } else {
                acceptChannel(win, "https://chatgpt.com", (d) => received.push(d));
                send = offerChannel(win, "https://chatgpt.com");
                send(failure("queued"));
            }
            await settle();
            send(failure("later"));
            await settle();
            expect(received).toEqual([failure("queued"), failure("later")]);
        });
    }

    it("connects when the bridge loads after the first offer was dispatched", async () => {
        const win = fakeWindow();
        const received: unknown[] = [];
        const send = offerChannel(win, "https://chatgpt.com");
        await settle();
        acceptChannel(win, "https://chatgpt.com", (d) => received.push(d));
        send(failure("x"));
        await settle();
        expect(received).toEqual([failure("x")]);
    });

    it("ignores offers posted by the page once connected", async () => {
        const win = fakeWindow();
        const received: unknown[] = [];
        acceptChannel(win, "https://chatgpt.com", (d) => received.push(d));
        offerChannel(win, "https://chatgpt.com");
        await settle();

        const spoof = new MessageChannel();
        win.postMessage({ type: OFFER }, "*", [spoof.port2]);
        await settle();
        spoof.port1.postMessage(failure("spoofed"));
        await settle();
        expect(received).toEqual([]);
        spoof.port1.close();
    });

    it("keeps the channel primitives captured before page scripts run", async () => {
        const win = fakeWindow();
        const received: unknown[] = [];
        const send = offerChannel(win, "https://chatgpt.com");
        acceptChannel(win, "https://chatgpt.com", (d) => received.push(d));
        await settle();

        const native = MessagePort.prototype.postMessage;
        const spy = vi.fn();
        MessagePort.prototype.postMessage = spy;
        try {
            send(failure("x"));
            await settle();
        } finally {
            MessagePort.prototype.postMessage = native;
        }
        expect(spy).not.toHaveBeenCalled();
        expect(received).toEqual([failure("x")]);
    });
});
