# Replies of web models EcoLogits does not know are estimated with a proxy or the fallback model and flagged, not dropped

Web apps name models with their own slugs or labels, sometimes not at all, and ship models before EcoLogits knows them, yet every reply is estimated. The web model is tried as-is against the provider's aliases then EcoLogits, then the same with its canonical slug, then against the provider's proxies, and the fallback model is used last; a proxy or the fallback flags the estimate as an approximated model, shown in the badge and counted in the popup. Proxies come after EcoLogits so that a model EcoLogits learns wins over the proxy standing in for it without any change here, and when the web app does not tell which of two models answered, the proxy is a model range whose estimate spans both instead of picking one.

## Considered Options

- **Skip replies whose web model EcoLogits does not know**: rejected, the totals would silently miss usage, which is worse than a flagged approximation.
