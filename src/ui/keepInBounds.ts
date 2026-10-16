/** Minimum room, in pixels, kept between an open tooltip and the edges of its bounds. */
export const EDGE_MARGIN = 4;

/** The parent of `element`, crossing out of its shadow root: badges live in one. */
function parentOf(element: Element): Element | null {
    if (element.parentElement) return element.parentElement;
    const root = element.getRootNode();
    return root instanceof ShadowRoot ? root.host : null;
}

/**
 * The horizontal room a tooltip may take: its `main`, or else the viewport, narrowed down to the
 * ancestors that clip it. Not the viewport alone: the popup window takes the width of its
 * content, so it already includes an overflowing tooltip by the time the tooltip is measured.
 * Badges live in a shadow root, out of reach of the page's own `main`, inside page containers
 * that may clip them.
 */
function horizontalBounds(tooltip: HTMLElement): { left: number; right: number } {
    const main = tooltip.closest("main");
    if (main) return main.getBoundingClientRect();
    let left = 0;
    let right = document.documentElement.clientWidth;
    for (let node = parentOf(tooltip); node; node = parentOf(node)) {
        if (getComputedStyle(node).overflowX === "visible") continue;
        const box = node.getBoundingClientRect();
        left = Math.max(left, box.left);
        right = Math.min(right, box.right);
    }
    return { left, right };
}

/**
 * Keeps an open tooltip inside its bounds: a tooltip that overflows on the left is cut off, on the
 * right it widens the popup, sized to its content. Narrowed first when it is wider than its
 * bounds, then shifted sideways. Placed with `left`, not a transform: the room a box takes is not
 * updated when only its transform changes.
 */
export function keepInBounds(tooltip: HTMLElement) {
    Object.assign(tooltip.style, { left: "", right: "", translate: "", maxWidth: "" });
    if (tooltip.getBoundingClientRect().width === 0) return; // Closed: not displayed.
    const edges = horizontalBounds(tooltip);
    const minLeft = edges.left + EDGE_MARGIN;
    const maxRight = edges.right - EDGE_MARGIN;
    const trigger = tooltip.parentElement!;
    const box = trigger.getBoundingClientRect();
    // Measured in viewport pixels, placed in CSS pixels: they differ under a transform or zoom.
    // Not `offsetWidth`, rounded to whole pixels. The computed width is the border box, like the
    // measure.
    const cssWidth = parseFloat(getComputedStyle(trigger).width);
    const scale = cssWidth > 0 ? box.width / cssWidth : 1;
    if (tooltip.getBoundingClientRect().width > maxRight - minLeft)
        tooltip.style.maxWidth = `${Math.max(maxRight - minLeft, 0) / scale}px`;
    // Measured again: a narrowed tooltip wraps its text, and may move when centered.
    const { left, right } = tooltip.getBoundingClientRect();
    const shift = left < minLeft ? minLeft - left : right > maxRight ? maxRight - right : 0;
    if (shift === 0) return;
    Object.assign(tooltip.style, {
        left: `${(left + shift - box.left) / scale}px`,
        right: "auto",
        translate: "none",
    });
}
