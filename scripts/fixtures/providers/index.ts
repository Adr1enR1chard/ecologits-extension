import type { SupportedProvider } from "../../../src/providers/registry";
import { chatgptRules } from "./chatgpt";
import { claudeRules } from "./claude";
import type { FixtureRules } from "./types";

export const FIXTURE_RULES: Readonly<Record<SupportedProvider, FixtureRules>> = {
    chatgpt: chatgptRules,
    claude: claudeRules,
};
