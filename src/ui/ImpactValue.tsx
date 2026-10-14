import type { ComponentChildren } from "preact";
import { t } from "../i18n";
import type { Criterion, ImpactRange } from "../messaging";
import { formatImpact, formatRange } from "./format";
import { Tooltip } from "./Tooltip";

interface RangeTooltipProps {
    criterion: Criterion;
    range: ImpactRange;
    locale: string;
    children: ComponentChildren;
    align?: "start" | "center" | "end";
}

/** Shows the min–max range of a value on hover; scalars get no tooltip. */
export function RangeTooltip({ criterion, range, locale, children, align }: RangeTooltipProps) {
    if (range.min === range.max) return <>{children}</>;
    return (
        <Tooltip content={t("rangeLabel", formatRange(criterion, range, locale))} align={align}>
            {children}
        </Tooltip>
    );
}

interface ImpactValueProps {
    criterion: Criterion;
    range: ImpactRange;
    locale: string;
    class?: string;
    align?: "start" | "center" | "end";
}

/** The median of a value in a readable unit, with its range on hover. */
export function ImpactValue({
    criterion,
    range,
    locale,
    class: className,
    align,
}: ImpactValueProps) {
    const hasRange = range.min !== range.max;
    return (
        <RangeTooltip criterion={criterion} range={range} locale={locale} align={align}>
            <span
                class={`whitespace-nowrap ${hasRange ? "underline decoration-current/30 decoration-dotted underline-offset-2" : ""} ${className ?? ""}`}
            >
                {formatImpact(criterion, range.median, locale)}
            </span>
        </RangeTooltip>
    );
}
