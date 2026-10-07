import * as React from "react";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Hinweiskarte mit farbigem Streifen links.
 *
 * Vorbild ist das Kästchen "So verdienst du im Kapitalanlagevertrieb" auf der
 * Auswertungsseite: eine Karte mit vier Pixel breitem Streifen an der linken
 * Kante, gedämpfter Fläche, optional einem runden Zeichen, einer Überschrift
 * und dem erklärenden Text.
 *
 * Der Streifen ist ein Betonungsmittel, kein Rahmen für jede Karte. Er gehört
 * an Erklärungen, Warnungen und Hinweise. Wo er überall steht, sagt er nichts
 * mehr aus.
 *
 * Die Farbe steckt ausschließlich im Streifen und im Zeichenkreis, nie im
 * Text. Grund: die Tokens --success, --warning und --info sind im dunklen
 * Modus nicht neu gesetzt und als Textfarbe auf hellem Grund ohnehin zu
 * kontrastarm. Als schmale Fläche funktionieren sie in beiden Modi.
 */

export type HinweisTon = "blau" | "gruen" | "bernstein" | "rot";

/**
 * Vollständige Klassennamen, damit Tailwind sie beim Bauen findet.
 * Zusammengesetzte Namen wie `border-l-${ton}` würden herausfallen.
 */
const TON_KLASSEN: Record<HinweisTon, { streifen: string; kreis: string }> = {
  blau: { streifen: "border-l-primary", kreis: "bg-primary/20 text-primary" },
  gruen: { streifen: "border-l-success", kreis: "bg-success/20 text-success" },
  bernstein: { streifen: "border-l-warning", kreis: "bg-warning/20 text-warning" },
  rot: { streifen: "border-l-destructive", kreis: "bg-destructive/20 text-destructive" },
};

interface HinweisKarteProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** Farbton des Streifens. Standard ist das Projektblau. */
  ton?: HinweisTon;
  /** Optionales Zeichen links, ein Symbol oder ein kurzes Schriftzeichen. */
  zeichen?: React.ReactNode;
  /** Überschrift der Karte. */
  titel?: React.ReactNode;
  /** Der erklärende Text. */
  children?: React.ReactNode;
  /** Platz rechts, etwa für einen Knopf. */
  aktion?: React.ReactNode;
  /** Kompakte Fassung mit weniger Polsterung. */
  schmal?: boolean;
}

export function HinweisKarte({
  ton = "blau",
  zeichen,
  titel,
  children,
  aktion,
  schmal,
  className,
  ...props
}: HinweisKarteProps) {
  const farben = TON_KLASSEN[ton];

  return (
    <Card className={cn("border-l-4 bg-muted/30", farben.streifen, className)} {...props}>
      <CardContent className={cn(schmal ? "p-4" : "p-5")}>
        <div className="flex items-start gap-3">
          {zeichen && (
            <div
              className={cn(
                "rounded-full flex items-center justify-center flex-shrink-0",
                schmal ? "w-8 h-8 text-sm" : "w-10 h-10 text-lg",
                farben.kreis,
              )}
            >
              {zeichen}
            </div>
          )}
          <div className="min-w-0 flex-1">
            {titel && <p className="font-semibold text-foreground mb-2">{titel}</p>}
            {children && <div className="text-sm text-muted-foreground">{children}</div>}
          </div>
          {aktion && <div className="flex items-center gap-2 flex-shrink-0">{aktion}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
