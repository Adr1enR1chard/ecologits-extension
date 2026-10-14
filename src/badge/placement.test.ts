// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import type { ReplyAnchor } from "./anchor";
import { createPlacementKeeper as createKeeper, type PlacementKeeper } from "./placement";

const keepers: PlacementKeeper[] = [];
const tracked: Element[] = [];

function createPlacementKeeper(root: Document): PlacementKeeper {
    const keeper = createKeeper(root);
    keepers.push(keeper);
    return {
        track: (element, anchor) => {
            tracked.push(element);
            keeper.track(element, anchor);
        },
        untrack: (element) => keeper.untrack(element),
    };
}

function turn(id: string): { container: HTMLElement; reply: HTMLElement } {
    const container = document.createElement("div");
    const reply = document.createElement("div");
    reply.dataset.id = id;
    container.append(reply);
    document.body.append(container);
    return { container, reply };
}

const AFTER_A: ReplyAnchor = { selector: '[data-id="a"]', position: "after" };

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
    for (const keeper of keepers.splice(0)) {
        for (const element of tracked) keeper.untrack(element);
    }
    tracked.length = 0;
    document.body.replaceChildren();
});

describe("createPlacementKeeper", () => {
    it("places the element right after its anchor", () => {
        const { reply } = turn("a");
        const badge = document.createElement("span");
        createPlacementKeeper(document).track(badge, AFTER_A);
        expect(reply.nextElementSibling).toBe(badge);
    });

    it("moves the element to the new anchor when the page replaces the reply", async () => {
        const first = turn("a");
        const badge = document.createElement("span");
        createPlacementKeeper(document).track(badge, AFTER_A);

        first.container.remove();
        const second = turn("a");
        await settle();
        expect(second.reply.nextElementSibling).toBe(badge);
    });

    it("leaves untracked elements alone", async () => {
        const first = turn("a");
        const badge = document.createElement("span");
        const keeper = createPlacementKeeper(document);
        keeper.track(badge, AFTER_A);
        keeper.untrack(badge);

        first.container.remove();
        const second = turn("a");
        await settle();
        expect(second.reply.nextElementSibling).toBeNull();
    });

    it("stacks elements sharing an anchor", async () => {
        const first = turn("a");
        const keeper = createPlacementKeeper(document);
        const badges = [document.createElement("span"), document.createElement("b")];
        for (const badge of badges) keeper.track(badge, AFTER_A);
        expect([...first.container.children]).toEqual([first.reply, ...badges]);

        first.container.remove();
        const second = turn("a");
        await settle();
        expect([...second.container.children]).toEqual([second.reply, ...badges]);
    });

    it("places the element before its anchor, once the anchor is on the page", async () => {
        const badges = [document.createElement("span"), document.createElement("b")];
        const keeper = createPlacementKeeper(document);
        for (const badge of badges) {
            keeper.track(badge, { selector: '[data-id="actions"]', position: "before" });
        }
        expect(badges.map((b) => b.isConnected)).toEqual([false, false]);

        const { container, reply: actions } = turn("actions");
        await settle();
        expect([...container.children]).toEqual([...badges.reverse(), actions]);
    });
});
