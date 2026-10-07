import { Card } from "@/components/ui/card";
import { Phone, CalendarCheck, UserCheck, Clock, TrendingUp, Info } from "lucide-react";
import { getKontakte } from "@/lib/kundenStore";
import { excludeStatsKontakte } from "@/lib/statsExclusion";
import { useMemo } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useLiveVersion } from "@/hooks/useLiveData";

export function SetterKpiCard() {
  const cacheVersion = useLiveVersion(["kontakte"]);
  const stats = useMemo(() => {
    const leads = excludeStatsKontakte(getKontakte()).filter(k => k.leadTyp || k.setter);
    const total = leads.length;
    const mitTermin = leads.filter(k => k.setterTerminGebucht).length;
    const qualifiziert = leads.filter(k => k.qualZiel || k.qualEinkommen).length;
    const offen = leads.filter(k => !k.setterChecklisteDone && !k.archiviert).length;
    const conversionRate = total > 0 ? Math.round((mitTermin / total) * 100) : 0;
    return { total, mitTermin, qualifiziert, offen, conversionRate };
  }, [cacheVersion]);

  const kpis = [
    { label: "Leads gesamt", value: stats.total, icon: UserCheck, color: "text-primary", hint: "Alle Kontakte, die einen Lead-Typ oder einen zugewiesenen Setter haben." },
    { label: "Offene Leads", value: stats.offen, icon: Clock, color: "text-[hsl(var(--warning))]", hint: "Leads, bei denen die Setter-Checkliste noch nicht abgeschlossen und die nicht archiviert sind." },
    { label: "Qualifiziert", value: stats.qualifiziert, icon: Phone, color: "text-[hsl(var(--success))]", hint: "Leads, bei denen im Setter-Skript ein Ziel oder Einkommen erfasst wurde (qualZiel oder qualEinkommen)." },
    { label: "Termine gebucht", value: stats.mitTermin, icon: CalendarCheck, color: "text-[hsl(var(--success))]", hint: "Leads, bei denen ein Erstgespraech-Termin durch die Setterin gebucht wurde." },
    { label: "Conversion", value: `${stats.conversionRate}%`, icon: TrendingUp, color: "text-primary", hint: "Anteil der Leads mit gebuchtem Termin an allen Leads (Termine / Leads gesamt)." },
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <Card className="p-6">        <h3 className="text-[13px] font-medium text-muted-foreground tracking-wide uppercase mb-4">Meine Setter-KPIs</h3>
        <div className="grid grid-cols-5 gap-4">
          {kpis.map((kpi) => (
            <Tooltip key={kpi.label}>
              <TooltipTrigger asChild>
                <div data-ui="kennzahl" data-anordnung="kompakt" className="text-center space-y-1 cursor-help group relative">
                  <Info className="h-3 w-3 text-muted-foreground/50 group-hover:text-primary absolute top-0 right-0 transition-colors" />
                  <kpi.icon className={`h-5 w-5 mx-auto ${kpi.color}`} />
                  <p data-ui="kennzahl-wert" className="text-2xl font-bold">{kpi.value}</p>
                  <p data-ui="kennzahl-label" className="text-xs text-muted-foreground">{kpi.label}</p>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[260px] text-center">
                <p className="text-xs leading-relaxed">{kpi.hint}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </Card>
    </TooltipProvider>
  );
}
