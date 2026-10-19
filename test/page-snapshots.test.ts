// @vitest-environment happy-dom
import { describePageSnapshots } from "../src/providers/page-contract";
import { CAPTURED_PROVIDERS } from "../src/providers/registry";

/** Replays the DOM snapshots of every provider against its reply markups. */
for (const provider of CAPTURED_PROVIDERS) describePageSnapshots(provider);
