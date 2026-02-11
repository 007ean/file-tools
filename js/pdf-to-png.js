(() => {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const fileInfo = document.getElementById("fileInfo");
  const pageInfo = document.getElementById("pageInfo");

  const scope = document.getElementById("scope");
  const rangesBox = document.getElementById("rangesBox");
  const rangesInput = document.getElementById("ranges");

  const scale = document.getElementById("scale");
  const scaleVal = document.getElementById("scaleVal");

  const exportBtn = document.getElementById("exportBtn");
  const clearBtn = document.getElementById("clearBtn");

  const statusEl = document.getElementById("status");
  const errorEl = document.getElementById("error");

  const downloadsEl = document.getElementById("downloads");

  let pdfFile = null;
  let pdfData = null; // Uint8Array
  let pageCount = 0;

  let activeUrls = [];

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

  function revokeAllUrls() {
    for (const u of activeUrls) URL.revokeObjectURL(u);
    activeUrls = [];
  }

  function resetDownloads() {
    revokeAllUrls();
    downloadsEl.innerHTML = `<div class="hint">No exports yet.</div>`;
  }

  function resetAll() {
    setError("");
    setStatus("");

    pdfFile = null;
    pdfData = null;
    pageCount = 0;

    fileInfo.textContent = "";
    pageInfo.textContent = "";
    rangesInput.value = "";
    scope.value = "all";
    rangesBox.style.display = "none";

    exportBtn.disabled = true;
    clearBtn.disabled = true;

    resetDownloads();
  }

  // Parse "1-3,5,8-10" into sorted unique 0-based indices
  function parseRanges(input, maxPages) {
    const raw = String(input || "").trim();
    if (!raw) return { error: "Enter page ranges, e.g. 1-3,5,8-10." };

    const parts = raw.split(",").map(s => s.trim()).filter(Boolean);
    if (parts.length === 0) return { error: "Enter page ranges, e.g. 1-3,5,8-10." };

    const indices = new Set();

    for (const part of parts) {
      if (/^\d+$/.test(part)) {
        const p = Number(part);
        if (!Number.isFinite(p) || p < 1 || p > maxPages) {
          return { error: `Page ${part} is out of range (1-${maxPages}).` };
        }
        indices.add(p - 1);
        continue;
      }

      const m = part.match(/^(\d+)\s*-\s*(\d+)$/);
      if (m) {
        let a = Number(m[1]);
        let b = Number(m[2]);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return { error: `Invalid range: ${part}` };
        if (a < 1 || b < 1 || a > maxPages || b > maxPages) {
          return { error: `Range ${part} is out of range (1-${maxPages}).` };
        }
        if (b < a) [a, b] = [b, a];
        for (let p = a; p <= b; p++) indices.add(p - 1);
        continue;
      }

      return { error: `Invalid token: "${part}". Use formats like 2 or 2-5, separated by commas.` };
    }

    const out = Array.from(indices).sort((x, y) => x - y);
    if (out.length === 0) return { error: "No pages selected." };
    return { pages: out };
  }

  function ensurePdfJsReady() {
    // pdf.js exposes window.pdfjsLib
    if (!window.pdfjsLib || !window.pdfjsLib.getDocument) return false;

    // Worker is required for performance
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.6.347/pdf.worker.min.js";

    return true;
  }

  async function loadPdf(file) {
    setError("");
    setStatus("");
    resetDownloads();

    if (!file) return;

    const isPdf = file.type === "application/pdf" || String(file.name || "").toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setError("Please select a PDF file.");
      return;
    }

    if (!ensurePdfJsReady()) {
      setError("PDF renderer failed to load. Refresh the page and try again.");
      return;
    }

    pdfFile = file;
    fileInfo.textContent = `${file.name} • ${humanBytes(file.size)}`;
    setStatus("Reading PDF…");

    try {
      const buf = await file.arrayBuffer();
      pdfData = new Uint8Array(buf);

      const loadingTask = window.pdfjsLib.getDocument({ data: pdfData });
      const pdf = await loadingTask.promise;

      pageCount = pdf.numPages;
      pageInfo.textContent = `Pages: ${pageCount}`;

      exportBtn.disabled = false;
      clearBtn.disabled = false;
      setStatus("Ready.");
    } catch (e) {
      console.error(e);
      setError("Failed to read PDF. It may be password-protected or corrupted.");
      setStatus("");
      resetAll();
    }
  }

  function buildTargets() {
  if (scope.value === "all") {
    return { pages: Array.from({ length: pageCount }, (_, i) => i) };
  }
  const parsed = parseRanges(rangesInput.value, pageCount);
  if (parsed.error) return parsed;
  return { pages: parsed.pages };
}


  function baseNameNoExt(name) {
    return String(name || "document").replace(/\.pdf$/i, "");
  }

  async function renderPageToPng(pdf, pageNumber1Based, scaleFactor) {
    const page = await pdf.getPage(pageNumber1Based);
    const viewport = page.getViewport({ scale: scaleFactor });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { alpha: false });

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    const renderTask = page.render({
      canvasContext: ctx,
      viewport,
    });

    await renderTask.promise;

    const blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/png");
    });

    if (!blob) throw new Error("Failed to export PNG for a page.");
    return blob;
  }

  function addDownloadRow(label, blob, filename) {
    const url = URL.createObjectURL(blob);
    activeUrls.push(url);

    const row = document.createElement("div");
    row.className = "item";

    const left = document.createElement("div");
    left.className = "item-left";

    const name = document.createElement("div");
    name.className = "item-name";
    name.textContent = label;

    const meta = document.createElement("div");
    meta.className = "item-meta";
    meta.textContent = `${humanBytes(blob.size)} • image/png`;

    left.appendChild(name);
    left.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "item-actions";

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.textContent = "Download";
    // Make it look like a button using existing button styles
    a.style.display = "inline-block";
    a.style.padding = "8px 12px";
    a.style.border = "1px solid #ddd";
    a.style.borderRadius = "10px";
    a.style.textDecoration = "none";

    actions.appendChild(a);

    row.appendChild(left);
    row.appendChild(actions);

    downloadsEl.appendChild(row);
  }

  async function exportPngs() {
    setError("");
    setStatus("");

    if (!pdfData || !pageCount) {
      setError("Please select a PDF first.");
      return;
    }

    if (!ensurePdfJsReady()) {
      setError("PDF renderer failed to load. Refresh the page and try again.");
      return;
    }

    const targetRes = buildTargets();
    if (targetRes.error) {
      setError(targetRes.error);
      return;
    }
    const targets = targetRes.pages;

    const scaleFactor = Number(scale.value) || 2;

    resetDownloads();
    downloadsEl.innerHTML = ""; // start fresh list

    setStatus(`Rendering ${targets.length} page(s)…`);

    try {
      const loadingTask = window.pdfjsLib.getDocument({ data: pdfData });
      const pdf = await loadingTask.promise;

      const base = baseNameNoExt(pdfFile?.name);

      for (let i = 0; i < targets.length; i++) {
        const idx0 = targets[i];
        const pageNum = idx0 + 1;

        setStatus(`Rendering ${i + 1}/${targets.length} (page ${pageNum})…`);

        const blob = await renderPageToPng(pdf, pageNum, scaleFactor);
        const filename = `${base}-page-${String(pageNum).padStart(3, "0")}.png`;

        addDownloadRow(`Page ${pageNum}`, blob, filename);
      }

      setStatus("Done. Download links ready.");
    } catch (e) {
      console.error(e);
      setError("Failed to render one or more pages. The PDF may be encrypted or malformed.");
      setStatus("");
    }
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

  // UI wiring
  scope.addEventListener("change", () => {
    rangesBox.style.display = (scope.value === "ranges") ? "" : "none";
    resetDownloads();
  });

  rangesInput.addEventListener("input", () => resetDownloads());

  scaleVal.textContent = String(scale.value);
  scale.addEventListener("input", () => {
    scaleVal.textContent = String(scale.value);
    resetDownloads();
  });

  exportBtn.addEventListener("click", exportPngs);
  clearBtn.addEventListener("click", resetAll);

  wireDropzone();
  resetAll();
})();
