import type { ReactNode } from "react";
import { ChevronDown, Download, Loader2 } from "lucide-react";
import logoImg from "@/assets/moreimmo-logo.png";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { EXPOSE_ABSCHNITTE, EXPOSE_ABSCHNITTE_ANZAHL, type ExposeAbschnittId } from "@/lib/exposeInhalt";

/**
 * Die feste Abschnittsleiste des Exposés.
 *
 * Auf dem Desktop eine Leiste links mit Logo, den elf Abschnitten als
 * Sprungmarken und dem PDF-Knopf. Auf dem Handy eine Kopfzeile mit Zähler
 * („6 von 12") und Aufklappmenü. Beide zeigen denselben aktiven Abschnitt,
 * den `useAktiverAbschnitt` (useAktiverAbschnitt.ts) beim Scrollen bestimmt.
 *
 * Der PDF-Knopf ist nur aktiv, wenn der Aufrufer `pdfAktiv` setzt und einen
 * `onPdf`-Handler mitgibt; während der Erzeugung zeigt er den Ladezustand.
 */

interface LeisteProps {
  aktiv: ExposeAbschnittId;
  onSpringen: (id: ExposeAbschnittId) => void;
  /** Kopfzeile: „Exposé · Wohnung 7" und Adresse. */
  titel: string;
  adresse: string;
  /** Rechts in der Kopfzeile, etwa „für Kunde, erstellt von". */
  rechts?: ReactNode;
  /** Unter dem Logo in der Desktop-Leiste, etwa „Zurück zur Einheit". */
  obenLinks?: ReactNode;
  pdfAktiv?: boolean;
  onPdf?: () => void;
  /** Das PDF wird gerade erzeugt: Knopf gesperrt, Ladezeichen statt Symbol. */
  pdfLaeuft?: boolean;
}

export function ExposeLeiste({ aktiv, onSpringen, titel, adresse, rechts, obenLinks, pdfAktiv = false, onPdf, pdfLaeuft = false }: LeisteProps) {
  const nr = EXPOSE_ABSCHNITTE.find((a) => a.id === aktiv)?.nr ?? 1;
  const zaehler = `${nr} / ${EXPOSE_ABSCHNITTE_ANZAHL}`;
  const pdfKnopf = (
    <Button
      type="button"
      size="sm"
      className="gap-1.5"
      disabled={!pdfAktiv || pdfLaeuft}
      onClick={onPdf}
      title={pdfLaeuft ? "Das PDF wird erstellt" : pdfAktiv ? "Exposé als PDF herunterladen" : "Das PDF steht noch nicht bereit"}
      data-testid="pdf-knopf"
    >
      {pdfLaeuft ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      {pdfLaeuft ? "PDF wird erstellt" : "Herunterladen PDF"}
    </Button>
  );

  return (
    <>
      {/* Desktop: feste Leiste links */}
      <aside aria-label="Abschnitte" className="fixed bottom-0 left-0 top-0 z-30 hidden w-60 flex-col border-r border-border/60 bg-card px-3 py-5 lg:flex">
        <img src={logoImg} alt="OS Immobilien" className="mb-2 ml-2 h-7 w-auto self-start" />
        {obenLinks && <div className="mb-3 ml-2">{obenLinks}</div>}
        <nav className="mt-2 flex-1 space-y-0.5 overflow-y-auto">
          {EXPOSE_ABSCHNITTE.map((a) => {
            const istAktiv = a.id === aktiv;
            const fertig = a.nr < nr;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onSpringen(a.id)}
                aria-current={istAktiv ? "true" : undefined}
                data-testid={`leiste-${a.id}`}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors",
                  istAktiv ? "bg-foreground text-background" : fertig ? "text-foreground hover:bg-muted" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span className={cn("inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px]", istAktiv ? "border-background/60" : "border-current")}>{a.nr}</span>
                <span className="truncate">{a.titel}</span>
              </button>
            );
          })}
        </nav>
        <div className="mt-3 space-y-2">
          <div className="text-center text-xs text-muted-foreground" data-testid="leiste-zaehler">Abschnitt {zaehler}</div>
          {pdfKnopf}
        </div>
      </aside>

      {/* Kopfzeile, auf dem Handy mit Aufklappmenü */}
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/95 backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:backdrop-blur-0">
        <div className="mx-auto flex max-w-[1100px] flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{titel}</div>
            <div className="truncate font-semibold text-foreground">{adresse}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="hidden rounded-full border border-border/60 bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground lg:inline" data-testid="kopf-zaehler">Abschnitt {nr} von {EXPOSE_ABSCHNITTE_ANZAHL}</span>
            {rechts}
            <div className="lg:hidden">{pdfKnopf}</div>
          </div>
        </div>
        <div className="mx-auto max-w-[1100px] px-4 pb-3 lg:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" className="w-full justify-between" data-testid="mobil-abschnitt-menue">
                <span className="truncate"><span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-[10px] text-background">{nr}</span>{EXPOSE_ABSCHNITTE.find((a) => a.id === aktiv)?.titel}</span>
                <span className="ml-2 flex items-center gap-1 text-xs text-muted-foreground">{zaehler} <ChevronDown className="h-4 w-4" /></span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[calc(100vw-2rem)] max-w-sm">
              {EXPOSE_ABSCHNITTE.map((a) => (
                <DropdownMenuItem key={a.id} onSelect={() => onSpringen(a.id)} className={cn("gap-2", a.id === aktiv && "font-semibold")}>
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-current text-[10px]">{a.nr}</span>
                  {a.titel}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
    </>
  );
}
