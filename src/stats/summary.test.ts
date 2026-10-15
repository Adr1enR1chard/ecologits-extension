import { describe, expect, it } from "vitest";
import { addToAggregates, type DailyAggregates } from "../storage/aggregates";
import { impactResult, uniformImpacts } from "../test-utils";
import { emptyTotals, periodStart, summarize } from "./summary";

const now = new Date(2026, 9, 14, 12).getTime();

function daysAgo(days: number): number {
    return new Date(2026, 9, 14 - days, 12).getTime();
}

describe("periodStart", () => {
    it("includes today and the previous days of the period", () => {
        expect(periodStart("today", now)).toBe("2026-10-14");
        expect(periodStart("7d", now)).toBe("2026-10-08");
        expect(periodStart("30d", now)).toBe("2026-09-15");
        expect(periodStart("all", now)).toBeNull();
    });
});

describe("summarize", () => {
    let aggregates: DailyAggregates = {};
    for (const result of [
        impactResult({ timestamp: daysAgo(0) }),
        impactResult({
            timestamp: daysAgo(0),
            model: "gpt-4o",
            impacts: uniformImpacts(3),
            flags: { lowerBound: true, approximatedModel: false, partial: false },
        }),
        impactResult({ timestamp: daysAgo(6), provider: "claude", model: "claude-sonnet-4-5" }),
        impactResult({ timestamp: daysAgo(40) }),
    ]) {
        aggregates = addToAggregates(aggregates, result);
    }

    it("sums only the days of the period", () => {
        expect(summarize(aggregates, "today", now).total).toEqual({
            requests: 2,
            outputTokens: 200,
            lowerBoundRequests: 1,
            approximatedModelRequests: 0,
            partialRequests: 0,
            impacts: uniformImpacts(4),
        });
        expect(summarize(aggregates, "7d", now).total?.requests).toBe(3);
        expect(summarize(aggregates, "30d", now).total?.requests).toBe(3);
        expect(summarize(aggregates, "all", now).total?.requests).toBe(4);
    });

    it("breaks totals down by provider and model, by decreasing GHG emissions", () => {
        const summary = summarize(aggregates, "all", now);
        expect(summary.byProvider.map((p) => [p.provider, p.requests])).toEqual([
            ["chatgpt", 3],
            ["claude", 1],
        ]);
        expect(summary.byModel.map((m) => [m.model, m.impacts.total.gwp.median])).toEqual([
            ["gpt-4o", 3],
            ["gpt-5", 2],
            ["claude-sonnet-4-5", 1],
        ]);
    });

    it("returns no total for an empty period", () => {
        expect(summarize({}, "today", now)).toEqual({ total: null, byProvider: [], byModel: [] });
    });

    it("starts from zero impacts", () => {
        expect(emptyTotals().impacts.embodied.gwp).toEqual({ min: 0, median: 0, max: 0 });
    });
});
