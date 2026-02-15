(() => {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const fileInfo = document.getElementById("fileInfo");
  const pageInfo = document.getElementById("pageInfo");
  const scope = document.getElementById("scope");
  const rangesBox = document.getElementById("rangesBox");
  const rangesInput = document.getElementById("ranges");
  const extractBtn = document.getElementById("extractBtn");
  const zipBtn = document.getElementById("zipBtn");
  const clearBtn = document.getElementById("clearBtn");
  const statusEl = document.getElementById("status");
  const errorEl = document.getElementById("error");
  const downloadsEl = document.getElementById("downloads");

  const preview = window.FileTools?.createPdfPreview({ anchorEl: pageInfo, maxThumbs: 4 });
  const settingsStore = window.FileTools?.bindToolSettings("extract-images-pdf", ["scope", "ranges"]);

  let pdfFile = null;
  let pdfBytes = null;
  let pageCount = 0;
  let zipBlob = null;
  let zipUrl = null;
  let zipName = "";
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

  function resetDownloads() {
    activeUrls.forEach((u) => URL.revokeObjectURL(u));
    activeUrls = [];
    if (zipUrl) URL.revokeObjectURL(zipUrl);
    zipBlob = null;
    zipUrl = null;
    zipName = "";
    zipBtn.disabled = true;
    downloadsEl.innerHTML = `<div class="hint">No images extracted yet.</div>`;
  }

  function resetAll(resetSettings) {
    setError("");
    setStatus("");
    resetDownloads();
    pdfFile = null;
    pdfBytes = null;
    pageCount = 0;
    fileInfo.textContent = "";
    pageInfo.textContent = "";

    if (resetSettings && settingsStore) settingsStore.reset();
    scope.value = scope.value || "all";
    rangesBox.style.display = (scope.value === "ranges") ? "" : "none";

    extractBtn.disabled = true;
    clearBtn.disabled = true;
    if (preview) preview.clear();
  }

  function parseRanges(input, maxPages) {
    const raw = String(input || "").trim();
    if (!raw) return { error: "Enter page ranges, for example 1-3,5,8-10." };
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return { error: "Enter page ranges, for example 1-3,5,8-10." };
    const out = new Set();
    for (const part of parts) {
      if (/^\d+$/.test(part)) {
        const p = Number(part);
        if (p < 1 || p > maxPages) return { error: `Page ${part} is out of range (1-${maxPages}).` };
        out.add(p - 1);
        continue;
      }
      const m = part.match(/^(\d+)\s*-\s*(\d+)$/);
      if (!m) return { error: `Invalid token: "${part}".` };
      let a = Number(m[1]);
      let b = Number(m[2]);
      if (a < 1 || b < 1 || a > maxPages || b > maxPages) return { error: `Range ${part} is out of range.` };
      if (b < a) [a, b] = [b, a];
      for (let p = a; p <= b; p++) out.add(p - 1);
    }
    const pages = Array.from(out).sort((x, y) => x - y);
    if (!pages.length) return { error: "No pages selected." };
    return { pages };
  }

  function getTargetPages() {
    if (scope.value === "all") {
      return { pages: Array.from({ length: pageCount }, (_, i) => i) };
    }
    return parseRanges(rangesInput.value, pageCount);
  }

  async function ensurePdfJsReady() {
    if (window.FileTools?.ensurePdfJs) return window.FileTools.ensurePdfJs();
    if (window.pdfjsLib && window.pdfjsLib.getDocument) return window.pdfjsLib;
    throw new Error("pdf.js not available");
  }

  async function loadPdf(file) {
    setError("");
    setStatus("");
    resetDownloads();
    if (!file) return;
    const isPdf = file.type === "application/pdf" || String(file.name || "").toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setError(window.FileTools?.describeFileTypeError(file, "PDF file") || "Please select a PDF file.");
      return;
    }
    try {
      await ensurePdfJsReady();
      pdfFile = file;
      pdfBytes = new Uint8Array(await file.arrayBuffer());
      fileInfo.textContent = `${file.name} - ${humanBytes(file.size)}`;
      setStatus("Reading PDF...");
      const task = window.pdfjsLib.getDocument({ data: pdfBytes });
      const pdf = await task.promise;
      pageCount = pdf.numPages;
      pageInfo.textContent = `Pages: ${pageCount}`;
      if (preview) preview.renderFromBytes(pdfBytes, pageCount);
      extractBtn.disabled = false;
      clearBtn.disabled = false;
      setStatus("Ready.");
    } catch (e) {
      console.error(e);
      setError(window.FileTools?.describePdfError(e, "read this PDF") || "Failed to read PDF.");
      setStatus("");
      resetAll(false);
    }
  }

  async function imageToBlob(imageLike) {
    if (!imageLike || !imageLike.width || !imageLike.height || !imageLike.data) return null;
    const width = imageLike.width;
    const height = imageLike.height;
    const src = imageLike.data;
    const expectedRGBA = width * height * 4;
    const expectedRGB = width * height * 3;
    const expectedGray = width * height;

    let rgba;
    if (src.length === expectedRGBA) {
      rgba = src;
    } else if (src.length === expectedRGB) {
      rgba = new Uint8ClampedArray(expectedRGBA);
      for (let i = 0, j = 0; i < src.length; i += 3, j += 4) {
        rgba[j] = src[i];
        rgba[j + 1] = src[i + 1];
        rgba[j + 2] = src[i + 2];
        rgba[j + 3] = 255;
      }
    } else if (src.length === expectedGray) {
      rgba = new Uint8ClampedArray(expectedRGBA);
      for (let i = 0, j = 0; i < src.length; i += 1, j += 4) {
        const v = src[i];
        rgba[j] = v;
        rgba[j + 1] = v;
        rgba[j + 2] = v;
        rgba[j + 3] = 255;
      }
    } else {
      return null;
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    const imageData = ctx.createImageData(width, height);
    imageData.data.set(rgba);
    ctx.putImageData(imageData, 0, 0);
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
  }

  function addDownload(name, blob, filename) {
    const url = URL.createObjectURL(blob);
    activeUrls.push(url);

    const row = document.createElement("div");
    row.className = "item";
    const left = document.createElement("div");
    left.className = "item-left";
    const n = document.createElement("div");
    n.className = "item-name";
    n.textContent = name;
    const meta = document.createElement("div");
    meta.className = "item-meta";
    meta.textContent = `${humanBytes(blob.size)} - image/png`;
    left.appendChild(n);
    left.appendChild(meta);

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

    row.appendChild(left);
    row.appendChild(actions);
    downloadsEl.appendChild(row);
  }

  function getXObjectImage(page, name) {
    return new Promise((resolve) => {
      try {
        page.objs.get(name, (obj) => resolve(obj || null));
      } catch {
        resolve(null);
      }
    });
  }

  async function extractImages() {
    setError("");
    setStatus("");
    resetDownloads();

    if (!pdfBytes || !pageCount) {
      setError("Please select a PDF first.");
      return;
    }

    const target = getTargetPages();
    if (target.error) {
      setError(target.error);
      return;
    }

    extractBtn.disabled = true;
    clearBtn.disabled = true;
    downloadsEl.innerHTML = "";

    try {
      const pdfjs = await ensurePdfJsReady();
      const task = pdfjs.getDocument({ data: pdfBytes });
      const pdf = await task.promise;
      const zip = window.JSZip ? new window.JSZip() : null;
      const base = window.FileTools?.toSafeBaseName(pdfFile?.name || "document") || "document";
      let totalImages = 0;

      for (let i = 0; i < target.pages.length; i++) {
        const pageNum = target.pages[i] + 1;
        setStatus(`Scanning page ${pageNum} (${i + 1}/${target.pages.length})...`);
        const page = await pdf.getPage(pageNum);
        const opList = await page.getOperatorList();
        const entries = [];
        const seenXObj = new Set();

        for (let j = 0; j < opList.fnArray.length; j++) {
          const fn = opList.fnArray[j];
          const args = opList.argsArray[j];
          if (fn === pdfjs.OPS.paintImageXObject) {
            const name = args && args[0];
            if (name && !seenXObj.has(name)) {
              seenXObj.add(name);
              entries.push({ type: "xobj", name });
            }
          } else if (fn === pdfjs.OPS.paintInlineImageXObject) {
            const inline = args && args[0];
            if (inline) entries.push({ type: "inline", data: inline });
          }
        }

        let pageImageIndex = 0;
        for (const entry of entries) {
          let imgObj = null;
          if (entry.type === "xobj") {
            imgObj = await getXObjectImage(page, entry.name);
          } else {
            imgObj = entry.data;
          }
          const blob = await imageToBlob(imgObj);
          if (!blob) continue;

          pageImageIndex += 1;
          totalImages += 1;
          const filename = `${base}-page-${String(pageNum).padStart(3, "0")}-img-${String(pageImageIndex).padStart(2, "0")}.png`;
          addDownload(`Page ${pageNum} - Image ${pageImageIndex}`, blob, filename);
          if (zip) zip.file(filename, blob);
        }
      }

      if (!totalImages) {
        setStatus("No extractable embedded images found in selected pages.");
        return;
      }

      if (zip) {
        setStatus("Preparing ZIP...");
        zipBlob = await zip.generateAsync({ type: "blob" });
        zipName = `${base}-extracted-images.zip`;
        zipUrl = URL.createObjectURL(zipBlob);
        activeUrls.push(zipUrl);
        zipBtn.disabled = false;
      }
      setStatus(`Done. Extracted ${totalImages} image(s).`);
    } catch (e) {
      console.error(e);
      setError(window.FileTools?.describePdfError(e, "extract images") || "Failed to extract images.");
      setStatus("");
    } finally {
      extractBtn.disabled = !pdfBytes;
      clearBtn.disabled = !pdfBytes;
    }
  }

  function downloadZip() {
    setError("");
    if (!zipBlob || !zipUrl) {
      setError("No ZIP is ready yet.");
      return;
    }
    const a = document.createElement("a");
    a.href = zipUrl;
    a.download = zipName || "extracted-images.zip";
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
      const picked = fileInput.files && fileInput.files[0];
      if (picked) loadPdf(picked);
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
      const dropped = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (dropped) loadPdf(dropped);
    });
  }

  scope.addEventListener("change", () => {
    rangesBox.style.display = (scope.value === "ranges") ? "" : "none";
    resetDownloads();
  });
  rangesInput.addEventListener("input", resetDownloads);
  extractBtn.addEventListener("click", extractImages);
  zipBtn.addEventListener("click", downloadZip);
  clearBtn.addEventListener("click", () => resetAll(true));

  wireDropzone();
  resetAll(false);
})();
