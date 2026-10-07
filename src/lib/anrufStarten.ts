import { addAktivitaetSicher } from "./aktivitaetenStore";
import { getCurrentUserId } from "./currentUser";
import { normalizeTelefon, telefonAnzeige } from "./phoneUtils";

/**
 * Startet einen Anruf über das Telefonsystem des Geräts.
 *
 * Der Aufruf läuft bewusst über ein unsichtbares Anker-Element statt über
 * `window.location.href`. Damit bleibt die aktuelle Seite unangetastet, das
 * Anruf-Protokoll kann also im Vordergrund geöffnet bleiben, während das
 * Betriebssystem die Telefon-App übernimmt.
 *
 * Hinweis: Ob der Browser vorher noch nachfragt ("Telefon öffnen?"), legt der
 * Browser selbst fest. Das lässt sich aus einer Web-Anwendung heraus nicht
 * unterdrücken; der Haken "immer erlauben" in dieser Abfrage schaltet sie für
 * die Zukunft dauerhaft ab.
 */
export function starteAnruf(telefon: string | undefined | null): void {
  const nummer = (telefon || "").replace(/[\s()\/-]/g, "");
  if (!nummer) return;
  const a = document.createElement("a");
  a.href = `tel:${nummer}`;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 0);
}

/**
 * Wo im CRM auf die Nummer geklickt wurde. Steht im Verlauf, damit später
 * nachvollziehbar ist, aus welcher Ansicht heraus gewählt wurde.
 */
export type AnrufQuelle = "Kundenprofil" | "Alle Kontakte" | "Powerdialer" | "Schnellaktion";

/** Ein zweiter Klick innerhalb dieser Zeit legt keinen zweiten Eintrag an. */
export const ANRUF_VERMERK_SPERRE_MS = 60_000;

/** Letzter Vermerk je Kontakt und Nummer, nur im Arbeitsspeicher dieses Tabs. */
const letzteVermerke = new Map<string, number>();

/** Nur für Tests: vergisst die Sperre aus früheren Klicks. */
export function vergissAnrufVermerke(): void {
  letzteVermerke.clear();
}

/**
 * Startet den Anruf und vermerkt ihn im Verlauf des Kontakts.
 *
 * Entscheidung vom 25.09.2026: Statt einer eigenen Anrufliste steht jeder
 * Klick auf eine Kundennummer als Aktivität im Kundenprofil, mit Nummer,
 * Zeitpunkt und dem, der geklickt hat. Erfasst wird damit nur der
 * Wählvorgang. Ob jemand abgenommen hat, weiß das CRM nicht; das zeigt
 * weiterhin nur das Anruf-Protokoll. Deshalb eine eigene Art
 * `anruf_gestartet` und nicht `anruf` oder `anruf_protokoll`.
 *
 * Der Anruf geht immer zuerst hinaus. Das Speichern läuft danach nebenher
 * und darf ihn weder aufhalten noch verhindern, auch nicht mit einem Fehler.
 */
export function starteAnrufFuerKontakt(
  kontaktId: string | undefined | null,
  telefon: string | undefined | null,
  quelle: AnrufQuelle,
  /** Anzeigename dessen, der klickt. Ohne Angabe ermittelt der Store ihn über die Kennung. */
  von?: string,
): void {
  starteAnruf(telefon);
  try {
    vermerkeAnrufGestartet(kontaktId, telefon, quelle, von);
  } catch (e) {
    console.warn("Anruf nicht im Verlauf vermerkt:", e);
  }
}

function vermerkeAnrufGestartet(
  kontaktId: string | undefined | null,
  telefon: string | undefined | null,
  quelle: AnrufQuelle,
  von?: string,
): void {
  const nummer = normalizeTelefon(telefon);
  if (!kontaktId || !nummer) return;

  const schluessel = `${kontaktId}|${nummer}`;
  const jetzt = Date.now();
  const zuletzt = letzteVermerke.get(schluessel);
  if (zuletzt !== undefined && jetzt - zuletzt < ANRUF_VERMERK_SPERRE_MS) return;
  letzteVermerke.set(schluessel, jetzt);

  // Schlägt das Speichern fehl, darf ein späterer Klick es erneut versuchen.
  const freigeben = () => {
    if (letzteVermerke.get(schluessel) === jetzt) letzteVermerke.delete(schluessel);
  };

  // Bewusst still: Ein Fehler-Toast nach einem Klick auf die Nummer wäre
  // mitten im Wählen nicht zuzuordnen. addAktivitaetSicher meldet einen
  // Fehler nur über den Rückgabewert.
  void addAktivitaetSicher({
    kundeId: kontaktId,
    art: "anruf_gestartet",
    beschreibung: `Anruf gestartet: ${telefonAnzeige(telefon) || nummer}`,
    details: `Über ${quelle}. Erfasst ist nur der Klick auf die Nummer, ob das Gespräch zustande kam, steht im Anruf-Protokoll.`,
    // Wer geklickt hat, steht über die Kennung fest, der Name ist nur Anzeige.
    benutzerId: getCurrentUserId() || undefined,
    ...(von ? { von } : {}),
  })
    .then((eintrag) => {
      if (!eintrag) freigeben();
    })
    .catch((e) => {
      freigeben();
      console.warn("Anruf nicht im Verlauf vermerkt:", e);
    });
}
