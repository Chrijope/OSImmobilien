import { extractStoragePath } from "./storage";

/**
 * Helfer fuer das Loeschen einer Kundenunterlage im Investment.
 *
 * Hintergrund (15.09.2026): Der Loeschen-Knopf im Kundenprofil rief
 * `new URL(gespeicherterWert)` auf. Seit Mai speichert der Upload im CRM
 * aber den reinen Speicherpfad (`kontaktId/investmentId/Datei.pdf`), und
 * `new URL` wirft bei einem Pfad ohne Protokoll einen TypeError. Der landete
 * im catch und wurde pauschal als "Internetverbindung pruefen" gemeldet,
 * obwohl weder Netz noch Rechte das Problem waren.
 *
 * Beide Funktionen sind bewusst rein, damit sie sich ohne Supabase testen
 * lassen.
 */

/**
 * Speicherpfad im Bucket "unterlagen" aus dem gespeicherten Wert.
 *
 * Akzeptiert alle Formen, die in `docFileUrls` vorkommen: reiner Pfad (CRM-
 * und Portal-Upload seit 2026), oeffentliche Adresse (Altbestand), signierte
 * oder authentifizierte Adresse. Liefert null, wenn nichts zu loeschen ist
 * oder die Adresse in einen anderen Bucket zeigt.
 */
export function unterlagenSpeicherPfad(gespeichert: string | null | undefined): string | null {
  if (!gespeichert) return null;
  const wert = gespeichert.trim();
  if (!wert) return null;
  const pfad = extractStoragePath(wert, "unterlagen");
  if (!pfad) return null;
  const bereinigt = pfad.split("?")[0].replace(/^\/+/, "");
  return bereinigt || null;
}

export type UnterlagenFehlerArt = "berechtigung" | "verbindung" | "funktion_fehlt" | "sonstig";

type FehlerObjekt = { message?: unknown; code?: unknown; statusCode?: unknown; status?: unknown; details?: unknown; hint?: unknown };

function feld(fehler: unknown, name: keyof FehlerObjekt): string {
  if (!fehler || typeof fehler !== "object") return "";
  const wert = (fehler as FehlerObjekt)[name];
  return wert === undefined || wert === null ? "" : String(wert);
}

/**
 * Ordnet einen Fehler von Storage, PostgREST oder fetch einer Ursache zu.
 *
 * Wichtig fuer den Hinweis an den Nutzer: Ein Rechtefehler soll "Keine
 * Berechtigung" heissen und nicht "Internetverbindung pruefen".
 */
export function deuteUnterlagenFehler(fehler: unknown): { art: UnterlagenFehlerArt; meldung: string } {
  const meldung = fehler instanceof Error ? fehler.message : feld(fehler, "message") || (typeof fehler === "string" ? fehler : "");
  const code = feld(fehler, "code");
  const status = feld(fehler, "statusCode") || feld(fehler, "status");
  const text = `${meldung} ${feld(fehler, "details")} ${feld(fehler, "hint")}`.toLowerCase();

  if (
    code === "42501"
    || status === "401" || status === "403"
    || /row-level security|not allowed|not authorized|unauthorized|permission denied|violates .*policy|keine berechtigung/.test(text)
  ) {
    return { art: "berechtigung", meldung };
  }
  if (code === "PGRST202" || code === "42883" || /could not find the function|function .* does not exist/.test(text)) {
    return { art: "funktion_fehlt", meldung };
  }
  if (
    (fehler instanceof TypeError && /fetch|network|load failed/.test(text))
    || /failed to fetch|networkerror|network request failed|load failed|timed? ?out|econnreset|socket hang up/.test(text)
  ) {
    return { art: "verbindung", meldung };
  }
  return { art: "sonstig", meldung };
}

/** Text fuer den roten Hinweis, wenn das Loeschen einer Unterlage scheitert. */
export function loeschFehlerText(docName: string, fehler: unknown): string {
  const { art, meldung } = deuteUnterlagenFehler(fehler);
  const kopf = `„${docName}" liegt weiterhin gespeichert.`;
  switch (art) {
    case "berechtigung":
      return `${kopf} Keine Berechtigung: Dein Konto darf diese Unterlage nicht löschen.`;
    case "verbindung":
      return `${kopf} Keine Verbindung zum Server. Bitte Internetverbindung prüfen und noch einmal auf Löschen tippen.`;
    case "funktion_fehlt":
      return `${kopf} Die Datenbankfunktion zum Abmelden der Unterlage fehlt noch (Migration 20260901121000 in Supabase ausführen).`;
    default:
      return `${kopf} Unerwarteter Fehler${meldung ? `: ${meldung}` : "."}`;
  }
}
