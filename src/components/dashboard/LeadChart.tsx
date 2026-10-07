import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { useUser } from "@/contexts/UserContext";
import { getKontakte } from "@/lib/kundenStore";
import { excludeStatsKontakte } from "@/lib/statsExclusion";
import { useLiveVersion } from "@/hooks/useLiveData";
import { unscharfKlasse } from "@/lib/vorfuehrmodus";
import { getJuniorsForRecruiter } from "@/lib/juniorOverrideLogic";
import { getKontaktDashboardBucket, isTeamWideKontaktRole } from "@/lib/kontaktOwnership";
import { useAdminTeamScope } from "@/hooks/useAdminTeamScope";
import { loadAllUsers } from "@/lib/loadAllUsers";
import { Legend } from "recharts";
import { getKontaktTyp } from "@/lib/kontaktTypHelper";

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

export function LeadChart() {
  const { user, authUser } = useUser();
  const isTeamWide = isTeamWideKontaktRole(user.role);
  const { splitTeamCompany, teamIds: adminTeamIds, teamNames: adminTeamNames } = useAdminTeamScope();
  const _cv = useLiveVersion(["kontakte"]);
  const allUsers = useMemo(() => loadAllUsers(), [_cv]);

  const teamNames = useMemo(() => {
    if (splitTeamCompany) return adminTeamNames;
    if (!authUser?.id) return new Set<string>();
    return new Set(getJuniorsForRecruiter(authUser.id).map((j) => j.name));
  }, [splitTeamCompany, adminTeamNames, authUser?.id, _cv]);
  const teamIds = useMemo(() => {
    if (splitTeamCompany) return adminTeamIds;
    return new Set(getJuniorsForRecruiter(authUser?.id || "").map((j) => j.userId));
  }, [splitTeamCompany, adminTeamIds, authUser?.id, _cv]);
  const hasTeam = isTeamWide || teamNames.size > 0;
  const showCompany = splitTeamCompany;
  const showTeam = teamNames.size > 0;

  const data = useMemo(() => {
    const kontakte = excludeStatsKontakte(getKontakte()).filter(k => !k.archiviert);

    const monthMap: Record<string, { eigen: number; team: number; company: number; lead: number }> = {};
    MONTHS.forEach(m => { monthMap[m] = { eigen: 0, team: 0, company: 0, lead: 0 }; });

    kontakte.forEach(k => {
      const bucket = getKontaktDashboardBucket(k, {
        userName: user.name,
        userId: authUser?.id,
        isTeamWide,
        teamNames,
        teamIds,
        users: allUsers,
        splitTeamCompany,
      });
      if (!bucket) return;

      const typ = getKontaktTyp(k);
      const isLead = typ === "lead";

      if (!k.erstellt_am) return;
      let monthIdx = -1;
      if (k.erstellt_am.includes("-")) {
        const d = new Date(k.erstellt_am);
        if (!isNaN(d.getTime())) monthIdx = d.getMonth();
      } else {
        const parts = k.erstellt_am.split(".");
        if (parts.length === 3) monthIdx = parseInt(parts[1], 10) - 1;
      }
      if (monthIdx >= 0 && monthIdx < 12) {
        if (isLead) {
          monthMap[MONTHS[monthIdx]].lead++;
        } else if (bucket === "eigen") {
          monthMap[MONTHS[monthIdx]].eigen++;
        } else if (bucket === "team") {
          monthMap[MONTHS[monthIdx]].team++;
        } else if (bucket === "company") {
          monthMap[MONTHS[monthIdx]].company++;
        }
      }
    });

    return MONTHS.map(m => ({ month: m, eigen: monthMap[m].eigen, team: monthMap[m].team, company: monthMap[m].company, lead: monthMap[m].lead }));
  }, [isTeamWide, user.name, authUser?.id, _cv, teamNames, teamIds, allUsers, splitTeamCompany]);

  const totalEigen = data.reduce((s, d) => s + d.eigen, 0);
  const totalTeam = data.reduce((s, d) => s + d.team, 0);
  const totalCompany = data.reduce((s, d) => s + d.company, 0);
  const totalLead = data.reduce((s, d) => s + d.lead, 0);

  const labelFor = (k: string) =>
    k === "eigen" ? "Eigen"
    : k === "team" ? "Eigenes Team"
    : k === "company" ? "Team MOREImmo"
    : k === "lead" ? "Lead"
    : k;

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-[13px] font-medium text-muted-foreground tracking-wide uppercase">
              {hasTeam ? "Kontakte nach Herkunft" : "Kontakte"}
            </CardTitle>
          </div>
          <div className="flex items-center gap-3 text-xs flex-wrap justify-end">
            <span className="text-xs text-muted-foreground">
              Eigen <span className="font-semibold text-foreground tabular-nums ml-1">{totalEigen}</span>
            </span>
            {showTeam && (
              <span className="text-muted-foreground">
                Eigenes Team <span className="font-medium tabular-nums ml-1">{totalTeam}</span>
              </span>
            )}
            {showCompany && (
              <span className="text-muted-foreground">
                MOREImmo <span className="font-medium tabular-nums ml-1">{totalCompany}</span>
              </span>
            )}
            <span className="text-muted-foreground">
              Lead <span className="font-medium tabular-nums ml-1">{totalLead}</span>
            </span>
          </div>
        </div>
      </CardHeader>
      {/* Vorfuehrmodus: die Flaeche wird weichgezeichnet, die Ueberschrift
            bleibt lesbar. Der Zuschauer sieht, dass es die Auswertung gibt,
            aber nicht ihre Werte. */}
      <CardContent className={unscharfKlasse()}>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="leadEigenFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="leadTeamFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.2} />
                <stop offset="100%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="leadCompanyFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--chart-provision))" stopOpacity={0.22} />
                <stop offset="100%" stopColor="hsl(var(--chart-provision))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="leadLeadFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#F59E0B" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="month" fontSize={10} tickLine={false} axisLine={false} interval={0} />
            <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              formatter={(v: number, name: string) => [`${v}`, labelFor(name)]}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: "11px" }}
              formatter={(v) => labelFor(String(v))}
            />
            <Area type="monotone" dataKey="eigen" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#leadEigenFill)" dot={{ r: 3, strokeWidth: 2, fill: "hsl(var(--background))" }} activeDot={{ r: 5 }} />
            {showTeam && (
              <Area type="monotone" dataKey="team" stroke="hsl(var(--muted-foreground))" strokeWidth={2} fill="url(#leadTeamFill)" dot={{ r: 2.5, strokeWidth: 2, fill: "hsl(var(--background))" }} />
            )}
            {showCompany && (
              <Area type="monotone" dataKey="company" stroke="hsl(var(--chart-provision))" strokeWidth={2} fill="url(#leadCompanyFill)" dot={{ r: 2.5, strokeWidth: 2, fill: "hsl(var(--background))" }} />
            )}
            <Area type="monotone" dataKey="lead" stroke="#F59E0B" strokeWidth={2} fill="url(#leadLeadFill)" dot={{ r: 2.5, strokeWidth: 2, fill: "hsl(var(--background))" }} />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
