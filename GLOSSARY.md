# EcoLogits extension

A browser extension that estimates the environmental impact of each reply a chatbot web app
streams, with EcoLogits, and shows it under the reply.

## Providers

**Provider**:
A chatbot web app the extension knows, such as ChatGPT or Claude, identified by an id that never
changes.
_Avoid_: service, platform, site

**Planned provider**:
A provider only announced in the popup as coming soon; none of its replies are captured.
_Avoid_: upcoming provider

**Beta provider**:
A provider being added: captured in development builds only, and shown as planned to users.
_Avoid_: experimental provider, work-in-progress provider

**Supported provider**:
A provider whose replies are captured, estimated and badged for users.

**Adapter**:
The part of a provider that turns its reply streams into replies: its reply endpoints and their
parsers. Not the provider as a whole.
_Avoid_: capture (for the provider as a whole)

**Reply endpoint**:
A request of the web app whose response streams an assistant reply.

**Reply markup**:
One way a web app renders finished assistant replies, telling where a reply's badge goes.

## Models

**Fallback model**:
The EcoLogits model a provider's replies are estimated with when the web model is unknown or not
exposed.

**Alias**:
A web model name mapped to the EcoLogits model it is.

**Proxy**:
An EcoLogits model, or range of models, standing in for a web model EcoLogits does not know yet;
its estimates are approximated.
_Avoid_: substitute

## Fixtures

**Fixture**:
Anonymised data recorded from a provider's web app to test against: a recorded stream or a DOM
snapshot.

**Recorded case**:
A recorded stream together with how it ended and the outcome it is recorded for (a reply, a
partial reply, a skip).

**DOM snapshot**:
A recorded conversation page, cut down to its replies, that a reply markup must find its badge
anchor in.
