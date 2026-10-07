import { Card } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { useMemo } from "react";
import { getKontakte, type KundeData } from "@/lib/kundenStore";
import { excludeStatsKontakte } from "@/lib/statsExclusion";
import { ArrowRight, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLiveVersion } from "@/hooks/useLiveData";

const PIPELINE_STUFEN = [
  { key: "neuer_lead", label: "Neuer Lead", color: "bg-sky-500" },
  { key: "kontaktversuche", label: "Kontaktversuche", color: "bg-slate-500" },
  { key: "follow_up", label: "Follow-Up", color: "bg-lime-500" },
  { key: "erstgespraech_geplant", label: "Erstgespräch", color: "bg-blue-500" },
  { key: "verloren", label: "Verloren", color: "bg-red-500" },
];

function getStufe(k: KundeData): string {
  // "Erstgespraech gefuehrt" gibt es nicht mehr, Altdaten tragen sie noch.
  if (k.pipelineStufe === "erstgespraech") return "erstgespraech_geplant";
  if (k.pipelineStufe) return k.pipelineStufe;
  if (k.status === "verloren" || k.status === "inaktiv") return "verloren";
  return "neuer_lead";
}

export function SetterPipelineCard() {
  const navigate = useNavigate();
  const _cv = useLiveVersion(["kontakte"]);

  const stufenData = useMemo(() => {
    const all = excludeStatsKontakte(getKontakte());
    // Same logic as Pipeline.tsx for Setterin
    const relevant = all.filter(k => {
      if (!k.leadTyp && !k.setter) return false;
      const hasInteraction = k.berater || k.verstecktBis || (k.nichtErreichtCount && k.nichtErreichtCount > 0) || k.setterCloser || k.setterChecklisteDone || k.setterSkriptNotizen || k.status === "verloren";
      const isNewLead = (k.leadTyp || k.setter) && getStufe(k) === "neuer_lead";
      return isNewLead || !!hasInteraction;
    });

    return PIPELINE_STUFEN.map(stufe => ({
      ...stufe,
      count: relevant.filter(k => getStufe(k) === stufe.key).length,
    }));
  }, [_cv]);

  const total = stufenData.reduce((s, d) => s + d.count, 0);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>          <h3 className="font-bold">Pipeline-Übersicht</h3>
        </div>
        <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => navigate("/pipeline")}>
          Zur Pipeline <ArrowRight className="h-3 w-3" />
        </Button>
      </div>

      {/* Funnel visualization */}
      <div className="space-y-2.5">
        {stufenData.map(stufe => {
          const pct = total > 0 ? Math.max((stufe.count / total) * 100, 4) : 0;
          return (
            <div key={stufe.key} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-28 shrink-0 text-right">{stufe.label}</span>
              <div className="flex-1 h-7 bg-muted/50 rounded-md overflow-hidden relative">
                <div
                  className={`h-full ${stufe.color} rounded-md transition-all duration-500 flex items-center`}
                  style={{ width: `${pct}%`, minWidth: stufe.count > 0 ? '2rem' : '0' }}
                >
                  {stufe.count > 0 && (
                    <span className="text-[11px] font-bold text-white pl-2">{stufe.count}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-3 border-t flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <GitBranch className="h-3 w-3" />
          {total} Leads in der Pipeline
        </span>
      </div>
    </Card>
  );
}
