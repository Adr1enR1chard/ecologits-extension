import { isRecord, type BackgroundMessage } from "../messaging";

/**
 * Private channel between the main-world interceptor and the isolated bridge.
 *
 * Both scripts run at `document_start`, before any page script. The interceptor offers a
 * `MessagePort` through `window.postMessage`; the bridge keeps the first port it receives and
 * acknowledges it over the port. As the bridge may load after the first offer, it also says
 * hello, which triggers a new offer until one is acknowledged. Captures then travel over the
 * port only, so page scripts cannot read them or inject fake ones through `window` messages.
 *
 * This is best effort, not a security boundary: the interceptor shares its realm with the page,
 * which can patch built-ins the parser relies on (`JSON.parse`, streams…) and so distort what
 * is captured. The bridge validates every message, and the worst outcome is wrong local stats
 * for this user. The channel primitives are at least captured before any page script runs.
 */

// Captured when the script is evaluated, at `document_start`.
const NativeMessageChannel = globalThis.MessageChannel;
const portPostMessage = globalThis.MessagePort?.prototype.postMessage;

function postToPort(port: MessagePort, message: unknown): void {
    Reflect.apply(portPostMessage ?? port.postMessage, port, [message]);
}

export const HELLO = "ecologits:hello";
export const OFFER = "ecologits:offer";
export const ACK = "ecologits:ack";

/** Messages the interceptor sends to the bridge. */
export type CaptureMessage = Extract<
    BackgroundMessage,
    { type: "captured-response" | "adapter-failure" }
>;

type ChannelWindow = Pick<Window, "postMessage" | "addEventListener" | "removeEventListener">;

function hasType(data: unknown, type: string): boolean {
    return isRecord(data) && data.type === type;
}

/** Main-world side. Returns a sender that queues messages until the bridge is connected. */
export function offerChannel(win: ChannelWindow, origin: string): (m: CaptureMessage) => void {
    let port: MessagePort | null = null;
    const queue: CaptureMessage[] = [];
    const postToWindow = win.postMessage.bind(win);

    const offer = (): void => {
        const channel = new NativeMessageChannel();
        channel.port1.onmessage = (event) => {
            if (port !== null || !hasType(event.data, ACK)) return;
            port = channel.port1;
            win.removeEventListener("message", onHello);
            for (const message of queue.splice(0)) postToPort(port, message);
        };
        postToWindow({ type: OFFER }, origin, [channel.port2]);
    };
    const onHello = (event: MessageEvent): void => {
        if (event.source === win && hasType(event.data, HELLO)) offer();
    };

    win.addEventListener("message", onHello);
    offer();

    return (message) => {
        if (port === null) queue.push(message);
        else postToPort(port, message);
    };
}

/** Isolated-world side. Calls `onMessage` with every (unvalidated) message from the interceptor. */
export function acceptChannel(
    win: ChannelWindow,
    origin: string,
    onMessage: (data: unknown) => void,
): void {
    const onOffer = (event: MessageEvent): void => {
        const port = event.ports[0];
        if (event.source !== win || !hasType(event.data, OFFER) || !port) return;
        win.removeEventListener("message", onOffer);
        port.onmessage = (e) => onMessage(e.data);
        port.postMessage({ type: ACK });
    };
    win.addEventListener("message", onOffer);
    win.postMessage({ type: HELLO }, origin);
}
