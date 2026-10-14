import type { WebProvider } from "./messaging";

/** Hostnames each provider's web app is served from. */
export const PROVIDER_HOSTS: Readonly<Record<WebProvider, readonly string[]>> = {
    chatgpt: ["chatgpt.com", "chat.openai.com"],
    claude: ["claude.ai"],
    gemini: ["gemini.google.com"],
};

export function providerForHost(hostname: string): WebProvider | null {
    for (const [provider, hosts] of Object.entries(PROVIDER_HOSTS)) {
        if (hosts.includes(hostname)) return provider as WebProvider;
    }
    return null;
}

/** Content script match patterns for the given providers. */
export function matchPatterns(...providers: WebProvider[]): string[] {
    return providers.flatMap((p) => PROVIDER_HOSTS[p].map((host) => `https://${host}/*`));
}
