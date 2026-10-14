import { ECOLOGITS_VERSION } from "../impacts/version";
import {
    CRITERIA,
    CRITERION_UNITS,
    EMBODIED_CRITERIA,
    type Criterion,
    type ImpactResult,
    type Impacts,
} from "../messaging";
import type { DailyAggregate, DailyAggregates } from "./aggregates";
import { SCHEMA_VERSION } from "./schema";

type Cell = string | number | boolean | null;

const BOUNDS = ["min", "median", "max"] as const;

/** Column names for every phase, criterion and bound, e.g. `total_energy_kWh_median`. */
const IMPACT_COLUMNS: string[] = [
    ...CRITERIA.flatMap((c) => phaseColumns("total", c)),
    ...CRITERIA.flatMap((c) => phaseColumns("usage", c)),
    ...EMBODIED_CRITERIA.flatMap((c) => phaseColumns("embodied", c)),
];

function phaseColumns(phase: keyof Impacts, criterion: Criterion): string[] {
    return BOUNDS.map((bound) => `${phase}_${criterion}_${CRITERION_UNITS[criterion]}_${bound}`);
}

function impactCells(impacts: Impacts): number[] {
    return [
        ...CRITERIA.flatMap((c) => BOUNDS.map((b) => impacts.total[c][b])),
        ...CRITERIA.flatMap((c) => BOUNDS.map((b) => impacts.usage[c][b])),
        ...EMBODIED_CRITERIA.flatMap((c) => BOUNDS.map((b) => impacts.embodied[c][b])),
    ];
}

function escapeCell(cell: Cell): string {
    if (cell === null) return "";
    let text = String(cell);
    // Page-provided strings such as model slugs must not run as spreadsheet formulas.
    if (typeof cell === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(header: string[], rows: Cell[][]): string {
    return [header, ...rows].map((row) => row.map(escapeCell).join(",")).join("\r\n") + "\r\n";
}

/** One row per day, provider and model, sorted by key. */
export function aggregatesToCsv(aggregates: DailyAggregates): string {
    const header = [
        "date",
        "provider",
        "model",
        "requests",
        "output_tokens",
        "lower_bound_requests",
        "approximated_model_requests",
        ...IMPACT_COLUMNS,
    ];
    const rows = Object.keys(aggregates)
        .sort()
        .map((key) => {
            const a = aggregates[key] as DailyAggregate;
            return [
                a.date,
                a.provider,
                a.model,
                a.requests,
                a.outputTokens,
                a.lowerBoundRequests,
                a.approximatedModelRequests,
                ...impactCells(a.impacts),
            ];
        });
    return toCsv(header, rows);
}

/** One row per event; events without impacts are skipped. */
export function eventsToCsv(events: readonly ImpactResult[]): string {
    const header = [
        "timestamp",
        "provider",
        "raw_model",
        "model",
        "output_tokens",
        "latency_s",
        "lower_bound",
        "approximated_model",
        "warnings",
        ...IMPACT_COLUMNS,
    ];
    const rows = events.flatMap((e) =>
        e.impacts === null
            ? []
            : [
                  [
                      new Date(e.timestamp).toISOString(),
                      e.provider,
                      e.rawModel,
                      e.model,
                      e.outputTokens,
                      e.latencySeconds,
                      e.flags.lowerBound,
                      e.flags.approximatedModel,
                      e.warnings.map((w) => w.code).join(" "),
                      ...impactCells(e.impacts),
                  ],
              ],
    );
    return toCsv(header, rows);
}

export function toJsonExport(
    aggregates: DailyAggregates,
    events: readonly ImpactResult[],
    exportedAt: number = Date.now(),
): string {
    const data = {
        schemaVersion: SCHEMA_VERSION,
        ecologitsVersion: ECOLOGITS_VERSION,
        exportedAt: new Date(exportedAt).toISOString(),
        units: CRITERION_UNITS,
        aggregates: Object.values(aggregates),
        events,
    };
    return JSON.stringify(data, null, 2);
}
