(() => {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const fileInfo = document.getElementById("fileInfo");
  const pageInfo = document.getElementById("pageInfo");

  const scope = document.getElementById("scope");
  const rangesBox = document.getElementById("rangesBox");
  const rangesInput = document.getElementById("ranges");
  const visualPickerWrap = document.getElementById("visualPickerWrap");
  const visualPicker = document.getElementById("visualPicker");
  const selectAllPagesBtn = document.getElementById("selectAllPagesBtn");
  const clearPageSelectionBtn = document.getElementById("clearPageSelectionBtn");
  const scale = document.getElementById("scale");
  const scaleVal = document.getElementById("scaleVal");

  const exportBtn = document.getElementById("exportBtn");
  const zipBtn = document.getElementById("zipBtn");
  const cancelBtn = document.getElementById("cancelBtn");
  const clearBtn = document.getElementById("clearBtn");

  const statusEl = document.getElementById("status");
  const progressBar = document.getElementById("progressBar");
  const errorEl = document.getElementById("error");
  const downloadsEl = document.getElementById("downloads");

  const preview = window.FileTools?.createPdfPreview({ anchorEl: pageInfo, maxThumbs: 6 });
  const settingsStore = window.FileTools?.bindToolSettings("pdf-to-png", ["scope", "ranges", "scale"]);

  let pdfFile = null;
  let pdfData = null;
  let pageCount = 0;

  let activeUrls = [];
  let zipBlob = null;
  let zipUrl = null;
  let zipFilename = "";
  let currentJob = null;
  let visualPickerJob = 0;
  let selectedPages = new Set();

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
    if (zipUrl) URL.revokeObjectURL(zipUrl);
    zipUrl = null;
  }

  function resetDownloads() {
    revokeAllUrls();
    zipBlob = null;
    zipFilename = "";
    zipBtn.disabled = true;
    downloadsEl.innerHTML = `<div class="hint">No exports yet.</div>`;
  }

  function setProgress(current, total) {
    if (!total || total <= 0) {
      progressBar.hidden = true;
      progressBar.value = 0;
      return;
    }
    progressBar.hidden = false;
    progressBar.value = Math.max(0, Math.min(100, Math.round((current / total) * 100)));
  }

  function setWorking(isWorking) {
    exportBtn.disabled = isWorking || !pdfData || !pageCount;
    cancelBtn.disabled = !isWorking;
    clearBtn.disabled = isWorking && !pdfData;
    zipBtn.disabled = isWorking || !zipBlob;
  }

  function resetAll(resetSettings) {
    setError("");
    setStatus("");
    setProgress(0, 0);

    pdfFile = null;
    pdfData = null;
    pageCount = 0;

    fileInfo.textContent = "";
    pageInfo.textContent = "";

    if (resetSettings && settingsStore) settingsStore.reset();

    scope.value = scope.value || "all";
    scale.value = scale.value || "2";
    scaleVal.textContent = String(scale.value);
    rangesBox.style.display = (scope.value === "ranges") ? "" : "none";
    selectedPages = new Set();
    visualPickerJob++;
    if (visualPicker) visualPicker.innerHTML = `<div class="hint">No pages loaded yet.</div>`;
    if (visualPickerWrap) {
      visualPickerWrap.style.display = (scope.value === "ranges" && pageCount) ? "" : "none";
    }
    if (selectAllPagesBtn) selectAllPagesBtn.disabled = !pageCount;
    if (clearPageSelectionBtn) clearPageSelectionBtn.disabled = !pageCount;

    exportBtn.disabled = true;
    zipBtn.disabled = true;
    cancelBtn.disabled = true;
    clearBtn.disabled = true;

    resetDownloads();
    if (preview) preview.clear();
  }

  function parseRanges(input, maxPages) {
    const raw = String(input || "").trim();
    if (!raw) return { error: "Enter page ranges, for example 1-3,5,8-10." };

    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return { error: "Enter page ranges, for example 1-3,5,8-10." };

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

      return { error: `Invalid token: "${part}". Use values like 2 or 2-5, separated by commas.` };
    }

    const out = Array.from(indices).sort((x, y) => x - y);
    if (out.length === 0) return { error: "No pages selected." };
    return { pages: out };
  }

  function pagesToRanges(pageIndices) {
    const sorted = Array.from(new Set(pageIndices)).sort((a, b) => a - b);
    if (!sorted.length) return "";

    const parts = [];
    let start = sorted[0];
    let prev = sorted[0];

    for (let i = 1; i <= sorted.length; i++) {
      const cur = sorted[i];
      if (cur === prev + 1) {
        prev = cur;
        continue;
      }
      parts.push(start === prev ? String(start + 1) : `${start + 1}-${prev + 1}`);
      start = cur;
      prev = cur;
    }
    return parts.join(",");
  }

  function syncPickerSelectionUi() {
    if (!visualPicker) return;
    const cells = visualPicker.querySelectorAll("[data-page-index]");
    cells.forEach((cell) => {
      const idx = Number(cell.getAttribute("data-page-index"));
      const selected = selectedPages.has(idx);
      cell.classList.toggle("is-selected", selected);
      cell.setAttribute("aria-pressed", selected ? "true" : "false");
    });
  }

  function applyVisualSelectionFromRanges() {
    if (!pageCount || !rangesInput.value.trim()) {
      selectedPages = new Set();
      syncPickerSelectionUi();
      return;
    }
    const parsed = parseRanges(rangesInput.value, pageCount);
    if (parsed.error) return;
    selectedPages = new Set(parsed.pages);
    syncPickerSelectionUi();
  }

  function applyRangesFromVisualSelection() {
    const nextRanges = pagesToRanges(Array.from(selectedPages));
    rangesInput.value = nextRanges;
    if (scope.value !== "ranges") scope.value = "ranges";
    rangesBox.style.display = "";
    if (visualPickerWrap) visualPickerWrap.style.display = pageCount ? "" : "none";
  }

  async function ensurePdfJsReady() {
    if (window.FileTools?.ensurePdfJs) return window.FileTools.ensurePdfJs();
    if (window.pdfjsLib && window.pdfjsLib.getDocument) return window.pdfjsLib;
    throw new Error("pdf.js not available");
  }

  async function renderVisualPicker() {
    if (!visualPicker || !pdfData || !pageCount) return;
    const jobId = ++visualPickerJob;
    const maxVisualPages = 24;

    visualPicker.innerHTML = `<div class="hint">Rendering page picker...</div>`;

    try {
      await ensurePdfJsReady();
      const loadingTask = window.pdfjsLib.getDocument({ data: pdfData });
      const pdf = await loadingTask.promise;
      if (jobId !== visualPickerJob) return;

      visualPicker.innerHTML = "";
      const limit = Math.min(pageCount, maxVisualPages);
      const frag = document.createDocumentFragment();

      for (let pageNum = 1; pageNum <= limit; pageNum++) {
        const page = await pdf.getPage(pageNum);
        if (jobId !== visualPickerJob) return;
        const viewport = page.getViewport({ scale: 0.22 });

        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.className = "pdf-thumb-canvas";

        await page.render({
          canvasContext: canvas.getContext("2d"),
          viewport,
        }).promise;

        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "visual-page-item";
        cell.setAttribute("data-page-index", String(pageNum - 1));
        cell.setAttribute("aria-pressed", "false");
        cell.appendChild(canvas);

        const label = document.createElement("span");
        label.className = "visual-page-label";
        label.textContent = `Page ${pageNum}`;
        cell.appendChild(label);

        cell.addEventListener("click", () => {
          const idx = pageNum - 1;
          if (selectedPages.has(idx)) selectedPages.delete(idx);
          else selectedPages.add(idx);
          syncPickerSelectionUi();
          applyRangesFromVisualSelection();
          resetDownloads();
        });

        frag.appendChild(cell);
      }

      visualPicker.appendChild(frag);
      syncPickerSelectionUi();

      if (pageCount > limit) {
        const note = document.createElement("div");
        note.className = "hint";
        note.textContent = `Showing first ${limit} pages. Use page ranges to include pages ${limit + 1}-${pageCount}.`;
        note.style.gridColumn = "1 / -1";
        visualPicker.appendChild(note);
      }
    } catch {
      if (jobId !== visualPickerJob) return;
      visualPicker.innerHTML = `<div class="hint">Visual picker unavailable for this PDF.</div>`;
    }
  }

  async function loadPdf(file) {
    setError("");
    setStatus("");
    resetDownloads();

    if (!file) return;

    const isPdf = file.type === "application/pdf" || String(file.name || "").toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setError(window.FileTools?.describeFileTypeError(file, "PDF file") || "Please select a PDF file.");
      return;
    }

    try {
      await ensurePdfJsReady();
    } catch {
      setError("PDF renderer failed to load. Refresh and try again.");
      return;
    }

    pdfFile = file;
    fileInfo.textContent = `${file.name} - ${humanBytes(file.size)}`;
    setStatus("Reading PDF...");

    try {
      const buf = await file.arrayBuffer();
      pdfData = new Uint8Array(buf);

      const loadingTask = window.pdfjsLib.getDocument({ data: pdfData });
      const pdf = await loadingTask.promise;
      pageCount = pdf.numPages;

      pageInfo.textContent = `Pages: ${pageCount}`;
      if (preview) preview.renderFromBytes(pdfData, pageCount);
      if (visualPickerWrap) {
        visualPickerWrap.style.display = (scope.value === "ranges") ? "" : "none";
      }
      if (selectAllPagesBtn) selectAllPagesBtn.disabled = false;
      if (clearPageSelectionBtn) clearPageSelectionBtn.disabled = false;
      await renderVisualPicker();
      applyVisualSelectionFromRanges();

      exportBtn.disabled = false;
      clearBtn.disabled = false;
      setStatus("Ready.");
    } catch (e) {
      console.error(e);
      setError(window.FileTools?.describePdfError(e, "read this PDF") || "Failed to read PDF.");
      setStatus("");
      resetAll(false);
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

  async function renderPageToPng(pdf, pageNumber1Based, scaleFactor, job) {
    if (job?.cancelled) throw new Error("Export cancelled");

    const page = await pdf.getPage(pageNumber1Based);
    const viewport = page.getViewport({ scale: scaleFactor });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { alpha: false });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    const renderTask = page.render({ canvasContext: ctx, viewport });
    if (job) job.renderTask = renderTask;
    await renderTask.promise;

    if (job?.cancelled) throw new Error("Export cancelled");

    const blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
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
    meta.textContent = `${humanBytes(blob.size)} - image/png`;

    left.appendChild(name);
    left.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "item-actions";

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.textContent = "Download";
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

  function cancelExport() {
    if (!currentJob) return;
    currentJob.cancelled = true;
    try {
      if (currentJob.renderTask && typeof currentJob.renderTask.cancel === "function") {
        currentJob.renderTask.cancel();
      }
    } catch {
      // Ignore cancellation failures.
    }
    try {
      if (currentJob.loadingTask && typeof currentJob.loadingTask.destroy === "function") {
        currentJob.loadingTask.destroy();
      }
    } catch {
      // Ignore cancellation failures.
    }
    setStatus("Cancelling...");
  }

  async function exportPngs() {
    setError("");
    setStatus("");
    setProgress(0, 0);

    if (!pdfData || !pageCount) {
      setError("Please select a PDF first.");
      return;
    }

    try {
      await ensurePdfJsReady();
    } catch {
      setError("PDF renderer failed to load. Refresh and try again.");
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
    downloadsEl.innerHTML = "";
    currentJob = { cancelled: false, loadingTask: null, renderTask: null };
    setWorking(true);
    setProgress(0, targets.length);
    setStatus(`Rendering ${targets.length} page(s)...`);

    try {
      const loadingTask = window.pdfjsLib.getDocument({ data: pdfData });
      currentJob.loadingTask = loadingTask;
      const pdf = await loadingTask.promise;

      const base = baseNameNoExt(pdfFile?.name);
      const zipEntries = [];

      for (let i = 0; i < targets.length; i++) {
        if (currentJob.cancelled) throw new Error("Export cancelled");

        const pageNum = targets[i] + 1;
        setStatus(`Rendering ${i + 1}/${targets.length} (page ${pageNum})...`);
        setProgress(i, targets.length);

        const blob = await renderPageToPng(pdf, pageNum, scaleFactor, currentJob);
        const pageSuffix = `page-${String(pageNum).padStart(3, "0")}`;
        const filename = window.FileTools?.makeDownloadName(base, pageSuffix, "png")
          || `${base}-${pageSuffix}.png`;

        addDownloadRow(`Page ${pageNum}`, blob, filename);
        zipEntries.push({ filename, blob });
      }

      setProgress(targets.length, targets.length);

      if (window.JSZip) {
        setStatus("Preparing ZIP...");
        const zip = new window.JSZip();
        zipEntries.forEach((entry) => zip.file(entry.filename, entry.blob));
        zipBlob = await zip.generateAsync(
          { type: "blob" },
          (meta) => setStatus(`Preparing ZIP... ${Math.round(meta.percent)}%`),
        );

        zipFilename = window.FileTools?.makeDownloadName(base, "png-pages", "zip")
          || `${base}-png-pages.zip`;
        zipUrl = URL.createObjectURL(zipBlob);
        activeUrls.push(zipUrl);
        zipBtn.disabled = false;
      }

      setStatus(zipBlob ? "Done. PNG links and ZIP are ready." : "Done. PNG links are ready.");
    } catch (e) {
      console.error(e);
      if (String(e?.message || "").toLowerCase().includes("cancel")) {
        setStatus("Export cancelled.");
      } else {
        setError(window.FileTools?.describePdfError(e, "render this PDF") || "Failed to render PDF pages.");
        setStatus("");
      }
    } finally {
      currentJob = null;
      setWorking(false);
      if (progressBar.value === 0) setProgress(0, 0);
    }
  }

  function downloadZip() {
    setError("");
    if (!zipBlob || !zipUrl) {
      setError("No ZIP is ready yet. Export PNGs first.");
      return;
    }
    const a = document.createElement("a");
    a.href = zipUrl;
    a.download = zipFilename || "pdf-png-pages.zip";
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

  scope.addEventListener("change", () => {
    rangesBox.style.display = (scope.value === "ranges") ? "" : "none";
    if (visualPickerWrap) {
      visualPickerWrap.style.display = (scope.value === "ranges" && pageCount) ? "" : "none";
    }
    resetDownloads();
  });
  rangesInput.addEventListener("input", () => {
    applyVisualSelectionFromRanges();
    resetDownloads();
  });
  scaleVal.textContent = String(scale.value);
  scale.addEventListener("input", () => {
    scaleVal.textContent = String(scale.value);
    resetDownloads();
  });

  exportBtn.addEventListener("click", exportPngs);
  zipBtn.addEventListener("click", downloadZip);
  cancelBtn.addEventListener("click", cancelExport);
  if (selectAllPagesBtn) {
    selectAllPagesBtn.addEventListener("click", () => {
      if (!pageCount) return;
      selectedPages = new Set(Array.from({ length: pageCount }, (_, i) => i));
      syncPickerSelectionUi();
      applyRangesFromVisualSelection();
      resetDownloads();
    });
  }
  if (clearPageSelectionBtn) {
    clearPageSelectionBtn.addEventListener("click", () => {
      selectedPages = new Set();
      syncPickerSelectionUi();
      rangesInput.value = "";
      resetDownloads();
    });
  }
  clearBtn.addEventListener("click", () => {
    cancelExport();
    resetAll(true);
  });

  wireDropzone();
  resetAll(false);
})();
