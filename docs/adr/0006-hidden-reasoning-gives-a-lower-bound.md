# Hidden reasoning is flagged as a lower bound, not estimated

Reasoning models generate tokens the web apps do not stream: ChatGPT shows nothing or summaries,
claude.ai only summaries. Only what is streamed is counted (reply text plus any reasoning or
summaries), and the reply is flagged as a lower-bound estimate. We do not guess the hidden token
count, for instance from the generation time or a fixed ratio: no provider documents one, and a
guess would be presented with the same confidence as a measured count.
