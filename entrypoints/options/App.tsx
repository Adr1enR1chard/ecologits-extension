import { ECOLOGITS_VERSION } from "@/src/impacts/version";
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { t, uiLocale } from "@/src/i18n";
import { getAggregates } from "@/src/storage/aggregates";
import { MAX_EVENTS, getEvents } from "@/src/storage/events";
import { aggregatesToCsv, eventsToCsv, toJsonExport } from "@/src/storage/export";
import { settingsItem, updateSettings, withDefaults } from "@/src/storage/settings";
import { sendToBackground } from "@/src/ui/background";
import { FlagSymbol } from "@/src/ui/FlagIcons";
import { downloadFile, exportFileName } from "@/src/ui/download";
import { formatCount } from "@/src/ui/format";
import { useStorageItem } from "@/src/ui/hooks";
import { FLAG_INFO, type Flag } from "@/src/ui/labels";

const CSV = "text/csv;charset=utf-8";
const JSON_TYPE = "application/json";

function Section({ title, children }: { title: string; children: ComponentChildren }) {
    return (
        <section class="space-y-3">
            <h2 class="text-base font-semibold text-gray-900">{title}</h2>
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
            <label class="flex items-start gap-3">
                <input
                    type="checkbox"
                    class="mt-1 size-4 accent-emerald-600"
                    checked={settings.showBadge}
                    onChange={(e) => void updateSettings({ showBadge: e.currentTarget.checked })}
                />
                <span>
                    <span class="block font-medium">{t("optionsShowBadge")}</span>
                    <span class="text-gray-600">{t("optionsShowBadgeHelp")}</span>
                </span>
            </label>
        </Section>
    );
}

const BUTTON =
    "rounded-md border border-gray-300 px-3 py-1.5 text-left font-medium hover:bg-gray-50";

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
            <p class="text-gray-600">{t("optionsDataHelp")}</p>
            <div class="flex flex-col items-start gap-2">
                <button type="button" class={BUTTON} onClick={() => void exportAggregates()}>
                    {t("exportAggregatesCsv")}
                </button>
                <button type="button" class={BUTTON} onClick={() => void exportEvents()}>
                    {t("exportEventsCsv", formatCount(MAX_EVENTS, uiLocale()))}
                </button>
                <button type="button" class={BUTTON} onClick={() => void exportJson()}>
                    {t("exportJson")}
                </button>
                <button
                    type="button"
                    class="rounded-md border border-red-300 px-3 py-1.5 font-medium text-red-700 hover:bg-red-50"
                    onClick={() => void clear()}
                >
                    {t("clearData")}
                </button>
                {cleared && (
                    <p role="status" class="text-emerald-700">
                        {t("clearDataDone")}
                    </p>
                )}
            </div>
        </Section>
    );
}

function Methodology() {
    return (
        <Section title={t("optionsMethodology")}>
            <p>{t("methodologyEcologits", ECOLOGITS_VERSION)}</p>
            <p>{t("methodologyTokenizer")}</p>
            <dl class="space-y-2">
                {(Object.keys(FLAG_INFO) as Flag[]).map((flag) => (
                    <div key={flag}>
                        <dt class="flex items-center gap-2 font-medium">
                            <FlagSymbol flag={flag} />
                            {t(FLAG_INFO[flag].title)}
                        </dt>
                        <dd class="text-gray-600">{t(FLAG_INFO[flag].help)}</dd>
                    </div>
                ))}
            </dl>
            <p>{t("methodologyMix")}</p>
            <p>
                <a
                    href="https://ecologits.ai/latest/methodology/"
                    target="_blank"
                    rel="noreferrer"
                    class="font-medium text-emerald-700 hover:underline"
                >
                    {t("methodologyLink")}
                </a>
            </p>
            <p class="text-xs text-gray-500">
                {t("aboutVersion", browser.runtime.getManifest().version)}
            </p>
        </Section>
    );
}

export function App() {
    return (
        <main class="mx-auto max-w-2xl space-y-8 p-8 font-sans text-sm text-gray-900">
            <h1 class="text-xl font-semibold">{t("optionsTitle")}</h1>
            <DisplaySettings />
            <DataSettings />
            <Methodology />
        </main>
    );
}
