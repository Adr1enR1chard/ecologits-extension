import type { Criterion, ImpactRange } from "../messaging";

interface Unit {
    symbol: string;
    /** Size of the unit, in the criterion's EcoLogits unit. */
    factor: number;
}

/**
 * Display units per criterion, smallest first; EcoLogits values are in the unit of factor 1.
 * The smallest unit suits a single reply (e.g. `0.17 Wh`), so values below it keep it.
 */
const UNITS: Readonly<Record<Criterion, readonly Unit[]>> = {
    energy: [
        { symbol: "Wh", factor: 1e-3 },
        { symbol: "kWh", factor: 1 },
        { symbol: "MWh", factor: 1e3 },
    ],
    gwp: [
        { symbol: "gCO₂eq", factor: 1e-3 },
        { symbol: "kgCO₂eq", factor: 1 },
        { symbol: "tCO₂eq", factor: 1e3 },
    ],
    adpe: [
        { symbol: "ngSbeq", factor: 1e-12 },
        { symbol: "µgSbeq", factor: 1e-9 },
        { symbol: "mgSbeq", factor: 1e-6 },
        { symbol: "gSbeq", factor: 1e-3 },
        { symbol: "kgSbeq", factor: 1 },
    ],
    pe: [
        { symbol: "kJ", factor: 1e-3 },
        { symbol: "MJ", factor: 1 },
        { symbol: "GJ", factor: 1e3 },
    ],
    wcf: [
        { symbol: "mL", factor: 1e-3 },
        { symbol: "L", factor: 1 },
        { symbol: "m³", factor: 1e3 },
    ],
};

function pickUnit(criterion: Criterion, value: number): Unit {
    const units = UNITS[criterion];
    return units.findLast((u) => Math.abs(value) >= u.factor) ?? units[0]!;
}

export function formatNumber(value: number, locale: string, significantDigits = 3): string {
    return new Intl.NumberFormat(locale, { maximumSignificantDigits: significantDigits }).format(
        value,
    );
}

export function formatCount(value: number, locale: string): string {
    return new Intl.NumberFormat(locale).format(value);
}

/** A count where room is short, e.g. `12K`; `formatCount` gives the full one. */
export function formatCompactCount(value: number, locale: string): string {
    return new Intl.NumberFormat(locale, { notation: "compact" }).format(value);
}

/**
 * A number where room is short, e.g. `12K` or `1.5`; below `floor` it reads `<0.01`. `formatNumber`
 * gives the precise one.
 */
export function formatCompactNumber(value: number, locale: string, floor = 0.01): string {
    const { format } = new Intl.NumberFormat(locale, {
        notation: "compact",
        maximumSignificantDigits: 2,
    });
    return value > 0 && value < floor ? `<${format(floor)}` : format(value);
}

/** Formats a value given in the criterion's EcoLogits unit, e.g. `0.00017` kWh → `0.17 Wh`. */
export function formatImpact(criterion: Criterion, value: number, locale: string): string {
    if (!Number.isFinite(value)) return "–";
    const unit = pickUnit(criterion, value);
    return `${formatNumber(value / unit.factor, locale)}\u00a0${unit.symbol}`;
}

/** Formats the bounds of a range, e.g. `0.1 Wh – 0.3 Wh`; a scalar is formatted once. */
export function formatRange(criterion: Criterion, range: ImpactRange, locale: string): string {
    const min = formatImpact(criterion, range.min, locale);
    const max = formatImpact(criterion, range.max, locale);
    return min === max ? min : `${min} – ${max}`;
}

export function formatDateTime(timestamp: number, locale: string): string {
    return new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(
        timestamp,
    );
}
