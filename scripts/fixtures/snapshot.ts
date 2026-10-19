import { Element, HTMLTemplateElement, Node, Window } from "happy-dom";
import { looksLikeToken, maskAround, UUID, ZeroedIds } from "./personal-data";

/** Elements whose content is code or styling, never what a reply selector looks at. */
const DROPPED = new Set(["SCRIPT", "STYLE", "LINK"]);

/** Attributes holding text shown or read to the user: masked like text nodes. */
const TEXT_ATTRIBUTES = new Set(["alt", "title", "aria-label"]);

/** Attributes the reply selectors rely on: kept. */
function isKept(name: string): boolean {
    return name === "class" || name === "role" || name === "id" || name.startsWith("data-");
}

const UUID_WORD = new RegExp(`^${UUID.source}$`, "i");

/** A short lower case identifier: `assistant`, `message-actions`, `false`, `:r1:`. */
const IDENTIFIER = /^[a-z0-9_:.-]{1,40}$/;

/**
 * An `id` or `data-*` value as committed: kept when it is one identifier or a list of UUIDs
 * (mapped); otherwise it may be text or hold a token, and is masked, UUIDs mapped.
 */
function keptValue(value: string, ids: ZeroedIds): string {
    // A redacted token stays so, for a snapshot to be sanitised again unchanged.
    if (value === "REDACTED" || looksLikeToken(value)) return "REDACTED";
    const words = value.split(/\s+/).filter(Boolean);
    const structural =
        words.every((word) => UUID_WORD.test(word)) ||
        (words.length === 1 && IDENTIFIER.test(value));
    return structural ? ids.mapUuids(value) : maskAround(value, ids);
}

/**
 * Turns the recorded outerHTML of the element holding a conversation's replies into a DOM
 * snapshot safe to commit (see `test/fixtures/README.md`): `<script>`, `<style>` and `<link>`
 * are dropped and `<svg>` emptied, text and `alt` / `title` / `aria-label` values are masked,
 * UUIDs become zeroed ones, `class` and `role` are kept, `data-*` and `id` too unless their value
 * looks like text or a token (then masked), and every other attribute (inline `style`, `href`,
 * `src`…) is dropped. Pass the `ids` of the case's stream (`anonymiseStream`) to map the ids of
 * both alike.
 */
export function sanitiseSnapshot(html: string, ids = new ZeroedIds()): string {
    const window = new Window();
    try {
        const template = window.document.createElement("template");
        template.innerHTML = html;
        sanitise(template.content, ids);
        return template.innerHTML;
    } finally {
        void window.happyDOM.close();
    }
}

function sanitise(node: Node, ids: ZeroedIds): void {
    for (const child of [...node.childNodes]) {
        if (child.nodeType === Node.COMMENT_NODE || DROPPED.has(child.nodeName)) {
            node.removeChild(child);
        } else if (child.nodeType === Node.TEXT_NODE) {
            child.textContent = maskAround(child.textContent ?? "", ids);
        } else if (child instanceof Element) {
            sanitiseAttributes(child, ids);
            if (child.localName === "svg") child.replaceChildren();
            else sanitise(child, ids);
            // A template's content is not among its children.
            if (child instanceof HTMLTemplateElement) sanitise(child.content, ids);
        }
    }
}

function sanitiseAttributes(element: Element, ids: ZeroedIds): void {
    for (const { name, value: raw } of [...element.attributes]) {
        const value = raw ?? "";
        if (TEXT_ATTRIBUTES.has(name)) element.setAttribute(name, maskAround(value, ids));
        else if (!isKept(name)) element.removeAttribute(name);
        else if (name === "id" || name.startsWith("data-")) {
            element.setAttribute(name, keptValue(value, ids));
        }
    }
}
