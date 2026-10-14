import { describe, expect, it } from "vitest";
import { formatDateTime, formatImpact, formatNumber, formatRange } from "./format";

describe("formatImpact", () => {
    it("picks the largest unit the value reaches", () => {
        expect(formatImpact("energy", 0.00017, "en")).toBe("0.17\u00a0Wh");
        expect(formatImpact("energy", 1.5, "en")).toBe("1.5\u00a0kWh");
        expect(formatImpact("energy", 2500, "en")).toBe("2.5\u00a0MWh");
        expect(formatImpact("gwp", 0.00008, "en")).toBe("0.08\u00a0gCO₂eq");
        expect(formatImpact("gwp", 12.345, "en")).toBe("12.3\u00a0kgCO₂eq");
        expect(formatImpact("wcf", 0.25, "en")).toBe("250\u00a0mL");
        expect(formatImpact("pe", 0.002, "en")).toBe("2\u00a0kJ");
        expect(formatImpact("adpe", 3e-9, "en")).toBe("3\u00a0µgSbeq");
        expect(formatImpact("adpe", 2.42e-12, "en")).toBe("2.42\u00a0ngSbeq");
    });

    it("keeps the smallest unit for tinier values and zero", () => {
        expect(formatImpact("energy", 1.234e-8, "en")).toBe("0.0000123\u00a0Wh");
        expect(formatImpact("energy", 0, "en")).toBe("0\u00a0Wh");
        expect(formatImpact("gwp", 0, "en")).toBe("0\u00a0gCO₂eq");
    });

    it("uses the locale's decimal separator", () => {
        expect(formatImpact("energy", 0.00017, "fr")).toBe("0,17\u00a0Wh");
    });

    it("does not format non-finite values", () => {
        expect(formatImpact("energy", Number.NaN, "en")).toBe("–");
    });
});

describe("formatRange", () => {
    it("formats both bounds, or a scalar once", () => {
        expect(formatRange("energy", { min: 0.0001, median: 0.0002, max: 0.0003 }, "en")).toBe(
            "0.1\u00a0Wh – 0.3\u00a0Wh",
        );
        expect(formatRange("energy", { min: 0.0002, median: 0.0002, max: 0.0002 }, "en")).toBe(
            "0.2\u00a0Wh",
        );
    });
});

describe("formatNumber", () => {
    it("rounds to significant digits", () => {
        expect(formatNumber(1234.5678, "en")).toBe("1,230");
        expect(formatNumber(0.012345, "en", 2)).toBe("0.012");
    });
});

describe("formatDateTime", () => {
    it("formats a short local date and time", () => {
        expect(formatDateTime(new Date(2026, 9, 14, 9, 5).getTime(), "en-GB")).toBe(
            "14/10/2026, 09:05",
        );
    });
});
