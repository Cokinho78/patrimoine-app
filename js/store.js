// Lecture du repo privé patrimoine-data via l'API GitHub (lecture seule).
// 1 appel "tree" + les blobs modifiés, mis en cache local par sha.

const CFG_KEY = "patrimoine:cfg";
const BLOB_PREFIX = "patrimoine:blob:";
const TREE_KEY = "patrimoine:tree";
const GITHUB_API = "https://api.github.com";

// Le token part vers `api` : on n'accepte un autre hôte que GitHub qu'en dev local.
function devApi() {
  const api = new URLSearchParams(location.search).get("api");
  if (!api) return null;
  try {
    const u = new URL(api);
    return ["localhost", "127.0.0.1"].includes(u.hostname) && u.origin === location.origin ? api : null;
  } catch {
    return null;
  }
}

function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* quota ou stockage bloqué */ } }

export function loadConfig() {
  let cfg = {};
  try { cfg = JSON.parse(lsGet(CFG_KEY) || "{}"); } catch { cfg = {}; }
  return {
    api: devApi() || GITHUB_API,
    owner: cfg.owner || "Cokinho78",
    repo: cfg.repo || "patrimoine-data",
    branch: cfg.branch || "main",
    token: cfg.token || "",
  };
}

export function saveConfig({ owner, repo, branch, token }) {
  lsSet(CFG_KEY, JSON.stringify({ owner, repo, branch, token }));
}

export function forgetToken() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("patrimoine:"))
      .forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

function b64ToUtf8(b64) {
  const bin = atob(b64.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export class StoreError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export class Store {
  constructor(cfg) {
    this.cfg = cfg;
    this.shas = new Map();
    this.offline = false;
  }

  async req(path) {
    const { api, owner, repo, token } = this.cfg;
    const res = await fetch(`${api}/repos/${owner}/${repo}${path}`, {
      cache: "no-store",
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const hint = {
        401: "Token invalide ou expiré.",
        403: "Accès refusé : le token doit avoir Contents : Read-only sur patrimoine-data.",
        404: "Repo introuvable : vérifie le compte, le nom du repo et les droits du token.",
      }[res.status];
      throw new StoreError(hint || `Erreur GitHub ${res.status}`, res.status);
    }
    return res.json();
  }

  // Hors réseau : on retombe sur le dernier état connu.
  async listFiles() {
    let tree;
    try {
      const data = await this.req(`/git/trees/${encodeURIComponent(this.cfg.branch)}?recursive=1`);
      tree = data.tree.filter((n) => n.type === "blob").map((n) => [n.path, n.sha]);
      lsSet(TREE_KEY, JSON.stringify(tree));
      this.offline = false;
    } catch (e) {
      if (e instanceof StoreError) throw e;
      tree = JSON.parse(lsGet(TREE_KEY) || "null");
      if (!tree) throw e;
      this.offline = true;
    }
    this.shas = new Map(tree);
    return [...this.shas.keys()];
  }

  async readJSON(path) {
    const sha = this.shas.get(path);
    if (!sha) throw new StoreError(`Fichier absent : ${path}`, 404);
    let text = lsGet(BLOB_PREFIX + sha);
    if (text === null) {
      const blob = await this.req(`/git/blobs/${sha}`);
      text = b64ToUtf8(blob.content);
      lsSet(BLOB_PREFIX + sha, text);
    }
    return JSON.parse(text);
  }

  async readMany(paths) {
    const out = new Map();
    let i = 0;
    const worker = async () => {
      while (i < paths.length) {
        const p = paths[i++];
        try { out.set(p, await this.readJSON(p)); } catch (e) { console.warn("Lecture impossible", p, e); }
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    return out;
  }
}
