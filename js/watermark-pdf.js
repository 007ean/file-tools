(() => {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const fileInfo = document.getElementById("fileInfo");
  const pageInfo = document.getElementById("pageInfo");

  const textEl = document.getElementById("text");
  const fontSizeEl = document.getElementById("fontSize");
  const opacityEl = document.getElementById("opacity");
  const angleEl = document.getElementById("angle");
  const positionEl = document.getElementById("position");
  const marginXEl = document.getElementById("marginX");
  const marginYEl = document.getElementById("marginY");

  const applyBtn = document.getElementById("applyBtn");
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

    applyBtn.disabled = true;
    clearBtn.disabled = true;
  }

  function clampInt(val, min, max, fallback) {
    const n = Math.floor(Number(val));
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  function clampNum(val, min, max, fallback) {
    const n = Number(val);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  function computeXY(pos, pageW, pageH, textW, fontSize, marginX, marginY) {
    const topY = pageH - marginY - fontSize;
    const bottomY = marginY;

    const leftX = marginX;
    const centerX = (pageW - textW) / 2;
    const rightX = pageW - marginX - textW;

    switch (pos) {
      case "top-left": return { x: leftX, y: topY };
      case "top-center": return { x: centerX, y: topY };
      case "top-right": return { x: rightX, y: topY };
      case "bottom-left": return { x: leftX, y: bottomY };
      case "bottom-center": return { x: centerX, y: bottomY };
      case "bottom-right": return { x: rightX, y: bottomY };
      case "center":
      default:
        return { x: centerX, y: (pageH - fontSize) / 2 };
    }
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
      applyBtn.disabled = false;
      clearBtn.disabled = false;
      setStatus("Ready.");
    } catch (e) {
      console.error(e);
      setError("Failed to read PDF. It may be password-protected or corrupted.");
      setStatus("");
      resetAll();
    }
  }

  async function applyWatermark() {
    setError("");
    setStatus("");
    resetOutput();

    if (!pdfBytes || !pageCount) {
      setError("Please select a PDF first.");
      return;
    }

    const watermarkText = String(textEl.value || "").trim();
    if (!watermarkText) {
      setError("Enter watermark text.");
      return;
    }

    const fontSize = clampInt(fontSizeEl.value, 6, 200, 48);
    const opacity = clampNum(opacityEl.value, 0, 1, 0.15);
    const angleDeg = clampNum(angleEl.value, -180, 180, -35);

    const marginX = clampNum(marginXEl.value, 0, 500, 36);
    const marginY = clampNum(marginYEl.value, 0, 500, 36);

    setStatus("Loading…");

    try {
      const doc = await PDFLib.PDFDocument.load(pdfBytes);
      const font = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold);
      const pages = doc.getPages();

      const rad = PDFLib.degrees(angleDeg);

      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        const w = p.getWidth();
        const h = p.getHeight();

        const textW = font.widthOfTextAtSize(watermarkText, fontSize);
        const { x, y } = computeXY(positionEl.value, w, h, textW, fontSize, marginX, marginY);

        p.drawText(watermarkText, {
          x: Math.max(0, x),
          y: Math.max(0, y),
          size: fontSize,
          font,
          color: PDFLib.rgb(0, 0, 0),
          opacity,
          rotate: rad,
        });

        if (i % 10 === 0) setStatus(`Stamping… ${i + 1}/${pages.length}`);
      }

      setStatus("Saving…");
      const outBytes = await doc.save();

      outputBlob = new Blob([outBytes], { type: "application/pdf" });
      outputUrl = URL.createObjectURL(outputBlob);

      downloadBtn.disabled = false;
      setStatus("Done.");
    } catch (e) {
      console.error(e);
      setError("Failed to watermark PDF. The PDF may be encrypted or malformed.");
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
    const filename = `${baseName}-watermarked-${Date.now()}.pdf`;

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

  // Reset output when settings change
  [textEl, fontSizeEl, opacityEl, angleEl, positionEl, marginXEl, marginYEl].forEach((el) => {
    el.addEventListener("input", () => resetOutput());
    el.addEventListener("change", () => resetOutput());
  });

  applyBtn.addEventListener("click", applyWatermark);
  downloadBtn.addEventListener("click", downloadOutput);
  clearBtn.addEventListener("click", resetAll);

  wireDropzone();
  resetAll();
})();
