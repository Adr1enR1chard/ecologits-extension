import { chatgptMeta } from "./chatgpt/meta";
import { claudeMeta } from "./claude/meta";
import { geminiMeta } from "./gemini/meta";
import type { ProviderMeta } from "./types";

/**
 * Every provider, in display order. Dependency-free: imported by every context, the main-world
 * interceptor included. Per-context registries: `capture.ts`, `models.ts`, `page.ts`.
 */
export const PROVIDERS = [chatgptMeta, claudeMeta, geminiMeta] as const;

type Meta = (typeof PROVIDERS)[number];

export type WebProvider = Meta["id"];
/** Providers whose replies are captured; the others are announced in the popup. */
export type SupportedProvider = Extract<Meta, { status: "supported" }>["id"];

export const WEB_PROVIDERS: readonly WebProvider[] = PROVIDERS.map((p) => p.id);

export const SUPPORTED_PROVIDERS = PROVIDERS.filter((p) => p.status === "supported").map(
    (p) => p.id,
) as readonly SupportedProvider[];

export const PROVIDER_META = Object.fromEntries(
    PROVIDERS.map((p): [WebProvider, ProviderMeta] => [p.id, p]),
) as Readonly<Record<WebProvider, ProviderMeta>>;

export function isSupportedProvider(value: unknown): value is SupportedProvider {
    return (SUPPORTED_PROVIDERS as readonly unknown[]).includes(value);
}

export function providerForHost(hostname: string): WebProvider | null {
    return PROVIDERS.find((p) => (p.hosts as readonly string[]).includes(hostname))?.id ?? null;
}

/** Content script match patterns for the given providers. */
export function matchPatterns(...providers: WebProvider[]): string[] {
    return providers.flatMap((p) => PROVIDER_META[p].hosts.map((host) => `https://${host}/*`));
}
