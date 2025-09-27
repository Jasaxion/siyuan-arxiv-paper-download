# arXiv Paper Downloader for SiYuan

[中文](https://github.com/Jasaxion/siyuan-arxiv-paper-download/blob/main/README_zh_CN.md)

This plugin lets you download an arXiv paper and insert a link to the PDF directly from the slash menu.

👋🙋‍♂️If you find this plugin helpful, please help give it a Star～🩷🌟

Repository: https://github.com/Jasaxion/siyuan-arxiv-paper-download

Having issues? --> https://github.com/Jasaxion/siyuan-arxiv-paper-download/issues

## Features

- Adds a `/` command named **Insert arXiv paper**.
- Accepts `https://arxiv.org/abs/...`, `https://arxiv.org/pdf/...`, or raw identifiers such as `2509.17567`.
- Downloads the PDF, stores it in `assets/`, and inserts a Markdown link using the paper title as the filename.
- Optionally parses the paper into Markdown via arXiv's HTML rendering (with a LaTeX archive fallback) when **Parse full text** is enabled.
- Can optionally clean up each section with a configurable LLM endpoint to fix stubborn Markdown formatting when **Use LLM rendering** is enabled.
- Converts HTML tables to GitHub-flavored Markdown so numeric data stays readable inside SiYuan.
- Adds an **Omit references** toggle so you can skip inserting the bibliography when parsing the full text.
- Skips re-downloading when the titled PDF already exists in `assets/` and simply reuses it.
- Can be used in conjunction with the additional plugin PaperLess to achieve global management of personal academic paper documents: [PaperLess](https://github.com/Jasaxion/siyuan-paperless)

## Usage

1. Open any document in SiYuan and type `/` to open the slash menu.
2. Select **Insert arXiv paper**.
3. Paste an arXiv link or identifier in the dialog, optionally enable **Parse full text** (and **Omit references** if desired). When parsing, you can also toggle **Use LLM rendering** and supply the base URL, API path, model, and API key for providers such as DeepSeek.
4. Either the parsed Markdown content is inserted directly, or the PDF is saved under `assets/` and a link like `[paper-title.pdf](assets/paper-title.pdf)` is added.

### LLM-assisted rendering

If the raw HTML-to-Markdown conversion still produces awkward formatting, turn on **Use LLM rendering** and configure your provider:

- **LLM base URL**: The host serving the Chat Completions API (for example `https://api.deepseek.com`).
- **LLM API path**: The REST path to call (defaults to `/chat/completions`).
- **LLM model**: The model name to request (defaults to `deepseek-chat`).
- **LLM API key**: The secret used in the `Authorization: Bearer` header.

The plugin will send each Markdown section individually with a strict prompt that forbids hallucinations, expecting the model to return corrected Markdown only. Any network or response failure aborts the insert with a clear error.

## Development

```bash
pnpm install
pnpm run dev
```

Run `pnpm run build` to produce the packaged plugin.
