import { AkademieLink as Link } from "@/components/vertriebsakademie/AkademieLink";
import { Check, Lock, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { VERTRIEBSAKADEMIE_KAPITEL } from "@/lib/vertriebsakademieContent";
import { useVaProgress, computeKapitelStats } from "@/lib/vertriebsakademieProgress";
import { useZielgruppe } from "@/lib/vertriebsakademieZielgruppe";

/**
 * Horizontale Bubble-Roadmap durch alle Kapitel.
 * Zeigt Fortschritt visuell als Journey – motiviert weiterzumachen.
 */
export function AkademieRoadmap() {
  const state = useVaProgress();
  const [zielgruppe] = useZielgruppe();
  const items = VERTRIEBSAKADEMIE_KAPITEL.map((k) => ({
    k,
    stats: computeKapitelStats(k, state, zielgruppe),
  }));
  const currentIdx = items.findIndex((i) => !i.stats.isDone);

  return (
    <div data-ui="card" className="rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">Deine Reise</h3>
        <p className="text-xs text-muted-foreground">Klicke einen Meilenstein an, um direkt einzusteigen.</p>
      </div>
      <div className="overflow-x-auto">
        <div className="relative flex items-center gap-2 min-w-max py-2">
          {items.map((it, idx) => {
            const isDone = it.stats.isDone;
            const isCurrent = idx === currentIdx;
            const isLast = idx === items.length - 1;
            return (
              <div key={it.k.slug} className="flex items-center">
                <Link
                  to={`/vertriebsakademie/${it.k.slug}`}
                  className="group flex flex-col items-center gap-1.5 w-[92px]"
                  title={`Kapitel ${it.k.nummer}: ${it.k.titel}`}
                >
                  <div
                    className={cn(
                      "relative h-11 w-11 rounded-full border-2 flex items-center justify-center text-sm font-semibold transition-all",
                      isDone && "bg-emerald-500 border-emerald-500 text-white shadow-md shadow-emerald-500/30",
                      isCurrent && !isDone && "bg-primary border-primary text-primary-foreground ring-4 ring-primary/25 animate-pulse",
                      !isDone && !isCurrent && "bg-muted border-border text-muted-foreground group-hover:border-primary/60",
                    )}
                  >
                    {isDone ? <Check className="h-5 w-5" /> : isCurrent ? <PlayCircle className="h-5 w-5" /> : idx > (currentIdx === -1 ? items.length : currentIdx) ? <Lock className="h-3.5 w-3.5" /> : <span>{it.k.nummer}</span>}
                  </div>
                  <div className="text-[10px] font-medium text-center leading-tight text-muted-foreground group-hover:text-foreground line-clamp-2">
                    {it.k.titel}
                  </div>
                  <div className="text-[9px] tabular-nums text-muted-foreground">{it.stats.pct}%</div>
                </Link>
                {!isLast && (
                  <div
                    aria-hidden
                    className={cn(
                      "h-1 w-6 rounded-full mx-0.5 self-start mt-6",
                      isDone ? "bg-emerald-500/70" : "bg-border",
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
