import { useLayoutEffect, useState, type ReactNode } from "react";
import { Lock, LayoutDashboard, MessagesSquare, ClipboardList, ShieldCheck, Building2, BookmarkCheck, Landmark, FileSignature, CircleCheck, FolderOpen, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { markiereProfilAbschnitt } from "./markiereProfilAbschnitt";

const symbole = { ueberblick: LayoutDashboard, erstgespraech: MessagesSquare, selbstauskunft: ClipboardList, bonitaet: ShieldCheck, objektauswahl: Building2, reservierung: BookmarkCheck, finanzierung: Landmark, notar: FileSignature, abwicklung: CircleCheck, kundenordner: FolderOpen };
type Abschnitt = { key: string; label: string; karten: string[] };

const GESPERRT_TITEL = "Noch nicht freigeschaltet";

/** Nur die Navigation wird schmaler. Inhalte und bestehende Sprungziele bleiben erhalten. */
export function KundenprofilInvestmentLayout({ abschnitte, zaehler, investmentId, children }: {
  abschnitte: Abschnitt[];
  zaehler: Record<string, string>;
  /** Die Sprungziele heißen `<karte>-<investmentId>`, siehe `INVESTMENT_ABSCHNITTE`. */
  investmentId: string;
  children: ReactNode;
}) {
  const [offen, setOffen] = useState(false);
  /*
   * Ein Klick scrollt zum Kasten des Abschnitts und rahmt ihn orange, bis ein
   * anderer Abschnitt angeklickt wird (05.10.2026). Gesucht wird im Dokument,
   * damit `#objektauswahl` und `?autoSendSA=` dieselben Ziele behalten.
   * Gesperrte Phasen mit eigenem Kasten (`LockedPhaseCard`) tragen dieselbe
   * Kennung und werden ebenso angesprungen.
   */
  const ziel = (abschnitt: Abschnitt) => abschnitt.karten
    .map((karte) => document.getElementById(`${karte}-${investmentId}`))
    .find((treffer): treffer is HTMLElement => !!treffer) ?? null;
  /*
   * Abschnitte ganz ohne Kasten sind gedämpft und nicht klickbar. Bis zum
   * 05.10.2026 öffnete ein Klick darauf ein Hinweisfenster. Ob ein Kasten da
   * ist, steht erst nach dem Einhängen der Kinder fest, deshalb nach jedem
   * Zeichnen neu prüfen und nur bei Änderung neu setzen.
   */
  const [gesperrt, setGesperrt] = useState("");
  // Ohne Abhängigkeiten gewollt; derselbe Text löst kein neues Zeichnen aus.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    setGesperrt(abschnitte.filter((abschnitt) => !ziel(abschnitt)).map((abschnitt) => abschnitt.key).join(","));
  });
  const istGesperrt = (abschnitt: Abschnitt) => gesperrt.split(",").includes(abschnitt.key);
  const springe = (abschnitt: Abschnitt) => {
    const el = ziel(abschnitt);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    markiereProfilAbschnitt(el, { bleibend: true });
  };
  return <div className="kundenprofil-investment-layout" data-abschnitte={offen ? "offen" : "zu"}>
    <nav className="kundenprofil-abschnitte" aria-label="Investment-Abschnitte">
      <Card className="p-1.5">
        <div className="flex items-center gap-1 mb-1">
          {offen && <h4 className="flex-1 px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Abschnitte</h4>}
          <Button data-no-shrink variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={offen ? "Abschnitte einklappen" : "Abschnitte ausklappen"} aria-expanded={offen} onClick={() => setOffen(!offen)}>
            {offen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>
        <ul className="space-y-1">
          {abschnitte.map((abschnitt) => {
            const Icon = symbole[abschnitt.key as keyof typeof symbole] || ClipboardList;
            const beschreibung = `${abschnitt.label}${zaehler[abschnitt.key] ? `: ${zaehler[abschnitt.key]}` : ""}`;
            if (istGesperrt(abschnitt)) return <li key={abschnitt.key}>
              <button type="button" aria-label={`${abschnitt.label}: ${GESPERRT_TITEL}`} aria-disabled="true" title={GESPERRT_TITEL} className="kundenprofil-abschnitt-knopf w-full rounded-md p-2 text-sm flex items-center gap-2 text-left opacity-50 cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="relative shrink-0">
                  <Icon aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                  <Lock aria-hidden="true" className="absolute -bottom-1 -right-1 h-2.5 w-2.5 text-muted-foreground" />
                </span>
                {offen && <span className="min-w-0 text-muted-foreground">{abschnitt.label}</span>}
              </button>
            </li>;
            return <li key={abschnitt.key}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" aria-label={beschreibung} onClick={() => springe(abschnitt)} className="kundenprofil-abschnitt-knopf w-full rounded-md p-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring flex items-center gap-2 text-left">
                    <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
                    {offen && <span className="min-w-0"><span className="block">{abschnitt.label}</span>{zaehler[abschnitt.key] && <span className="block text-[10px] text-muted-foreground tabular-nums">{zaehler[abschnitt.key]}</span>}</span>}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">{beschreibung}</TooltipContent>
              </Tooltip>
            </li>;
          })}
        </ul>
      </Card>
    </nav>
    <div className="min-w-0">
      {/*
        Ersatz für die Abschnittsleiste auf dem Telefon.

        Christian hat die Leiste dort am 17.09.2026 zum Wegfallen freigegeben.
        Ganz ohne Sprung wäre der Weg von der Objektauswahl zum Kundenordner
        aber sehr weit, deshalb dieses eine Menü in voller Breite. Es ruft
        genau dieselbe Sprungfunktion wie die Leiste und dämpft dieselben Einträge, es gibt also keinen
        zweiten Weg, der anders funktioniert. Sichtbar wird es allein über die
        Containerabfrage in `kundenprofil.css`, am Schreibtisch nie.
      */}
      <div className="kundenprofil-abschnitte-mobil mb-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="w-full justify-between">
              Zum Abschnitt springen
              <ChevronDown aria-hidden="true" className="h-4 w-4 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[min(18rem,calc(100vw-2rem))]">
            {abschnitte.map((abschnitt) => {
              const Icon = symbole[abschnitt.key as keyof typeof symbole] || ClipboardList;
              const zu = istGesperrt(abschnitt);
              return <DropdownMenuItem key={abschnitt.key} className="gap-2" disabled={zu} title={zu ? GESPERRT_TITEL : undefined} onSelect={() => springe(abschnitt)}>
                <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">{abschnitt.label}</span>
                {zu && <Lock aria-hidden="true" className="h-3 w-3 shrink-0 text-muted-foreground" />}
                {zaehler[abschnitt.key] && <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">{zaehler[abschnitt.key]}</span>}
              </DropdownMenuItem>;
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {children}
    </div>
  </div>;
}
