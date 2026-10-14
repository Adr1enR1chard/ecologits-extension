import type { ImpactResult } from "../messaging";
import { ANY_REPLY, type ReplyAnchor } from "./anchor";

export interface MountedBadge {
    remove(): void;
}

/** Mounts the badge of `result` next to its reply. */
export type MountBadge = (anchor: ReplyAnchor, result: ImpactResult) => Promise<MountedBadge>;

export interface BadgeManagerOptions {
    /** Resolves where the badge of a reply goes, `null` when the reply is not found. */
    findAnchor: (messageId: string | null) => Promise<ReplyAnchor | null>;
    mount: MountBadge;
    enabled: boolean;
    debug?: (step: string, details?: unknown) => void;
}

export interface BadgeManager {
    /** Shows the badge of a reply, replacing the previous one for the same message. */
    show(result: ImpactResult): void;
    /** Removes every badge when disabled; shows the badges of this page again when enabled. */
    setEnabled(enabled: boolean): void;
}

/** Keeps track of the replies captured in this page and of their badges. */
export function createBadgeManager(options: BadgeManagerOptions): BadgeManager {
    const { findAnchor, mount, debug } = options;
    let enabled = options.enabled;
    let anonymous = 0;
    const results = new Map<string, ImpactResult>();
    const anchors = new Map<string, ReplyAnchor>();
    const badges = new Map<string, MountedBadge>();

    const isCurrent = (key: string, result: ImpactResult) => enabled && results.get(key) === result;

    async function mountBadge(key: string, result: ImpactResult): Promise<void> {
        let anchor = anchors.get(key);
        if (anchor === undefined) {
            const found = await findAnchor(result.messageId);
            if (found === null) {
                debug?.("badge anchor not found", {
                    messageId: result.messageId,
                    // Tells whether the page still renders replies the way the anchor expects.
                    repliesOnPage: document.querySelectorAll(ANY_REPLY).length,
                });
                return;
            }
            anchor = found;
            anchors.set(key, anchor);
        }
        if (!isCurrent(key, result)) return;
        const badge = await mount(anchor, result);
        // Disabled, or replaced by a newer result, while mounting.
        if (!isCurrent(key, result)) {
            badge.remove();
            return;
        }
        badges.get(key)?.remove();
        badges.set(key, badge);
        debug?.("badge mounted", anchor);
    }

    function safeMount(key: string, result: ImpactResult): void {
        mountBadge(key, result).catch((error: unknown) => debug?.("badge failed", error));
    }

    return {
        show(result) {
            if (result.impacts === null) return;
            const key = result.messageId ?? `anonymous-${++anonymous}`;
            results.set(key, result);
            if (enabled) safeMount(key, result);
        },
        setEnabled(value) {
            if (value === enabled) return;
            enabled = value;
            if (enabled) {
                for (const [key, result] of results) safeMount(key, result);
            } else {
                for (const badge of badges.values()) badge.remove();
                badges.clear();
            }
        },
    };
}
