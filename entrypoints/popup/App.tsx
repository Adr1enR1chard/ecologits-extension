import { ECOLOGITS_VERSION } from "@/src/impacts/version";
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { t, uiLocale } from "@/src/i18n";
import { computeEquivalences } from "@/src/impacts/equivalences";
import { CRITERIA, WEB_PROVIDERS, isEmbodiedCriterion, type Criterion } from "@/src/messaging";
import { PROVIDER_NAMES, SUPPORTED_PROVIDERS } from "@/src/providers";
import { PERIODS, summarize, type Period, type Totals } from "@/src/stats/summary";
import { aggregatesItem } from "@/src/storage/aggregates";
import { adapterHealth, adapterStatusItem, emptyStatus } from "@/src/storage/health";
import { FlagSymbol } from "@/src/ui/FlagIcons";
import { formatCount, formatDateTime, formatNumber } from "@/src/ui/format";
import { useStorageItem } from "@/src/ui/hooks";
import { ImpactValue } from "@/src/ui/ImpactValue";
import { CRITERION_LABELS, EQUIVALENCE_LABELS, FLAG_INFO, PERIOD_LABELS } from "@/src/ui/labels";
import { Tooltip } from "@/src/ui/Tooltip";

const locale = uiLocale();

function PeriodSelector({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
    return (
        <div
            role="radiogroup"
            aria-label={t("periodLabel")}
            class="flex rounded-lg bg-gray-100 p-1"
        >
            {PERIODS.map((period) => (
                <button
                    key={period}
                    type="button"
                    role="radio"
                    aria-checked={period === value}
                    onClick={() => onChange(period)}
                    class={`flex-1 rounded-md px-2 py-1 text-xs font-medium ${
                        period === value
                            ? "bg-white text-gray-900 shadow-sm"
                            : "text-gray-600 hover:text-gray-900"
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
        <div class="rounded-lg border border-gray-200 p-3">
            <div class="text-xs text-gray-500">{t(CRITERION_LABELS[criterion])}</div>
            <ImpactValue
                criterion={criterion}
                range={totals.impacts.total[criterion]}
                locale={locale}
                align={criterion === "energy" ? "start" : "end"}
                class="text-lg font-semibold text-gray-900"
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
        <ul class="space-y-1 text-xs text-gray-600">
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
            <h2 class="text-xs font-semibold text-gray-900">{t("equivalencesTitle")}</h2>
            <ul class="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-gray-700">
                {values.map(({ id, count }) => {
                    const label = EQUIVALENCE_LABELS[id];
                    if (!label) return null;
                    return <li key={id}>≈ {t(label, formatNumber(count, locale, 2))}</li>;
                })}
            </ul>
            <p class="mt-1 text-[10px] text-gray-400">{t("equivalencesSource")}</p>
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
            <h2 class="text-xs font-semibold text-gray-900">{title}</h2>
            <table class="mt-1 w-full text-xs">
                <thead class="text-gray-500">
                    <tr>
                        <th class="sr-only">{title}</th>
                        <th class="text-right font-normal">{t("criterionEnergy")}</th>
                        <th class="text-right font-normal">{t("criterionGwp")}</th>
                    </tr>
                </thead>
                <tbody class="text-gray-700">
                    {rows.map(({ key, label, sublabel, totals }) => (
                        <tr key={key} class="border-t border-gray-100">
                            <th scope="row" class="py-1 text-left font-medium">
                                {label}
                                {sublabel && (
                                    <span class="ml-1 font-normal text-gray-400">{sublabel}</span>
                                )}
                                <span class="block font-normal text-gray-400">
                                    {t("repliesCount", formatCount(totals.requests, locale))}
                                </span>
                            </th>
                            <td class="py-1 text-right">
                                <ImpactValue
                                    criterion="energy"
                                    range={totals.impacts.total.energy}
                                    locale={locale}
                                />
                            </td>
                            <td class="py-1 text-right">
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
            <span class="block text-[10px] text-gray-500">{label}</span>
            {children}
        </span>
    );
}

function Details({ totals }: { totals: Totals }) {
    const { total, usage, embodied } = totals.impacts;
    return (
        <details>
            <summary class="cursor-pointer text-xs font-semibold text-gray-900">
                {t("detailsTitle")}
            </summary>
            <dl class="mt-1 divide-y divide-gray-100 text-xs">
                {CRITERIA.map((criterion) => {
                    const embodiedRange = isEmbodiedCriterion(criterion)
                        ? embodied[criterion]
                        : null;
                    return (
                        <div key={criterion} class="py-1.5">
                            <dt class="font-medium text-gray-900">
                                {t(CRITERION_LABELS[criterion])}
                            </dt>
                            <dd class="mt-0.5 grid grid-cols-3 gap-2 text-gray-700">
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
                                        <span class="text-gray-400">–</span>
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

function AdapterStatuses() {
    const statuses = useStorageItem(adapterStatusItem);
    if (statuses === undefined) return null;
    return (
        <section>
            <h2 class="text-xs font-semibold text-gray-900">{t("adapterStatusTitle")}</h2>
            <ul class="mt-1 space-y-1 text-xs">
                {WEB_PROVIDERS.map((provider) => {
                    const status = statuses[provider] ?? emptyStatus(provider);
                    let dot = "bg-gray-300";
                    let text = t("adapterUnsupported");
                    if (SUPPORTED_PROVIDERS.includes(provider)) {
                        const health = adapterHealth(status);
                        if (health === "ok") {
                            dot = "bg-emerald-500";
                            text = t("adapterOk", formatDateTime(status.lastSuccessAt!, locale));
                        } else if (health === "failing") {
                            dot = "bg-red-500";
                            text = t("adapterFailing", [
                                formatDateTime(status.lastFailureAt!, locale),
                                status.lastError ?? "",
                            ]);
                        } else {
                            dot = "bg-gray-400";
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
                                <span class="font-medium text-gray-900">
                                    {PROVIDER_NAMES[provider]}
                                </span>{" "}
                                <span class="break-words text-gray-600">{text}</span>
                            </span>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

function Usage({ period }: { period: Period }) {
    const aggregates = useStorageItem(aggregatesItem);
    if (aggregates === undefined) return null;
    const summary = summarize(aggregates, period);
    const { total } = summary;
    if (total === null) return <p class="py-4 text-center text-gray-600">{t("popupEmpty")}</p>;
    return (
        <>
            <div class="grid grid-cols-2 gap-2">
                <Headline totals={total} criterion="energy" />
                <Headline totals={total} criterion="gwp" />
            </div>
            <p class="text-xs text-gray-500">
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

export function App() {
    const [period, setPeriod] = useState<Period>("today");
    return (
        <main class="w-96 space-y-4 p-4 font-sans text-sm text-gray-900">
            <header class="flex items-center justify-between">
                <h1 class="text-base font-semibold">{t("extName")}</h1>
                <button
                    type="button"
                    onClick={() => void browser.runtime.openOptionsPage()}
                    class="text-xs font-medium text-emerald-700 hover:underline"
                >
                    {t("openOptions")}
                </button>
            </header>
            <PeriodSelector value={period} onChange={setPeriod} />
            <Usage period={period} />
            <AdapterStatuses />
            <footer class="text-[10px] text-gray-400">{t("poweredBy", ECOLOGITS_VERSION)}</footer>
        </main>
    );
}
