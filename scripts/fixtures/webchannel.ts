import { asMessage, asString, decodeMessage, fromBase64, toBase64 } from "./protobuf-tree";

/**
 * WebChannel back channels (Gemini): batches `<length>\n[[id,[payload…]],…]`, the length counting
 * the batch's characters, whose payloads hold base64 protobuf messages. See
 * `src/capture/decoders/webchannel.ts`.
 */

/** Whether a stream is a WebChannel back channel: it starts with a length-prefixed batch. */
export function isWebChannel(text: string): boolean {
    return /^\s*\d+\n\[\[\d+,/.test(text);
}

/**
 * `text` with each string of each batch replaced by `rewrite(value, closed)` and each batch's
 * length prefix recomputed. `closed` is false for the string a truncated stream ends in. A line
 * that is not a batch is rewritten alike, and a batch cut short keeps its prefix, shifted by
 * what its strings gained or lost.
 */
export function rewriteWebChannel(
    text: string,
    rewrite: (value: string, closed: boolean) => string,
): string {
    const header = /(\d+)\n/y;
    let output = "";
    let cursor = 0;
    while (cursor < text.length) {
        header.lastIndex = cursor;
        const match = header.exec(text);
        if (match === null) {
            const lineEnd = text.indexOf("\n", cursor);
            const end = lineEnd === -1 ? text.length : lineEnd + 1;
            output += rewriteStrings(text.slice(cursor, end), rewrite);
            cursor = end;
            continue;
        }
        const start = cursor + match[0].length;
        const length = Number(match[1]);
        const batch = text.slice(start, start + length);
        const rewritten = rewriteStrings(batch, rewrite);
        output += `${length + rewritten.length - batch.length}\n${rewritten}`;
        cursor = start + batch.length;
    }
    return output;
}

/** Each JSON string literal of `json` replaced by `rewrite` of its value. */
function rewriteStrings(json: string, rewrite: (value: string, closed: boolean) => string): string {
    return json.replace(/"((?:[^"\\]|\\.)*)("?)/g, (literal, body: string, quote: string) => {
        const closed = quote === '"';
        let value: string;
        try {
            value = JSON.parse(closed ? literal : `${literal}"`) as string;
        } catch {
            return literal;
        }
        const rewritten = JSON.stringify(rewrite(value, closed));
        return closed ? rewritten : rewritten.slice(0, -1);
    });
}

/**
 * `text` with each base64 protobuf message replaced by the strings it holds, one per line, so
 * they can be searched for personal data. A value that reads both as a sub-message and as UTF-8
 * (`xxxx` does) is written both ways; bytes that read as neither are written in base64.
 */
export function readableWebChannel(text: string): string {
    return rewriteWebChannel(text, (value) => {
        const bytes = fromBase64(value);
        return bytes === null ? value : leaves(bytes).join("\n");
    });
}

function leaves(message: Uint8Array): string[] {
    return (decodeMessage(message) ?? []).flatMap(({ wire, value }) => {
        if (wire !== 2) return [];
        const string = asString(value);
        const nested = asMessage(value) === null ? [] : leaves(value);
        return string === null && nested.length === 0
            ? [toBase64(value)]
            : [string ?? "", ...nested];
    });
}
