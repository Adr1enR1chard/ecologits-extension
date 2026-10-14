import { render } from "preact";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { createShadowRootUi } from "wxt/utils/content-script-ui/shadow-root";
import { Badge } from "./Badge";
import type { MountBadge } from "./manager";
import { createPlacementKeeper } from "./placement";

/**
 * Mounts badges in a shadow root next to their reply, kept there while the page re-renders.
 * The entrypoint must import `badge.css` with `cssInjectionMode: "ui"`.
 */
export function shadowRootBadgeMount(ctx: ContentScriptContext, locale: string): MountBadge {
    const keeper = createPlacementKeeper(document);
    return async (anchor, result) => {
        const ui = await createShadowRootUi<HTMLElement>(ctx, {
            name: "ecologits-badge",
            position: "inline",
            // The placement keeper inserts the badge, once the reply is on the page.
            anchor: "html",
            append: () => undefined,
            onMount(container, _shadow, host) {
                // Match the text color around the reply, whatever the page theme.
                const reply = document.querySelector(anchor.selector);
                if (reply) host.style.setProperty("--ecologits-fg", getComputedStyle(reply).color);
                render(<Badge result={result} locale={locale} />, container);
                return container;
            },
            onRemove(container) {
                keeper.untrack(ui.shadowHost);
                if (container) render(null, container);
            },
        });
        ui.mount();
        keeper.track(ui.shadowHost, anchor);
        return ui;
    };
}
