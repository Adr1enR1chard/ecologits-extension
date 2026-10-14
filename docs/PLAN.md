# EcoLogits Extension — Implementation Plan

Cross-browser extension that estimates the environmental impact (energy, GHG emissions, water, abiotic resources, primary energy) of generative AI usage on ChatGPT, Claude and Gemini, powered by [`@ecologits/ecologits.js`](https://www.npmjs.com/package/@ecologits/ecologits.js).

## 1. Decisions summary

| Topic              | Decision                                                                                                                                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework          | [WXT](https://wxt.dev) + TypeScript (strict) + Vite, package manager **pnpm**                                                                                                                                          |
| UI                 | **Preact** + **Tailwind CSS** (popup, options page, in-page badge)                                                                                                                                                     |
| Usage capture      | **Network interception** (patched `fetch` / SSE streams) in a main-world script, one adapter per provider. No DOM scraping in the MVP.                                                                                 |
| Impact computation | `llmImpacts()` from `@ecologits/ecologits.js@3.0.0`, run in the background service worker                                                                                                                              |
| Token counting     | `gpt-tokenizer` (`o200k_base`) for all providers; approximation documented for Claude/Gemini                                                                                                                           |
| Reasoning tokens   | Count visible output + streamed reasoning when available; flag hidden reasoning as **"lower-bound estimate"**                                                                                                          |
| Model names        | Per-provider mapping table (web slug → EcoLogits model ID), fallback model per provider, flag **"approximated model"**                                                                                                 |
| Electricity mix    | EcoLogits provider default (USA); no user setting in MVP                                                                                                                                                               |
| Storage            | `storage.local` only: daily aggregates per provider/model + rolling log of the last 500 events (metadata only, never message content)                                                                                  |
| Privacy            | 100% local, no telemetry, no network calls; CSV/JSON export                                                                                                                                                            |
| Display            | Badge: median energy (Wh) + CO₂eq (g), min–max range on hover, toggleable. Popup: totals (today / 7d / 30d / all-time) by provider & model, energy + CO₂eq first, water / ADPe / PE + usage vs embodied in detail view |
| Equivalences       | ADEME (Impact CO2) factors, stored in a sourced constants file                                                                                                                                                         |
| i18n               | English + French from MVP (WXT i18n)                                                                                                                                                                                   |
| Quality            | ESLint 9 (flat) + Prettier (4 spaces, double quotes, width 100), Vitest, fixture-based adapter tests (recorded SSE payloads), GitHub Actions CI. Playwright e2e post-MVP.                                              |
| Resilience         | Adapter parse failures are caught, never surface in the page, and are reported as adapter status in the popup                                                                                                          |
| License            | MPL-2.0 (aligned with EcoLogits)                                                                                                                                                                                       |
| Rollout order      | ChatGPT on Chrome + Firefox → Claude → Gemini → Edge → Safari → store release                                                                                                                                          |

## 2. Architecture

```
┌──────────────────────── Provider tab (chatgpt.com, claude.ai, gemini.google.com) ────────────────────────┐
│                                                                                                          │
│  [main world]  interceptor.ts                         [isolated world]  content.ts                       │
│  - patches window.fetch (and EventSource if needed)   - receives CapturedResponse via window.postMessage │
│  - tees matching response streams                     - validates origin / message shape                 │
│  - provider adapter parses stream →                   - forwards to background (runtime.sendMessage)     │
│    { provider, rawModel, outputText, reasoningText,   - receives ImpactResult → renders badge            │
│      hiddenReasoning, latencyMs, messageId }            (Preact + Tailwind inside Shadow DOM)            │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                         │ runtime message
                                         ▼
┌──────────────────────────── Background service worker ───────────────────────────┐
│ 1. Resolve model: mapping table → EcoLogits ID (or provider fallback + flag)     │
│ 2. Count tokens: gpt-tokenizer o200k (outputText + reasoningText)                │
│ 3. llmImpacts({ provider, modelName, outputTokenCount, requestLatency })         │
│ 4. Persist: update daily aggregate + push to rolling event log (max 500)         │
│ 5. Update adapter health status                                                  │
│ 6. Reply ImpactResult { median, min, max per criterion, flags }                  │
└──────────────────────────────────────────────────────────────────────────────────┘
                                         │ storage.local
                                         ▼
                 Popup (Preact + Tailwind) · Options page (Preact + Tailwind)
```

Key rules:

- **No message content ever leaves the main-world script except to the background for token counting**, and it is discarded right after counting. Only metadata is stored.
- The main-world interceptor must be **transparent**: the original response is returned untouched (`response.clone()` / `body.tee()`), and every adapter call is wrapped in `try/catch`.
- `postMessage` between worlds uses a namespaced message type and a per-page random token to avoid spoofing by the host page.

## 3. Proposed repository layout

```
ecologits-extension/
├── entrypoints/
│   ├── background.ts              # service worker: compute, store, health
│   ├── interceptor.content.ts     # main-world script (world: "MAIN"), run_at document_start
│   ├── bridge.content.ts          # isolated content script: relay + badge mount
│   ├── popup/                     # Preact app
│   └── options/                   # Preact app
├── src/
│   ├── adapters/
│   │   ├── types.ts               # ProviderAdapter interface, CapturedResponse
│   │   ├── chatgpt.ts
│   │   ├── claude.ts
│   │   └── gemini.ts
│   ├── models/
│   │   ├── mapping.ts             # web slug → EcoLogits model ID, fallbacks
│   │   └── mapping.test.ts
│   ├── impacts/
│   │   ├── compute.ts             # tokenizer + llmImpacts wrapper, range → median/min/max
│   │   └── equivalences.ts        # ADEME factors + sources
│   ├── storage/
│   │   ├── aggregates.ts          # daily aggregates
│   │   ├── events.ts              # rolling log (500)
│   │   └── export.ts              # CSV / JSON
│   ├── messaging.ts               # typed messages between worlds / background
│   ├── ui/                        # shared Preact components (Badge, ImpactValue, RangeTooltip…)
│   └── styles/tailwind.css
├── public/_locales/{en,fr}/messages.json
├── test/fixtures/{chatgpt,claude,gemini}/*.sse   # recorded, anonymised streams
├── wxt.config.ts
├── PLAN.md · README.md · PRIVACY.md · LICENSE
```

## 4. Phases

Each phase ends with its acceptance criteria green in CI.

### Phase 0 — Project bootstrap

- [x] Scaffold WXT project (Preact template) with pnpm, TypeScript strict (target ES2022).
- [x] Add Tailwind CSS (v4, `@tailwindcss/vite`); shared `tailwind.css` entry.
- [x] ESLint 9 flat config (typescript-eslint, eslint-config-prettier) + Prettier (`printWidth: 100`, `tabWidth: 4`, double quotes, trailing commas) — same as `ecologits.js`.
- [x] Vitest setup (+ coverage-v8).
- [x] Add dependencies: `@ecologits/ecologits.js@3.0.0`, `gpt-tokenizer`.
- [x] WXT i18n with `en` and `fr` locales.
- [x] GitHub Actions CI: `lint`, `typecheck`, `test`, `build` for `chrome` and `firefox` (zip artifacts).
- [x] Add `LICENSE` (MPL-2.0), update README.

**Acceptance:** `pnpm dev` loads an empty popup in Chrome and Firefox; CI is green.

### Phase 1 — Core pipeline (provider-agnostic)

- [x] `messaging.ts`: typed message contracts (`CapturedResponse`, `ImpactResult`, `AdapterStatus`).
- [x] `impacts/compute.ts`:
    - token counting with `gpt-tokenizer` (`o200k_base`), loaded once in the service worker;
    - call `llmImpacts({ provider, modelName, outputTokenCount, requestLatency })` (latency in seconds);
    - normalise each criterion to `{ median, min, max }` (handle both scalar and `RangeValue`);
    - propagate `ImpactsOutput.errors` / `warnings` and our own flags (`lowerBound`, `approximatedModel`).
- [x] `models/mapping.ts`: interface + fallback model per provider (e.g. `gpt-5`, `claude-sonnet-4-5`, `gemini-2.5-flash` — to be confirmed per phase); unit tests asserting every mapped target resolves via `models.findModel()`.
- [x] `storage/`: daily aggregates keyed by `YYYY-MM-DD/provider/model` (sum of min/median/max per criterion + request & token counts), rolling event log capped at 500, schema version for future migrations.
- [x] `storage/export.ts`: CSV + JSON export.
- [x] `impacts/equivalences.ts`: ADEME (Impact CO2) factors only (car km, video streaming, email, web search) with source URL and retrieval date per constant.
- [x] Unit tests for all of the above.

**Acceptance:** given a synthetic `CapturedResponse`, the background produces a correct `ImpactResult` and updates storage; tests cover range handling, unknown model fallback, and the 500-event cap.

### Phase 2 — ChatGPT adapter + capture plumbing (Chrome) — **MVP**

- [x] `interceptor.content.ts` (main world, `document_start`): patch `window.fetch`, route matching URLs to the right adapter, tee the stream, measure latency (request start → stream end), post result to the bridge.
- [x] `bridge.content.ts`: validate and relay messages; handle background reply.
- [x] `adapters/chatgpt.ts`: identify the conversation endpoint, parse SSE deltas, extract model slug, final text, reasoning (if streamed), message id; detect hidden reasoning → `lowerBound` flag.
- [x] Record and anonymise real SSE fixtures, replacing the synthetic ones written from the known stream format (procedure in `test/fixtures/README.md`). Logged in, `POST /backend-api/f/conversation`:
    - [x] normal reply (instant model) — `normal-reply.sse`, recorded: new messages arrive as bare `{ v: { message }, c }` and patches as `{ o: "patch", v }` without `p`; the parser handled both unchanged;
    - [x] thinking model with streamed reasoning summaries — `thinking-reply.sse`, recorded and masked: the answer is streamed both as hidden fragments (`is_message_fragment`, `merged_message_id`) and as the visible merged message (`is_merged_message`) concatenating them; the parser counts the merged message only;
    - [x] regenerated reply — `regenerate.sse`, recorded and masked: same format, `message_type: "variant"`, no user message echo;
    - [x] reply with a tool call (web search) — covered by the recorded `thinking-reply.sse` (`web.run` call, tool results); `tool-call.sse` stays as a synthetic complement;
    - [x] reply stopped by the user — `aborted.sse`, recorded and masked: the stream ends mid-patch, without `message_stream_complete` nor `[DONE]`;
    - [x] server error mid-stream: no fixture. By design, a reply that ends in a server error is ignored like any unfinished stream (and error events are skipped explicitly, covered by inline tests); it cannot be triggered reliably to record it;
    - [x] client abort after `message_stream_complete` (the case met live, no `[DONE]`): observed live, and replayed by the interceptor tests by cutting the recorded `normal-reply.sse` before `[DONE]` and failing it with an `AbortError`;
    - [x] drop `snapshots.sse`: no recording shows the legacy full-snapshot encoding anymore. The parser still accepts it as a fallback, covered by inline tests.
- [x] Logged-out mode: the web app uses `/unauth-mweb/…` (`conversation/prepare`, then `conversation/updates?operationId=…`), streaming newline-delimited JSON (`content` lines with `replace`/`append` markdown, `control` lifecycle ending with `terminal-received`). Dedicated adapter `adapters/chatgpt-logged-out.ts`, tested against a recorded fixture. The model is not exposed: the `gpt-5` fallback applies with `approximatedModel`.
    - [x] Reply stopped by the user: recorded, the stream just ends with no `terminal-received` and is skipped.
- [x] Validate end to end on chatgpt.com, logged in, in Chrome: one stored event per reply. Done on 2026-10-14 with the development build: normal reply (`gpt-6`), regenerated reply, regenerated reply with extended thinking (`gpt-6-t-mini`, `lowerBound`) each stored one event with a distinct `messageId` (75–86 output tokens, 0.15–0.18 Wh, 0.07–0.08 gCO₂eq); the reply stopped by the user stored none; no adapter failure. ChatGPT keeps the stream open for several seconds after `message_stream_complete`, so the measured latency can exceed the visible generation time (10.1 s for a regenerated reply).
- [x] Fixture-based adapter tests.
- [x] ChatGPT model mapping (including `auto` and thinking variants).
- [x] Adapter health: track last success / last failure per provider; parse errors never thrown into the page.

Implementation notes:

- The interceptor and the bridge talk over a private `MessageChannel` set up at `document_start` (see `src/capture/channel.ts`) rather than `window.postMessage` with a token: captures never transit on `window`, so page scripts cannot read them or inject fake ones through window messages. This is best effort, not a security boundary: the interceptor shares its realm with the page, which could patch built-ins the parser relies on and distort captures; the bridge validates every message and the worst outcome is wrong local stats for that user.
- ChatGPT aborts its own request right after `message_stream_complete`, so the stream copy usually ends with an `AbortError` instead of `[DONE]`. Interrupted streams are therefore still handed to the parser, which only records a reply if it saw a completion marker; streams stopped by the user, errored or unfinished produce no event and are not adapter failures. Only parser exceptions are reported as failures.
- Development builds log each capture step to the page console (`[ecologits] …`, `console.debug`): matched or ignored requests, interruptions, skip reasons, relay to the background.
- ChatGPT model slugs are canonicalised (`gpt-5-1-thinking` → `gpt-5.1`, `gpt-5-2-instant` → `gpt-5.2-chat-latest`); `auto`, `o3` and other unknown slugs use the `gpt-5` fallback with the `approximatedModel` flag.

**Acceptance:** on chatgpt.com, each assistant reply produces one stored event with plausible values in Chrome; aborted/failed streams don't crash the page or produce events; fixture tests green.

### Phase 3 — UI (MVP)

- [ ] Shared Preact components: `ImpactValue` (unit formatting Wh/kWh, g/kg), `RangeTooltip`, flag icons with explanations.
- [ ] **Badge**: mounted under each assistant reply via WXT `createShadowRootUi` (Tailwind CSS injected into the shadow root; avoid relying on host `rem` sizing). Shows median energy + CO₂eq, range on hover, flags. Locate reply anchor using `messageId` where possible.
- [ ] **Popup**: period selector (today / 7d / 30d / all-time), totals, breakdown by provider and model, equivalences, detail view (water, ADPe, PE, usage vs embodied), adapter status, link to options.
- [ ] **Options page**: toggle badge, export CSV/JSON, clear data, about / methodology (EcoLogits version via `ECOLOGITS_VERSION`, tokenizer approximation, lower-bound and approximated-model explanations).
- [ ] All strings in `en` + `fr` locales.

**Acceptance:** MVP usable end-to-end on ChatGPT in Chrome; badge can be disabled; export produces valid files; UI fully translated.

### Phase 4 — ChatGPT on Firefox + capture follow-ups — **MVP**

Left over from phase 2, done once the phase 3 UI (badge, popup adapter status) makes captures visible without the service worker console.

- [ ] Firefox specifics: verify main-world injection and `fetch` patching work under MV3 on Firefox.
- [ ] Validate end to end on chatgpt.com, logged in, in Firefox: one stored event per reply.
- [ ] Logged-out mode: record a reply with a tool call or reasoning, if the logged-out app offers them (errors are ignored by design, as logged in).

**Acceptance:** phase 2 and phase 3 acceptance criteria also met in Firefox.

### Phase 5 — Claude adapter

- [ ] `adapters/claude.ts`: completion endpoint SSE parsing, model extraction, streamed thinking summaries counted, hidden reasoning flag.
- [ ] Fixtures + tests; Claude model mapping (web labels → IDs such as `claude-sonnet-4-5`, `claude-opus-4-5`, `claude-sonnet-4-6`…).
- [ ] Badge anchoring on claude.ai.

**Acceptance:** same as Phases 2 and 4 (Chrome and Firefox) for claude.ai.

### Phase 6 — Gemini adapter

- [ ] `adapters/gemini.ts`: Gemini web uses a non-standard batched RPC stream — parse it robustly, extract model when exposed, otherwise fallback + `approximatedModel` flag.
- [ ] Fixtures + tests; Gemini model mapping (e.g. `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-3.1-pro-preview`…).
- [ ] Badge anchoring on gemini.google.com.

**Acceptance:** same as Phases 2 and 4 (Chrome and Firefox) for gemini.google.com.

### Phase 7 — Edge

- [ ] Add `edge` build target to CI; manual smoke test on the three providers.

**Acceptance:** Edge build works on all three providers.

### Phase 8 — Safari

- [ ] Build Safari target with WXT, convert with `xcrun safari-web-extension-converter`, Xcode project in repo (or generated in CI).
- [ ] Verify main-world injection and stream teeing on Safari; document any limitations.
- [ ] Requires an Apple Developer account for distribution.

**Acceptance:** extension runs in Safari (macOS) on the three providers.

### Phase 9 — Release

- [ ] `PRIVACY.md` / hosted privacy policy (local-only, no content stored, no telemetry).
- [ ] Store assets (icons, screenshots, descriptions in EN/FR).
- [ ] Publish to Chrome Web Store, Firefox Add-ons (AMO), Edge Add-ons, then Safari (App Store).
- [ ] Release workflow: tag → build zips for each browser → GitHub Release (optionally `wxt submit`).
- [ ] Justify permissions in store listings (host permissions for the three provider domains only, `storage`).

**Acceptance:** extension publicly available on Chrome, Firefox and Edge stores.

### Post-MVP backlog

- Playwright e2e tests against recorded fixtures.
- DOM-scraping fallback when network interception fails.
- User-selectable electricity mix zone.
- IndexedDB full history if 500-event log proves insufficient.
- Additional providers (Mistral Le Chat, Copilot…).

## 5. Risks and mitigations

| Risk                                                  | Mitigation                                                                                            |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Providers change internal APIs/stream formats         | Isolated adapters, fixture tests, health status in popup, silent failure in page                      |
| Hidden reasoning tokens → underestimation             | `lowerBound` flag + methodology note                                                                  |
| Web model labels don't match EcoLogits IDs            | Mapping table with tests against `models.findModel()`, fallback + `approximatedModel` flag            |
| Tokenizer mismatch for Claude/Gemini                  | Documented approximation                                                                              |
| Bundle size (EcoLogits data + tokenizer)              | Loaded only in the background service worker, never in content scripts                                |
| Host page CSS conflicts with badge                    | Shadow DOM + Tailwind CSS injected into shadow root                                                   |
| Main-world patching detected or broken by page CSP    | Inject via WXT `world: "MAIN"` content script (not inline script), keep patch minimal and transparent |
| Store review on host permissions / main-world scripts | Minimal permissions, clear privacy policy and justification                                           |
