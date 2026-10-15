/**
 * Incremental newline-delimited JSON decoder: accepts text split at arbitrary points and returns
 * the lines completed so far, trimmed, without blank ones. Lines are not parsed: see `parseJson`.
 */
export class NdjsonDecoder {
    private buffer = "";

    push(text: string): string[] {
        this.buffer += text;
        const lines = this.buffer.split("\n");
        // The last item is the incomplete line.
        this.buffer = lines.pop() ?? "";
        return clean(lines);
    }

    /** Returns a final line the stream did not terminate with a line feed. */
    flush(): string[] {
        const lines = clean([this.buffer]);
        this.buffer = "";
        return lines;
    }
}

function clean(lines: string[]): string[] {
    return lines.map((line) => line.trim()).filter((line) => line !== "");
}
