import { chatgptMeta } from "./chatgpt/meta";
import { claudeMeta } from "./claude/meta";
import { geminiMeta } from "./gemini/meta";
import type { ProviderMeta } from "./types";

/**
 * Every provider, in display order. Dependency-free: imported by every context, the main-world
 * interceptor included. Per-context registries, found from the provider folders: `capture.ts`,
 * `models.ts`, `page.ts`.
 */
export const PROVIDERS = [chatgptMeta, claudeMeta, geminiMeta] as const;

type Meta = (typeof PROVIDERS)[number];

export type WebProvider = Meta["id"];
/** Providers whose replies are captured for users. */
export type SupportedProvider = Extract<Meta, { status: "supported" }>["id"];
/** Providers whose replies may be captured: supported ones, and beta ones in development. */
export type CapturedProvider = Extract<Meta, { status: "supported" | "beta" }>["id"];

export const WEB_PROVIDERS: readonly WebProvider[] = PROVIDERS.map((p) => p.id);

export const SUPPORTED_PROVIDERS = PROVIDERS.filter((p) => p.status === "supported").map(
    (p) => p.id,
) as readonly SupportedProvider[];

/** `import.meta.env` is undefined outside Vite, in the fixture scripts. */
const DEVELOPMENT = import.meta.env?.DEV === true;

/** The providers captured by this build: beta ones only in development. */
export const CAPTURED_PROVIDERS = PROVIDERS.filter(
    ({ status }: ProviderMeta) => status === "supported" || (DEVELOPMENT && status === "beta"),
).map((p) => p.id) as readonly CapturedProvider[];

export const PROVIDER_META = Object.fromEntries(
    PROVIDERS.map((p): [WebProvider, ProviderMeta] => [p.id, p]),
) as Readonly<Record<WebProvider, ProviderMeta>>;

/** Whether this build captures the replies of that provider. */
export function isCapturedProvider(value: unknown): value is CapturedProvider {
    return (CAPTURED_PROVIDERS as readonly unknown[]).includes(value);
}

export function providerForHost(hostname: string): WebProvider | null {
    return PROVIDERS.find((p) => (p.hosts as readonly string[]).includes(hostname))?.id ?? null;
}

/** Content script match patterns for the given providers. */
export function matchPatterns(...providers: WebProvider[]): string[] {
    return providers.flatMap((p) => PROVIDER_META[p].hosts.map((host) => `https://${host}/*`));
}

/**
 * The default exports of `./<id>/<file>.ts`, as `import.meta.glob` finds them, by provider: only
 * those of the providers this build captures.
 */
export function byProvider<T>(
    modules: Readonly<Record<string, T>>,
): Readonly<Partial<Record<CapturedProvider, T>>> {
    return Object.fromEntries(
        Object.entries(modules).flatMap(([path, module]) => {
            const provider = path.split("/")[1];
            return isCapturedProvider(provider) ? [[provider, module]] : [];
        }),
    );
}
