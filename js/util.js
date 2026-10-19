// Formats et petits utilitaires.

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export const eur = (n, d = 0) => `${Number(n).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d })} €`;
export const eur2 = (n) => eur(n, Math.abs(n) < 100 && n % 1 ? 2 : 0);
export const signed = (n) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${eur(Math.abs(n))}`;
export const pct = (n, d = 0) => `${(n * 100).toLocaleString("fr-FR", { maximumFractionDigits: d })} %`;

const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const MOIS_LONG = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

// "2026-09" → "sept." / "sept. 26" / "septembre 2026"
export const mShort = (m) => MOIS[+m.slice(5) - 1];
export const mYear = (m) => `${MOIS[+m.slice(5) - 1]} ${m.slice(2, 4)}`;
export const mLong = (m) => `${MOIS_LONG[+m.slice(5) - 1]} ${m.slice(0, 4)}`;
export const dShort = (iso) => `${+iso.slice(8)} ${MOIS[+iso.slice(5, 7) - 1]}`;

export function addMonths(m, n) {
  const d = new Date(+m.slice(0, 4), +m.slice(5) - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthRange(a, b) {
  const out = [];
  for (let m = a; m <= b; m = addMonths(m, 1)) out.push(m);
  return out;
}
