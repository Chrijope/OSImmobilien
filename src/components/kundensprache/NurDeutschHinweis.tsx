import { Languages } from "lucide-react";
import { NUR_DEUTSCH_HINWEIS } from "@/lib/seitenSprache";
import { cn } from "@/lib/utils";

/**
 * Der Vermerk unter einem Objekttext, der auf einer englischen Seite deutsch
 * bleibt (Plan Kundensprache, Entscheidung 12). Bis `objekt-texte-ki` in
 * Etappe 5 englische Fassungen liefert, trifft das auf Beschreibung, Standort-
 * und Marktargumente zu. Der Text steht nur auf Englisch, denn auf einer
 * deutschen Seite erscheint der Vermerk nie.
 */
export function NurDeutschHinweis({ className }: { className?: string }) {
  return (
    <p className={cn("mt-2 flex items-center gap-1.5 text-xs italic text-muted-foreground", className)} lang="en" data-testid="nur-deutsch-hinweis">
      <Languages className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {NUR_DEUTSCH_HINWEIS}
    </p>
  );
}
