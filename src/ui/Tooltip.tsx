import type { ComponentChildren } from "preact";
import { useId } from "preact/hooks";

const SIDES = {
    top: "bottom-full mb-1",
    bottom: "top-full mt-1",
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
}

/**
 * Shows `content` while `children` are hovered or focused. Tooltips must not be nested: the
 * `group` hover of an outer tooltip would also open the inner ones.
 */
export function Tooltip({ content, children, side = "top", align = "center" }: TooltipProps) {
    const id = useId();
    return (
        <span class="group relative inline-flex" tabIndex={0} aria-describedby={id}>
            {children}
            <span
                role="tooltip"
                id={id}
                class={`pointer-events-none invisible absolute z-10 w-max max-w-72 rounded-md bg-gray-900 px-2 py-1.5 text-left text-xs leading-snug font-normal whitespace-normal text-white opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100 ${SIDES[side]} ${ALIGNMENTS[align]}`}
            >
                {content}
            </span>
        </span>
    );
}
