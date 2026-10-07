import { Card } from "@/components/ui/card";
import { Users, TrendingUp, Minus, ArrowUp, ArrowDown } from "lucide-react";
import { useVaProgress, computeGlobalStats } from "@/lib/vertriebsakademieProgress";
import { useZielgruppe } from "@/lib/vertriebsakademieZielgruppe";
import { useVaTeamAverage } from "@/hooks/useVaTeamAverage";
import { cn } from "@/lib/utils";

/**
 * Zeigt „Du vs. Team-Durchschnitt" – bewusst ohne Rangliste, ohne Namen,
 * ohne Punkte. Nur zwei Balken zum Vergleich + kurzer Motivations-Text.
 */
export function AkademieTeamVergleich() {
  const s = useVaProgress();
  const [zielgruppe] = useZielgruppe();
  const g = computeGlobalStats(s, zielgruppe);
  const { avg, usersCount, loading } = useVaTeamAverage();

  const teamAvg = typeof avg === "number" ? avg : 0;
  const showTeam = !loading && typeof avg === "number" && usersCount > 1;
  const diff = showTeam ? g.overallPct - teamAvg : 0;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-sky-500/10 text-sky-600">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold">Dein Fortschritt im Vergleich</h3>
            <p className="text-xs text-muted-foreground">
              Anonymer Durchschnitt aller Teampartner – ohne Rangliste, ohne Druck.
            </p>
          </div>
        </div>
        {showTeam && (
          <div className="text-[11px] text-muted-foreground flex items-center gap-1 shrink-0">
            <Users className="h-3 w-3" /> {usersCount} Teilnehmer
          </div>
        )}
      </div>

      <div className="space-y-4">
        <VergleichsBalken label="Du" pct={g.overallPct} accent="primary" />
        {showTeam ? (
          <VergleichsBalken label="Team-Durchschnitt" pct={teamAvg} accent="muted" />
        ) : (
          <div className="text-xs text-muted-foreground italic">
            Noch nicht genug Teilnehmer für einen aussagekräftigen Durchschnitt.
          </div>
        )}
      </div>

      {showTeam && (
        <div className={cn(
          "mt-4 rounded-lg border p-3 text-xs flex items-start gap-2",
          diff > 0 && "border-emerald-500/30 bg-emerald-500/5 text-emerald-700",
          diff === 0 && "border-muted bg-muted/20 text-muted-foreground",
          diff < 0 && "border-sky-500/30 bg-sky-500/5 text-sky-700",
        )}>
          {diff > 0 && <ArrowUp className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
          {diff === 0 && <Minus className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
          {diff < 0 && <ArrowDown className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
          <span>
            {diff > 0 && <>Du bist <strong>{diff} Prozentpunkte</strong> vor dem Team-Durchschnitt – stark, weiter so.</>}
            {diff === 0 && <>Du liegst exakt beim Team-Durchschnitt. Nächstes Kapitel bringt dich nach vorn.</>}
            {diff < 0 && <>Noch <strong>{Math.abs(diff)} Prozentpunkte</strong> bis zum Team-Durchschnitt – gut machbar in 1–2 Kapiteln.</>}
          </span>
        </div>
      )}
    </Card>
  );
}

function VergleichsBalken({ label, pct, accent }: { label: string; pct: number; accent: "primary" | "muted" }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">{pct}%</span>
      </div>
      <div className="h-2.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full transition-all duration-500",
            accent === "primary" ? "bg-gradient-to-r from-primary to-emerald-500" : "bg-muted-foreground/40",
          )}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
    </div>
  );
}
