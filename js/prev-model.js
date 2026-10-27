// Prévisionnel : trésorerie du compte courant BNP mois par mois, envies à caler,
// patrimoine projeté compte par compte et tendance long terme. Source unique des calculs.
// Entrées : modèle dépenses/patrimoine (M), projet immo (I), config/previsionnel.json (P).
import { EXCEPTIONNEL, ALL_CATS } from "./model.js";
import { addMonths, monthRange } from "./util.js";

export const VOYAGES = "✈️ Voyages";
const sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + f(x), 0);
const ceil100 = (v) => Math.ceil(v / 100) * 100;
const nowMonth = () => new Date().toISOString().slice(0, 7);
const UC = ["av_bnp", "pea"];
const SALARIALE = ["pee", "percol"];

export const SCENARIOS_DEP = { budget: "Budget v2", reel: "Rythme réel 12 mois" };

// Le versement s'applique-t-il au mois m ?
function versementDu(l, m) {
  if (l.debut && m < l.debut) return false;
  if (l.fin && m > l.fin) return false;
  if (l.frequence === "mensuel") return true;
  if (l.frequence === "annuel") return +m.slice(5) === l.mois_annuel;
  return l.mois === m;
}

// Dépense de référence d'une catégorie (hors Voyages et Exceptionnel) selon le scénario.
function baseCats(M, dep) {
  const cats = ALL_CATS.filter((c) => c !== VOYAGES && c !== EXCEPTIONNEL);
  const ref = M.last(12);
  return Object.fromEntries(cats.map((c) => [c, dep === "reel"
    ? Math.max(0, sum(ref, (m) => M.catNet(m, c)) / (ref.length || 1))
    : M.budgetCat(c) || 0]).filter(([, v]) => v > 0));
}

// opts : { dep: "budget"|"reel", vers: "actuel"|"propose", pont: bool, extra: Map(mois → [envies]) }
export function buildPrev(M, I, P, opts = {}) {
  if (!P || !M.patriLast) return null;
  const dep = opts.dep || "budget";
  const scen = P.versements?.[opts.vers] || P.versements?.actuel || { lignes: [] };
  const plancher = P.plancher_bnp ?? 500;
  const depart = M.patriLast;
  const mois = monthRange(addMonths(depart.mois, 1), P.horizon_fin || addMonths(depart.mois, 15));
  const base = baseCats(M, dep);
  const salaire = M.budget.salaire_net || 0;
  const loyer = M.budget.loyer || 0;
  const taux = Object.fromEntries(Object.entries(M.comptes).map(([k, c]) => [k, c.taux || 0]));
  const rUC = P.rendements?.uc?.central ?? 0.05;
  const rES = P.rendements?.salariale?.central ?? 0.04;

  // Enveloppe voyages : par année civile, ce qui reste (après le réel et les voyages datés)
  // est réparti sur les mois prévus de l'année.
  const env = M.budget.enveloppe_voyages_annuelle || (M.budgetCat(VOYAGES) || 0) * 12;
  const voyEvents = (m) => (P.evenements || []).filter((e) => e.mois === m && e.cat === VOYAGES);
  const voyAn = {};
  for (const y of [...new Set(mois.map((m) => m.slice(0, 4)))]) {
    const reel = sum(M.months.filter((m) => m.startsWith(y)), (m) => M.catNet(m, VOYAGES));
    const ms = mois.filter((m) => m.startsWith(y));
    const dates = sum(ms, (m) => sum(voyEvents(m), (e) => e.montant));
    const reste = Math.max(0, env - reel - dates);
    voyAn[y] = { enveloppe: env, reel, dates, reste, parMois: ms.length ? reste / ms.length : 0, depasse: Math.max(0, reel + dates - env) };
  }

  const soldes = { ...depart.soldes };
  let bnp = soldes.cc_bnp || 0;
  const rows = [];
  for (const m of mois) {
    const debut = bnp;
    const exc = (P.revenus_exceptionnels || []).filter((r) => r.mois === m);
    const revenus = salaire + sum(exc, (r) => r.montant);
    const evts = (P.evenements || []).filter((e) => e.mois === m);
    // Catégories : un événement daté absorbe le budget de sa catégorie (max des deux).
    const cats = {};
    for (const [c, v] of Object.entries(base)) cats[c] = { base: v, prevu: v, evts: [] };
    for (const e of evts.filter((x) => x.cat !== VOYAGES)) {
      const k = e.cat || EXCEPTIONNEL;
      cats[k] ||= { base: 0, prevu: 0, evts: [] };
      cats[k].evts.push(e);
    }
    for (const c of Object.values(cats)) if (c.evts.length) c.prevu = Math.max(c.base, sum(c.evts, (e) => e.montant));
    const voy = voyAn[m.slice(0, 4)];
    const voyages = { reparti: voy.parMois, evts: voyEvents(m) };
    voyages.prevu = voyages.reparti + sum(voyages.evts, (e) => e.montant);
    // Envies datées : en plus du budget de leur catégorie.
    const envies = [...(P.envies || []).filter((e) => e.mois === m && e.statut !== "achetée"), ...(opts.extra?.get(m) || [])];
    const enviesTot = sum(envies, (e) => e.prix);
    const courant = sum(Object.values(cats), (c) => c.prevu);
    const vers = (scen.lignes || []).filter((l) => versementDu(l, m));
    const versTot = sum(vers, (l) => l.montant);

    // Épargne : intérêts / rendement du mois puis versements.
    for (const k of Object.keys(soldes)) {
      if (k === "cc_bnp" || k === "cc_revolut") continue;
      const r = UC.includes(k) ? (1 + rUC) ** (1 / 12) - 1 : SALARIALE.includes(k) ? (1 + rES) ** (1 / 12) - 1 : taux[k] / 12;
      soldes[k] *= 1 + r;
    }
    for (const l of vers) soldes[l.compte] = (soldes[l.compte] || 0) + l.montant;

    const avant = debut + revenus - loyer - courant - voyages.prevu - enviesTot - versTot;
    // Sous le plancher : virement LDDS → BNP, arrondi à la centaine, dans la limite du LDDS.
    let pont = 0;
    if (opts.pont !== false && avant < plancher) pont = Math.min(ceil100(plancher - avant), Math.max(0, Math.floor(soldes.ldds || 0)));
    soldes.ldds = (soldes.ldds || 0) - pont;
    bnp = avant + pont;
    soldes.cc_bnp = bnp;
    rows.push({
      m, enCours: m <= nowMonth(), debut, salaire, exc, revenus, loyer, cats, courant, voyages, envies, enviesTot,
      vers, versTot, avant, pont, fin: bnp, alerte: bnp < plancher, soldes: { ...soldes },
      total: sum(Object.values(soldes)),
    });
  }

  const pointBas = rows.reduce((a, r) => (r.avant < a.avant ? r : a), rows[0]);
  return {
    depart, plancher, mois: rows, voyAn, base, dep, vers: opts.vers || "actuel", scen,
    pontTotal: sum(rows, (r) => r.pont), pointBas,
    alertes: rows.filter((r) => r.alerte),
    row: (m) => rows.find((r) => r.m === m),
  };
}

// Marge du mois k : ce qui peut encore sortir ce mois-ci sans passer sous le plancher
// d'ici la prochaine rentrée exceptionnelle (prime), sans virement depuis le LDDS.
function margeDe(rows, k, primes, plancher, pris) {
  let min = Infinity;
  for (let j = k; j < rows.length; j++) {
    if (j > k && primes.has(rows[j].m)) break;
    min = Math.min(min, rows[j].avant - (pris?.[j] || 0) - plancher);
  }
  return min;
}

export function marges(M, I, P, opts) {
  const sansPont = buildPrev(M, I, P, { ...opts, pont: false });
  if (!sansPont) return new Map();
  const primes = new Set((P.revenus_exceptionnels || []).map((r) => r.mois));
  return new Map(sansPont.mois.map((r, k) => [r.m, margeDe(sansPont.mois, k, primes, sansPont.plancher)]));
}

// Envies non datées : premier mois dont la marge couvre le prix.
// Ordre : priorité puis ordre de la liste ; chaque envie calée pèse sur les suivantes.
export function calerEnvies(M, I, P, opts) {
  const sansPont = buildPrev(M, I, P, { ...opts, pont: false });
  if (!sansPont) return [];
  const rows = sansPont.mois;
  const primes = new Set((P.revenus_exceptionnels || []).map((r) => r.mois));
  const pris = rows.map(() => 0);
  const todo = (P.envies || []).map((e, i) => ({ e, i })).filter(({ e }) => !e.mois && e.statut === "envie")
    .sort((a, b) => (a.e.priorite ?? 9) - (b.e.priorite ?? 9) || a.i - b.i);
  const out = [];
  for (const { e } of todo) {
    let k0 = -1;
    for (let k = 0; k < rows.length && k0 < 0; k++) {
      if (margeDe(rows, k, primes, sansPont.plancher, pris) >= e.prix) k0 = k;
    }
    if (k0 >= 0) for (let j = k0; j < rows.length; j++) pris[j] += e.prix;
    out.push({ ...e, suggestion: k0 >= 0 ? rows[k0].m : null });
  }
  return out;
}

// ------------------------------------------------------------ long terme

function mensualite(capital, tauxAn, ans) {
  const r = tauxAn / 12;
  const n = ans * 12;
  return r ? (capital * r) / (1 - (1 + r) ** -n) : capital / n;
}

// Projection annuelle sur `ans` années à partir de la fin du prévisionnel mensuel.
// Effort d'épargne de chaque année = celui de la dernière année civile complète du prévisionnel.
export function longTerme(prev, M, I, P, { ans = 10, immo = false } = {}) {
  if (!prev?.mois.length) return null;
  const last = prev.mois.at(-1);
  const y0 = +last.m.slice(0, 4);
  const anRows = prev.mois.filter((r) => r.m.startsWith(String(y0)));
  const flux = {};
  for (const r of anRows) for (const l of r.vers) flux[l.compte] = (flux[l.compte] || 0) + l.montant;
  const ccDelta = last.fin - (anRows[0]?.debut ?? last.fin) - sum(anRows, (r) => r.pont);
  const taux = Object.fromEntries(Object.entries(M.comptes).map(([k, c]) => [k, c.taux || 0]));
  const F = I?.cfg?.financement || {};
  const E = I?.cfg?.exploitation || {};
  const Z = P.immo || {};
  const yAchat = Z.date_achat ? +Z.date_achat.slice(0, 4) : null;
  const emprunt = Math.max(0, (Z.cout_total || 0) - (F.apport || 0));
  const mens = mensualite(emprunt, F.taux || 0.0365, F.duree_ans || 25) + (emprunt * (F.assurance_taux || 0)) / 12;
  const loyerAn = (Z.prix_fai || 0) * (Z.rendement_brut || 0.045) * (1 - (E.vacance_mois ?? 1) / 12);
  const effortAn = loyerAn * (1 - (Z.charges_pct_loyer ?? 0.25)) - mens * 12;

  // Épargne de précaution : 3 mois de dépenses courantes + loyer.
  const precaution = 3 * (sum(Object.values(prev.base)) + (M.budget.loyer || 0));
  const out = {};
  for (const sc of ["prudent", "central", "dynamique"]) {
    const rUC = P.rendements?.uc?.[sc] ?? 0.05;
    const rES = P.rendements?.salariale?.[sc] ?? 0.04;
    const s = { ...last.soldes };
    let bien = 0, crd = 0, trou = 0;
    const serie = [{ an: y0, ...split(s, bien, crd), trou }];
    for (let y = y0 + 1; y <= y0 + ans; y++) {
      for (const k of Object.keys(s)) {
        if (k.startsWith("cc_")) continue;
        s[k] *= 1 + (UC.includes(k) ? rUC : SALARIALE.includes(k) ? rES : taux[k]);
        s[k] += flux[k] || 0;
      }
      let net = ccDelta;
      // Achat daté avant la fin du prévisionnel mensuel : intégré à la première année projetée.
      if (immo && yAchat && y >= yAchat) {
        if (!bien) {
          bien = Z.prix_fai || 0;
          crd = emprunt;
          trou += takeLivrets(s, F.apport || 0);
        } else bien *= 1 + (E.valorisation ?? 0.01);
        // Capital remboursé dans l'année ; l'effort (loyer net − crédit) pèse sur la trésorerie.
        const r = (F.taux || 0.0365) / 12;
        for (let m = 0; m < 12 && crd > 0; m++) crd -= mens - (emprunt * (F.assurance_taux || 0)) / 12 - crd * r;
        crd = Math.max(0, crd);
        net += effortAn;
      }
      // Excédent → compte courant ; déficit → compte courant au-dessus du plancher, puis livrets.
      if (net >= 0) s.cc_bnp += net;
      else {
        const cc = Math.min(-net, Math.max(0, s.cc_bnp - prev.plancher));
        s.cc_bnp -= cc;
        trou += takeLivrets(s, -net - cc);
      }
      serie.push({ an: y, ...split(s, bien, crd), trou });
    }
    out[sc] = serie;
  }
  const sous = (sc) => out[sc].find((y) => y.livrets + y.cc < precaution)?.an ?? null;
  return { ...out, y0, flux, ccDelta, precaution, sousPrecaution: sous("central"),
    immo: { emprunt, mens, loyerAn, effortAn, yAchat } };

  function split(s, bien, crd) {
    const env = M.envelopes(s);
    const fin = sum(Object.values(env));
    return { ...env, immoNet: bien - crd, bien, crd, financier: fin, total: fin + bien - crd };
  }
}

// Retire un montant des livrets (LDDS d'abord, puis CEL, PEL, Livret A).
// Ce qui manque passe en négatif sur le compte courant et est renvoyé (trou de financement).
function takeLivrets(s, v) {
  let reste = v;
  for (const k of ["ldds", "cel", "pel", "livret_a"]) {
    if (reste <= 0) break;
    const x = Math.min(reste, Math.max(0, s[k] || 0));
    s[k] -= x;
    reste -= x;
  }
  if (reste > 0) s.cc_bnp -= reste;
  return Math.max(0, reste);
}
