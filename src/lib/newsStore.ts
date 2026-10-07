// News store – DB-backed via dataCache
import { cacheGet, cacheInsert, cacheUpdate, cacheDelete } from "./dataCache";
import { isTestAccount, localGet, localSet } from "./dbStoreHelper";
import { getUserSetting, setUserSetting } from "./userSettingsCache";
import { geladeneVersionsnotiz, zaehleUngeleseneNotizen, type NotizBetrachter } from "./versionsnotiz";

export interface NewsArticle {
  id: string;
  emoji: string;
  titel: string;
  kategorie: "Update" | "Event" | "Info" | "Provision";
  inhalt: string;
  bild?: string;
  links: { bezeichnung: string; url: string }[];
  angepinnt: boolean;
  erstelltAm: string;
  erstelltVon: string;
  zielrollen?: string[]; // if empty/undefined → visible to all
  autorId?: string;
}

const LS_KEY = "mi_news";
const NEWS_READ_KEY = "mi_news_read";

function toDb(a: NewsArticle): Record<string, any> {
  return {
    id: a.id,
    titel: a.titel,
    inhalt: a.inhalt,
    kategorie: mapKategorieToEnum(a.kategorie),
    autor_id: a.autorId || "00000000-0000-0000-0000-000000000000",
    veroeffentlicht_am: a.erstelltAm || new Date().toISOString(),
    meta: {
      emoji: a.emoji,
      bild: a.bild,
      links: a.links,
      angepinnt: a.angepinnt,
      zielrollen: a.zielrollen,
      erstelltVon: a.erstelltVon,
    },
  };
}

function fromDb(r: any): NewsArticle {
  const meta = r.meta || {};
  return {
    id: r.id,
    titel: r.titel,
    inhalt: r.inhalt || "",
    kategorie: mapEnumToKategorie(r.kategorie),
    emoji: meta.emoji || "📰",
    bild: meta.bild,
    links: meta.links || [],
    angepinnt: meta.angepinnt || false,
    erstelltAm: r.veroeffentlicht_am || r.erstellt_am || "",
    erstelltVon: meta.erstelltVon || "",
    autorId: r.autor_id || "",
    zielrollen: meta.zielrollen,
  };
}

function mapKategorieToEnum(k: string): string {
  const map: Record<string, string> = {
    "Update": "update", "Event": "event", "Info": "allgemein", "Provision": "provision",
  };
  return map[k] || "allgemein";
}

function mapEnumToKategorie(k: string): "Update" | "Event" | "Info" | "Provision" {
  const map: Record<string, any> = {
    "update": "Update", "event": "Event", "allgemein": "Info", "provision": "Provision",
  };
  return map[k] || "Info";
}

export function getNews(): NewsArticle[] {
  if (isTestAccount()) return localGet<NewsArticle[]>(LS_KEY, []);
  // Systemupdates (kategorie='system') werden ausschließlich im Dashboard
  // über die SystemUpdatesCard angezeigt — nicht in der News-Liste/Sidebar.
  return cacheGet("news")
    .filter((r: any) => r.kategorie !== "system")
    .map(fromDb);
}

export function saveNews(articles: NewsArticle[]) {
  if (isTestAccount()) { localSet(LS_KEY, articles); return; }
  // Not used for DB mode — individual ops instead
}

export function addNews(article: Omit<NewsArticle, "id" | "erstelltAm">) {
  const now = new Date().toISOString();
  const newArticle: NewsArticle = {
    ...article,
    id: crypto.randomUUID(),
    erstelltAm: now,
  };
  if (isTestAccount()) {
    const all = localGet<NewsArticle[]>(LS_KEY, []);
    all.unshift(newArticle);
    localSet(LS_KEY, all);
  } else {
    cacheInsert("news", toDb(newArticle));
  }
  window.dispatchEvent(new CustomEvent("news-updated"));
  return newArticle;
}

export function updateNews(id: string, updates: Partial<NewsArticle>) {
  if (isTestAccount()) {
    const articles = localGet<NewsArticle[]>(LS_KEY, []).map(a => a.id === id ? { ...a, ...updates } : a);
    localSet(LS_KEY, articles);
  } else {
    const existing = cacheGet("news").find((r: any) => r.id === id);
    if (existing) {
      const merged = { ...fromDb(existing), ...updates };
      const { id: _id, ...dbUpdates } = toDb(merged);
      cacheUpdate("news", id, dbUpdates);
    }
  }
  window.dispatchEvent(new CustomEvent("news-updated"));
}

export function deleteNews(id: string) {
  if (isTestAccount()) {
    localSet(LS_KEY, localGet<NewsArticle[]>(LS_KEY, []).filter(a => a.id !== id));
  } else {
    cacheDelete("news", id);
  }
  window.dispatchEvent(new CustomEvent("news-updated"));
}

// ── Read tracking – DB-backed for live users, localStorage for testaccount ──

export function getReadNewsIds(): string[] {
  if (isTestAccount()) {
    try {
      const stored = localStorage.getItem(NEWS_READ_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  }
  return getUserSetting<string[]>("news_read_ids", []);
}

/**
 * Merkt Meldungen als gelesen.
 *
 * Ist nichts Neues dabei, geschieht bewusst gar nichts: kein Schreibvorgang
 * in die Einstellungen und kein Ereignis. Sonst schreibt jedes Oeffnen der
 * News-Seite dieselbe Liste erneut in die Datenbank.
 */
export function markNewsAsRead(ids: string[]) {
  const existing = new Set(getReadNewsIds());
  const neue = ids.filter(id => id && !existing.has(id));
  if (neue.length === 0) return;
  neue.forEach(id => existing.add(id));
  const updated = [...existing];
  if (isTestAccount()) {
    localStorage.setItem(NEWS_READ_KEY, JSON.stringify(updated));
  } else {
    setUserSetting("news_read_ids", updated);
  }
  window.dispatchEvent(new CustomEvent("news-updated"));
}

export function getUnreadNewsCount(role?: string): number {
  const articles = getNews();
  const visible = role
    ? articles.filter(a => isNewsVisibleForRole(a, role))
    : articles;
  const readIds = new Set(getReadNewsIds());
  return visible.filter(a => !readIds.has(a.id)).length;
}

/**
 * Ungelesene Eintraege aus „Neu im CRM“ fuer diesen Betrachter (Rolle und
 * Freigabestand). Zaehlt, was zuletzt mit `ladeVersionsnotiz` geholt wurde;
 * vorher 0.
 */
export function getUnreadNeuImCrmCount(betrachter: NotizBetrachter): number {
  return zaehleUngeleseneNotizen(geladeneVersionsnotiz(), betrachter, new Set(getReadNewsIds()));
}

export function markAllNewsAsRead(role?: string) {
  const articles = getNews();
  const visible = role
    ? articles.filter(a => isNewsVisibleForRole(a, role))
    : articles;
  const ids = visible.map(a => a.id);
  if (ids.length === 0) return;
  markNewsAsRead(ids);
}

export function canEditNews(role: string): boolean {
  return ["admin", "inhaber"].includes(role);
}

export function isNewsVisibleForRole(article: NewsArticle, role: string): boolean {
  if (!article.zielrollen || article.zielrollen.length === 0) return true;
  return article.zielrollen.includes(role);
}
