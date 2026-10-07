/**
 * Die Dateizeile: ein Abzeichen links, ein Dateiname mit Hinweis, Knoepfe
 * rechts. Sie kommt im CRM an fuenfzehn Stellen vor, in den Investments, im
 * Kundenportal und beim Notar, und war bisher ueberall als dieselben vier
 * Zeilen Markup abgeschrieben.
 *
 * Das Abschreiben hat einen Fehler mitvererbt, den man erst bei schmalem
 * Fenster sieht: Die Knoepfe laufen rechts aus dem Kasten heraus und sind
 * dann nicht mehr anklickbar. Gemessen waren es bei einer 400 px breiten
 * Karte 65 px Ueberlauf.
 *
 * Drei Dinge muessen dafuer zusammenkommen, und alle drei fehlten:
 *
 * 1. Der Container muss umbrechen duerfen (`flex-wrap`). Ohne das bleibt
 *    alles in einer Zeile, egal wie eng es wird.
 * 2. Der Textteil braucht `min-w-0`. Ein Flex-Kind darf sonst nicht unter
 *    seine kleinstmoegliche Breite schrumpfen, und die ist bei einem
 *    Dateinamen wie `Kaufvertrag_Otto_Hans_22-06-2026.pdf` der ganze Name,
 *    weil kein Leerzeichen darin vorkommt. Genau deshalb bricht der Name
 *    zwar um, aber nur bis zum laengsten Wort.
 * 3. Die Knoepfe koennen nicht schrumpfen. Jeder Knopf im Projekt traegt
 *    `whitespace-nowrap` aus `buttonVariants`. Sie muessen deshalb als
 *    Gruppe unter den Text rutschen duerfen, statt gequetscht zu werden.
 *
 * `basis-48` sorgt dafuer, dass der Umbruch frueh genug kommt: Sinkt der
 * Textteil unter etwa 12 rem, geht die Knopfgruppe in die naechste Zeile,
 * statt den Namen auf Streichholzbreite zu pressen.
 *
 * Die Bauteile heissen wie bei `Card`: ein Container und dazu die Teile, die
 * hineingehoeren. So steht an der Aufrufstelle kein einziges Layoutwort mehr,
 * und der Fehler kann sich nicht ein sechzehntes Mal fortpflanzen.
 */
import * as React from "react";

import { cn } from "@/lib/utils";

export const DateiZeile = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-ui="dateizeile"
      className={cn("flex flex-wrap items-center gap-3 rounded-lg bg-muted/50 p-3", className)}
      {...props}
    />
  ),
);
DateiZeile.displayName = "DateiZeile";

/** Das Abzeichen links, etwa "PDF" oder ein Sinnbild. Schrumpft nie. */
export const DateiZeileMarke = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("shrink-0", className)} {...props} />
  ),
);
DateiZeileMarke.displayName = "DateiZeileMarke";

/** Dateiname und Hinweis. Darf schrumpfen und bricht auch ohne Leerzeichen um. */
export const DateiZeileText = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("min-w-0 flex-1 basis-48 break-words", className)} {...props} />
  ),
);
DateiZeileText.displayName = "DateiZeileText";

/**
 * Die Knoepfe. `ml-auto` haelt sie rechts, solange sie in dieselbe Zeile
 * passen, und laesst sie sonst geschlossen darunter rutschen.
 */
export const DateiZeileAktionen = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("ml-auto flex shrink-0 flex-wrap items-center gap-2", className)} {...props} />
  ),
);
DateiZeileAktionen.displayName = "DateiZeileAktionen";
