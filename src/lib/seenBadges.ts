import { isTestAccount } from "./dbStoreHelper";
import { getUserSetting, setUserSetting } from "./userSettingsCache";

/**
 * Generische "Last-Seen"-Tracker für Sidebar-Badges (analog zu newsStore /
 * objekteStore). Speichert pro Schlüssel einen ISO-Timestamp – entweder in
 * localStorage (Test-Account) oder in user_settings.
 */

const LS_PREFIX = "mi_seen_";
const DEFAULT_TTL_DAYS = 14;

function lsKey(key: string) { return LS_PREFIX + key; }
function settingKey(key: string) { return "seen_" + key; }

export function getSeenAt(key: string): string {
  return isTestAccount()
    ? localStorage.getItem(lsKey(key)) || ""
    : getUserSetting<string>(settingKey(key), "");
}

function persist(key: string, ts: string) {
  if (isTestAccount()) localStorage.setItem(lsKey(key), ts);
  else setUserSetting(settingKey(key), ts);
}

export function markSeen(key: string) {
  const ts = new Date().toISOString();
  persist(key, ts);
  window.dispatchEvent(new CustomEvent("seen-badge-updated", { detail: { key } }));
}

export function initSeenIfNeeded(key: string) {
  if (!getSeenAt(key)) persist(key, new Date().toISOString());
}

/** Bekannte Schlüssel zentral, damit Tippfehler vermieden werden. */
export const SEEN_KEYS = {
  leadVerwaltung: "lead_verwaltung",
  bewerbungen: "bewerbungen",
  vpKontakte: "vp_kontakte",
  followUp: "follow_up_bucket",
  unterlagen: "unterlagen",
  leadArbeit: "lead_arbeit",
  vpBewertungen: "vp_bewertungen",
  einwandBibliothek: "einwand_bibliothek",
  vertriebsakademie: "vertriebsakademie",
} as const;

/**
 * Zentrales Release-Datum pro Feature-Key. Das „Neu"-Badge wird für ALLE
 * berechtigten Nutzer ab diesem Zeitpunkt exakt `DEFAULT_TTL_DAYS` Tage lang
 * angezeigt – unabhängig davon, ob jemand den Menüpunkt geöffnet hat. Nach
 * Ablauf verschwindet es systemweit. Wird ein Feature neu „released",
 * einfach das Datum hier aktualisieren.
 *
 * Format: ISO-8601 (UTC).
 */
export const NEW_BADGE_RELEASED_AT: Record<string, string> = {
  unterlagen: "2026-06-14T00:00:00Z",
  lead_arbeit: "2026-06-14T00:00:00Z",
  vp_bewertungen: "2026-06-14T00:00:00Z",
  follow_up_bucket: "2026-06-20T00:00:00Z",
  einwand_bibliothek: "2026-07-13T00:00:00Z",
  vertriebsakademie: "2026-07-13T00:00:00Z",
  // Selbstauskunft als ausfuellbare PDF an den Kunden senden (Rueckfall-Weg)
  sa_pdf_versand: "2026-08-30T00:00:00Z",
  // Beratungspraesentation als herunterladbare PDF
  beratungspraesentation_pdf: "2026-08-30T00:00:00Z",
};

/**
 * Versionsbasierte „Neu"-Badge-Logik:
 *  – Zeigt das Badge für `ttlDays` Tage nach dem zentralen Release-Datum an.
 *  – Klick-Status des Nutzers wird IGNORIERT (das Badge ist eine
 *    System-Ankündigung, kein persönliches Counter-Badge).
 *  – Ist kein Release-Datum hinterlegt, wird kein Badge angezeigt.
 */
export function isNewBadgeActive(key: string, ttlDays: number = DEFAULT_TTL_DAYS): boolean {
  const releasedAt = NEW_BADGE_RELEASED_AT[key];
  if (!releasedAt) return false;
  const released = new Date(releasedAt).getTime();
  if (!Number.isFinite(released)) return false;
  const ageMs = Date.now() - released;
  if (ageMs < 0) return false;
  return ageMs <= ttlDays * 24 * 60 * 60 * 1000;
}

/* ──────────────────────────────────────────────────────────────────
 *  Per-Item "Gesehen"-Tracker
 *  Speichert pro Bucket (z. B. "bewerbungen", "vp_kontakte",
 *  "lead_verwaltung") eine Liste der bereits geöffneten Item-IDs in
 *  localStorage. Wird ergänzend zum bestehenden `seen_<key>` Cutoff
 *  benutzt: ein Eintrag gilt nur dann als „neu", wenn
 *    – sein `erstellt_am` jünger als der Cutoff ist UND
 *    – seine ID noch nicht in der Gesehen-Liste steht.
 * ────────────────────────────────────────────────────────────────── */
const ITEM_LS_PREFIX = "mi_seen_items_";
const MAX_ITEM_IDS = 5000;

function itemLsKey(key: string) { return ITEM_LS_PREFIX + key; }

export function getSeenItemIds(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(itemLsKey(key));
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.map((x) => String(x)));
  } catch { return new Set(); }
}

export function isItemSeen(key: string, id: string): boolean {
  if (!id) return false;
  return getSeenItemIds(key).has(String(id));
}

export function markItemSeen(key: string, id: string | string[]) {
  const ids = Array.isArray(id) ? id : [id];
  const set = getSeenItemIds(key);
  let changed = false;
  for (const i of ids) {
    const s = String(i || "").trim();
    if (!s) continue;
    if (!set.has(s)) { set.add(s); changed = true; }
  }
  if (!changed) return;
  let arr = Array.from(set);
  if (arr.length > MAX_ITEM_IDS) arr = arr.slice(-MAX_ITEM_IDS);
  try { localStorage.setItem(itemLsKey(key), JSON.stringify(arr)); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent("seen-badge-updated", { detail: { key, itemId: ids } }));
}
