import { Window, type Element } from "happy-dom";
import { NdjsonDecoder } from "../../src/capture/decoders/ndjson";
import { SseDecoder } from "../../src/capture/decoders/sse";
import { PAGES } from "../../src/providers/page";
import { findLastReply, inspectSnapshot, isRendering } from "../../src/providers/page-check";
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
 * are written `<id>`. Events of the `keepAlive` types are left out.
 */
export function streamShape(text: string, keepAlive: ReadonlySet<string> = new Set()): StreamShape {
    const shape: StreamShape = { events: [], paths: new Map() };
    for (const { event, data } of payloads(text)) {
        // `[DONE]` would parse as the start of an array.
        const marker = MARKER.test(data.trim());
        const root = marker ? null : parseJsonTree(data);
        const type = root?.kind === "object" ? stringType(root) : null;
        const name = [event, type].filter((part, i, parts) => part && parts.indexOf(part) === i);
        let label = name.join(":") || "line";
        if (root === null) label = `${label}:${marker ? data.trim() : "text"}`;
        if (keepAlive.has(label)) continue;
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
 * reply to another, their order does not), key paths added or missing, value types changed. A
 * value that is `null` in one stream only is not a change: nullable fields are `null` or not
 * from a reply to another. Empty when they have the same shape.
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
        else if (changedTypes(before, types)) {
            diff.push(`changed type: ${path}: ${typeList(before)} → ${typeList(types)}`);
        }
    }
    for (const [path, types] of committed.paths) {
        if (!fresh.paths.has(path)) diff.push(`missing key path: ${path} (${typeList(types)})`);
    }
    return diff;
}

/** Whether the types of the non-null values differ, when both streams have some. */
function changedTypes(before: Set<string>, now: Set<string>): boolean {
    const [a, b] = [before, now].map((types) => typeList(types, false));
    return a !== "" && b !== "" && a !== b;
}

function typeList(types: Set<string>, withNull = true): string {
    if (!withNull) types = new Set([...types].filter((type) => type !== "null"));
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
     * to the anchor, each as its tag and `data-*` / `role` attribute names: `div[data-testid]`.
     * `null` without a single anchor.
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
        // `ParentNode` and `Element` of the DOM library, which happy-dom implements.
        const root = template.content as unknown as ParentNode;
        const { markups } = PAGES[provider];
        const last = findLastReply(root, markups);
        const { anchors, problems } = inspectSnapshot(root, last?.markup ?? markups[0]!, {
            escape: (id) => window.CSS.escape(id),
            rendering: (r) => isRendering(r, markups),
        });
        const anchorPath =
            last && anchors.length === 1
                ? pathBetween(last.element as unknown as Element, anchors[0] as unknown as Element)
                : null;
        return { markup: last?.index ?? null, problems, anchorPath };
    } finally {
        void window.happyDOM.close();
    }
}

/**
 * From `reply` up to the innermost element holding `anchor` (or the top of the snapshot, when
 * none does), then down to `anchor`.
 */
function pathBetween(reply: Element, anchor: Element): string {
    const up: Element[] = [reply];
    let holder: Element | null = reply;
    while (holder && !holder.contains(anchor)) {
        holder = holder.parentElement;
        if (holder) up.push(holder);
    }
    const down: Element[] = [];
    for (let at: Element | null = anchor; at && at !== holder; at = at.parentElement) {
        down.unshift(at);
    }
    return [
        describe(reply),
        ...up.slice(1).map((element) => `↑ ${describe(element)}`),
        ...(holder ? [] : ["↑ (top)"]),
        ...down.map((element) => `↓ ${describe(element)}`),
    ].join(" ");
}

/**
 * An element as its tag and the names of its `data-*` and `role` attributes, which the page
 * markups select on. `class`, `id` and the text attributes come and go with the page's state.
 */
function describe(element: Element): string {
    const names = [...element.attributes]
        .map((attribute) => attribute.name)
        .filter((name) => name === "role" || name.startsWith("data-"))
        .sort();
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
