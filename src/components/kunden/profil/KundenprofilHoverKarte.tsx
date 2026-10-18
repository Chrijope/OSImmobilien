import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Maus und genug Breite: die Karte steht rechts neben der Zeile, sonst darunter. */
function seitlichMoeglich(): boolean {
  try {
    return !!window.matchMedia?.("(hover: hover) and (min-width: 900px)").matches;
  } catch {
    return false;
  }
}

interface Props {
  /** Ein Knopf; er öffnet die Karte per Klick oder Antippen. */
  ausloeser: ReactElement;
  children: ReactNode;
  className?: string;
}

/**
 * Eine Karte, die beim Darüberfahren aufgeht und beim Antippen auch.
 *
 * Mit der Maus öffnet sie nach dem Darüberfahren und bleibt offen, solange
 * die Maus auf Zeile oder Karte steht. Ein Klick in diesem Zustand schließt
 * sie nicht wieder, sonst ginge sie genau dann zu, wenn jemand sie bewusst
 * öffnen will. Auf dem Handy öffnet sie unter der Zeile, damit sie nicht aus
 * dem Bild ragt. Langer Inhalt rollt in der Karte.
 */
export function KundenprofilHoverKarte({ ausloeser, children, className }: Props) {
  const [offen, setOffen] = useState(false);
  const zuTimer = useRef<number | null>(null);
  const ausHover = useRef(false);
  const [seitlich] = useState(seitlichMoeglich);

  const abbrechen = () => {
    if (zuTimer.current) window.clearTimeout(zuTimer.current);
    zuTimer.current = null;
  };
  useEffect(() => abbrechen, []);

  const mausRein = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    abbrechen();
    if (!offen) ausHover.current = true;
    setOffen(true);
  };
  const mausRaus = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    abbrechen();
    zuTimer.current = window.setTimeout(() => {
      ausHover.current = false;
      setOffen(false);
    }, 180);
  };

  return (
    <Popover
      open={offen}
      onOpenChange={(neu) => {
        // Der Klick nach dem Darüberfahren soll die Karte nicht schließen.
        if (!neu && ausHover.current) {
          ausHover.current = false;
          return;
        }
        ausHover.current = false;
        setOffen(neu);
      }}
    >
      <PopoverTrigger asChild onPointerEnter={mausRein} onPointerLeave={mausRaus}>
        {ausloeser}
      </PopoverTrigger>
      <PopoverContent
        side={seitlich ? "right" : "bottom"}
        align="start"
        collisionPadding={16}
        onPointerEnter={mausRein}
        onPointerLeave={mausRaus}
        className={cn(
          "w-[min(340px,calc(100vw-32px))] max-h-[min(420px,70dvh)] overflow-y-auto rounded-os-md p-4 text-sm shadow-lg",
          className,
        )}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
