import type { MessageKey } from "../i18n";
import type { EquivalenceId } from "../impacts/equivalences";
import type { Criterion, ImpactFlags } from "../messaging";
import type { Period } from "../stats/summary";

export const CRITERION_LABELS: Readonly<Record<Criterion, MessageKey>> = {
    energy: "criterionEnergy",
    gwp: "criterionGwp",
    adpe: "criterionAdpe",
    pe: "criterionPe",
    wcf: "criterionWcf",
};

export const PERIOD_LABELS: Readonly<Record<Period, MessageKey>> = {
    today: "periodToday",
    "7d": "period7d",
    "30d": "period30d",
    all: "periodAll",
};

/** Short labels of the criteria, where the full one does not fit. */
export const CRITERION_SHORT_LABELS: Readonly<Record<Criterion, MessageKey>> = {
    ...CRITERION_LABELS,
    gwp: "criterionGwpShort",
};

export interface EquivalenceLabel {
    /** The sentence, with a `$COUNT$` placeholder. */
    full: MessageKey;
    /** The value next to the equivalence's icon, with a `$COUNT$` placeholder. */
    short: MessageKey;
}

/** Messages of each equivalence of `impacts/equivalences.ts`. */
export const EQUIVALENCE_LABELS: Readonly<Record<EquivalenceId, EquivalenceLabel>> = {
    carKm: { full: "equivalenceCarKm", short: "equivalenceCarKmShort" },
    videoStreamingHour: {
        full: "equivalenceVideoStreamingHour",
        short: "equivalenceVideoStreamingHourShort",
    },
    email: { full: "equivalenceEmail", short: "equivalenceEmailShort" },
    webSearch: { full: "equivalenceWebSearch", short: "equivalenceWebSearchShort" },
};

export type Flag = keyof ImpactFlags;

export interface FlagInfo {
    symbol: string;
    title: MessageKey;
    help: MessageKey;
}

export const FLAG_INFO: Readonly<Record<Flag, FlagInfo>> = {
    lowerBound: { symbol: "≥", title: "flagLowerBoundTitle", help: "flagLowerBoundHelp" },
    approximatedModel: {
        symbol: "≈",
        title: "flagApproximatedTitle",
        help: "flagApproximatedHelp",
    },
    partial: { symbol: "…", title: "flagPartialTitle", help: "flagPartialHelp" },
};
