(() => {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const fileInfo = document.getElementById("fileInfo");

  const quality = document.getElementById("quality");
  const qualityVal = document.getElementById("qualityVal");
  const toJpeg = document.getElementById("toJpeg");

  const compressBtn = document.getElementById("compressBtn");
  const downloadBtn = document.getElementById("downloadBtn");

  const statusEl = document.getElementById("status");
  const errorEl = document.getElementById("error");

  const previewIn = document.getElementById("previewIn");
  const previewOut = document.getElementById("previewOut");
  const metaIn = document.getElementById("metaIn");
  const metaOut = document.getElementById("metaOut");

  let originalFile = null;
  let originalImage = null;
  let originalObjectURL = null;

  let outputBlob = null;
  let outputObjectURL = null;

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

  function revokeURLs() {
    if (originalObjectURL) URL.revokeObjectURL(originalObjectURL);
    if (outputObjectURL) URL.revokeObjectURL(outputObjectURL);
    originalObjectURL = null;
    outputObjectURL = null;
  }

  function resetOutput() {
    outputBlob = null;
    if (outputObjectURL) URL.revokeObjectURL(outputObjectURL);
    outputObjectURL = null;
    previewOut.style.display = "none";
    previewOut.removeAttribute("src");
    metaOut.textContent = "";
    downloadBtn.disabled = true;
  }

  async function loadFile(file) {
    setError("");
    setStatus("");
    resetOutput();

    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file (JPG/PNG/WebP).");
      return;
    }

    revokeURLs();

    originalFile = file;
    fileInfo.textContent = `${file.name} • ${humanBytes(file.size)} • ${file.type || "unknown type"}`;

    originalObjectURL = URL.createObjectURL(file);
    previewIn.src = originalObjectURL;
    previewIn.style.display = "";

    const img = new Image();
    img.decoding = "async";

    const loaded = new Promise((resolve, reject) => {
      img.onload = () => resolve(true);
      img.onerror = () => reject(new Error("Could not read this image."));
    });

    img.src = originalObjectURL;

    try {
      await loaded;
    } catch (e) {
      setError(e.message || "Could not read this image.");
      return;
    }

    originalImage = img;
    metaIn.textContent = `${img.naturalWidth} × ${img.naturalHeight} px • ${humanBytes(file.size)}`;

    compressBtn.disabled = false;
    setStatus("Ready.");
  }

  function getQuality() {
    const q = Number(quality.value);
    if (!Number.isFinite(q)) return 0.8;
    return Math.min(0.95, Math.max(0.1, q / 100));
  }

  async function compressImage() {
    setError("");
    setStatus("");
    resetOutput();

    if (!originalImage || !originalFile) {
      setError("Please select an image first.");
      return;
    }

    setStatus("Compressing…");

    const canvas = document.createElement("canvas");
    canvas.width = originalImage.naturalWidth;
    canvas.height = originalImage.naturalHeight;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) {
      setError("Your browser does not support canvas.");
      setStatus("");
      return;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(originalImage, 0, 0);

    const q = getQuality();

    // Output choice:
    // - If "Convert to JPG" is checked -> JPEG with selected quality.
    // - Otherwise:
    //   - If original is JPEG -> JPEG with selected quality.
    //   - Else -> PNG (lossless, larger).
    const inType = (originalFile.type || "").toLowerCase();
    let outType;
    let outQuality;

    if (toJpeg.checked) {
      outType = "image/jpeg";
      outQuality = q;
    } else {
      if (inType.includes("jpeg") || inType.includes("jpg")) {
        outType = "image/jpeg";
        outQuality = q;
      } else {
        outType = "image/png";
        outQuality = undefined;
      }
    }

    const blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), outType, outQuality);
    });

    if (!blob) {
      setError("Failed to export the compressed image.");
      setStatus("");
      return;
    }

    outputBlob = blob;
    outputObjectURL = URL.createObjectURL(blob);

    previewOut.src = outputObjectURL;
    previewOut.style.display = "";

    const ratio = blob.size / originalFile.size;
    const pct = Number.isFinite(ratio) ? `${Math.round(ratio * 100)}%` : "";

    metaOut.textContent =
      `${originalImage.naturalWidth} × ${originalImage.naturalHeight} px • ${humanBytes(blob.size)} • ${outType}` +
      (pct ? ` • ${pct} of original` : "");

    downloadBtn.disabled = false;
    setStatus("Done.");
  }

  function downloadOutput() {
    setError("");
    if (!outputBlob || !outputObjectURL) {
      setError("Nothing to download yet.");
      return;
    }

    const baseName = (originalFile?.name || "image").replace(/\.[^.]+$/, "");
    const ext = outputBlob.type === "image/jpeg" ? "jpg" : "png";
    const filename = `${baseName}-${Date.now()}.${ext}`;

    const a = document.createElement("a");
    a.href = outputObjectURL;
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
      const file = fileInput.files && fileInput.files[0];
      if (file) loadFile(file);
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
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) loadFile(file);
    });
  }

  // UI wiring
  qualityVal.textContent = String(quality.value);
  quality.addEventListener("input", () => {
    qualityVal.textContent = String(quality.value);
    resetOutput();
  });
  toJpeg.addEventListener("change", resetOutput);

  compressBtn.addEventListener("click", compressImage);
  downloadBtn.addEventListener("click", downloadOutput);

  wireDropzone();
})();
