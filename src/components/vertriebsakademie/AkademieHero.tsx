import { Sparkles, BookOpen, CheckCircle2, ArrowRight, PlayCircle, Trophy } from "lucide-react";
import { AkademieLink as Link } from "@/components/vertriebsakademie/AkademieLink";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useUser } from "@/contexts/UserContext";
import { useVaProgress, computeGlobalStats, computeBadges, computeKapitelStats } from "@/lib/vertriebsakademieProgress";
import { VERTRIEBSAKADEMIE_KAPITEL } from "@/lib/vertriebsakademieContent";
import { useZielgruppe } from "@/lib/vertriebsakademieZielgruppe";

/**
 * Roadmap-Hero für die Vertriebsakademie-Übersicht.
 * Bewusst OHNE XP/Level – zeigt nur Kapitel-Fortschritt, Meilenstein-Badges
 * und den Gesamt-Fortschrittsring.
 */
export function AkademieHero({ suche }: {
  /**
   * Die Suche ueber alle Kapitel.
   *
   * Sie wird von aussen hereingereicht und hier unten im Hero gezeichnet.
   * Vorher stand sie als eigener Kasten ueber dem Hero und ging dort unter:
   * Wer die Seite oeffnet, sieht zuerst den Fortschrittsring, und der Kasten
   * darueber las sich wie eine Kopfzeile. Im Hero steht sie da, wo der Blick
   * ohnehin landet. Wunsch Christians vom 11.09.2026.
   */
  suche?: React.ReactNode;
}) {
  const state = useVaProgress();
  const [zielgruppe] = useZielgruppe();
  const g = computeGlobalStats(state, zielgruppe);
  const badges = computeBadges(state, zielgruppe);
  const badgesUnlocked = badges.filter((b) => b.erreicht).length;
  const { user } = useUser();
  const vorname = (user as any)?.name?.split(" ")?.[0] || "Willkommen";
  const allDone = g.totalKapitel > 0 && g.doneKapitel === g.totalKapitel;

  // „Weitermachen"-Logik: erstes Kapitel, das noch nicht abgeschlossen ist.
  // Fallback: erstes Kapitel überhaupt, wenn noch nichts angefangen wurde.
  const nextKap =
    VERTRIEBSAKADEMIE_KAPITEL.find((k) => !computeKapitelStats(k, state, zielgruppe).isDone) ??
    VERTRIEBSAKADEMIE_KAPITEL[0];
  const nextStats = nextKap ? computeKapitelStats(nextKap, state, zielgruppe) : null;
  const hasStarted = g.doneChecks + g.doneUebungen + g.doneKapitel > 0;

  // Runder Ring: SVG – zeigt den Gesamt-Fortschritt in %
  const size = 128;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (g.overallPct / 100) * circ;

  return (
    <Card className="relative overflow-hidden border-primary/20">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-emerald-500/10 pointer-events-none" aria-hidden />
      <div className="relative p-6 md:p-8 grid gap-6 md:grid-cols-[auto_1fr_auto] items-center">
        {/* Fortschritts-Ring (Gesamt %) */}
        <div className="flex items-center justify-center">
          <div className="relative" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
              <circle cx={size / 2} cy={size / 2} r={r} stroke="hsl(var(--muted))" strokeWidth={stroke} fill="none" />
              <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                stroke="url(#va-hero-gradient)"
                strokeWidth={stroke}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${dash} ${circ - dash}`}
                className="transition-all duration-700"
              />
              <defs>
                <linearGradient id="va-hero-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="hsl(var(--primary))" />
                  <stop offset="100%" stopColor="rgb(16 185 129)" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Fortschritt</div>
              <div className="text-2xl font-semibold tabular-nums">{g.overallPct}%</div>
            </div>
          </div>
        </div>

        {/* Mitte */}
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-primary font-semibold">Vertriebsakademie</div>
          <h2 className="text-2xl md:text-3xl font-semibold leading-tight">
            {allDone
              ? `Alles gemeistert, ${vorname}.`
              : hasStarted
              ? `Weiter geht's, ${vorname}.`
              : `Willkommen, ${vorname}.`}
          </h2>
          {nextKap && !allDone && (
            <p className="mt-2 text-sm text-muted-foreground max-w-xl">
              {hasStarted ? "Weiter bei" : "Starte mit"}{" "}
              <span className="font-medium text-foreground">
                Kapitel {nextKap.nummer} — {nextKap.titel}
              </span>
              {nextStats && nextStats.pct > 0 && (
                <span className="text-muted-foreground"> · {nextStats.pct}% erledigt</span>
              )}
            </p>
          )}
          {allDone && (
            <>
              {/* Der Rest der Feier: Das Konfetti kam einmal, dieser Hinweis bleibt. */}
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-400/50 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                <Trophy className="h-3.5 w-3.5" /> Vertriebsakademie erfolgreich durchlaufen
              </div>
              <p className="mt-2 text-sm text-muted-foreground max-w-xl">
                Nutze die Kapitel jetzt als Nachschlagewerk — direkt vor oder im Kundengespräch.
              </p>
            </>
          )}
          <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden max-w-md">
            <div className="h-full bg-gradient-to-r from-primary to-emerald-500 transition-all" style={{ width: `${g.overallPct}%` }} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {nextKap && !allDone && (
              <Button asChild size="sm" className="gap-1.5">
                <Link to={`/vertriebsakademie/${nextKap.slug}`}>
                  <PlayCircle className="h-4 w-4" />
                  {hasStarted ? "Weitermachen" : "Jetzt starten"}
                </Link>
              </Button>
            )}
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link to="/vertriebsakademie/einwaende" state={{ vonAkademie: true }}>
                Einwand-Bibliothek <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>

        {/* Rechts: Mini-Stats */}
        <div className="flex md:flex-col gap-3 md:min-w-[160px]">
          <MiniStat icon={<BookOpen className="h-4 w-4 text-primary" />} label="Kapitel" value={`${g.doneKapitel}/${g.totalKapitel}`} />
          <MiniStat icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} label="Übungen" value={`${g.doneUebungen}/${g.totalUebungen}`} />
          <MiniStat icon={<Sparkles className="h-4 w-4 text-amber-500" />} label="Meilensteine" value={`${badgesUnlocked}/${badges.length}`} />
        </div>
      </div>

      {suche && (
        <div className="relative border-t border-primary/15 bg-background/40 px-6 py-4 md:px-8">
          {suche}
        </div>
      )}
    </Card>
  );
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-background/60 px-3 py-2 flex-1 md:flex-initial">
      <div className="shrink-0">{icon}</div>
      <div className="leading-tight min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-sm font-semibold tabular-nums">{value}</div>
      </div>
    </div>
  );
}
