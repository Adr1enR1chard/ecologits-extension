import { NdjsonDecoder } from "../../src/capture/decoders/ndjson";
import { SseDecoder } from "../../src/capture/decoders/sse";
import { parseJsonTree, type JsonNode, type ObjectNode } from "./json-tree";
import { looksLikeToken, maskAround, maskText, ZeroedIds } from "./personal-data";
import type { SupportedProvider } from "../../src/providers/registry";
import { FIXTURE_RULES } from "./providers";
import type { FixtureRules } from "./providers/types";

/**
 * Turns a raw recorded stream into a fixture safe to commit (see `test/fixtures/README.md`):
 * structural values are kept, ids become zeroed UUIDs (the same id always the same one, so
 * references between events still hold), tokens and account details become `REDACTED`, and
 * every other string is masked. Only values and the UUIDs of keys are rewritten: event lines,
 * line endings, padding and key order are kept. Pass the `ids` of the case's DOM snapshot
 * (`sanitiseSnapshot`) to map the ids of both alike.
 */
export function anonymiseStream(
    provider: SupportedProvider,
    text: string,
    ids = new ZeroedIds(),
): string {
    const anonymiser = new Anonymiser(FIXTURE_RULES[provider], ids);
    const sse = /^(?:data|event):/m.test(text);
    let output = "";
    let cursor = 0;
    for (const { key, lines } of sse ? ssePayloads(text) : ndjsonPayloads(text)) {
        const anonymised = anonymiser.anonymiseLines(lines, key);
        lines.forEach((line, i) => {
            const at = sse ? findDataLine(text, line, cursor) : text.indexOf(line, cursor);
            if (line === "" || at === -1) return;
            output += text.slice(cursor, at) + anonymised[i];
            cursor = at + line.length;
        });
    }
    return output + text.slice(cursor);
}

/** One SSE event's data, or one NDJSON line: a single JSON value, possibly over several lines. */
interface Payload {
    /** The key of the root value: the SSE event name, `""` in NDJSON. */
    key: string;
    /** Its `data:` lines in SSE, the line itself in NDJSON. */
    lines: string[];
}

function ssePayloads(text: string): Payload[] {
    const decoder = new SseDecoder();
    return [...decoder.push(text), ...decoder.flush()].map(({ event, data }) => ({
        key: event,
        lines: data.split("\n"),
    }));
}

function ndjsonPayloads(text: string): Payload[] {
    const decoder = new NdjsonDecoder();
    return [...decoder.push(text), ...decoder.flush()].map((line) => ({ key: "", lines: [line] }));
}

/** Where `line` starts in `text` from `from` on, as the value of a `data:` field. */
function findDataLine(text: string, line: string, from: number): number {
    for (let at = text.indexOf(line, from); at !== -1; at = text.indexOf(line, at + 1)) {
        if (/(?:^|[\r\n])data: ?$/.test(text.slice(Math.max(0, at - 7), at))) return at;
    }
    return -1;
}

interface Replacement {
    start: number;
    end: number;
    text: string;
}

/**
 * Applies to each line the replacements made in the lines joined with `\n`. A JSON string or
 * number never holds a raw line break, so a replacement spanning lines only comes from invalid
 * JSON: each line's part of it is masked instead.
 */
function applyByLine(lines: string[], replacements: Replacement[]): string[] {
    let lineStart = 0;
    return lines.map((line) => {
        const lineEnd = lineStart + line.length;
        const own = replacements
            .filter((r) => r.start < lineEnd && r.end > lineStart)
            .map((r) => {
                const start = Math.max(r.start, lineStart) - lineStart;
                const end = Math.min(r.end, lineEnd) - lineStart;
                const contained = r.start >= lineStart && r.end <= lineEnd;
                return { start, end, text: contained ? r.text : maskText(line.slice(start, end)) };
            });
        lineStart = lineEnd + 1;
        let output = line;
        for (const { start, end, text } of own.sort((a, b) => b.start - a.start)) {
            output = output.slice(0, start) + text + output.slice(end);
        }
        return output;
    });
}

class Anonymiser {
    private readonly keyOf: (object: ObjectNode, key: string) => string;

    constructor(
        private readonly rules: FixtureRules,
        private readonly ids: ZeroedIds,
    ) {
        this.keyOf = rules.keyResolver?.() ?? ((_, key) => key);
    }

    /**
     * Anonymises the lines of one payload, parsed as a single value. Text that is not JSON
     * (`[DONE]`…) only has its ids mapped.
     */
    anonymiseLines(lines: string[], key: string): string[] {
        const root = parseJsonTree(lines.join("\n"));
        if (root === null) return lines.map((line) => this.ids.mapUuids(line));
        const replacements: Replacement[] = [];
        this.visit(root, key, false, replacements);
        return applyByLine(lines, replacements);
    }

    private visit(node: JsonNode, key: string, account: boolean, out: Replacement[]): void {
        const inAccount = account || this.rules.account.has(key);
        switch (node.kind) {
            case "object":
                for (const entry of node.entries) {
                    // Keys are structural, but some are ids (`componentResults` by component).
                    const key = this.ids.mapUuids(entry.key);
                    if (key !== entry.key) {
                        const { start, end } = entry.keyNode;
                        out.push({ start, end, text: JSON.stringify(key) });
                    }
                    this.visit(entry.value, this.keyOf(node, entry.key), inAccount, out);
                }
                break;
            case "array":
                for (const item of node.items) this.visit(item, key, inAccount, out);
                break;
            case "number":
                if (inAccount) out.push({ start: node.start, end: node.end, text: "0" });
                break;
            case "string": {
                const value = this.string(node.value, key, inAccount);
                if (value === node.value) break;
                const json = JSON.stringify(value);
                out.push({
                    start: node.start,
                    end: node.end,
                    text: node.closed ? json : json.slice(0, -1),
                });
                break;
            }
        }
    }

    private string(value: string, key: string, account: boolean): string {
        if (value === "") return value;
        if (account || this.rules.tokens.has(key)) return "REDACTED";
        if (this.rules.ids.has(key)) return this.ids.map(value);
        if (this.rules.structural.has(key)) return this.ids.mapUuids(value);
        if (looksLikeToken(value)) return "REDACTED";
        return maskAround(value, this.ids);
    }
}
