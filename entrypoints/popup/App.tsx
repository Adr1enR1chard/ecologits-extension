import { ECOLOGITS_VERSION } from "@/src/impacts/version";
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { t, uiLocale } from "@/src/i18n";
import { computeEquivalences } from "@/src/impacts/equivalences";
import {
    CRITERIA,
    isEmbodiedCriterion,
    type AdapterStatus,
    type Criterion,
    type WebProvider,
} from "@/src/messaging";
import { PROVIDER_META, WEB_PROVIDERS, isSupportedProvider } from "@/src/providers/registry";
import {
    PERIODS,
    summarize,
    type ModelTotals,
    type Period,
    type ProviderTotals,
    type Totals,
} from "@/src/stats/summary";
import { aggregatesItem, type DailyAggregates } from "@/src/storage/aggregates";
import { adapterHealth, adapterStatusItem, emptyStatus } from "@/src/storage/health";
import { FlagSymbol } from "@/src/ui/FlagIcons";
import {
    formatCompactCount,
    formatCompactNumber,
    formatCount,
    formatDateTime,
    formatNumber,
} from "@/src/ui/format";
import { useStorageItem } from "@/src/ui/hooks";
import {
    ChevronRightIcon,
    CriterionIcon,
    EQUIVALENCE_ICONS,
    InfoIcon,
    MessageIcon,
    PilcrowIcon,
    ProviderLogo,
    SettingsIcon,
} from "@/src/ui/icons";
import { ImpactValue } from "@/src/ui/ImpactValue";
import { LogoMark } from "@/src/ui/Leaf";
import {
    CRITERION_LABELS,
    CRITERION_SHORT_LABELS,
    EQUIVALENCE_LABELS,
    FLAG_INFO,
    PERIOD_LABELS,
} from "@/src/ui/labels";
import { Tooltip } from "@/src/ui/Tooltip";

const locale = uiLocale();

/** The two criteria shown up front, and in the breakdown. */
const HEADLINE_CRITERIA = ["energy", "gwp"] as const satisfies readonly Criterion[];

function SectionTitle({ children }: { children: ComponentChildren }) {
    return <h2 class="text-xs font-semibold text-fg">{children}</h2>;
}

/** A criterion's icon, named by its tooltip and for screen readers. */
function CriterionMark({
    criterion,
    align,
}: {
    criterion: Criterion;
    align?: "start" | "center" | "end";
}) {
    const label = t(CRITERION_LABELS[criterion]);
    return (
        <Tooltip content={label} align={align} describes={false}>
            <CriterionIcon criterion={criterion} class="size-4 text-fg-muted" />
            <span class="sr-only">{label}</span>
        </Tooltip>
    );
}

function Collapsible({ title, children }: { title: string; children: ComponentChildren }) {
    return (
        <details class="group/section">
            <summary class="focus-ring flex w-fit cursor-pointer list-none items-center gap-1 rounded-sm text-xs font-semibold text-fg [&::-webkit-details-marker]:hidden">
                <ChevronRightIcon class="size-3.5 text-fg-muted transition-transform group-open/section:rotate-90" />
                {title}
            </summary>
            <div class="mt-2">{children}</div>
        </details>
    );
}

function PeriodSelector({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
    // A radio group: one tab stop, arrow keys move the selection.
    const onKeyDown = (event: KeyboardEvent) => {
        const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
        if (step === undefined) return;
        event.preventDefault();
        const next = PERIODS[(PERIODS.indexOf(value) + step + PERIODS.length) % PERIODS.length]!;
        onChange(next);
        const group = event.currentTarget as HTMLElement;
        group.querySelector<HTMLElement>(`[data-period="${next}"]`)?.focus();
    };
    return (
        <div
            role="radiogroup"
            aria-label={t("periodLabel")}
            class="flex rounded-lg bg-surface p-1"
            onKeyDown={onKeyDown}
        >
            {PERIODS.map((period) => (
                <button
                    key={period}
                    type="button"
                    role="radio"
                    data-period={period}
                    aria-checked={period === value}
                    tabIndex={period === value ? 0 : -1}
                    onClick={() => onChange(period)}
                    class={`focus-ring flex-1 rounded-md px-2 py-1 text-xs font-medium ${
                        period === value
                            ? "bg-raised text-fg shadow-sm"
                            : "text-fg-muted hover:text-fg"
                    }`}
                >
                    {t(PERIOD_LABELS[period])}
                </button>
            ))}
        </div>
    );
}

function Headline({ totals, criterion }: { totals: Totals; criterion: Criterion }) {
    const label = t(CRITERION_LABELS[criterion]);
    const shortLabel = t(CRITERION_SHORT_LABELS[criterion]);
    return (
        <div class="rounded-lg bg-surface px-3 py-2.5">
            <div class="flex items-center gap-1.5 text-xs text-fg-muted">
                <CriterionIcon criterion={criterion} class="size-3.5" />
                {shortLabel === label ? (
                    label
                ) : (
                    <Tooltip content={label} align="start">
                        {shortLabel}
                    </Tooltip>
                )}
            </div>
            <ImpactValue
                criterion={criterion}
                range={totals.impacts.total[criterion]}
                locale={locale}
                align={criterion === "energy" ? "start" : "end"}
                class="text-xl font-semibold text-fg tabular-nums"
            />
        </div>
    );
}

/** A count next to its icon, its meaning in a tooltip. */
function Stat({
    icon,
    count,
    children,
}: {
    icon: ComponentChildren;
    count: number;
    children: ComponentChildren;
}) {
    return (
        <li>
            <Tooltip align="start" content={children}>
                <span class="inline-flex items-center gap-1 tabular-nums">
                    {icon}
                    <span class="font-medium text-fg">{formatCompactCount(count, locale)}</span>
                </span>
            </Tooltip>
        </li>
    );
}

/** The caveats on the figures, spelled out: they must not read as exact. */
function FlagNotes({ totals }: { totals: Totals }) {
    const notes = [
        { flag: "lowerBound", count: totals.lowerBoundRequests, label: "popupLowerBoundCount" },
        {
            flag: "approximatedModel",
            count: totals.approximatedModelRequests,
            label: "popupApproximatedCount",
        },
    ] as const;
    const shown = notes.filter(({ count }) => count > 0);
    if (shown.length === 0) return null;
    return (
        <ul class="space-y-1 text-xs text-fg-muted">
            {shown.map(({ flag, count, label }) => (
                <li key={flag}>
                    <Tooltip align="start" content={t(FLAG_INFO[flag].help)}>
                        <span class="inline-flex items-center gap-1.5">
                            <FlagSymbol flag={flag} />
                            {t(label, formatCount(count, locale))}
                        </span>
                    </Tooltip>
                </li>
            ))}
        </ul>
    );
}

function Stats({ totals }: { totals: Totals }) {
    return (
        <ul class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
            <Stat icon={<MessageIcon class="size-3.5" />} count={totals.requests}>
                {t("repliesCount", formatCount(totals.requests, locale))}
            </Stat>
            <Stat icon={<PilcrowIcon class="size-3.5" />} count={totals.outputTokens}>
                {t("outputTokensCount", formatCount(totals.outputTokens, locale))}
            </Stat>
        </ul>
    );
}

function Equivalences({ totals }: { totals: Totals }) {
    const values = computeEquivalences("gwp", totals.impacts.total.gwp.median);
    return (
        <section>
            <div class="flex items-center gap-1">
                <SectionTitle>{t("equivalencesTitle")}</SectionTitle>
                <Tooltip content={t("equivalencesSource")} describes={false}>
                    <InfoIcon class="size-3.5 text-fg-subtle" />
                    <span class="sr-only">{t("equivalencesSource")}</span>
                </Tooltip>
            </div>
            <ul class="mt-2 grid grid-cols-4 gap-2">
                {values.map(({ id, count }, i) => {
                    const label = EQUIVALENCE_LABELS[id];
                    const Icon = EQUIVALENCE_ICONS[id];
                    const full = `≈ ${t(label.full, formatNumber(count, locale, 2))}`;
                    const align = i === 0 ? "start" : i === values.length - 1 ? "end" : "center";
                    return (
                        <li key={id} class="flex">
                            <Tooltip class="w-full" align={align} content={full} describes={false}>
                                <span class="flex w-full min-w-0 flex-col items-center gap-1 rounded-lg bg-surface px-1 py-2">
                                    <Icon class="size-4 text-fg-muted" />
                                    <span
                                        aria-hidden="true"
                                        class="max-w-full truncate text-sm font-medium text-fg tabular-nums"
                                    >
                                        {t(label.short, formatCompactNumber(count, locale))}
                                    </span>
                                    <span class="sr-only">{full}</span>
                                </span>
                            </Tooltip>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

/** Columns of the breakdown: name, energy, GHG emissions. */
const BREAKDOWN_GRID = "grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem] items-center gap-x-2";

function BreakdownValues({ totals }: { totals: Totals }) {
    return (
        <>
            {HEADLINE_CRITERIA.map((criterion) => (
                <span key={criterion} class="text-right">
                    <span class="sr-only">{t(CRITERION_LABELS[criterion])}: </span>
                    <ImpactValue
                        criterion={criterion}
                        range={totals.impacts.total[criterion]}
                        locale={locale}
                        align={criterion === "gwp" ? "end" : "center"}
                    />
                </span>
            ))}
        </>
    );
}

function ProviderBreakdown({
    totals,
    models,
    initiallyOpen,
}: {
    totals: ProviderTotals;
    models: ModelTotals[];
    initiallyOpen: boolean;
}) {
    const [open, setOpen] = useState(initiallyOpen);
    const name = PROVIDER_META[totals.provider].name;
    const replies = t("repliesCount", formatCount(totals.requests, locale));
    return (
        <li class="border-t border-line">
            <div class={`${BREAKDOWN_GRID} py-1.5`}>
                <Tooltip focusable={false} align="start" content={replies}>
                    <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => setOpen(!open)}
                        class="focus-ring flex min-w-0 items-center gap-1.5 rounded-sm font-medium text-fg"
                    >
                        <ChevronRightIcon
                            class={`size-3 text-fg-muted transition-transform ${open ? "rotate-90" : ""}`}
                        />
                        <ProviderLogo provider={totals.provider} class="size-4" />
                        <span class="truncate">{name}</span>
                        <span class="sr-only">, {replies}</span>
                    </button>
                </Tooltip>
                <BreakdownValues totals={totals} />
            </div>
            {open && (
                <ul class="pb-1.5 text-fg-muted">
                    {models.map((model) => (
                        <li key={model.model} class={`${BREAKDOWN_GRID} py-1 pl-10`}>
                            <span class="min-w-0 break-words">
                                <Tooltip
                                    align="start"
                                    content={t("repliesCount", formatCount(model.requests, locale))}
                                >
                                    {model.model}
                                </Tooltip>
                            </span>
                            <BreakdownValues totals={model} />
                        </li>
                    ))}
                </ul>
            )}
        </li>
    );
}

function Breakdown({ providers, models }: { providers: ProviderTotals[]; models: ModelTotals[] }) {
    return (
        <Collapsible title={t("breakdownTitle")}>
            <div class={`${BREAKDOWN_GRID} pb-1`}>
                <span />
                {HEADLINE_CRITERIA.map((criterion) => (
                    <span key={criterion} class="flex justify-end">
                        <CriterionMark criterion={criterion} align="end" />
                    </span>
                ))}
            </div>
            <ul class="text-xs tabular-nums">
                {providers.map((provider) => (
                    <ProviderBreakdown
                        // Remounted when the single-provider case flips, to reapply `initiallyOpen`.
                        key={`${provider.provider}:${providers.length === 1}`}
                        totals={provider}
                        models={models.filter((m) => m.provider === provider.provider)}
                        initiallyOpen={providers.length === 1}
                    />
                ))}
            </ul>
        </Collapsible>
    );
}

function Details({ totals }: { totals: Totals }) {
    const { total, usage, embodied } = totals.impacts;
    return (
        <Collapsible title={t("detailsTitle")}>
            <table class="w-full table-fixed text-xs tabular-nums">
                <colgroup>
                    <col class="w-8" />
                    <col />
                    <col />
                    <col />
                </colgroup>
                <thead class="text-fg-subtle">
                    <tr>
                        <td />
                        <th class="pb-1 text-right font-normal">{t("detailsTotal")}</th>
                        <th class="pb-1 text-right font-normal">{t("detailsUsage")}</th>
                        <th class="pb-1 text-right font-normal">{t("detailsEmbodied")}</th>
                    </tr>
                </thead>
                <tbody class="text-fg-muted">
                    {CRITERIA.map((criterion) => {
                        const embodiedRange = isEmbodiedCriterion(criterion)
                            ? embodied[criterion]
                            : null;
                        return (
                            <tr key={criterion} class="border-t border-line">
                                <th scope="row" class="py-1.5 text-left font-normal">
                                    <CriterionMark criterion={criterion} align="start" />
                                </th>
                                <td class="py-1.5 text-right">
                                    <ImpactValue
                                        criterion={criterion}
                                        range={total[criterion]}
                                        locale={locale}
                                    />
                                </td>
                                <td class="py-1.5 text-right">
                                    <ImpactValue
                                        criterion={criterion}
                                        range={usage[criterion]}
                                        locale={locale}
                                    />
                                </td>
                                <td class="py-1.5 text-right">
                                    {embodiedRange ? (
                                        <ImpactValue
                                            criterion={criterion}
                                            range={embodiedRange}
                                            locale={locale}
                                            align="end"
                                        />
                                    ) : (
                                        <span class="text-fg-subtle">–</span>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </Collapsible>
    );
}

type AdapterStatuses = Partial<Record<WebProvider, AdapterStatus>>;

function AdapterStatuses({ statuses }: { statuses: AdapterStatuses }) {
    return (
        <ul aria-label={t("adapterStatusTitle")} class="flex items-center gap-3">
            {WEB_PROVIDERS.map((provider, i) => {
                const status = statuses[provider] ?? emptyStatus(provider);
                let dot = "border border-line-strong";
                let text = t("adapterUnsupported");
                if (isSupportedProvider(provider)) {
                    const health = adapterHealth(status);
                    if (health === "ok") {
                        dot = "bg-brand";
                        text = t("adapterOk", formatDateTime(status.lastSuccessAt!, locale));
                    } else if (health === "failing") {
                        dot = "bg-danger";
                        text = t("adapterFailing", [
                            formatDateTime(status.lastFailureAt!, locale),
                            status.lastError ?? "",
                        ]);
                    } else {
                        dot = "bg-line-strong";
                        text = t("adapterUnknown");
                    }
                }
                return (
                    <li key={provider}>
                        <Tooltip
                            align={i === 0 ? "start" : "center"}
                            content={
                                <>
                                    <span class="block font-semibold">
                                        {PROVIDER_META[provider].name}
                                    </span>
                                    {text}
                                </>
                            }
                        >
                            <span class="inline-flex items-center gap-1">
                                <ProviderLogo provider={provider} class="size-3.5 text-fg-muted" />
                                <span
                                    aria-hidden="true"
                                    class={`size-1.5 shrink-0 rounded-full ${dot}`}
                                />
                                <span class="sr-only">{PROVIDER_META[provider].name}</span>
                            </span>
                        </Tooltip>
                    </li>
                );
            })}
        </ul>
    );
}

function Usage({ aggregates, period }: { aggregates: DailyAggregates; period: Period }) {
    const summary = summarize(aggregates, period);
    const { total } = summary;
    if (total === null) {
        return (
            <p class="rounded-lg bg-surface px-4 py-6 text-center text-fg-muted">
                {t("popupEmpty")}
            </p>
        );
    }
    return (
        <>
            <div class="space-y-2">
                <div class="grid grid-cols-2 gap-2">
                    {HEADLINE_CRITERIA.map((criterion) => (
                        <Headline key={criterion} totals={total} criterion={criterion} />
                    ))}
                </div>
                <Stats totals={total} />
                <FlagNotes totals={total} />
            </div>
            <Equivalences totals={total} />
            <div class="space-y-3">
                <Breakdown providers={summary.byProvider} models={summary.byModel} />
                <Details totals={total} />
            </div>
        </>
    );
}

interface PopupProps {
    aggregates: DailyAggregates;
    statuses: AdapterStatuses;
}

/** The popup, given the stored data. */
export function Popup({ aggregates, statuses }: PopupProps) {
    const [period, setPeriod] = useState<Period>("today");
    return (
        <main class="w-96 space-y-4 p-4 font-sans text-sm text-fg">
            <header class="flex items-center justify-between gap-2">
                <h1 class="flex items-center gap-2 text-base font-semibold">
                    <LogoMark />
                    {t("extName")}
                </h1>
                <Tooltip focusable={false} side="bottom" align="end" content={t("openOptions")}>
                    <button
                        type="button"
                        aria-label={t("openOptions")}
                        onClick={() => void browser.runtime.openOptionsPage()}
                        class="focus-ring rounded-md p-1 text-fg-muted hover:bg-surface hover:text-fg"
                    >
                        <SettingsIcon class="size-4" />
                    </button>
                </Tooltip>
            </header>
            <PeriodSelector value={period} onChange={setPeriod} />
            <Usage aggregates={aggregates} period={period} />
            <footer class="flex items-center justify-between gap-3 border-t border-line pt-3 text-[11px] text-fg-subtle">
                <AdapterStatuses statuses={statuses} />
                <span>{t("poweredBy", ECOLOGITS_VERSION)}</span>
            </footer>
        </main>
    );
}

export function App() {
    const aggregates = useStorageItem(aggregatesItem);
    const statuses = useStorageItem(adapterStatusItem);
    if (aggregates === undefined || statuses === undefined) return null;
    return <Popup aggregates={aggregates} statuses={statuses} />;
}
