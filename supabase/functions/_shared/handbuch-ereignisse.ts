/**
 * Die Stufen des Trichters der Handbuch-Seite.
 *
 * Eine Liste für drei Stellen: die Seite im Browser, die zählt, die Function
 * `analyse-ereignis`, die nur diese Namen annimmt, und die Prüfbedingung der
 * Tabelle `analysetool_ereignisse` (Migration 20260926170000). Ohne
 * Personenbezug: nur Stufe, Partner und Kampagne.
 *
 * Reine Datei ohne Importe, damit Vitest und Deno sie lesen können.
 */
export const HANDBUCH_EREIGNISSE = [
  "hb_seite_geoeffnet",
  "hb_konfigurator_gestartet",
  "hb_frage_1",
  "hb_frage_2",
  "hb_frage_3",
  "hb_frage_4",
  "hb_frage_5",
  "hb_frage_6",
  "hb_ausgang_passt",
  "hb_ausgang_vielleicht",
  "hb_ausgang_noch_nicht",
  "hb_handbuch_erhalten",
  "hb_handbuch_geoeffnet",
  "hb_pdf_geladen",
  "hb_sa_gestartet",
  "hb_sa_abgeschickt",
] as const;

export type HandbuchEreignis = (typeof HANDBUCH_EREIGNISSE)[number];

export const WERKZEUG_HANDBUCH = "handbuch";
