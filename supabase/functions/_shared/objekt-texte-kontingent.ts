/**
 * Wie oft ein Nutzer die Objekttexte je Stunde und je Tag erzeugen lassen darf.
 *
 * WARUM ES ZWEI KONTINGENTE GIBT
 *
 * Christian am 23.09.2026: Alle Objekte sollen Beschreibung und fünf
 * Standortargumente tragen, und zwar mit einem Klick, nicht in Etappen zu je
 * zwanzig. Rund neunzig Objekte in einem Durchgang passen nicht in 20 Läufe je
 * Stunde. Admin und Inhaber bekommen deshalb ein höheres Kontingent, alle
 * anderen bleiben beim bisherigen.
 *
 * Die Zahlen für die Leitung: 150 je Stunde reichen für einen vollen Durchgang
 * über den Bestand samt einer Wiederholung der Fehlgeschlagenen. 400 je Tag
 * lassen drei, vier solcher Durchgänge zu und begrenzen trotzdem, was ein
 * gekapertes Konto an KI-Guthaben verbrauchen könnte.
 *
 * WER WELCHES BEKOMMT
 *
 * Entschieden wird in der Edge Function anhand der Rollen, die der Aufrufer in
 * `user_roles` trägt, gelesen mit seinem eigenen Anmeldetoken. Nie aus dem
 * Rumpf der Anfrage. Die Oberfläche liest dieselben Zahlen nur, um rechtzeitig
 * anzuhalten und um die richtige Grenze zu nennen.
 *
 * Die Datei ist reine Rechnung ohne Deno-Eigenheiten, damit Function und
 * Browser (`src/lib/objektTexteSammellauf.ts`) dieselben Zahlen lesen.
 * Getestet wird sie in `src/lib/objektTexteGesamtlauf.test.ts`.
 */

export interface TexteKontingent {
  /** Läufe je Stunde. */
  stunde: number;
  /** Läufe je Tag. */
  tag: number;
}

/** Für alle Rollen außer Admin und Inhaber. */
export const KONTINGENT_STANDARD: Readonly<TexteKontingent> = Object.freeze({ stunde: 20, tag: 100 });

/** Für Admin und Inhaber, damit ein Durchgang über alle Objekte in einem Rutsch geht. */
export const KONTINGENT_LEITUNG: Readonly<TexteKontingent> = Object.freeze({ stunde: 150, tag: 400 });

/** Die Rollen mit dem höheren Kontingent. Dieselben wie `is_admin_role` in der Datenbank. */
export const LEITUNGSROLLEN: readonly string[] = Object.freeze(["admin", "inhaber"]);

/**
 * Trägt jemand mit diesen Rollen das höhere Kontingent?
 *
 * Nimmt die rohe Liste aus `user_roles`. Alles, was kein Text ist, zählt
 * nicht; eine leere oder kaputte Liste ergibt das normale Kontingent.
 */
export function istLeitung(rollen: unknown): boolean {
  if (!Array.isArray(rollen)) return false;
  return rollen.some((rolle) => typeof rolle === "string" && LEITUNGSROLLEN.includes(rolle.trim()));
}

/** Das Kontingent für Leitung oder alle anderen. */
export function kontingentFuer(leitung: boolean): Readonly<TexteKontingent> {
  return leitung ? KONTINGENT_LEITUNG : KONTINGENT_STANDARD;
}
