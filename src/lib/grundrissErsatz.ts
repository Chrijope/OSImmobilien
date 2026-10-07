import type { ErsatzArt } from "../../supabase/functions/_shared/grundriss-erkennung.ts";

/**
 * Die Beschriftung eines Ersatzplans (Christian, 24.09.2026): Hat eine
 * Einheit keinen eigenen Grundriss, zeigt das Exposé den Plan ihres
 * Geschosses oder des Hauses. Damit ihn niemand für den Plan der Wohnung
 * hält, steht die Art ehrlich daneben, am Bildschirm wie im PDF.
 */
export const ERSATZ_TITEL: Record<ErsatzArt, string> = {
  geschossplan: "Geschossplan",
  hausplan: "Hausplan",
};

export const ERSATZ_TEXT: Record<ErsatzArt, string> = {
  geschossplan: "Ein eigener Grundriss dieser Wohnung liegt nicht vor. Gezeigt ist der Plan ihres Geschosses mit allen Einheiten darauf.",
  hausplan: "Ein eigener Grundriss dieser Wohnung liegt nicht vor. Gezeigt ist ein Plan des Hauses.",
};
