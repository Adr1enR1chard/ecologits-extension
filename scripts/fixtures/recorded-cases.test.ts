import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { describeAdapterContract, parseText } from "../../src/capture/adapter-contract";
import { findEndpoint } from "../../src/capture/interceptor";
import type { CapturedRequest, ParseOutcome, ReplyEndpoint } from "../../src/capture/types";
import { CAPTURES } from "../../src/providers/capture";
import { SUPPORTED_PROVIDERS } from "../../src/providers/registry";
import { FIXTURE_CASES } from "./cases";
import type { FixtureCase } from "./cases/types";

/**
 * Replays every recorded case against the parser of its endpoint: the outcome must be the one
 * the case asks the person to record (a reply, a partial one, a skip), whatever the provider and
 * whatever the recorded values, so that recording a case again never breaks a test.
 */

const FIXTURES = join(import.meta.dirname, "../../test/fixtures");

interface Recorded {
    fixture: FixtureCase;
    endpoint: ReplyEndpoint;
    request: CapturedRequest;
    text: string;
}

describe.each(SUPPORTED_PROVIDERS)("%s recorded cases", (provider) => {
    const recorded: Recorded[] = FIXTURE_CASES[provider].map((fixture) => {
        const request = { url: new URL(fixture.endpoint), method: "POST", body: null };
        const matched = findEndpoint(CAPTURES, request);
        if (matched?.provider !== provider) {
            throw new Error(`${fixture.id}: no ${provider} endpoint for ${fixture.endpoint}`);
        }
        const text = readFileSync(join(FIXTURES, provider, fixture.file), "utf8");
        return { fixture, endpoint: matched.endpoint, request, text };
    });

    for (const endpoint of new Set(recorded.map((r) => r.endpoint))) {
        const cases = recorded.filter((r) => r.endpoint === endpoint);
        describeAdapterContract(
            `${provider} ${endpoint.path}`,
            endpoint,
            cases[0]!.request,
            Object.fromEntries(cases.map((r) => [r.fixture.id, r.text])),
        );
    }

    describe.each(recorded)("$fixture.id", ({ fixture, endpoint, request, text }) => {
        const outcome = parseText(endpoint, request, text, Infinity, fixture.expect.end);

        it(`is a ${fixture.expect.outcome}`, () => {
            const kind =
                outcome.kind === "skip" ? "skip" : outcome.reply.partial ? "partial" : "reply";
            expect(kind).toBe(fixture.expect.outcome);
        });

        if (fixture.expect.outcome !== "skip") {
            it("has an output and a message id", () => {
                expect(outcome.kind).toBe("reply");
                const { reply } = outcome as Extract<ParseOutcome, { kind: "reply" }>;
                expect(reply.outputText).not.toBe("");
                expect(reply.messageId).toEqual(expect.any(String));
            });
        }

        if (fixture.expect.outcome === "partial") {
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
