(() => {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const fileInfo = document.getElementById("fileInfo");
  const pageInfo = document.getElementById("pageInfo");

  const rangesInput = document.getElementById("ranges");

  const extractBtn = document.getElementById("extractBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const clearBtn = document.getElementById("clearBtn");

  const statusEl = document.getElementById("status");
  const errorEl = document.getElementById("error");
  const preview = window.FileTools?.createPdfPreview({ anchorEl: pageInfo, maxThumbs: 4 });
  const settingsStore = window.FileTools?.bindToolSettings("split-pdf", ["ranges"]);

  let pdfFile = null;
  let pdfBytes = null;
  let pageCount = 0;

  let outputBlob = null;
  let outputUrl = null;

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
    outputBlob = null;
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    outputUrl = null;
    downloadBtn.disabled = true;
  }

  function resetAll(resetSettings) {
    setError("");
    setStatus("");
    resetOutput();

    pdfFile = null;
    pdfBytes = null;
    pageCount = 0;

    fileInfo.textContent = "";
    pageInfo.textContent = "";

    if (resetSettings && settingsStore) settingsStore.reset();
    rangesInput.value = rangesInput.value || "";

    extractBtn.disabled = true;
    clearBtn.disabled = true;
    if (preview) preview.clear();
  }

  // Parse "1-3,5,8-10" into sorted unique 0-based indices
  function parseRanges(input, maxPages) {
    const raw = String(input || "").trim();
    if (!raw) return { error: "Enter page ranges, e.g. 1-3,5,8-10." };

    const parts = raw.split(",").map(s => s.trim()).filter(Boolean);
    if (parts.length === 0) return { error: "Enter page ranges, e.g. 1-3,5,8-10." };

    const indices = new Set();

    for (const part of parts) {
      // single number
      if (/^\d+$/.test(part)) {
        const p = Number(part);
        if (!Number.isFinite(p) || p < 1 || p > maxPages) {
          return { error: `Page ${part} is out of range (1-${maxPages}).` };
        }
        indices.add(p - 1);
        continue;
      }

      // range a-b
      const m = part.match(/^(\d+)\s*-\s*(\d+)$/);
      if (m) {
        let a = Number(m[1]);
        let b = Number(m[2]);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return { error: `Invalid range: ${part}` };
        if (a < 1 || b < 1 || a > maxPages || b > maxPages) {
          return { error: `Range ${part} is out of range (1-${maxPages}).` };
        }
        if (b < a) [a, b] = [b, a]; // allow "5-3"
        for (let p = a; p <= b; p++) indices.add(p - 1);
        continue;
      }

      return { error: `Invalid token: "${part}". Use formats like 2 or 2-5, separated by commas.` };
    }

    const out = Array.from(indices).sort((x, y) => x - y);
    if (out.length === 0) return { error: "No pages selected." };
    return { pages: out };
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

    if (typeof PDFLib === "undefined" || !PDFLib.PDFDocument) {
      setError("PDF library failed to load. Refresh the page and try again.");
      return;
    }

    pdfFile = file;
    fileInfo.textContent = `${file.name} • ${humanBytes(file.size)}`;

    setStatus("Reading PDF…");
    try {
      pdfBytes = await file.arrayBuffer();
      const doc = await PDFLib.PDFDocument.load(pdfBytes);
      pageCount = doc.getPageCount();

      pageInfo.textContent = `Pages: ${pageCount}`;
      if (preview) preview.renderFromBytes(new Uint8Array(pdfBytes), pageCount);
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

  async function extractPages() {
    setError("");
    setStatus("");
    resetOutput();

    if (!pdfBytes || !pageCount) {
      setError("Please select a PDF first.");
      return;
    }

    const parsed = parseRanges(rangesInput.value, pageCount);
    if (parsed.error) {
      setError(parsed.error);
      return;
    }

    const pages = parsed.pages;

    setStatus(`Extracting ${pages.length} page(s)…`);

    try {
      const src = await PDFLib.PDFDocument.load(pdfBytes);
      const out = await PDFLib.PDFDocument.create();

      const copied = await out.copyPages(src, pages);
      copied.forEach(p => out.addPage(p));

      setStatus("Saving…");
      const outBytes = await out.save();

      outputBlob = new Blob([outBytes], { type: "application/pdf" });
      outputUrl = URL.createObjectURL(outputBlob);

      downloadBtn.disabled = false;
      setStatus("Done.");
    } catch (e) {
      console.error(e);
      setError(window.FileTools?.describePdfError(e, "extract pages") || "Failed to extract pages.");
      setStatus("");
    }
  }

  function downloadOutput() {
    setError("");
    if (!outputUrl || !outputBlob) {
      setError("Nothing to download yet.");
      return;
    }
    const baseName = (pdfFile?.name || "document").replace(/\.pdf$/i, "");
    const filename = window.FileTools?.makeDownloadName(baseName, "split", "pdf")
      || `${baseName}-split.pdf`;
    if (window.FileTools?.triggerBlobDownload) {
      window.FileTools.triggerBlobDownload(outputBlob, filename);
      return;
    }
    const a = document.createElement("a");
    a.href = outputUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
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

  rangesInput.addEventListener("input", () => resetOutput());
  extractBtn.addEventListener("click", extractPages);
  downloadBtn.addEventListener("click", downloadOutput);
  clearBtn.addEventListener("click", () => resetAll(true));

  wireDropzone();
  resetAll(false);
})();
