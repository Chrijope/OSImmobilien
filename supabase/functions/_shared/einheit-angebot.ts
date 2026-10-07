/**
 * Wird diese Einheit im CRM angeboten?
 *
 * Christians Regel vom 23.09.2026: Im CRM angeboten wird nur, was in
 * Investagon online und nicht verkauft ist. Eine in Investagon verkaufte,
 * offline gestellte, noch in Ueberpruefung stehende oder als Entwurf
 * gefuehrte Einheit bietet kein Partner an.
 *
 * Diese Datei ist die EINE Stelle, an der das entschieden wird. Der Import
 * (`investagon-import`) liest sie, um Verkaeufe nachzuziehen und neue
 * Projekte ohne Angebot gar nicht erst anzulegen, und das Frontend liest
 * sie, um Einheiten aus Objektuebersicht, Objektseite und Angebotslisten
 * herauszunehmen. Das Objekt selbst bleibt sichtbar, auch wenn es nichts
 * mehr anbietet (Christian, 23.09.2026). Zwei Auslegungen wuerden auseinanderlaufen,
 * und dann zeigte das CRM eine Wohnung an, die der Import laengst fuer
 * verkauft haelt. Deshalb nur reine Funktionen ohne Deno- oder Browser-API.
 *
 * Die Felder stehen in der oeffentlichen OpenAPI-Beschreibung von Investagon
 * (api.investagon.com/api/docs.json, nachgelesen am 23.09.2026), und zwar an
 * der Einheit (`Property`), nicht am Projekt:
 *
 *   active      0 Verkauft, 1 Frei, 5 Angefragt, 6 Reserviert,
 *               7 Notartermin, 9 Notarvorbereitung
 *   visibility  -1 Offline, 0 Ueberpruefung ausstehend, 1 Online
 *   draft       0 Nein, 1 Ja (nur im Einzelabruf, nicht in der Kurzliste)
 *
 * Christian hat am 23.09.2026 mit einer Abfrage bestaetigt, dass
 * `visibility` genau der Spalte "Sichtbarkeit" in Investagon entspricht.
 */

/** Wie eine Einheit aus Sicht von Investagon dasteht. */
export type EinheitAngebot =
  | "angeboten"
  | "verkauft"
  | "offline"
  | "pruefung"
  | "entwurf"
  | "unbekannt";

/**
 * Eine ganze Zahl aus einem Feld, das Investagon mal als Zahl, mal als Text
 * liefert. Alles andere, auch ein fehlendes Feld, ist `null`.
 */
function ganzzahl(wert: unknown): number | null {
  if (typeof wert === "number") return Number.isFinite(wert) ? wert : null;
  if (typeof wert === "string" && wert.trim() !== "") {
    const n = Number(wert.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Der Zustand einer Einheit nach ihren Investagon-Rohdaten.
 *
 * Reihenfolge ist Absicht: Verkauft zuerst, weil es der teuerste Fehler ist
 * (Christian: ein Partner darf nie eine verkaufte Wohnung anbieten), und
 * weil verkaufte Einheiten in Investagon haeufig zugleich offline stehen.
 * Dann der Entwurf, dann die Sichtbarkeit.
 *
 * Fehlt eine Angabe, heisst das Ergebnis "unbekannt" und NICHT "offline".
 * Eine Luecke in den Daten darf nie dazu fuehren, dass etwas verschwindet.
 */
export function einheitAngebot(roh: unknown): EinheitAngebot {
  if (!roh || typeof roh !== "object" || Array.isArray(roh)) return "unbekannt";
  const r = roh as Record<string, unknown>;
  if (ganzzahl(r.active) === 0) return "verkauft";
  if (r.draft === true || ganzzahl(r.draft) === 1) return "entwurf";
  const sichtbarkeit = ganzzahl(r.visibility);
  if (sichtbarkeit === 1) return "angeboten";
  if (sichtbarkeit === 0) return "pruefung";
  if (sichtbarkeit === -1) return "offline";
  return "unbekannt";
}

/**
 * Darf diese Einheit in einer Angebotsliste stehen?
 *
 * `status` ist der CRM-Status der Einheit, `roh` ihr Investagon-Datensatz
 * (`meta.investagonRaw`). Nicht im Angebot ist eine Einheit, die im CRM
 * verkauft ist, oder die Investagon verkauft, offline, in Ueberpruefung oder
 * als Entwurf fuehrt. Eine von Hand gepflegte Einheit ohne Rohdaten richtet
 * sich allein nach ihrem CRM-Status.
 */
export function istImAngebot(
  status: string | null | undefined,
  roh: unknown,
): boolean {
  if (String(status || "").trim().toLowerCase() === "verkauft") return false;
  const angebot = einheitAngebot(roh);
  return angebot === "angeboten" || angebot === "unbekannt";
}
