import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronDown, ChevronUp, Compass, ArrowRight, Lock, Plus, Trash2 } from "lucide-react";
import { getNextSteps } from "@/lib/nextStepsGuide";
import { PIPELINE_STUFEN } from "@/lib/kontaktPipeline";
import type { Investment } from "@/lib/investmentsStore";

interface Props {
  investments: Investment[];
  isAdmin: boolean;
  onOpenInvestment: (invId: string) => void;
  /** Optionaler DOM-Anker (z. B. um aus Stammdaten hierhin zu springen). */
  anchorId?: string;
  /** Hebt die Karte kurz hervor (Ring + Scroll), wenn sich der Wert ändert. */
  highlightKey?: string | number | null;
  /** Button-Beschriftung & Verhalten: false versteckt den "öffnen"-Button. */
  showOpenButton?: boolean;
  /**
   * In den Stammdaten traegt diese Karte den Titel "Investments" und ersetzt
   * die frueher darunter stehende Investmentliste. Im Investment-Reiter bleibt
   * es bei "Naechste Schritte", dort steckt man schon in einem Investment.
   */
  titel?: string;
  /**
   * Archivierte und verlorene Investments mitzeigen, ausgegraut und ohne
   * Handlungsschritte. Nur fuer die Stammdaten: Dort ist die Karte die
   * vollstaendige Liste, und ein verlorenes Investment darf nicht spurlos
   * verschwinden.
   */
  zeigeAbgeschlossene?: boolean;
  /** Zeigt "Investment anlegen" im Kopf. */
  onInvestmentAnlegen?: () => void;
  /** Loeschknopf am aktiven Investment. Kam aus der frueheren Investmentliste mit. */
  onInvestmentLoeschen?: (invId: string) => void;
  /**
   * Im geoeffneten Investment `false`: Dort steht jeder Kasten immer offen
   * (Christian, 29.09.2026). In der Uebersicht bleibt die Karte klappbar.
   */
  einklappbar?: boolean;
}

/**
 * Guidance-Kästchen oberhalb der Stammdaten.
 * Zeigt pro Investment die nächsten konkreten Schritte und führt
 * Vertriebspartner / Vertriebsleiter / Admin durch den Funnel.
 */
export function NaechsteSchritteKarte({ investments, isAdmin, onOpenInvestment, anchorId, highlightKey, showOpenButton = true, titel = "Nächste Schritte", zeigeAbgeschlossene = false, onInvestmentAnlegen, onInvestmentLoeschen, einklappbar = true }: Props) {
  const [offenGewaehlt, setOpen] = useState(true);
  const open = !einklappbar || offenGewaehlt;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [pulse, setPulse] = useState(false);
  const istAbgeschlossen = (i: Investment) =>
    i.pipelineStufe === "archiviert" || i.pipelineStufe === "verloren";
  const visible = zeigeAbgeschlossene
    ? [...investments].sort((a, b) => (a.nummer || 0) - (b.nummer || 0))
    : investments.filter((i) => !istAbgeschlossen(i));
  const [activeId, setActiveId] = useState<string>(() => visible[0]?.id || "");

  // Bei externem Highlight-Trigger: Karte aufklappen, hinscrollen, kurz pulsen lassen.
  useEffect(() => {
    if (highlightKey == null) return;
    setOpen(true);
    setPulse(true);
    const t1 = window.setTimeout(() => {
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
    const t2 = window.setTimeout(() => setPulse(false), 1800);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [highlightKey]);

  /*
   * Ohne Investments gab die Karte frueher einfach nichts aus. Seit sie in den
   * Stammdaten auch die Investmentliste ist, waere damit der einzige Weg zum
   * Anlegen des ersten Investments verschwunden.
   */
  if (visible.length === 0) {
    if (!onInvestmentAnlegen) return null;
    return (
      <Card id={anchorId} className="border-2 border-primary/30 bg-primary/5 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-primary/15 p-1.5">
              <Compass className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-foreground">{titel}</h3>
              <p className="text-xs text-muted-foreground">
                Noch keins angelegt. Der Vertriebsprozess startet mit dem ersten Investment.
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={onInvestmentAnlegen}>
            <Plus className="h-3.5 w-3.5" /> Investment anlegen
          </Button>
        </div>
      </Card>
    );
  }

  const active = visible.find((i) => i.id === activeId) || visible[0];
  const stufeLabel = PIPELINE_STUFEN.find((s) => s.key === active.pipelineStufe)?.label || active.pipelineStufe;
  const guide = getNextSteps(active.pipelineStufe, isAdmin);

  return (
    <Card
      ref={rootRef as any}
      id={anchorId}
      className={`border-2 border-primary/30 bg-primary/5 overflow-hidden transition-shadow scroll-mt-24 ${pulse ? "ring-4 ring-primary/50 shadow-lg" : ""}`}
    >
      {/* Header */}
      <div className={`flex items-center gap-2 px-4 py-2.5 ${einklappbar ? "hover:bg-primary/10 transition-colors" : ""}`}>
        {einklappbar ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex flex-1 items-center gap-2 text-left"
          >
            <div className="rounded-full bg-primary/15 p-1.5">
              <Compass className="h-4 w-4 text-primary" />
            </div>
            <h3 className="font-bold text-sm text-foreground">{titel}</h3>
            {!open && (
              <Badge className="text-[10px] bg-primary text-primary-foreground ml-1">
                {visible.length === 1 ? stufeLabel : `${visible.length} Investments`}
              </Badge>
            )}
          </button>
        ) : (
          <div className="flex flex-1 items-center gap-2">
            <div className="rounded-full bg-primary/15 p-1.5">
              <Compass className="h-4 w-4 text-primary" />
            </div>
            <h3 className="font-bold text-sm text-foreground">{titel}</h3>
          </div>
        )}
        {onInvestmentAnlegen && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs"
            onClick={(e) => { e.stopPropagation(); onInvestmentAnlegen(); }}
          >
            <Plus className="h-3.5 w-3.5" /> Investment anlegen
          </Button>
        )}
        {einklappbar && (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-label={open ? "Zuklappen" : "Aufklappen"}>
            {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
        )}
      </div>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {/* Investment-Tabs (nur wenn mehrere) */}
          {visible.length > 1 && (
            <Tabs value={activeId} onValueChange={setActiveId}>
              <TabsList className="h-8 bg-background/60">
                {visible.map((inv) => (
                  <TabsTrigger
                    key={inv.id}
                    value={inv.id}
                    className={`text-xs h-6 px-2.5 ${istAbgeschlossen(inv) ? "opacity-50" : ""}`}
                  >
                    Investment {inv.nummer}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}

          {/* Aktuelle Stufe */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Aktuelle Stufe:</span>
            <Badge className="text-[10px] bg-primary text-primary-foreground">{stufeLabel}</Badge>
            {active.objektTitel && (
              <span className="text-xs text-muted-foreground truncate">· {active.objektTitel}{active.weNr ? ` (WE ${active.weNr})` : ""}</span>
            )}
            {/* Stand aus der frueheren Investmentliste, die hier aufgegangen ist. */}
            {zeigeAbgeschlossene && active.erstellt_am && (
              <span className="text-[11px] text-muted-foreground">
                · angelegt am {new Date(active.erstellt_am).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}
              </span>
            )}
          </div>

          {/* Guide-Inhalt */}
          {istAbgeschlossen(active) ? (
            /*
             * Ein archiviertes oder verlorenes Investment steht hier, damit es
             * auffindbar bleibt. Handlungsschritte gibt es dafuer aber nicht
             * mehr, sonst fordert die Karte zu etwas auf, das erledigt ist.
             */
            <div className="rounded-lg bg-background/70 border border-primary/20 p-3">
              <p className="text-xs text-muted-foreground">
                Dieses Investment ist {active.pipelineStufe === "verloren" ? "verloren" : "archiviert"}.
                Es gibt keine offenen Schritte mehr.
              </p>
            </div>
          ) : guide ? (
            <>
              {guide.aktionen.length > 0 ? (
                <div className="rounded-lg bg-background/70 border border-primary/20 p-3 space-y-2.5">
                  <div className="font-semibold text-sm text-foreground">{guide.titel}</div>
                  <ol className="space-y-1.5">
                    {guide.aktionen.map((a, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs">
                        <span className="flex-shrink-0 w-4 h-4 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center mt-0.5">
                          {idx + 1}
                        </span>
                        <span className="text-foreground/90 flex-1">
                          {a.text}
                          {a.adminOnly && (
                            <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] text-amber-600 font-medium">
                              <Lock className="h-2.5 w-2.5" /> Admin
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ol>
                  {guide.hinweis && (
                    <p className="text-[11px] text-muted-foreground italic border-t border-primary/15 pt-2 mt-2">
                      💡 {guide.hinweis}
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-lg bg-background/70 border border-primary/20 p-3">
                  <p className="text-xs text-muted-foreground italic">
                    Diese Schritte werden vom Backoffice bearbeitet. Sollte dein Beitrag benötigt werden, melden wir uns bei dir.
                  </p>
                </div>
              )}

              {onInvestmentLoeschen && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-destructive"
                  onClick={() => onInvestmentLoeschen(active.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Investment löschen
                </Button>
              )}
              {showOpenButton && (
                <Button
                  size="sm"
                  variant="brand"
                  className="h-8 text-xs gap-1.5"
                  onClick={() => onOpenInvestment(active.id)}
                >
                  Investment {active.nummer} öffnen <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground italic">Für diese Stufe ist aktuell kein Schritt-Leitfaden hinterlegt.</p>
          )}
        </div>
      )}
    </Card>
  );
}