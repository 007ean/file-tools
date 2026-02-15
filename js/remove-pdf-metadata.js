(() => {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const fileInfo = document.getElementById("fileInfo");
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

  async function stripMetadata() {
    setError("");
    setStatus("Removing metadata...");
    clearOutput();

    if (!bytes) {
      setError("Choose a PDF first.");
      setStatus("");
      return;
    }

    try {
      const doc = await PDFLib.PDFDocument.load(bytes, { updateMetadata: false });
      const epoch = new Date(0);
      doc.setTitle("");
      doc.setAuthor("");
      doc.setSubject("");
      doc.setKeywords([]);
      doc.setCreator("");
      doc.setProducer("");
      doc.setCreationDate(epoch);
      doc.setModificationDate(epoch);

      const out = await doc.save({ useObjectStreams: false });
      outBlob = new Blob([out], { type: "application/pdf" });
      downloadBtn.disabled = false;
      setStatus("Done.");
    } catch (e) {
      console.error(e);
      setError(window.FileTools?.describePdfError(e, "remove metadata") || "Failed to remove metadata.");
      setStatus("");
    }
  }

  function downloadOutput() {
    if (!outBlob) {
      setError("Nothing to download yet.");
      return;
    }
    const base = window.FileTools?.toSafeBaseName(file?.name || "document") || "document";
    const name = window.FileTools?.makeDownloadName(base, "metadata-removed", "pdf") || `${base}-metadata-removed.pdf`;
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

  processBtn.addEventListener("click", stripMetadata);
  downloadBtn.addEventListener("click", downloadOutput);
  clearBtn.addEventListener("click", clearAll);
  wireDropzone();
})();
