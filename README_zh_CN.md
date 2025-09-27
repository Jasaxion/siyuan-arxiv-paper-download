# 思源笔记 arXiv 论文下载插件

该插件在思源笔记的斜杠菜单中提供 **插入 arXiv 论文** 功能，自动下载 arXiv PDF 并插入链接。

## 功能

- 在输入 `/` 时新增 **插入 arXiv 论文** 菜单项。
- 支持 `https://arxiv.org/abs/...`、`https://arxiv.org/pdf/...` 以及 `2509.17567` 等编号格式。
- 自动获取论文标题，下载 PDF 到 `assets/` 目录，并以标题命名。
- 如果 `assets/` 中已存在同名 PDF，则直接复用，避免重复下载。
- 在文档中插入 `[论文标题.pdf](assets/论文标题.pdf)` 格式的链接。
- 可以配合另外的插件 PaperLess 实现全局的个人论文文档库管理: [PaperLess](https://github.com/Jasaxion/siyuan-paperless)

## 使用方法

1. 在任意文档中输入 `/` 打开菜单。
2. 选择 **插入 arXiv 论文**。
3. 输入或粘贴 arXiv 链接 / 编号并确认。
4. 插件会自动下载并插入链接。

## 开发

```bash
pnpm install
pnpm run dev
```

执行 `pnpm run build` 可构建发布版本。
