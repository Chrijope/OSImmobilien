import { useEffect, useState } from "react";
import { useVideoraum } from "@/contexts/VideoraumContext";
import { spiegeltVorschau } from "@/lib/videocallEinstellungen";
import { KleineKachel } from "./Kachel";

/**
 * Das eigene Bild als kleine Kachel.
 *
 * Es steht an zwei Orten: im schwebenden Fenster auf dem Schreibtisch und in
 * der Leiste oben im CRM. Beide brauchen dieselben vier Regeln, und genau
 * deshalb liegen sie hier und nicht zweimal nebeneinander:
 *
 *   1. Der Strom ist waehrend einer laufenden Komposition die rohe Kamera und
 *      sonst der lokale Strom, siehe `roheKamera`.
 *   2. Die Kachel ist stumm. Das bringt `KleineKachel` mit: Ton kommt an genau
 *      einer Stelle heraus, sonst liefe die eigene Stimme als Echo mit.
 *   3. Ton und Kamera kommen aus dem eigenen Stand `tonAn`/`bildAn`, nicht aus
 *      der Meldungstabelle der anderen. Man meldet sich nichts selbst.
 *   4. Gespiegelt wird nach derselben Regel wie im Gespraech, siehe
 *      `spiegeltVorschau`: bei einem Hintergrundbild nicht, sonst stuende
 *      Schrift darin verkehrt.
 *
 * Christian am 18.09.2026 zur Leiste: „warum wird nur links von meinem gast
 * oder von dem teilnehmer das video angezeigt da muss doch auch mein video
 * angezeigt werden, also das vom Gastgeber."
 */

/** Wie oft nachgesehen wird, ob die eigene Vorschau einen neuen Strom hat. */
export const VORSCHAU_TAKT_MS = 500;

export function EigeneKleineKachel({ className = "" }: { className?: string }) {
  const { tonAn, bildAn, lokalerStream, roheKamera, spiegeln, hintergrund } = useVideoraum();

  /*
   * Warum ein Taktgeber und kein Wert aus dem Zusammenhang: Das
   * Bildschirmteilen beginnt in der Gespraechsansicht, hier aendert sich
   * dadurch nichts, und ohne ein neues Zeichnen bliebe ein Standbild stehen.
   * Gesetzt wird nur, wenn es wirklich ein anderer Strom ist.
   */
  const [rohStrom, setRohStrom] = useState<MediaStream | null>(null);
  useEffect(() => {
    const nachsehen = () => {
      const strom = roheKamera();
      setRohStrom((bisher) => (bisher === strom ? bisher : strom));
    };
    nachsehen();
    const takt = window.setInterval(nachsehen, VORSCHAU_TAKT_MS);
    return () => window.clearInterval(takt);
  }, [roheKamera]);

  /*
   * Der Rueckfall steht hier und nicht im Takt oben.
   *
   * Christian am 18.09.2026: „im schwebenden fenster wird aber nur vom kunde
   * das bild angezeigt, da muss auch das eigene vom gastgeber angezeigt
   * werden." Die eigene Kachel war vorhanden, ihr Strom aber kam erst mit dem
   * ersten Takt, und bis dahin stand dort „Warte auf Du…". Gerechnet wird der
   * Rueckfall deshalb beim Zeichnen: Solange es einen lokalen Strom gibt, hat
   * die eigene Kachel ein Bild, ohne auf einen Zeitgeber zu warten.
   */
  const strom = rohStrom ?? lokalerStream;

  return (
    <KleineKachel
      stream={strom}
      name="Du"
      stand={{ tonAn, bildAn }}
      spiegeln={spiegeltVorschau(spiegeln, hintergrund.art)}
      kameraAusText="Deine Kamera ist aus"
      className={className}
    />
  );
}
