/**
 * Bild-Erkennung für den Investagon-Import.
 *
 * Die Logik liegt in `supabase/functions/_shared/investagon-bilder.ts`, weil
 * die Edge Function `investagon-import` sie für die Bildübernahme braucht und
 * in Deno nichts aus `src/` importieren kann. Diese Datei reicht sie nur an
 * den Dialog weiter, so wie `standortanalyse.ts` es mit `standort-messung`
 * macht. Getestet wird in `investagonBilder.test.ts` nebenan.
 */
export {
  findeBildAdressen,
  sammleBildUrls,
  bildRang,
  istBildDatei,
  stabilerDateiname,
  sicherName,
  kurzHash,
  type BildBefund,
} from "../../supabase/functions/_shared/investagon-bilder";
