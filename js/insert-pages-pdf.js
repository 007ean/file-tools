(() => {
  const mainDropzone = document.getElementById("mainDropzone");
  const insertDropzone = document.getElementById("insertDropzone");
  const mainInput = document.getElementById("mainInput");
  const insertInput = document.getElementById("insertInput");

  const mainInfo = document.getElementById("mainInfo");
  const insertInfo = document.getElementById("insertInfo");
  const mainPages = document.getElementById("mainPages");
  const insertPagesInfo = document.getElementById("insertPages");
  const positionInput = document.getElementById("position");

  const insertBtn = document.getElementById("insertBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const clearBtn = document.getElementById("clearBtn");
  const statusEl = document.getElementById("status");
  const errorEl = document.getElementById("error");

  const settingsStore = window.FileTools?.bindToolSettings("insert-pages-pdf", ["position"]);

  let mainFile = null;
  let insertFile = null;
  let mainBytes = null;
  let insertBytes = null;
  let mainCount = 0;
  let insertCount = 0;

  let outputBlob = null;
  let outputUrl = null;

  const PDF_MIME_TYPES = new Set([
    "application/pdf",
    "application/x-pdf",
    "application/acrobat",
    "applications/vnd.pdf",
    "text/pdf",
    "text/x-pdf"
  ]);

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

  function updateButtons() {
    insertBtn.disabled = !(mainBytes && insertBytes && mainCount > 0 && insertCount > 0);
  }

  function hasPdfSignature(bytes) {
    if (!bytes || bytes.length < 5) return false;
    return bytes[0] === 0x25
      && bytes[1] === 0x50
      && bytes[2] === 0x44
      && bytes[3] === 0x46
      && bytes[4] === 0x2D;
  }

  function isPdfLikeFile(file, bytes) {
    const name = String(file?.name || "").toLowerCase();
    const type = String(file?.type || "").toLowerCase();
    if (PDF_MIME_TYPES.has(type)) return true;
    if (name.endsWith(".pdf")) return true;
    return hasPdfSignature(bytes);
  }

  function getFirstDroppedFile(event) {
    const dt = event?.dataTransfer;
    if (!dt) return null;

    if (dt.files && dt.files.length) return dt.files[0];

    if (dt.items && dt.items.length) {
      for (const item of dt.items) {
        if (item.kind !== "file") continue;
        const file = item.getAsFile();
        if (file) return file;
      }
    }

    return null;
  }

  function resetAll(resetSettings) {
    setError("");
    setStatus("");
    resetOutput();

    mainFile = null;
    insertFile = null;
    mainBytes = null;
    insertBytes = null;
    mainCount = 0;
    insertCount = 0;

    mainInfo.textContent = "";
    insertInfo.textContent = "";
    mainPages.textContent = "";
    insertPagesInfo.textContent = "";

    if (resetSettings && settingsStore) settingsStore.reset();
    positionInput.value = positionInput.value || "1";
    positionInput.min = "1";
    positionInput.max = "1";

    updateButtons();
  }

  async function loadPdf(file, kind) {
    setError("");
    setStatus("");
    resetOutput();
    if (!file) return;

    if (typeof PDFLib === "undefined" || !PDFLib.PDFDocument) {
      setError("PDF library failed to load. Refresh and try again.");
      return;
    }

    try {
      setStatus(`Reading ${kind} PDF...`);
      const bytes = await file.arrayBuffer();
      const rawBytes = new Uint8Array(bytes);
      if (!isPdfLikeFile(file, rawBytes)) {
        setError(window.FileTools?.describeFileTypeError(file, "PDF file") || "Please select a PDF file.");
        setStatus("");
        return;
      }
      const doc = await PDFLib.PDFDocument.load(bytes);
      const pages = doc.getPageCount();

      if (kind === "main") {
        mainFile = file;
        mainBytes = bytes;
        mainCount = pages;
        mainInfo.textContent = `${file.name} - ${humanBytes(file.size)}`;
        mainPages.textContent = `Pages: ${pages}`;
        positionInput.max = String(pages + 1);
        if (Number(positionInput.value) > pages + 1) positionInput.value = String(pages + 1);
      } else {
        insertFile = file;
        insertBytes = bytes;
        insertCount = pages;
        insertInfo.textContent = `${file.name} - ${humanBytes(file.size)}`;
        insertPagesInfo.textContent = `Pages: ${pages}`;
      }
      setStatus("Ready.");
      updateButtons();
    } catch (e) {
      console.error(e);
      setError(window.FileTools?.describePdfError(e, "read this PDF") || "Failed to read PDF.");
      setStatus("");
    }
  }

  async function insertPages() {
    setError("");
    setStatus("");
    resetOutput();

    if (!(mainBytes && insertBytes && mainCount > 0 && insertCount > 0)) {
      setError("Select both PDFs first.");
      return;
    }

    const insertBefore = Number(positionInput.value);
    if (!Number.isFinite(insertBefore) || insertBefore < 1 || insertBefore > (mainCount + 1)) {
      setError(`Insert position must be between 1 and ${mainCount + 1}.`);
      return;
    }

    try {
      insertBtn.disabled = true;
      setStatus("Merging pages...");

      const mainDoc = await PDFLib.PDFDocument.load(mainBytes);
      const addDoc = await PDFLib.PDFDocument.load(insertBytes);
      const out = await PDFLib.PDFDocument.create();

      const beforeCount = insertBefore - 1;
      const mainBeforeIndices = Array.from({ length: beforeCount }, (_, i) => i);
      const addIndices = addDoc.getPageIndices();
      const mainAfterIndices = Array.from({ length: mainCount - beforeCount }, (_, i) => i + beforeCount);

      const beforePages = await out.copyPages(mainDoc, mainBeforeIndices);
      beforePages.forEach((p) => out.addPage(p));

      const insertedPages = await out.copyPages(addDoc, addIndices);
      insertedPages.forEach((p) => out.addPage(p));

      const afterPages = await out.copyPages(mainDoc, mainAfterIndices);
      afterPages.forEach((p) => out.addPage(p));

      setStatus("Saving...");
      const bytes = await out.save();
      outputBlob = new Blob([bytes], { type: "application/pdf" });
      outputUrl = URL.createObjectURL(outputBlob);
      downloadBtn.disabled = false;
      setStatus("Done.");
    } catch (e) {
      console.error(e);
      setError(window.FileTools?.describePdfError(e, "insert pages") || "Failed to insert pages.");
      setStatus("");
    } finally {
      updateButtons();
    }
  }

  function downloadOutput() {
    setError("");
    if (!outputBlob || !outputUrl) {
      setError("Nothing to download yet.");
      return;
    }
    const mainName = window.FileTools?.toSafeBaseName(mainFile?.name || "document") || "document";
    const insertName = window.FileTools?.toSafeBaseName(insertFile?.name || "insert") || "insert";
    const filename = `${mainName}-with-${insertName}.pdf`;
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

  function wireSingleDropzone(dropzone, input, onLoad) {
    dropzone.addEventListener("click", () => input.click());
    dropzone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        input.click();
      }
    });

    input.addEventListener("change", () => {
      const picked = input.files && input.files[0];
      if (picked) onLoad(picked);
      input.value = "";
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
      const dropped = getFirstDroppedFile(e);
      if (dropped) onLoad(dropped);
    });
  }

  positionInput.addEventListener("input", resetOutput);
  insertBtn.addEventListener("click", insertPages);
  downloadBtn.addEventListener("click", downloadOutput);
  clearBtn.addEventListener("click", () => resetAll(true));

  wireSingleDropzone(mainDropzone, mainInput, (f) => loadPdf(f, "main"));
  wireSingleDropzone(insertDropzone, insertInput, (f) => loadPdf(f, "insert"));
  resetAll(false);
})();
