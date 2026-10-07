/**
 * Die Erinnerungskette des neuen Bewerberprozesses, für die Anwendung nutzbar
 * gemacht.
 *
 * Die Logik selbst liegt in
 * `supabase/functions/_shared/kennenlernen-erinnerungen.ts`, weil der Zeitplan
 * `send-bewerber-kennenlernen-erinnerungen` sie braucht und aus Deno heraus
 * nicht in `src` greifen kann. Hier wird sie nur weitergereicht, damit die
 * Stoppbedingungen genau einmal existieren. Eine zweite, leicht
 * abweichende Fassung wäre der sichere Weg dahin, dass die Oberfläche „keine
 * Erinnerung“ anzeigt und der Zeitplan trotzdem eine verschickt.
 *
 * Gleiches Muster wie `beraterNamensabgleich.ts` und `investagonBilder.ts`.
 */
export {
  ERINNERUNG_TAG_1,
  ERINNERUNG_TAG_3,
  NACHFASS_SPERRE_TAGE,
  STOPP_TEXTE,
  FAELLIG_TEXTE,
  tageSeit,
  pausiert,
  stoppGrund,
  faelligeErinnerung,
  darfFallSchliessen,
  wartetAufEntscheidung,
  startTagNachPause,
  erinnerungWortfassung,
  naechsterSchrittAm,
  kennenlernenBlock,
  erstgespraechLaeuftLaut,
  hatAngefangen,
  kettenStand,
  juengsteNachfassMail,
  vermerkNachVersand,
} from "../../supabase/functions/_shared/kennenlernen-erinnerungen";
export type {
  ErinnerungStufe,
  KettenStand,
  FaelligeErinnerung,
  StoppGrund,
  BewerberDaten,
  FormularDaten,
  WartetGrund,
  WartetStand,
} from "../../supabase/functions/_shared/kennenlernen-erinnerungen";
