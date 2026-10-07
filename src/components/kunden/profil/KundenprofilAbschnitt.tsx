import { type ReactNode } from "react";

interface KundenprofilAbschnittProps {
  /**
   * Der vorhandene Kopf der Karte, unveraendert uebergeben.
   *
   * Absicht: Jeder Abschnitt hat heute seine eigene Ueberschrift, teils mit
   * Symbol davor. Die wandert hier hinein, statt neu getippt zu werden, damit
   * die Karten genau so aussehen wie bisher. Der Abstand nach unten bleibt
   * deshalb ebenfalls am Kopf (`mb-4`) und wird hier nicht noch einmal
   * gesetzt, sonst stuende unter jeder Ueberschrift der doppelte Abstand.
   */
  kopf: ReactNode;
  /**
   * Steht unter dem Kopf, gedacht fuer die Terminknoepfe in Objektauswahl und
   * Finanzierung.
   */
  kopfZusatz?: ReactNode;
  children: ReactNode;
}

/**
 * Ein grosser Abschnitt eines Investments im Kundenprofil.
 *
 * Christian am 29.09.2026: Im Investment steht jeder Abschnitt immer offen,
 * fuer alle Rollen. Das Auf- und Zuklappen samt gemerktem Zustand je Nutzer
 * und Investment ist entfallen. Wer etwas sucht, soll nicht erst aufklappen
 * muessen.
 */
export function KundenprofilAbschnitt({ kopf, kopfZusatz, children }: KundenprofilAbschnittProps) {
  /*
   * Der Zusatz steht UNTER der Ueberschrift, bei jeder Breite.
   *
   * Christian am 23.09.2026: Die Gespraechsknoepfe gehoeren unter die
   * Ueberschrift. Neben ihr nahm der lange Knopf der Ueberschrift den Platz,
   * auf dem Telefon stand „Objektauswahl“ mit einem Buchstaben je Zeile.
   *
   * Die Reihe traegt `kundenprofil-kartenaktionen`: Dort darf ein Knopf seine
   * Beschriftung umbrechen und dabei wachsen, statt aus der Karte zu ragen.
   * Der Kopf hat seinen Abstand nach unten selbst (`mb-4`), `-mt-2` rueckt
   * den Knopf naeher an seine Ueberschrift, `mb-4` haelt den Inhalt auf
   * Abstand.
   */
  return (
    <div>
      {kopf}
      {kopfZusatz ? (
        <div data-kopf-zusatz className="kundenprofil-kartenaktionen -mt-2 mb-4">
          {kopfZusatz}
        </div>
      ) : null}
      {children}
    </div>
  );
}
