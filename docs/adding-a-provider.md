# Adding a provider

Everything specific to a provider lives in `src/providers/<id>/`, one file per execution context:

| File         | Context                                  | Contents                                                                               |
| ------------ | ---------------------------------------- | -------------------------------------------------------------------------------------- |
| `meta.ts`    | every context, the main-world script too | `ProviderMeta`: id, name, hosts, status, logo. Type imports only                       |
| `capture.ts` | main-world interceptor only              | `ProviderCapture`: reply endpoints `{ method, path, createParser }`, stream parser     |
| `models.ts`  | background                               | `ProviderModels`: EcoLogits provider, fallback model, aliases, proxies, `canonicalize` |
| `page.ts`    | bridge content script (badge)            | `ProviderPage`: reply markups, `isNewConversation`                                     |

Keep them apart: an object grouping all four would make the interceptor, injected into the page,
bundle EcoLogits and DOM code. Code that two contexts share, such as a slug grammar, goes into
its own dependency-free file (see `chatgpt/slugs.ts`).

## Announcing a provider

A provider shown in the popup as coming soon only needs `meta.ts` with `status: "planned"`, listed
in `PROVIDERS` (`src/providers/registry.ts`). The order of `PROVIDERS` is the display order.

## Supporting it

1. Copy `src/providers/claude/` to `src/providers/<id>/` and set `status: "supported"` in
   `meta.ts`. The `id` is stored with every result and adapter status: never rename it.
2. List the provider's stream keys the anonymiser keeps (structural values), maps (ids) or
   redacts (tokens, account details) in `scripts/fixtures/providers/<id>.ts`, copied from
   `claude.ts`. Record fixtures in `test/fixtures/<id>/` and anonymise them with
   `anonymiseStream` (procedure in `test/fixtures/README.md`), then write the parser in
   `capture.ts`. Stream decoders and JSON helpers are in `src/capture/decoders/` (`SseDecoder`,
   `NdjsonDecoder`, `parseJson`, `isObject`). Hosts are checked by the interceptor: endpoints
   only declare a method (`POST` by default) and a path.
3. In `capture.test.ts`, run `describeAdapterContract` (`src/capture/adapter-contract.ts`) on
   every fixture, then test the provider's own cases.
4. Fill in `models.ts`; test the slugs of the web app in `models.test.ts`. A proxy stands in, as
   one EcoLogits model or a `{ low, high }` range, for a web model EcoLogits does not know yet;
   its estimates are flagged as approximated.
5. Fill in `page.ts` with the markup of finished replies and where the badge goes. Save a DOM
   snapshot of a conversation per markup in `test/fixtures/<id>/<case>.html`, sanitised with
   `sanitiseSnapshot` (`scripts/fixtures/snapshot.ts`). List them in
   `src/providers/page-snapshots.ts` and replay them in `page.test.ts` with
   `describePageSnapshots("<id>")` (`src/providers/page-contract.ts`).
6. Add one line to each registry: `src/providers/capture.ts`, `models.ts` and `page.ts`, and
   `scripts/fixtures/providers/index.ts` for the fixture rules. They are typed
   `Record<SupportedProvider, …>`: the compiler flags a missing one. In
   `scripts/fixtures/anonymise.test.ts`, add the provider to the fixtures it replays and its
   endpoint to `parserFor`.
7. Run `pnpm test`: `src/providers/registry.test.ts` checks that every supported provider has an
   endpoint, a markup and a fallback model EcoLogits knows, that aliases and proxies point to
   models EcoLogits knows, that no proxy shadows a model EcoLogits knows, that hosts are unique
   and that every locale's `extDescription` names the provider.
   `scripts/fixtures/anonymise.test.ts` checks that anonymising the fixtures leaves the parser's
   outcome unchanged, and `scripts/fixtures/no-personal-data.test.ts` that no fixture holds an
   email address, a UUID not of the zeroed form or a token.
8. Update the rest by hand:
    - `public/_locales/{en,fr}/messages.json`: `extDescription`, and `methodologyTokenizer` when
      the provider's tokenizer is not public;
    - `README.md` (supported providers), `test/fixtures/README.md` (fixture table);
    - tick the provider's phase issue on GitHub;
    - optionally, sample data in `entrypoints/gallery/samples.ts`.
9. Check end to end in Chrome and Firefox with `pnpm dev`: one stored event per reply, a badge
   under each reply.
