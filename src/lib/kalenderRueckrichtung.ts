import { cacheFilter, cacheUpdate } from "@/lib/dataCache";
import { getUserSetting } from "@/lib/userSettingsCache";
import { terminZeitpunkt } from "@/lib/kalenderSync";

/**
 * Die Gegenrichtung: Aenderungen aus dem eigenen Kalender zurueck ins CRM.
 *
 * Bewusst eng gefasst, und zwar aus zwei Gruenden.
 *
 * Erstens werden ausschliesslich Termine betrachtet, die das CRM selbst
 * angelegt hat. Nur die tragen eine `kalender_event_id`. Fremde Eintraege aus
 * dem Privatkalender bleiben aussen vor, sonst landete jeder Zahnarzttermin
 * als Kundentermin in einer Akte.
 *
 * Zweitens wird nur das Verschieben selbst uebernommen. Ein im Kalender
 * geloeschter Termin wird gemeldet, aber nicht im CRM geloescht. Ein
 * Loeschvorgang, den niemand bestaetigt hat, darf keine Daten wegnehmen.
 *
 * Und eine Einschraenkung, die man kennen muss: Das hier laeuft, wenn der
 * CRM-Kalender geoeffnet wird. Es ist kein Dienst, der im Hintergrund lauscht.
 * Wer einen Termin im Handy verschiebt, sieht die Aenderung im CRM also beim
 * naechsten Blick in den Kalender, nicht in derselben Sekunde.
 */

/**
 * iCloud liefert Zeitstempel im CalDAV-Format, etwa "20260803T140000Z" oder
 * "20260803" fuer ganztaegige Eintraege. JavaScript kann das nicht lesen und
 * macht daraus ein ungueltiges Datum. Deshalb hier die Umschrift nach ISO.
 *
 * Das betraf nicht nur den Abgleich: Im CRM-Kalender stand bei jedem
 * Apple-Termin "Invalid Date", weil die Anzeige denselben Wert direkt an
 * `new Date` weiterreichte.
 */
export function fremdZeitZuIso(wert: string | null | undefined): string {
  const roh = (wert ?? "").trim();
  if (!roh) return "";
  // Schon ISO, etwa von Google.
  if (roh.includes("-")) return roh;

  const mitZeit = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(roh);
  if (mitZeit) {
    const [, j, m, tg, st, mi, se, z] = mitZeit;
    return `${j}-${m}-${tg}T${st}:${mi}:${se}${z ? "Z" : ""}`;
  }

  const nurTag = /^(\d{4})(\d{2})(\d{2})$/.exec(roh);
  if (nurTag) {
    const [, j, m, tg] = nurTag;
    return `${j}-${m}-${tg}`;
  }

  return roh;
}

export interface FremdTermin {
  id: string;
  start: string;
  summary?: string;
}

export interface AbgleichErgebnis {
  /** Termine, deren Zeit aus dem Kalender uebernommen wurde. */
  verschoben: Array<{ id: string; titel: string; vorher: string; nachher: string }>;
  /** Termine, die im Kalender fehlen. Sie bleiben im CRM stehen. */
  verschwunden: Array<{ id: string; titel: string; zeitpunkt: string }>;
}

interface AktivitaetZeile {
  id: string;
  art: string;
  beschreibung: string | null;
  faellig_am: string | null;
  uhrzeit: string | null;
  kalender_event_id: string | null;
}

/** Der Schalter "Änderungen aus dem Kalender übernehmen" in den Einstellungen. */
export function rueckrichtungAktiv(): boolean {
  const kalender = getUserSetting<{ syncOptionen?: { rueckrichtung?: boolean } } | null>("kalender", null);
  // Standard ist aus. Wer seine CRM-Termine im Kalender verschiebt, soll das
  // erst bewusst einschalten, sonst wandern Termine, ohne dass jemand es will.
  return kalender?.syncOptionen?.rueckrichtung === true;
}

/** Uhrzeit aus einem Zeitstempel, wie sie an der Aktivitaet steht. */
function uhrzeitAus(datum: Date): string {
  return `${String(datum.getHours()).padStart(2, "0")}:${String(datum.getMinutes()).padStart(2, "0")}`;
}

function tagAus(datum: Date): string {
  return `${datum.getFullYear()}-${String(datum.getMonth() + 1).padStart(2, "0")}-${String(datum.getDate()).padStart(2, "0")}`;
}

/**
 * Vergleicht die aus dem Kalender geholten Termine mit den CRM-Terminen und
 * uebernimmt Verschiebungen.
 *
 * `vonISO` und `bisISO` grenzen den Zeitraum ein, den der Kalender geliefert
 * hat. Ohne diese Grenze saehe jeder Termin ausserhalb des Zeitfensters wie
 * geloescht aus.
 */
export async function gleicheKalenderAb(
  termine: FremdTermin[],
  zeitraum: { vonISO: string; bisISO: string },
): Promise<AbgleichErgebnis> {
  const ergebnis: AbgleichErgebnis = { verschoben: [], verschwunden: [] };
  if (!rueckrichtungAktiv()) return ergebnis;

  const nachId = new Map<string, FremdTermin>();
  for (const t of termine) {
    if (t.id) nachId.set(t.id, t);
  }

  const von = new Date(zeitraum.vonISO).getTime();
  const bis = new Date(zeitraum.bisISO).getTime();

  const verknuepfte = cacheFilter<AktivitaetZeile>(
    "aktivitaeten",
    (r) => Boolean(r.kalender_event_id) && r.art === "meeting",
  );

  for (const eintrag of verknuepfte) {
    const eigenerStart = terminZeitpunkt(eintrag.faellig_am ?? undefined, eintrag.uhrzeit ?? undefined);
    if (!eigenerStart) continue;
    const eigenerMs = new Date(eigenerStart).getTime();
    // Nur was im geholten Zeitfenster liegt, laesst sich ueberhaupt beurteilen.
    if (eigenerMs < von || eigenerMs > bis) continue;

    const titel = eintrag.beschreibung || "Termin";
    const fremd = nachId.get(eintrag.kalender_event_id!);

    if (!fremd) {
      ergebnis.verschwunden.push({ id: eintrag.id, titel, zeitpunkt: eigenerStart });
      continue;
    }

    const fremdDatum = new Date(fremdZeitZuIso(fremd.start));
    if (Number.isNaN(fremdDatum.getTime())) continue;

    // Eine Minute Spielraum: Sekunden und Zeitzonenrundungen sollen keine
    // Verschiebung auslösen.
    if (Math.abs(fremdDatum.getTime() - eigenerMs) < 60_000) continue;

    const neuerTag = tagAus(fremdDatum);
    const neueUhrzeit = uhrzeitAus(fremdDatum);
    const ok = await cacheUpdate(
      "aktivitaeten",
      eintrag.id,
      { faellig_am: neuerTag, uhrzeit: neueUhrzeit },
      { silent: true },
    );
    if (!ok) continue;

    ergebnis.verschoben.push({
      id: eintrag.id,
      titel,
      vorher: eigenerStart,
      nachher: fremdDatum.toISOString(),
    });
  }

  return ergebnis;
}
