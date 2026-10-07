/**
 * Wie lange ein Unterschriftslink gilt.
 *
 * Entscheidung Christians vom 16.09.2026: Selbstauskunft und
 * Reservierungsvereinbarung bekommen dieselbe Frist von vierzehn Tagen. Laeuft
 * sie ab, sendet der Partner im Investment einfach einen neuen Link, der
 * wieder volle vierzehn Tage gilt.
 *
 * Vorher liefen die beiden Fristen auseinander: Die Selbstauskunft galt sieben
 * Tage, die Reservierung praktisch unbegrenzt (zehn Jahre, weil die Spalte
 * `expires_at` NOT NULL ist). Deshalb steht die Zahl jetzt an einer Stelle.
 *
 * Diese Datei bleibt bewusst winzig und ohne weitere Importe. Jede Aenderung
 * hier zwingt dazu, alle Functions neu auszurollen, die sie einbinden; das
 * sind zurzeit `send-signature-request` und `send-reservation-signature`.
 *
 * Das Gegenstueck fuer die Oberflaeche ist `src/lib/signaturFrist.ts`. Beide
 * Werte muessen gleich sein, `src/lib/signaturFrist.test.ts` vergleicht sie.
 */

/** Gueltigkeit eines Unterschriftslinks in Tagen. */
export const SIGNATUR_FRIST_TAGE = 14;

/**
 * Der Zeitpunkt, zu dem ein jetzt erzeugter Link ablaeuft, als ISO-Text fuer
 * die Spalte `signature_requests.expires_at`.
 */
export function signaturAblauf(jetzt: Date = new Date()): string {
  return new Date(jetzt.getTime() + SIGNATUR_FRIST_TAGE * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Das Ablaufdatum, wie es in der Mail an den Kunden steht, etwa
 * „30. September 2026“. Die Vorlagen `selbstauskunft-signatur` und
 * `reservierung-signatur` setzen es hinter „Link gueltig bis“.
 */
export function signaturAblaufText(ablaufIso: string): string {
  const d = new Date(ablaufIso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("de-DE", {
    timeZone: "Europe/Berlin",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
