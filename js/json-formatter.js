(() => {
  const input = document.getElementById("input");
  const output = document.getElementById("output");
  const validateBtn = document.getElementById("validateBtn");
  const minifyBtn = document.getElementById("minifyBtn");
  const clearBtn = document.getElementById("clearBtn");
  const copyBtn = document.getElementById("copyBtn");
  const statusEl = document.getElementById("status");
  const errorEl = document.getElementById("error");

  function setError(msg) { errorEl.style.display = msg ? "block" : "none"; errorEl.textContent = msg || ""; }
  function setStatus(msg) { statusEl.textContent = msg || ""; }

  function parseJson() {
    const raw = String(input.value || "").trim();
    if (!raw) throw new Error("Paste JSON first.");
    return JSON.parse(raw);
  }

  function doPretty() {
    setError("");
    setStatus("");
    try {
      const obj = parseJson();
      output.value = JSON.stringify(obj, null, 2);
      copyBtn.disabled = false;
      setStatus("Valid JSON.");
    } catch (e) {
      output.value = "";
      copyBtn.disabled = true;
      setError(`Invalid JSON: ${e.message || e}`);
    }
  }

  function doMinify() {
    setError("");
    setStatus("");
    try {
      const obj = parseJson();
      output.value = JSON.stringify(obj);
      copyBtn.disabled = false;
      setStatus("Valid JSON.");
    } catch (e) {
      output.value = "";
      copyBtn.disabled = true;
      setError(`Invalid JSON: ${e.message || e}`);
    }
  }

  async function copyOutput() {
    if (!output.value) return;
    try {
      await navigator.clipboard.writeText(output.value);
      setStatus("Copied.");
    } catch {
      setError("Clipboard copy failed.");
    }
  }

  function clearAll() {
    input.value = "";
    output.value = "";
    setError("");
    setStatus("");
    copyBtn.disabled = true;
  }

  validateBtn.addEventListener("click", doPretty);
  minifyBtn.addEventListener("click", doMinify);
  clearBtn.addEventListener("click", clearAll);
  copyBtn.addEventListener("click", copyOutput);
})();
