import { Fragment } from "preact";
import { t } from "../i18n";
import { modelLabel, type Criterion, type ImpactResult, type Impacts } from "../messaging";
import { FlagIcons } from "../ui/FlagIcons";
import { LeafIcon } from "../ui/Leaf";
import { formatCount, formatImpact, formatRange } from "../ui/format";
import { CRITERION_LABELS } from "../ui/labels";
import { Tooltip } from "../ui/Tooltip";
import type { ColorScheme } from "./theme";

/** The criteria shown on the badge, and in its tooltip. */
const BADGE_CRITERIA = ["energy", "gwp", "wcf"] as const satisfies readonly Criterion[];

function Details({ result, impacts, locale }: BadgeProps & { impacts: Impacts }) {
    const label = modelLabel(result.model);
    const model =
        result.rawModel !== null && result.rawModel !== label
            ? t("badgeModelMapped", [result.rawModel, label])
            : t("badgeModel", label);
    return (
        <>
            <span class="block font-semibold">{t("badgeLabel")}</span>
            <span class="mt-1 grid grid-cols-[auto_auto] gap-x-3">
                {BADGE_CRITERIA.map((criterion) => (
                    <span key={criterion} class="contents">
                        <span class="text-fg-muted">{t(CRITERION_LABELS[criterion])}</span>
                        <span class="whitespace-nowrap">
                            {formatRange(criterion, impacts.total[criterion], locale)}
                        </span>
                    </span>
                ))}
            </span>
            <span class="mt-1 block text-fg-muted">{model}</span>
            <span class="block text-fg-muted">
                {t("outputTokensCount", formatCount(result.outputTokens, locale))}
            </span>
        </>
    );
}

interface BadgeProps {
    result: ImpactResult;
    locale: string;
    /** Theme of the host page, for the tooltips. */
    scheme?: ColorScheme;
}

/** Median energy, GHG emissions and water of a reply, with ranges and details on hover. */
export function Badge({ result, locale, scheme = "light" }: BadgeProps) {
    const { impacts } = result;
    if (impacts === null) return null;
    return (
        <div
            class={`my-1 flex items-center gap-1.5 font-sans text-xs leading-4 text-(--ecologits-fg)/75 ${scheme === "dark" ? "scheme-dark" : "scheme-light"}`}
        >
            <Tooltip
                align="start"
                content={<Details result={result} impacts={impacts} locale={locale} />}
            >
                <span class="inline-flex items-center gap-1.5 rounded-full border border-current/25 px-2 py-0.5 tabular-nums transition-colors group-hover:text-(--ecologits-fg) group-focus-visible:text-(--ecologits-fg)">
                    <LeafIcon />
                    <span class="sr-only">{t("badgeLabel")}</span>
                    {BADGE_CRITERIA.map((criterion, i) => (
                        <Fragment key={criterion}>
                            {i > 0 && <span aria-hidden="true">·</span>}
                            <span>
                                {formatImpact(criterion, impacts.total[criterion].median, locale)}
                            </span>
                        </Fragment>
                    ))}
                </span>
            </Tooltip>
            <span class="inline-flex items-center gap-1">
                <FlagIcons flags={result.flags} />
            </span>
        </div>
    );
}
