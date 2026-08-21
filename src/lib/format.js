const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const inrNumberFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function formatINR(n) {
  const num = Number(n) || 0;
  return inrFormatter.format(num);
}

export function formatNumber(n) {
  return inrNumberFormatter.format(Number(n) || 0);
}

export function formatDate(d) {
  if (!d) return "—";
  try {
    const date = new Date(d.length === 10 ? d + "T00:00:00" : d);
    if (Number.isNaN(date.getTime())) return d;
    return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return d;
  }
}

export function formatDateTime(d) {
  if (!d) return "—";
  try {
    const date = new Date(d.includes(" ") && !d.includes("T") ? d.replace(" ", "T") + "Z" : d);
    if (Number.isNaN(date.getTime())) return d;
    return date.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return d;
  }
}

export function daysBetween(a, b) {
  const A = new Date(a);
  const B = new Date(b);
  return Math.round((B - A) / (1000 * 60 * 60 * 24));
}

export function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function slugify(str) {
  return String(str).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
