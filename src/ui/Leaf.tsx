/** The EcoLogits leaf, also drawn in the extension icon (`assets/icon.svg`). */
export const LEAF_PATH =
    "M14 2c-6.5 0-11 2.6-11 7.3 0 1.2.4 2.3 1 3.1L2.3 14l1 1 1.7-1.7c.8.6 1.9 1 3.1 1C12.6 14.3 14 9 14 2Zm-8.4 9.8-.5-.5C7 9.4 9 7.8 11.4 6.6 9.3 8 7.3 9.7 5.6 11.8Z";

export function LeafIcon({ class: className = "size-3" }: { class?: string }) {
    return (
        <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            class={`shrink-0 ${className}`}
            fill="currentColor"
        >
            <path d={LEAF_PATH} />
        </svg>
    );
}

/** The leaf on its dark green tile, as in the extension icon. */
export function LogoMark() {
    return (
        <span
            aria-hidden="true"
            class="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-brand-ink text-brand"
        >
            <LeafIcon class="size-4" />
        </span>
    );
}
