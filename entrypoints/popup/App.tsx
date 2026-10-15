import { ECOLOGITS_VERSION } from "@/src/impacts/version";
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { t, uiLocale } from "@/src/i18n";
import { computeEquivalences } from "@/src/impacts/equivalences";
import {
    CRITERIA,
    WEB_PROVIDERS,
    isEmbodiedCriterion,
    type AdapterStatus,
    type Criterion,
    type WebProvider,
} from "@/src/messaging";
import { PROVIDER_NAMES, SUPPORTED_PROVIDERS } from "@/src/providers";
import { PERIODS, summarize, type Period, type Totals } from "@/src/stats/summary";
import { aggregatesItem, type DailyAggregates } from "@/src/storage/aggregates";
import { adapterHealth, adapterStatusItem, emptyStatus } from "@/src/storage/health";
import { FlagSymbol } from "@/src/ui/FlagIcons";
import { formatCount, formatDateTime, formatNumber } from "@/src/ui/format";
import { useStorageItem } from "@/src/ui/hooks";
import { ImpactValue } from "@/src/ui/ImpactValue";
import { LogoMark } from "@/src/ui/Leaf";
import { CRITERION_LABELS, EQUIVALENCE_LABELS, FLAG_INFO, PERIOD_LABELS } from "@/src/ui/labels";
import { Tooltip } from "@/src/ui/Tooltip";

const locale = uiLocale();

function SectionTitle({ children }: { children: ComponentChildren }) {
    return <h2 class="text-xs font-semibold text-fg">{children}</h2>;
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
    return (
        <div class="rounded-lg bg-surface px-3 py-2.5">
            <div class="truncate text-xs text-fg-muted">{t(CRITERION_LABELS[criterion])}</div>
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

function FlagNotes({ totals }: { totals: Totals }) {
    const notes = [
        { flag: "lowerBound", count: totals.lowerBoundRequests, label: "popupLowerBoundCount" },
        {
            flag: "approximatedModel",
            count: totals.approximatedModelRequests,
            label: "popupApproximatedCount",
        },
    ] as const;
    const shown = notes.filter((n) => n.count > 0);
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

function Equivalences({ totals }: { totals: Totals }) {
    const values = computeEquivalences("gwp", totals.impacts.total.gwp.median);
    return (
        <section>
            <SectionTitle>{t("equivalencesTitle")}</SectionTitle>
            <ul class="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-fg-muted">
                {values.map(({ id, count }) => {
                    const label = EQUIVALENCE_LABELS[id];
                    if (!label) return null;
                    return <li key={id}>≈ {t(label, formatNumber(count, locale, 2))}</li>;
                })}
            </ul>
            <p class="mt-1.5 text-[11px] text-fg-subtle">{t("equivalencesSource")}</p>
        </section>
    );
}

interface BreakdownRow {
    key: string;
    label: string;
    sublabel?: string;
    totals: Totals;
}

function Breakdown({ title, rows }: { title: string; rows: BreakdownRow[] }) {
    return (
        <section>
            <SectionTitle>{title}</SectionTitle>
            <table class="mt-1 w-full table-fixed text-xs tabular-nums">
                <colgroup>
                    <col />
                    <col class="w-24" />
                    <col class="w-24" />
                </colgroup>
                <thead class="text-fg-subtle">
                    <tr>
                        <th class="sr-only">{title}</th>
                        <th class="text-right font-normal">{t("criterionEnergy")}</th>
                        <th class="text-right font-normal">{t("criterionGwp")}</th>
                    </tr>
                </thead>
                <tbody class="text-fg-muted">
                    {rows.map(({ key, label, sublabel, totals }) => (
                        <tr key={key} class="border-t border-line">
                            <th
                                scope="row"
                                class="py-1.5 pr-2 text-left font-medium break-words text-fg"
                            >
                                {label}
                                <span class="block font-normal text-fg-subtle">
                                    {sublabel && `${sublabel} · `}
                                    {t("repliesCount", formatCount(totals.requests, locale))}
                                </span>
                            </th>
                            <td class="py-1.5 text-right align-top">
                                <ImpactValue
                                    criterion="energy"
                                    range={totals.impacts.total.energy}
                                    locale={locale}
                                />
                            </td>
                            <td class="py-1.5 text-right align-top">
                                <ImpactValue
                                    criterion="gwp"
                                    range={totals.impacts.total.gwp}
                                    locale={locale}
                                    align="end"
                                />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </section>
    );
}

const DETAIL_ALIGNMENTS = { start: "text-left", center: "text-center", end: "text-right" };

function DetailValue({
    label,
    align,
    children,
}: {
    label: string;
    align: keyof typeof DETAIL_ALIGNMENTS;
    children: ComponentChildren;
}) {
    return (
        <span class={DETAIL_ALIGNMENTS[align]}>
            <span class="block text-[11px] text-fg-subtle">{label}</span>
            {children}
        </span>
    );
}

function Details({ totals }: { totals: Totals }) {
    const { total, usage, embodied } = totals.impacts;
    return (
        <details>
            <summary class="focus-ring cursor-pointer rounded-sm text-xs font-semibold text-fg">
                {t("detailsTitle")}
            </summary>
            <dl class="mt-1 divide-y divide-line text-xs tabular-nums">
                {CRITERIA.map((criterion) => {
                    const embodiedRange = isEmbodiedCriterion(criterion)
                        ? embodied[criterion]
                        : null;
                    return (
                        <div key={criterion} class="py-1.5">
                            <dt class="font-medium text-fg">{t(CRITERION_LABELS[criterion])}</dt>
                            <dd class="mt-0.5 grid grid-cols-3 gap-2 text-fg-muted">
                                <DetailValue label={t("detailsTotal")} align="start">
                                    <ImpactValue
                                        criterion={criterion}
                                        range={total[criterion]}
                                        locale={locale}
                                        align="start"
                                    />
                                </DetailValue>
                                <DetailValue label={t("detailsUsage")} align="center">
                                    <ImpactValue
                                        criterion={criterion}
                                        range={usage[criterion]}
                                        locale={locale}
                                    />
                                </DetailValue>
                                <DetailValue label={t("detailsEmbodied")} align="end">
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
                                </DetailValue>
                            </dd>
                        </div>
                    );
                })}
            </dl>
        </details>
    );
}

type AdapterStatuses = Partial<Record<WebProvider, AdapterStatus>>;

function AdapterStatuses({ statuses }: { statuses: AdapterStatuses }) {
    return (
        <section>
            <SectionTitle>{t("adapterStatusTitle")}</SectionTitle>
            <ul class="mt-1.5 space-y-1 text-xs">
                {WEB_PROVIDERS.map((provider) => {
                    const status = statuses[provider] ?? emptyStatus(provider);
                    let dot = "border border-line-strong";
                    let text = t("adapterUnsupported");
                    if (SUPPORTED_PROVIDERS.includes(provider)) {
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
                        <li key={provider} class="flex items-start gap-2">
                            <span
                                aria-hidden="true"
                                class={`mt-1 size-2 shrink-0 rounded-full ${dot}`}
                            />
                            <span>
                                <span class="font-medium text-fg">{PROVIDER_NAMES[provider]}</span>{" "}
                                <span class="break-words text-fg-muted">{text}</span>
                            </span>
                        </li>
                    );
                })}
            </ul>
        </section>
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
            <div class="grid grid-cols-2 gap-2">
                <Headline totals={total} criterion="energy" />
                <Headline totals={total} criterion="gwp" />
            </div>
            <p class="text-xs text-fg-subtle">
                {t("repliesCount", formatCount(total.requests, locale))} ·{" "}
                {t("outputTokensCount", formatCount(total.outputTokens, locale))}
            </p>
            <FlagNotes totals={total} />
            <Equivalences totals={total} />
            <Breakdown
                title={t("byProviderTitle")}
                rows={summary.byProvider.map((p) => ({
                    key: p.provider,
                    label: PROVIDER_NAMES[p.provider],
                    totals: p,
                }))}
            />
            <Breakdown
                title={t("byModelTitle")}
                rows={summary.byModel.map((m) => ({
                    key: `${m.provider}/${m.model}`,
                    label: m.model,
                    sublabel: PROVIDER_NAMES[m.provider],
                    totals: m,
                }))}
            />
            <Details totals={total} />
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
                <button
                    type="button"
                    onClick={() => void browser.runtime.openOptionsPage()}
                    class="focus-ring rounded-sm text-xs font-medium text-accent hover:underline"
                >
                    {t("openOptions")}
                </button>
            </header>
            <PeriodSelector value={period} onChange={setPeriod} />
            <Usage aggregates={aggregates} period={period} />
            <AdapterStatuses statuses={statuses} />
            <footer class="border-t border-line pt-3 text-[11px] text-fg-subtle">
                {t("poweredBy", ECOLOGITS_VERSION)}
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
