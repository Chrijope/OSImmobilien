/** Interpret appointment fields in the business timezone, independent of the device timezone. */
export function meetingZeitISO(datum: string, uhrzeit: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum) || !/^\d{2}:\d{2}$/.test(uhrzeit)) throw new Error('Datum oder Uhrzeit ungültig.');
  const target = Date.parse(`${datum}T${uhrzeit}:00Z`);
  if (!Number.isFinite(target)) throw new Error('Datum oder Uhrzeit ungültig.');
  const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  let time = target;
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(time).map((p) => [p.type, p.value]));
    const local = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
    if (local === `${datum}T${uhrzeit}`) return new Date(time).toISOString();
    time += target - Date.parse(`${local}:00Z`);
  }
  throw new Error('Diese Uhrzeit existiert wegen der Zeitumstellung nicht. Bitte eine andere Zeit wählen.');
}

/**
 * Jetzt als Berliner Wanduhr, also so, wie es in den Feldern „Datum" und
 * „Uhrzeit (Berlin)" steht: `{ datum: "YYYY-MM-DD", uhrzeit: "HH:MM" }`.
 *
 * Bewusst nicht die Uhr des Browsers: Die Datenbank rechnet in
 * `Europe/Berlin` (siehe `meeting_anlegen`). Bei einem Gerät in einer anderen
 * Zone wäre sonst rund um Mitternacht und in der Zeitumstellung ein anderer
 * Tag gemeint als in der Datenbank.
 */
export function berlinJetzt(jetzt: Date = new Date()): { datum: string; uhrzeit: string } {
  const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(formatter.formatToParts(jetzt).map((x) => [x.type, x.value]));
  return { datum: `${p.year}-${p.month}-${p.day}`, uhrzeit: `${p.hour}:${p.minute}` };
}

/**
 * Liegt ein Meeting in der Zukunft?
 *
 * Gerechnet wird über `meetingZeitISO`, also mit genau der Umrechnung, mit der
 * das Meeting auch gespeichert wird. Damit lehnt die Oberfläche genau das ab,
 * was `meeting_anlegen` mit `_start <= now()` ebenfalls ablehnen würde, und
 * blockiert nichts, was die Datenbank erlauben würde.
 *
 * Eine Uhrzeit, die es wegen der Zeitumstellung nicht gibt, gilt als nicht in
 * der Zukunft. Auch die Datenbank weist sie zurück.
 */
export function meetingZeitInZukunft(datum: string, uhrzeit: string, jetzt: Date = new Date()): boolean {
  try {
    return Date.parse(meetingZeitISO(datum, uhrzeit.slice(0, 5))) > jetzt.getTime();
  } catch {
    return false;
  }
}

/**
 * So viel Luft bekommt der Vorschlag, damit er beim Absenden noch gilt.
 *
 * Christians Vorgabe vom 19.09.2026: Datum immer heute, Uhrzeit so nah an der
 * aktuellen wie möglich. Die exakt aktuelle Minute geht dabei nicht, sie wäre
 * beim Absenden schon Vergangenheit und würde von `meeting_anlegen`
 * (`_start <= now()`) abgewiesen. Fünf Minuten sind der kleinste Abstand, der
 * das Ausfüllen des Formulars sicher überlebt.
 */
const VORLAUF_MINUTEN = 5;

/**
 * Der Terminvorschlag beim Öffnen von „Meeting erstellen".
 *
 * Regel: jetzt plus fünf Minuten, ohne Rundung.
 *
 * Bis zum 19.09.2026 galt hier etwas anderes: jetzt plus dreißig Minuten,
 * aufgerundet auf die nächste halbe Stunde, ab 18 Uhr auf den nächsten Tag um
 * 9 Uhr und vor 9 Uhr auf denselben Tag um 9 Uhr. Das war gut gemeint, führte
 * aber dazu, dass am späten Nachmittag gar nicht mehr das heutige Datum
 * vorgeschlagen wurde, und genau das hat gestört: Wer um 17:40 ein Meeting für
 * gleich anlegen will, bekam den nächsten Morgen angeboten und musste beide
 * Felder von Hand ändern.
 *
 * Über Mitternacht wechselt das Datum weiterhin, und zwar zwangsläufig: Um
 * 23:58 plus fünf Minuten gibt es kein „heute" mehr, das in der Zukunft läge.
 *
 * Wochenenden und Feiertage bleiben absichtlich außen vor: Dafür müsste der
 * Kalender des Beraters her, und ein falsch übersprungener Tag wäre ärgerlicher
 * als ein Samstag, den man einmal überschreibt.
 */
export function meetingVorschlag(jetzt: Date = new Date()): { datum: string; uhrzeit: string } {
  /*
   * Bis zu vier Anläufe, jeweils fünf Minuten weiter.
   *
   * An den beiden Tagen der Zeitumstellung reicht reines Rechnen auf der
   * Wanduhr nicht: Im Frühjahr gibt es eine Stunde gar nicht, im Herbst gibt es
   * eine doppelt und dann meint die abgelesene Uhrzeit den früheren, bereits
   * vergangenen Durchlauf. Statt diese Fälle einzeln zu behandeln, wird der
   * Vorschlag mit derselben Regel geprüft, die auch beim Absenden gilt, und bei
   * Bedarf weitergeschoben.
   */
  let zeitpunkt = jetzt.getTime() + VORLAUF_MINUTEN * 60_000;
  for (let versuch = 0; versuch < 4; versuch++) {
    const kandidat = berlinJetzt(new Date(zeitpunkt));
    if (meetingZeitInZukunft(kandidat.datum, kandidat.uhrzeit, jetzt)) return kandidat;
    zeitpunkt += VORLAUF_MINUTEN * 60_000;
  }
  // Rückfall für den Fall, dass selbst das nicht greift: eine Stunde später
  // liegt sicher hinter jeder Umstellungslücke.
  return berlinJetzt(new Date(jetzt.getTime() + 3_600_000));
}
