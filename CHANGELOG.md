# Changelog

## v0.2.0 2025-09-27

* 新增“解析全文”选项，可将 arXiv HTML 渲染内容转换为 Markdown 并插入思源笔记。
* 当 HTML 渲染不可用时，新增对 LaTeX 源码压缩包的兜底解析能力。
* 将作者、参考文献、致谢等信息压缩为代码块展示，并优化插入对话框体验。
* 修复 HTML 解析时相对图片地址导致无法显示的问题。
* 解析全文内容时使用块级方式插入 Markdown，避免文档渲染异常。
* 新增“去掉参考文献”选项，并为作者与参考文献部分增加可折叠标题。
* Added an optional "Parse full text" toggle to convert arXiv HTML renderings into Markdown inside SiYuan.
* Added a LaTeX source archive fallback when HTML rendering is unavailable.
* Compressed author, reference, and acknowledgement sections into compact code blocks and refined the insert dialog UX.
* Fixed HTML parsing so figure/image URLs remain absolute and render correctly in SiYuan.
* Insert parsed Markdown as proper block DOM nodes to preserve formatting.
* Added an "Omit references" toggle and heading wrappers for the author and references sections.

## v0.1.0 2025-09-27

* 实现在思源笔记中根据 arxiv 链接自动爬取 pdf 文件到本地资源目录
* Implement automatic crawling of PDF files to the local resource directory in SourceNote based on arXiv links.