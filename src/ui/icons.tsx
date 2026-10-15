import type { ComponentChildren, FunctionComponent } from "preact";
import type { EquivalenceId } from "../impacts/equivalences";
import type { Criterion } from "../messaging";
import { PROVIDER_META, type WebProvider } from "../providers/registry";

/*
 * Icons from Lucide (https://lucide.dev, ISC license), inlined to avoid a dependency. They are
 * decorative: whatever shows them also gives their meaning in text, visible or in a tooltip.
 */

interface IconProps {
    class?: string;
}

function Icon({
    class: className = "size-4",
    children,
}: IconProps & { children: ComponentChildren }) {
    return (
        <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class={`shrink-0 ${className}`}
        >
            {children}
        </svg>
    );
}

export function ZapIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
        </Icon>
    );
}

export function CloudIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
        </Icon>
    );
}

export function PickaxeIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <path d="M14.531 12.469 6.619 20.38a1 1 0 1 1-3-3l7.912-7.912" />
            <path d="M15.686 4.314A12.5 12.5 0 0 0 5.461 2.958 1 1 0 0 0 5.58 4.71a22 22 0 0 1 6.318 3.393" />
            <path d="M17.7 3.7a1 1 0 0 0-1.4 0l-4.6 4.6a1 1 0 0 0 0 1.4l2.6 2.6a1 1 0 0 0 1.4 0l4.6-4.6a1 1 0 0 0 0-1.4z" />
            <path d="M19.686 8.314a12.501 12.501 0 0 1 1.356 10.225 1 1 0 0 1-1.751-.119 22 22 0 0 0-3.393-6.319" />
        </Icon>
    );
}

export function FlameIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
        </Icon>
    );
}

export function DropletIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" />
        </Icon>
    );
}

export function SettingsIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
        </Icon>
    );
}

export function MessageIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </Icon>
    );
}

export function PilcrowIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <path d="M13 4v16" />
            <path d="M17 4v16" />
            <path d="M19 4H9.5a4.5 4.5 0 0 0 0 9H13" />
        </Icon>
    );
}

export function CarIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
            <circle cx="7" cy="17" r="2" />
            <path d="M9 17h6" />
            <circle cx="17" cy="17" r="2" />
        </Icon>
    );
}

export function PlayIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <circle cx="12" cy="12" r="10" />
            <path d="m10 8 6 4-6 4z" />
        </Icon>
    );
}

export function MailIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <rect width="20" height="16" x="2" y="4" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </Icon>
    );
}

export function SearchIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
        </Icon>
    );
}

export function InfoIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
        </Icon>
    );
}

export function ChevronRightIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <path d="m9 18 6-6-6-6" />
        </Icon>
    );
}

const CRITERION_ICONS = {
    energy: ZapIcon,
    gwp: CloudIcon,
    adpe: PickaxeIcon,
    pe: FlameIcon,
    wcf: DropletIcon,
} satisfies Record<Criterion, FunctionComponent<IconProps>>;

/** The icon standing for a criterion, wherever it is shown. */
export function CriterionIcon({ criterion, ...props }: IconProps & { criterion: Criterion }) {
    const Component = CRITERION_ICONS[criterion];
    return <Component {...props} />;
}

/** The icon of each equivalence of `impacts/equivalences.ts`. */
export const EQUIVALENCE_ICONS: Readonly<Record<EquivalenceId, FunctionComponent<IconProps>>> = {
    carKm: CarIcon,
    videoStreamingHour: PlayIcon,
    email: MailIcon,
    webSearch: SearchIcon,
};

export function ProviderLogo({
    provider,
    class: className = "size-4",
}: IconProps & { provider: WebProvider }) {
    return (
        <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="currentColor"
            class={`shrink-0 ${className}`}
        >
            <path d={PROVIDER_META[provider].logo} />
        </svg>
    );
}
