import type { Criterion } from "../messaging";

export type EquivalenceId = "carKm" | "videoStreamingHour" | "email" | "webSearch";

export interface Equivalence {
    id: EquivalenceId;
    criterion: Criterion;
    /** Impact of one unit of the equivalent, in the criterion's EcoLogits unit. */
    factor: number;
    source: string;
    /** When the factor was retrieved, `YYYY-MM-DD`. */
    retrievedOn: string;
}

const IMPACT_CO2_TRANSPORT = "https://impactco2.fr/api/v1/transport?km=1&displayAll=1";
const IMPACT_CO2_DIGITAL_USAGE = "https://impactco2.fr/api/v1/thematiques/ecv/10";

export const EQUIVALENCES: readonly Equivalence[] = [
    {
        // ADEME Impact CO2, "Voiture thermique", kgCO2e per km and passenger.
        id: "carKm",
        criterion: "gwp",
        factor: 0.1105577600556303,
        source: IMPACT_CO2_TRANSPORT,
        retrievedOn: "2026-10-14",
    },
    {
        // ADEME Impact CO2, "Streaming vidéo", kgCO2e per hour.
        id: "videoStreamingHour",
        criterion: "gwp",
        factor: 0.06401675291000002,
        source: IMPACT_CO2_DIGITAL_USAGE,
        retrievedOn: "2026-10-14",
    },
    {
        // ADEME Impact CO2, "Email", kgCO2e per email.
        id: "email",
        criterion: "gwp",
        factor: 0.00246181262,
        source: IMPACT_CO2_DIGITAL_USAGE,
        retrievedOn: "2026-10-14",
    },
    {
        // ADEME Impact CO2, "Recherche sur le web", kgCO2e per search.
        id: "webSearch",
        criterion: "gwp",
        factor: 0.00123,
        source: IMPACT_CO2_DIGITAL_USAGE,
        retrievedOn: "2026-10-14",
    },
];

export interface EquivalenceValue {
    id: EquivalenceId;
    /** How many units of the equivalent the impact amounts to. */
    count: number;
}

/** Expresses `value` (in the criterion's EcoLogits unit) with every matching equivalence. */
export function computeEquivalences(
    criterion: Criterion,
    value: number,
    equivalences: readonly Equivalence[] = EQUIVALENCES,
): EquivalenceValue[] {
    return equivalences
        .filter((e) => e.criterion === criterion)
        .map((e) => ({ id: e.id, count: value / e.factor }));
}
