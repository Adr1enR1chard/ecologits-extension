/**
 * Development-only page showing the UI with sample data, in a chosen theme and language:
 * `gallery.html?theme=dark&lang=fr`. Left out of production builds (see `wxt.config.ts`).
 */
import { render } from "preact";
import "@/src/styles/tailwind.css";
import en from "@/public/_locales/en/messages.json";
import fr from "@/public/_locales/fr/messages.json";

interface Entry {
    message: string;
    placeholders?: Record<string, { content: string }>;
}

const LOCALES: Record<string, Record<string, Entry>> = { en, fr };
const params = new URLSearchParams(location.search);
const lang = params.get("lang") ?? "en";
const theme = params.get("theme");

// Messages of the chosen language instead of the browser's, resolved like `browser.i18n`.
const messages: Record<string, Entry> = LOCALES[lang] ?? en;
browser.i18n.getMessage = ((key: string, substitutions?: string | string[]) => {
    if (key === "@@ui_locale") return lang;
    const entry = messages[key];
    if (!entry) return "";
    const subs = [substitutions ?? []].flat();
    return entry.message.replace(/\$(\w+)\$/g, (_, name: string) => {
        const content = entry.placeholders?.[name.toLowerCase()]?.content ?? "";
        return content.replace(/\$(\d)/g, (_m, i: string) => subs[Number(i) - 1] ?? "");
    });
}) as typeof browser.i18n.getMessage;

// The `scheme-*` classes, not an inline `color-scheme`: the tokens rely on what they set.
if (theme === "light" || theme === "dark")
    document.documentElement.classList.add(`scheme-${theme}`);
document.documentElement.lang = lang;

// After the messages are replaced: the UI reads its locale when imported.
const { Gallery } = await import("./Gallery");
render(<Gallery lang={lang} theme={theme} />, document.getElementById("app")!);
