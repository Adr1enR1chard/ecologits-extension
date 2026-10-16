/**
 * A lenient JSON parser that remembers where each primitive value sits in the text, so values can
 * be rewritten in place, keeping the whitespace, key order and escapes of everything else.
 * Truncated input (a stream aborted mid-event) yields the part parsed so far.
 */

export type JsonNode = ObjectNode | ArrayNode | StringNode | NumberNode | LiteralNode;

export interface ObjectNode {
    kind: "object";
    /** `keyNode` locates the key, for ids used as keys. */
    entries: { key: string; keyNode: StringNode; value: JsonNode }[];
}

export interface ArrayNode {
    kind: "array";
    items: JsonNode[];
}

/** `start` and `end` span the quotes; an unterminated string has no closing quote. */
export interface StringNode {
    kind: "string";
    value: string;
    start: number;
    end: number;
    closed: boolean;
}

export interface NumberNode {
    kind: "number";
    start: number;
    end: number;
}

/** `true`, `false` or `null`. */
export interface LiteralNode {
    kind: "literal";
}

/** Thrown at the end of the text or at the first invalid character. */
class Stop extends Error {}

const NUMBER = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const LITERALS = ["true", "false", "null"];

/** The value at the start of `text`, possibly partial; `null` when it does not start with one. */
export function parseJsonTree(text: string): JsonNode | null {
    let root: JsonNode | null = null;
    try {
        new Parser(text).value((node) => (root = node));
    } catch (error) {
        if (!(error instanceof Stop)) throw error;
    }
    return root;
}

/** The string value of `object[key]`, `null` when absent or not a string. */
export function stringEntry(object: ObjectNode, key: string): string | null {
    const value = object.entries.find((e) => e.key === key)?.value;
    return value?.kind === "string" ? value.value : null;
}

/** Decodes the text between the quotes of a JSON string, dropping a truncated final escape. */
function decodeString(raw: string, closed: boolean): string {
    const text = closed ? raw : raw.replace(/\\(?:u[0-9a-fA-F]{0,3})?$/, "");
    try {
        return JSON.parse(`"${text}"`) as string;
    } catch {
        return text;
    }
}

class Parser {
    private i = 0;

    constructor(private readonly text: string) {}

    /** Parses a value, handing it to `attach` as soon as it exists so partial values are kept. */
    value(attach: (node: JsonNode) => void): void {
        this.skipSpace();
        const char = this.text[this.i];
        if (char === "{") this.object(attach);
        else if (char === "[") this.array(attach);
        else if (char === '"') attach(this.string());
        else this.primitive(attach);
    }

    private object(attach: (node: JsonNode) => void): void {
        const node: ObjectNode = { kind: "object", entries: [] };
        attach(node);
        this.i++;
        this.skipSpace();
        if (this.text[this.i] === "}") {
            this.i++;
            return;
        }
        for (;;) {
            this.skipSpace();
            if (this.text[this.i] !== '"') throw new Stop();
            const key = this.string();
            if (!key.closed) throw new Stop();
            this.expect(":");
            this.value((value) => node.entries.push({ key: key.value, keyNode: key, value }));
            this.skipSpace();
            if (this.text[this.i] === "}") {
                this.i++;
                return;
            }
            this.expect(",");
        }
    }

    private array(attach: (node: JsonNode) => void): void {
        const node: ArrayNode = { kind: "array", items: [] };
        attach(node);
        this.i++;
        this.skipSpace();
        if (this.text[this.i] === "]") {
            this.i++;
            return;
        }
        for (;;) {
            this.value((item) => node.items.push(item));
            this.skipSpace();
            if (this.text[this.i] === "]") {
                this.i++;
                return;
            }
            this.expect(",");
        }
    }

    /** Parses a string, unterminated at the end of the text; the caller decides what that means. */
    private string(): StringNode {
        const start = this.i;
        let i = start + 1;
        while (i < this.text.length && this.text[i] !== '"') i += this.text[i] === "\\" ? 2 : 1;
        const closed = i < this.text.length;
        const end = closed ? i + 1 : this.text.length;
        this.i = end;
        const raw = this.text.slice(start + 1, closed ? i : end);
        return { kind: "string", value: decodeString(raw, closed), start, end, closed };
    }

    private primitive(attach: (node: JsonNode) => void): void {
        NUMBER.lastIndex = this.i;
        const number = NUMBER.exec(this.text);
        if (number) {
            const end = this.i + number[0].length;
            // A number cut by the end of the text may have lost digits: rewriting it is harmless.
            attach({ kind: "number", start: this.i, end });
            this.i = end;
            return;
        }
        const literal = LITERALS.find((l) => this.text.startsWith(l, this.i));
        if (literal === undefined) throw new Stop();
        attach({ kind: "literal" });
        this.i += literal.length;
    }

    private expect(char: string): void {
        this.skipSpace();
        if (this.text[this.i] !== char) throw new Stop();
        this.i++;
    }

    private skipSpace(): void {
        while (/\s/.test(this.text[this.i] ?? "")) this.i++;
        if (this.i >= this.text.length) throw new Stop();
    }
}
