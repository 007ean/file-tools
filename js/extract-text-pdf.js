(() => {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const fileInfo = document.getElementById("fileInfo");
  const pageInfo = document.getElementById("pageInfo");
  const scope = document.getElementById("scope");
  const rangesBox = document.getElementById("rangesBox");
  const rangesInput = document.getElementById("ranges");
  const output = document.getElementById("output");

  const extractBtn = document.getElementById("extractBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const clearBtn = document.getElementById("clearBtn");
  const statusEl = document.getElementById("status");
  const errorEl = document.getElementById("error");

  const preview = window.FileTools?.createPdfPreview({ anchorEl: pageInfo, maxThumbs: 4 });
  const settingsStore = window.FileTools?.bindToolSettings("extract-text-pdf", ["scope", "ranges"]);

  let pdfFile = null;
  let pdfBytes = null;
  let pageCount = 0;
  let extractedText = "";

  function setError(msg) {
    if (!msg) {
      errorEl.style.display = "none";
      errorEl.textContent = "";
      return;
    }
    errorEl.style.display = "block";
    errorEl.textContent = msg;
  }

  function setStatus(msg) {
    statusEl.textContent = msg || "";
  }

  function humanBytes(bytes) {
    if (!Number.isFinite(bytes)) return "";
    const units = ["B", "KB", "MB", "GB"];
    let i = 0;
    let n = bytes;
    while (n >= 1024 && i < units.length - 1) {
      n /= 1024;
      i++;
    }
    return `${n.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
  }

  function resetOutput() {
    extractedText = "";
    output.value = "";
    downloadBtn.disabled = true;
  }

  function resetAll(resetSettings) {
    setError("");
    setStatus("");
    pdfFile = null;
    pdfBytes = null;
    pageCount = 0;
    fileInfo.textContent = "";
    pageInfo.textContent = "";
    resetOutput();

    if (resetSettings && settingsStore) settingsStore.reset();
    scope.value = scope.value || "all";
    rangesBox.style.display = (scope.value === "ranges") ? "" : "none";

    extractBtn.disabled = true;
    clearBtn.disabled = true;
    if (preview) preview.clear();
  }

  function parseRanges(input, maxPages) {
    const raw = String(input || "").trim();
    if (!raw) return { error: "Enter page ranges, for example 1-3,5,8-10." };
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return { error: "Enter page ranges, for example 1-3,5,8-10." };
    const out = new Set();
    for (const part of parts) {
      if (/^\d+$/.test(part)) {
        const p = Number(part);
        if (p < 1 || p > maxPages) return { error: `Page ${part} is out of range (1-${maxPages}).` };
        out.add(p - 1);
        continue;
      }
      const m = part.match(/^(\d+)\s*-\s*(\d+)$/);
      if (!m) return { error: `Invalid token: "${part}".` };
      let a = Number(m[1]);
      let b = Number(m[2]);
      if (a < 1 || b < 1 || a > maxPages || b > maxPages) return { error: `Range ${part} is out of range.` };
      if (b < a) [a, b] = [b, a];
      for (let p = a; p <= b; p++) out.add(p - 1);
    }
    const pages = Array.from(out).sort((x, y) => x - y);
    if (!pages.length) return { error: "No pages selected." };
    return { pages };
  }

  function getTargetPages() {
    if (scope.value === "all") {
      return { pages: Array.from({ length: pageCount }, (_, i) => i) };
    }
    return parseRanges(rangesInput.value, pageCount);
  }

  async function ensurePdfJsReady() {
    if (window.FileTools?.ensurePdfJs) return window.FileTools.ensurePdfJs();
    if (window.pdfjsLib && window.pdfjsLib.getDocument) return window.pdfjsLib;
    throw new Error("pdf.js not available");
  }

  async function loadPdf(file) {
    setError("");
    setStatus("");
    resetOutput();
    if (!file) return;

    const isPdf = file.type === "application/pdf" || String(file.name || "").toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setError(window.FileTools?.describeFileTypeError(file, "PDF file") || "Please select a PDF file.");
      return;
    }

    try {
      await ensurePdfJsReady();
      pdfFile = file;
      pdfBytes = new Uint8Array(await file.arrayBuffer());
      fileInfo.textContent = `${file.name} - ${humanBytes(file.size)}`;

      setStatus("Reading PDF...");
      const loadingTask = window.pdfjsLib.getDocument({ data: pdfBytes });
      const pdf = await loadingTask.promise;
      pageCount = pdf.numPages;
      pageInfo.textContent = `Pages: ${pageCount}`;
      if (preview) preview.renderFromBytes(pdfBytes, pageCount);

      extractBtn.disabled = false;
      clearBtn.disabled = false;
      setStatus("Ready.");
    } catch (e) {
      console.error(e);
      setError(window.FileTools?.describePdfError(e, "read this PDF") || "Failed to read PDF.");
      setStatus("");
      resetAll(false);
    }
  }

  async function extractText() {
    setError("");
    setStatus("");
    resetOutput();

    if (!pdfBytes || !pageCount) {
      setError("Please select a PDF first.");
      return;
    }

    const target = getTargetPages();
    if (target.error) {
      setError(target.error);
      return;
    }

    try {
      const loadingTask = window.pdfjsLib.getDocument({ data: pdfBytes });
      const pdf = await loadingTask.promise;
      const chunks = [];

      for (let i = 0; i < target.pages.length; i++) {
        const pageNum = target.pages[i] + 1;
        setStatus(`Extracting page ${pageNum} (${i + 1}/${target.pages.length})...`);
        const page = await pdf.getPage(pageNum);
        const text = await page.getTextContent();
        const line = text.items.map((item) => String(item.str || "")).join(" ").replace(/\s+/g, " ").trim();
        chunks.push(`--- Page ${pageNum} ---`);
        chunks.push(line);
        chunks.push("");
      }

      extractedText = chunks.join("\n");
      output.value = extractedText;
      downloadBtn.disabled = !extractedText.trim();

      if (!extractedText.trim()) {
        setStatus("No text found. This may be a scanned/image-only PDF.");
      } else {
        setStatus("Done.");
      }
    } catch (e) {
      console.error(e);
      setError(window.FileTools?.describePdfError(e, "extract text") || "Failed to extract text.");
      setStatus("");
    }
  }

  function downloadText() {
    setError("");
    if (!extractedText.trim()) {
      setError("No extracted text to download.");
      return;
    }
    const base = window.FileTools?.toSafeBaseName(pdfFile?.name || "document") || "document";
    const filename = `${base}-extracted-text.txt`;
    const blob = new Blob([extractedText], { type: "text/plain;charset=utf-8" });
    if (window.FileTools?.triggerBlobDownload) {
      window.FileTools.triggerBlobDownload(blob, filename);
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function wireDropzone() {
    dropzone.addEventListener("click", () => fileInput.click());
    dropzone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fileInput.click();
      }
    });
    fileInput.addEventListener("change", () => {
      const picked = fileInput.files && fileInput.files[0];
      if (picked) loadPdf(picked);
      fileInput.value = "";
    });

    ["dragenter", "dragover"].forEach((evt) => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.style.borderColor = "#bbb";
      });
    });
    ["dragleave", "drop"].forEach((evt) => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.style.borderColor = "#ddd";
      });
    });
    dropzone.addEventListener("drop", (e) => {
      const dropped = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (dropped) loadPdf(dropped);
    });
  }

  scope.addEventListener("change", () => {
    rangesBox.style.display = (scope.value === "ranges") ? "" : "none";
    resetOutput();
  });
  rangesInput.addEventListener("input", resetOutput);
  extractBtn.addEventListener("click", extractText);
  downloadBtn.addEventListener("click", downloadText);
  clearBtn.addEventListener("click", () => resetAll(true));

  wireDropzone();
  resetAll(false);
})();
