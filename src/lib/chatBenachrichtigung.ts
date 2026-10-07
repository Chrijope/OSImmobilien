/**
 * Die Angaben der Mail "Neue Nachricht", an genau einer Stelle.
 *
 * Warum es diese Datei gibt: Die Vorlage `chat-nachricht` heisst ihre beiden
 * Namensfelder `kundeName` und `beraterName`, benutzt sie aber nicht so. Die
 * Mail laeuft in beide Richtungen:
 *
 *   `kundeName`   ist der EMPFAENGER und steht allein in der Anrede.
 *   `beraterName` ist der ABSENDER und steht im Titel und im Betreff.
 *
 * Schreibt der Kunde an seinen Partner, steht deshalb der Partner unter
 * `kundeName`. Das sieht an der Aufrufstelle nach einer Verwechslung aus und
 * ist keine. Wer die Felder nach ihren Namen belegt statt nach ihrer
 * Bedeutung, dreht Anrede und Betreff um. Damit das nicht zweimal richtig
 * sein muss, wird die Zuordnung nur hier getroffen.
 */

import { beraterMailFelder, findeBerater } from "./mailBerater";

/** Wie viele Zeichen der Auszug der Nachricht hoechstens zeigt. */
export const CHAT_VORSCHAU_ZEICHEN = 200;

export interface ChatMailAngaben {
  /** Wer die Mail bekommt. Steht in der Anrede. */
  empfaengerName: string;
  /** Wer die Nachricht geschrieben hat. Steht im Titel und im Betreff. */
  absenderName: string;
  /** Kennung des Absenders. Ohne sie bleibt nur der Namensvergleich. */
  absenderId?: string;
  /** Der Text der Nachricht, wird hier auf die Vorschaulaenge gekuerzt. */
  nachricht: string;
  portalUrl: string;
  /**
   * Geht die Mail an den Partner, hat also ein Kunde geschrieben?
   *
   * Dann entfaellt der Unterschriftsblock, und es wird bewusst kein
   * Ansprechpartner gesucht: Der schreibende Kunde stuende sonst als sein
   * eigener Ansprechpartner unter seiner eigenen Nachricht.
   */
  anPartner?: boolean;
}

/** Kuerzt die Nachricht auf den Auszug, den die Mail zeigt. */
export function chatVorschau(text: string): string {
  return text.length > CHAT_VORSCHAU_ZEICHEN
    ? text.slice(0, CHAT_VORSCHAU_ZEICHEN) + "…"
    : text;
}

export function chatBenachrichtigungDaten(angaben: ChatMailAngaben): Record<string, unknown> {
  const gemeinsam = {
    kundeName: angaben.empfaengerName,
    nachrichtVorschau: chatVorschau(angaben.nachricht),
    portalUrl: angaben.portalUrl,
  };

  if (angaben.anPartner) {
    return { ...gemeinsam, beraterName: angaben.absenderName, anPartner: true };
  }

  // Der Absender ist ein Berater und unterschreibt die Mail. Gesucht wird er
  // ueber die Kennung, nicht ueber den Namen: Ging der Namensvergleich ins
  // Leere, unterschrieb die Vorlage still mit "Ansprechpartner bei MOREImmo"
  // und office@more.immo.
  const absender = findeBerater(angaben.absenderId, angaben.absenderName);
  if (!absender) {
    console.warn(
      `Chat-Benachrichtigung: Absender "${angaben.absenderName}" nicht gefunden` +
        `${angaben.absenderId ? ` (Kennung ${angaben.absenderId})` : " (ohne Kennung)"}. ` +
        "Die Mail geht ohne seine Adresse, Bezeichnung und Bild hinaus.",
    );
  }
  return {
    ...gemeinsam,
    ...beraterMailFelder(absender, angaben.absenderName, angaben.absenderId),
  };
}
