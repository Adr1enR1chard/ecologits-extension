import type { ComponentChildren } from "preact";
import { useEffect, useId, useState } from "preact/hooks";

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
 * Shows `content` while `children` are hovered or focused, until Escape is pressed. Tooltips must
 * not be nested: the `group` hover of an outer tooltip would also open the inner ones.
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
    const [hovered, setHovered] = useState(false);
    const [dismissed, setDismissed] = useState(false);

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
                role="tooltip"
                id={id}
                class={`invisible absolute z-10 w-max max-w-72 opacity-0 transition-opacity ${
                    dismissed
                        ? "hidden"
                        : `group-hover:visible group-hover:opacity-100 ${
                              focusable
                                  ? "group-focus-visible:visible group-focus-visible:opacity-100"
                                  : "group-has-focus-visible:visible group-has-focus-visible:opacity-100"
                          }`
                } ${SIDES[side]} ${ALIGNMENTS[align]}`}
            >
                <span class="block rounded-md border border-line bg-raised px-2.5 py-2 text-left text-xs leading-snug font-normal whitespace-normal text-fg shadow-lg">
                    {content}
                </span>
            </span>
        </span>
    );
}
