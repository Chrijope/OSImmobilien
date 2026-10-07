// Der blaue „Warum"-Kasten unter Skripten und Einwandantworten.
//
// Er stand früher immer offen. 79 Kästen mit zusammen rund 21.000 Zeichen,
// geballt dort, wo ohnehin am meisten Text steht. Damit war die Begründung
// Teil des Erschlagen-Problems statt seiner Lösung. Jetzt ist sie zuklappbar:
// sichtbar bleibt die Überschrift, der Rest kommt auf Wunsch.
//
// Standard: im Quereinsteiger-Pfad zu, im Profi-Pfad offen. Der Profi liest
// die Begründung als Feinheit, der Quereinsteiger braucht zuerst den Satz
// selbst.

import { useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export function WarumKasten({
  titel,
  text,
  className,
}: {
  titel: string;
  text: string;
  /** Rahmen des Kastens, je nach Umgebung (Skriptkarte oder Accordion). */
  className?: string;
}) {
  /*
   * Der Kasten startet in jedem Pfad geschlossen.
   *
   * Er stand anfangs im Profipfad offen, mit der Überlegung: Der Profi liest
   * die Begründung als Feinheit und will sie sofort sehen. Das war richtig,
   * solange es 79 Kästen mit zusammen rund 21.000 Zeichen gab.
   *
   * Durch die Überarbeitung der Kapitel sind daraus 209 Kästen mit 105.330
   * Zeichen geworden, im Schnitt 504 je Kasten. Damit kippte die Entscheidung
   * ins Gegenteil: Gemessen sah der Profi 693.504 Zeichen Lehrtext, der
   * Quereinsteiger 495.892. Wer schnell durch wollte, bekam vierzig Prozent
   * mehr zu lesen als wer verstehen wollte.
   *
   * Geschlossen heißt nicht verloren. Der Titel steht sichtbar, ein Klick
   * öffnet, und der Profi weiß nach dem zweiten Kapitel, was ihn erwartet.
   */
  const [offen, setOffen] = useState(false);

  return (
    <Collapsible
      open={offen}
      onOpenChange={setOffen}
      className={cn("bg-blue-50/60 dark:bg-blue-950/20", className)}
    >
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-blue-100/60 dark:hover:bg-blue-900/20">
        <Info className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
        <span className="flex-1 text-xs font-semibold text-blue-900 dark:text-blue-200">
          {titel}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "h-4 w-4 shrink-0 text-blue-600 transition-transform dark:text-blue-400",
            offen && "rotate-180",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="whitespace-pre-wrap px-4 pb-3 pl-10 text-xs leading-relaxed text-blue-900/90 dark:text-blue-100/90">
          {text}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
