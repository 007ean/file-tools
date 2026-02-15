(() => {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const fileInfo = document.getElementById("fileInfo");
  const angleEl = document.getElementById("angle");
  const flipXEl = document.getElementById("flipX");
  const flipYEl = document.getElementById("flipY");
  const applyBtn = document.getElementById("applyBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const clearBtn = document.getElementById("clearBtn");
  const statusEl = document.getElementById("status");
  const errorEl = document.getElementById("error");
  const previewIn = document.getElementById("previewIn");
  const previewOut = document.getElementById("previewOut");
  const metaIn = document.getElementById("metaIn");
  const metaOut = document.getElementById("metaOut");

  const settingsStore = window.FileTools?.bindToolSettings("rotate-flip-image", ["angle", "flipX", "flipY"]);

  let inputFile = null;
  let inputImage = null;
  let inputUrl = null;
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
  function revokeUrls() {
    if (inputUrl) URL.revokeObjectURL(inputUrl);
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    inputUrl = null;
    outputUrl = null;
  }
  function resetOutput() {
    outputBlob = null;
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    outputUrl = null;
    previewOut.style.display = "none";
    previewOut.removeAttribute("src");
    metaOut.textContent = "";
    downloadBtn.disabled = true;
  }
  function resetAll(resetSettings) {
    setError("");
    setStatus("");
    if (resetSettings && settingsStore) settingsStore.reset();
    inputFile = null;
    inputImage = null;
    fileInfo.textContent = "";
    previewIn.style.display = "none";
    previewIn.removeAttribute("src");
    metaIn.textContent = "";
    applyBtn.disabled = true;
    clearBtn.disabled = true;
    resetOutput();
  }
  async function loadImage() {
    const img = new Image();
    const loaded = new Promise((resolve, reject) => {
      img.onload = () => resolve(true);
      img.onerror = () => reject(new Error("Could not read this image."));
    });
    img.src = inputUrl;
    await loaded;
    return img;
  }
  async function loadFile(file) {
    setError("");
    setStatus("");
    resetOutput();
    if (!file || !(file.type || "").startsWith("image/")) {
      setError(window.FileTools?.describeFileTypeError(file, "image file") || "Please select an image file.");
      return;
    }
    revokeUrls();
    inputFile = file;
    inputUrl = URL.createObjectURL(file);
    previewIn.src = inputUrl;
    previewIn.style.display = "";
    inputImage = await loadImage();
    fileInfo.textContent = `${file.name} - ${humanBytes(file.size)} - ${file.type}`;
    metaIn.textContent = `${inputImage.naturalWidth} x ${inputImage.naturalHeight} px`;
    applyBtn.disabled = false;
    clearBtn.disabled = false;
    setStatus("Ready.");
  }
  async function applyTransform() {
    setError("");
    setStatus("");
    resetOutput();
    if (!inputImage || !inputFile) {
      setError("Please select an image first.");
      return;
    }
    const angle = Number(angleEl.value) || 0;
    const flipX = !!flipXEl.checked;
    const flipY = !!flipYEl.checked;
    const swapSides = angle === 90 || angle === 270;
    const outW = swapSides ? inputImage.naturalHeight : inputImage.naturalWidth;
    const outH = swapSides ? inputImage.naturalWidth : inputImage.naturalHeight;

    setStatus("Transforming...");
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) {
      setError("Canvas is not available in this browser.");
      return;
    }
    ctx.translate(outW / 2, outH / 2);
    ctx.rotate((angle * Math.PI) / 180);
    ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    ctx.drawImage(inputImage, -inputImage.naturalWidth / 2, -inputImage.naturalHeight / 2);

    const outType = (inputFile.type || "").includes("jpeg") ? "image/jpeg" : "image/png";
    const blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), outType, outType === "image/jpeg" ? 0.92 : undefined));
    if (!blob) {
      setError("Failed to export output image.");
      return;
    }
    outputBlob = blob;
    outputUrl = URL.createObjectURL(blob);
    previewOut.src = outputUrl;
    previewOut.style.display = "";
    metaOut.textContent = `${outW} x ${outH} px - ${humanBytes(blob.size)} - ${outType}`;
    downloadBtn.disabled = false;
    setStatus("Done.");
  }
  function downloadOutput() {
    if (!outputBlob) {
      setError("Nothing to download yet.");
      return;
    }
    const base = window.FileTools?.toSafeBaseName(inputFile?.name || "image");
    const ext = outputBlob.type === "image/jpeg" ? "jpg" : "png";
    const filename = window.FileTools?.makeDownloadName(base, "rotated-flipped", ext) || `${base}-rotated-flipped.${ext}`;
    window.FileTools?.triggerBlobDownload(outputBlob, filename);
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
      if (file) loadFile(file);
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
      if (file) loadFile(file);
    });
  }

  [angleEl, flipXEl, flipYEl].forEach((el) => {
    el.addEventListener("change", resetOutput);
    el.addEventListener("input", resetOutput);
  });
  applyBtn.addEventListener("click", applyTransform);
  downloadBtn.addEventListener("click", downloadOutput);
  clearBtn.addEventListener("click", () => resetAll(true));
  wireDropzone();
  resetAll(false);
})();
