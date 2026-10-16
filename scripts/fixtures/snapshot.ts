import { Element, Node, Window } from "happy-dom";
import { looksLikeToken, maskAround, ZeroedIds } from "./personal-data";

/** Elements whose content is code or styling, never what a reply selector looks at. */
const DROPPED = new Set(["SCRIPT", "STYLE", "LINK"]);

/** Attributes holding text shown or read to the user: masked like text nodes. */
const TEXT_ATTRIBUTES = new Set(["alt", "title", "aria-label"]);

/** Attributes the reply selectors rely on: kept, with their ids mapped. */
function isKept(name: string): boolean {
    return name === "class" || name === "role" || name === "id" || name.startsWith("data-");
}

/**
 * Turns the recorded outerHTML of the element holding a conversation's replies into a DOM
 * snapshot safe to commit (see `test/fixtures/README.md`): `<script>`, `<style>` and `<link>`
 * are dropped and `<svg>` emptied, text and `alt` / `title` / `aria-label` values are masked,
 * UUIDs become zeroed ones, `data-*`, `class`, `role` and `id` are kept and every other
 * attribute (inline `style`, `href`, `src`…) is dropped. Pass the `ids` of the case's stream
 * (`anonymiseStream`) to map the ids of both alike.
 */
export function sanitiseSnapshot(html: string, ids = new ZeroedIds()): string {
    const { document } = new Window();
    const template = document.createElement("template");
    template.innerHTML = html;
    sanitise(template.content, ids);
    return template.innerHTML;
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
        }
    }
}

function sanitiseAttributes(element: Element, ids: ZeroedIds): void {
    for (const { name, value: raw } of [...element.attributes]) {
        const value = raw ?? "";
        if (TEXT_ATTRIBUTES.has(name)) element.setAttribute(name, maskAround(value, ids));
        else if (!isKept(name)) element.removeAttribute(name);
        else if (looksLikeToken(value)) element.setAttribute(name, "REDACTED");
        else element.setAttribute(name, ids.mapUuids(value));
    }
}
