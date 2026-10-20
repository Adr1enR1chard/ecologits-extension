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

## Replies

**Reply**:
One assistant answer a provider's web app streams, the unit every estimate is made for.
_Avoid_: response, message, request (for the reply itself)

**Partial reply**:
A reply stopped before its end, by the user or by leaving the page; only what was generated
until then is estimated.
_Avoid_: aborted reply, cancelled reply, interrupted reply

**Skipped stream**:
A reply stream that is read without fault but holds no reply to record, such as an error or an
unfinished reply.

**Adapter failure**:
A reply stream an adapter could not parse, or a reply EcoLogits could not estimate. Unlike a
skipped stream, it means the adapter needs fixing.
_Avoid_: capture error

**Capture status**:
Whether a provider's adapter last succeeded or failed, as shown in the popup.

**Hidden reasoning**:
Reasoning a model did that the web app does not stream in full, only as summaries or not at
all.

**Badge**:
The estimate of one reply, shown next to it in the web app.

**Badge anchor**:
The element of the page a reply's badge is placed next to.

## Models

**Web model**:
The model of a reply as the web app names it, when it names it at all.

**EcoLogits model**:
A model EcoLogits knows, by its ID, that estimates are computed with.

**Fallback model**:
The EcoLogits model a provider's replies are estimated with when the web model is unknown or not
exposed.

**Alias**:
A web model name mapped to the EcoLogits model it is.

**Proxy**:
An EcoLogits model, or range of models, standing in for a web model EcoLogits does not know yet;
its estimates are approximated.
_Avoid_: substitute

**Model range**:
Two EcoLogits models a web model may be either of, when the web app does not tell which one
answered; its estimates span from the lower bound of one to the upper bound of the other.

**Approximated model**:
An estimate made with a proxy or the fallback model instead of the web model itself.
_Avoid_: unknown model, guessed model

## Estimates

**Criterion**:
One environmental impact EcoLogits estimates: energy, GHG emissions, abiotic resources, primary
energy or water.
_Avoid_: metric, indicator

**Impact range**:
The minimum, median and maximum EcoLogits gives for a criterion; the median is the range's
midpoint, the value shown first.

**Usage impacts**:
The share of an estimate due to the electricity the model consumes while generating the reply.

**Embodied impacts**:
The share of an estimate due to manufacturing the hardware the model runs on. Water has none.
_Avoid_: manufacturing impacts

**Output tokens**:
The tokens of a reply's text and of its streamed reasoning, counted with one tokenizer for every
provider.

**Lower-bound estimate**:
An estimate of a reply with hidden reasoning, whose unstreamed reasoning tokens are not counted:
the actual impact is higher.
_Avoid_: underestimate

**Flag**:
A caveat attached to an estimate: lower-bound estimate, approximated model or partial reply.
_Avoid_: warning (EcoLogits' own warnings are a different thing)

**Equivalence**:
An everyday comparison of an impact, such as kilometres driven, from ADEME factors.

## Usage data

**Usage data**:
Everything recorded about the user's replies: the event log and the daily aggregates. Settings
are not usage data.

**Event log**:
The estimates of the latest replies, metadata only, oldest dropped first.
_Avoid_: history

**Daily aggregate**:
The summed estimates and counts of the replies of one local day, provider and EcoLogits model.

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
