import { storage } from "wxt/utils/storage";
import type { ImpactResult } from "../messaging";
import { addToAggregates, aggregatesItem } from "./aggregates";
import { appendEvent, eventsItem } from "./events";
import { adapterStatusItem } from "./health";
import { serialize } from "./schema";

/**
 * Adds a result to the daily aggregates and the rolling event log, in a single write.
 * Returns `false` when there is nothing to record or the reply was already recorded.
 */
export function recordImpact(result: ImpactResult): Promise<boolean> {
    if (result.impacts === null) return Promise.resolve(false);
    return serialize(async () => {
        const [aggregates, events] = await Promise.all([
            aggregatesItem.getValue(),
            eventsItem.getValue(),
        ]);
        const alreadyRecorded =
            result.messageId !== null &&
            events.some((e) => e.provider === result.provider && e.messageId === result.messageId);
        if (alreadyRecorded) return false;
        await storage.setItems([
            { item: aggregatesItem, value: addToAggregates(aggregates, result) },
            { item: eventsItem, value: appendEvent(events, result) },
        ]);
        return true;
    });
}

/**
 * Deletes the recorded usage (aggregates, event log, adapter status); settings are kept.
 * Only call it from the background (`clear-usage-data` message): {@link serialize} orders writes
 * within one JS context, so a clear from an extension page could be overwritten by a reply the
 * background is recording.
 */
export function clearUsageData(): Promise<void> {
    return serialize(() => storage.removeItems([aggregatesItem, eventsItem, adapterStatusItem]));
}
