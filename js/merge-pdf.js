(() => {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const fileInfo = document.getElementById("fileInfo");

  const listEl = document.getElementById("list");

  const mergeBtn = document.getElementById("mergeBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const clearBtn = document.getElementById("clearBtn");

  const statusEl = document.getElementById("status");
  const errorEl = document.getElementById("error");

  let files = []; // Array<File>
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

  function resetOutput() {
    outputBlob = null;
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    outputUrl = null;
    downloadBtn.disabled = true;
  }

  function updateButtons() {
    const hasFiles = files.length > 0;
    mergeBtn.disabled = !hasFiles;
    clearBtn.disabled = !hasFiles;
    if (!outputBlob) downloadBtn.disabled = true;
  }

  function renderList() {
    listEl.innerHTML = "";

    if (files.length === 0) {
      listEl.innerHTML = `<div class="hint">No files added yet.</div>`;
      fileInfo.textContent = "";
      updateButtons();
      return;
    }

    const totalBytes = files.reduce((s, f) => s + (f.size || 0), 0);
    fileInfo.textContent = `${files.length} file(s) • ${humanBytes(totalBytes)}`;

    files.forEach((file, idx) => {
      const row = document.createElement("div");
      row.className = "item";

      const left = document.createElement("div");
      left.className = "item-left";

      const name = document.createElement("div");
      name.className = "item-name";
      name.textContent = file.name || `PDF ${idx + 1}`;

      const meta = document.createElement("div");
      meta.className = "item-meta";
      meta.textContent = `${humanBytes(file.size)} • ${file.type || "application/pdf"}`;

      left.appendChild(name);
      left.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "item-actions";

      const up = document.createElement("button");
      up.textContent = "↑";
      up.disabled = idx === 0;
      up.addEventListener("click", () => {
        resetOutput();
        const tmp = files[idx - 1];
        files[idx - 1] = files[idx];
        files[idx] = tmp;
        renderList();
      });

      const down = document.createElement("button");
      down.textContent = "↓";
      down.disabled = idx === files.length - 1;
      down.addEventListener("click", () => {
        resetOutput();
        const tmp = files[idx + 1];
        files[idx + 1] = files[idx];
        files[idx] = tmp;
        renderList();
      });

      const remove = document.createElement("button");
      remove.textContent = "Remove";
      remove.addEventListener("click", () => {
        resetOutput();
        files.splice(idx, 1);
        renderList();
      });

      actions.appendChild(up);
      actions.appendChild(down);
      actions.appendChild(remove);

      row.appendChild(left);
      row.appendChild(actions);

      listEl.appendChild(row);
    });

    updateButtons();
  }

  function addFiles(newFiles) {
    setError("");
    setStatus("");
    resetOutput();

    const incoming = Array.from(newFiles || []);
    const pdfs = incoming.filter(f => (f.type === "application/pdf") || (String(f.name || "").toLowerCase().endsWith(".pdf")));

    if (pdfs.length === 0) {
      setError("Please add PDF files only.");
      return;
    }

    // Append
    files = files.concat(pdfs);
    renderList();
  }

  async function mergePdfs() {
    setError("");
    setStatus("");
    resetOutput();

    if (typeof PDFLib === "undefined" || !PDFLib.PDFDocument) {
      setError("PDF library failed to load. Refresh the page and try again.");
      return;
    }

    if (files.length < 1) {
      setError("Add at least one PDF.");
      return;
    }

    setStatus("Merging…");

    try {
      const merged = await PDFLib.PDFDocument.create();

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setStatus(`Reading ${i + 1}/${files.length}: ${f.name}`);

        const bytes = await f.arrayBuffer();
        const src = await PDFLib.PDFDocument.load(bytes);

        const pageIndices = src.getPageIndices();
        const copied = await merged.copyPages(src, pageIndices);
        copied.forEach(p => merged.addPage(p));
      }

      setStatus("Saving…");
      const outBytes = await merged.save();
      outputBlob = new Blob([outBytes], { type: "application/pdf" });

      outputUrl = URL.createObjectURL(outputBlob);
      downloadBtn.disabled = false;
      setStatus("Done.");
    } catch (e) {
      console.error(e);
      setError("Failed to merge PDFs. One of the files may be encrypted or corrupted.");
      setStatus("");
    }
  }

  function downloadMerged() {
    setError("");
    if (!outputUrl || !outputBlob) {
      setError("Nothing to download yet.");
      return;
    }

    const filename = `merged-${Date.now()}.pdf`;
    const a = document.createElement("a");
    a.href = outputUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function clearAll() {
    setError("");
    setStatus("");
    resetOutput();
    files = [];
    renderList();
  }

  // Dropzone wiring
  function wireDropzone() {
    dropzone.addEventListener("click", () => fileInput.click());
    dropzone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fileInput.click();
      }
    });

    fileInput.addEventListener("change", () => {
      const picked = fileInput.files;
      if (picked && picked.length) addFiles(picked);
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
      const dropped = e.dataTransfer && e.dataTransfer.files;
      if (dropped && dropped.length) addFiles(dropped);
    });
  }

  mergeBtn.addEventListener("click", mergePdfs);
  downloadBtn.addEventListener("click", downloadMerged);
  clearBtn.addEventListener("click", clearAll);

  wireDropzone();
  renderList();
})();
