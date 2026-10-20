# The interceptor talks to the extension over a private channel

The main-world interceptor cannot reach the extension's APIs, so it hands replies to the
isolated content script. Rather than `window.postMessage` with a per-page token, the two set up a
private `MessageChannel` at `document_start`: replies never transit on `window`, so page scripts
can neither read them nor inject fake ones through window messages. This is best effort, not a
security boundary, since the interceptor shares its realm with the page; the content script
still validates every message.
