import { ECOLOGITS_VERSION } from "@ecologits/ecologits.js";
import { describe, expect, it } from "vitest";
import { impactResult } from "../test-utils";
import { addToAggregates } from "./aggregates";
import { aggregatesToCsv, eventsToCsv, toJsonExport } from "./export";
import { SCHEMA_VERSION } from "./schema";

function parseCsv(csv: string): string[] {
    expect(csv.endsWith("\r\n")).toBe(true);
    return csv.slice(0, -2).split("\r\n");
}

describe("aggregatesToCsv", () => {
    it("writes a header and one row per aggregate", () => {
        const aggregates = addToAggregates({}, impactResult());
        const [header, row, ...rest] = parseCsv(aggregatesToCsv(aggregates));
        const columns = header!.split(",");
        expect(columns.slice(0, 7)).toEqual([
            "date",
            "provider",
            "model",
            "requests",
            "output_tokens",
            "lower_bound_requests",
            "approximated_model_requests",
        ]);
        expect(columns).toContain("total_energy_kWh_median");
        expect(columns).toContain("embodied_gwp_kgCO2eq_max");
        // 5 total + 5 usage + 3 embodied criteria, 3 bounds each.
        expect(columns).toHaveLength(7 + 13 * 3);
        const cells = row!.split(",");
        expect(cells).toHaveLength(columns.length);
        expect(cells.slice(0, 5)).toEqual(["2026-10-14", "chatgpt", "gpt-5", "1", "100"]);
        expect(cells[columns.indexOf("total_energy_kWh_median")]).toBe("1");
        expect(rest).toEqual([]);
    });
});

describe("eventsToCsv", () => {
    it("escapes cells and skips events without impacts", () => {
        const csv = eventsToCsv([
            impactResult({ rawModel: 'weird, "model"' }),
            impactResult({ impacts: null }),
        ]);
        const [header, row, ...rest] = parseCsv(csv);
        expect(header!.startsWith("timestamp,provider,raw_model,model,")).toBe(true);
        expect(row).toContain(',"weird, ""model""",gpt-5,');
        expect(rest).toEqual([]);
    });

    it("neutralises spreadsheet formulas in page-provided strings", () => {
        for (const rawModel of ["=1+1", "+1", "-1", "@SUM(A1)", "\tx"]) {
            const [, row] = parseCsv(eventsToCsv([impactResult({ rawModel })]));
            expect(row, rawModel).toContain(`,'${rawModel},gpt-5,`);
        }
        const [, row] = parseCsv(eventsToCsv([impactResult({ rawModel: '=HYPERLINK("x")' })]));
        expect(row).toContain(`,"'=HYPERLINK(""x"")",gpt-5,`);
    });

    it("leaves unknown latency empty", () => {
        const [, row] = parseCsv(eventsToCsv([impactResult({ latencySeconds: null })]));
        expect(row).toContain(",100,,false,");
    });
});

describe("toJsonExport", () => {
    it("produces versioned, parseable JSON", () => {
        const event = impactResult();
        const aggregates = addToAggregates({}, event);
        const data = JSON.parse(toJsonExport(aggregates, [event], Date.UTC(2026, 9, 14)));
        expect(data).toEqual({
            schemaVersion: SCHEMA_VERSION,
            ecologitsVersion: ECOLOGITS_VERSION,
            exportedAt: "2026-10-14T00:00:00.000Z",
            units: { energy: "kWh", gwp: "kgCO2eq", adpe: "kgSbeq", pe: "MJ", wcf: "L" },
            aggregates: Object.values(aggregates),
            events: [event],
        });
    });
});
