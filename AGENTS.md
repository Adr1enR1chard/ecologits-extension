## Agent skills

### Issue tracker

Issues live in GitHub Issues on `Adr1enR1chard/ecologits-extension`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Branches and pull requests

`main` takes changes only through a pull request: squash or rebase merge, with the "Lint, typecheck & test" and "Layout (Playwright)" checks green. Commit on a branch cut from `origin/main`, push it, and open the PR with `gh pr create`, with `Closes #<n>` in its body. The issue then closes when the PR merges. Current rules: `gh api repos/Adr1enR1chard/ecologits-extension/rules/branches/main`.
