import { AkademieLink as Link } from "@/components/vertriebsakademie/AkademieLink";
import { ArrowRight, CheckCircle2, Lock, Compass, Flag, Network, Phone, Presentation, Building2, Banknote, ScrollText, Brain, Rocket, Gift, BookOpen } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AkademieKapitel } from "@/lib/vertriebsakademieContent";
import type { KapitelStats } from "@/lib/vertriebsakademieProgress";

const ICONS = { compass: Compass, flag: Flag, network: Network, phone: Phone, presentation: Presentation, building: Building2, banknote: Banknote, scroll: ScrollText, gift: Gift, brain: Brain, rocket: Rocket, book: BookOpen };

/**
 * Farbige Kapitel-Kachel mit rundem Ring-Progress statt Balken.
 * Jedes Kapitel bekommt eine eigene Akzentfarbe (aus Slug abgeleitet).
 */
const ACCENTS: { border: string; bg: string; icon: string; ring: string }[] = [
  { border: "border-primary/30", bg: "from-primary/10", icon: "bg-primary/10 text-primary", ring: "stroke-primary" },
  { border: "border-emerald-500/30", bg: "from-emerald-500/10", icon: "bg-emerald-500/10 text-emerald-600", ring: "stroke-emerald-500" },
  { border: "border-amber-500/30", bg: "from-amber-500/10", icon: "bg-amber-500/10 text-amber-600", ring: "stroke-amber-500" },
  { border: "border-sky-500/30", bg: "from-sky-500/10", icon: "bg-sky-500/10 text-sky-600", ring: "stroke-sky-500" },
  { border: "border-rose-500/30", bg: "from-rose-500/10", icon: "bg-rose-500/10 text-rose-600", ring: "stroke-rose-500" },
  { border: "border-indigo-500/30", bg: "from-indigo-500/10", icon: "bg-indigo-500/10 text-indigo-600", ring: "stroke-indigo-500" },
];

export function AkademieKapitelKachel({
  k, stats, index, locked,
}: { k: AkademieKapitel; stats: KapitelStats; index: number; locked?: boolean }) {
  const Icon = ICONS[k.icon] || Compass;
  const accent = ACCENTS[index % ACCENTS.length];

  const size = 56;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (stats.pct / 100) * circ;

  const inner = (
    <Card className={cn(
      "relative p-5 h-full transition-all overflow-hidden",
      "hover:shadow-lg hover:-translate-y-0.5",
      stats.isDone ? "border-emerald-500/50" : accent.border,
      locked && "opacity-60 hover:translate-y-0 hover:shadow-none cursor-not-allowed",
    )}>
      <div className={cn("absolute inset-0 bg-gradient-to-br to-transparent pointer-events-none", accent.bg)} aria-hidden />
      <div className="relative flex items-start gap-4">
        <div className={cn("p-3 rounded-xl shrink-0", accent.icon)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[10px]">Kapitel {k.nummer}</Badge>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">{k.kicker}</span>
            {k.placeholder && (
              <Badge className="text-[9px] bg-orange-500/15 text-orange-600 border-orange-500/30">in Arbeit</Badge>
            )}
            {stats.isDone && (
              <Badge className="text-[9px] bg-emerald-500/15 text-emerald-600 border-emerald-500/30 gap-1">
                <CheckCircle2 className="h-3 w-3" /> fertig
              </Badge>
            )}
          </div>
          <h3 className="mt-1 text-base font-semibold leading-snug">{k.titel}</h3>
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{k.teaser}</p>
        </div>

        {/* Ring-Progress rechts */}
        <div className="shrink-0 relative" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            <circle cx={size / 2} cy={size / 2} r={r} className="stroke-muted" strokeWidth={stroke} fill="none" />
            <circle
              cx={size / 2} cy={size / 2} r={r}
              className={cn("transition-all duration-500", stats.isDone ? "stroke-emerald-500" : accent.ring)}
              strokeWidth={stroke}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circ - dash}`}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold tabular-nums">
            {locked ? <Lock className="h-4 w-4 text-muted-foreground" /> : `${stats.pct}%`}
          </div>
        </div>
      </div>

      <div className="relative mt-4 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{stats.doneChecks}/{stats.totalChecks} Checks · {stats.doneUebungen}/{stats.totalUebungen} Übungen</span>
        <span className="inline-flex items-center gap-1 text-primary font-medium">
          Öffnen <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Card>
  );

  if (locked) return <div>{inner}</div>;
  return <Link to={`/vertriebsakademie/${k.slug}`} className="block group">{inner}</Link>;
}
