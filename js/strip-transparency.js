(() => {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const fileInfo = document.getElementById("fileInfo");
  const bgColor = document.getElementById("bgColor");
  const format = document.getElementById("format");
  const processBtn = document.getElementById("processBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const clearBtn = document.getElementById("clearBtn");
  const statusEl = document.getElementById("status");
  const errorEl = document.getElementById("error");
  const previewIn = document.getElementById("previewIn");
  const previewOut = document.getElementById("previewOut");
  const metaOut = document.getElementById("metaOut");

  let sourceFile = null;
  let sourceImg = null;
  let inputUrl = null;
  let outputBlob = null;
  let outputUrl = null;

  function setError(msg) {
    errorEl.style.display = msg ? "block" : "none";
    errorEl.textContent = msg || "";
  }

  function setStatus(msg) { statusEl.textContent = msg || ""; }

  function humanBytes(bytes) {
    if (!Number.isFinite(bytes)) return "";
    const units = ["B", "KB", "MB", "GB"];
    let n = bytes;
    let i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
    return `${n.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
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

  async function loadFile(file) {
    setError("");
    setStatus("");
    resetOutput();

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
    processBtn.disabled = false;
    clearBtn.disabled = false;
    setStatus("Ready.");
  }

  async function flatten() {
    setError("");
    setStatus("");
    resetOutput();

    if (!sourceImg || !sourceFile) {
      setError("Upload a PNG first.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = sourceImg.naturalWidth;
    canvas.height = sourceImg.naturalHeight;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      setError("Canvas is not available in this browser.");
      return;
    }

    ctx.fillStyle = bgColor.value || "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(sourceImg, 0, 0);

    const outType = format.value;
    const blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), outType, outType === "image/jpeg" ? 0.92 : undefined);
    });

    if (!blob) {
      setError("Failed to flatten image.");
      return;
    }

    outputBlob = blob;
    outputUrl = URL.createObjectURL(blob);
    previewOut.src = outputUrl;
    previewOut.style.display = "";
    metaOut.textContent = `${canvas.width} x ${canvas.height} px - ${humanBytes(blob.size)} - ${outType}`;
    downloadBtn.disabled = false;
    setStatus("Done.");
  }

  function downloadOutput() {
    if (!outputBlob) {
      setError("Nothing to download yet.");
      return;
    }
    const base = window.FileTools?.toSafeBaseName(sourceFile?.name || "image") || "image";
    const ext = outputBlob.type === "image/jpeg" ? "jpg" : "png";
    const filename = window.FileTools?.makeDownloadName(base, "flattened", ext) || `${base}-flattened.${ext}`;
    window.FileTools?.triggerBlobDownload(outputBlob, filename);
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
    processBtn.disabled = true;
    clearBtn.disabled = true;
    resetOutput();
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

  bgColor.addEventListener("input", resetOutput);
  format.addEventListener("change", resetOutput);
  processBtn.addEventListener("click", flatten);
  downloadBtn.addEventListener("click", downloadOutput);
  clearBtn.addEventListener("click", clearAll);

  wireDropzone();
})();
