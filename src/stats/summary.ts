import {
    CRITERIA,
    EMBODIED_CRITERIA,
    type CriterionImpacts,
    modelLabel,
    type EcoLogitsModel,
    type ImpactRange,
    type Impacts,
    type WebProvider,
} from "../messaging";
import { addImpacts, toLocalDate, type DailyAggregates } from "../storage/aggregates";

export const PERIODS = ["today", "7d", "30d", "all"] as const;
export type Period = (typeof PERIODS)[number];

const PERIOD_DAYS: Readonly<Record<Exclude<Period, "all">, number>> = {
    today: 1,
    "7d": 7,
    "30d": 30,
};

export interface Totals {
    requests: number;
    outputTokens: number;
    lowerBoundRequests: number;
    approximatedModelRequests: number;
    partialRequests: number;
    impacts: Impacts;
}

export interface ProviderTotals extends Totals {
    provider: WebProvider;
}

export interface ModelTotals extends Totals {
    provider: WebProvider;
    model: EcoLogitsModel;
}

export interface UsageSummary {
    /** `null` when nothing was recorded over the period. */
    total: Totals | null;
    /** Sorted by decreasing median GHG emissions. */
    byProvider: ProviderTotals[];
    /** Sorted by decreasing median GHG emissions. */
    byModel: ModelTotals[];
}

const ZERO: ImpactRange = { min: 0, median: 0, max: 0 };

function zeroPhase<K extends string>(criteria: readonly K[]): Record<K, ImpactRange> {
    return Object.fromEntries(criteria.map((c) => [c, ZERO])) as Record<K, ImpactRange>;
}

export function emptyTotals(): Totals {
    return {
        requests: 0,
        outputTokens: 0,
        lowerBoundRequests: 0,
        approximatedModelRequests: 0,
        partialRequests: 0,
        impacts: {
            total: zeroPhase(CRITERIA) as CriterionImpacts,
            usage: zeroPhase(CRITERIA) as CriterionImpacts,
            embodied: zeroPhase(EMBODIED_CRITERIA),
        },
    };
}

function addTotals<T extends Totals>(a: T, b: Totals): T {
    return {
        ...a,
        requests: a.requests + b.requests,
        outputTokens: a.outputTokens + b.outputTokens,
        lowerBoundRequests: a.lowerBoundRequests + b.lowerBoundRequests,
        approximatedModelRequests: a.approximatedModelRequests + b.approximatedModelRequests,
        partialRequests: a.partialRequests + b.partialRequests,
        impacts: addImpacts(a.impacts, b.impacts),
    };
}

/** First local date included in the period, `YYYY-MM-DD`, or `null` for all time. */
export function periodStart(period: Period, now: number = Date.now()): string | null {
    if (period === "all") return null;
    const start = new Date(now);
    start.setDate(start.getDate() - (PERIOD_DAYS[period] - 1));
    return toLocalDate(start.getTime());
}

function byGwp(a: Totals, b: Totals): number {
    return b.impacts.total.gwp.median - a.impacts.total.gwp.median;
}

/** Sums the daily aggregates of the period, overall, per provider and per model. */
export function summarize(
    aggregates: DailyAggregates,
    period: Period,
    now: number = Date.now(),
): UsageSummary {
    const start = periodStart(period, now);
    const providers = new Map<WebProvider, ProviderTotals>();
    const models = new Map<string, ModelTotals>();
    let total: Totals | null = null;
    for (const aggregate of Object.values(aggregates)) {
        if (start !== null && aggregate.date < start) continue;
        const { provider, model } = aggregate;
        total = addTotals(total ?? emptyTotals(), aggregate);
        providers.set(
            provider,
            addTotals(providers.get(provider) ?? { ...emptyTotals(), provider }, aggregate),
        );
        const key = `${provider}/${modelLabel(model)}`;
        models.set(
            key,
            addTotals(models.get(key) ?? { ...emptyTotals(), provider, model }, aggregate),
        );
    }
    return {
        total,
        byProvider: [...providers.values()].sort(byGwp),
        byModel: [...models.values()].sort(byGwp),
    };
}
