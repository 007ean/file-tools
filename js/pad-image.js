(() => {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const fileInfo = document.getElementById("fileInfo");
  const ratioPreset = document.getElementById("ratioPreset");
  const customRatioBox = document.getElementById("customRatioBox");
  const customW = document.getElementById("customW");
  const customH = document.getElementById("customH");
  const bgColor = document.getElementById("bgColor");
  const format = document.getElementById("format");
  const processBtn = document.getElementById("processBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const clearBtn = document.getElementById("clearBtn");
  const statusEl = document.getElementById("status");
  const errorEl = document.getElementById("error");
  const previewIn = document.getElementById("previewIn");
  const previewOut = document.getElementById("previewOut");
  const metaIn = document.getElementById("metaIn");
  const metaOut = document.getElementById("metaOut");

  let sourceFile = null;
  let sourceImg = null;
  let outputBlob = null;
  let outputUrl = null;
  let inputUrl = null;

  function setError(msg) {
    errorEl.style.display = msg ? "block" : "none";
    errorEl.textContent = msg || "";
  }

  function setStatus(msg) { statusEl.textContent = msg || ""; }

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

  function humanBytes(bytes) {
    if (!Number.isFinite(bytes)) return "";
    const units = ["B", "KB", "MB", "GB"];
    let n = bytes;
    let i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
    return `${n.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
  }

  function updateRatioUi() {
    customRatioBox.style.display = ratioPreset.value === "custom" ? "" : "none";
    resetOutput();
  }

  function getTargetRatio() {
    if (ratioPreset.value !== "custom") {
      const parts = ratioPreset.value.split(":");
      return Number(parts[0]) / Number(parts[1]);
    }
    const rw = Math.max(1, Number(customW.value) || 0);
    const rh = Math.max(1, Number(customH.value) || 0);
    return rw / rh;
  }

  async function loadFile(file) {
    setError("");
    setStatus("");
    resetOutput();

    if (!file || !(file.type || "").startsWith("image/")) {
      setError("Please select an image file.");
      return;
    }

    if (inputUrl) URL.revokeObjectURL(inputUrl);
    inputUrl = URL.createObjectURL(file);
    const img = new Image();

    try {
      await new Promise((resolve, reject) => {
        img.onload = () => resolve(true);
        img.onerror = () => reject(new Error("Could not read this image."));
        img.src = inputUrl;
      });
    } catch (e) {
      setError(e.message || "Could not read this image.");
      return;
    }

    sourceFile = file;
    sourceImg = img;
    fileInfo.textContent = `${file.name} - ${humanBytes(file.size)} - ${file.type || "image"}`;
    previewIn.src = inputUrl;
    previewIn.style.display = "";
    metaIn.textContent = `${img.naturalWidth} x ${img.naturalHeight} px`;
    processBtn.disabled = false;
    clearBtn.disabled = false;
    setStatus("Ready.");
  }

  async function processImage() {
    setError("");
    setStatus("");
    resetOutput();

    if (!sourceImg || !sourceFile) {
      setError("Choose an image first.");
      return;
    }

    const inW = sourceImg.naturalWidth;
    const inH = sourceImg.naturalHeight;
    const targetRatio = getTargetRatio();
    if (!Number.isFinite(targetRatio) || targetRatio <= 0) {
      setError("Invalid ratio value.");
      return;
    }

    let outW = inW;
    let outH = inH;
    const inRatio = inW / inH;

    if (inRatio > targetRatio) {
      outH = Math.round(inW / targetRatio);
    } else if (inRatio < targetRatio) {
      outW = Math.round(inH * targetRatio);
    }

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) {
      setError("Canvas is not available in this browser.");
      return;
    }

    ctx.fillStyle = bgColor.value || "#ffffff";
    ctx.fillRect(0, 0, outW, outH);

    const x = Math.round((outW - inW) / 2);
    const y = Math.round((outH - inH) / 2);
    ctx.drawImage(sourceImg, x, y, inW, inH);

    const outType = format.value;
    const blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), outType, outType === "image/jpeg" ? 0.92 : undefined);
    });

    if (!blob) {
      setError("Failed to export padded image.");
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
    setError("");
    if (!outputBlob) {
      setError("Nothing to download yet.");
      return;
    }
    const base = window.FileTools?.toSafeBaseName(sourceFile?.name || "image") || "image";
    const ext = outputBlob.type === "image/jpeg" ? "jpg" : "png";
    const name = window.FileTools?.makeDownloadName(base, "padded", ext) || `${base}-padded.${ext}`;
    window.FileTools?.triggerBlobDownload(outputBlob, name);
  }

  function clearAll() {
    setError("");
    setStatus("");
    sourceFile = null;
    sourceImg = null;
    revokeUrls();
    fileInfo.textContent = "";
    metaIn.textContent = "";
    metaOut.textContent = "";
    previewIn.style.display = "none";
    previewOut.style.display = "none";
    processBtn.disabled = true;
    clearBtn.disabled = true;
    downloadBtn.disabled = true;
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

  ratioPreset.addEventListener("change", updateRatioUi);
  customW.addEventListener("input", resetOutput);
  customH.addEventListener("input", resetOutput);
  bgColor.addEventListener("input", resetOutput);
  format.addEventListener("change", resetOutput);
  processBtn.addEventListener("click", processImage);
  downloadBtn.addEventListener("click", downloadOutput);
  clearBtn.addEventListener("click", clearAll);

  wireDropzone();
  updateRatioUi();
})();
