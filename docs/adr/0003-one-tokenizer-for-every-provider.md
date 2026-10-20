# One tokenizer for every provider

Web apps do not report token counts, so output tokens are counted in the extension from the
streamed text. Every provider's replies are counted with OpenAI's `o200k_base` (`gpt-tokenizer`),
because Anthropic's and Google's tokenizers are not public. For Claude and Gemini the count is
an approximation, stated in the methodology rather than flagged on each reply, since it applies
to all of them alike.
