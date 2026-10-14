import { describe, expect, it, vi } from "vitest";
import type { ImpactResult } from "../messaging";
import { impactResult } from "../test-utils";
import type { ReplyAnchor } from "./anchor";
import { createBadgeManager, type MountBadge } from "./manager";

const REPLY: ReplyAnchor = { selector: "#reply", position: "after" };

function setup(enabled = true, anchor: ReplyAnchor | null = REPLY) {
    const removed: string[] = [];
    const mounted: string[] = [];
    const mount = vi.fn<MountBadge>(async (_anchor, result) => {
        const id = `${result.messageId}@${result.outputTokens}`;
        mounted.push(id);
        return { remove: () => removed.push(id) };
    });
    const findAnchor = vi.fn(async () => anchor);
    const manager = createBadgeManager({ findAnchor, mount, enabled });
    return { manager, mount, findAnchor, mounted, removed };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createBadgeManager", () => {
    it("mounts a badge next to the reply", async () => {
        const { manager, mount, findAnchor } = setup();
        const result = impactResult();
        manager.show(result);
        await flush();
        expect(findAnchor).toHaveBeenCalledWith("msg-1");
        expect(mount).toHaveBeenCalledWith(REPLY, result);
    });

    it("skips results without impacts or without reply on the page", async () => {
        const { manager, mount } = setup();
        manager.show(impactResult({ impacts: null }));
        const lost = setup(true, null);
        lost.manager.show(impactResult());
        await flush();
        expect(mount).not.toHaveBeenCalled();
        expect(lost.mount).not.toHaveBeenCalled();
    });

    it("replaces the badge of the same message", async () => {
        const { manager, mounted, removed } = setup();
        manager.show(impactResult({ outputTokens: 1 }));
        await flush();
        manager.show(impactResult({ outputTokens: 2 }));
        await flush();
        expect(mounted).toEqual(["msg-1@1", "msg-1@2"]);
        expect(removed).toEqual(["msg-1@1"]);
    });

    it("removes badges when disabled and shows them again when enabled", async () => {
        const { manager, mount, findAnchor, mounted, removed } = setup();
        manager.show(impactResult({ messageId: "a" }));
        manager.show(impactResult({ messageId: null }));
        await flush();
        manager.setEnabled(false);
        expect(removed).toEqual(["a@100", "null@100"]);

        manager.show(impactResult({ messageId: "b" }));
        await flush();
        expect(mount).toHaveBeenCalledTimes(2);

        manager.setEnabled(true);
        await flush();
        expect(mounted).toEqual(["a@100", "null@100", "a@100", "null@100", "b@100"]);
        // Anchors are resolved once per reply.
        expect(findAnchor).toHaveBeenCalledTimes(3);
    });

    it("drops a badge disabled while it was mounting", async () => {
        let finish: (() => void) | undefined;
        const remove = vi.fn();
        const manager = createBadgeManager({
            enabled: true,
            findAnchor: async () => REPLY,
            mount: (_anchor: ReplyAnchor, _result: ImpactResult) =>
                new Promise((resolve) => {
                    finish = () => resolve({ remove });
                }),
        });
        manager.show(impactResult());
        await flush();
        manager.setEnabled(false);
        finish!();
        await flush();
        expect(remove).toHaveBeenCalledOnce();
    });
});
