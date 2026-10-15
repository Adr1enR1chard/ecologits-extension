import { describe, expect, it } from "vitest";
import { CRITERIA } from "../messaging";
import { EQUIVALENCES, computeEquivalences } from "./equivalences";

describe("EQUIVALENCES", () => {
    it("have unique ids", () => {
        const ids = EQUIVALENCES.map((e) => e.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it.each(EQUIVALENCES)("$id is sourced and positive", (e) => {
        expect(CRITERIA).toContain(e.criterion);
        expect(e.factor).toBeGreaterThan(0);
        expect(new URL(e.source).protocol).toBe("https:");
        expect(e.retrievedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
});

describe("computeEquivalences", () => {
    it("divides the value by each matching factor", () => {
        const equivalences = [
            { id: "carKm", criterion: "gwp", factor: 0.5, source: "", retrievedOn: "" },
            { id: "email", criterion: "energy", factor: 2, source: "", retrievedOn: "" },
        ] as const;
        expect(computeEquivalences("gwp", 2, equivalences)).toEqual([{ id: "carKm", count: 4 }]);
        expect(computeEquivalences("wcf", 2, equivalences)).toEqual([]);
    });
});
