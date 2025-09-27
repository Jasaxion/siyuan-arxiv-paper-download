import {Dialog, Plugin, Protyle, showMessage, getFrontend} from "siyuan";
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
    <div class="siyuan-arxiv-dialog__status" aria-live="polite"></div>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel">${this.i18n.cancel}</button><div class="fn__space"></div>
    <button class="b3-button b3-button--text siyuan-arxiv-dialog__confirm">${this.i18n.confirm}</button>
</div>`,
            width: this.isMobile ? "92vw" : "480px",
        });

        const input = dialog.element.querySelector(".siyuan-arxiv-dialog__input") as HTMLInputElement;
        const cancelButton = dialog.element.querySelector(".b3-button--cancel") as HTMLButtonElement;
        const confirmButton = dialog.element.querySelector(".siyuan-arxiv-dialog__confirm") as HTMLButtonElement;
        const statusElement = dialog.element.querySelector(".siyuan-arxiv-dialog__status") as HTMLElement;

        cancelButton.addEventListener("click", () => {
            dialog.destroy();
        });

        const submit = async () => {
            if (!input.value.trim()) {
                statusElement.textContent = this.i18n.errorInvalidInput;
                statusElement.classList.add("siyuan-arxiv-dialog__status--error");
                return;
            }
            await this.handleInsert(protyle, input.value.trim(), statusElement, confirmButton, dialog);
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

    private async handleInsert(protyle: Protyle, rawInput: string, statusElement: HTMLElement, confirmButton: HTMLButtonElement, dialog: Dialog) {
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
            const {title, pdfUrl} = await this.fetchArxivMetadata(arxivId);

            const fileName = this.buildPdfFileName(title, arxivId);
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
                const pdfBlob = await this.downloadPdf(pdfUrl);

                statusElement.textContent = this.i18n.statusUploading;
                assetPath = await this.uploadPdf(pdfBlob, fileName);
            }

            const markdownLink = `[${fileName}](${assetPath})`;
            dialog.destroy();
            protyle.focus();
            protyle.insert(markdownLink, false, true);
            const successTemplate = reusedExisting ? this.i18n.successReusedMessage : this.i18n.successMessage;
            showMessage(successTemplate.replace("${title}", title));
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

        const urlPattern = /arxiv\.org\/(?:abs|pdf)\/([^?#]+?)(?:\.pdf)?(?:[?#].*)?$/i;
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

    private async fetchArxivMetadata(arxivId: string): Promise<{title: string; pdfUrl: string}> {
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
        const pdfUrl = `https://arxiv.org/pdf/${arxivId}.pdf`;
        return {title, pdfUrl};
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
}
