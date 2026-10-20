# Usage data stays in the browser, without message content

The extension reads every reply a user streams, so it must be trusted not to keep or send it.
Usage data lives in `storage.local` only: no server, no account, no telemetry, no network call
of its own; leaving the browser is the user's choice, through the CSV and JSON exports. Reply
text reaches the background only to be counted and is never stored: an event keeps metadata
(provider, models, token count, latency, estimate, flags). To bound storage, the event log
keeps the latest 500 replies and the popup's totals over longer periods come from daily
aggregates, which is why per-reply detail is lost beyond the log.

## Considered Options

- **IndexedDB full history**: kept for later, if the 500-reply log proves too short.
