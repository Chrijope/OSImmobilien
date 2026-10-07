import type { Json } from "@/integrations/supabase/types";
/**
 * Helper for reading/writing per-user settings from the dataCache.
 * Uses the `user_settings` table's `einstellungen` JSONB column.
 * Testaccount: falls back to localStorage.
 */
import { cacheGet, cacheUpdate, cacheReload } from "./dataCache";
import { getCurrentUserId } from "./currentUser";
import { isTestAccount } from "./dbStoreHelper";
import { supabase } from "@/integrations/supabase/client";

const LS_PREFIX = "mi_usettings_";

/** Eine Zeile der Tabelle `user_settings`, so wie sie im Cache liegt. */
type Einstellungszeile = {
  user_id?: string;
  einstellungen?: Record<string, unknown>;
  /** Nur lokal gesetzt, solange die echte Zeile noch nicht nachgeladen ist. */
  __vorlaeufig?: boolean;
};

function getRow(): any | null {
  const rows = cacheGet("user_settings");
  const currentUserId = getCurrentUserId();

  if (currentUserId) {
    return rows.find((row: any) => row.user_id === currentUserId) || null;
  }

  return rows[0] || null;
}

/** Read a key from user settings (synchronous) */
export function getUserSetting<T = any>(key: string, fallback: T): T {
  if (isTestAccount()) {
    try {
      const raw = localStorage.getItem(`${LS_PREFIX}${key}`);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  }
  const row = getRow();
  if (!row) return fallback;
  const einstellungen = row.einstellungen || {};
  return einstellungen[key] !== undefined ? einstellungen[key] : fallback;
}

/**
 * Nimmt eine vorlaeufige Zeile wieder zurueck, wenn die Datenbank den
 * Schreibvorgang abgelehnt hat. Nur der eigene Schluessel verschwindet,
 * damit ein parallel geschriebener zweiter Schluessel nicht mitgerissen wird.
 */
function verwerfeVorlaeufigeZeile(row: Einstellungszeile, key: string): void {
  if (!row?.__vorlaeufig) return;
  const rest = { ...(row.einstellungen || {}) };
  delete rest[key];
  row.einstellungen = rest;
  if (Object.keys(rest).length > 0) return;
  const zeilen = cacheGet<Einstellungszeile>("user_settings");
  const index = zeilen.indexOf(row);
  if (index >= 0) zeilen.splice(index, 1);
}

/** Write a key to user settings (sync cache + async DB) */
export function setUserSetting(key: string, value: any): void {
  if (isTestAccount()) {
    localStorage.setItem(`${LS_PREFIX}${key}`, JSON.stringify(value));
    return;
  }
  const userId = getCurrentUserId();
  if (!userId) {
    // Ohne angemeldeten Nutzer gibt es keine Zeile, in die geschrieben werden
    // koennte. Bisher endete das hier stillschweigend, niemand erfuhr davon.
    console.error(`setUserSetting("${key}"): keine Benutzerkennung, nichts gespeichert.`);
    return;
  }
  let row: Einstellungszeile | null = getRow();
  // Wer noch nie eine Einstellung gespeichert hat, besitzt keine Zeile in
  // `user_settings`. Frueher brach das Speichern hier stillschweigend ab:
  // nichts gemerkt, nichts gemeldet, und jedes Lesen lieferte wieder den
  // Rueckfallwert. Genau daran blieb die Zahl neben "News" haengen.
  // Die Datenbank legt die Zeile selbst an (`merge_user_settings` macht ein
  // INSERT, wenn nichts da ist). Bis das Nachladen durch ist, antwortet eine
  // vorlaeufige Zeile im Zwischenspeicher.
  const zeileIstVorlaeufig = !row;
  if (!row) {
    row = { user_id: userId, einstellungen: {}, __vorlaeufig: true };
    cacheGet<Einstellungszeile>("user_settings").push(row);
  }
  // Optimistic local cache update (instant UI), persist via atomic merge RPC
  // to avoid Read-Modify-Write races and massive payload PATCHes that fail
  // with "Failed to fetch" when einstellungen grows large.
  row.einstellungen = { ...(row.einstellungen || {}), [key]: value };
  const zeile = row;
  void (async () => {
    try {
      const { error } = await (supabase as any).rpc("merge_user_settings", {
        _user_id: userId,
        _patch: { [key]: value },
      });
      if (error) {
        console.error("merge_user_settings failed:", error);
        // Nichts vortaeuschen, was nicht gespeichert wurde.
        verwerfeVorlaeufigeZeile(zeile, key);
        return;
      }
      // Die echte Zeile holen, damit die vorlaeufige verschwindet.
      if (zeileIstVorlaeufig) void cacheReload("user_settings");
    } catch (e) {
      console.error("merge_user_settings exception:", e);
      verwerfeVorlaeufigeZeile(zeile, key);
    }
  })();
}

function istEinfachesObjekt(wert: unknown): wert is Record<string, unknown> {
  return !!wert && typeof wert === "object" && !Array.isArray(wert);
}

/**
 * Mischt wie `public.jsonb_deep_merge` in der Datenbank.
 *
 * Objekte werden Schluessel fuer Schluessel gemischt, alles andere ersetzt,
 * auch ein `null`. Ein fehlender Schluessel im Patch laesst den alten Wert
 * stehen. Genau so muss der Zwischenspeicher rechnen, sonst zeigt er nach dem
 * Speichern etwas anderes als die Datenbank.
 */
export function mischeWieDatenbank(alt: unknown, patch: unknown): unknown {
  if (!istEinfachesObjekt(alt) || !istEinfachesObjekt(patch)) return patch;
  const ergebnis: Record<string, unknown> = { ...alt };
  for (const [schluessel, wert] of Object.entries(patch)) {
    ergebnis[schluessel] = schluessel in alt ? mischeWieDatenbank(alt[schluessel], wert) : wert;
  }
  return ergebnis;
}

/**
 * Schreibt nur einen Teil eines verschachtelten Schluessels.
 *
 * `merge_user_settings` mischt tief. Ein Patch `{ a: { b: false } }` aendert
 * also nur `a.b` und laesst alles Uebrige unter `a` stehen, auch das, was ein
 * zweites Geraet inzwischen geschrieben hat. Loeschen laesst sich ein
 * Unterschluessel auf diesem Weg nicht, nur auf `null` setzen.
 *
 * Gibt zurueck, ob die Datenbank den Wert angenommen hat, damit der Aufrufer
 * einen fehlgeschlagenen Schreibvorgang spaeter wiederholen kann.
 */
export async function patchUserSetting(key: string, patch: Record<string, unknown>): Promise<boolean> {
  if (isTestAccount()) {
    try {
      const bisher = getUserSetting<unknown>(key, {});
      localStorage.setItem(`${LS_PREFIX}${key}`, JSON.stringify(mischeWieDatenbank(bisher, patch)));
      return true;
    } catch {
      return false;
    }
  }
  const userId = getCurrentUserId();
  if (!userId) {
    console.error(`patchUserSetting("${key}"): keine Benutzerkennung, nichts gespeichert.`);
    return false;
  }
  // Wie in `setUserSetting`: Ohne Zeile antwortet bis zum Nachladen eine
  // vorlaeufige, die Datenbank legt die echte selbst an.
  let row: Einstellungszeile | null = getRow();
  const zeileIstVorlaeufig = !row;
  if (!row) {
    row = { user_id: userId, einstellungen: {}, __vorlaeufig: true };
    cacheGet<Einstellungszeile>("user_settings").push(row);
  }
  const einstellungen = row.einstellungen || {};
  row.einstellungen = { ...einstellungen, [key]: mischeWieDatenbank(einstellungen[key], patch) };
  try {
    const { error } = await supabase.rpc("merge_user_settings", {
      _user_id: userId,
      _patch: { [key]: patch } as Json,
    });
    if (error) {
      console.error("merge_user_settings failed:", error);
      verwerfeVorlaeufigeZeile(row, key);
      return false;
    }
    if (zeileIstVorlaeufig) void cacheReload("user_settings");
    return true;
  } catch (e) {
    console.error("merge_user_settings exception:", e);
    verwerfeVorlaeufigeZeile(row, key);
    return false;
  }
}

/** Confirmed persistence for settings whose UI reports a saved state. */
export async function setUserSettingSicher(key: string, value: unknown): Promise<void> {
  if (isTestAccount()) {
    localStorage.setItem(`${LS_PREFIX}${key}`, JSON.stringify(value));
    return;
  }
  const row = getRow();
  const userId = getCurrentUserId();
  if (!row || !userId) throw new Error('Einstellungen noch nicht geladen. Bitte erneut anmelden.');
  const { error } = await supabase.rpc('merge_user_settings', { _user_id: userId, _patch: { [key]: value } as Json });
  if (error) throw error;
  row.einstellungen = { ...(row.einstellungen || {}), [key]: value };
}
