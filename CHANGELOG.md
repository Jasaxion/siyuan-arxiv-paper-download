# Changelog

## v0.3.0 2025-09-28

* 新增“使用 LLM 渲染”选项，可配置 Chat Completions 接口逐段修复 Markdown 排版。
* 对话框新增 LLM 基础地址、路径、模型与密钥输入，并在解析阶段提示 LLM 处理进度。
* LLM 调用失败时会及时中断并反馈错误，避免插入残缺内容。
* Added an optional **Use LLM rendering** toggle that cleans each Markdown section through a configurable chat-completions API.
* Extended the insert dialog with base URL, path, model, and API key fields plus live status updates while the LLM refines sections.
* Hardened error handling so failed LLM requests stop the workflow and surface actionable feedback.

## v0.2.0 2025-09-27

* 新增“解析全文”选项，可将 arXiv HTML 渲染内容转换为 Markdown 并插入思源笔记。
* 当 HTML 渲染不可用时，新增对 LaTeX 源码压缩包的兜底解析能力。
* 将作者、参考文献、致谢等信息压缩为代码块展示，并优化插入对话框体验。
* 修复 HTML 解析时相对图片地址导致无法显示的问题。
* 解析全文内容时使用块级方式插入 Markdown，避免文档渲染异常。
* 将 HTML 表格转换为 Markdown 表格，避免在思源中出现逐行换行的情况。
* 新增“去掉参考文献”选项，并为作者与参考文献部分增加可折叠标题。
* Added an optional "Parse full text" toggle to convert arXiv HTML renderings into Markdown inside SiYuan.
* Added a LaTeX source archive fallback when HTML rendering is unavailable.
* Compressed author, reference, and acknowledgement sections into compact code blocks and refined the insert dialog UX.
* Fixed HTML parsing so figure/image URLs remain absolute and render correctly in SiYuan.
* Insert parsed Markdown as proper block DOM nodes to preserve formatting.
* Converted HTML tables into Markdown tables so data stays readable in SiYuan.
* Added an "Omit references" toggle and heading wrappers for the author and references sections.

## v0.1.0 2025-09-27

* 实现在思源笔记中根据 arxiv 链接自动爬取 pdf 文件到本地资源目录
* Implement automatic crawling of PDF files to the local resource directory in SourceNote based on arXiv links.