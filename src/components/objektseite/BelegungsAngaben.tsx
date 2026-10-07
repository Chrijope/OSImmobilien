import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { BelegungsAnzeige } from "@/lib/einheitBelegung";
import { cn } from "@/lib/utils";

/**
 * Kunde, Vertriebspartner und Datum einer belegten oder vorgemerkten Einheit.
 *
 * Beide Einheitentabellen nutzen diesen Baustein, die Liste „Alle Einheiten"
 * der Objektseite und die aufgeklappten Wohneinheiten der Seite „Objekte".
 * Was hier steht, entscheidet `belegungsAnzeige` in `src/lib/einheitBelegung.ts`:
 * Namen kommen nur an, wenn der Nutzer sie sehen darf. Dieser Baustein zeigt
 * also nur, was er bekommt, und prueft selbst nichts.
 *
 * Bei einer freien Einheit ohne Vormerkung gibt es nichts zu sagen, dann
 * zeichnet er nichts. Den Platzhalter waehlt die jeweilige Tabelle.
 */
export function BelegungsAngaben({ anzeige, onKundeOeffnen, className }: {
  anzeige: BelegungsAnzeige;
  /** Macht den Kundennamen zum Link, sofern eine Kundenkennung da ist. */
  onKundeOeffnen?: (kundeId: string) => void;
  className?: string;
}) {
  if (anzeige.art === "frei") return null;
  const { kundeName, kundeId, partnerName, hinweis } = anzeige;
  return (
    <div className={cn("space-y-0.5 text-xs", className)} data-testid="belegung-angaben">
      {kundeName && (onKundeOeffnen && kundeId ? (
        <button
          type="button"
          className="cursor-pointer text-left font-medium text-primary hover:underline"
          onClick={(e) => { e.stopPropagation(); onKundeOeffnen(kundeId); }}
        >
          {kundeName}
        </button>
      ) : (
        <p className="font-medium">{kundeName}</p>
      ))}
      {partnerName && <p className="text-[10px] text-muted-foreground">VP: {partnerName}</p>}
      {hinweis && <p className="text-[10px] text-muted-foreground">{hinweis}</p>}
    </div>
  );
}

/** Das Abzeichen „empfohlen" an einer freien Einheit. */
export function EmpfohlenAbzeichen({ className }: { className?: string }) {
  return (
    <Badge variant="outline" className={cn("gap-1 border-primary/40 bg-primary/10 text-primary", className)}>
      <Sparkles className="h-3 w-3" /> empfohlen
    </Badge>
  );
}
