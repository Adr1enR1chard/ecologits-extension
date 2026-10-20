# Replies are captured from the network, not scraped from the page

A reply's estimate needs its model, its full text and reasoning, and its generation time, which the rendered page mostly hides (the model, collapsed or hidden reasoning, when the stream started and ended) and whose markup changes far more often than the streams behind it. So a script injected in the page's own world patches `fetch` and `XMLHttpRequest` (Gemini streams its replies over XHR), copies the matching reply streams and hands them to the provider's adapter, while the page keeps reading the untouched original. The page markup only places the badge, never measures a reply; a reply stream the adapter cannot parse is an adapter failure shown in the capture status, never an error in the page.

## Consequences

- Each provider needs an adapter for each reply endpoint it streams from, with recorded streams to test it against.
- Only replies streamed since the page was loaded get a badge: replies already in the conversation have no stream to read.
