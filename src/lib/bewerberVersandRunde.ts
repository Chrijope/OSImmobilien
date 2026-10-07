import { useEffect, useState } from "react";

/**
 * Ein Zähler, der hochgeht, sobald an einen Bewerber etwas verschickt wurde.
 *
 * ## Wozu
 *
 * Die Bewerberliste zeigt zwei Dinge, die nicht im Zwischenspeicher stehen:
 * das Briefsymbol „Mail ist hinaus" und das Kennzeichen „Eingangsmail fehlt".
 * Beide holen ihre Angaben einmal beim Öffnen der Liste und merken sie sich,
 * das eine aus `bewerber_formular`, das andere aus der Versandvorschau.
 *
 * Genau das ging am 14.09.2026 schief: Christian hat Erwin Rapp von Hand die
 * Eingangsmail geschickt und sah danach in der Liste weiterhin „Eingangsmail
 * zum Kennenlernbogen fehlt". Die Daten hatten sich geändert, die Anzeige
 * nicht. Eine Liste, die nach einer Aktion dasselbe behauptet wie davor, ist
 * schlimmer als eine ohne Kennzeichen: Sie sieht aus, als sei der Versand
 * misslungen.
 *
 * ## Warum ein Zähler und kein Neuladen der Seite
 *
 * Der Versand geschieht in der Akte, die Anzeige steht in der Liste. Zwischen
 * beiden wechselt man, ohne dass das Fenster den Fokus verliert; der übliche
 * Weg aus `useVorabScores`, bei Rückkehr ins Fenster neu zu fragen, greift
 * hier also nicht. Wer verschickt, meldet es stattdessen hier, und wer etwas
 * anzeigt, hört zu.
 */

let _runde = 0;
const _hoerer = new Set<(runde: number) => void>();

/**
 * Nach einem Versand aufrufen, auch nach einem fehlgeschlagenen.
 *
 * Auch der Fehlschlag ändert den Stand: Bei einer gesperrten Adresse entsteht
 * die Bogenzeile, die Mail aber nicht, und die Liste soll danach zeigen, was
 * wirklich gilt.
 */
export function meldeVersand() {
  _runde += 1;
  for (const h of _hoerer) h(_runde);
}

/** Die laufende Runde. Ändert sie sich, fragen die Hooks neu. */
export function useVersandRunde(): number {
  const [runde, setRunde] = useState(_runde);

  useEffect(() => {
    _hoerer.add(setRunde);
    /*
     * Zusätzlich die Rückkehr ins Fenster, wie in `useVorabScores`. Sie deckt
     * den zweiten Weg ab: Ein Bewerber füllt seinen Bogen in seinem eigenen
     * Fenster aus, während die Liste offen bleibt.
     */
    const wiederDa = () => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        meldeVersand();
      }
    };
    window.addEventListener("focus", wiederDa);
    document.addEventListener("visibilitychange", wiederDa);
    return () => {
      _hoerer.delete(setRunde);
      window.removeEventListener("focus", wiederDa);
      document.removeEventListener("visibilitychange", wiederDa);
    };
  }, []);

  return runde;
}

/** Nur für Tests. */
export function setzeVersandRundeZurueck() {
  _runde = 0;
  _hoerer.clear();
}
