import type { Bewerber } from "./bewerbungStore";

/**
 * Was das CRM über die Sammelmail zum Kennenlernen wissen muss.
 *
 * Der Versand selbst läuft in `send-bewerber-nachfass`, die Abmeldung in
 * `bewerber-kein-interesse`. Hier steht nur die Rechnung für den
 * Hinweisbalken im Abschnitt Eingang.
 *
 * **Warum es zwei Merker gibt.** Im September 2026 ging eine erste Welle
 * hinaus, die zur Terminbuchung führte; sie steht in `nachfassMailAm`. Seit
 * dem 12.09.2026 gilt die Sammelmail zum Kennenlernen, die zum
 * Kennenlernbogen führt; sie steht in `klNachfassMailAm`. Der Balken zeigt
 * die neue Welle, denn sie ist die laufende. Läse er weiter den alten
 * Merker, stünde dort die Zahl der ersten Welle, während die zweite läuft,
 * und genau das war der Fall: Nach dem Versand an 36 Bewerber meldete der
 * Balken unverändert 180.
 *
 * **Warum zusätzlich eine Zahl für den Eingang.** Die Frage, die HR nach
 * einer Welle wirklich hat, lautet nicht „wie viele wurden angeschrieben",
 * sondern „ist der Eingang jetzt durch". Deshalb zählt `offenImEingang`, wer
 * im Eingang liegt und die Mail noch nicht hat. Diese Zahl ist bewusst roh:
 * Sie enthält auch die Bewerber, die ihren Bogen längst abgeschickt haben
 * und die Mail deshalb gar nicht bekommen sollen. Welcher Teil davon
 * tatsächlich angeschrieben würde, weiß nur der Versanddialog, weil nur er
 * die Bögen aus `bewerber_formular` kennt. Der Balken sagt deshalb, dass die
 * Aufschlüsselung dort steht, statt sie zu erfinden.
 */

export interface NachfassStand {
  /** ISO-Zeitpunkt der letzten Welle, null wenn noch nie gesendet. */
  letzterVersand: string | null;
  /** Wie viele Bewerber sich seit dieser Welle selbst abgemeldet haben. */
  abgemeldet: number;
  /** Wie viele die Mail insgesamt bekommen haben. */
  angeschrieben: number;
  /** Wie viele im Eingang liegen, ganz gleich ob angeschrieben oder nicht. */
  imEingang: number;
  /** Wie viele davon die Mail noch nicht haben. */
  offenImEingang: number;
}

/** Was der Balken je Bewerber braucht. */
export type NachfassBewerber = Pick<
  Bewerber,
  "klNachfassMailAm" | "selbstAbgemeldetAm" | "status"
>;

function gueltig(iso?: string): boolean {
  return !!iso && !Number.isNaN(new Date(iso).getTime());
}

/**
 * Gezählt wird über selbstAbgemeldetAm nach dem letzten Versanddatum. Wer
 * die Mail bekam, kann inzwischen in jedem Status stehen, deshalb geht die
 * ganze Liste hinein, nicht nur der Eingang.
 */
export function nachfassStand(bewerber: NachfassBewerber[]): NachfassStand {
  const imEingang = bewerber.filter((b) => b.status === "Eingang").length;
  const offenImEingang = bewerber.filter(
    (b) => b.status === "Eingang" && !gueltig(b.klNachfassMailAm),
  ).length;

  const versandZeiten = bewerber.map((b) => b.klNachfassMailAm || "").filter(gueltig);
  const angeschrieben = versandZeiten.length;
  if (angeschrieben === 0) {
    return { letzterVersand: null, abgemeldet: 0, angeschrieben: 0, imEingang, offenImEingang };
  }

  // Eine Welle dauert Sekunden, ihre Zeitstempel liegen dicht beieinander.
  // Für den Balken zählt der jüngste; wer sich vor der Welle abgemeldet
  // hat, kann nicht auf sie reagiert haben.
  const letzterVersand = versandZeiten.reduce((a, b) => (a > b ? a : b));
  const grenze = new Date(letzterVersand).getTime();
  const abgemeldet = bewerber.filter(
    (b) => gueltig(b.selbstAbgemeldetAm) && new Date(b.selbstAbgemeldetAm as string).getTime() >= grenze,
  ).length;

  return { letzterVersand, abgemeldet, angeschrieben, imEingang, offenImEingang };
}

/** "3. September 2026" für den Hinweisbalken. */
export function versandDatumText(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
}

/** Der Satz im Balken, mit richtiger Einzahl und Mehrzahl. */
export function nachfassHinweisText(stand: NachfassStand): string {
  if (!stand.letzterVersand) return "";
  const datum = versandDatumText(stand.letzterVersand);
  const n = stand.abgemeldet;
  const wer = n === 1 ? "hat sich 1 Bewerber" : `haben sich ${n} Bewerber`;
  return `Seit dem Versand am ${datum} ${wer} abgemeldet.`;
}

/**
 * Der zweite Satz: Wie weit ist der Eingang durch?
 *
 * Steht hier eine Zahl größer null, heißt das nicht, dass so viele Mails
 * fehlen. Es heißt, dass so viele im Eingang die Mail nicht haben, und der
 * größere Teil davon hat seinen Bogen bereits abgeschickt. Der Satz sagt das
 * ausdrücklich, weil die nackte Zahl sonst nach einer Panne aussieht.
 */
export function eingangStandText(stand: NachfassStand): string {
  if (stand.imEingang === 0) return "";
  const hat = stand.imEingang - stand.offenImEingang;
  if (stand.offenImEingang === 0) {
    return `Alle ${stand.imEingang} im Eingang haben sie.`;
  }
  return (
    `${hat} von ${stand.imEingang} im Eingang haben sie. ` +
    `Die übrigen ${stand.offenImEingang} sind entweder mit ihrem Bogen schon durch ` +
    `oder stehen noch aus; der Versanddialog zeigt für jeden den Grund.`
  );
}
