# Replies are captured from the network, not scraped from the page

A reply's estimate needs its model, its full text and reasoning, and its generation time. The
rendered page hides most of these (the model, hidden or collapsed reasoning, when the stream
started and ended), and its markup changes far more often than the streams behind it. So a
script injected in the page's own world patches `fetch`, copies the matching reply streams and
hands them to the provider's adapter, while the page keeps reading the untouched original. The
page markup is used only to place the badge, never to measure a reply; a reply the adapter
cannot parse is an adapter failure shown in the capture status, never an error in the page.

## Consequences

- Each provider needs an adapter for each reply endpoint it streams from, with recorded streams
  to test it against.
- The interceptor shares its realm with the page, which could distort what it reads: captures
  are best effort, and the worst outcome is wrong local usage data for that user.
- Only replies captured since the page was loaded get a badge: replies already in the
  conversation have no stream to read.
