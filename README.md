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
- Skips re-downloading when the titled PDF already exists in `assets/` and simply reuses it.
- Can be used in conjunction with the additional plugin PaperLess to achieve global management of personal academic paper documents: [PaperLess](https://github.com/Jasaxion/siyuan-paperless)

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
