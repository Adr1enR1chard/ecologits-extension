# Replies of unknown models are estimated with an approximated model, not dropped

Web apps name models with their own slugs or labels, sometimes not at all, and ship models
before EcoLogits knows them. A reply is still estimated: its web model is resolved through the
provider's aliases, then EcoLogits itself (as-is, then canonicalised), then the provider's
proxies, then its fallback model. Proxies and the fallback flag the estimate as an approximated
model, so it shows in the badge and the popup counts. Proxies come after EcoLogits so that a
model EcoLogits learns wins over the proxy standing in for it without any change here. When the
web app does not tell which of several models answered, a proxy can be a model range, whose
estimate spans both models instead of picking one.

## Considered Options

- **Skip replies of unknown models**: rejected, the totals would silently miss usage, which is
  worse than a flagged approximation.
