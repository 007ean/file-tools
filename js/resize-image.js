(() => {
  // Elements
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const fileInfo = document.getElementById("fileInfo");

  const modeRadios = document.querySelectorAll('input[name="mode"]');
  const percentBox = document.getElementById("percentBox");
  const pixelsBox = document.getElementById("pixelsBox");

  const percentInput = document.getElementById("percent");
  const widthInput = document.getElementById("width");
  const heightInput = document.getElementById("height");
  const lockAspect = document.getElementById("lockAspect");

  const resizeBtn = document.getElementById("resizeBtn");
  const downloadBtn = document.getElementById("downloadBtn");

  const statusEl = document.getElementById("status");
  const errorEl = document.getElementById("error");

  const previewIn = document.getElementById("previewIn");
  const previewOut = document.getElementById("previewOut");
  const metaIn = document.getElementById("metaIn");
  const metaOut = document.getElementById("metaOut");

  // State
  let originalFile = null;
  let originalImage = null; // HTMLImageElement
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

  function updateModeUI() {
    const mode = getMode();
    if (mode === "percent") {
      percentBox.style.display = "";
      pixelsBox.style.display = "none";
    } else {
      percentBox.style.display = "none";
      pixelsBox.style.display = "";
    }
    resetOutput();
    setError("");
    setStatus("");
  }

  function getMode() {
    const checked = document.querySelector('input[name="mode"]:checked');
    return checked ? checked.value : "percent";
  }

  function clampInt(v, min, max) {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n)) return null;
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }

  function clampNumber(v, min, max) {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }

  async function loadFile(file) {
    setError("");
    setStatus("");

    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file (JPG/PNG/WebP).");
      return;
    }

    revokeURLs();
    resetOutput();

    originalFile = file;
    fileInfo.textContent = `${file.name} • ${humanBytes(file.size)} • ${file.type || "unknown type"}`;

    // Show preview via object URL
    originalObjectURL = URL.createObjectURL(file);
    previewIn.src = originalObjectURL;
    previewIn.style.display = "";

    // Decode image (for accurate dimensions)
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

    const w = img.naturalWidth;
    const h = img.naturalHeight;
    metaIn.textContent = `${w} × ${h} px`;

    // Default pixel inputs to original
    widthInput.value = String(w);
    heightInput.value = String(h);

    resizeBtn.disabled = false;
    setStatus("Ready.");
  }

  function computeTargetSize() {
    if (!originalImage) return null;
    const ow = originalImage.naturalWidth;
    const oh = originalImage.naturalHeight;

    const mode = getMode();
    if (mode === "percent") {
      const pct = clampNumber(percentInput.value, 1, 500);
      if (pct === null) return { error: "Enter a valid percentage (1–500)." };

      const scale = pct / 100;
      const tw = Math.max(1, Math.round(ow * scale));
      const th = Math.max(1, Math.round(oh * scale));
      return { tw, th };
    }

    // pixels mode
    const tw = clampInt(widthInput.value, 1, 100000);
    const th = clampInt(heightInput.value, 1, 100000);

    if (tw === null || th === null) return { error: "Enter valid width and height in pixels." };
    return { tw, th };
  }

  async function resizeImage() {
    setError("");
    setStatus("");

    if (!originalImage || !originalFile) {
      setError("Please select an image first.");
      return;
    }

    const target = computeTargetSize();
    if (!target) return;
    if (target.error) {
      setError(target.error);
      return;
    }

    const { tw, th } = target;

    setStatus("Resizing…");
    resetOutput();

    // Canvas resize
    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) {
      setError("Your browser does not support canvas.");
      setStatus("");
      return;
    }

    // Higher quality scaling hint
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.drawImage(originalImage, 0, 0, tw, th);

    // Output format:
    // - If original is PNG/WebP, keep PNG for safety (keeps transparency).
    // - If original is JPEG, output JPEG.
    const inType = (originalFile.type || "").toLowerCase();
    const outType = inType.includes("jpeg") || inType.includes("jpg") ? "image/jpeg" : "image/png";
    const quality = outType === "image/jpeg" ? 0.92 : undefined;

    const blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), outType, quality);
    });

    if (!blob) {
      setError("Failed to export the resized image.");
      setStatus("");
      return;
    }

    outputBlob = blob;
    outputObjectURL = URL.createObjectURL(blob);

    previewOut.src = outputObjectURL;
    previewOut.style.display = "";

    metaOut.textContent = `${tw} × ${th} px • ${humanBytes(blob.size)} • ${outType}`;

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

  // Keep aspect ratio when editing width/height
  function wireAspectLock() {
    function onWidthChange() {
      if (!originalImage) return;
      if (!lockAspect.checked) return;
      const ow = originalImage.naturalWidth;
      const oh = originalImage.naturalHeight;
      const w = clampInt(widthInput.value, 1, 100000);
      if (w === null) return;
      const h = Math.max(1, Math.round((w * oh) / ow));
      heightInput.value = String(h);
      resetOutput();
    }

    function onHeightChange() {
      if (!originalImage) return;
      if (!lockAspect.checked) return;
      const ow = originalImage.naturalWidth;
      const oh = originalImage.naturalHeight;
      const h = clampInt(heightInput.value, 1, 100000);
      if (h === null) return;
      const w = Math.max(1, Math.round((h * ow) / oh));
      widthInput.value = String(w);
      resetOutput();
    }

    widthInput.addEventListener("input", onWidthChange);
    heightInput.addEventListener("input", onHeightChange);
    lockAspect.addEventListener("change", () => resetOutput());
  }

  // Drag/drop + click to select
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

  // Mode toggle
  modeRadios.forEach((r) => r.addEventListener("change", updateModeUI));
  percentInput.addEventListener("input", resetOutput);

  resizeBtn.addEventListener("click", resizeImage);
  downloadBtn.addEventListener("click", downloadOutput);

  wireDropzone();
  wireAspectLock();
  updateModeUI();
})();
