import type { ComponentChildren } from "preact";
import { useEffect, useId, useRef, useState } from "preact/hooks";
import { keepInBounds } from "./keepInBounds";

// Padding rather than margin between trigger and bubble, so the pointer can move onto the bubble.
const SIDES = {
    top: "bottom-full pb-1",
    bottom: "top-full pt-1",
} as const;

const ALIGNMENTS = {
    start: "left-0",
    center: "left-1/2 -translate-x-1/2",
    end: "right-0",
} as const;

interface TooltipProps {
    content: ComponentChildren;
    children: ComponentChildren;
    side?: keyof typeof SIDES;
    align?: keyof typeof ALIGNMENTS;
    /**
     * Whether the trigger is made focusable. `false` when `children` are focusable themselves (a
     * button), which then name themselves: the tooltip opens while they have the keyboard focus.
     */
    focusable?: boolean;
    /**
     * Whether the tooltip describes the trigger to screen readers. `false` when the trigger already
     * holds the same text, e.g. as an `sr-only` label, so it is not announced twice.
     */
    describes?: boolean;
    class?: string;
}

/**
 * Shows `content` while `children` are hovered or focused, until Escape is pressed, kept inside
 * its `main`, or the viewport, whatever `align` asks. Tooltips must not be nested: the `group`
 * hover of an outer tooltip would also open the inner ones.
 *
 * A closed tooltip is not displayed rather than invisible: an invisible box still takes room, and
 * would widen the popup when it overflows.
 */
export function Tooltip({
    content,
    children,
    side = "top",
    align = "center",
    focusable = true,
    describes = true,
    class: className,
}: TooltipProps) {
    const id = useId();
    const tooltip = useRef<HTMLSpanElement>(null);
    const [hovered, setHovered] = useState(false);
    const [dismissed, setDismissed] = useState(false);
    const opens = `group-hover:block ${
        focusable ? "group-focus-visible:block" : "group-has-focus-visible:block"
    }`;

    // CSS opens the tooltip, so it is placed whenever its box changes, before it is painted: when
    // it is displayed, its content changes, or its trigger or its `main` is resized.
    useEffect(() => {
        const element = tooltip.current;
        if (!element) return;
        const observer = new ResizeObserver(() => keepInBounds(element));
        observer.observe(element);
        observer.observe(element.parentElement!);
        const main = element.closest("main");
        if (main) observer.observe(main);
        return () => observer.disconnect();
    }, []);

    // Escape dismisses a hovered tooltip too, wherever the focus is.
    useEffect(() => {
        if (!hovered) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setDismissed(true);
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [hovered]);

    return (
        <span
            class={`group relative inline-flex rounded-sm ${focusable ? "focus-ring" : ""} ${className ?? ""}`}
            tabIndex={focusable ? 0 : undefined}
            aria-describedby={focusable && describes ? id : undefined}
            onMouseEnter={() => {
                setHovered(true);
                setDismissed(false);
            }}
            onMouseLeave={() => setHovered(false)}
            onFocusIn={() => setDismissed(false)}
            onKeyDown={(event) => {
                if (event.key === "Escape") setDismissed(true);
            }}
        >
            {children}
            <span
                ref={tooltip}
                role="tooltip"
                id={id}
                data-dismissed={dismissed || undefined}
                // Hidden at once, no fade-out: a fading tooltip would still take room. The bubble
                // fades in once it is displayed, where `@starting-style` is supported.
                class={`absolute z-10 hidden w-max max-w-72 ${dismissed ? "" : opens} ${
                    SIDES[side]
                } ${ALIGNMENTS[align]}`}
            >
                <span class="block rounded-md border border-line bg-raised px-2.5 py-2 text-left text-xs leading-snug font-normal whitespace-normal text-fg shadow-lg transition-opacity starting:opacity-0">
                    {content}
                </span>
            </span>
        </span>
    );
}
