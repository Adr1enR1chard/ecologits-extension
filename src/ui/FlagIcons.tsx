import { t } from "../i18n";
import type { ImpactFlags } from "../messaging";
import { FLAG_INFO, type Flag } from "./labels";
import { Tooltip } from "./Tooltip";

/** The symbol of a flag, as shown in the badge and the popup. */
export function FlagSymbol({ flag }: { flag: Flag }) {
    return (
        <span
            aria-hidden="true"
            class="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-current/40 text-[10px] leading-none font-semibold"
        >
            {FLAG_INFO[flag].symbol}
        </span>
    );
}

/** A flag symbol with its explanation on hover. */
export function FlagIcon({ flag, align }: { flag: Flag; align?: "start" | "center" | "end" }) {
    const info = FLAG_INFO[flag];
    return (
        <Tooltip
            align={align}
            content={
                <>
                    <span class="block font-semibold">{t(info.title)}</span>
                    {t(info.help)}
                </>
            }
        >
            <FlagSymbol flag={flag} />
            <span class="sr-only">{t(info.title)}</span>
        </Tooltip>
    );
}

/** One icon per raised flag. */
export function FlagIcons({ flags }: { flags: ImpactFlags }) {
    const raised = (Object.keys(FLAG_INFO) as Flag[]).filter((flag) => flags[flag]);
    return (
        <>
            {raised.map((flag) => (
                <FlagIcon key={flag} flag={flag} />
            ))}
        </>
    );
}
