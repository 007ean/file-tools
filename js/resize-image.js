(() => {
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

  const settingsStore = window.FileTools?.bindToolSettings("resize-image", ["percent", "width", "height", "lockAspect"]);

  let sourceFiles = [];
  let outputItems = [];
  let activeUrls = [];
  let currentJob = null;

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

  function setProgress(current, total) {
    if (!total) {
      progressBar.hidden = true;
      progressBar.value = 0;
      return;
    }
    progressBar.hidden = false;
    progressBar.value = Math.max(0, Math.min(100, Math.round((current / total) * 100)));
  }

  function revokeOutputs() {
    for (const url of activeUrls) URL.revokeObjectURL(url);
    activeUrls = [];
  }

  function resetOutputs() {
    revokeOutputs();
    outputItems = [];
    previewOut.removeAttribute("src");
    previewOut.style.display = "none";
    metaOut.textContent = "";
    downloadsEl.innerHTML = `<div class="hint">No exports yet.</div>`;
    zipBtn.disabled = true;
  }

  function resetAll(resetSettings) {
    setError("");
    setStatus("");
    setProgress(0, 0);
    if (resetSettings && settingsStore) settingsStore.reset();
    sourceFiles = [];
    fileInfo.textContent = "";
    previewIn.removeAttribute("src");
    previewIn.style.display = "none";
    metaIn.textContent = "";
    resizeBtn.disabled = true;
    clearBtn.disabled = true;
    resetOutputs();
    updateModeUI();
  }

  function updateModeUI() {
    const mode = getMode();
    percentBox.style.display = mode === "percent" ? "" : "none";
    pixelsBox.style.display = mode === "pixels" ? "" : "none";
  }

  function getMode() {
    const checked = document.querySelector('input[name="mode"]:checked');
    return checked ? checked.value : "percent";
  }

  function clampNumber(v, min, max) {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return Math.max(min, Math.min(max, n));
  }

  function clampInt(v, min, max) {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n)) return null;
    return Math.max(min, Math.min(max, n));
  }

  async function loadImageFromFile(file) {
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

  function computeTargetSize(ow, oh) {
    const mode = getMode();
    if (mode === "percent") {
      const pct = clampNumber(percentInput.value, 1, 500);
      if (pct == null) return { error: "Enter a valid scale percentage (1-500)." };
      return {
        tw: Math.max(1, Math.round(ow * (pct / 100))),
        th: Math.max(1, Math.round(oh * (pct / 100))),
      };
    }
    const tw = clampInt(widthInput.value, 1, 100000);
    const th = clampInt(heightInput.value, 1, 100000);
    if (tw == null || th == null) return { error: "Enter valid width and height in pixels." };
    return { tw, th };
  }

  async function loadFiles(files) {
    setError("");
    setStatus("");
    resetOutputs();
    const list = Array.from(files || []).filter((f) => (f.type || "").startsWith("image/"));
    if (list.length === 0) {
      setError(window.FileTools?.describeFileTypeError(files?.[0], "image file (JPG/PNG/WebP)") || "Please add image files.");
      return;
    }
    sourceFiles = list;
    clearBtn.disabled = false;
    resizeBtn.disabled = false;

    const totalBytes = list.reduce((sum, f) => sum + (f.size || 0), 0);
    fileInfo.textContent = `${list.length} file(s) - ${humanBytes(totalBytes)}`;

    const first = list[0];
    const firstUrl = URL.createObjectURL(first);
    previewIn.src = firstUrl;
    previewIn.style.display = "";
    previewIn.onload = () => URL.revokeObjectURL(firstUrl);

    const img = await loadImageFromFile(first);
    metaIn.textContent = `${img.naturalWidth} x ${img.naturalHeight} px`;
    if (!widthInput.value) widthInput.value = String(img.naturalWidth);
    if (!heightInput.value) heightInput.value = String(img.naturalHeight);
    setStatus("Ready.");
  }

  function addDownloadRow(name, blob, filename) {
    const url = URL.createObjectURL(blob);
    activeUrls.push(url);

    const row = document.createElement("div");
    row.className = "item";

    const left = document.createElement("div");
    left.className = "item-left";
    left.innerHTML = `<div class="item-name">${name}</div><div class="item-meta">${humanBytes(blob.size)} - ${blob.type}</div>`;

    const right = document.createElement("div");
    right.className = "item-actions";
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.textContent = "Download";
    a.style.display = "inline-block";
    a.style.padding = "8px 12px";
    a.style.border = "1px solid #ddd";
    a.style.borderRadius = "10px";
    a.style.textDecoration = "none";
    right.appendChild(a);

    row.appendChild(left);
    row.appendChild(right);
    downloadsEl.appendChild(row);
  }

  async function processBatch() {
    setError("");
    setStatus("");
    resetOutputs();
    if (sourceFiles.length === 0) {
      setError("Select one or more images first.");
      return;
    }
    if (!window.JSZip) {
      setError("ZIP library failed to load. Refresh and try again.");
      return;
    }

    const zip = new window.JSZip();
    currentJob = { cancelled: false };
    downloadsEl.innerHTML = "";
    setProgress(0, sourceFiles.length);

    try {
      for (let i = 0; i < sourceFiles.length; i++) {
        const file = sourceFiles[i];
        const img = await loadImageFromFile(file);
        const target = computeTargetSize(img.naturalWidth, img.naturalHeight);
        if (target.error) throw new Error(target.error);

        const canvas = document.createElement("canvas");
        canvas.width = target.tw;
        canvas.height = target.th;
        const ctx = canvas.getContext("2d", { alpha: true });
        if (!ctx) throw new Error("Canvas is not available in this browser.");
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, target.tw, target.th);

        const inType = (file.type || "").toLowerCase();
        const outType = inType.includes("jpeg") || inType.includes("jpg") ? "image/jpeg" : "image/png";
        const outBlob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), outType, outType === "image/jpeg" ? 0.92 : undefined));
        if (!outBlob) throw new Error(`Failed to resize "${file.name}".`);

        const base = window.FileTools?.toSafeBaseName(file.name) || file.name.replace(/\.[^.]+$/, "");
        const ext = outType === "image/jpeg" ? "jpg" : "png";
        const filename = window.FileTools?.makeDownloadName(base, "resized", ext) || `${base}-resized.${ext}`;

        outputItems.push({ name: file.name, blob: outBlob, filename, width: target.tw, height: target.th });
        zip.file(filename, outBlob);
        addDownloadRow(file.name, outBlob, filename);

        if (i === 0) {
          const firstUrl = URL.createObjectURL(outBlob);
          activeUrls.push(firstUrl);
          previewOut.src = firstUrl;
          previewOut.style.display = "";
          metaOut.textContent = `${target.tw} x ${target.th} px - ${humanBytes(outBlob.size)} - ${outType}`;
        }

        setStatus(`Processed ${i + 1}/${sourceFiles.length}`);
        setProgress(i + 1, sourceFiles.length);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const zipName = window.FileTools?.makeDownloadName("images", "resized-batch", "zip") || "images-resized-batch.zip";
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
      setError(e.message || "Resize failed.");
      setStatus("");
    } finally {
      currentJob = null;
    }
  }

  function wireAspectLock() {
    function onWidthChange() {
      if (!lockAspect.checked || sourceFiles.length === 0) return;
      const w = clampInt(widthInput.value, 1, 100000);
      if (w == null) return;
      loadImageFromFile(sourceFiles[0]).then((img) => {
        const h = Math.max(1, Math.round((w * img.naturalHeight) / img.naturalWidth));
        heightInput.value = String(h);
      }).catch(() => {});
    }
    function onHeightChange() {
      if (!lockAspect.checked || sourceFiles.length === 0) return;
      const h = clampInt(heightInput.value, 1, 100000);
      if (h == null) return;
      loadImageFromFile(sourceFiles[0]).then((img) => {
        const w = Math.max(1, Math.round((h * img.naturalWidth) / img.naturalHeight));
        widthInput.value = String(w);
      }).catch(() => {});
    }
    widthInput.addEventListener("input", onWidthChange);
    heightInput.addEventListener("input", onHeightChange);
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

  modeRadios.forEach((r) => r.addEventListener("change", updateModeUI));
  percentInput.addEventListener("input", resetOutputs);
  widthInput.addEventListener("input", resetOutputs);
  heightInput.addEventListener("input", resetOutputs);
  lockAspect.addEventListener("change", resetOutputs);
  resizeBtn.addEventListener("click", processBatch);
  clearBtn.addEventListener("click", () => resetAll(true));

  wireDropzone();
  wireAspectLock();
  resetAll(false);
})();
