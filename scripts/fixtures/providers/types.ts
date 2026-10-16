import type { ObjectNode } from "../json-tree";

/**
 * How to anonymise one provider's streams. A value is classified by its key: the nearest object
 * key above it (array indices are skipped), or the SSE event name for the event's root value.
 * Values under no listed key are masked.
 */
export interface FixtureRules {
    /** Keys whose values drive the parser, not the conversation: kept. */
    structural: ReadonlySet<string>;
    /** Keys holding ids, whatever their form: mapped to zeroed UUIDs. */
    ids: ReadonlySet<string>;
    /** Keys holding tokens: replaced with `REDACTED`. */
    tokens: ReadonlySet<string>;
    /** Keys holding account details: every string below becomes `REDACTED`, every number 0. */
    account: ReadonlySet<string>;
    /**
     * Event types sent at any time to keep the connection open (`ping`): left out of the drift
     * check (`pnpm fixtures:drift`), since when and whether they come is a matter of timing.
     */
    keepAlive?: ReadonlySet<string>;
    /**
     * Returns, for each stream, the key a value stands for when its own key does not say what
     * it holds, e.g. the `v` of a JSON-patch operation stands for the last segment of its path.
     */
    keyResolver?: () => (object: ObjectNode, key: string) => string;
}
