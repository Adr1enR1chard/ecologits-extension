import { NdjsonDecoder } from "../../src/capture/decoders/ndjson";
import { SseDecoder } from "../../src/capture/decoders/sse";
import { parseJsonTree, type JsonNode, type ObjectNode } from "./json-tree";
import { looksLikeToken, maskText, UUID, zeroedUuid } from "./personal-data";
import type { SupportedProvider } from "../../src/providers/registry";
import { FIXTURE_RULES } from "./providers";
import type { FixtureRules } from "./providers/types";

/**
 * Turns a raw recorded stream into a fixture safe to commit (see `test/fixtures/README.md`):
 * structural values are kept, ids become zeroed UUIDs (the same id always the same one, so
 * references between events still hold), tokens and account details become `REDACTED`, and
 * every other string is masked. Only values are rewritten: event lines, line endings, padding
 * and key order are kept.
 */
export function anonymiseStream(provider: SupportedProvider, text: string): string {
    const anonymiser = new Anonymiser(FIXTURE_RULES[provider]);
    const sse = /^(?:data|event):/m.test(text);
    let output = "";
    let cursor = 0;
    for (const { key, payload } of sse ? ssePayloads(text) : ndjsonPayloads(text)) {
        const at = sse ? findDataLine(text, payload, cursor) : text.indexOf(payload, cursor);
        if (payload === "" || at === -1) continue;
        output += text.slice(cursor, at) + anonymiser.payload(payload, key);
        cursor = at + payload.length;
    }
    return output + text.slice(cursor);
}

interface Payload {
    /** The key of the root value: the SSE event name, `""` in NDJSON. */
    key: string;
    payload: string;
}

/** Each `data:` line of each event; multi-line data is anonymised line by line. */
function ssePayloads(text: string): Payload[] {
    const decoder = new SseDecoder();
    return [...decoder.push(text), ...decoder.flush()].flatMap(({ event, data }) =>
        data.split("\n").map((payload) => ({ key: event, payload })),
    );
}

function ndjsonPayloads(text: string): Payload[] {
    const decoder = new NdjsonDecoder();
    return [...decoder.push(text), ...decoder.flush()].map((payload) => ({ key: "", payload }));
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

class Anonymiser {
    private readonly ids = new Map<string, string>();
    private readonly keyOf: (object: ObjectNode, key: string) => string;

    constructor(private readonly rules: FixtureRules) {
        this.keyOf = rules.keyResolver?.() ?? ((_, key) => key);
    }

    /** Anonymises one event or line. Text that is not JSON (`[DONE]`…) only has its ids mapped. */
    payload(payload: string, key: string): string {
        const root = parseJsonTree(payload);
        if (root === null) return this.mapUuids(payload);
        const replacements: Replacement[] = [];
        this.visit(root, key, false, replacements);
        let output = payload;
        for (const { start, end, text } of replacements.sort((a, b) => b.start - a.start)) {
            output = output.slice(0, start) + text + output.slice(end);
        }
        return output;
    }

    private visit(node: JsonNode, key: string, account: boolean, out: Replacement[]): void {
        const inAccount = account || this.rules.account.has(key);
        switch (node.kind) {
            case "object":
                for (const entry of node.entries) {
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
        if (this.rules.ids.has(key)) return this.mapId(value);
        if (this.rules.structural.has(key)) return this.mapUuids(value);
        if (looksLikeToken(value)) return "REDACTED";
        // Mask around the UUIDs, which are mapped instead.
        let masked = "";
        let last = 0;
        for (const match of value.matchAll(UUID)) {
            masked += maskText(value.slice(last, match.index)) + this.mapId(match[0]);
            last = match.index + match[0].length;
        }
        return masked + maskText(value.slice(last));
    }

    private mapUuids(text: string): string {
        return text.replace(UUID, (uuid) => this.mapId(uuid));
    }

    private mapId(id: string): string {
        const known = id.toLowerCase();
        let mapped = this.ids.get(known);
        if (mapped === undefined) {
            mapped = zeroedUuid(this.ids.size + 1);
            this.ids.set(known, mapped);
        }
        return mapped;
    }
}
