import { ECOLOGITS_VERSION } from "@/src/impacts/version";
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { t, uiLocale } from "@/src/i18n";
import { modelLabel } from "@/src/messaging";
import { proxyEntries } from "@/src/providers/models";
import { PROVIDER_META } from "@/src/providers/registry";
import { getAggregates } from "@/src/storage/aggregates";
import { MAX_EVENTS, getEvents } from "@/src/storage/events";
import { aggregatesToCsv, eventsToCsv, toJsonExport } from "@/src/storage/export";
import { settingsItem, updateSettings, withDefaults } from "@/src/storage/settings";
import { sendToBackground } from "@/src/ui/background";
import { FlagSymbol } from "@/src/ui/FlagIcons";
import { downloadFile, exportFileName } from "@/src/ui/download";
import { formatCount } from "@/src/ui/format";
import { useStorageItem } from "@/src/ui/hooks";
import { LogoMark } from "@/src/ui/Leaf";
import { FLAG_INFO, type Flag } from "@/src/ui/labels";

const CSV = "text/csv;charset=utf-8";
const JSON_TYPE = "application/json";

function Section({ title, children }: { title: string; children: ComponentChildren }) {
    return (
        <section class="space-y-3 rounded-xl border border-line p-5">
            <h2 class="text-base font-semibold text-fg">{title}</h2>
            {children}
        </section>
    );
}

function DisplaySettings() {
    const stored = useStorageItem(settingsItem);
    if (stored === undefined) return null;
    const settings = withDefaults(stored);
    return (
        <Section title={t("optionsDisplay")}>
            <label class="flex cursor-pointer items-start gap-3">
                <input
                    type="checkbox"
                    class="focus-ring mt-0.5 size-4 shrink-0 accent-brand"
                    checked={settings.showBadge}
                    onChange={(e) => void updateSettings({ showBadge: e.currentTarget.checked })}
                />
                <span>
                    <span class="block font-medium">{t("optionsShowBadge")}</span>
                    <span class="text-fg-muted">{t("optionsShowBadgeHelp")}</span>
                </span>
            </label>
        </Section>
    );
}

const BUTTON =
    "focus-ring inline-flex items-center gap-2 rounded-md border border-line-strong bg-raised px-3 py-1.5 text-left font-medium text-fg hover:bg-surface";

function DownloadIcon() {
    return (
        <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            class="size-4 shrink-0 text-fg-muted"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
        >
            <path d="M8 2.5v8m-3.5-3.5L8 10.5 11.5 7M3 13.5h10" />
        </svg>
    );
}

function DataSettings() {
    const [cleared, setCleared] = useState(false);
    const exportAggregates = async () => {
        downloadFile(
            exportFileName("aggregates", "csv"),
            aggregatesToCsv(await getAggregates()),
            CSV,
        );
    };
    const exportEvents = async () => {
        downloadFile(exportFileName("events", "csv"), eventsToCsv(await getEvents()), CSV);
    };
    const exportJson = async () => {
        const [aggregates, events] = await Promise.all([getAggregates(), getEvents()]);
        downloadFile(exportFileName("data", "json"), toJsonExport(aggregates, events), JSON_TYPE);
    };
    const clear = async () => {
        if (!window.confirm(t("clearDataConfirm"))) return;
        // Through the background, so the clear is ordered with the replies it records.
        await sendToBackground({ type: "clear-usage-data" });
        setCleared(true);
    };
    return (
        <Section title={t("optionsData")}>
            <p class="text-fg-muted">{t("optionsDataHelp")}</p>
            <div class="flex flex-wrap gap-2">
                <button type="button" class={BUTTON} onClick={() => void exportAggregates()}>
                    <DownloadIcon />
                    {t("exportAggregatesCsv")}
                </button>
                <button type="button" class={BUTTON} onClick={() => void exportEvents()}>
                    <DownloadIcon />
                    {t("exportEventsCsv", formatCount(MAX_EVENTS, uiLocale()))}
                </button>
                <button type="button" class={BUTTON} onClick={() => void exportJson()}>
                    <DownloadIcon />
                    {t("exportJson")}
                </button>
            </div>
            {/* Destructive, so set apart from the exports. */}
            <div class="flex flex-wrap items-center gap-3 border-t border-line pt-3">
                <button
                    type="button"
                    class="focus-ring rounded-md border border-danger-line bg-danger-surface px-3 py-1.5 font-medium text-danger hover:border-danger"
                    onClick={() => void clear()}
                >
                    {t("clearData")}
                </button>
                <p role="status" class="text-accent">
                    {cleared && t("clearDataDone")}
                </p>
            </div>
        </Section>
    );
}

/** Every proxy, from the model mappings: dropping one removes it here. */
function Proxies() {
    const proxies = proxyEntries();
    if (proxies.length === 0) return null;
    return (
        <>
            <p>{t("methodologyProxies")}</p>
            <ul class="list-disc space-y-1 pl-5">
                {proxies.map(({ provider, slug, model }) => (
                    <li key={`${provider}/${slug}`}>
                        {t("methodologyProxy", [
                            PROVIDER_META[provider].name,
                            slug,
                            modelLabel(model),
                        ])}
                    </li>
                ))}
            </ul>
        </>
    );
}

function Methodology() {
    return (
        <Section title={t("optionsMethodology")}>
            <div class="max-w-prose space-y-3 leading-relaxed text-fg-muted">
                <p>{t("methodologyEcologits", ECOLOGITS_VERSION)}</p>
                <p>{t("methodologyTokenizer")}</p>
                <Proxies />
            </div>
            <dl class="space-y-3 rounded-lg bg-surface p-4">
                {(Object.keys(FLAG_INFO) as Flag[]).map((flag) => (
                    <div key={flag}>
                        <dt class="flex items-center gap-2 font-medium text-fg">
                            <FlagSymbol flag={flag} />
                            {t(FLAG_INFO[flag].title)}
                        </dt>
                        <dd class="mt-0.5 pl-6 text-fg-muted">{t(FLAG_INFO[flag].help)}</dd>
                    </div>
                ))}
            </dl>
            <p class="max-w-prose leading-relaxed text-fg-muted">{t("methodologyMix")}</p>
            <p>
                <a
                    href="https://ecologits.ai/latest/methodology/"
                    target="_blank"
                    rel="noreferrer"
                    class="focus-ring rounded-sm font-medium text-accent hover:underline"
                >
                    {t("methodologyLink")}
                </a>
            </p>
            <p class="text-xs text-fg-subtle">
                {t("aboutVersion", browser.runtime.getManifest().version)}
            </p>
        </Section>
    );
}

export function App() {
    return (
        <main class="mx-auto max-w-2xl space-y-6 px-4 py-8 font-sans text-sm text-fg sm:px-8">
            <h1 class="flex items-center gap-3 text-xl font-semibold">
                <LogoMark />
                {t("optionsTitle")}
            </h1>
            <DisplaySettings />
            <DataSettings />
            <Methodology />
        </main>
    );
}
