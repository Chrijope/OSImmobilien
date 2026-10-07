import { AkademieLink as Link } from "@/components/vertriebsakademie/AkademieLink";
import { BookOpen, Users, ArrowRight, CheckCircle2 } from "lucide-react";
import { useVaProgress, computeGlobalStats } from "@/lib/vertriebsakademieProgress";
import { useZielgruppe } from "@/lib/vertriebsakademieZielgruppe";
import { useVaTeamAverage } from "@/hooks/useVaTeamAverage";
import { cn } from "@/lib/utils";

interface Props {
  compact?: boolean;
  showBackLink?: boolean;
}

/**
 * Kompakte Fortschrittsleiste – bewusst OHNE XP, Level oder Streak-Mechanik.
 * Zeigt nur:
 *  • Kapitel-Zähler (X/Y)
 *  • Gesamt-Fortschritt %
 *  • Anonymen Team-Durchschnitt zum sanften Vergleich
 */
export function AkademieProgressBar({ compact, showBackLink }: Props) {
  const s = useVaProgress();
  const [zielgruppe] = useZielgruppe();
  const g = computeGlobalStats(s, zielgruppe);
  const { avg, usersCount } = useVaTeamAverage();

  const teamAvg = typeof avg === "number" ? avg : null;
  const diff = teamAvg !== null ? g.overallPct - teamAvg : null;

  return (
    <div className="sticky top-2 z-30 rounded-xl border bg-background/90 backdrop-blur shadow-sm px-4 py-3 mb-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
            <BookOpen className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Kapitel</div>
            <div className="text-sm font-semibold tabular-nums">
              {g.doneKapitel}/{g.totalKapitel}
              {g.doneKapitel === g.totalKapitel && g.totalKapitel > 0 && (
                <CheckCircle2 className="inline-block h-3.5 w-3.5 text-emerald-500 ml-1 -mt-0.5" />
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-[160px]">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
            <span>Dein Gesamt-Fortschritt</span>
            <span className="tabular-nums font-medium text-foreground">{g.overallPct}%</span>
          </div>
          <div className="relative h-2.5 rounded-full bg-muted overflow-hidden">
            {/* Team-Ø Markierung */}
            {teamAvg !== null && usersCount > 1 && (
              <div
                className="absolute top-0 bottom-0 w-[2px] bg-foreground/60 z-10"
                style={{ left: `${teamAvg}%` }}
                aria-hidden
              />
            )}
            <div
              className="h-full bg-gradient-to-r from-primary to-emerald-500 transition-all"
              style={{ width: `${g.overallPct}%` }}
            />
          </div>
          {teamAvg !== null && usersCount > 1 && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-1">
              <Users className="h-3 w-3" />
              <span>Team-Ø: <span className="tabular-nums font-medium text-foreground">{teamAvg}%</span></span>
              {diff !== null && diff !== 0 && (
                <span className={cn("tabular-nums font-medium", diff > 0 ? "text-emerald-600" : "text-muted-foreground")}>
                  ({diff > 0 ? "+" : ""}{diff} PP)
                </span>
              )}
            </div>
          )}
        </div>

        {showBackLink && !compact && (
          <Link
            to="/vertriebsakademie"
            className="text-xs font-medium text-primary hover:underline flex items-center gap-1 shrink-0"
          >
            Übersicht <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </div>
  );
}