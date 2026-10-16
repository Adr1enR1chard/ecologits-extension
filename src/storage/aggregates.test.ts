import { describe, expect, it } from "vitest";
import { impactResult, uniformImpacts } from "../test-utils";
import { addToAggregates, aggregateKey, toLocalDate } from "./aggregates";

describe("toLocalDate", () => {
    it("formats the local calendar date", () => {
        expect(toLocalDate(new Date(2026, 0, 5, 23, 59).getTime())).toBe("2026-01-05");
    });
});

describe("addToAggregates", () => {
    const key = aggregateKey("2026-10-14", "chatgpt", "gpt-5");

    it("creates an entry for a new day, provider and model", () => {
        const aggregates = addToAggregates(
            {},
            impactResult({ flags: { lowerBound: true, approximatedModel: false, partial: true } }),
        );
        expect(aggregates).toEqual({
            [key]: {
                date: "2026-10-14",
                provider: "chatgpt",
                model: "gpt-5",
                requests: 1,
                outputTokens: 100,
                lowerBoundRequests: 1,
                approximatedModelRequests: 0,
                partialRequests: 1,
                impacts: uniformImpacts(1),
            },
        });
    });

    it("sums min, median and max of every criterion", () => {
        const first = addToAggregates({}, impactResult());
        const aggregates = addToAggregates(
            first,
            impactResult({
                outputTokens: 50,
                impacts: uniformImpacts(2),
                flags: { lowerBound: false, approximatedModel: true, partial: false },
            }),
        );
        expect(aggregates[key]).toMatchObject({
            requests: 2,
            outputTokens: 150,
            lowerBoundRequests: 0,
            approximatedModelRequests: 1,
            partialRequests: 0,
            impacts: uniformImpacts(3),
        });
        // Inputs are not mutated.
        expect(first[key]!.impacts).toEqual(uniformImpacts(1));
    });

    it("sums a range of models apart from its ends, keeping it structured", () => {
        const range = { low: "gpt-6-luna", high: "gpt-6-sol" };
        let aggregates = addToAggregates({}, impactResult({ model: "gpt-6-luna" }));
        aggregates = addToAggregates(aggregates, impactResult({ model: range }));
        aggregates = addToAggregates(aggregates, impactResult({ model: range }));
        expect(aggregates[aggregateKey("2026-10-14", "chatgpt", range)]).toMatchObject({
            model: range,
            requests: 2,
        });
        expect(aggregates[aggregateKey("2026-10-14", "chatgpt", "gpt-6-luna")]?.requests).toBe(1);
    });

    it("keeps days and models apart", () => {
        let aggregates = addToAggregates({}, impactResult());
        aggregates = addToAggregates(aggregates, impactResult({ model: "gpt-4o" }));
        aggregates = addToAggregates(
            aggregates,
            impactResult({ timestamp: new Date(2026, 9, 15, 9).getTime() }),
        );
        expect(Object.keys(aggregates).sort()).toEqual([
            "2026-10-14/chatgpt/gpt-4o",
            "2026-10-14/chatgpt/gpt-5",
            "2026-10-15/chatgpt/gpt-5",
        ]);
    });

    it("ignores results without impacts", () => {
        expect(addToAggregates({}, impactResult({ impacts: null }))).toEqual({});
    });
});
