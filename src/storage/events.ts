import { storage } from "wxt/utils/storage";
import type { ImpactResult } from "../messaging";
import { SCHEMA_VERSION } from "./schema";

export const MAX_EVENTS = 500;

/** Oldest first. */
export const eventsItem = storage.defineItem<ImpactResult[]>("local:events", {
    fallback: [],
    version: SCHEMA_VERSION,
    migrations: {
        // v2: replies stopped by the user are recorded, flagged as partial.
        2: (events: ImpactResult[]): ImpactResult[] =>
            events.map((e) => ({ ...e, flags: { ...e.flags, partial: false } })),
    },
});

/** Returns a copy of `events` with `event` appended, keeping only the newest `max` events. */
export function appendEvent(
    events: readonly ImpactResult[],
    event: ImpactResult,
    max: number = MAX_EVENTS,
): ImpactResult[] {
    return [...events, event].slice(-max);
}

export function getEvents(): Promise<ImpactResult[]> {
    return eventsItem.getValue();
}
