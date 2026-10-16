import type { SupportedProvider } from "../../../src/providers/registry";
import { chatgptCases } from "./chatgpt";
import { claudeCases } from "./claude";
import type { FixtureCase } from "./types";

/** The fixtures `pnpm fixtures:record <provider>` records, in order. */
export const FIXTURE_CASES: Readonly<Record<SupportedProvider, readonly FixtureCase[]>> = {
    chatgpt: chatgptCases,
    claude: claudeCases,
};
