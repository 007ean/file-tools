(() => {
  const countEl = document.getElementById("count");
  const generateBtn = document.getElementById("generateBtn");
  const copyBtn = document.getElementById("copyBtn");
  const clearBtn = document.getElementById("clearBtn");
  const output = document.getElementById("output");
  const statusEl = document.getElementById("status");
  const errorEl = document.getElementById("error");

  function setError(msg) { errorEl.style.display = msg ? "block" : "none"; errorEl.textContent = msg || ""; }
  function setStatus(msg) { statusEl.textContent = msg || ""; }

  function fallbackUuid() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
  }

  function makeUuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return fallbackUuid();
  }

  function generate() {
    setError("");
    setStatus("");
    const count = Math.max(1, Math.min(500, Number(countEl.value) || 1));
    const out = [];
    for (let i = 0; i < count; i++) out.push(makeUuid());
    output.value = out.join("\n");
    copyBtn.disabled = false;
    setStatus(`Generated ${count} UUID(s).`);
  }

  async function copyAll() {
    if (!output.value) return;
    try {
      await navigator.clipboard.writeText(output.value);
      setStatus("Copied.");
    } catch {
      setError("Clipboard copy failed.");
    }
  }

  function clearAll() {
    output.value = "";
    copyBtn.disabled = true;
    setError("");
    setStatus("");
  }

  generateBtn.addEventListener("click", generate);
  copyBtn.addEventListener("click", copyAll);
  clearBtn.addEventListener("click", clearAll);
})();
