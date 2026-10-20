# One tokenizer for every provider

Web apps do not report token counts, so output tokens are counted in the extension from the streamed text. Every provider's replies are counted with OpenAI's `o200k_base` (`gpt-tokenizer`), because Anthropic's and Google's tokenizers are not public. One tokenizer keeps every provider's counts comparable, at the price of a bias for Claude and Gemini that cannot be measured: their count is an approximation, stated in the methodology rather than flagged on each reply, since it applies to all their replies alike.
