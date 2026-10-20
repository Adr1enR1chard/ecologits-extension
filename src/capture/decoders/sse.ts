export interface SseEvent {
    /** `event:` field, `"message"` when absent. */
    event: string;
    data: string;
}

/**
 * Incremental `text/event-stream` decoder: accepts text split at arbitrary points and returns
 * the events completed so far. See https://html.spec.whatwg.org/multipage/server-sent-events.html
 */
export class SseDecoder {
    private buffer = "";
    /** The previous chunk ended with "\r": a leading "\n" belongs to the same line break. */
    private skipLineFeed = false;
    private eventName = "";
    private dataLines: string[] = [];

    push(text: string): SseEvent[] {
        if (text === "") return [];
        if (this.skipLineFeed && text.startsWith("\n")) text = text.slice(1);
        this.skipLineFeed = text.endsWith("\r");
        this.buffer += text;
        // Splitting only when a line ends keeps long lines pushed in small chunks linear.
        if (!/[\r\n]/.test(text)) return [];
        const events: SseEvent[] = [];
        const lines = this.buffer.split(/\r\n|\r|\n/);
        // The last item is the incomplete line.
        this.buffer = lines.pop() ?? "";
        for (const line of lines) this.processLine(line, events);
        return events;
    }

    /** Dispatches a final event the stream did not terminate with a blank line. */
    flush(): SseEvent[] {
        const events: SseEvent[] = [];
        if (this.buffer !== "") this.processLine(this.buffer, events);
        this.buffer = "";
        this.processLine("", events);
        return events;
    }

    private processLine(line: string, events: SseEvent[]): void {
        if (line === "") {
            if (this.dataLines.length > 0) {
                events.push({
                    event: this.eventName || "message",
                    data: this.dataLines.join("\n"),
                });
            }
            this.eventName = "";
            this.dataLines = [];
            return;
        }
        if (line.startsWith(":")) return;
        const colon = line.indexOf(":");
        const field = colon === -1 ? line : line.slice(0, colon);
        let value = colon === -1 ? "" : line.slice(colon + 1);
        if (value.startsWith(" ")) value = value.slice(1);
        if (field === "data") this.dataLines.push(value);
        else if (field === "event") this.eventName = value;
    }
}
