import * as React from "react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatTileProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  trend?: "up" | "down" | "flat";
}

/**
 * Apple-Style KPI-Kachel — luftig, eine Zahl im Fokus, weiches Tönungs-Hintergrund.
 *
 * Diese Kachel bringt ihre eigene Huelle mit: Rahmen, Flaeche, Polsterung. Wer
 * denselben Inhalt in eine schon vorhandene Karte setzen will, etwa weil die
 * Karte anklickbar ist, nimmt `Kennzahl` aus `@/components/ui/kennzahl`.
 *
 * Beide tragen dieselben `data-ui`-Haken, damit die neue Designschicht in
 * `src/styles/design-neu.css` sie an einer Stelle beschreibt statt an zweien.
 * Wer hier etwas an Beschriftung, Zahl oder Hinweis aendert, schaut bitte auch
 * dort nach.
 *
 * Die Huelle traegt `data-ui="card"`: Sie IST eine Karte, und so gilt fuer sie
 * alles, was Karten gilt, im Liquid Glass also Glas und Lichtkante. Der
 * Kennzahl-Haken sitzt deshalb eine Ebene tiefer, in einer Huelle ohne eigene
 * Box (`contents`). Direkt auf `data-ui="kennzahl"` darf keine Glasregel
 * zielen: Den Haken tragen auch Innenteile echter Karten.
 */
export function StatTile({ label, value, hint, icon: Icon, trend, className, ...props }: StatTileProps) {
  return (
    <div
      data-ui="card"
      className={cn(
        "rounded-2xl border border-border/60 bg-card p-4 sm:p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)]",
        className,
      )}
      {...props}
    >
      <div data-ui="kennzahl" data-ton={trend === "up" ? "gut" : trend === "down" ? "warn" : "neutral"} className="contents">
        <div className="flex items-start justify-between gap-2">
          <div data-ui="kennzahl-label" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</div>
          {Icon && (
            <div className="h-8 w-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Icon className="h-4 w-4" />
            </div>
          )}
        </div>
        <div data-ui="kennzahl-wert" className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">{value}</div>
        {hint && (
          <div
            data-ui="kennzahl-zusatz"
            className={cn(
              "mt-1 text-xs",
              trend === "up" && "text-success",
              trend === "down" && "text-destructive",
              (!trend || trend === "flat") && "text-muted-foreground",
            )}
          >
            {hint}
          </div>
        )}
      </div>
    </div>
  );
}