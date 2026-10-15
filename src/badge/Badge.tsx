import { t } from "../i18n";
import type { ImpactResult, Impacts } from "../messaging";
import { FlagIcons } from "../ui/FlagIcons";
import { LeafIcon } from "../ui/Leaf";
import { formatCount, formatImpact, formatRange } from "../ui/format";
import { CRITERION_LABELS } from "../ui/labels";
import { Tooltip } from "../ui/Tooltip";
import type { ColorScheme } from "./theme";

function Details({ result, impacts, locale }: BadgeProps & { impacts: Impacts }) {
    const model =
        result.rawModel !== null && result.rawModel !== result.model
            ? t("badgeModelMapped", [result.rawModel, result.model])
            : t("badgeModel", result.model);
    return (
        <>
            <span class="block font-semibold">{t("badgeLabel")}</span>
            <span class="mt-1 grid grid-cols-[auto_auto] gap-x-3">
                {(["energy", "gwp"] as const).map((criterion) => (
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

/** Median energy and GHG emissions of a reply, with ranges and details on hover. */
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
                    <span>{formatImpact("energy", impacts.total.energy.median, locale)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatImpact("gwp", impacts.total.gwp.median, locale)}</span>
                </span>
            </Tooltip>
            <span class="inline-flex items-center gap-1">
                <FlagIcons flags={result.flags} />
            </span>
        </div>
    );
}
