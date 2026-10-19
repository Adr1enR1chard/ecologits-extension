import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { describeAdapterContract, parseText } from "../src/capture/adapter-contract";
import type { CapturedRequest, ParseOutcome, ReplyEndpoint } from "../src/capture/types";
import { CAPTURED_PROVIDERS } from "../src/providers/registry";
import { FIXTURES, fixtureRequest } from "./fixtures";
import type { RecordedCase } from "./fixtures/provider-fixtures";

/**
 * Replays every recorded stream against the parser of its endpoint: the outcome must be the one
 * the case is recorded for (a reply, a partial one, a skip), whatever the provider and whatever
 * the recorded values, so that recording a case again never breaks a test. How to record each
 * case is its `howToRecord`, in `fixtures/<provider>/fixtures.ts`.
 */

const FIXTURE_DIR = join(import.meta.dirname, "fixtures");

interface Recorded {
    fixture: RecordedCase;
    endpoint: ReplyEndpoint;
    request: CapturedRequest;
    text: string;
}

const PROVIDERS = CAPTURED_PROVIDERS.filter((provider) => FIXTURES[provider]?.cases.length);

describe.each(PROVIDERS)("%s recorded cases", (provider) => {
    const { endpoints, cases } = FIXTURES[provider]!;
    const recorded: Recorded[] = cases.map((fixture) => {
        const url = endpoints[fixture.endpoint]!;
        const { request, matched } = fixtureRequest(url);
        if (matched?.provider !== provider) {
            throw new Error(`${fixture.file}: no ${provider} endpoint for ${url}`);
        }
        const text = readFileSync(join(FIXTURE_DIR, provider, fixture.file), "utf8");
        return { fixture, endpoint: matched.endpoint, request, text };
    });

    for (const endpoint of new Set(recorded.map((r) => r.endpoint))) {
        const cases = recorded.filter((r) => r.endpoint === endpoint);
        describeAdapterContract(
            `${provider} ${endpoint.path}`,
            endpoint,
            cases[0]!.request,
            Object.fromEntries(cases.map((r) => [r.fixture.file, r.text])),
        );
    }

    describe.each(recorded)("$fixture.file", ({ fixture, endpoint, request, text }) => {
        const outcome = parseText(endpoint, request, text, Infinity, fixture.end);

        it(`is a ${fixture.outcome}`, () => {
            const kind =
                outcome.kind === "skip" ? "skip" : outcome.reply.partial ? "partial" : "reply";
            expect(kind).toBe(fixture.outcome);
        });

        if (fixture.outcome !== "skip") {
            it("has an output and a message id", () => {
                expect(outcome.kind).toBe("reply");
                const { reply } = outcome as Extract<ParseOutcome, { kind: "reply" }>;
                expect(reply.outputText).not.toBe("");
                expect(reply.messageId).toEqual(expect.any(String));
            });
        }

        if (fixture.outcome === "partial") {
            it("is skipped when cut by a network error or a closed stream instead", () => {
                for (const end of ["done", "failed"] as const) {
                    expect(parseText(endpoint, request, text, Infinity, end)).toMatchObject({
                        kind: "skip",
                    });
                }
            });
        }

        if (fixture.check) {
            it("is still what the case asks for", () => {
                expect(fixture.check!(outcome, text)).toBeUndefined();
            });
        }
    });
});
