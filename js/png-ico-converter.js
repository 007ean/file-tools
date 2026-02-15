(() => {
  const SIZES = [16, 32, 48, 64];

  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const fileInfo = document.getElementById("fileInfo");
  const includePngs = document.getElementById("includePngs");
  const generateBtn = document.getElementById("generateBtn");
  const downloadIcoBtn = document.getElementById("downloadIcoBtn");
  const downloadZipBtn = document.getElementById("downloadZipBtn");
  const clearBtn = document.getElementById("clearBtn");
  const statusEl = document.getElementById("status");
  const errorEl = document.getElementById("error");
  const previewIn = document.getElementById("previewIn");
  const metaOut = document.getElementById("metaOut");

  let sourceFile = null;
  let sourceImg = null;
  let inputUrl = null;
  let icoBlob = null;
  let zipBlob = null;

  function setError(msg) {
    errorEl.style.display = msg ? "block" : "none";
    errorEl.textContent = msg || "";
  }

  function setStatus(msg) { statusEl.textContent = msg || ""; }

  function clearOutput() {
    icoBlob = null;
    zipBlob = null;
    downloadIcoBtn.disabled = true;
    downloadZipBtn.disabled = true;
    metaOut.textContent = "";
  }

  function humanBytes(bytes) {
    if (!Number.isFinite(bytes)) return "";
    const units = ["B", "KB", "MB", "GB"];
    let n = bytes;
    let i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
    return `${n.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
  }

  async function loadPng(file) {
    setError("");
    setStatus("");
    clearOutput();

    const isPng = (file?.type || "") === "image/png" || /\.png$/i.test(file?.name || "");
    if (!file || !isPng) {
      setError("Please select a PNG image.");
      return;
    }

    if (inputUrl) URL.revokeObjectURL(inputUrl);
    inputUrl = URL.createObjectURL(file);

    const img = new Image();
    try {
      await new Promise((resolve, reject) => {
        img.onload = () => resolve(true);
        img.onerror = () => reject(new Error("Could not read this PNG."));
        img.src = inputUrl;
      });
    } catch (e) {
      setError(e.message || "Could not read this PNG.");
      return;
    }

    sourceFile = file;
    sourceImg = img;
    fileInfo.textContent = `${file.name} - ${humanBytes(file.size)} - ${img.naturalWidth} x ${img.naturalHeight} px`;
    previewIn.src = inputUrl;
    previewIn.style.display = "";
    generateBtn.disabled = false;
    clearBtn.disabled = false;
    setStatus("Ready.");
  }

  async function renderPngBlob(size) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) throw new Error("Canvas is not available in this browser.");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(sourceImg, 0, 0, size, size);

    const blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
    if (!blob) throw new Error(`Failed to create ${size}x${size} PNG.`);
    return blob;
  }

  function buildIco(pngBuffers) {
    const count = pngBuffers.length;
    const headerSize = 6 + (16 * count);
    let offset = headerSize;
    const totalSize = headerSize + pngBuffers.reduce((sum, p) => sum + p.byteLength, 0);
    const out = new Uint8Array(totalSize);
    const view = new DataView(out.buffer);

    view.setUint16(0, 0, true);
    view.setUint16(2, 1, true);
    view.setUint16(4, count, true);

    for (let i = 0; i < count; i++) {
      const size = SIZES[i];
      const data = pngBuffers[i];
      const base = 6 + (16 * i);

      out[base] = size === 256 ? 0 : size;
      out[base + 1] = size === 256 ? 0 : size;
      out[base + 2] = 0;
      out[base + 3] = 0;
      view.setUint16(base + 4, 1, true);
      view.setUint16(base + 6, 32, true);
      view.setUint32(base + 8, data.byteLength, true);
      view.setUint32(base + 12, offset, true);

      out.set(new Uint8Array(data), offset);
      offset += data.byteLength;
    }

    return new Blob([out], { type: "image/x-icon" });
  }

  async function generate() {
    setError("");
    setStatus("");
    clearOutput();

    if (!sourceImg || !sourceFile) {
      setError("Upload a PNG first.");
      return;
    }

    if (!window.JSZip) {
      setError("ZIP library failed to load. Refresh and try again.");
      return;
    }

    setStatus("Generating icon sizes...");
    try {
      const pngBlobs = [];
      const pngBuffers = [];
      for (const size of SIZES) {
        const blob = await renderPngBlob(size);
        pngBlobs.push(blob);
        pngBuffers.push(await blob.arrayBuffer());
      }

      icoBlob = buildIco(pngBuffers);
      const zip = new window.JSZip();
      const base = window.FileTools?.toSafeBaseName(sourceFile.name) || "favicon";
      zip.file(`${base}.ico`, icoBlob);
      if (includePngs.checked) {
        for (let i = 0; i < SIZES.length; i++) {
          zip.file(`${base}-${SIZES[i]}x${SIZES[i]}.png`, pngBlobs[i]);
        }
      }
      zipBlob = await zip.generateAsync({ type: "blob" });

      downloadIcoBtn.disabled = false;
      downloadZipBtn.disabled = false;
      metaOut.textContent = `ICO: ${humanBytes(icoBlob.size)} | ZIP: ${humanBytes(zipBlob.size)} | Sizes: ${SIZES.join(", ")}`;
      setStatus("Done.");
    } catch (e) {
      setError(e.message || "Failed to generate ICO.");
      setStatus("");
    }
  }

  function downloadIco() {
    if (!icoBlob) {
      setError("Generate output first.");
      return;
    }
    const base = window.FileTools?.toSafeBaseName(sourceFile?.name || "favicon") || "favicon";
    window.FileTools?.triggerBlobDownload(icoBlob, `${base}.ico`);
  }

  function downloadZip() {
    if (!zipBlob) {
      setError("Generate output first.");
      return;
    }
    const base = window.FileTools?.toSafeBaseName(sourceFile?.name || "favicon") || "favicon";
    window.FileTools?.triggerBlobDownload(zipBlob, `${base}-favicon.zip`);
  }

  function clearAll() {
    setError("");
    setStatus("");
    sourceFile = null;
    sourceImg = null;
    fileInfo.textContent = "";
    previewIn.style.display = "none";
    previewIn.removeAttribute("src");
    if (inputUrl) URL.revokeObjectURL(inputUrl);
    inputUrl = null;
    generateBtn.disabled = true;
    clearBtn.disabled = true;
    clearOutput();
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
      const file = fileInput.files?.[0];
      if (file) loadPng(file);
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
      const file = e.dataTransfer?.files?.[0];
      if (file) loadPng(file);
    });
  }

  generateBtn.addEventListener("click", generate);
  downloadIcoBtn.addEventListener("click", downloadIco);
  downloadZipBtn.addEventListener("click", downloadZip);
  clearBtn.addEventListener("click", clearAll);

  wireDropzone();
})();
