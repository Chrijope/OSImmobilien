/**
 * Ladezeit der Selbstauskunft, ablesbar in der Browser-Konsole.
 *
 * Gemessen wird die Strecke vom Klick auf "Selbstauskunft ausfuellen" bis zu
 * dem Augenblick, in dem das Formular tatsaechlich auf dem Bildschirm steht.
 * Dazwischen werden die einzelnen Abschnitte genannt, damit sichtbar wird,
 * woran die Zeit haengt: der Seitenwechsel, das Warten auf die Datenbank oder
 * der Aufbau des Formulars selbst.
 *
 * Derselbe Schalter wie beim Zwischenspeicher (`dataCache.ts`): aktiv im
 * Dev-Modus und in der Lovable-Vorschau, sonst erst nach
 * `localStorage.setItem("crm.ladezeiten", "1")`. In der veroeffentlichten
 * Fassung bleibt die Konsole also still.
 */
import { ladezeitenAktiv } from "./dataCache";

function jetztMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** Zeitpunkt des Klicks. Null, solange keine Messung laeuft. */
let klickZeit: number | null = null;
/** Zeitpunkt des zuletzt gemeldeten Abschnitts, fuer die Teilzeiten. */
let letzterSchritt = 0;

/**
 * Den Klick auf die Selbstauskunft als Startpunkt merken.
 *
 * Gibt die Zieladresse unveraendert zurueck, damit der Aufruf direkt um das
 * `navigate(...)` gelegt werden kann und an der Aufrufstelle nichts weiter
 * umgebaut werden muss.
 */
export function saKlickGemerkt(ziel: string): string {
  if (!ladezeitenAktiv()) return ziel;
  klickZeit = jetztMs();
  letzterSchritt = klickZeit;
  console.info("[SA-Ladezeit] Klick auf die Selbstauskunft");
  return ziel;
}

/** Einen Abschnitt melden: Zeit seit dem Klick und seit dem letzten Abschnitt. */
export function saLadeschritt(text: string): void {
  if (!ladezeitenAktiv()) return;
  const jetzt = jetztMs();
  if (klickZeit === null) {
    // Die Seite wurde direkt aufgerufen (neuer Tab, Neuladen, Lesezeichen).
    // Dann gibt es keinen Klick, und die Messung beginnt hier.
    klickZeit = jetzt;
    letzterSchritt = jetzt;
    console.info("[SA-Ladezeit] Seite direkt geoeffnet, Messung beginnt hier");
  }
  const seitKlick = Math.round(jetzt - klickZeit);
  const seitSchritt = Math.round(jetzt - letzterSchritt);
  letzterSchritt = jetzt;
  console.info(`[SA-Ladezeit +${seitKlick} ms] ${text} (+${seitSchritt} ms)`);
}

/** Letzter Abschnitt: melden und die Messung schliessen. */
export function saLadeschrittEnde(text: string): void {
  if (!ladezeitenAktiv()) return;
  saLadeschritt(text);
  klickZeit = null;
}
