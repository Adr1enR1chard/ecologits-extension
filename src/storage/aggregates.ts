import { storage } from "wxt/utils/storage";
import {
    CRITERIA,
    EMBODIED_CRITERIA,
    type ImpactRange,
    modelLabel,
    type EcoLogitsModel,
    type ImpactResult,
    type Impacts,
    type WebProvider,
} from "../messaging";
import { SCHEMA_VERSION } from "./schema";

/** Sums for one day, provider and EcoLogits model. */
export interface DailyAggregate {
    /** Local date, `YYYY-MM-DD`. */
    date: string;
    provider: WebProvider;
    model: EcoLogitsModel;
    requests: number;
    outputTokens: number;
    lowerBoundRequests: number;
    approximatedModelRequests: number;
    partialRequests: number;
    /** Sum of each bound (min, median, max) over the requests. */
    impacts: Impacts;
}

/** Keyed by {@link aggregateKey}. */
export type DailyAggregates = Record<string, DailyAggregate>;

export const aggregatesItem = storage.defineItem<DailyAggregates>("local:aggregates", {
    fallback: {},
    version: SCHEMA_VERSION,
    migrations: {
        // v2: replies stopped by the user are recorded, flagged as partial.
        2: (aggregates: DailyAggregates): DailyAggregates =>
            Object.fromEntries(
                Object.entries(aggregates).map(([key, a]) => [key, { ...a, partialRequests: 0 }]),
            ),
    },
});

/** Local calendar date of a timestamp, `YYYY-MM-DD`. */
export function toLocalDate(timestamp: number): string {
    const date = new Date(timestamp);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
}

export function aggregateKey(date: string, provider: WebProvider, model: EcoLogitsModel): string {
    return `${date}/${provider}/${modelLabel(model)}`;
}

function addRange(a: ImpactRange, b: ImpactRange): ImpactRange {
    return { min: a.min + b.min, median: a.median + b.median, max: a.max + b.max };
}

function addPhase<K extends string>(
    criteria: readonly K[],
    a: Record<K, ImpactRange>,
    b: Record<K, ImpactRange>,
): Record<K, ImpactRange> {
    return Object.fromEntries(criteria.map((c) => [c, addRange(a[c], b[c])])) as Record<
        K,
        ImpactRange
    >;
}

export function addImpacts(a: Impacts, b: Impacts): Impacts {
    return {
        total: addPhase(CRITERIA, a.total, b.total),
        usage: addPhase(CRITERIA, a.usage, b.usage),
        embodied: addPhase(EMBODIED_CRITERIA, a.embodied, b.embodied),
    };
}

/** Returns a copy of `aggregates` including `result`. Results without impacts are ignored. */
export function addToAggregates(
    aggregates: DailyAggregates,
    result: ImpactResult,
): DailyAggregates {
    if (result.impacts === null) return aggregates;
    const date = toLocalDate(result.timestamp);
    const key = aggregateKey(date, result.provider, result.model);
    const previous = aggregates[key];
    const lowerBound = result.flags.lowerBound ? 1 : 0;
    const approximated = result.flags.approximatedModel ? 1 : 0;
    const partial = result.flags.partial ? 1 : 0;
    const next: DailyAggregate = previous
        ? {
              ...previous,
              requests: previous.requests + 1,
              outputTokens: previous.outputTokens + result.outputTokens,
              lowerBoundRequests: previous.lowerBoundRequests + lowerBound,
              approximatedModelRequests: previous.approximatedModelRequests + approximated,
              partialRequests: previous.partialRequests + partial,
              impacts: addImpacts(previous.impacts, result.impacts),
          }
        : {
              date,
              provider: result.provider,
              model: result.model,
              requests: 1,
              outputTokens: result.outputTokens,
              lowerBoundRequests: lowerBound,
              approximatedModelRequests: approximated,
              partialRequests: partial,
              impacts: result.impacts,
          };
    return { ...aggregates, [key]: next };
}

export function getAggregates(): Promise<DailyAggregates> {
    return aggregatesItem.getValue();
}
