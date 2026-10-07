import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Check, CircleDashed, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAnzeigeSprache } from "@/lib/seitenSpracheKontext";
import type { ObjektWohnung } from "@/lib/objekteStore";
import type { BlickZeile } from "@/lib/objektKennzahlen";

/**
 * Kleine Bausteine, die Objektseite und Einheiten-Seite gemeinsam nutzen:
 * Brotkrumen, Statuschips, Kennzahlkacheln und die Zeilen mit Info-Symbol.
 * Alles auf den Design-Tokens des CRM, damit die Seiten wie der Rest
 * aussehen und nicht wie eine eigene Anwendung.
 */

export function Brotkrumen({ stufen }: { stufen: Array<{ label: string; to?: string }> }) {
  return (
    <Breadcrumb className="mb-3">
      <BreadcrumbList className="text-xs">
        {stufen.map((s, i) => {
          const letzte = i === stufen.length - 1;
          return (
            <BreadcrumbItem key={`${s.label}-${i}`} className="contents">
              {letzte || !s.to ? (
                <BreadcrumbPage className={cn(letzte && "font-semibold")}>{s.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild><Link to={s.to}>{s.label}</Link></BreadcrumbLink>
              )}
              {!letzte && <BreadcrumbSeparator />}
            </BreadcrumbItem>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

const STATUS_STIL: Record<ObjektWohnung["status"], string> = {
  frei: "border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]",
  reserviert: "border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]",
  verkauft: "border-border bg-muted text-muted-foreground",
};

export function EinheitStatusChip({ status, className }: { status: ObjektWohnung["status"]; className?: string }) {
  return (
    <Badge variant="outline" className={cn("capitalize", STATUS_STIL[status], className)}>
      {status === "frei" && <Check className="mr-1 h-3 w-3" />}
      {status}
    </Badge>
  );
}

export function ObjektStatusChip({ status }: { status?: "entwurf" | "freigegeben" }) {
  if (status === "entwurf") {
    return (
      <Badge variant="outline" className="border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]">
        <CircleDashed className="mr-1 h-3 w-3" /> Entwurf
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={STATUS_STIL.frei}>
      <Check className="mr-1 h-3 w-3" /> Freigegeben
    </Badge>
  );
}

/** Blauer Chip für Objektart und Bauzustand. */
export function ArtChip({ children, className }: { children: ReactNode; className?: string }) {
  return <Badge variant="outline" className={cn("border-primary/30 bg-accent text-primary", className)}>{children}</Badge>;
}

/**
 * Info-Symbol mit Erklärung.
 *
 * Auf dem Handy gibt es kein Überfahren mit der Maus, und Radix öffnet einen
 * Tooltip bei Berührung nicht von selbst. Bis zum 23.09.2026 tat ein Tippen
 * auf das Symbol dort deshalb gar nichts. Jetzt öffnet der Klick die
 * Erklärung, ein Tippen daneben schließt sie. `preventDefault` hält Radix
 * davon ab, sie im selben Klick gleich wieder zu schließen.
 *
 * `data-no-min` nimmt den Knopf aus der Handyregel „mindestens 40 px hoch“:
 * Sie machte ihn zu einem 40 px hohen Streifen, das Symbol saß oben darin und
 * die Beschriftung daneben rutschte nach unten. Die Tippfläche von 40 × 40 px
 * stellt stattdessen das unsichtbare `after:` her, ohne die Zeile zu verschieben.
 */
export function InfoSymbol({ text, className }: { text: string; className?: string }) {
  const [offen, setOffen] = useState(false);
  // Auf öffentlichen Kundenseiten in deren Sprache (Kundensprache, Etappe 3), im CRM deutsch.
  const sprache = useAnzeigeSprache();
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip open={offen} onOpenChange={setOffen}>
        <TooltipTrigger asChild>
          <button type="button" tabIndex={-1} aria-label={sprache === "en" ? "Explanation" : "Erklärung"} data-no-min
            onClick={(e) => { e.preventDefault(); setOffen(true); }}
            className={cn("relative inline-flex items-center justify-center align-middle text-muted-foreground transition-colors after:absolute after:-inset-[14px] after:content-[''] hover:text-foreground", className)}>
            <Info className="h-3 w-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs leading-snug">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Reiter-Beschriftung mit Info-Symbol und einem Satz Erklärung im Tooltip.
 *
 * `InfoSymbol` ist selbst ein Knopf, und ein Knopf im Reiterknopf ist kein
 * gültiges HTML. Den Tooltip trägt hier deshalb ein schlichtes Element, der
 * Reiter bleibt der einzige Knopf. Für Tastatur und Vorleseprogramm ist das
 * Symbol ausgeblendet; dieselbe Erklärung steht oben im Reiter als
 * `ReiterZweck`.
 */
export function ReiterBeschriftung({ children, info }: { children: ReactNode; info: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {children}
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span aria-hidden="true" data-testid="reiter-info" className="inline-flex text-muted-foreground transition-colors hover:text-foreground">
              <Info className="h-3.5 w-3.5" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs font-normal leading-snug">{info}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </span>
  );
}

/** Die ruhige Zeile oben in einem Reiter: wofür er da ist und wann der andere passt. */
export function ReiterZweck({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("flex items-start gap-2 text-sm text-muted-foreground", className)} data-testid="reiter-zweck">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/** Kennzahlkachel: Beschriftung oben, Wert groß, Erklärung darunter. */
export function Kachel({ label, wert, unter, info, className }: { label: string; wert: ReactNode; unter?: ReactNode; info?: string; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-border/60 bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]", className)}>
      <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}{info && <InfoSymbol text={info} />}
      </div>
      <div className="mt-1.5 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{wert}</div>
      {unter && <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{unter}</div>}
    </div>
  );
}

/** Eine Zeile aus „Auf einen Blick" oder den Objektdetails, mit Info-Symbol. */
export function BlickZeileAnzeige({ zeile }: { zeile: BlickZeile }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/60 py-2 text-sm last:border-b-0">
      <span className="flex max-w-[52%] shrink-0 items-center gap-1 text-muted-foreground">
        {zeile.label}
        <InfoSymbol text={zeile.info} />
      </span>
      <span className="text-right">
        <span className="font-semibold text-foreground">{zeile.wert}</span>
        {zeile.unter && <div className="text-xs text-muted-foreground">{zeile.unter}</div>}
      </span>
    </div>
  );
}

/** Detailfeld in den Objektdetails: Beschriftung, Wert, Zusatzzeile. */
export function Detail({ label, wert, unter, icon }: { label: string; wert: ReactNode; unter?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</div>
      <div className="mt-0.5 font-semibold text-foreground">{wert}</div>
      {unter && <div className="text-xs leading-relaxed text-muted-foreground">{unter}</div>}
    </div>
  );
}

/** Überschrift einer Karte mit optionalem Zusatz rechts. */
export function KartenTitel({ children, zusatz, rechts }: { children: ReactNode; zusatz?: ReactNode; rechts?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="text-base font-semibold tracking-tight text-foreground">
        {children}{zusatz && <span className="ml-2 text-xs font-normal text-muted-foreground">{zusatz}</span>}
      </div>
      {rechts}
    </div>
  );
}

export function Hinweis({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("mt-3 text-xs leading-relaxed text-muted-foreground", className)}>{children}</p>;
}
