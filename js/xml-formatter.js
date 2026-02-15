(() => {
  const input = document.getElementById("input");
  const output = document.getElementById("output");
  const formatBtn = document.getElementById("formatBtn");
  const clearBtn = document.getElementById("clearBtn");
  const copyBtn = document.getElementById("copyBtn");
  const statusEl = document.getElementById("status");
  const errorEl = document.getElementById("error");

  function setError(msg) { errorEl.style.display = msg ? "block" : "none"; errorEl.textContent = msg || ""; }
  function setStatus(msg) { statusEl.textContent = msg || ""; }

  function formatNode(node, indent = 0) {
    const pad = "  ".repeat(indent);
    const lines = [];

    if (node.nodeType === Node.ELEMENT_NODE) {
      const attrs = Array.from(node.attributes || []).map((a) => `${a.name}="${a.value}"`).join(" ");
      const open = attrs ? `<${node.nodeName} ${attrs}>` : `<${node.nodeName}>`;
      const children = Array.from(node.childNodes || []);
      const textOnly = children.every((c) => c.nodeType === Node.TEXT_NODE && !c.nodeValue.trim()) ||
        (children.length === 1 && children[0].nodeType === Node.TEXT_NODE);

      if (children.length === 0) {
        lines.push(`${pad}${open.replace(/>$/, " />")}`);
      } else if (textOnly) {
        const txt = children.map((c) => c.nodeValue || "").join("").trim();
        lines.push(`${pad}${open}${txt}</${node.nodeName}>`);
      } else {
        lines.push(`${pad}${open}`);
        for (const child of children) {
          if (child.nodeType === Node.TEXT_NODE && !child.nodeValue.trim()) continue;
          lines.push(formatNode(child, indent + 1));
        }
        lines.push(`${pad}</${node.nodeName}>`);
      }
    } else if (node.nodeType === Node.TEXT_NODE) {
      const txt = (node.nodeValue || "").trim();
      if (txt) lines.push(`${pad}${txt}`);
    } else if (node.nodeType === Node.CDATA_SECTION_NODE) {
      lines.push(`${pad}<![CDATA[${node.nodeValue || ""}]]>`);
    } else if (node.nodeType === Node.COMMENT_NODE) {
      lines.push(`${pad}<!--${node.nodeValue || ""}-->`);
    }

    return lines.join("\n");
  }

  function formatXml() {
    setError("");
    setStatus("");
    const raw = String(input.value || "").trim();
    if (!raw) {
      setError("Paste XML first.");
      output.value = "";
      copyBtn.disabled = true;
      return;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(raw, "application/xml");
    const parserError = doc.querySelector("parsererror");
    if (parserError) {
      setError(`Invalid XML: ${parserError.textContent.trim()}`);
      output.value = "";
      copyBtn.disabled = true;
      return;
    }

    const root = doc.documentElement;
    const decl = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>";
    output.value = `${decl}\n${formatNode(root, 0)}`;
    copyBtn.disabled = false;
    setStatus("Valid XML.");
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

  formatBtn.addEventListener("click", formatXml);
  clearBtn.addEventListener("click", clearAll);
  copyBtn.addEventListener("click", copyOutput);
})();
