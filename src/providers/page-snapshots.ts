import type { SupportedProvider } from "./registry";

/** A DOM snapshot of a provider's conversation page, `test/fixtures/<provider>/<file>`. */
export interface PageSnapshot {
    /** `<case>.html` under `test/fixtures/<provider>/`. */
    file: string;
    /** Index in `PAGES[provider].markups` of the markup the snapshot is rendered with. */
    markup: number;
    /** Removes what the badge anchor depends on (action bar, reply id…): the anchor must be lost. */
    breakAnchor(root: ParentNode): void;
}

const remove = (selector: string) => (root: ParentNode) =>
    root.querySelectorAll(selector).forEach((element) => element.remove());

/**
 * The DOM snapshots of each supported provider, replayed by `src/providers/<id>/page.test.ts`.
 * Every markup of `PAGES[<id>]` has at least one (`src/providers/registry.test.ts`).
 */
export const PAGE_SNAPSHOTS: Readonly<Record<SupportedProvider, readonly PageSnapshot[]>> = {
    chatgpt: [
        // Logged in: the badge goes after the reply block, found by its id.
        {
            file: "normal-reply.html",
            markup: 0,
            breakAnchor: (root) =>
                root
                    .querySelectorAll("[data-chatgpt-selection-message-id]")
                    .forEach((reply) => reply.removeAttribute("data-chatgpt-selection-message-id")),
        },
        {
            file: "logged-out-reply.html",
            markup: 1,
            breakAnchor: remove("[data-assistant-message-actions]"),
        },
    ],
    claude: [
        {
            file: "normal-reply.html",
            markup: 0,
            breakAnchor: remove('[data-testid="message-actions"]'),
        },
    ],
};
