/**
 * „Wie lief das Gespräch?“: die Glocke am Morgen nach einem Termin, für den
 * niemand ein Ergebnis eingetragen hat (seit 24.10.2026).
 *
 * Im Kundenprofil steht zu jedem Termin eine Ergebnis-Karte mit Erschienen,
 * No-Show und Verschoben. Klickt niemand, passierte bisher nichts. So blieben
 * Vorgänge in „Erstgespräch geplant“ stehen, obwohl das Gespräch längst war.
 *
 * Regeln:
 *   - Nur Termine von gestern und vorgestern (Berliner Tag). Ältere nicht, sonst
 *     käme beim ersten Lauf eine Flut alter Glocken.
 *   - Erst ab 8 Uhr Berliner Zeit, also am Morgen danach.
 *   - Nur wenn der Termin offen ist: kein `erledigt_am` an der Aktivität und,
 *     falls eine Buchung dahintersteht, deren Status noch „offen“.
 *   - Nur an den Zuständigen des Kontakts (Christian: Glocken nur aus
 *     Prozessen und nur an den Zuständigen).
 *   - Je Termin und Tag genau einmal, über `meta.sperre` und den eindeutigen
 *     Index aus 20261004191000.
 */

/** Der Tag in Berlin als yyyy-mm-dd. */
export function berlinerTag(zeitpunkt: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(zeitpunkt);
}

/** Die volle Stunde in Berlin, 0 bis 23. */
export function berlinerStunde(zeitpunkt: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(zeitpunkt));
}

/**
 * Alle Schreibweisen eines Tages, die in `aktivitaeten.faellig_am` vorkommen
 * (yyyy-mm-dd und deutsch mit und ohne führende Null).
 */
export function schreibweisen(tagIso: string): string[] {
  const [jahr, monat, tag] = tagIso.split("-");
  const m = String(Number(monat));
  const t = String(Number(tag));
  return [...new Set([tagIso, `${tag}.${monat}.${jahr}`, `${t}.${m}.${jahr}`, `${t}.${monat}.${jahr}`, `${tag}.${m}.${jahr}`])];
}

/** Ein deutsches oder ISO-Datum als yyyy-mm-dd, sonst null. */
export function alsIsoTag(wert: string | null | undefined): string | null {
  const s = (wert || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  return d ? `${d[3]}-${d[2].padStart(2, "0")}-${d[1].padStart(2, "0")}` : null;
}

export const NACHFRAGE_AB_STUNDE = 8;

/** Die Tage, deren Termine heute nachgefragt werden. Leer vor 8 Uhr. */
export function nachfrageTage(jetzt: Date): string[] {
  if (berlinerStunde(jetzt) < NACHFRAGE_AB_STUNDE) return [];
  const tag = 24 * 60 * 60 * 1000;
  return [berlinerTag(new Date(jetzt.getTime() - tag)), berlinerTag(new Date(jetzt.getTime() - 2 * tag))];
}

export interface NachfrageTermin {
  id: string;
  kunde_id: string | null;
  beschreibung: string | null;
  faellig_am: string | null;
  uhrzeit: string | null;
  erledigt_am: string | null;
}

export interface NachfrageGlocke {
  benutzer_id: string;
  titel: string;
  nachricht: string;
  link: string;
  gelesen: false;
  meta: { sperre: string; kundeId: string; aktivitaetId: string; notif_type: "termin_nachfrage" };
}

/**
 * Aus Terminen, Buchungsstatus und Zuständigen die Glocken bauen. Ohne Netz,
 * damit es sich prüfen lässt.
 */
export function baueNachfrageGlocken(eingabe: {
  termine: NachfrageTermin[];
  /** Status der Buchung je Aktivität, falls eine dahintersteht. */
  buchungsStatus: Map<string, string>;
  /** Zuständiger und Name je Kontakt. */
  kontakte: Map<string, { zustaendigId: string | null; name: string }>;
  tage: string[];
}): NachfrageGlocke[] {
  const erlaubt = new Set(eingabe.tage);
  const glocken: NachfrageGlocke[] = [];
  for (const t of eingabe.termine) {
    const tag = alsIsoTag(t.faellig_am);
    if (!tag || !erlaubt.has(tag)) continue;
    if (t.erledigt_am) continue;
    const status = eingabe.buchungsStatus.get(t.id);
    if (status && status !== "offen") continue;
    if (!t.kunde_id) continue;
    const kontakt = eingabe.kontakte.get(t.kunde_id);
    if (!kontakt?.zustaendigId) continue;
    const [jahr, monat, tagZahl] = tag.split("-");
    const wann = `${tagZahl}.${monat}.${jahr}${t.uhrzeit ? ` um ${t.uhrzeit.slice(0, 5)}` : ""}`;
    const was = (t.beschreibung || "Termin").trim().slice(0, 80);
    glocken.push({
      benutzer_id: kontakt.zustaendigId,
      titel: `Wie lief der Termin mit ${kontakt.name}?`,
      nachricht: `${was} am ${wann}: Es ist noch kein Ergebnis eingetragen. Bitte im Kundenprofil Erschienen, No-Show oder Verschoben wählen.`,
      link: `/kunden/${t.kunde_id}`,
      gelesen: false,
      meta: { sperre: `termin-nachfrage:${t.id}:${tag}`, kundeId: t.kunde_id, aktivitaetId: t.id, notif_type: "termin_nachfrage" },
    });
  }
  return glocken;
}
