(() => {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const fileInfo = document.getElementById("fileInfo");
  const xEl = document.getElementById("x");
  const yEl = document.getElementById("y");
  const wEl = document.getElementById("w");
  const hEl = document.getElementById("h");
  const cropBtn = document.getElementById("cropBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const clearBtn = document.getElementById("clearBtn");
  const statusEl = document.getElementById("status");
  const errorEl = document.getElementById("error");
  const previewIn = document.getElementById("previewIn");
  const previewOut = document.getElementById("previewOut");
  const metaIn = document.getElementById("metaIn");
  const metaOut = document.getElementById("metaOut");

  const settingsStore = window.FileTools?.bindToolSettings("crop-image", ["x", "y", "w", "h"]);

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
    cropBtn.disabled = true;
    clearBtn.disabled = true;
    resetOutput();
  }
  async function loadImage(file) {
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
    inputImage = await loadImage(file);

    fileInfo.textContent = `${file.name} - ${humanBytes(file.size)} - ${file.type}`;
    metaIn.textContent = `${inputImage.naturalWidth} x ${inputImage.naturalHeight} px`;
    if (!wEl.value) wEl.value = String(inputImage.naturalWidth);
    if (!hEl.value) hEl.value = String(inputImage.naturalHeight);
    cropBtn.disabled = false;
    clearBtn.disabled = false;
    setStatus("Ready.");
  }
  function getRect() {
    const x = Math.max(0, Math.floor(Number(xEl.value)));
    const y = Math.max(0, Math.floor(Number(yEl.value)));
    const w = Math.floor(Number(wEl.value));
    const h = Math.floor(Number(hEl.value));
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) return { error: "Width and height must be at least 1." };
    if (!inputImage) return { error: "Please select an image first." };
    if (x >= inputImage.naturalWidth || y >= inputImage.naturalHeight) return { error: "Crop origin is outside the image bounds." };
    const maxW = inputImage.naturalWidth - x;
    const maxH = inputImage.naturalHeight - y;
    return { x, y, w: Math.min(w, maxW), h: Math.min(h, maxH) };
  }
  async function cropImage() {
    setError("");
    setStatus("");
    resetOutput();
    if (!inputImage || !inputFile) {
      setError("Please select an image first.");
      return;
    }
    const rect = getRect();
    if (rect.error) {
      setError(rect.error);
      return;
    }
    setStatus("Cropping...");
    const canvas = document.createElement("canvas");
    canvas.width = rect.w;
    canvas.height = rect.h;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) {
      setError("Canvas is not available in this browser.");
      return;
    }
    ctx.drawImage(inputImage, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);

    const outType = (inputFile.type || "").includes("jpeg") ? "image/jpeg" : "image/png";
    const blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), outType, outType === "image/jpeg" ? 0.92 : undefined));
    if (!blob) {
      setError("Failed to export cropped image.");
      setStatus("");
      return;
    }
    outputBlob = blob;
    outputUrl = URL.createObjectURL(blob);
    previewOut.src = outputUrl;
    previewOut.style.display = "";
    metaOut.textContent = `${rect.w} x ${rect.h} px - ${humanBytes(blob.size)} - ${outType}`;
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
    const filename = window.FileTools?.makeDownloadName(base, "cropped", ext) || `${base}-cropped.${ext}`;
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

  [xEl, yEl, wEl, hEl].forEach((el) => el.addEventListener("input", resetOutput));
  cropBtn.addEventListener("click", cropImage);
  downloadBtn.addEventListener("click", downloadOutput);
  clearBtn.addEventListener("click", () => resetAll(true));
  wireDropzone();
  resetAll(false);
})();
