# EcoLogits Extension

Cross-browser extension (Chrome, Firefox, Edge, Safari) that estimates the environmental impact (energy, GHG emissions, etc.) of your generative AI usage, powered by [EcoLogits](https://ecologits.ai).

## Supported providers

- OpenAI (ChatGPT)
- Anthropic (Claude)
- Google (Gemini) (TODO)

## Status

🚧 Work in progress

## Development

Requirements: Node.js ≥ 20 and [pnpm](https://pnpm.io).

```sh
pnpm install
pnpm dev            # Chrome, with hot reload
pnpm dev:firefox    # Firefox
```

| Command                             | Description                            |
| ----------------------------------- | -------------------------------------- |
| `pnpm build` / `pnpm build:firefox` | Production build in `.output/`         |
| `pnpm zip` / `pnpm zip:firefox`     | Build and package as a store-ready zip |
| `pnpm lint`                         | ESLint                                 |
| `pnpm format` / `pnpm format:check` | Prettier                               |
| `pnpm typecheck`                    | TypeScript (strict)                    |
| `pnpm test` / `pnpm test:coverage`  | Vitest                                 |

Stack: [WXT](https://wxt.dev), TypeScript, Preact, Tailwind CSS v4. Translations live in `public/_locales/{en,fr}/messages.json`.

## License

[MPL-2.0](LICENSE)
