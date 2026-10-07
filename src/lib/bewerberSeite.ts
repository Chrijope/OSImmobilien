/**
 * Die persönliche Bewerberseite, für die Anwendung nutzbar gemacht.
 *
 * Die Logik selbst liegt in `supabase/functions/_shared/bewerber-seite.ts`,
 * weil die Edge Function `bewerber-seite` sie braucht und aus Deno heraus
 * nicht in `src` greifen kann. Hier wird sie nur weitergereicht, damit die
 * Herleitung des Zustands genau einmal existiert. Eine zweite, leicht
 * abweichende Fassung wäre der sichere Weg dahin, dass die Seite „du bist
 * dran“ anzeigt, während der Server längst OS Immobilien am Zug sieht.
 *
 * Gleiches Muster wie `kennenlernenErinnerungen.ts`.
 */
export {
  BEWERBER_SEITE_BASIS_URL,
  FRAGE_MAX,
  FRAGE_WERKTAGE,
  GRUND_MAX,
  PAUSEN_WAHLEN,
  SEITEN_AKTIONEN,
  SEITE_TOKEN_MUSTER,
  alsDatum,
  antwortFrist,
  bewerberSeiteLink,
  bewerberSeitePfad,
  erinnerungsDatum,
  frageOffen,
  leseStand,
  pauseLaeuft,
  pruefeAnfrage,
  stationen,
  werAmZug,
  zustandVon,
} from "../../supabase/functions/_shared/bewerber-seite";
export type {
  AmZug,
  BewerberSeiteStand,
  OffenerPunkt,
  PausenWahl,
  SeiteEntscheidung,
  SeiteFrage,
  SeiteKennenlernen,
  SeitePause,
  SeiteStart,
  SeiteTermin,
  SeitenAktion,
  SeitenZustand,
  Station,
  StationsSchluessel,
  StationsStand,
} from "../../supabase/functions/_shared/bewerber-seite";
