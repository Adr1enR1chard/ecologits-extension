import type { ReplyAnchor } from "./anchor";

export interface PlacementKeeper {
    /** Places `element` next to its anchor as soon as it is on the page, and keeps it there. */
    track(element: Element, anchor: ReplyAnchor): void;
    untrack(element: Element): void;
}

/**
 * Keeps badges next to their reply while the page re-renders. The page may replace a reply
 * and its container (e.g. when the stream ends), which drops the badge with the old container;
 * the selector then matches the new element, where the badge is moved back. A badge whose reply
 * is not on the page (another conversation) stays detached until the reply comes back.
 */
export function createPlacementKeeper(root: Document): PlacementKeeper {
    const tracked = new Map<Element, ReplyAnchor>();
    let scheduled = false;

    const sibling = (element: Element, position: ReplyAnchor["position"]) =>
        position === "after" ? element.nextElementSibling : element.previousElementSibling;

    /** Farthest tracked element on that side of `anchor` (stopping at `until`), or `anchor`. */
    const chainEnd = (anchor: Element, position: ReplyAnchor["position"], until?: Element) => {
        let end = anchor;
        let next = sibling(anchor, position);
        while (next !== null && next !== until && tracked.has(next)) {
            end = next;
            next = sibling(next, position);
        }
        return end;
    };

    /** `element` is still in the chain of tracked elements next to an element matching its anchor. */
    const isPlaced = (element: Element, { selector, position }: ReplyAnchor) => {
        if (!element.isConnected) return false;
        const towardsAnchor = position === "after" ? "before" : "after";
        let previous = sibling(element, towardsAnchor);
        while (previous !== null && tracked.has(previous))
            previous = sibling(previous, towardsAnchor);
        return previous?.matches(selector) ?? false;
    };

    // Several badges may share a reply: they stack next to it instead of fighting for its side.
    const place = () => {
        scheduled = false;
        for (const [element, anchorSpec] of tracked) {
            // Cheap check first: this runs on every page mutation, e.g. each streamed token.
            if (isPlaced(element, anchorSpec)) continue;
            const { selector, position } = anchorSpec;
            const anchor = root.querySelector(selector);
            if (anchor === null) continue;
            if (sibling(chainEnd(anchor, position, element), position) === element) continue;
            const end = chainEnd(anchor, position);
            if (position === "after") end.after(element);
            else end.before(element);
        }
    };
    const observer = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        queueMicrotask(place);
    });

    return {
        track(element, anchor) {
            if (tracked.size === 0) observer.observe(root, { childList: true, subtree: true });
            tracked.set(element, anchor);
            place();
        },
        untrack(element) {
            tracked.delete(element);
            if (tracked.size === 0) observer.disconnect();
        },
    };
}
