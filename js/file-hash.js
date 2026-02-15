(() => {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const fileInfo = document.getElementById("fileInfo");
  const hashBtn = document.getElementById("hashBtn");
  const clearBtn = document.getElementById("clearBtn");
  const statusEl = document.getElementById("status");
  const errorEl = document.getElementById("error");
  const sha256El = document.getElementById("sha256");
  const sha1El = document.getElementById("sha1");
  const md5El = document.getElementById("md5");
  const copySha256 = document.getElementById("copySha256");
  const copySha1 = document.getElementById("copySha1");
  const copyMd5 = document.getElementById("copyMd5");

  let file = null;
  let hashes = { sha256: "", sha1: "", md5: "" };

  function setError(msg) { errorEl.style.display = msg ? "block" : "none"; errorEl.textContent = msg || ""; }
  function setStatus(msg) { statusEl.textContent = msg || ""; }

  function toHex(buffer) {
    return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function clearHashes() {
    hashes = { sha256: "", sha1: "", md5: "" };
    sha256El.textContent = "";
    sha1El.textContent = "";
    md5El.textContent = "";
    copySha256.disabled = true;
    copySha1.disabled = true;
    copyMd5.disabled = true;
  }

  async function loadFile(picked) {
    setError("");
    setStatus("");
    clearHashes();
    if (!picked) return;
    file = picked;
    fileInfo.textContent = `${picked.name} - ${Math.round((picked.size || 0) / 1024)} KB`;
    hashBtn.disabled = false;
    clearBtn.disabled = false;
  }

  async function generate() {
    setError("");
    setStatus("Hashing...");
    clearHashes();

    if (!file) {
      setError("Choose a file first.");
      setStatus("");
      return;
    }

    try {
      const ab = await file.arrayBuffer();
      const sha256 = await crypto.subtle.digest("SHA-256", ab);
      const sha1 = await crypto.subtle.digest("SHA-1", ab);
      const md5 = window.SparkMD5 ? window.SparkMD5.ArrayBuffer.hash(ab) : "MD5 library missing";

      hashes.sha256 = toHex(sha256);
      hashes.sha1 = toHex(sha1);
      hashes.md5 = md5;
      sha256El.textContent = hashes.sha256;
      sha1El.textContent = hashes.sha1;
      md5El.textContent = hashes.md5;
      copySha256.disabled = false;
      copySha1.disabled = false;
      copyMd5.disabled = false;
      setStatus("Done.");
    } catch (e) {
      console.error(e);
      setError("Failed to hash this file.");
      setStatus("");
    }
  }

  async function copyText(text) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied.");
    } catch {
      setError("Clipboard copy failed in this browser.");
    }
  }

  function clearAll() {
    setError("");
    setStatus("");
    file = null;
    fileInfo.textContent = "";
    hashBtn.disabled = true;
    clearBtn.disabled = true;
    clearHashes();
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

  hashBtn.addEventListener("click", generate);
  clearBtn.addEventListener("click", clearAll);
  copySha256.addEventListener("click", () => copyText(hashes.sha256));
  copySha1.addEventListener("click", () => copyText(hashes.sha1));
  copyMd5.addEventListener("click", () => copyText(hashes.md5));
  wireDropzone();
})();
