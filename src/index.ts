import {Dialog, Plugin, Protyle, showMessage, getFrontend} from "siyuan";
import type {Lute} from "siyuan";
import TurndownService from "turndown";
import {gfm as turndownPluginGfm} from "turndown-plugin-gfm";
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

interface LlmConfig {
    enabled: boolean;
    baseUrl: string;
    apiPath: string;
    apiKey: string;
    model: string;
    fullInput: boolean;
}

interface LlmContextOptions {
    llmSource?: string;
    llmFullSource?: string;
    prefix?: string;
}

interface PluginSettings {
    llmConfig: {
        baseUrl: string;
        apiPath: string;
        model: string;
        apiKey: string;
    };
}

interface MarkdownConversionResult {
    markdown: string;
    llmSource: string;
    llmFullSource?: string;
    prefix?: string;
}

interface ForwardProxyResponse {
    code: number;
    msg?: string;
    data?: {
        status: number;
        contentType?: string;
        body?: string;
        bodyEncoding?: string;
    };
}

const DEFAULT_LLM_MODEL = "deepseek-chat";
const DEFAULT_LLM_PATH = "/chat/completions";
const LLM_TIMEOUT_MS = 240000;
const LLM_FULL_INPUT_TIMEOUT_MS = 480000;
const LLM_MAX_CONCURRENCY = 32;
const LLM_SYSTEM_PROMPT = "You are an assistant that strictly reformats scientific content into clean Markdown. Preserve every heading level, image reference, table, formula and piece of text exactly as provided without adding, omitting, or altering meaning. Return only the corrected Markdown.";

export default class ArxivPaperPlugin extends Plugin {
    private isMobile = false;

    private readonly slashId = "insert-arxiv-paper";

    private settingsReady: Promise<void> | null = null;

    private settings: PluginSettings = {
        llmConfig: {
            baseUrl: "",
            apiPath: DEFAULT_LLM_PATH,
            model: DEFAULT_LLM_MODEL,
            apiKey: "",
        },
    };

    onload() {
        this.settingsReady = this.loadSettings();
        void this.settingsReady;
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
                    void this.openInsertDialog(protyle);
                },
            },
        ];
    }

    private async openInsertDialog(protyle: Protyle) {
        if (this.settingsReady) {
            try {
                await this.settingsReady;
            } catch (err) {
                console.warn("ArxivPaperPlugin: failed to prepare settings before opening dialog", err);
            }
        }
        const dialog = new Dialog({
            title: this.i18n.insertArxivPaper,
            content: `<div class="b3-dialog__content siyuan-arxiv-dialog">
    <label class="siyuan-arxiv-dialog__label">${this.i18n.inputLabel}</label>
    <input class="b3-text-field fn__block siyuan-arxiv-dialog__input" placeholder="${this.i18n.inputPlaceholder}" />
    <label class="siyuan-arxiv-dialog__checkbox"><input type="checkbox" class="b3-switch siyuan-arxiv-dialog__parse" />${this.i18n.parseFullTextLabel}</label>
    <label class="siyuan-arxiv-dialog__checkbox"><input type="checkbox" class="b3-switch siyuan-arxiv-dialog__omit-references" disabled />${this.i18n.omitReferencesLabel}</label>
    <div class="siyuan-arxiv-dialog__group">
        <label class="siyuan-arxiv-dialog__checkbox"><input type="checkbox" class="b3-switch siyuan-arxiv-dialog__llm-toggle" disabled />${this.i18n.llmToggleLabel}</label>
        <label class="siyuan-arxiv-dialog__checkbox"><input type="checkbox" class="b3-switch siyuan-arxiv-dialog__llm-full-input" disabled />${this.i18n.llmFullInputLabel}</label>
        <div class="siyuan-arxiv-dialog__llm-config">
            <label class="siyuan-arxiv-dialog__field">
                <span class="siyuan-arxiv-dialog__label">${this.i18n.llmBaseUrlLabel}</span>
                <input class="b3-text-field fn__block siyuan-arxiv-dialog__input siyuan-arxiv-dialog__llm-base" placeholder="${this.i18n.llmBaseUrlPlaceholder}" disabled />
            </label>
            <label class="siyuan-arxiv-dialog__field">
                <span class="siyuan-arxiv-dialog__label">${this.i18n.llmApiPathLabel}</span>
                <input class="b3-text-field fn__block siyuan-arxiv-dialog__input siyuan-arxiv-dialog__llm-path" value="${DEFAULT_LLM_PATH}" placeholder="${this.i18n.llmApiPathPlaceholder}" disabled />
            </label>
            <label class="siyuan-arxiv-dialog__field">
                <span class="siyuan-arxiv-dialog__label">${this.i18n.llmModelLabel}</span>
                <input class="b3-text-field fn__block siyuan-arxiv-dialog__input siyuan-arxiv-dialog__llm-model" value="${DEFAULT_LLM_MODEL}" placeholder="${this.i18n.llmModelPlaceholder}" disabled />
            </label>
            <label class="siyuan-arxiv-dialog__field">
                <span class="siyuan-arxiv-dialog__label">${this.i18n.llmApiKeyLabel}</span>
                <input type="password" class="b3-text-field fn__block siyuan-arxiv-dialog__input siyuan-arxiv-dialog__llm-key" placeholder="sk-********" autocomplete="off" disabled />
            </label>
        </div>
    </div>
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
        const llmToggle = dialog.element.querySelector(".siyuan-arxiv-dialog__llm-toggle");
        const llmFullInputToggle = dialog.element.querySelector(".siyuan-arxiv-dialog__llm-full-input");
        const llmBaseInput = dialog.element.querySelector(".siyuan-arxiv-dialog__llm-base");
        const llmPathInput = dialog.element.querySelector(".siyuan-arxiv-dialog__llm-path");
        const llmModelInput = dialog.element.querySelector(".siyuan-arxiv-dialog__llm-model");
        const llmKeyInput = dialog.element.querySelector(".siyuan-arxiv-dialog__llm-key");

        if (!(input instanceof HTMLInputElement)
            || !(cancelButton instanceof HTMLButtonElement)
            || !(confirmButton instanceof HTMLButtonElement)
            || !(statusElement instanceof HTMLElement)
            || !(parseCheckbox instanceof HTMLInputElement)
            || !(omitReferencesCheckbox instanceof HTMLInputElement)
            || !(llmToggle instanceof HTMLInputElement)
            || !(llmFullInputToggle instanceof HTMLInputElement)
            || !(llmBaseInput instanceof HTMLInputElement)
            || !(llmPathInput instanceof HTMLInputElement)
            || !(llmModelInput instanceof HTMLInputElement)
            || !(llmKeyInput instanceof HTMLInputElement)) {
            console.error("ArxivPaperPlugin: dialog template missing expected elements", {
                input,
                cancelButton,
                confirmButton,
                statusElement,
                parseCheckbox,
                omitReferencesCheckbox,
                llmToggle,
                llmFullInputToggle,
                llmBaseInput,
                llmPathInput,
                llmModelInput,
                llmKeyInput,
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

        const storedLlm = this.settings.llmConfig ?? {
            baseUrl: "",
            apiPath: DEFAULT_LLM_PATH,
            model: DEFAULT_LLM_MODEL,
            apiKey: "",
        };
        llmBaseInput.value = storedLlm.baseUrl ?? "";
        llmPathInput.value = storedLlm.apiPath || DEFAULT_LLM_PATH;
        llmModelInput.value = storedLlm.model || DEFAULT_LLM_MODEL;
        llmKeyInput.value = storedLlm.apiKey ?? "";

        const syncLlmAvailability = () => {
            const parseEnabled = parseCheckbox.checked;
            llmToggle.disabled = !parseEnabled;
            if (!parseEnabled) {
                llmToggle.checked = false;
            }
            const llmEnabled = parseEnabled && llmToggle.checked;
            llmFullInputToggle.disabled = !llmEnabled;
            if (!llmEnabled) {
                llmFullInputToggle.checked = false;
            }
            [llmBaseInput, llmPathInput, llmModelInput, llmKeyInput].forEach((field) => {
                field.disabled = !llmEnabled;
            });
        };

        parseCheckbox.addEventListener("change", syncReferenceToggle);
        parseCheckbox.addEventListener("change", syncLlmAvailability);
        llmToggle.addEventListener("change", syncLlmAvailability);
        syncReferenceToggle();
        syncLlmAvailability();

        cancelButton.addEventListener("click", () => {
            dialog.destroy();
        });

        const submit = async () => {
            if (!input.value.trim()) {
                statusElement.textContent = this.i18n.errorInvalidInput;
                statusElement.classList.add("siyuan-arxiv-dialog__status--error");
                return;
            }
            const llmConfig: LlmConfig = {
                enabled: parseCheckbox.checked && llmToggle.checked,
                baseUrl: llmBaseInput.value.trim(),
                apiPath: llmPathInput.value.trim() || DEFAULT_LLM_PATH,
                model: llmModelInput.value.trim() || DEFAULT_LLM_MODEL,
                apiKey: llmKeyInput.value.trim(),
                fullInput: llmFullInputToggle.checked,
            };

            if (llmConfig.enabled && (!llmConfig.baseUrl || !llmConfig.apiPath || !llmConfig.apiKey)) {
                statusElement.textContent = this.i18n.errorLlmConfig;
                statusElement.classList.add("siyuan-arxiv-dialog__status--error");
                return;
            }

            await this.persistLlmConfig(llmConfig);
            await this.handleInsert(
                protyle,
                input.value.trim(),
                parseCheckbox.checked,
                omitReferencesCheckbox.checked,
                llmConfig,
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
        llmConfig: LlmConfig,
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
                const markdown = await this.generateFullTextMarkdown(metadata, statusElement, {
                    omitReferences,
                    llmConfig,
                });
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
        const frontend = getFrontend();
        const isBrowserFrontend = frontend === "browser" || frontend === "browser-desktop" || frontend === "browser-mobile";

        let browserDirectError: string | null = null;
        if (isBrowserFrontend) {
            const directErrors: string[] = [];
            const attemptDirectDownload = async (candidateUrl: string, label: string): Promise<Blob | null> => {
                try {
                    return await this.downloadPdfDirect(candidateUrl);
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    directErrors.push(`${label}: ${message}`);
                    console.warn(`Failed to download PDF directly via ${label}`, error);
                    return null;
                }
            };

            const exportUrl = this.buildBrowserFriendlyPdfUrl(url);
            if (exportUrl) {
                const exportResult = await attemptDirectDownload(exportUrl, "export.arxiv.org");
                if (exportResult) {
                    return exportResult;
                }
            }

            const originResult = await attemptDirectDownload(url, "arxiv.org");
            if (originResult) {
                return originResult;
            }

            if (directErrors.length) {
                browserDirectError = directErrors.join("; ");
            }

            try {
                return await this.downloadPdfViaProxy(url);
            } catch (error) {
                if (browserDirectError) {
                    const detail = this.i18n.errorBrowserDirectFallback.replace("${detail}", browserDirectError);
                    if (error instanceof Error) {
                        error.message = `${error.message} ${detail}`;
                    } else {
                        throw new Error(`${String(error)} ${detail}`);
                    }
                }
                throw error;
            }
        }

        return this.downloadPdfDirect(url);
    }

    private buildBrowserFriendlyPdfUrl(url: string): string | null {
        try {
            const parsed = new URL(url);
            if (!parsed.hostname.endsWith("arxiv.org")) {
                return null;
            }

            const normalizedPath = parsed.pathname.replace(/\/+/g, "/");
            if (!normalizedPath.startsWith("/pdf/")) {
                return null;
            }

            const identifier = normalizedPath.slice("/pdf/".length).replace(/\.pdf$/i, "");
            if (!identifier) {
                return null;
            }

            const query = parsed.search ? parsed.search : "";
            return `https://export.arxiv.org/pdf/${identifier}${query}`;
        } catch (error) {
            console.warn("Failed to build browser-friendly arXiv PDF URL", error);
            return null;
        }
    }

    private async downloadPdfDirect(url: string): Promise<Blob> {
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

    private async downloadPdfViaProxy(url: string): Promise<Blob> {
        const proxyRequest = {
            url,
            method: "GET",
            timeout: 15000,
            headers: [] as Array<Record<string, string>>,
            contentType: "application/json",
            payload: "",
            payloadEncoding: "text",
            responseEncoding: "base64",
        };

        const candidateEndpoints = [
            "/api/network/forwardProxy",
            "/api/system/proxy",
        ];

        const errorDetails: string[] = [];

        for (const endpoint of candidateEndpoints) {
            try {
                return await this.requestProxyEndpoint(endpoint, proxyRequest);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                errorDetails.push(`${endpoint}: ${message}`);
            }
        }

        const detail = errorDetails.filter(Boolean).join("; ");
        const baseMessage = this.i18n.errorProxyRequest;
        throw new Error(detail ? `${baseMessage} (${detail})` : baseMessage);
    }

    private async requestProxyEndpoint(endpoint: string, payload: Record<string, unknown>): Promise<Blob> {
        let response: Response;
        try {
            response = await fetch(endpoint, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(payload),
            });
        } catch (error) {
            throw new Error(this.i18n.errorProxyRequest);
        }

        if (!response.ok) {
            throw new Error(this.i18n.errorProxyStatus.replace("${status}", String(response.status)));
        }

        let result: ForwardProxyResponse;
        try {
            result = (await response.json()) as ForwardProxyResponse;
        } catch (error) {
            throw new Error(this.i18n.errorProxyRequest);
        }

        if (result.code !== 0 || !result.data) {
            throw new Error(result.msg || this.i18n.errorProxyRequest);
        }

        const {body, bodyEncoding, contentType, status} = result.data;
        if (!body) {
            throw new Error(this.i18n.errorProxyRequest);
        }

        if (status < 200 || status >= 300) {
            let errorDetail = "";
            if (bodyEncoding?.startsWith("base64")) {
                try {
                    const decoded = this.decodeBase64(body);
                    errorDetail = new TextDecoder().decode(decoded).trim();
                } catch (err) {
                    console.warn("Failed to decode proxy error body", err);
                }
            }
            const statusMessage = this.i18n.errorProxyStatus.replace("${status}", String(status));
            throw new Error(errorDetail ? `${statusMessage} ${errorDetail}` : statusMessage);
        }

        if (!bodyEncoding?.startsWith("base64")) {
            throw new Error(this.i18n.errorProxyEncoding.replace("${encoding}", bodyEncoding ?? "unknown"));
        }

        const bytes = this.decodeBase64(body);
        if (!bytes.byteLength) {
            throw new Error(this.i18n.errorDownloadPdf);
        }

        return new Blob([bytes], {type: contentType || "application/pdf"});
    }

    private decodeBase64(data: string): Uint8Array {
        let binary: string;
        if (typeof globalThis.atob === "function") {
            binary = globalThis.atob(data);
        } else {
            const bufferCtor = (globalThis as typeof globalThis & {Buffer?: {from: (input: string, encoding: string) => {toString: (encoding: string) => string}}}).Buffer;
            if (!bufferCtor) {
                throw new Error("Base64 decoding not supported in this environment.");
            }
            binary = bufferCtor.from(data, "base64").toString("binary");
        }
        const length = binary.length;
        const bytes = new Uint8Array(length);
        for (let i = 0; i < length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
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
        options: {omitReferences: boolean; llmConfig: LlmConfig},
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
            const htmlMarkdown = this.convertArxivHtmlToMarkdown(htmlContent, metadata, options);
            if (htmlMarkdown) {
                return this.applyLlmIfNeeded(
                    htmlMarkdown.markdown,
                    statusElement,
                    options.llmConfig,
                    {
                        llmSource: htmlMarkdown.llmSource,
                        llmFullSource: htmlMarkdown.llmFullSource,
                        prefix: htmlMarkdown.prefix,
                    },
                );
            }
        }

        statusElement.textContent = this.i18n.statusFallbackLatex;
        const latexMarkdown = await this.fetchLatexMarkdown(metadata, {omitReferences: options.omitReferences});
        if (latexMarkdown) {
            return this.applyLlmIfNeeded(
                latexMarkdown.markdown,
                statusElement,
                options.llmConfig,
                {
                    llmSource: latexMarkdown.llmSource,
                    llmFullSource: latexMarkdown.llmFullSource,
                    prefix: latexMarkdown.prefix,
                },
            );
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
        options: {omitReferences: boolean; llmConfig: LlmConfig},
    ): MarkdownConversionResult | null {
        const {omitReferences} = options;
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
        turndown.use(turndownPluginGfm);

        const rawMarkdownBody = turndown.turndown(article.innerHTML).trim();
        let markdown = this.cleanupMarkdown(rawMarkdownBody);

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
        if (!omitReferences && compressionBlocks.references) {
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

        const prefix = combinedBlocks.length ? combinedBlocks.join("\n\n") : "";
        const prefixWithSpacing = prefix ? `${prefix}\n\n` : "";
        const finalMarkdown = `${prefixWithSpacing}${markdown}`.trim();
        const llmSource = `${prefixWithSpacing}${rawMarkdownBody}`.trim();

        return {
            markdown: finalMarkdown,
            llmSource,
            llmFullSource: rawMarkdownBody,
            prefix,
        };
    }

    private async applyLlmIfNeeded(
        markdown: string,
        statusElement: HTMLElement,
        llmConfig: LlmConfig,
        context?: LlmContextOptions,
    ): Promise<string> {
        const trimmedMarkdown = markdown.trim();
        if (!llmConfig.enabled) {
            return trimmedMarkdown;
        }
        const source = context?.llmSource?.trim() || trimmedMarkdown;
        return this.refineMarkdownWithLlm(source, statusElement, llmConfig, {
            prefix: context?.prefix,
            fullSource: context?.llmFullSource,
        });
    }

    private async refineMarkdownWithLlm(
        markdown: string,
        statusElement: HTMLElement,
        config: LlmConfig,
        context?: {prefix?: string; fullSource?: string},
    ): Promise<string> {
        if (config.fullInput) {
            const fullSource = context?.fullSource?.trim() || markdown;
            if (!fullSource) {
                return markdown.trim();
            }
            statusElement.textContent = this.i18n.statusRefiningWithLlmFull
                ?? "Refining full document with the LLM...";
            const refined = await this.invokeLlm(fullSource, config, LLM_FULL_INPUT_TIMEOUT_MS);
            const prefix = context?.prefix?.trim();
            const prefixWithSpacing = prefix ? `${prefix}\n\n` : "";
            return `${prefixWithSpacing}${refined.trim()}`.trim();
        }

        const sections = this.splitMarkdownIntoSections(markdown);
        const queue = sections
            .map((section, index) => ({section, index}))
            .filter(({section}) => !section.skip)
            .map(({index}) => index);
        if (!queue.length) {
            return markdown.trim();
        }

        const total = queue.length;
        const results: Array<string | undefined> = new Array(sections.length);
        sections.forEach((section, index) => {
            if (section.skip) {
                results[index] = section.content;
            }
        });

        let processed = 0;
        const updateStatus = () => {
            const message = (this.i18n.statusRefiningWithLlm ?? "Refining with LLM...")
                .replace("${index}", String(processed))
                .replace("${total}", String(total));
            statusElement.textContent = message;
        };

        const worker = async () => {
            while (queue.length) {
                const nextIndex = queue.shift();
                if (nextIndex === undefined) {
                    break;
                }
                const section = sections[nextIndex];
                try {
                    const refined = await this.invokeLlm(section.content, config);
                    results[nextIndex] = refined.trim();
                } finally {
                    processed += 1;
                    updateStatus();
                }
            }
        };

        const workerCount = Math.min(LLM_MAX_CONCURRENCY, total);
        const workers = Array.from({length: workerCount}, () => worker());
        updateStatus();
        await Promise.all(workers);

        const ordered = results.map((value, index) => (value !== undefined ? value : sections[index].content));
        return ordered.join("\n\n").trim();
    }

    private splitMarkdownIntoSections(markdown: string): Array<{content: string; skip: boolean}> {
        const normalized = markdown.replace(/\r\n?/g, "\n").trim();
        if (!normalized) {
            return [];
        }

        const lines = normalized.split("\n");
        const sections: Array<{content: string; skip: boolean}> = [];
        let current: string[] = [];

        const pushCurrent = () => {
            const content = current.join("\n").trim();
            current = [];
            if (!content) {
                return;
            }
            sections.push({
                content,
                skip: this.shouldSkipLlmForSection(content),
            });
        };

        const headingPattern = /^#{1,6}\s+/;
        for (const line of lines) {
            if (headingPattern.test(line) && current.length) {
                pushCurrent();
            }
            current.push(line);
        }
        pushCurrent();

        return sections;
    }

    private shouldSkipLlmForSection(content: string): boolean {
        if (!content) {
            return true;
        }

        if (/^```/.test(content)) {
            return true;
        }

        const headingMatch = content.match(/^#{1,6}\s+([^\n]+)/);
        if (headingMatch) {
            const heading = headingMatch[1].trim().toLowerCase();
            const protectedHeadings = [
                this.i18n.headingAuthors,
                this.i18n.headingReferences,
                this.i18n.labelAcknowledgements,
                "authors",
                "author",
                "references",
                "reference",
                "bibliography",
            ]
                .map((value) => value?.toString().trim().toLowerCase())
                .filter((value): value is string => Boolean(value));
            if (protectedHeadings.includes(heading) || protectedHeadings.some((value) => heading.includes(value))) {
                return true;
            }
        }

        return false;
    }

    private async loadSettings(): Promise<void> {
        try {
            const stored = await this.loadData("settings");
            if (stored && typeof stored === "object") {
                const llmConfig = (stored as Partial<PluginSettings>).llmConfig;
                this.settings = {
                    llmConfig: {
                        baseUrl: llmConfig?.baseUrl ?? "",
                        apiPath: llmConfig?.apiPath || DEFAULT_LLM_PATH,
                        model: llmConfig?.model || DEFAULT_LLM_MODEL,
                        apiKey: llmConfig?.apiKey ?? "",
                    },
                };
                return;
            }
        } catch (err) {
            console.warn("ArxivPaperPlugin: failed to load settings", err);
        }
        this.settings = {
            llmConfig: {
                baseUrl: "",
                apiPath: DEFAULT_LLM_PATH,
                model: DEFAULT_LLM_MODEL,
                apiKey: "",
            },
        };
    }

    private async persistLlmConfig(config: LlmConfig) {
        const nextConfig = {
            baseUrl: config.baseUrl,
            apiPath: config.apiPath,
            model: config.model,
            apiKey: config.apiKey,
        };
        const hasChanges = Object.entries(nextConfig).some(([key, value]) => this.settings.llmConfig[key as keyof PluginSettings["llmConfig"]] !== value);
        if (!hasChanges) {
            return;
        }
        this.settings.llmConfig = nextConfig;
        try {
            await this.saveData("settings", this.settings);
        } catch (err) {
            console.warn("ArxivPaperPlugin: failed to save settings", err);
        }
    }

    private async invokeLlm(section: string, config: LlmConfig, timeoutMs = LLM_TIMEOUT_MS): Promise<string> {
        const endpoint = this.resolveLlmEndpoint(config);
        const payload = {
            model: config.model || DEFAULT_LLM_MODEL,
            messages: [
                {role: "system", content: LLM_SYSTEM_PROMPT},
                {
                    role: "user",
                    content: `Reformat the following Markdown section so it is valid, readable Markdown. Preserve every heading level, math expression, table structure, list, code fence, citation, image link, and textual detail exactly as written. Do not add commentary or omit content. Return only Markdown.\n\n${section}`,
                },
            ],
            stream: false,
        };

        let response: Response;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const headers: Record<string, string> = {"Content-Type": "application/json"};
            if (config.apiKey) {
                headers.Authorization = `Bearer ${config.apiKey}`;
            }
            response = await fetch(endpoint, {
                method: "POST",
                headers,
                body: JSON.stringify(payload),
                signal: controller.signal,
            });
        } catch (err) {
            if ((err as DOMException | undefined)?.name === "AbortError") {
                console.error("ArxivPaperPlugin: LLM request timed out", err);
            } else {
                console.error("ArxivPaperPlugin: LLM request failed", err);
            }
            throw new Error(this.i18n.errorLlmRequestFailed ?? "LLM request failed.");
        } finally {
            clearTimeout(timeoutId);
        }

        const raw = await response.text();
        let data: unknown;
        try {
            data = raw ? JSON.parse(raw) : undefined;
        } catch (err) {
            console.warn("ArxivPaperPlugin: failed to parse LLM response", err, raw);
            data = undefined;
        }

        if (!response.ok) {
            const serverMessage = typeof (data as {error?: {message?: string}} | undefined)?.error?.message === "string"
                ? (data as {error?: {message?: string}}).error!.message
                : undefined;
            throw new Error(serverMessage || this.i18n.errorLlmRequestFailed || "LLM request failed.");
        }

        const content = (data as {choices?: Array<{message?: {content?: string}}>} | undefined)?.choices?.[0]?.message?.content;
        if (typeof content !== "string" || !content.trim()) {
            throw new Error(this.i18n.errorLlmInvalidResponse ?? "Invalid LLM response.");
        }

        return content;
    }

    private resolveLlmEndpoint(config: LlmConfig): string {
        const trimmedPath = config.apiPath.trim();
        if (/^https?:\/\//i.test(trimmedPath)) {
            return trimmedPath;
        }
        const normalizedBase = config.baseUrl.trim().replace(/\/+$/, "");
        const effectivePath = trimmedPath
            ? (trimmedPath.startsWith("/") ? trimmedPath : `/${trimmedPath}`)
            : DEFAULT_LLM_PATH;
        return `${normalizedBase}${effectivePath}`;
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

    private async fetchLatexMarkdown(
        metadata: ArxivMetadata,
        options: {omitReferences: boolean},
    ): Promise<MarkdownConversionResult | null> {
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
    ): Promise<MarkdownConversionResult | null> {
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

        const prefix = sections.length ? sections.join("\n\n") : "";
        const prefixWithSpacing = prefix ? `${prefix}\n\n` : "";
        const body = markdownBody.trim();
        const combined = `${prefixWithSpacing}${body}`.trim();
        return {
            markdown: combined,
            llmSource: combined,
            llmFullSource: body,
            prefix,
        };
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
