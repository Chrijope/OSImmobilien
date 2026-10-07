import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { cacheGet } from "@/lib/dataCache";
import { isTestAccount, localGet } from "@/lib/dbStoreHelper";
import { useLiveVersion } from "@/hooks/useLiveData";
import { useUser } from "@/contexts/UserContext";

function getActiveChallenges() {
  try {
    if (isTestAccount()) {
      const raw = localGet<any[]>("mi_wettbewerb_challenges", []);
      return raw.filter((c: any) => c.aktiv);
    }
    return cacheGet("wettbewerb_challenges").filter((c: any) => c.aktiv);
  } catch {}
  return [];
}

const posIcon = (pos: number) => {
  if (pos === 1) return "👑";
  if (pos === 2) return "🥈";
  if (pos === 3) return "🥉";
  return `${pos}.`;
};

const podiumColors = ["bg-yellow-500", "bg-slate-400", "bg-amber-700"];

export function WettbewerbCard() {
  const navigate = useNavigate();
  const { user } = useUser();
  const _cv = useLiveVersion(["wettbewerb_challenges"]);
  const challenges = getActiveChallenges();
  const aktiv = challenges.length;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">          <CardTitle className="text-[13px] font-medium text-muted-foreground tracking-wide uppercase">Wettbewerb</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 flex-1 flex flex-col">
        {challenges.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground text-center">
              Noch keine aktiven Challenges.
              <br />
              <span className="text-xs">Erstelle eine neue Challenge unter Wettbewerb.</span>
            </p>
          </div>
        ) : (
          <>
            {challenges.slice(0, 3).map((c: any, idx: number) => {
              const ranking: any[] = Array.isArray(c.ranking) ? c.ranking : [];
              const top3 = ranking.slice(0, 3);
              const myEntry = ranking.find((r: any) => r.ich);
              const myPos = myEntry?.pos;
              const zielwert = c.zielwert || 0;
              const einheit = c.einheit || "";

              return (
                <div key={idx} className="bg-muted/50 rounded-lg p-3 space-y-2">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base">{c.icon || "🏆"}</span>
                      <p className="text-sm font-semibold text-foreground truncate">{c.titel}</p>
                    </div>
                    <Badge variant="outline" className="text-[9px] flex-shrink-0">
                      {c.anzeigemonat || "–"}
                    </Badge>
                  </div>

                  {/* Mini Podium – top 3 */}
                  {top3.length > 0 ? (
                    <div className="flex items-end justify-center gap-2 pt-1">
                      {(top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3).map((r: any, i: number) => {
                        const isFirst = top3.length >= 3 ? i === 1 : r.pos === 1;
                        const barH = isFirst ? "h-10" : i === 0 ? "h-7" : "h-5";
                        return (
                          <div key={r.pos} className="flex flex-col items-center" style={{ minWidth: 44 }}>
                            <span className="text-[10px] mb-0.5">{posIcon(r.pos)}</span>
                            <div className={`w-7 h-7 rounded-full ${r.color || "bg-muted-foreground"} flex items-center justify-center text-[9px] font-bold text-card`}>
                              {r.kuerzel}
                            </div>
                            <p className="text-[9px] font-medium text-foreground mt-0.5 truncate max-w-[50px] text-center">{r.name?.split(" ")[0]}</p>
                            <p className="text-[8px] text-muted-foreground font-semibold">{r.wert} {einheit}</p>
                            <div className={`${barH} w-10 rounded-t-md ${isFirst ? "bg-primary" : "bg-muted-foreground/20"} mt-0.5`} />
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      Noch keine Platzierung. Sobald die ersten Ergebnisse da sind, steht hier das Treppchen.
                    </p>
                  )}

                  {/* Own position */}
                  {myEntry && (
                    <div className="flex items-center justify-between bg-primary/10 rounded-md px-2.5 py-1.5 ring-1 ring-primary/20">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-primary">{posIcon(myPos)}</span>
                        <span className="text-xs font-medium text-primary">Dein Platz</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground">{myEntry.wert}/{zielwert} {einheit}</span>
                        <Badge className="bg-primary text-primary-foreground text-[9px] h-4 px-1.5">#{myPos}</Badge>
                      </div>
                    </div>
                  )}

                  {/* Progress */}
                  <div>
                    <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                      <span>Fortschritt</span>
                      <span>{c.fortschritt || 0}%</span>
                    </div>
                    <Progress value={c.fortschritt || 0} className="h-1.5" />
                  </div>
                </div>
              );
            })}
          </>
        )}

        <div className="mt-auto pt-1">
          <button
            onClick={() => navigate("/wettbewerb")}
            className="text-xs text-primary font-medium hover:underline text-left"
          >
            Alle Challenges ansehen →
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
