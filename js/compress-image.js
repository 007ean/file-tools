(() => {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const fileInfo = document.getElementById("fileInfo");
  const quality = document.getElementById("quality");
  const qualityVal = document.getElementById("qualityVal");
  const toJpeg = document.getElementById("toJpeg");
  const compressBtn = document.getElementById("compressBtn");
  const zipBtn = document.getElementById("zipBtn");
  const clearBtn = document.getElementById("clearBtn");
  const progressBar = document.getElementById("progressBar");
  const statusEl = document.getElementById("status");
  const errorEl = document.getElementById("error");
  const previewIn = document.getElementById("previewIn");
  const previewOut = document.getElementById("previewOut");
  const metaIn = document.getElementById("metaIn");
  const metaOut = document.getElementById("metaOut");
  const downloadsEl = document.getElementById("downloads");

  const settingsStore = window.FileTools?.bindToolSettings("compress-image", ["quality", "toJpeg"]);

  let sourceFiles = [];
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
  function setStatus(msg) { statusEl.textContent = msg || ""; }
  function humanBytes(bytes) {
    if (!Number.isFinite(bytes)) return "";
    const units = ["B", "KB", "MB", "GB"];
    let i = 0;
    let n = bytes;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
  }
  function setProgress(current, total) {
    if (!total) {
      progressBar.hidden = true;
      progressBar.value = 0;
      return;
    }
    progressBar.hidden = false;
    progressBar.value = Math.max(0, Math.min(100, Math.round((current / total) * 100)));
  }
  function clearUrls() {
    for (const url of activeUrls) URL.revokeObjectURL(url);
    activeUrls = [];
  }
  function resetOutput() {
    clearUrls();
    downloadsEl.innerHTML = `<div class="hint">No exports yet.</div>`;
    previewOut.style.display = "none";
    previewOut.removeAttribute("src");
    metaOut.textContent = "";
    zipBtn.disabled = true;
  }
  function resetAll(resetSettings) {
    setError("");
    setStatus("");
    setProgress(0, 0);
    if (resetSettings && settingsStore) settingsStore.reset();
    sourceFiles = [];
    fileInfo.textContent = "";
    previewIn.style.display = "none";
    previewIn.removeAttribute("src");
    metaIn.textContent = "";
    compressBtn.disabled = true;
    clearBtn.disabled = true;
    resetOutput();
  }
  async function loadImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      const loaded = new Promise((resolve, reject) => {
        img.onload = () => resolve(true);
        img.onerror = () => reject(new Error(`Could not read image: ${file.name}`));
      });
      img.src = url;
      await loaded;
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  async function loadFiles(files) {
    setError("");
    setStatus("");
    resetOutput();
    const list = Array.from(files || []).filter((f) => (f.type || "").startsWith("image/"));
    if (!list.length) {
      setError(window.FileTools?.describeFileTypeError(files?.[0], "image file") || "Please choose image files.");
      return;
    }
    sourceFiles = list;
    const totalBytes = list.reduce((sum, f) => sum + (f.size || 0), 0);
    fileInfo.textContent = `${list.length} file(s) - ${humanBytes(totalBytes)}`;

    const first = list[0];
    const firstUrl = URL.createObjectURL(first);
    previewIn.src = firstUrl;
    previewIn.style.display = "";
    previewIn.onload = () => URL.revokeObjectURL(firstUrl);

    const img = await loadImage(first);
    metaIn.textContent = `${img.naturalWidth} x ${img.naturalHeight} px - ${humanBytes(first.size)}`;
    compressBtn.disabled = false;
    clearBtn.disabled = false;
    setStatus("Ready.");
  }
  function addDownloadRow(label, blob, filename) {
    const url = URL.createObjectURL(blob);
    activeUrls.push(url);
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `<div class="item-left"><div class="item-name">${label}</div><div class="item-meta">${humanBytes(blob.size)} - ${blob.type}</div></div>`;
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
    row.appendChild(actions);
    downloadsEl.appendChild(row);
  }
  async function compressBatch() {
    setError("");
    setStatus("");
    resetOutput();
    if (!sourceFiles.length) {
      setError("Select one or more images first.");
      return;
    }
    if (!window.JSZip) {
      setError("ZIP library failed to load. Refresh and try again.");
      return;
    }
    const q = Math.max(0.1, Math.min(0.95, Number(quality.value) / 100 || 0.8));
    const zip = new window.JSZip();
    downloadsEl.innerHTML = "";
    setProgress(0, sourceFiles.length);

    try {
      for (let i = 0; i < sourceFiles.length; i++) {
        const file = sourceFiles[i];
        const img = await loadImage(file);
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d", { alpha: true });
        if (!ctx) throw new Error("Canvas is not available in this browser.");
        ctx.drawImage(img, 0, 0);

        const inType = (file.type || "").toLowerCase();
        let outType = "image/png";
        let outQ;
        if (toJpeg.checked || inType.includes("jpeg") || inType.includes("jpg")) {
          outType = "image/jpeg";
          outQ = q;
        }

        const blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), outType, outQ));
        if (!blob) throw new Error(`Failed to compress "${file.name}".`);

        const base = window.FileTools?.toSafeBaseName(file.name) || file.name.replace(/\.[^.]+$/, "");
        const ext = outType === "image/jpeg" ? "jpg" : "png";
        const filename = window.FileTools?.makeDownloadName(base, "compressed", ext) || `${base}-compressed.${ext}`;
        addDownloadRow(file.name, blob, filename);
        zip.file(filename, blob);

        if (i === 0) {
          const outUrl = URL.createObjectURL(blob);
          activeUrls.push(outUrl);
          previewOut.src = outUrl;
          previewOut.style.display = "";
          metaOut.textContent = `${img.naturalWidth} x ${img.naturalHeight} px - ${humanBytes(blob.size)} - ${outType}`;
        }

        setStatus(`Processed ${i + 1}/${sourceFiles.length}`);
        setProgress(i + 1, sourceFiles.length);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const zipName = window.FileTools?.makeDownloadName("images", "compressed-batch", "zip") || "images-compressed-batch.zip";
      const zipUrl = URL.createObjectURL(zipBlob);
      activeUrls.push(zipUrl);
      zipBtn.disabled = false;
      zipBtn.onclick = () => {
        const a = document.createElement("a");
        a.href = zipUrl;
        a.download = zipName;
        document.body.appendChild(a);
        a.click();
        a.remove();
      };
      setStatus("Done.");
    } catch (e) {
      setError(e.message || "Compression failed.");
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
      if (fileInput.files?.length) loadFiles(fileInput.files);
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
      if (e.dataTransfer?.files?.length) loadFiles(e.dataTransfer.files);
    });
  }

  qualityVal.textContent = String(quality.value);
  quality.addEventListener("input", () => {
    qualityVal.textContent = String(quality.value);
    resetOutput();
  });
  toJpeg.addEventListener("change", resetOutput);
  compressBtn.addEventListener("click", compressBatch);
  clearBtn.addEventListener("click", () => resetAll(true));

  wireDropzone();
  resetAll(false);
})();
