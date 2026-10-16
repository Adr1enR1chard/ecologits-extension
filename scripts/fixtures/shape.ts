import { Window, type Element } from "happy-dom";
import { NdjsonDecoder } from "../../src/capture/decoders/ndjson";
import { SseDecoder } from "../../src/capture/decoders/sse";
import { PAGES } from "../../src/providers/page";
import { checkSnapshot } from "../../src/providers/page-check";
import type { SupportedProvider } from "../../src/providers/registry";
import { parseJsonTree, type JsonNode } from "./json-tree";
import { UUID } from "./personal-data";

/**
 * The structure of a stream and of a DOM snapshot, without their text, so that a fresh recording
 * can be compared with a committed fixture (`pnpm fixtures:drift`): masked or different text
 * leaves the shape as it is, a renamed event, key or attribute changes it.
 */

/** The structure of a stream. */
export interface StreamShape {
    /** The type of each event, in order, consecutive repeats collapsed. */
    events: string[];
    /** Each JSON key path (`<event type>.key[].key`) and the types of the values found there. */
    paths: Map<string, Set<string>>;
}

/**
 * The shape of an SSE or NDJSON stream. An event's type is its SSE event name followed by its
 * JSON `type` when it has one (`message:resume_conversation_token`, `ping`), or, for data that is
 * not JSON, the data itself when it is a marker like `[DONE]`. Keys that are ids (UUIDs, indexes)
 * are written `<id>`.
 */
export function streamShape(text: string): StreamShape {
    const shape: StreamShape = { events: [], paths: new Map() };
    for (const { event, data } of payloads(text)) {
        // `[DONE]` would parse as the start of an array.
        const marker = MARKER.test(data.trim());
        const root = marker ? null : parseJsonTree(data);
        const type = root?.kind === "object" ? stringType(root) : null;
        const name = [event, type].filter((part, i, parts) => part && parts.indexOf(part) === i);
        let label = name.join(":") || "line";
        if (root === null) label = `${label}:${marker ? data.trim() : "text"}`;
        if (shape.events.at(-1) !== label) shape.events.push(label);
        if (root !== null) addPaths(shape.paths, label, root);
    }
    return shape;
}

const MARKER = /^\[[A-Z_]+\]$/;

function payloads(text: string): { event: string; data: string }[] {
    if (/^(?:data|event):/m.test(text)) {
        const decoder = new SseDecoder();
        return [...decoder.push(text), ...decoder.flush()];
    }
    const decoder = new NdjsonDecoder();
    return [...decoder.push(text), ...decoder.flush()].map((data) => ({ event: "", data }));
}

function stringType(root: Extract<JsonNode, { kind: "object" }>): string | null {
    const type = root.entries.find((entry) => entry.key === "type")?.value;
    return type?.kind === "string" && type.closed ? type.value : null;
}

const ID_KEY = new RegExp(`^(?:${UUID.source}|\\d+)$`, "i");

function addPaths(paths: Map<string, Set<string>>, path: string, node: JsonNode): void {
    let types = paths.get(path);
    if (!types) paths.set(path, (types = new Set()));
    types.add(valueType(node));
    if (node.kind === "object") {
        for (const { key, value } of node.entries) {
            addPaths(paths, `${path}.${ID_KEY.test(key) ? "<id>" : key}`, value);
        }
    } else if (node.kind === "array") {
        for (const item of node.items) addPaths(paths, `${path}[]`, item);
    }
}

function valueType(node: JsonNode): string {
    if (node.kind !== "literal") return node.kind;
    return node.value === null ? "null" : "boolean";
}

/**
 * What changed from the `committed` stream shape to the `fresh` one: event types added or
 * missing, the order of their first occurrences (the number of blocks or deltas varies from a
 * reply to another, their order does not), key paths added or missing, value types changed.
 * Empty when they have the same shape.
 */
export function compareStreams(committed: StreamShape, fresh: StreamShape): string[] {
    const diff: string[] = [];
    const committedEvents = new Set(committed.events);
    const freshEvents = new Set(fresh.events);
    const added = [...freshEvents].filter((e) => !committedEvents.has(e));
    const missing = [...committedEvents].filter((e) => !freshEvents.has(e));
    if (added.length > 0) diff.push(`added event types: ${added.join(", ")}`);
    if (missing.length > 0) diff.push(`missing event types: ${missing.join(", ")}`);
    const common = (events: Set<string>, other: Set<string>) =>
        [...events].filter((e) => other.has(e)).join(" → ");
    const committedOrder = common(committedEvents, freshEvents);
    const freshOrder = common(freshEvents, committedEvents);
    if (committedOrder !== freshOrder) {
        diff.push(`event order changed: ${committedOrder}`, `                 now: ${freshOrder}`);
    }
    for (const [path, types] of fresh.paths) {
        const before = committed.paths.get(path);
        if (!before) diff.push(`added key path: ${path} (${typeList(types)})`);
        else if (typeList(before) !== typeList(types)) {
            diff.push(`changed type: ${path}: ${typeList(before)} → ${typeList(types)}`);
        }
    }
    for (const [path, types] of committed.paths) {
        if (!fresh.paths.has(path)) diff.push(`missing key path: ${path} (${typeList(types)})`);
    }
    return diff;
}

function typeList(types: Set<string>): string {
    return [...types].sort().join(" | ");
}

/** The structure of a DOM snapshot, as the badge sees it. */
export interface PageShape {
    /** Index in `PAGES[provider].markups` of the markup the last reply matches, `null` if none. */
    markup: number | null;
    /** What the page checks found wrong: reply matched, id found, not rendering, one anchor. */
    problems: string[];
    /**
     * The elements from the last reply up to the innermost element holding its anchor, then down
     * to the anchor, each as its tag and attribute names: `div[class,data-testid]`. `null`
     * without a single anchor.
     */
    anchorPath: string | null;
}

/** The shape of a DOM snapshot (or a page's body HTML) for the markups of `PAGES[provider]`. */
export function pageShape(provider: SupportedProvider, html: string): PageShape {
    const window = new Window();
    try {
        // A template's content is inert: no script runs, no resource loads.
        const template = window.document.createElement("template");
        template.innerHTML = html;
        // `ParentNode` of the DOM library, which happy-dom implements.
        const root = template.content as unknown as ParentNode;
        const escape = (id: string) => window.CSS.escape(id);
        const { markups } = PAGES[provider];
        const last = [
            ...template.content.querySelectorAll(markups.map((m) => m.reply).join(", ")),
        ].at(-1);
        const index = last ? markups.findIndex((m) => last.matches(m.reply)) : -1;
        const markup = markups[Math.max(index, 0)]!;
        const problems = checkSnapshot(root, markup, escape);
        const id = last?.getAttribute(markup.idAttribute);
        const anchors = id
            ? [...template.content.querySelectorAll(markup.anchor(escape(id)).selector)]
            : [];
        const anchorPath = last && anchors.length === 1 ? pathBetween(last, anchors[0]!) : null;
        return { markup: index === -1 ? null : index, problems, anchorPath };
    } finally {
        void window.happyDOM.close();
    }
}

function pathBetween(reply: Element, anchor: Element): string {
    const up: Element[] = [reply];
    while (!up.at(-1)!.contains(anchor)) up.push(up.at(-1)!.parentElement!);
    const down: Element[] = [];
    for (let at = anchor; at !== up.at(-1); at = at.parentElement!) down.unshift(at);
    return [
        describe(reply),
        ...up.slice(1).map((element) => `↑ ${describe(element)}`),
        ...down.map((element) => `↓ ${describe(element)}`),
    ].join(" ");
}

function describe(element: Element): string {
    const names = [...element.attributes].map((attribute) => attribute.name).sort();
    return `${element.localName}[${names.join(",")}]`;
}

/**
 * What changed from the `committed` snapshot's shape to the `fresh` one, `null` when there is no
 * committed snapshot: the fresh one must then only pass the page checks.
 */
export function comparePages(committed: PageShape | null, fresh: PageShape): string[] {
    const diff = fresh.problems.map((problem) => `page check failed: ${problem}`);
    if (committed === null) return diff;
    if (committed.markup !== fresh.markup) {
        diff.push(`markup changed: ${committed.markup} → ${fresh.markup}`);
    }
    if (committed.anchorPath !== null && fresh.anchorPath !== null) {
        if (committed.anchorPath !== fresh.anchorPath) {
            diff.push(`anchor path changed: ${committed.anchorPath}`);
            diff.push(`                now: ${fresh.anchorPath}`);
        }
    }
    return diff;
}
