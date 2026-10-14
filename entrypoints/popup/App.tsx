import { t } from "@/src/i18n";

export function App() {
    return (
        <main class="w-80 p-4 font-sans text-sm text-gray-900">
            <h1 class="text-base font-semibold">{t("extName")}</h1>
            <p class="mt-2 text-gray-600">{t("popupEmpty")}</p>
        </main>
    );
}
