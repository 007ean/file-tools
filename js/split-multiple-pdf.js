(() => {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const fileInfo = document.getElementById("fileInfo");
  const pageInfo = document.getElementById("pageInfo");
  const groupsInput = document.getElementById("groups");

  const splitBtn = document.getElementById("splitBtn");
  const zipBtn = document.getElementById("zipBtn");
  const clearBtn = document.getElementById("clearBtn");
  const statusEl = document.getElementById("status");
  const errorEl = document.getElementById("error");
  const downloadsEl = document.getElementById("downloads");

  const preview = window.FileTools?.createPdfPreview({ anchorEl: pageInfo, maxThumbs: 4 });
  const settingsStore = window.FileTools?.bindToolSettings("split-multiple-pdf", ["groups"]);

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
    downloadsEl.innerHTML = `<div class="hint">No outputs yet.</div>`;
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
    groupsInput.value = groupsInput.value || "";
    splitBtn.disabled = true;
    clearBtn.disabled = true;
    if (preview) preview.clear();
  }

  function parseSimpleRanges(input, maxPages) {
    const parts = String(input || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return { error: "Empty group." };
    const indices = new Set();
    for (const part of parts) {
      if (/^\d+$/.test(part)) {
        const p = Number(part);
        if (p < 1 || p > maxPages) return { error: `Page ${part} is out of range (1-${maxPages}).` };
        indices.add(p - 1);
        continue;
      }
      const m = part.match(/^(\d+)\s*-\s*(\d+)$/);
      if (!m) return { error: `Invalid token "${part}".` };
      let a = Number(m[1]);
      let b = Number(m[2]);
      if (a < 1 || b < 1 || a > maxPages || b > maxPages) {
        return { error: `Range ${part} is out of range (1-${maxPages}).` };
      }
      if (b < a) [a, b] = [b, a];
      for (let p = a; p <= b; p++) indices.add(p - 1);
    }
    const pages = Array.from(indices).sort((x, y) => x - y);
    if (!pages.length) return { error: "No pages selected." };
    return { pages };
  }

  function parseGroups(input, maxPages) {
    const groups = String(input || "").split(";").map((s) => s.trim()).filter(Boolean);
    if (!groups.length) return { error: "Enter at least one group, e.g. 1-3;4-6;7,9-10." };

    const parsedGroups = [];
    for (let i = 0; i < groups.length; i++) {
      const res = parseSimpleRanges(groups[i], maxPages);
      if (res.error) return { error: `Group ${i + 1}: ${res.error}` };
      parsedGroups.push(res.pages);
    }
    return { groups: parsedGroups };
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

    if (typeof PDFLib === "undefined" || !PDFLib.PDFDocument) {
      setError("PDF library failed to load. Refresh and try again.");
      return;
    }

    try {
      pdfFile = file;
      fileInfo.textContent = `${file.name} - ${humanBytes(file.size)}`;
      setStatus("Reading PDF...");
      pdfBytes = await file.arrayBuffer();
      const doc = await PDFLib.PDFDocument.load(pdfBytes);
      pageCount = doc.getPageCount();
      pageInfo.textContent = `Pages: ${pageCount}`;
      if (preview) preview.renderFromBytes(new Uint8Array(pdfBytes), pageCount);
      splitBtn.disabled = false;
      clearBtn.disabled = false;
      setStatus("Ready.");
    } catch (e) {
      console.error(e);
      setError(window.FileTools?.describePdfError(e, "read this PDF") || "Failed to read PDF.");
      setStatus("");
      resetAll(false);
    }
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
    meta.textContent = `${humanBytes(blob.size)} - application/pdf`;
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

  async function splitPdf() {
    setError("");
    setStatus("");
    resetDownloads();

    if (!pdfBytes || !pageCount) {
      setError("Please select a PDF first.");
      return;
    }

    const parsed = parseGroups(groupsInput.value, pageCount);
    if (parsed.error) {
      setError(parsed.error);
      return;
    }

    const groups = parsed.groups;
    downloadsEl.innerHTML = "";
    splitBtn.disabled = true;
    clearBtn.disabled = true;

    try {
      setStatus(`Splitting into ${groups.length} file(s)...`);
      const src = await PDFLib.PDFDocument.load(pdfBytes);
      const base = window.FileTools?.toSafeBaseName(pdfFile?.name || "document") || "document";
      const zip = window.JSZip ? new window.JSZip() : null;

      for (let i = 0; i < groups.length; i++) {
        setStatus(`Creating ${i + 1}/${groups.length}...`);
        const out = await PDFLib.PDFDocument.create();
        const copied = await out.copyPages(src, groups[i]);
        copied.forEach((p) => out.addPage(p));
        const outBytes = await out.save();
        const blob = new Blob([outBytes], { type: "application/pdf" });
        const filename = `${base}-part-${String(i + 1).padStart(2, "0")}.pdf`;
        addDownload(`Part ${i + 1}: ${groups[i].length} page(s)`, blob, filename);
        if (zip) zip.file(filename, blob);
      }

      if (zip) {
        setStatus("Preparing ZIP...");
        zipBlob = await zip.generateAsync({ type: "blob" });
        zipName = `${base}-split-parts.zip`;
        zipUrl = URL.createObjectURL(zipBlob);
        activeUrls.push(zipUrl);
        zipBtn.disabled = false;
      }
      setStatus("Done.");
    } catch (e) {
      console.error(e);
      setError(window.FileTools?.describePdfError(e, "split this PDF") || "Failed to split PDF.");
      setStatus("");
    } finally {
      splitBtn.disabled = !pdfBytes;
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
    a.download = zipName || "split-parts.zip";
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

  groupsInput.addEventListener("input", resetDownloads);
  splitBtn.addEventListener("click", splitPdf);
  zipBtn.addEventListener("click", downloadZip);
  clearBtn.addEventListener("click", () => resetAll(true));

  wireDropzone();
  resetAll(false);
})();
