import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info, TrendingUp } from "lucide-react";
import { computeLeadScore, leadScoreColor, type LeadScoreResult } from "@/lib/leadScore";
import { NUR_POPUP_OVERLAY } from "@/lib/popupOverlay";

/* ───────── Compact Badge (klein, oben rechts in Kundendaten) ───────── */

export function LeadScoreBadge({ saData }: { saData: any }) {
  const [open, setOpen] = useState(false);
  const result = computeLeadScore(saData);

  if (!result.hasSA) return null;

  const colors = leadScoreColor(result.klasse);
  const radius = 22;
  const circ = 2 * Math.PI * radius;
  const dash = circ * (result.total / 100);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`group flex items-center gap-2 rounded-lg border ${colors.badge} px-2 py-1.5 transition-all hover:shadow-md`}
        title="Lead Score – Details ansehen"
      >
        <div className="relative">
          <svg width="52" height="52" viewBox="0 0 60 60" className="-rotate-90">
            <circle cx="30" cy="30" r={radius} fill="none" className="stroke-muted/40" strokeWidth="6" />
            <circle
              cx="30" cy="30" r={radius} fill="none"
              className={colors.ring}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circ}`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
            <span className={`text-sm font-bold ${colors.text}`}>{result.total}</span>
            <span className="text-[8px] text-muted-foreground">/ 100</span>
          </div>
        </div>
        <div className="flex flex-col items-start text-left">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Lead Score</span>
          <span className={`text-xs font-semibold ${colors.text}`}>{result.klasse}-Lead</span>
          <span className="text-[10px] text-muted-foreground group-hover:underline">Erfahre mehr →</span>
        </div>
      </button>

      <LeadScoreDialog open={open} onOpenChange={setOpen} result={result} />
    </>
  );
}

/* ───────── Hinweis-Box (wenn SA noch nicht ausgefüllt) ───────── */

export function LeadScoreHint({ saData }: { saData: any }) {
  const result = computeLeadScore(saData);
  if (result.hasSA) return null;
  return (
    <div className="flex items-center gap-2 text-[10px] text-muted-foreground bg-muted/30 rounded-md px-2 py-1.5 border border-dashed">
      <TrendingUp className="h-3 w-3" />
      <span>Lead Score nach Selbstauskunft</span>
    </div>
  );
}

/* ───────── Dialog mit vollständigem Breakdown ───────── */

function LeadScoreDialog({
  open, onOpenChange, result,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  result: LeadScoreResult;
}) {
  const colors = leadScoreColor(result.klasse);
  const radius = 50;
  const circ = 2 * Math.PI * radius;
  const dash = circ * (result.total / 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
       * Der Standard-Overlay legt sich mit Abdunklung und Weichzeichner über
       * die ganze Seite und verdeckt damit auch die Sidebar. Bei einem reinen
       * Info-Popup wie diesem soll aber nur das Popup erscheinen. Der Overlay
       * bleibt deshalb im Baum, damit ein Klick daneben weiterhin schließt,
       * wird aber unsichtbar geschaltet.
       */}
      <DialogContent
        overlayClassName={NUR_POPUP_OVERLAY}
        className="max-w-lg shadow-2xl"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" /> Lead Score
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-muted-foreground hover:text-foreground">
                    <Info className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <div className="text-xs space-y-1">
                    <p>Score 0–100 aus den Angaben der Selbstauskunft. Bewertet Einkommen, frei verfügbares Budget, Eigenkapital, Schuldenquote, Beruf und weitere Faktoren.</p>
                    <p className="font-semibold pt-1">A ≥ 80 · B ≥ 60 · C ≥ 40 · D &lt; 40</p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </DialogTitle>
          <DialogDescription>
            Bewertung des Bonitäts- und Abschluss-Potenzials auf Basis der Selbstauskunft.
          </DialogDescription>
        </DialogHeader>

        <div className={`rounded-lg p-5 ${colors.bg} border-2`}>
          <div className="flex items-center gap-5">
            <div className="relative flex-shrink-0">
              <svg width="120" height="120" viewBox="0 0 120 120" className="-rotate-90">
                <circle cx="60" cy="60" r={radius} fill="none" className="stroke-muted" strokeWidth="10" />
                <circle
                  cx="60" cy="60" r={radius} fill="none"
                  className={colors.ring}
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${dash} ${circ}`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className={`text-3xl font-bold ${colors.text}`}>{result.total}</div>
                <div className="text-[11px] text-muted-foreground -mt-0.5">/ 100</div>
              </div>
            </div>
            <div className="flex-1">
              <Badge variant="outline" className={`mb-2 ${colors.badge}`}>{result.klasseLabel}</Badge>
              <p className="text-xs text-muted-foreground">
                Klassifizierung: A ≥ 80 · B ≥ 60 · C ≥ 40 · D &lt; 40
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-2.5 pt-4 border-t border-border/40">
            {result.breakdown.map(b => {
              const pct = b.max > 0 ? (b.score / b.max) * 100 : 0;
              return (
                <div key={b.key}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{b.label}</span>
                    <span className="font-semibold tabular-nums">
                      {b.score}<span className="text-muted-foreground font-normal">/{b.max}</span>
                    </span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-0.5">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  {b.detail && <div className="text-[10px] text-muted-foreground mt-0.5">{b.detail}</div>}
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}