// Confirm before any destructive form submit
document.addEventListener("submit", (e) => {
  const form = e.target;
  if (form.dataset.confirm) {
    if (!confirm(form.dataset.confirm)) {
      e.preventDefault();
    }
  }
});

// Auto-dismiss flash messages
const flash = document.querySelector(".flash");
if (flash) {
  setTimeout(() => {
    flash.style.transition = "opacity 0.4s";
    flash.style.opacity = "0";
    setTimeout(() => flash.remove(), 400);
  }, 4000);
}

// Live global search suggestions
const searchInput = document.querySelector(".global-search input");
if (searchInput) {
  let box = null;
  let timer = null;

  function closeBox() {
    if (box) { box.remove(); box = null; }
  }

  searchInput.addEventListener("input", () => {
    const q = searchInput.value.trim();
    clearTimeout(timer);
    if (q.length < 2) { closeBox(); return; }
    timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/search?q=" + encodeURIComponent(q));
        const data = await res.json();
        closeBox();
        box = document.createElement("div");
        box.className = "search-suggest";
        box.style.cssText = "position:absolute;top:44px;left:0;right:0;background:#fff;border:1px solid rgba(43,38,32,0.16);border-radius:12px;box-shadow:0 10px 30px rgba(43,38,32,0.15);max-height:360px;overflow-y:auto;z-index:20;";
        if (!data.results || !data.results.length) {
          box.innerHTML = '<div style="padding:12px 14px;font-size:13px;color:#9c9384;">No matches</div>';
        } else {
          box.innerHTML = data.results
            .map(
              (r) =>
                `<a href="${r.href}" style="display:block;padding:10px 14px;font-size:13px;color:#2b2620;border-bottom:1px solid rgba(43,38,32,0.06);">
                  <div style="font-weight:700;">${r.title}</div>
                  <div style="color:#9c9384;font-size:11.5px;text-transform:uppercase;letter-spacing:.03em;">${r.type}${r.subtitle ? " · " + r.subtitle : ""}</div>
                </a>`
            )
            .join("");
        }
        searchInput.parentElement.style.position = "relative";
        searchInput.parentElement.appendChild(box);
      } catch (err) {
        // silent
      }
    }, 220);
  });

  document.addEventListener("click", (e) => {
    if (box && !box.contains(e.target) && e.target !== searchInput) closeBox();
  });
}

// Backup restore: read the chosen file into the hidden field before submit
const importFile = document.getElementById("import-file");
if (importFile) {
  const importData = document.getElementById("import-data");
  const importSubmit = document.getElementById("import-submit");
  importFile.addEventListener("change", () => {
    const file = importFile.files[0];
    if (!file) {
      importSubmit.disabled = true;
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      importData.value = reader.result;
      importSubmit.disabled = false;
    };
    reader.readAsText(file);
  });
}

// Copy-to-clipboard helper (used on guest portal link list)
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-copy]");
  if (!btn) return;
  navigator.clipboard.writeText(btn.dataset.copy).then(() => {
    const old = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(() => (btn.textContent = old), 1200);
  });
});
