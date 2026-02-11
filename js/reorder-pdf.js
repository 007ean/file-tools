(() => {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const fileInfo = document.getElementById("fileInfo");
  const pageInfo = document.getElementById("pageInfo");

  const orderInput = document.getElementById("order");

  const reorderBtn = document.getElementById("reorderBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const clearBtn = document.getElementById("clearBtn");

  const statusEl = document.getElementById("status");
  const errorEl = document.getElementById("error");

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

  function resetAll() {
    setError("");
    setStatus("");
    resetOutput();

    pdfFile = null;
    pdfBytes = null;
    pageCount = 0;

    fileInfo.textContent = "";
    pageInfo.textContent = "";
    orderInput.value = "";

    reorderBtn.disabled = true;
    clearBtn.disabled = true;
  }

  // Parse "1,3,2,4-6" into an ORDERED list of 0-based indices.
  // Duplicates are rejected to avoid accidental repetition.
  function parseOrder(input, maxPages) {
    const raw = String(input || "").trim();
    if (!raw) return { error: "Enter a page order, e.g. 1,3,2,4-6." };

    const parts = raw.split(",").map(s => s.trim()).filter(Boolean);
    if (parts.length === 0) return { error: "Enter a page order, e.g. 1,3,2,4-6." };

    const out = [];
    const seen = new Set();

    function addPage(p1Based) {
      if (!Number.isFinite(p1Based) || p1Based < 1 || p1Based > maxPages) {
        return `Page ${p1Based} is out of range (1-${maxPages}).`;
      }
      const idx = p1Based - 1;
      if (seen.has(idx)) return `Duplicate page detected: ${p1Based}. Remove duplicates.`;
      seen.add(idx);
      out.push(idx);
      return null;
    }

    for (const part of parts) {
      // single page
      if (/^\d+$/.test(part)) {
        const p = Number(part);
        const err = addPage(p);
        if (err) return { error: err };
        continue;
      }

      // range a-b
      const m = part.match(/^(\d+)\s*-\s*(\d+)$/);
      if (m) {
        let a = Number(m[1]);
        let b = Number(m[2]);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return { error: `Invalid range: ${part}` };
        if (b < a) [a, b] = [b, a];
        for (let p = a; p <= b; p++) {
          const err = addPage(p);
          if (err) return { error: err };
        }
        continue;
      }

      return { error: `Invalid token: "${part}". Use formats like 2 or 2-5, separated by commas.` };
    }

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
      setError("Please select a PDF file.");
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
      reorderBtn.disabled = false;
      clearBtn.disabled = false;
      setStatus("Ready.");
    } catch (e) {
      console.error(e);
      setError("Failed to read PDF. It may be password-protected or corrupted.");
      setStatus("");
      resetAll();
    }
  }

  async function reorderPdf() {
    setError("");
    setStatus("");
    resetOutput();

    if (!pdfBytes || !pageCount) {
      setError("Please select a PDF first.");
      return;
    }

    const parsed = parseOrder(orderInput.value, pageCount);
    if (parsed.error) {
      setError(parsed.error);
      return;
    }

    const pages = parsed.pages;

    setStatus(`Reordering… (${pages.length} page(s))`);

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
      setError("Failed to reorder pages. The PDF may be encrypted or malformed.");
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
    const filename = `${baseName}-reordered-${Date.now()}.pdf`;

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

  // UI wiring
  orderInput.addEventListener("input", () => resetOutput());
  reorderBtn.addEventListener("click", reorderPdf);
  downloadBtn.addEventListener("click", downloadOutput);
  clearBtn.addEventListener("click", resetAll);

  wireDropzone();
  resetAll();
})();
