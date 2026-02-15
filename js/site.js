(() => {
  const PDFJS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.6.347/pdf.min.js";
  const PDFJS_WORKER_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.6.347/pdf.worker.min.js";

  function toSafeBaseName(name) {
    const raw = String(name || "file").trim();
    const noExt = raw.replace(/\.[a-z0-9]+$/i, "");
    const clean = noExt.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    return clean || "file";
  }

  function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function makeDownloadName(baseName, action, ext) {
    const safeBase = toSafeBaseName(baseName || "file");
    const safeAction = String(action || "output").replace(/[^a-zA-Z0-9._-]+/g, "-");
    const safeExt = String(ext || "").replace(/[^a-zA-Z0-9]+/g, "");
    return safeExt ? `${safeBase}-${safeAction}.${safeExt}` : `${safeBase}-${safeAction}`;
  }

  function describeFileTypeError(file, expectedLabel) {
    const fileName = file?.name || "selected file";
    return `Unsupported file: "${fileName}". Please choose a valid ${expectedLabel}.`;
  }

  function describePdfError(err, phase) {
    const msg = String(err?.message || err || "").toLowerCase();
    const during = phase ? ` while trying to ${phase}` : "";

    if (msg.includes("password") || msg.includes("encrypted") || msg.includes("encryption")) {
      return `This PDF appears to be password-protected or encrypted${during}. Remove protection, then try again.`;
    }
    if (msg.includes("invalid pdf") || msg.includes("failed to parse") || msg.includes("malformed")) {
      return `This PDF looks malformed or unsupported${during}. Try opening and re-saving it in a PDF editor, then retry.`;
    }
    return `Could not process this PDF${during}. It may be encrypted, malformed, or unsupported by this browser.`;
  }

  function bindToolSettings(toolKey, elementIds) {
    if (!toolKey || !Array.isArray(elementIds)) {
      return { reset: () => {} };
    }

    const storageKey = `file-tools:${toolKey}:settings`;
    const controls = elementIds
      .map((id) => document.getElementById(id))
      .filter(Boolean);

    const defaults = {};
    controls.forEach((el) => {
      const value = (el.type === "checkbox") ? !!el.checked : String(el.value ?? "");
      defaults[el.id] = value;
    });

    function readSaved() {
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }

    function saveCurrent() {
      const payload = {};
      controls.forEach((el) => {
        payload[el.id] = (el.type === "checkbox") ? !!el.checked : String(el.value ?? "");
      });
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(payload));
      } catch {
        // Ignore storage write failures.
      }
    }

    function applyState(stateObj) {
      if (!stateObj || typeof stateObj !== "object") return;
      controls.forEach((el) => {
        if (!Object.prototype.hasOwnProperty.call(stateObj, el.id)) return;
        if (el.type === "checkbox") {
          el.checked = !!stateObj[el.id];
        } else {
          el.value = String(stateObj[el.id] ?? "");
        }
      });
    }

    applyState(readSaved());

    controls.forEach((el) => {
      const handler = () => saveCurrent();
      el.addEventListener("input", handler);
      el.addEventListener("change", handler);
    });

    return {
      reset() {
        applyState(defaults);
        try {
          window.localStorage.removeItem(storageKey);
        } catch {
          // Ignore storage failures.
        }
      },
      save: saveCurrent,
    };
  }

  let pdfJsPromise = null;
  function ensurePdfJs() {
    if (window.pdfjsLib && window.pdfjsLib.getDocument) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN;
      return Promise.resolve(window.pdfjsLib);
    }
    if (pdfJsPromise) return pdfJsPromise;

    pdfJsPromise = new Promise((resolve, reject) => {
      const existing = Array.from(document.scripts).find((s) => s.src === PDFJS_CDN);
      if (existing) {
        existing.addEventListener("load", () => {
          if (!window.pdfjsLib) return reject(new Error("pdf.js failed to initialize"));
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN;
          resolve(window.pdfjsLib);
        }, { once: true });
        existing.addEventListener("error", () => reject(new Error("pdf.js failed to load")), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = PDFJS_CDN;
      script.async = true;
      script.onload = () => {
        if (!window.pdfjsLib) return reject(new Error("pdf.js failed to initialize"));
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN;
        resolve(window.pdfjsLib);
      };
      script.onerror = () => reject(new Error("pdf.js failed to load"));
      document.head.appendChild(script);
    });

    return pdfJsPromise;
  }

  function createPdfPreview(opts) {
    const anchorEl = opts?.anchorEl || null;
    const maxThumbs = Number(opts?.maxThumbs || 4);

    let host = document.getElementById("pdfPreview");
    if (!host) {
      host = document.createElement("div");
      host.id = "pdfPreview";
      host.className = "pdf-preview";
      host.innerHTML = `<div class="hint">No preview yet.</div>`;
      if (anchorEl && anchorEl.parentNode) {
        anchorEl.parentNode.insertBefore(host, anchorEl.nextSibling);
      }
    }

    function clear() {
      host.innerHTML = `<div class="hint">No preview yet.</div>`;
    }

    async function renderFromBytes(pdfBytes, pageCountHint) {
      if (!pdfBytes || !host) {
        clear();
        return;
      }

      host.innerHTML = `<div class="hint">Rendering preview...</div>`;
      try {
        const pdfjsLib = await ensurePdfJs();
        const data = (pdfBytes instanceof Uint8Array) ? pdfBytes : new Uint8Array(pdfBytes);
        const task = pdfjsLib.getDocument({ data });
        const pdf = await task.promise;
        const pageCount = Number(pageCountHint || pdf.numPages || 0);
        const count = Math.max(0, Math.min(maxThumbs, pageCount || pdf.numPages));

        host.innerHTML = "";
        const strip = document.createElement("div");
        strip.className = "thumb-strip";

        for (let i = 1; i <= count; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 0.23 });

          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.className = "pdf-thumb-canvas";

          await page.render({
            canvasContext: canvas.getContext("2d"),
            viewport,
          }).promise;

          const cell = document.createElement("div");
          cell.className = "thumb";
          cell.appendChild(canvas);

          const cap = document.createElement("div");
          cap.className = "thumb-cap";
          cap.textContent = `Page ${i}`;
          cell.appendChild(cap);
          strip.appendChild(cell);
        }

        host.appendChild(strip);
        if (pageCount > count) {
          const note = document.createElement("div");
          note.className = "hint";
          note.style.marginTop = "8px";
          note.textContent = `Showing ${count} of ${pageCount} pages.`;
          host.appendChild(note);
        }
      } catch (e) {
        host.innerHTML = `<div class="hint">Preview unavailable for this PDF.</div>`;
      }
    }

    return { clear, renderFromBytes };
  }

  window.FileTools = {
    toSafeBaseName,
    triggerBlobDownload,
    makeDownloadName,
    describeFileTypeError,
    describePdfError,
    bindToolSettings,
    ensurePdfJs,
    createPdfPreview,
  };
})();
