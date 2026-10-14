import { useEffect, useState } from "preact/hooks";
import type { WxtStorageItem } from "wxt/utils/storage";

/** Current value of a storage item, kept up to date; `undefined` until first read. */
export function useStorageItem<T>(item: WxtStorageItem<T, Record<string, unknown>>): T | undefined {
    const [value, setValue] = useState<T>();
    useEffect(() => {
        let active = true;
        void item.getValue().then((v) => {
            if (active) setValue(v);
        });
        const unwatch = item.watch((v) => setValue(v));
        return () => {
            active = false;
            unwatch();
        };
    }, [item]);
    return value;
}
