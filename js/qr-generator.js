(() => {
  const input = document.getElementById("input");
  const sizeEl = document.getElementById("size");
  const generateBtn = document.getElementById("generateBtn");
  const downloadPngBtn = document.getElementById("downloadPngBtn");
  const downloadSvgBtn = document.getElementById("downloadSvgBtn");
  const preview = document.getElementById("preview");
  const statusEl = document.getElementById("status");
  const errorEl = document.getElementById("error");

  let pngDataUrl = "";
  let svgText = "";

  function setError(msg) { errorEl.style.display = msg ? "block" : "none"; errorEl.textContent = msg || ""; }
  function setStatus(msg) { statusEl.textContent = msg || ""; }

  function clearOutput() {
    pngDataUrl = "";
    svgText = "";
    preview.style.display = "none";
    preview.removeAttribute("src");
    downloadPngBtn.disabled = true;
    downloadSvgBtn.disabled = true;
  }

  async function generate() {
    setError("");
    setStatus("");
    clearOutput();

    const text = String(input.value || "").trim();
    if (!text) {
      setError("Enter text or URL.");
      return;
    }

    const size = Math.max(100, Math.min(2000, Number(sizeEl.value) || 320));

    try {
      pngDataUrl = await window.QRCode.toDataURL(text, {
        width: size,
        margin: 2,
        errorCorrectionLevel: "M",
      });
      svgText = await window.QRCode.toString(text, {
        type: "svg",
        margin: 2,
        width: size,
        errorCorrectionLevel: "M",
      });
      preview.src = pngDataUrl;
      preview.style.display = "";
      downloadPngBtn.disabled = false;
      downloadSvgBtn.disabled = false;
      setStatus("Done.");
    } catch (e) {
      console.error(e);
      setError("Failed to generate QR code.");
    }
  }

  function downloadPng() {
    if (!pngDataUrl) return;
    const a = document.createElement("a");
    a.href = pngDataUrl;
    a.download = "qr-code.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function downloadSvg() {
    if (!svgText) return;
    const blob = new Blob([svgText], { type: "image/svg+xml" });
    window.FileTools?.triggerBlobDownload(blob, "qr-code.svg");
  }

  sizeEl.addEventListener("input", clearOutput);
  input.addEventListener("input", clearOutput);
  generateBtn.addEventListener("click", generate);
  downloadPngBtn.addEventListener("click", downloadPng);
  downloadSvgBtn.addEventListener("click", downloadSvg);
})();
