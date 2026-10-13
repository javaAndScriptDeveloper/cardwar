# Fonts

Self-hosted so the Mini App never waits on a third-party font host and works the same offline-cached.

| Family    | Use                        | Files                                                               | Licence                                                                            |
| --------- | -------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Unbounded | display, numbers, wordmark | `unbounded-{cyrillic,cyrillic-ext,latin}.woff2` (variable, 200–900) | SIL Open Font License 1.1, © The Unbounded Project Authors (NaN), via Google Fonts |
| Manrope   | body                       | `manrope-{cyrillic,cyrillic-ext,latin}.woff2` (variable, 200–800)   | SIL Open Font License 1.1, © Mikhail Sharanda, via Google Fonts                    |

Subsets are the ones Google Fonts serves (`unicode-range` copied into `src/ui/kit/fonts.css`). Latin-ext is left out
on purpose: the UI is Ukrainian with a few Latin handles, and the Unbounded latin-ext file alone is 118 KB.
