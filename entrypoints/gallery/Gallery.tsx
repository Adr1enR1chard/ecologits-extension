import type { ComponentChildren } from "preact";
import { Badge } from "@/src/badge/Badge";
import type { ColorScheme } from "@/src/badge/theme";
import { uiLocale } from "@/src/i18n";
import { App as Options } from "../options/App";
import { Popup } from "../popup/App";
import { healthyStatuses, sampleAggregates, sampleResult, sampleStatuses } from "./samples";

const locale = uiLocale();

/** Approximate reply colors of the provider pages, to check the badge against. */
const HOSTS: { name: string; background: string; text: string; scheme: ColorScheme }[] = [
    { name: "ChatGPT light", background: "#ffffff", text: "#0d0d0d", scheme: "light" },
    { name: "ChatGPT dark", background: "#212121", text: "#ececec", scheme: "dark" },
    { name: "Claude light", background: "#faf9f5", text: "#3d3d3a", scheme: "light" },
    { name: "Claude dark", background: "#262624", text: "#c3c2b7", scheme: "dark" },
];

const BADGE_RESULTS = [
    sampleResult(),
    sampleResult({ flags: { lowerBound: true, approximatedModel: false } }),
    sampleResult({
        provider: "claude",
        rawModel: "claude-next",
        model: "claude-sonnet-5-5",
        flags: { lowerBound: true, approximatedModel: true },
    }),
];

const POPUPS = [
    {
        title: "Popup, several providers, a failing capture",
        surface: "popup",
        aggregates: sampleAggregates(),
        statuses: sampleStatuses(),
    },
    {
        title: "Popup, one provider",
        surface: "popup-one-provider",
        aggregates: sampleAggregates(Date.now(), ["chatgpt"]),
        statuses: healthyStatuses(),
    },
    { title: "Popup, empty", surface: "popup-empty", aggregates: {}, statuses: {} },
];

function Frame({ title, children }: { title: string; children: ComponentChildren }) {
    return (
        <section class="space-y-2">
            <h2 class="text-xs font-semibold tracking-wide text-fg-subtle uppercase">{title}</h2>
            {children}
        </section>
    );
}

function Link({ href, children }: { href: string; children: ComponentChildren }) {
    return (
        <a class="focus-ring rounded-sm text-accent hover:underline" href={href}>
            {children}
        </a>
    );
}

export function Gallery({ lang, theme }: { lang: string; theme: string | null }) {
    const query = (changes: Record<string, string>) =>
        "?" + new URLSearchParams({ lang, theme: theme ?? "system", ...changes }).toString();
    return (
        <div class="space-y-10 p-8 font-sans text-sm">
            <nav class="flex flex-wrap gap-4 text-xs" aria-label="Gallery settings">
                <Link href={query({ theme: "light" })}>Light</Link>
                <Link href={query({ theme: "dark" })}>Dark</Link>
                <Link href={query({ theme: "system" })}>System</Link>
                <span aria-hidden="true">·</span>
                <Link href={query({ lang: "en" })}>English</Link>
                <Link href={query({ lang: "fr" })}>Français</Link>
            </nav>
            <Frame title="Badge">
                <div class="grid gap-3 sm:grid-cols-2">
                    {HOSTS.map((host) => (
                        <div
                            key={host.name}
                            data-host={host.name}
                            class="rounded-lg border border-line p-4 pt-32"
                            style={{
                                background: host.background,
                                color: host.text,
                                "--ecologits-fg": host.text,
                            }}
                        >
                            <p class="mb-2 text-xs opacity-60">{host.name}</p>
                            {BADGE_RESULTS.map((result, i) => (
                                <Badge
                                    key={i}
                                    result={result}
                                    locale={locale}
                                    scheme={host.scheme}
                                />
                            ))}
                        </div>
                    ))}
                </div>
            </Frame>
            <div class="flex flex-wrap items-start gap-8">
                {POPUPS.map(({ title, surface, aggregates, statuses }) => (
                    <Frame key={surface} title={title}>
                        <div
                            data-surface={surface}
                            class="w-fit rounded-lg border border-line bg-canvas"
                        >
                            <Popup aggregates={aggregates} statuses={statuses} />
                        </div>
                    </Frame>
                ))}
            </div>
            <Frame title="Options">
                <div data-surface="options" class="rounded-lg border border-line bg-canvas">
                    <Options />
                </div>
            </Frame>
        </div>
    );
}
