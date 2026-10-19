/**
 * Incremental decoder of a WebChannel back channel (`TYPE=xmlhttp`): accepts text split at
 * arbitrary points and returns the payloads of the messages completed so far. The channel
 * streams batches as `<length>\n<JSON array>`, the length counting the array's characters, each
 * array holding `[id, payload]` messages. A line that is not such a batch is dropped, with what
 * follows decoded from the next line.
 */
export class WebChannelDecoder {
    private buffer = "";

    push(text: string): unknown[] {
        this.buffer += text;
        const payloads: unknown[] = [];
        for (;;) {
            const lineEnd = this.buffer.indexOf("\n");
            if (lineEnd === -1) return payloads;
            const header = this.buffer.slice(0, lineEnd).trim();
            if (!/^\d+$/.test(header)) {
                this.buffer = this.buffer.slice(lineEnd + 1);
                continue;
            }
            const end = lineEnd + 1 + Number(header);
            // Batches are compact JSON: a line break within the length shows it is not one.
            const nextLineEnd = this.buffer.indexOf("\n", lineEnd + 1);
            const batch =
                nextLineEnd !== -1 && nextLineEnd < end
                    ? null
                    : end > this.buffer.length
                      ? undefined
                      : parseBatch(this.buffer.slice(lineEnd + 1, end));
            if (batch === undefined) return payloads;
            if (batch === null) {
                this.buffer = this.buffer.slice(lineEnd + 1);
                continue;
            }
            payloads.push(...batch);
            this.buffer = this.buffer.slice(end);
        }
    }
}

/** The payloads of a `[[id, payload], …]` batch, `null` when the text is not one. */
function parseBatch(text: string): unknown[] | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return null;
    }
    if (!Array.isArray(parsed)) return null;
    const payloads: unknown[] = [];
    for (const message of parsed) {
        if (!Array.isArray(message) || typeof message[0] !== "number") return null;
        payloads.push(message[1]);
    }
    return payloads;
}
