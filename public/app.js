// Confirm before any destructive form submit, using a custom in-page modal
// rather than window.confirm(). Browsers permanently mute repeated native
// dialogs after a few dismissals on the same page — after that, confirm()
// returns false with no visible popup at all, so the submit is silently
// blocked and the button just looks broken.
function showConfirmModal(message, onConfirm) {
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(43,38,32,0.45);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;";
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:14px;padding:22px 24px;max-width:380px;box-shadow:0 20px 50px rgba(0,0,0,0.25);">
      <p style="margin:0 0 18px;color:#2b2620;font-size:14px;line-height:1.5;"></p>
      <div style="display:flex;justify-content:flex-end;gap:10px;">
        <button type="button" class="btn btn-secondary btn-sm" data-role="cancel">Cancel</button>
        <button type="button" class="btn btn-danger btn-sm" data-role="ok">Confirm</button>
      </div>
    </div>`;
  overlay.querySelector("p").textContent = message;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('[data-role="cancel"]').addEventListener("click", close);
  overlay.querySelector('[data-role="ok"]').addEventListener("click", () => {
    close();
    onConfirm();
  });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
}

document.addEventListener("submit", (e) => {
  const form = e.target;
  // A submit button can carry its own data-confirm (e.g. a "Delete" button
  // using formaction to repurpose a shared form) instead of the form itself.
  const message = e.submitter?.dataset.confirm || form.dataset.confirm;
  if (message && !form.dataset.confirmed) {
    e.preventDefault();
    showConfirmModal(message, () => {
      form.dataset.confirmed = "1";
      if (form.requestSubmit) form.requestSubmit(e.submitter);
      else form.submit();
    });
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

// Backup restore: read the chosen file into the hidden field before submit.
// Requires both a file and the explicit checkbox, since some browsers mute
// repeated confirm() popups after a few dismissals — a silent form.confirm()
// block would look exactly like the button doing nothing.
const importFile = document.getElementById("import-file");
if (importFile) {
  const importData = document.getElementById("import-data");
  const importConfirm = document.getElementById("import-confirm");
  const importSubmit = document.getElementById("import-submit");
  let fileLoaded = false;

  function updateImportSubmit() {
    importSubmit.disabled = !(fileLoaded && importConfirm.checked);
  }

  importFile.addEventListener("change", () => {
    const file = importFile.files[0];
    fileLoaded = false;
    updateImportSubmit();
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      importData.value = reader.result;
      fileLoaded = true;
      updateImportSubmit();
    };
    reader.readAsText(file);
  });
  importConfirm.addEventListener("change", updateImportSubmit);
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
