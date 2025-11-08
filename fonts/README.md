# Bubblemarks Fonts

This project expects the custom display fonts **Bigbesty** (for headings/keyboard) and **Papernotes** (for body copy).

The repository cannot ship the commercial font files, so drop your licensed font files into this folder with the following filenames so the bundled `@font-face` rules can pick them up automatically:

- `Bigbesty.woff2` *(recommended)*
- `Bigbesty.ttf` *(fallback)*
- `Papernotes.woff2` *(recommended)*
- `Papernotes.ttf` *(fallback)*

If you are missing the fonts, Bubblemarks will gracefully fall back to friendly system fonts. Once you add the files, reload the page and the pastel UI will use them instantly.
