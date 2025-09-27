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
- Converts HTML tables to GitHub-flavored Markdown so numeric data stays readable inside SiYuan.
- Adds an **Omit references** toggle so you can skip inserting the bibliography when parsing the full text.
- Skips re-downloading when the titled PDF already exists in `assets/` and simply reuses it.
- Can be used in conjunction with the additional plugin PaperLess to achieve global management of personal academic paper documents: [PaperLess](https://github.com/Jasaxion/siyuan-paperless)

## Usage

1. Open any document in SiYuan and type `/` to open the slash menu.
2. Select **Insert arXiv paper**.
3. Paste an arXiv link or identifier in the dialog, optionally enable **Parse full text** (and **Omit references** if desired), and confirm.
4. Either the parsed Markdown content is inserted directly, or the PDF is saved under `assets/` and a link like `[paper-title.pdf](assets/paper-title.pdf)` is added.

## Development

```bash
pnpm install
pnpm run dev
```

Run `pnpm run build` to produce the packaged plugin.
