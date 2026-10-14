import type { MessageKey } from "../i18n";
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

/** Message for each equivalence of `impacts/equivalences.ts`, with a `$COUNT$` placeholder. */
export const EQUIVALENCE_LABELS: Readonly<Record<string, MessageKey>> = {
    carKm: "equivalenceCarKm",
    videoStreamingHour: "equivalenceVideoStreamingHour",
    email: "equivalenceEmail",
    webSearch: "equivalenceWebSearch",
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
};
