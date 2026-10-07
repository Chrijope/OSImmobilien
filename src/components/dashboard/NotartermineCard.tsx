import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { getInvestments } from "@/lib/investmentsStore";
import { useLiveVersion } from "@/hooks/useLiveData";
import { CalendarCheck } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { getKontakte } from "@/lib/kundenStore";
import { excludeStatsKontakte } from "@/lib/statsExclusion";
import { getJuniorsForRecruiter } from "@/lib/juniorOverrideLogic";
import { getKontaktDashboardBucket, isTeamWideKontaktRole } from "@/lib/kontaktOwnership";
import { useAdminTeamScope } from "@/hooks/useAdminTeamScope";
import { loadAllUsers } from "@/lib/loadAllUsers";

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

export function NotartermineCard() {
  const { user, authUser } = useUser();
  const isTeamWide = isTeamWideKontaktRole(user.role);
  const { splitTeamCompany, teamIds: adminTeamIds, teamNames: adminTeamNames } = useAdminTeamScope();
  const _cv = useLiveVersion(["investments", "kontakte"]);
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

  const { data, totalAbgEigen, totalAbgTeam, totalGepEigen, totalGepTeam, totalAbgCompany, totalGepCompany } = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const investments = getInvestments();
    const kontakteById = new Map(excludeStatsKontakte(getKontakte()).map(k => [k.id, k]));

    const monthMap: Record<string, { abgEigen: number; abgTeam: number; gepEigen: number; gepTeam: number; abgCompany: number; gepCompany: number }> = {};
    MONTHS.forEach(m => { monthMap[m] = { abgEigen: 0, abgTeam: 0, gepEigen: 0, gepTeam: 0, abgCompany: 0, gepCompany: 0 }; });

    let totalAbgEigen = 0;
    let totalAbgTeam = 0;
    let totalGepEigen = 0;
    let totalGepTeam = 0;
    let totalAbgCompany = 0;
    let totalGepCompany = 0;

    investments.forEach(inv => {
      if (!inv.notarTermin) return;
      const notarDate = new Date(inv.notarTermin);
      if (isNaN(notarDate.getTime())) return;
      if (notarDate.getFullYear() !== currentYear) return;

      const k: any = kontakteById.get(inv.kontaktId);
      if (!k) return;
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

      const monthKey = MONTHS[notarDate.getMonth()];
      if (notarDate < now) {
        if (bucket === "eigen") { monthMap[monthKey].abgEigen += 1; totalAbgEigen += 1; }
        else if (bucket === "team") { monthMap[monthKey].abgTeam += 1; totalAbgTeam += 1; }
        else { monthMap[monthKey].abgCompany += 1; totalAbgCompany += 1; }
      } else {
        if (bucket === "eigen") { monthMap[monthKey].gepEigen += 1; totalGepEigen += 1; }
        else if (bucket === "team") { monthMap[monthKey].gepTeam += 1; totalGepTeam += 1; }
        else { monthMap[monthKey].gepCompany += 1; totalGepCompany += 1; }
      }
    });

    const data = MONTHS.map(m => ({
      month: m,
      abgEigen: monthMap[m].abgEigen,
      abgTeam: monthMap[m].abgTeam,
      gepEigen: monthMap[m].gepEigen,
      gepTeam: monthMap[m].gepTeam,
      abgCompany: monthMap[m].abgCompany,
      gepCompany: monthMap[m].gepCompany,
    }));

    return { data, totalAbgEigen, totalAbgTeam, totalGepEigen, totalGepTeam, totalAbgCompany, totalGepCompany };
  }, [_cv, isTeamWide, user.name, authUser?.id, teamNames, teamIds, allUsers, splitTeamCompany]);

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-[13px] font-medium text-muted-foreground tracking-wide uppercase">
              {showCompany
                ? "Notartermine (Eigen + Team + MOREImmo)"
                : hasTeam
                ? "Notartermine (Eigen + Team)"
                : "Notartermine"}
            </CardTitle>
          </div>
          <div className="flex items-center gap-3 text-xs flex-wrap justify-end">
            <span className="text-muted-foreground">
              Eigen <span className="font-semibold text-foreground tabular-nums ml-1">{totalAbgEigen}</span>
              <span> beurk. · </span>
              <span className="font-semibold text-foreground tabular-nums">{totalGepEigen}</span>
              <span> gepl.</span>
            </span>
            {showTeam && (
              <span className="text-muted-foreground">
                Eigenes Team <span className="font-medium tabular-nums ml-1">{totalAbgTeam}</span> beurk. ·{" "}
                <span className="font-medium tabular-nums">{totalGepTeam}</span> gepl.
              </span>
            )}
            {showCompany && (
              <span className="text-muted-foreground">
                MOREImmo <span className="font-medium tabular-nums ml-1">{totalAbgCompany}</span> beurk. ·{" "}
                <span className="font-medium tabular-nums">{totalGepCompany}</span> gepl.
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="notarAbgEigenFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="notarGepEigenFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.18} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="notarAbgTeamFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.28} />
                <stop offset="100%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="notarGepTeamFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.12} />
                <stop offset="100%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="notarAbgCompanyFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--chart-provision))" stopOpacity={0.28} />
                <stop offset="100%" stopColor="hsl(var(--chart-provision))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="notarGepCompanyFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--chart-provision))" stopOpacity={0.12} />
                <stop offset="100%" stopColor="hsl(var(--chart-provision))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="month" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: "12px",
              }}
            />
            <Legend wrapperStyle={{ fontSize: "11px" }} />
            <Area type="monotone" dataKey="abgEigen" name="Abgeschlossen (Eigen)" stackId="eigen" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#notarAbgEigenFill)" dot={{ r: 3, strokeWidth: 2, fill: "hsl(var(--background))" }} activeDot={{ r: 5 }} />
            <Area type="monotone" dataKey="gepEigen" name="Geplant (Eigen)" stackId="eigen" stroke="hsl(var(--primary))" strokeOpacity={0.55} strokeWidth={2} strokeDasharray="4 3" fill="url(#notarGepEigenFill)" dot={{ r: 2.5, strokeWidth: 2, fill: "hsl(var(--background))" }} />
            {showTeam && (
              <>
                <Area type="monotone" dataKey="abgTeam" name="Abgeschlossen (Eigenes Team)" stackId="team" stroke="hsl(var(--muted-foreground))" strokeWidth={2} fill="url(#notarAbgTeamFill)" dot={{ r: 2.5, strokeWidth: 2, fill: "hsl(var(--background))" }} />
                <Area type="monotone" dataKey="gepTeam" name="Geplant (Eigenes Team)" stackId="team" stroke="hsl(var(--muted-foreground))" strokeOpacity={0.6} strokeWidth={2} strokeDasharray="4 3" fill="url(#notarGepTeamFill)" dot={{ r: 2.5, strokeWidth: 2, fill: "hsl(var(--background))" }} />
              </>
            )}
            {showCompany && (
              <>
                <Area type="monotone" dataKey="abgCompany" name="Abgeschlossen (MOREImmo)" stackId="company" stroke="hsl(var(--chart-provision))" strokeWidth={2} fill="url(#notarAbgCompanyFill)" dot={{ r: 2.5, strokeWidth: 2, fill: "hsl(var(--background))" }} />
                <Area type="monotone" dataKey="gepCompany" name="Geplant (MOREImmo)" stackId="company" stroke="hsl(var(--chart-provision))" strokeOpacity={0.6} strokeWidth={2} strokeDasharray="4 3" fill="url(#notarGepCompanyFill)" dot={{ r: 2.5, strokeWidth: 2, fill: "hsl(var(--background))" }} />
              </>
            )}
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
