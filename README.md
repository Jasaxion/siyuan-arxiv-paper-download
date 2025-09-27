# arXiv Paper Downloader for SiYuan

This plugin lets you download an arXiv paper and insert a link to the PDF directly from the slash menu.

## Features

- Adds a `/` command named **Insert arXiv paper**.
- Accepts `https://arxiv.org/abs/...`, `https://arxiv.org/pdf/...`, or raw identifiers such as `2509.17567`.
- Downloads the PDF, stores it in `assets/`, and inserts a Markdown link using the paper title as the filename.
- Skips re-downloading when the titled PDF already exists in `assets/` and simply reuses it.

## Usage

1. Open any document in SiYuan and type `/` to open the slash menu.
2. Select **Insert arXiv paper**.
3. Paste an arXiv link or identifier in the dialog and confirm.
4. The PDF is saved under `assets/` and a link like `[paper-title.pdf](assets/paper-title.pdf)` is inserted.

## Development

```bash
pnpm install
pnpm run dev
```

Run `pnpm run build` to produce the packaged plugin.
