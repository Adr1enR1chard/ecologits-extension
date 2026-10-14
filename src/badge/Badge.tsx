import { t } from "../i18n";
import type { ImpactResult, Impacts } from "../messaging";
import { FlagIcons } from "../ui/FlagIcons";
import { formatCount, formatImpact, formatRange } from "../ui/format";
import { CRITERION_LABELS } from "../ui/labels";
import { Tooltip } from "../ui/Tooltip";

function LeafIcon() {
    return (
        <svg aria-hidden="true" viewBox="0 0 16 16" class="size-3 shrink-0" fill="currentColor">
            <path d="M14 2c-6.5 0-11 2.6-11 7.3 0 1.2.4 2.3 1 3.1L2.3 14l1 1 1.7-1.7c.8.6 1.9 1 3.1 1C12.6 14.3 14 9 14 2Zm-8.4 9.8-.5-.5C7 9.4 9 7.8 11.4 6.6 9.3 8 7.3 9.7 5.6 11.8Z" />
        </svg>
    );
}

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
                        <span class="text-gray-300">{t(CRITERION_LABELS[criterion])}</span>
                        <span class="whitespace-nowrap">
                            {formatRange(criterion, impacts.total[criterion], locale)}
                        </span>
                    </span>
                ))}
            </span>
            <span class="mt-1 block text-gray-300">{model}</span>
            <span class="block text-gray-300">
                {t("outputTokensCount", formatCount(result.outputTokens, locale))}
            </span>
        </>
    );
}

interface BadgeProps {
    result: ImpactResult;
    locale: string;
}

/** Median energy and GHG emissions of a reply, with ranges and details on hover. */
export function Badge({ result, locale }: BadgeProps) {
    const { impacts } = result;
    if (impacts === null) return null;
    return (
        <div class="my-1 flex items-center gap-1 font-sans text-xs leading-4 text-(color:--ecologits-fg)">
            <Tooltip
                align="start"
                content={<Details result={result} impacts={impacts} locale={locale} />}
            >
                <span class="inline-flex items-center gap-1.5 rounded-full border border-current/20 px-2 py-0.5 opacity-80 hover:opacity-100">
                    <LeafIcon />
                    <span class="sr-only">{t("badgeLabel")}</span>
                    <span>{formatImpact("energy", impacts.total.energy.median, locale)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatImpact("gwp", impacts.total.gwp.median, locale)}</span>
                </span>
            </Tooltip>
            <span class="inline-flex items-center gap-1 opacity-80">
                <FlagIcons flags={result.flags} />
            </span>
        </div>
    );
}
