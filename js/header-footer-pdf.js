(() => {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const fileInfo = document.getElementById("fileInfo");
  const textEl = document.getElementById("text");
  const positionEl = document.getElementById("position");
  const alignEl = document.getElementById("align");
  const fontSizeEl = document.getElementById("fontSize");
  const marginEl = document.getElementById("margin");
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

  function tokenized(template, page, total) {
    const date = new Date().toISOString().slice(0, 10);
    return String(template || "")
      .replaceAll("{page}", String(page))
      .replaceAll("{total}", String(total))
      .replaceAll("{date}", date);
  }

  async function applyHeaderFooter() {
    setError("");
    setStatus("Applying...");
    clearOutput();

    if (!bytes) {
      setError("Choose a PDF first.");
      setStatus("");
      return;
    }

    const textTemplate = String(textEl.value || "").trim();
    if (!textTemplate) {
      setError("Enter header/footer text.");
      setStatus("");
      return;
    }

    const fontSize = Math.max(6, Math.min(72, Number(fontSizeEl.value) || 11));
    const margin = Math.max(0, Math.min(500, Number(marginEl.value) || 36));

    try {
      const doc = await PDFLib.PDFDocument.load(bytes);
      const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
      const pages = doc.getPages();
      const total = pages.length;

      for (let i = 0; i < total; i++) {
        const p = pages[i];
        const pageNum = i + 1;
        const text = tokenized(textTemplate, pageNum, total);
        const width = p.getWidth();
        const height = p.getHeight();
        const textW = font.widthOfTextAtSize(text, fontSize);

        let x = margin;
        if (alignEl.value === "center") x = (width - textW) / 2;
        if (alignEl.value === "right") x = width - margin - textW;

        const y = positionEl.value === "top"
          ? height - margin - fontSize
          : margin;

        p.drawText(text, {
          x: Math.max(0, x),
          y: Math.max(0, y),
          size: fontSize,
          font,
          color: PDFLib.rgb(0, 0, 0),
        });
      }

      const out = await doc.save();
      outBlob = new Blob([out], { type: "application/pdf" });
      downloadBtn.disabled = false;
      setStatus("Done.");
    } catch (e) {
      console.error(e);
      setError(window.FileTools?.describePdfError(e, "add header/footer") || "Failed to apply header/footer.");
      setStatus("");
    }
  }

  function downloadOutput() {
    if (!outBlob) {
      setError("Nothing to download yet.");
      return;
    }
    const base = window.FileTools?.toSafeBaseName(file?.name || "document") || "document";
    const name = window.FileTools?.makeDownloadName(base, "header-footer", "pdf") || `${base}-header-footer.pdf`;
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

  [textEl, positionEl, alignEl, fontSizeEl, marginEl].forEach((el) => {
    el.addEventListener("input", clearOutput);
    el.addEventListener("change", clearOutput);
  });

  processBtn.addEventListener("click", applyHeaderFooter);
  downloadBtn.addEventListener("click", downloadOutput);
  clearBtn.addEventListener("click", clearAll);
  wireDropzone();
})();
