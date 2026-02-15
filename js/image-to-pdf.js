(() => {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const fileInfo = document.getElementById("fileInfo");
  const fitEl = document.getElementById("fit");
  const pageSizeEl = document.getElementById("pageSize");
  const orientationEl = document.getElementById("orientation");
  const createBtn = document.getElementById("createBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const clearBtn = document.getElementById("clearBtn");
  const statusEl = document.getElementById("status");
  const errorEl = document.getElementById("error");
  const listEl = document.getElementById("list");

  const settingsStore = window.FileTools?.bindToolSettings("image-to-pdf", ["fit", "pageSize", "orientation"]);

  let files = [];
  let dragIndex = -1;
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
  function setStatus(msg) { statusEl.textContent = msg || ""; }
  function humanBytes(bytes) {
    if (!Number.isFinite(bytes)) return "";
    const units = ["B", "KB", "MB", "GB"];
    let i = 0;
    let n = bytes;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
  }
  function resetOutput() {
    outputBlob = null;
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    outputUrl = null;
    downloadBtn.disabled = true;
  }
  function renderList() {
    listEl.innerHTML = "";
    if (!files.length) {
      listEl.innerHTML = `<div class="hint">No images added yet.</div>`;
      fileInfo.textContent = "";
      createBtn.disabled = true;
      clearBtn.disabled = true;
      return;
    }
    const totalBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);
    fileInfo.textContent = `${files.length} file(s) - ${humanBytes(totalBytes)}`;

    files.forEach((file, idx) => {
      const row = document.createElement("div");
      row.className = "item";
      row.draggable = true;
      row.setAttribute("data-index", String(idx));
      const left = document.createElement("div");
      left.className = "item-left";
      left.innerHTML = `<div class="item-name">${file.name}</div><div class="item-meta">${humanBytes(file.size)} - ${file.type || "image/*"}</div>`;
      const actions = document.createElement("div");
      actions.className = "item-actions";

      const remove = document.createElement("button");
      remove.textContent = "Remove";
      remove.addEventListener("click", () => {
        resetOutput();
        files.splice(idx, 1);
        renderList();
      });

      actions.appendChild(remove);
      row.appendChild(left);
      row.appendChild(actions);
      row.addEventListener("dragstart", () => {
        dragIndex = idx;
        row.style.opacity = "0.5";
      });
      row.addEventListener("dragend", () => {
        dragIndex = -1;
        row.style.opacity = "1";
      });
      row.addEventListener("dragover", (e) => {
        e.preventDefault();
      });
      row.addEventListener("drop", (e) => {
        e.preventDefault();
        const toIndex = Number(row.getAttribute("data-index"));
        if (!Number.isInteger(dragIndex) || dragIndex < 0 || dragIndex === toIndex) return;
        const moved = files.splice(dragIndex, 1)[0];
        files.splice(toIndex, 0, moved);
        resetOutput();
        renderList();
      });
      listEl.appendChild(row);
    });

    createBtn.disabled = false;
    clearBtn.disabled = false;
  }
  function addFiles(incoming) {
    setError("");
    setStatus("");
    resetOutput();
    const picked = Array.from(incoming || []).filter((f) => (f.type || "").startsWith("image/"));
    if (!picked.length) {
      setError(window.FileTools?.describeFileTypeError(incoming?.[0], "image file") || "Please add image files.");
      return;
    }
    files = files.concat(picked);
    renderList();
  }
  function pageDims(imageW, imageH, preset, orientation) {
    if (preset === "match") return [imageW, imageH];

    let dims = [595.28, 841.89];
    if (preset === "letter") dims = [612, 792];

    if (orientation === "auto") {
      if (imageW > imageH) return [dims[1], dims[0]];
      return dims;
    }
    if (orientation === "landscape") return [dims[1], dims[0]];
    return dims;
  }

  async function fileToJpegBytes(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      const loaded = new Promise((resolve, reject) => {
        img.onload = () => resolve(true);
        img.onerror = () => reject(new Error(`Could not decode image: ${file.name}`));
      });
      img.src = url;
      await loaded;
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("Canvas is not available in this browser.");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      const blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92));
      if (!blob) throw new Error(`Could not convert image: ${file.name}`);
      return new Uint8Array(await blob.arrayBuffer());
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  async function createPdf() {
    setError("");
    setStatus("");
    resetOutput();
    if (!files.length) {
      setError("Add one or more images first.");
      return;
    }
    if (typeof PDFLib === "undefined" || !PDFLib.PDFDocument) {
      setError("PDF library failed to load. Refresh and try again.");
      return;
    }

    setStatus("Building PDF...");
    try {
      const pdf = await PDFLib.PDFDocument.create();
      const fit = fitEl.value;
      const preset = pageSizeEl.value;
      const orientation = orientationEl.value;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const bytes = await file.arrayBuffer();
        const type = (file.type || "").toLowerCase();
        let embedded;
        if (type.includes("png")) {
          embedded = await pdf.embedPng(bytes);
        } else if (type.includes("jpeg") || type.includes("jpg")) {
          embedded = await pdf.embedJpg(bytes);
        } else {
          const jpgBytes = await fileToJpegBytes(file);
          embedded = await pdf.embedJpg(jpgBytes);
        }

        const iw = embedded.width;
        const ih = embedded.height;
        const dims = pageDims(iw, ih, preset, orientation);
        const page = pdf.addPage(dims);
        const pw = page.getWidth();
        const ph = page.getHeight();

        let drawW = pw;
        let drawH = ph;
        if (fit === "contain") {
          const scale = Math.min(pw / iw, ph / ih);
          drawW = iw * scale;
          drawH = ih * scale;
        } else {
          const scale = Math.max(pw / iw, ph / ih);
          drawW = iw * scale;
          drawH = ih * scale;
        }

        const x = (pw - drawW) / 2;
        const y = (ph - drawH) / 2;
        page.drawImage(embedded, { x, y, width: drawW, height: drawH });
        setStatus(`Adding ${i + 1}/${files.length}`);
      }

      const out = await pdf.save();
      outputBlob = new Blob([out], { type: "application/pdf" });
      outputUrl = URL.createObjectURL(outputBlob);
      downloadBtn.disabled = false;
      setStatus("Done.");
    } catch (e) {
      console.error(e);
      setError("Failed to create PDF from these images.");
      setStatus("");
    }
  }
  function downloadOutput() {
    if (!outputBlob) {
      setError("Nothing to download yet.");
      return;
    }
    const firstBase = window.FileTools?.toSafeBaseName(files[0]?.name || "images");
    const filename = window.FileTools?.makeDownloadName(firstBase, "images-to-pdf", "pdf") || `${firstBase}-images-to-pdf.pdf`;
    window.FileTools?.triggerBlobDownload(outputBlob, filename);
  }
  function clearAll() {
    setError("");
    setStatus("");
    resetOutput();
    if (settingsStore) settingsStore.reset();
    files = [];
    renderList();
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
      if (fileInput.files?.length) addFiles(fileInput.files);
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
      if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
    });
  }

  fitEl.addEventListener("change", resetOutput);
  pageSizeEl.addEventListener("change", resetOutput);
  orientationEl.addEventListener("change", resetOutput);
  createBtn.addEventListener("click", createPdf);
  downloadBtn.addEventListener("click", downloadOutput);
  clearBtn.addEventListener("click", clearAll);
  wireDropzone();
  renderList();
})();
