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
- 勾选“使用 LLM 渲染”时，可配置第三方 LLM 接口逐段修正 Markdown 中的顽固排版问题。
- 支持“全文发送给 LLM”开关，方便长上下文模型一次性接收完整 Markdown。
- 新增“使用 MinerU 处理 PDF”选项，在解析全文时可将 arXiv PDF 交由 MinerU 转换为 Markdown 后再插入。
- 将 HTML 表格转换为 Markdown 表格，确保在思源中能够正常横向展示数据。
- 新增“去掉参考文献”选项，解析全文时可以选择不插入文献列表。
- 如果 `assets/` 中已存在同名 PDF，则直接复用，避免重复下载。
- 在文档中插入 `[论文标题.pdf](assets/论文标题.pdf)` 格式的链接。
- 可以配合另外的插件 PaperLess 实现全局的个人论文文档库管理: [PaperLess](https://github.com/Jasaxion/siyuan-paperless)

## 使用方法

1. 在任意文档中输入 `/` 打开菜单。
2. 选择 **插入 arXiv 论文**。
3. 输入或粘贴 arXiv 链接 / 编号，视需求勾选“解析全文”（以及“去掉参考文献”）。解析全文时可在“使用 LLM 渲染”与“使用 MinerU 处理 PDF”之间二选一：
   - 选择“使用 LLM 渲染”时，请填写 Base URL、API 路径、模型与 API Key（例如 DeepSeek），必要时开启“全文发送给 LLM”。
   - 选择“使用 MinerU 处理 PDF”时，请填写 MinerU 的 API Token，并可按需启用 OCR、公式/表格识别、语言及模型版本。
4. 若解析成功会直接插入 Markdown 内容；否则下载 PDF 并插入对应链接。

### LLM 辅助渲染

当 HTML 转 Markdown 后仍存在难以处理的格式时，可以开启“使用 LLM 渲染”并配置：

- **LLM 基础地址**：提供 Chat Completions API 的地址（如 `https://api.deepseek.com`）。
- **LLM API 路径**：接口路径（默认 `/chat/completions`）。
- **LLM 模型**：调用的模型名称（默认 `deepseek-chat`）。
- **LLM API 密钥**：用于 `Authorization: Bearer` 的密钥。

插件会以严格的提示词要求模型忠实返回 Markdown。默认按章节并行发送（最多 32 段）；开启“全文发送给 LLM”后，会在延长超时时间的前提下一次发送完整解析结果，适用于支持超长上下文的模型。若接口调用失败，会中止插入并给出错误提示。

### MinerU PDF 处理

当勾选“使用 MinerU 处理 PDF”时，插件会将 arXiv PDF 链接提交到 `https://mineru.net/api/v4/extract/task`，轮询任务直至完成，并下载生成的 Markdown 压缩包插入笔记。配置项包括：

- **MinerU API Token**：在 MinerU 后台申请的 `Bearer` Token。
- 可选项：**启用 OCR**、**识别公式**、**识别表格**、**解析语言** 与 **模型版本**。

LLM 渲染与 MinerU 处理互斥，请按需选择。对话框会记住最近填写的 MinerU 参数，无需每次重复输入。

## 开发

```bash
pnpm install
pnpm run dev
```

执行 `pnpm run build` 可构建发布版本。
