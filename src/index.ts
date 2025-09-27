import {Dialog, Plugin, Protyle, showMessage, getFrontend} from "siyuan";
import type {Lute} from "siyuan";
import TurndownService from "turndown";
import {gunzipSync} from "fflate";
import untar from "js-untar";
import "./index.scss";

const ASSETS_DIR = "/assets/";
const ASSETS_WORKSPACE_DIR = "/data/assets/";

interface UploadResponse {
    code: number;
    msg: string;
    data: {
        errFiles: string[];
        succMap: Record<string, string>;
    };
}

interface ReadDirResponse {
    code: number;
    msg: string;
    data: Array<{
        name: string;
        isDir: boolean;
    }>;
}

interface ArxivMetadata {
    title: string;
    pdfUrl: string;
    canonicalId: string;
    versionedId: string;
    authors: string[];
    summary?: string;
}

interface UntarEntry {
    name: string;
    buffer: ArrayBuffer;
    type?: string;
}

export default class ArxivPaperPlugin extends Plugin {
    private isMobile = false;

    private readonly slashId = "insert-arxiv-paper";

    onload() {
        this.isMobile = getFrontend() === "mobile" || getFrontend() === "browser-mobile";
        this.protyleSlash = [
            {
                filter: [
                    this.i18n.insertArxivPaper,
                    "arxiv",
                    "论文",
                ],
                html: `<div class="b3-list-item__first"><span class="b3-list-item__text">${this.i18n.insertArxivPaper}</span><span class="b3-list-item__meta">arXiv</span></div>`,
                id: this.slashId,
                callback: (protyle: Protyle) => {
                    this.openInsertDialog(protyle);
                },
            },
        ];
    }

    private openInsertDialog(protyle: Protyle) {
        const dialog = new Dialog({
            title: this.i18n.insertArxivPaper,
            content: `<div class="b3-dialog__content siyuan-arxiv-dialog">
    <label class="siyuan-arxiv-dialog__label">${this.i18n.inputLabel}</label>
    <input class="b3-text-field fn__block siyuan-arxiv-dialog__input" placeholder="${this.i18n.inputPlaceholder}" />
    <label class="siyuan-arxiv-dialog__checkbox"><input type="checkbox" class="b3-switch siyuan-arxiv-dialog__parse" />${this.i18n.parseFullTextLabel}</label>
    <label class="siyuan-arxiv-dialog__checkbox"><input type="checkbox" class="b3-switch siyuan-arxiv-dialog__omit-references" disabled />${this.i18n.omitReferencesLabel}</label>
    <div class="siyuan-arxiv-dialog__status" aria-live="polite"></div>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel">${this.i18n.cancel}</button><div class="fn__space"></div>
    <button class="b3-button b3-button--text siyuan-arxiv-dialog__confirm">${this.i18n.confirm}</button>
</div>`,
            width: this.isMobile ? "92vw" : "520px",
        });

        const input = dialog.element.querySelector(".siyuan-arxiv-dialog__input");
        const cancelButton = dialog.element.querySelector(".b3-button--cancel");
        const confirmButton = dialog.element.querySelector(".siyuan-arxiv-dialog__confirm");
        const statusElement = dialog.element.querySelector(".siyuan-arxiv-dialog__status");
        const parseCheckbox = dialog.element.querySelector(".siyuan-arxiv-dialog__parse");
        const omitReferencesCheckbox = dialog.element.querySelector(".siyuan-arxiv-dialog__omit-references");

        if (!(input instanceof HTMLInputElement)
            || !(cancelButton instanceof HTMLButtonElement)
            || !(confirmButton instanceof HTMLButtonElement)
            || !(statusElement instanceof HTMLElement)
            || !(parseCheckbox instanceof HTMLInputElement)
            || !(omitReferencesCheckbox instanceof HTMLInputElement)) {
            console.error("ArxivPaperPlugin: dialog template missing expected elements", {
                input,
                cancelButton,
                confirmButton,
                statusElement,
                parseCheckbox,
                omitReferencesCheckbox,
            });
            showMessage(this.i18n.errorDialogInit ?? "Failed to initialize dialog.");
            dialog.destroy();
            return;
        }

        const syncReferenceToggle = () => {
            omitReferencesCheckbox.disabled = !parseCheckbox.checked;
            if (omitReferencesCheckbox.disabled) {
                omitReferencesCheckbox.checked = false;
            }
        };

        parseCheckbox.addEventListener("change", syncReferenceToggle);
        syncReferenceToggle();

        cancelButton.addEventListener("click", () => {
            dialog.destroy();
        });

        const submit = async () => {
            if (!input.value.trim()) {
                statusElement.textContent = this.i18n.errorInvalidInput;
                statusElement.classList.add("siyuan-arxiv-dialog__status--error");
                return;
            }
            await this.handleInsert(
                protyle,
                input.value.trim(),
                parseCheckbox.checked,
                omitReferencesCheckbox.checked,
                statusElement,
                confirmButton,
                dialog,
            );
        };

        confirmButton.addEventListener("click", () => {
            void submit();
        });

        input.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                void submit();
            }
        });

        dialog.bindInput(input, () => {
            void submit();
        });

        setTimeout(() => {
            input.focus();
        }, 50);
    }

    private async handleInsert(
        protyle: Protyle,
        rawInput: string,
        parseFullText: boolean,
        omitReferences: boolean,
        statusElement: HTMLElement,
        confirmButton: HTMLButtonElement,
        dialog: Dialog,
    ) {
        statusElement.classList.remove("siyuan-arxiv-dialog__status--error");
        const arxivId = this.extractArxivId(rawInput);
        if (!arxivId) {
            statusElement.textContent = this.i18n.errorInvalidInput;
            statusElement.classList.add("siyuan-arxiv-dialog__status--error");
            return;
        }

        confirmButton.disabled = true;
        confirmButton.classList.add("b3-button--disabled");

        try {
            statusElement.textContent = this.i18n.statusFetching;
            const metadata = await this.fetchArxivMetadata(arxivId);

            if (parseFullText) {
                const markdown = await this.generateFullTextMarkdown(metadata, statusElement, {omitReferences});
                protyle.focus();
                this.insertMarkdown(protyle, markdown);
                dialog.destroy();
                showMessage(this.i18n.successParsedMessage.replace("${title}", metadata.title));
                return;
            }

            const fileName = this.buildPdfFileName(metadata.title, metadata.versionedId);
            statusElement.textContent = this.i18n.statusCheckingExisting;
            const existingAssetPath = await this.findExistingAsset(fileName);

            let assetPath: string;
            let reusedExisting = false;

            if (existingAssetPath) {
                assetPath = existingAssetPath;
                reusedExisting = true;
                statusElement.textContent = this.i18n.statusReusingExisting;
            } else {
                statusElement.textContent = this.i18n.statusDownloading;
                const pdfBlob = await this.downloadPdf(metadata.pdfUrl);

                statusElement.textContent = this.i18n.statusUploading;
                assetPath = await this.uploadPdf(pdfBlob, fileName);
            }

            const markdownLink = `[${fileName}](${assetPath})`;
            protyle.focus();
            this.insertMarkdown(protyle, markdownLink);
            dialog.destroy();
            const successTemplate = reusedExisting ? this.i18n.successReusedMessage : this.i18n.successMessage;
            showMessage(successTemplate.replace("${title}", metadata.title));
        } catch (error) {
            console.error(error);
            const message = error instanceof Error ? error.message : String(error);
            statusElement.textContent = message;
            statusElement.classList.add("siyuan-arxiv-dialog__status--error");
        } finally {
            confirmButton.disabled = false;
            confirmButton.classList.remove("b3-button--disabled");
        }
    }

    private extractArxivId(input: string): string | null {
        const trimmed = input.trim();
        if (!trimmed) {
            return null;
        }

        let candidate = trimmed;
        try {
            const parsedUrl = new URL(trimmed);
            const path = parsedUrl.pathname.replace(/^\/+|\/+$/g, "");
            if (path) {
                const segments = path.split("/");
                candidate = segments[segments.length - 1];
                if (!candidate && segments.length > 1) {
                    candidate = segments[segments.length - 2];
                }
            }
        } catch (err) {
            // Not a URL, fallback to raw input
        }

        candidate = candidate.replace(/^abs\//i, "").replace(/^pdf\//i, "").replace(/\.pdf$/i, "");

        const newStylePattern = /^\d{4}\.\d{4,5}(v\d+)?$/i;
        const legacyPattern = /^[a-z\-]+\/\d{7}(v\d+)?$/i;

        if (newStylePattern.test(candidate) || legacyPattern.test(candidate)) {
            return candidate;
        }

        const urlPattern = /arxiv.\org\/(?:abs|pdf)\/([^?#]+?)(?:\.pdf)?(?:[?#].*)?$/i;
        const match = trimmed.match(urlPattern);
        if (match) {
            const id = match[1].replace(/\.pdf$/i, "");
            if (newStylePattern.test(id) || legacyPattern.test(id)) {
                return id;
            }
        }

        if (newStylePattern.test(trimmed) || legacyPattern.test(trimmed)) {
            return trimmed;
        }

        return null;
    }

    private async fetchArxivMetadata(arxivId: string): Promise<ArxivMetadata> {
        const response = await fetch(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}`);
        if (!response.ok) {
            throw new Error(this.i18n.errorFetchMetadata);
        }
        const text = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "application/xml");
        if (xmlDoc.querySelector("parsererror")) {
            throw new Error(this.i18n.errorParseMetadata);
        }
        const entry = xmlDoc.querySelector("entry");
        if (!entry) {
            throw new Error(this.i18n.errorNotFound);
        }
        const titleElement = entry.querySelector("title");
        const title = titleElement?.textContent?.replace(/\s+/g, " ").trim();
        if (!title) {
            throw new Error(this.i18n.errorMissingTitle);
        }

        const idElement = entry.querySelector("id");
        let canonicalId = arxivId;
        if (idElement?.textContent) {
            const extracted = idElement.textContent.trim().split("/").pop();
            if (extracted) {
                canonicalId = extracted;
            }
        }
        let versionedId = canonicalId;
        if (!/v\d+$/i.test(versionedId)) {
            const versionLink = entry.querySelector('link[title="pdf"]')?.getAttribute("href")
                ?? entry.querySelector('link[type="application/pdf"]')?.getAttribute("href");
            if (versionLink) {
                const lastSegment = versionLink.split("/").pop();
                if (lastSegment) {
                    versionedId = lastSegment.replace(/\.pdf$/i, "");
                }
            }
        }
        const pdfUrl = `https://arxiv.org/pdf/${encodeURIComponent(versionedId)}.pdf`;
        const authorElements = Array.from(entry.querySelectorAll("author > name"));
        const authors = authorElements
            .map((element) => element.textContent?.replace(/\s+/g, " ").trim())
            .filter((value): value is string => Boolean(value));
        const summary = entry.querySelector("summary")?.textContent?.replace(/\s+/g, " ").trim();

        return {title, pdfUrl, canonicalId, versionedId, authors, summary};
    }

    private async downloadPdf(url: string): Promise<Blob> {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(this.i18n.errorDownloadPdf);
        }
        const blob = await response.blob();
        if (blob.size === 0) {
            throw new Error(this.i18n.errorDownloadPdf);
        }
        return blob;
    }

    private buildPdfFileName(title: string, fallbackId: string): string {
        const sanitized = title
            .replace(/[\\/:*?"<>|]/g, "")
            .replace(/\s+/g, " ")
            .trim();
        const base = sanitized ? sanitized.replace(/\s+/g, "_") : fallbackId;
        const truncated = base.length > 120 ? base.slice(0, 120) : base;
        return `${truncated}.pdf`;
    }

    private async uploadPdf(pdfBlob: Blob, fileName: string): Promise<string> {
        const formData = new FormData();
        formData.append("assetsDirPath", ASSETS_DIR);
        const file = new File([pdfBlob], fileName, {type: "application/pdf"});
        formData.append("file[]", file);

        const response = await fetch("/api/asset/upload", {
            method: "POST",
            body: formData,
        });

        if (!response.ok) {
            throw new Error(this.i18n.errorUploadPdf);
        }

        const result = (await response.json()) as UploadResponse;
        if (result.code !== 0) {
            throw new Error(result.msg || this.i18n.errorUploadPdf);
        }

        if (result.data.errFiles?.length) {
            throw new Error(this.i18n.errorUploadPdf);
        }

        const uploadedPath = result.data.succMap[fileName];
        if (!uploadedPath) {
            const firstPath = Object.values(result.data.succMap)[0];
            if (firstPath) {
                return firstPath;
            }
            throw new Error(this.i18n.errorUploadPdf);
        }
        return uploadedPath;
    }

    private async findExistingAsset(fileName: string): Promise<string | null> {
        try {
            const response = await fetch("/api/file/readDir", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({path: ASSETS_WORKSPACE_DIR}),
            });
            if (!response.ok) {
                return null;
            }

            const result = (await response.json()) as ReadDirResponse;
            if (result.code !== 0 || !Array.isArray(result.data)) {
                return null;
            }

            const match = result.data.find((entry) => !entry.isDir && entry.name === fileName);
            if (match) {
                return `${ASSETS_DIR}${match.name}`;
            }
        } catch (err) {
            console.warn("Failed to check existing arXiv asset", err);
        }
        return null;
    }

    private insertMarkdown(protyle: Protyle, markdown: string) {
        const normalized = markdown.endsWith("\n") ? markdown : `${markdown}\n`;
        const lute = this.getLute(protyle);
        try {
            const html = lute.Md2BlockDOM(normalized);
            protyle.insert(html, true, true);
        } catch (err) {
            console.error("ArxivPaperPlugin: failed to convert markdown to block DOM", err);
            throw new Error(this.i18n.errorConvertMarkdown ?? "Failed to insert Markdown content.");
        }
    }

    private getLute(protyle: Protyle): Lute {
        const protyleLute = (protyle as unknown as {protyle?: {lute?: Lute}}).protyle?.lute;
        if (protyleLute && typeof protyleLute.Md2BlockDOM === "function") {
            return protyleLute;
        }

        const appLute = (this.app as unknown as {lute?: Lute}).lute;
        if (appLute && typeof appLute.Md2BlockDOM === "function") {
            return appLute;
        }

        const globalLuteFactory = (globalThis as typeof globalThis & {Lute?: {New?: () => Lute}}).Lute;
        if (globalLuteFactory?.New) {
            try {
                const instance = globalLuteFactory.New();
                if (instance && typeof instance.Md2BlockDOM === "function") {
                    return instance;
                }
            } catch (err) {
                console.warn("ArxivPaperPlugin: failed to instantiate global Lute", err);
            }
        }

        throw new Error(this.i18n.errorConvertMarkdown ?? "Failed to insert Markdown content.");
    }

    private async generateFullTextMarkdown(
        metadata: ArxivMetadata,
        statusElement: HTMLElement,
        options: {omitReferences: boolean},
    ): Promise<string> {
        statusElement.textContent = this.i18n.statusFetchingHtml;
        let htmlContent: string | null = null;
        try {
            htmlContent = await this.fetchArxivHtml(metadata.versionedId);
        } catch (err) {
            console.warn("Failed to fetch arXiv HTML rendering", err);
        }

        if (htmlContent) {
            statusElement.textContent = this.i18n.statusConvertingHtml;
            const markdown = this.convertArxivHtmlToMarkdown(htmlContent, metadata, options);
            if (markdown) {
                return markdown;
            }
        }

        statusElement.textContent = this.i18n.statusFallbackLatex;
        const latexMarkdown = await this.fetchLatexMarkdown(metadata, options);
        if (latexMarkdown) {
            return latexMarkdown;
        }

        throw new Error(this.i18n.errorParseFullTextFailed);
    }

    private async fetchArxivHtml(versionedId: string): Promise<string | null> {
        const url = `https://arxiv.org/html/${encodeURIComponent(versionedId)}`;
        const response = await fetch(url, {headers: {Accept: "text/html"}});
        if (!response.ok) {
            if (response.status === 404) {
                return null;
            }
            throw new Error(this.i18n.errorFetchHtml);
        }
        const text = await response.text();
        if (!text.trim()) {
            return null;
        }
        return text;
    }

    private convertArxivHtmlToMarkdown(
        htmlContent: string,
        metadata: ArxivMetadata,
        options: {omitReferences: boolean},
    ): string | null {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, "text/html");
        const article = doc.querySelector("article.ltx_document");
        if (!article) {
            return null;
        }

        this.ensureAbsoluteLinks(article, `https://arxiv.org/html/${metadata.versionedId}/`);
        this.unwrapMathElements(article);

        const compressionBlocks = this.extractCompressionBlocks(article);

        const turndown = new TurndownService({
            headingStyle: "atx",
            codeBlockStyle: "fenced",
            hr: "---",
        });

        let markdown = turndown.turndown(article.innerHTML);
        markdown = this.cleanupMarkdown(markdown);

        const combinedBlocks: string[] = [];
        const authorsText = compressionBlocks.authors
            ?? (metadata.authors.length ? metadata.authors.join(", ") : undefined);
        if (authorsText) {
            combinedBlocks.push(
                this.buildHeadingCodeSection(
                    this.i18n.headingAuthors,
                    [`${this.i18n.labelAuthors}: ${authorsText}`],
                ),
            );
        }
        if (!options.omitReferences && compressionBlocks.references) {
            combinedBlocks.push(
                this.buildHeadingCodeSection(
                    this.i18n.headingReferences,
                    [`${this.i18n.labelReferences}:`, compressionBlocks.references],
                ),
            );
        }
        if (compressionBlocks.acknowledgements) {
            combinedBlocks.push(
                this.buildHeadingCodeSection(
                    this.i18n.labelAcknowledgements,
                    [`${this.i18n.labelAcknowledgements}:`, compressionBlocks.acknowledgements],
                ),
            );
        }

        if (combinedBlocks.length) {
            markdown = `${combinedBlocks.join("\n\n")}` + "\n\n" + markdown;
        }

        return markdown.trim();
    }

    private ensureAbsoluteLinks(root: Element, baseUrl: string) {
        const resolveUrl = (value: string | null): string | null => {
            if (!value) {
                return null;
            }
            try {
                return new URL(value, baseUrl).href;
            } catch (err) {
                return value;
            }
        };

        root.querySelectorAll("img").forEach((img) => {
            const src = resolveUrl(img.getAttribute("src"));
            if (src) {
                img.setAttribute("src", src);
            }
            const srcset = img.getAttribute("srcset");
            if (srcset) {
                const resolvedSrcset = srcset
                    .split(",")
                    .map((candidate) => {
                        const [url, descriptor] = candidate.trim().split(/\s+/, 2);
                        const resolved = resolveUrl(url);
                        return resolved ? `${resolved}${descriptor ? ` ${descriptor}` : ""}` : candidate.trim();
                    })
                    .join(", ");
                img.setAttribute("srcset", resolvedSrcset);
            }
        });

        root.querySelectorAll("a").forEach((anchor) => {
            const href = anchor.getAttribute("href");
            if (!href || href.startsWith("#")) {
                return;
            }
            const resolved = resolveUrl(href);
            if (resolved) {
                anchor.setAttribute("href", resolved);
            }
        });
    }

    private unwrapMathElements(root: Element) {
        root.querySelectorAll("math").forEach((mathElement) => {
            const tex = mathElement.getAttribute("alttext")?.trim();
            if (!tex) {
                return;
            }
            const display = mathElement.getAttribute("display") === "block";
            const wrapper = mathElement.ownerDocument?.createElement("span");
            if (!wrapper) {
                return;
            }
            wrapper.textContent = display ? `\n\n$$\n${tex}\n$$\n\n` : ` $${tex}$ `;
            mathElement.replaceWith(wrapper);
        });
    }

    private extractCompressionBlocks(article: Element): {
        authors?: string;
        references?: string;
        acknowledgements?: string;
    } {
        let authorsText: string | undefined;
        const authorsElement = article.querySelector(".ltx_authors");
        if (authorsElement) {
            const text = this.normalizeWhitespace(authorsElement.textContent ?? "");
            if (text) {
                authorsText = text;
            }
            authorsElement.remove();
        }

        const referencesText = this.extractSectionByHeading(article, ["references", "bibliography"], true);
        const acknowledgementsText = this.extractSectionByHeading(article, ["acknowledgements", "acknowledgments"], true);

        return {
            authors: authorsText,
            references: referencesText,
            acknowledgements: acknowledgementsText,
        };
    }

    private extractSectionByHeading(article: Element, titles: string[], remove: boolean): string | undefined {
        const lowerTitles = titles.map((title) => title.toLowerCase());
        const sections = Array.from(article.querySelectorAll("section"));
        for (const section of sections) {
            const heading = section.querySelector("h1, h2, h3, h4, h5, h6");
            const headingText = heading?.textContent?.trim().toLowerCase();
            if (headingText && lowerTitles.some((title) => headingText.includes(title))) {
                const text = this.normalizeWhitespace(section.textContent ?? "");
                if (remove) {
                    section.remove();
                }
                return text;
            }
        }

        const bibliography = article.querySelector(".ltx_bibliography");
        if (bibliography) {
            const text = this.normalizeWhitespace(bibliography.textContent ?? "");
            if (remove) {
                bibliography.remove();
            }
            return text;
        }

        return undefined;
    }

    private cleanupMarkdown(markdown: string): string {
        return markdown
            .replace(/[\r\t]/g, "")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
    }

    private normalizeWhitespace(value: string): string {
        return value
            .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    private async fetchLatexMarkdown(metadata: ArxivMetadata, options: {omitReferences: boolean}): Promise<string | null> {
        try {
            const archiveBuffer = await this.downloadLatexArchive(metadata);
            if (!archiveBuffer) {
                return null;
            }
            const markdown = await this.convertLatexArchiveToMarkdown(archiveBuffer, metadata, options);
            return markdown;
        } catch (err) {
            console.warn("Failed to convert LaTeX archive", err);
            return null;
        }
    }

    private async downloadLatexArchive(metadata: ArxivMetadata): Promise<ArrayBuffer | null> {
        const baseId = metadata.canonicalId.replace(/v\d+$/i, "");
        const candidates = [
            `https://arxiv.org/src/${encodeURIComponent(baseId)}`,
            `https://arxiv.org/src/${encodeURIComponent(metadata.versionedId)}`,
            `https://arxiv.org/e-print/${encodeURIComponent(metadata.versionedId)}`,
        ];
        for (const url of candidates) {
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    continue;
                }
                const buffer = await response.arrayBuffer();
                if (buffer.byteLength === 0) {
                    continue;
                }
                return buffer;
            } catch (err) {
                console.warn("Failed to download archive", url, err);
            }
        }
        return null;
    }

    private async convertLatexArchiveToMarkdown(
        buffer: ArrayBuffer,
        metadata: ArxivMetadata,
        options: {omitReferences: boolean},
    ): Promise<string | null> {
        let tarData: Uint8Array;
        try {
            tarData = gunzipSync(new Uint8Array(buffer));
        } catch (err) {
            console.warn("Failed to decompress gzip archive", err);
            return null;
        }

        let entries: UntarEntry[];
        try {
            entries = (await untar(tarData.buffer)) as UntarEntry[];
        } catch (err) {
            console.warn("Failed to untar archive", err);
            return null;
        }

        const decoder = new TextDecoder("utf-8", {fatal: false});
        const texEntries = entries
            .filter((entry) => typeof entry.name === "string" && entry.name.toLowerCase().endsWith(".tex"))
            .map((entry) => ({
                name: entry.name,
                content: this.decodeArchiveText(entry.buffer, decoder),
            }))
            .filter((entry) => Boolean(entry.content));

        if (!texEntries.length) {
            return null;
        }

        const mainEntry = this.selectMainTexEntry(texEntries);
        if (!mainEntry) {
            return null;
        }

        const referencesText = this.extractLatexReferences(mainEntry.content);
        const markdownBody = this.convertLatexToMarkdown(mainEntry.content, options);
        if (!markdownBody) {
            return null;
        }

        const sections: string[] = [];
        if (metadata.authors.length) {
            sections.push(
                this.buildHeadingCodeSection(
                    this.i18n.headingAuthors,
                    [`${this.i18n.labelAuthors}: ${metadata.authors.join(", ")}`],
                ),
            );
        }
        if (!options.omitReferences && referencesText) {
            sections.push(
                this.buildHeadingCodeSection(
                    this.i18n.headingReferences,
                    [`${this.i18n.labelReferences}:`, referencesText],
                ),
            );
        }

        const prefix = sections.length ? `${sections.join("\n\n")}\n\n` : "";
        return `${prefix}${markdownBody}`.trim();
    }

    private extractLatexReferences(content: string): string | undefined {
        const match = content.match(/\\begin\{thebibliography}([\s\S]*?)\\end\{thebibliography}/i);
        if (!match) {
            return undefined;
        }
        const inner = match[1]
            .replace(/\\newblock/g, " ")
            .replace(/\s+/g, " ");

        const entries = match[1]
            .split(/\\bibitem\{[^}]*}/i)
            .map((chunk) => this.normalizeWhitespace(chunk.replace(/\\newblock/g, " ")))
            .filter(Boolean);

        if (entries.length) {
            return entries.join("\n");
        }

        const normalized = this.normalizeWhitespace(inner);
        return normalized || undefined;
    }

    private decodeArchiveText(buffer: ArrayBuffer | undefined, decoder: TextDecoder): string {
        if (!buffer) {
            return "";
        }
        try {
            return decoder.decode(new Uint8Array(buffer));
        } catch (err) {
            console.warn("Failed to decode archive entry", err);
            return "";
        }
    }

    private selectMainTexEntry(texEntries: Array<{name: string; content: string}>): {name: string; content: string} | null {
        const withDocument = texEntries.find((entry) => /\\begin\{document}/.test(entry.content));
        if (withDocument) {
            return withDocument;
        }
        return texEntries.sort((a, b) => b.content.length - a.content.length)[0] ?? null;
    }

    private convertLatexToMarkdown(content: string, options: {omitReferences: boolean}): string {
        const documentMatch = content.match(/\\begin\{document}([\s\S]*?)\\end\{document}/);
        const body = documentMatch ? documentMatch[1] : content;
        let markdown = body;

        markdown = markdown.replace(/%.*$/gm, "");
        markdown = markdown.replace(/\\label\{[^}]*}/g, "");
        markdown = markdown.replace(/\\cite\{[^}]*}/g, "");
        markdown = markdown.replace(/\\ref\{([^}]*)}/g, "$1");
        markdown = markdown.replace(/\\footnote\{([^}]*)}/g, " ($1) ");
        markdown = markdown.replace(/\\textbf\{([^}]*)}/g, "**$1**");
        markdown = markdown.replace(/\\textit\{([^}]*)}/g, "*$1*");
        markdown = markdown.replace(/\\emph\{([^}]*)}/g, "*$1*");

        markdown = markdown.replace(/\\begin\{itemize}([\s\S]*?)\\end\{itemize}/g, (_match, items) => this.convertLatexList(items, false));
        markdown = markdown.replace(/\\begin\{enumerate}([\s\S]*?)\\end\{enumerate}/g, (_match, items) => this.convertLatexList(items, true));

        markdown = markdown.replace(/\\section\*?\{([^}]*)}/g, (_match, title) => `\n## ${title.trim()}\n`);
        markdown = markdown.replace(/\\subsection\*?\{([^}]*)}/g, (_match, title) => `\n### ${title.trim()}\n`);
        markdown = markdown.replace(/\\subsubsection\*?\{([^}]*)}/g, (_match, title) => `\n#### ${title.trim()}\n`);

        markdown = markdown.replace(/\\begin\{(equation|align|gather|multline)\*?}([\s\S]*?)\\end\{\1\*?}/g, (_match, _env, inner) => `\n\n$$\n${inner.trim()}\n$$\n\n`);
        markdown = markdown.replace(/\\\[/g, "$$\n");
        markdown = markdown.replace(/\\\]/g, "\n$$");
        markdown = markdown.replace(/\\\(/g, "$\n");
        markdown = markdown.replace(/\\\)/g, "\n$");

        markdown = markdown.replace(/\\includegraphics(?:\[[^]]*])?\{([^}]*)}/g, (_match, file) => `![${this.i18n.labelFigurePlaceholder}](${file})`);

        markdown = markdown.replace(/\\begin\{thebibliography}[\s\S]*?\\end\{thebibliography}/gi, "");

        markdown = markdown.replace(/\\begin\{table}([\s\S]*?)\\end\{table}/g, (_match, inner) => `\n\n${inner.trim()}\n\n`);
        markdown = markdown.replace(/\\begin\{figure}([\s\S]*?)\\end\{figure}/g, (_match, inner) => `\n\n${inner.trim()}\n\n`);

        markdown = markdown.replace(/\\newline/g, "\n");
        markdown = markdown.replace(/~+/g, " ");
        markdown = markdown.replace(/\\(text|mathrm|mathit|mathbf)\s*\{([^}]*)}/g, "$2");
        markdown = markdown.replace(/\\%/g, "%");
        markdown = markdown.replace(/\\_/g, "_");
        markdown = markdown.replace(/\\&/g, "&");
        markdown = markdown.replace(/\\#/g, "#");
        markdown = markdown.replace(/\\\$/g, "$");

        if (options.omitReferences) {
            markdown = markdown.replace(/\n##\s*(references|bibliography)[\s\S]*/i, "");
        }

        markdown = markdown.replace(/\n{3,}/g, "\n\n");
        markdown = markdown.replace(/[ \t]+\n/g, "\n");

        return markdown.trim();
    }

    private convertLatexList(items: string, numbered: boolean): string {
        const parts = items
            .split(/\\item/g)
            .map((part) => part.trim())
            .filter(Boolean);
        if (!parts.length) {
            return "";
        }
        return `\n${parts
            .map((part, index) => (numbered ? `${index + 1}. ${part}` : `- ${part}`))
            .join("\n")}\n`;
    }

    private buildHeadingCodeSection(heading: string, lines: string[]): string {
        const normalizedHeading = heading.trim();
        const headingLine = normalizedHeading ? `## ${normalizedHeading}` : "##";
        return `${headingLine}\n\n${this.formatCodeBlock(lines)}`;
    }

    private formatCodeBlock(lines: string[]): string {
        return ["```text", ...lines, "```"].join("\n");
    }
}
