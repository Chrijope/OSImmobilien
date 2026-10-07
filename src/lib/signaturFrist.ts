/**
 * Wie lange ein Unterschriftslink gilt, für die Oberfläche.
 *
 * Die Zahl steht zweimal im Projekt, und das mit Absicht: Die Frist selbst
 * wird in den Edge Functions gesetzt, die unter Deno laufen und ihre Importe
 * über URLs beziehen. Diese Datei hier landet dagegen im Browser-Bündel.
 * Würde die Oberfläche die Deno-Datei einbinden, hinge das Bündel am Ordner
 * `supabase/functions`, und das wäre für eine einzelne Zahl zu viel.
 *
 * Damit die beiden Werte nicht auseinanderlaufen, vergleicht
 * `src/lib/signaturFrist.test.ts` sie miteinander. Wer hier etwas ändert,
 * ändert also auch `supabase/functions/_shared/signatur-frist.ts`, sonst
 * schlägt der Test fehl.
 */

/** Gültigkeit eines Unterschriftslinks in Tagen. */
export const SIGNATUR_FRIST_TAGE = 14;

/** Für Fließtext: „gültig 14 Tage“. */
export const SIGNATUR_FRIST_TEXT = `${SIGNATUR_FRIST_TAGE} Tage`;
