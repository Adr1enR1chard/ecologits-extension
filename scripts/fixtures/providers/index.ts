import { chatgptRules } from "./chatgpt";
import { claudeRules } from "./claude";
import type { FixtureRules } from "./types";

export const FIXTURE_RULES = {
    chatgpt: chatgptRules,
    claude: claudeRules,
} satisfies Record<string, FixtureRules>;

export type FixtureProvider = keyof typeof FIXTURE_RULES;
