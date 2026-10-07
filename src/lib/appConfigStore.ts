/**
 * Shared app config store for company-wide settings.
 * Uses the `app_config` table (schluessel/wert JSONB).
 * Testaccount: falls back to localStorage.
 */
import { toast } from "sonner";
import { cacheGet, cacheInsert, cacheUpdate, isTableLoaded } from "./dataCache";
import { isTestAccount } from "./dbStoreHelper";
import { fehlerAlsText } from "./fehlerKontext";

const LS_PREFIX = "mi_appconfig_";

export function getAppConfig<T = any>(key: string, fallback: T): T {
  if (isTestAccount()) {
    try {
      const raw = localStorage.getItem(`${LS_PREFIX}${key}`);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  }
  const rows = cacheGet("app_config");
  const row = rows.find((r: any) => r.schluessel === key);
  if (!row) return fallback;
  return row.wert !== undefined ? row.wert : fallback;
}

/**
 * Schreibt einen unternehmensweiten Konfigurationswert.
 *
 * app_config ist admin-verwaltete Konfiguration. Wer nicht Admin oder Inhaber
 * ist, wird von der Zugriffsregel der Tabelle abgewiesen (Fehlercode 42501).
 * Das ist richtig so, aendert aber nichts daran, dass der Fehlschlag bisher
 * unsichtbar blieb: Der Aufrufer bekam nichts zurueck, und die Meldung stand
 * nur in der Konsole. Wer auf Speichern geklickt hat, glaubte, es sei
 * gespeichert.
 *
 * Deshalb:
 *   - Das Ergebnis wird zurueckgegeben, `true` heisst gespeichert.
 *   - Ein Fehlschlag zeigt eine verstaendliche Meldung. Bei fehlender
 *     Berechtigung sagt sie das auch, denn ein zweiter Versuch hilft dort nie.
 *   - `still` schaltet die Meldung ab. Das ist fuer Schreibvorgaenge gedacht,
 *     die der Nutzer gar nicht ausgeloest hat, etwa das Zurueckschreiben einer
 *     Liste beim Oeffnen einer Seite.
 *
 * Die eigene Meldung ersetzt die allgemeine aus dataCache, sonst erschienen
 * zwei Hinweise nebeneinander.
 */
export function setAppConfig(
  key: string,
  value: any,
  opts?: { still?: boolean },
): Promise<boolean> {
  if (isTestAccount()) {
    localStorage.setItem(`${LS_PREFIX}${key}`, JSON.stringify(value));
    return Promise.resolve(true);
  }
  const rows = cacheGet("app_config");
  const row = rows.find((r: any) => r.schluessel === key);

  // Kein Eintrag im Zwischenspeicher heisst nicht zwingend "gibt es nicht",
  // sondern oft "noch nicht geladen". Genau daraus entstand der gemeldete
  // Fehler: Beim Oeffnen der Seite war die Tabelle noch nicht da, der Code
  // hielt den Eintrag fuer neu und legte ihn an. Ein Anlegen kann die
  // Zugriffsregel ablehnen, waehrend ein Aendern erlaubt gewesen waere.
  if (!row && !isTableLoaded("app_config")) {
    console.warn(`setAppConfig ${key}: app_config ist noch nicht geladen, nicht gespeichert.`);
    if (!opts?.still) {
      toast.error("Die Einstellung konnte noch nicht gespeichert werden.", {
        description: "Die Daten werden gerade geladen. Bitte gleich noch einmal speichern.",
      });
    }
    return Promise.resolve(false);
  }

  // Der abgelehnte Schreibversuch darf nicht als unbehandeltes Versprechen
  // nach oben durchschlagen, sonst erzeugt die Fehleraufzeichnung daraus ein
  // Ticket, obwohl die Ablehnung erwartbar ist.
  const beiSchreibfehler = (e: any) => {
    const text = fehlerAlsText(e);
    console.warn(`setAppConfig ${key}: nicht gespeichert:`, text);
    if (opts?.still) return false;
    const fehltBerechtigung =
      String(e?.code || "") === "42501" || /row-level security/i.test(text);
    toast.error("Die Einstellung konnte nicht gespeichert werden.", {
      description: fehltBerechtigung
        ? "Diese Einstellung gilt unternehmensweit und darf nur von der Administration geändert werden."
        : text,
    });
    return false;
  };

  if (row) {
    return cacheUpdate(
      "app_config",
      row.id,
      { wert: value, aktualisiert_am: new Date().toISOString() },
      { silent: true },
    )
      .then(() => true)
      .catch(beiSchreibfehler);
  }
  return cacheInsert(
    "app_config",
    {
      id: crypto.randomUUID(),
      schluessel: key,
      wert: value,
      aktualisiert_am: new Date().toISOString(),
    },
    { silent: true },
  )
    .then(() => true)
    .catch(beiSchreibfehler);
}
