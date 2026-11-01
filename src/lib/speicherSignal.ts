import { toast } from "sonner";

/*
 * Haken im Speichern-Knopf (01.11.2026).
 *
 * Jeder Speicherablauf meldet sein Ergebnis schon über eine Rückmeldung:
 * Erfolg oder Fehler. Diese Rückmeldungen geben zusätzlich ein Signal am
 * Fenster ab, auf das ein gerade geklickter Speichern-Knopf hört
 * (`ui/button.tsx`). So zeigt der Knopf den Haken nur nach einem echten
 * Erfolg, ohne dass jeder der rund 90 Abläufe einzeln umgebaut werden muss.
 */
export const SPEICHER_SIGNAL = "bew:speichern";
export type SpeicherErgebnis = "ok" | "fehler";

export function meldeSpeicherErgebnis(ergebnis: SpeicherErgebnis): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<SpeicherErgebnis>(SPEICHER_SIGNAL, { detail: ergebnis }));
}

let eingerichtet = false;

/** Hängt das Signal an `toast.success` und `toast.error` aus Sonner, einmalig. */
export function richteSpeicherSignalEin(): void {
  if (eingerichtet) return;
  eingerichtet = true;
  const erfolg = toast.success;
  const fehler = toast.error;
  toast.success = ((...args: Parameters<typeof erfolg>) => {
    meldeSpeicherErgebnis("ok");
    return erfolg(...args);
  }) as typeof erfolg;
  toast.error = ((...args: Parameters<typeof fehler>) => {
    meldeSpeicherErgebnis("fehler");
    return fehler(...args);
  }) as typeof fehler;
}
