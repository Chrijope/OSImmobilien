import { Card } from "@/components/ui/card";
import { Users, UserPlus, Info, XCircle, ClipboardList, UserCog } from "lucide-react";
import { getKontakte } from "@/lib/kundenStore";
import { excludeStatsKontakte } from "@/lib/statsExclusion";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getEffectivePipelineStufe, getProzessBereich, PIPELINE_STUFEN } from "@/lib/kontaktPipeline";
import { useUser } from "@/contexts/UserContext";
import { useLiveVersion } from "@/hooks/useLiveData";

export function SetterLeadOverviewCard() {
  const navigate = useNavigate();
  const { user } = useUser();
  const isAdmin = ["admin", "inhaber"].includes(user.role);
  const [openHint, setOpenHint] = useState<string | null>(null);
  const _cv = useLiveVersion(["kontakte"]);

  const stats = useMemo(() => {
    const allKontakte = excludeStatsKontakte(getKontakte());
    const SETTER_LEAD_TYPEN = ["meta", "google", "website", "api"];
    const leads = allKontakte.filter(k =>
      !!k.leadTyp && SETTER_LEAD_TYPEN.includes(k.leadTyp)
    );
    const erstgespraechIdx = PIPELINE_STUFEN.findIndex(s => s.key === "erstgespraech_geplant");
    const stufeIdx = (key: string) => PIPELINE_STUFEN.findIndex(s => s.key === key);

    const total = leads.length;
    const neu = leads.filter(k => k.status === "neu").length;
    const verloren = leads.filter(k => !k.archiviert && getEffectivePipelineStufe(k) === "verloren").length;
    const inLeadVerwaltung = leads.filter(k => {
      if (k.berater && getProzessBereich(k) !== "leadverwaltung") return false;
      if (k.archiviert) return false;
      if (getEffectivePipelineStufe(k) === "verloren") return false;
      return true;
    }).length;
    const anVpUebergeben = leads.filter(k => {
      if (k.archiviert) return false;
      const stufe = getEffectivePipelineStufe(k);
      if (stufe === "verloren") return false;
      const beraterGesetzt = !!(k.berater && k.berater.trim());
      const stufeNachErstgespraech = erstgespraechIdx >= 0 && stufeIdx(stufe) > erstgespraechIdx;
      return beraterGesetzt || stufeNachErstgespraech;
    }).length;
    const conversionRate = total > 0 ? Math.round((anVpUebergeben / total) * 100) : 0;
    return { total, neu, verloren, inLeadVerwaltung, anVpUebergeben, conversionRate };
  }, [_cv]);

  const kpis = [
    { label: "Leads gesamt", value: stats.total, icon: Users, color: "text-primary", hint: "Alle Leads aus externen Quellen (Meta, Google, Website, API).", link: isAdmin || user.role === "setterin" ? "/lead-verwaltung" : undefined },
    { label: "Neue Leads", value: stats.neu, icon: UserPlus, color: "text-[hsl(var(--info))]", hint: "Leads mit Status 'neu' – noch nicht kontaktiert oder bearbeitet." },
    { label: "In Lead-Verwaltung", value: stats.inLeadVerwaltung, icon: ClipboardList, color: "text-primary", hint: "Leads, die aktuell in der Lead-Verwaltung sichtbar sind – ohne zugewiesenen Vertriebspartner, nicht verloren, nicht archiviert.", link: isAdmin || user.role === "setterin" ? "/lead-verwaltung" : undefined },
    { label: "An VP übergeben", value: stats.anVpUebergeben, icon: UserCog, color: "text-[hsl(var(--success))]", hint: "Leads, bei denen ein Vertriebspartner zugewiesen ist oder die Pipeline-Stufe bereits nach dem Erstgespräch liegt." },
    { label: "Verloren", value: stats.verloren, icon: XCircle, color: "text-destructive", hint: "Leads, die als verloren markiert wurden – z.B. nicht finanzierbar oder kein Interesse.", link: isAdmin || user.role === "setterin" ? "/verloren" : undefined },
  ];

  return (
    <Card className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h3 className="font-bold text-sm sm:text-base">Setter – Lead-Übersicht</h3>
        <span className="text-[11px] sm:text-xs text-muted-foreground">
          Übergabequote: <span className="font-semibold text-foreground">{stats.conversionRate}%</span>
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className={`text-center space-y-1 group relative min-w-0 ${kpi.link ? "cursor-pointer hover:bg-muted/50 rounded-lg p-2 -m-2 transition-colors" : ""}`}
            onClick={kpi.link ? () => navigate(kpi.link!) : undefined}
          >
            <Popover open={openHint === kpi.label} onOpenChange={(open) => setOpenHint(open ? kpi.label : null)}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="absolute top-0 right-0 p-0.5"
                  onClick={(e) => { e.stopPropagation(); setOpenHint(openHint === kpi.label ? null : kpi.label); }}
                  onMouseEnter={() => setOpenHint(kpi.label)}
                  onMouseLeave={() => setOpenHint(null)}
                >
                  <Info className="h-3 w-3 text-muted-foreground/50 hover:text-primary transition-colors" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="bottom" className="max-w-[260px] text-center p-3" onMouseEnter={() => setOpenHint(kpi.label)} onMouseLeave={() => setOpenHint(null)}>
                <p className="text-xs leading-relaxed">{kpi.hint}</p>
              </PopoverContent>
            </Popover>
            <kpi.icon className={`h-5 w-5 mx-auto ${kpi.color}`} />
            <p className="text-xl sm:text-2xl font-bold">{kpi.value}</p>
            <p className="text-[11px] sm:text-xs text-muted-foreground leading-tight">{kpi.label}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
