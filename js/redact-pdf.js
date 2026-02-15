(() => {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const fileInfo = document.getElementById("fileInfo");
  const rectsEl = document.getElementById("rects");
  const processBtn = document.getElementById("processBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const clearBtn = document.getElementById("clearBtn");
  const statusEl = document.getElementById("status");
  const errorEl = document.getElementById("error");

  let file = null;
  let bytes = null;
  let outBlob = null;

  function setError(msg) { errorEl.style.display = msg ? "block" : "none"; errorEl.textContent = msg || ""; }
  function setStatus(msg) { statusEl.textContent = msg || ""; }

  function clearOutput() {
    outBlob = null;
    downloadBtn.disabled = true;
  }

  async function loadPdf(picked) {
    setError("");
    setStatus("");
    clearOutput();

    const isPdf = picked && ((picked.type === "application/pdf") || /\.pdf$/i.test(picked.name || ""));
    if (!isPdf) {
      setError("Please choose a PDF file.");
      return;
    }

    file = picked;
    bytes = await picked.arrayBuffer();
    fileInfo.textContent = `${picked.name} - ${Math.round((picked.size || 0) / 1024)} KB`;
    processBtn.disabled = false;
    clearBtn.disabled = false;
    setStatus("Ready.");
  }

  function parseRects(input) {
    const lines = String(input || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const rects = [];
    for (const line of lines) {
      const parts = line.split(",").map((v) => Number(v.trim()));
      if (parts.length !== 5 || parts.some((v) => !Number.isFinite(v))) {
        throw new Error(`Invalid line: ${line}`);
      }
      const [page, x, y, w, h] = parts;
      if (page < 1 || w <= 0 || h <= 0) {
        throw new Error(`Invalid values: ${line}`);
      }
      rects.push({ page: Math.floor(page), x, y, w, h });
    }
    return rects;
  }

  async function redactOverlay() {
    setError("");
    setStatus("Applying overlays...");
    clearOutput();

    if (!bytes) {
      setError("Choose a PDF first.");
      setStatus("");
      return;
    }

    let rects;
    try {
      rects = parseRects(rectsEl.value);
    } catch (e) {
      setError(e.message || "Invalid rectangle input.");
      setStatus("");
      return;
    }

    try {
      const doc = await PDFLib.PDFDocument.load(bytes);
      const pages = doc.getPages();

      for (const r of rects) {
        const idx = r.page - 1;
        if (idx < 0 || idx >= pages.length) continue;
        pages[idx].drawRectangle({
          x: r.x,
          y: r.y,
          width: r.w,
          height: r.h,
          color: PDFLib.rgb(0, 0, 0),
          borderWidth: 0,
        });
      }

      const out = await doc.save();
      outBlob = new Blob([out], { type: "application/pdf" });
      downloadBtn.disabled = false;
      setStatus("Done.");
    } catch (e) {
      console.error(e);
      setError(window.FileTools?.describePdfError(e, "overlay redaction") || "Failed to apply redaction overlay.");
      setStatus("");
    }
  }

  function downloadOutput() {
    if (!outBlob) {
      setError("Nothing to download yet.");
      return;
    }
    const base = window.FileTools?.toSafeBaseName(file?.name || "document") || "document";
    const name = window.FileTools?.makeDownloadName(base, "redacted-overlay", "pdf") || `${base}-redacted-overlay.pdf`;
    window.FileTools?.triggerBlobDownload(outBlob, name);
  }

  function clearAll() {
    setError("");
    setStatus("");
    file = null;
    bytes = null;
    fileInfo.textContent = "";
    processBtn.disabled = true;
    clearBtn.disabled = true;
    clearOutput();
  }

  function wireDropzone() {
    dropzone.addEventListener("click", () => fileInput.click());
    dropzone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
    });
    fileInput.addEventListener("change", () => {
      const picked = fileInput.files?.[0];
      if (picked) loadPdf(picked);
      fileInput.value = "";
    });
    ["dragenter", "dragover"].forEach((evt) => {
      dropzone.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); dropzone.style.borderColor = "#bbb"; });
    });
    ["dragleave", "drop"].forEach((evt) => {
      dropzone.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); dropzone.style.borderColor = "#ddd"; });
    });
    dropzone.addEventListener("drop", (e) => {
      const picked = e.dataTransfer?.files?.[0];
      if (picked) loadPdf(picked);
    });
  }

  rectsEl.addEventListener("input", clearOutput);
  processBtn.addEventListener("click", redactOverlay);
  downloadBtn.addEventListener("click", downloadOutput);
  clearBtn.addEventListener("click", clearAll);
  wireDropzone();
})();
