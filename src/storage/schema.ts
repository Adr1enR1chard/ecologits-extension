/** Version of every stored item; bump it and add WXT `migrations` when a shape changes. */
export const SCHEMA_VERSION = 2;

let queue: Promise<unknown> = Promise.resolve();

/**
 * Runs read-modify-write tasks one after another, so concurrent replies handled by the
 * service worker never overwrite each other's updates.
 */
export function serialize<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
}
