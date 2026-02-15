(() => {
  const textInput = document.getElementById("textInput");
  const textOutput = document.getElementById("textOutput");
  const encodeTextBtn = document.getElementById("encodeTextBtn");
  const decodeTextBtn = document.getElementById("decodeTextBtn");
  const copyTextBtn = document.getElementById("copyTextBtn");
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const fileInfo = document.getElementById("fileInfo");
  const encodeFileBtn = document.getElementById("encodeFileBtn");
  const copyFileB64Btn = document.getElementById("copyFileB64Btn");
  const decodeName = document.getElementById("decodeName");
  const decodeType = document.getElementById("decodeType");
  const decodeFileBtn = document.getElementById("decodeFileBtn");
  const statusEl = document.getElementById("status");
  const errorEl = document.getElementById("error");

  let file = null;
  let fileBase64 = "";

  function setError(msg) { errorEl.style.display = msg ? "block" : "none"; errorEl.textContent = msg || ""; }
  function setStatus(msg) { statusEl.textContent = msg || ""; }

  function bytesToBase64(bytes) {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function base64ToBytes(base64) {
    const clean = base64.replace(/\s+/g, "");
    const binary = atob(clean);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  }

  function encodeText() {
    setError("");
    setStatus("");
    try {
      const raw = textInput.value || "";
      const bytes = new TextEncoder().encode(raw);
      textOutput.value = bytesToBase64(bytes);
      copyTextBtn.disabled = false;
      setStatus("Encoded text.");
    } catch {
      setError("Text encode failed.");
    }
  }

  function decodeText() {
    setError("");
    setStatus("");
    try {
      const bytes = base64ToBytes(textInput.value || "");
      textOutput.value = new TextDecoder().decode(bytes);
      copyTextBtn.disabled = false;
      setStatus("Decoded text.");
    } catch {
      textOutput.value = "";
      copyTextBtn.disabled = true;
      setError("Invalid Base64 input.");
    }
  }

  async function copyTextOutput() {
    if (!textOutput.value) return;
    try {
      await navigator.clipboard.writeText(textOutput.value);
      setStatus("Copied.");
    } catch {
      setError("Clipboard copy failed.");
    }
  }

  async function loadFile(picked) {
    setError("");
    setStatus("");
    fileBase64 = "";
    copyFileB64Btn.disabled = true;
    if (!picked) return;
    file = picked;
    fileInfo.textContent = `${picked.name} - ${Math.round((picked.size || 0) / 1024)} KB`;
    encodeFileBtn.disabled = false;
  }

  async function encodeFile() {
    setError("");
    setStatus("Encoding file...");
    if (!file) {
      setError("Choose a file first.");
      setStatus("");
      return;
    }
    try {
      const ab = await file.arrayBuffer();
      fileBase64 = bytesToBase64(new Uint8Array(ab));
      textOutput.value = fileBase64;
      copyFileB64Btn.disabled = false;
      copyTextBtn.disabled = false;
      setStatus("File encoded.");
    } catch {
      setError("File encode failed.");
      setStatus("");
    }
  }

  async function copyFileBase64() {
    if (!fileBase64) return;
    try {
      await navigator.clipboard.writeText(fileBase64);
      setStatus("Copied.");
    } catch {
      setError("Clipboard copy failed.");
    }
  }

  function decodeFile() {
    setError("");
    setStatus("");
    try {
      const bytes = base64ToBytes(textInput.value || "");
      const blob = new Blob([bytes], { type: decodeType.value || "application/octet-stream" });
      const name = (decodeName.value || "decoded.bin").trim();
      window.FileTools?.triggerBlobDownload(blob, name);
      setStatus("Decoded file downloaded.");
    } catch {
      setError("Invalid Base64 input.");
    }
  }

  function wireDropzone() {
    dropzone.addEventListener("click", () => fileInput.click());
    dropzone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
    });
    fileInput.addEventListener("change", () => {
      const picked = fileInput.files?.[0];
      if (picked) loadFile(picked);
      fileInput.value = "";
    });
    ["dragenter", "dragover"].forEach((evt) => {
      dropzone.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); dropzone.style.borderColor = "#bbb"; });
    });
    ["dragleave", "drop"].forEach((evt) => {
      dropzone.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); dropzone.style.borderColor = "#ddd"; });
    });
    dropzone.addEventListener("drop", (e) => {
      const picked = e.dataTransfer?.files?.[0];
      if (picked) loadFile(picked);
    });
  }

  encodeTextBtn.addEventListener("click", encodeText);
  decodeTextBtn.addEventListener("click", decodeText);
  copyTextBtn.addEventListener("click", copyTextOutput);
  encodeFileBtn.addEventListener("click", encodeFile);
  copyFileB64Btn.addEventListener("click", copyFileBase64);
  decodeFileBtn.addEventListener("click", decodeFile);
  wireDropzone();
})();
