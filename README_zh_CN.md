# 思源笔记 arXiv 论文下载插件

该插件在思源笔记的斜杠菜单中提供 **插入 arXiv 论文** 功能，自动下载 arXiv PDF 并插入链接。

👋🙋‍♂️如果你觉得这个插件对你有帮助，请帮忙点个 Star 吧～🩷🌟

仓库：https://github.com/Jasaxion/siyuan-arxiv-paper-download

若遇到问题请前往：https://github.com/Jasaxion/siyuan-arxiv-paper-download/issues

## 功能

- 在输入 `/` 时新增 **插入 arXiv 论文** 菜单项。
- 支持 `https://arxiv.org/abs/...`、`https://arxiv.org/pdf/...` 以及 `2509.17567` 等编号格式。
- 自动获取论文标题，下载 PDF 到 `assets/` 目录，并以标题命名。
- 可选开启“解析全文”，优先使用 arXiv HTML 渲染转换为 Markdown（若不可用则回退解析 LaTeX 压缩包）。
- 将 HTML 表格转换为 Markdown 表格，确保在思源中能够正常横向展示数据。
- 新增“去掉参考文献”选项，解析全文时可以选择不插入文献列表。
- 如果 `assets/` 中已存在同名 PDF，则直接复用，避免重复下载。
- 在文档中插入 `[论文标题.pdf](assets/论文标题.pdf)` 格式的链接。
- 可以配合另外的插件 PaperLess 实现全局的个人论文文档库管理: [PaperLess](https://github.com/Jasaxion/siyuan-paperless)

## 使用方法

1. 在任意文档中输入 `/` 打开菜单。
2. 选择 **插入 arXiv 论文**。
3. 输入或粘贴 arXiv 链接 / 编号，视需求勾选“解析全文”（以及“去掉参考文献”），然后确认。
4. 若解析成功会直接插入 Markdown 内容；否则下载 PDF 并插入对应链接。

## 开发

```bash
pnpm install
pnpm run dev
```

执行 `pnpm run build` 可构建发布版本。
