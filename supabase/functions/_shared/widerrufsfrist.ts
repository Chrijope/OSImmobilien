/**
 * Ab wann eine Reservierung mit abgewarteter Widerrufsfrist wirksam wird.
 *
 * Entscheidung vom 04.10.2026: wirksam ab 00:00 Uhr deutscher Zeit am
 * 15. Kalendertag nach dem Tag der letzten Unterschrift. Der Unterschriftstag
 * selbst zaehlt nicht mit (§ 187 Abs. 1 BGB), die vierzehn Tage Frist laufen
 * also vom Folgetag bis zum Ende des 14. Tages (§ 188 Abs. 1 BGB).
 *
 * Bis dahin stand hier „Unterschrift plus 14 mal 24 Stunden“. Das traf weder
 * den Fristbeginn noch Mitternacht und verrutschte bei der Zeitumstellung um
 * eine Stunde.
 *
 * Bewusst ohne Importe, damit Vitest die Datei aus `src/` testen kann.
 */

export const WIDERRUFSFRIST_TAGE = 14;

const BERLIN = "Europe/Berlin";

/** Kalendertag eines Zeitpunkts in deutscher Zeit. */
function berlinerTag(zeitpunkt: Date): { j: number; m: number; t: number } {
  const teile = new Intl.DateTimeFormat("en-CA", {
    timeZone: BERLIN,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(zeitpunkt).split("-");
  return { j: Number(teile[0]), m: Number(teile[1]), t: Number(teile[2]) };
}

/** Abstand Berlin zu UTC in Millisekunden zum gegebenen Zeitpunkt. */
function berlinerVersatz(zeitpunkt: Date): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: BERLIN,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    }).formatToParts(zeitpunkt).map((x) => [x.type, Number(x.value)]),
  );
  const alsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return alsUtc - Math.floor(zeitpunkt.getTime() / 1000) * 1000;
}

/**
 * Beginn der Wirksamkeit als ISO-Text (UTC), fuer `rvReservierungAb`.
 * Gibt `null` zurueck, wenn die Unterschriftszeit nicht lesbar ist.
 */
export function reservierungWirksamAb(unterschriftIso: string): string | null {
  const unterschrift = new Date(unterschriftIso);
  if (isNaN(unterschrift.getTime())) return null;
  const { j, m, t } = berlinerTag(unterschrift);
  // Mitternacht als UTC-Naeherung; Date.UTC rollt Monats- und Jahresende weiter.
  const naeherung = new Date(Date.UTC(j, m - 1, t + WIDERRUFSFRIST_TAGE + 1));
  // Mitternacht faellt nie in die Umstellungsstunde (02:00 bzw. 03:00 Uhr),
  // der Versatz um 00:00 UTC ist deshalb derselbe wie um 00:00 Berliner Zeit.
  return new Date(naeherung.getTime() - berlinerVersatz(naeherung)).toISOString();
}

/** Ist der Zeitpunkt `ab` erreicht? Unlesbare Werte gelten als nicht faellig. */
export function widerrufsfristAbgelaufen(ab: unknown, jetzt: Date = new Date()): boolean {
  if (typeof ab !== "string" || !ab) return false;
  const d = new Date(ab);
  return !isNaN(d.getTime()) && d.getTime() <= jetzt.getTime();
}
