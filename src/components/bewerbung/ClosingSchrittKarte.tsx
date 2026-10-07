import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pencil, ChevronUp } from "lucide-react";
import type { ClosingSchrittNr, SchrittZustand } from "@/lib/closingFortschritt";

/**
 * Eine der sechs Karten im Reiter Closing.
 *
 * Drei Darstellungen:
 *   gesperrt: nur Kopfzeile und Erklärung, abgeblendet, keine Eingaben.
 *   kompakt: erledigt und eingeklappt, Kopfzeile mit Ergebnis-Badges und dem
 *            Stift „Bearbeiten". Ein Klick auf Stift oder Kopfzeile klappt
 *            sie wieder auf, auch nach dem Vertrag (Christians Entscheidung:
 *            Eingeklappt heißt nicht gesperrt).
 *   offen:   voller Inhalt.
 */
export function ClosingSchrittKarte({
  nr,
  titel,
  zustand,
  aufgeklappt,
  onAufklappen,
  onEinklappen,
  badges,
  sperrText,
  hervorgehoben,
  children,
}: {
  nr: ClosingSchrittNr;
  titel: string;
  zustand: SchrittZustand;
  /** Nur bei erledigt relevant: wurde die Karte per Stift wieder geöffnet? */
  aufgeklappt: boolean;
  onAufklappen: () => void;
  onEinklappen: () => void;
  /** Ergebnis-Badges rechts in der Kopfzeile */
  badges?: ReactNode;
  /** Erklärung im gesperrten Zustand */
  sperrText?: string;
  /** Der nächste Schritt bekommt einen Rahmen */
  hervorgehoben?: boolean;
  children?: ReactNode;
}) {
  const kompakt = zustand === "erledigt" && !aufgeklappt;
  const nummer = (
    <span
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
        zustand === "erledigt" ? "bg-green-600 text-white" : zustand === "gesperrt" ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
      }`}
    >
      {nr}
    </span>
  );

  if (zustand === "gesperrt") {
    return (
      <Card className="p-4 opacity-60" data-testid={`closing-karte-${nr}`} data-zustand="gesperrt">
        <div className="flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            {nummer} {titel}
          </h3>
          <div className="flex flex-wrap items-center gap-1.5">{badges}</div>
        </div>
        {sperrText && <p className="mt-1.5 text-xs text-muted-foreground leading-snug">{sperrText}</p>}
      </Card>
    );
  }

  if (kompakt) {
    return (
      <Card className="p-3 pl-4" data-testid={`closing-karte-${nr}`} data-zustand="kompakt">
        <div
          role="button"
          tabIndex={0}
          onClick={onAufklappen}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onAufklappen(); } }}
          className="flex flex-wrap items-center justify-between gap-2 cursor-pointer"
        >
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            {nummer} {titel}
          </h3>
          <div className="flex flex-wrap items-center gap-1.5">
            {badges}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-[11px]"
              onClick={(e) => { e.stopPropagation(); onAufklappen(); }}
              aria-label={`Schritt ${nr} bearbeiten`}
            >
              <Pencil className="h-3 w-3" /> Bearbeiten
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      className={`p-5 space-y-4 ${hervorgehoben ? "border-primary/50 ring-2 ring-primary/15" : ""}`}
      data-testid={`closing-karte-${nr}`}
      data-zustand="offen"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          {nummer} {titel}
        </h3>
        <div className="flex flex-wrap items-center gap-1.5">
          {badges}
          {zustand === "erledigt" && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1 text-[11px] text-muted-foreground"
              onClick={onEinklappen}
              aria-label={`Schritt ${nr} einklappen`}
            >
              <ChevronUp className="h-3 w-3" /> Einklappen
            </Button>
          )}
        </div>
      </div>
      {children}
    </Card>
  );
}
