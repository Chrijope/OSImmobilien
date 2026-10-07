/**
 * Die Kennzahlkachel.
 *
 * Sie ist das Muster, das im CRM am haeufigsten wiederkehrt: auf dem
 * Dashboard, in der Auswertung, auf den Schreibtischen der Abteilungen und in
 * jedem Cockpit. Bisher war sie an jeder Stelle einzeln gebaut, mit leicht
 * verschiedenen Schriftgroessen, Abstaenden und Farbregeln. Dieser Baustein
 * ist die eine Stelle, an der die Kachel beschrieben ist.
 *
 * Sie ist der reine Inhalt ohne Huelle und gehoert deshalb in eine schon
 * vorhandene Karte, etwa wenn die Karte anklickbar ist. Wer eine Kachel
 * mitsamt Rahmen und Flaeche braucht, nimmt `StatTile` aus
 * `@/components/ui/stat-tile`. Beide tragen dieselben `data-ui`-Haken, damit
 * die Designschicht sie an einer Stelle beschreibt.
 *
 * Im alten Design sieht sie aus wie bisher. Der Umbau steckt allein in
 * `design-neu.css` und greift nur, wenn der Regler in den Einstellungen
 * umgelegt ist.
 *
 * Ein Unterschied ist dabei wichtig genug, ihn hier zu begruenden: Im Bestand
 * faerbt sich die **Zahl selbst** rot bei einer Warnung und gruen bei einem
 * guten Wert. Auf einem Dashboard mit acht Kacheln sind damit bis zu acht
 * Zahlen farbig. Dann traegt die Farbe keine Information mehr, und die Zahlen
 * lassen sich nicht mehr nebeneinander lesen. Im neuen Design steht die Zahl
 * immer in Tinte, und die Bewertung steht in der Zeile darunter. Dort faellt
 * sie auf, weil sie die einzige Farbe auf der Kachel ist.
 */
import * as React from "react";

import { cn } from "@/lib/utils";

/** Neutral heisst: die Zahl ist weder gut noch schlecht, nur eine Zahl. */
export type KennzahlTon = "neutral" | "gut" | "warn";

export interface KennzahlProps {
  /** Die Beschriftung ueber der Zahl, etwa "Umsatz beurkundet". */
  label: React.ReactNode;
  /** Die Zahl selbst, bereits fertig formatiert. */
  wert: React.ReactNode;
  /** Die Zeile unter der Zahl, etwa "2 ueber 14 Tage ohne Unterschrift". */
  zusatz?: React.ReactNode;
  ton?: KennzahlTon;
  /**
   * Ein Symbol vor dem Zusatz. Wird vom Aufrufer gestellt, damit der Baustein
   * keine feste Symbolbibliothek voraussetzt.
   */
  zusatzIcon?: React.ReactNode;
  /**
   * Zusatzklassen fuer die Zahl und den Zusatz. Der Vorfuehrmodus zeichnet
   * Betraege damit weich, deshalb muessen sie von aussen kommen.
   */
  wertClassName?: string;
  zusatzClassName?: string;
  className?: string;
}

const TON_KLASSE: Record<KennzahlTon, string> = {
  warn: "text-destructive",
  gut: "text-[hsl(var(--success))]",
  neutral: "text-foreground",
};

export function Kennzahl({
  label,
  wert,
  zusatz,
  ton = "neutral",
  zusatzIcon,
  wertClassName,
  zusatzClassName,
  className,
}: KennzahlProps) {
  return (
    <div data-ui="kennzahl" data-ton={ton} className={className}>
      <span data-ui="kennzahl-label" className="block text-sm font-medium text-muted-foreground">
        {label}
      </span>
      <span
        data-ui="kennzahl-wert"
        className={cn(
          "mt-2 block text-[28px] leading-tight font-semibold tracking-tight tabular-nums",
          TON_KLASSE[ton],
          wertClassName,
        )}
      >
        {wert}
      </span>
      {zusatz != null && zusatz !== "" && (
        <span
          data-ui="kennzahl-zusatz"
          className={cn(
            "mt-2 flex items-start gap-1 text-xs leading-relaxed text-muted-foreground",
            zusatzClassName,
          )}
        >
          {zusatzIcon}
          {zusatz}
        </span>
      )}
    </div>
  );
}
