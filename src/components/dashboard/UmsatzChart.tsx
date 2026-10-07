import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { useUser } from "@/contexts/UserContext";
import { getKontakte } from "@/lib/kundenStore";
import { excludeStatsKontakte } from "@/lib/statsExclusion";
import { getInvestments } from "@/lib/investmentsStore";
import { useLiveVersion } from "@/hooks/useLiveData";
import { unscharfKlasse } from "@/lib/vorfuehrmodus";
import { getJuniorsForRecruiter } from "@/lib/juniorOverrideLogic";
import { getKontaktDashboardBucket, isTeamWideKontaktRole } from "@/lib/kontaktOwnership";
import { useAdminTeamScope } from "@/hooks/useAdminTeamScope";
import { loadAllUsers } from "@/lib/loadAllUsers";

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

export function UmsatzChart() {
  const { user, authUser } = useUser();
  const isTeamWide = isTeamWideKontaktRole(user.role);
  const { splitTeamCompany, teamIds: adminTeamIds, teamNames: adminTeamNames } = useAdminTeamScope();
  const _cv = useLiveVersion(["kontakte", "investments"]);
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

  const data = useMemo(() => {
    const now = new Date();
    const kontakteById = new Map(excludeStatsKontakte(getKontakte()).filter(k => !k.archiviert).map(k => [k.id, k]));
    const investments = getInvestments();
    const currentYear = now.getFullYear();

    const monthMap: Record<string, { eigen: number; team: number; company: number }> = {};
    MONTHS.forEach(m => { monthMap[m] = { eigen: 0, team: 0, company: 0 }; });

    investments.forEach(inv => {
      if (!inv.notarTermin) return;
      const notarDate = new Date(inv.notarTermin);
      if (isNaN(notarDate.getTime()) || notarDate >= now) return; // nur abgeschlossen
      if (notarDate.getFullYear() !== currentYear) return;

      const k = kontakteById.get(inv.kontaktId);
      if (!k || k.kaufpreis <= 0) return;
      const monthKey = MONTHS[notarDate.getMonth()];
      const tsd = k.kaufpreis / 1000;
      const bucket = getKontaktDashboardBucket(k, {
        userName: user.name,
        userId: authUser?.id,
        isTeamWide,
        teamNames,
        teamIds,
        users: allUsers,
        splitTeamCompany,
      });
      if (bucket === "eigen") monthMap[monthKey].eigen += tsd;
      else if (bucket === "team") monthMap[monthKey].team += tsd;
      else if (bucket === "company") monthMap[monthKey].company += tsd;
    });

    return MONTHS.map(m => ({
      month: m,
      eigen: Math.round(monthMap[m].eigen),
      team: Math.round(monthMap[m].team),
      company: Math.round(monthMap[m].company),
    }));
  }, [isTeamWide, user.name, authUser?.id, _cv, teamNames, teamIds, allUsers, splitTeamCompany]);

  const totalEigen = data.reduce((s, d) => s + d.eigen, 0);
  const totalTeam = data.reduce((s, d) => s + d.team, 0);
  const totalCompany = data.reduce((s, d) => s + d.company, 0);
  const hasTeam = isTeamWide || teamNames.size > 0;
  const showCompany = splitTeamCompany;
  const showTeam = teamNames.size > 0;

  const labelFor = (k: string) =>
    k === "eigen" ? "Eigenumsatz"
    : k === "team" ? "Eigenes Team"
    : k === "company" ? "Team OS Immobilien"
    : k;

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          {/*
            Titel und Zusammensetzung stehen untereinander. In einer Zeile war
            die Ueberschrift so lang, dass die Klammer umbrach und die Karte
            oben unruhig wirkte.
          */}
          <div>
            <CardTitle className="text-[13px] font-medium text-muted-foreground tracking-wide uppercase">
              Umsatzübersicht
            </CardTitle>
            {(showCompany || hasTeam) && (
              <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                {showCompany ? "Eigen + Team + OS Immobilien" : "Eigen + Team"}
              </p>
            )}
          </div>
          {/*
            `whitespace-nowrap` haelt Zahl und Einheit zusammen. Vorher konnte
            das T€ allein in die naechste Zeile rutschen, und bei groesseren
            Zahlen mit Mio waere das noch haeufiger passiert.
          */}
          <div className={unscharfKlasse("flex flex-wrap items-center gap-x-7 gap-y-2 text-xs")}>
            <span className="whitespace-nowrap text-muted-foreground">
              Eigen <span className="ml-1.5 font-semibold text-foreground tabular-nums">{totalEigen} T€</span>
            </span>
            {showTeam && (
              <span className="whitespace-nowrap text-muted-foreground">
                Eigenes Team <span className="ml-1.5 font-medium tabular-nums">{totalTeam} T€</span>
              </span>
            )}
            {showCompany && (
              <span className="whitespace-nowrap text-muted-foreground">
                OS Immobilien <span className="ml-1.5 font-medium tabular-nums">{totalCompany} T€</span>
              </span>
            )}
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
              <linearGradient id="umsatzEigenFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--chart-b2c))" stopOpacity={0.35} />
                <stop offset="100%" stopColor="hsl(var(--chart-b2c))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="umsatzTeamFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.2} />
                <stop offset="100%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="umsatzCompanyFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--chart-provision))" stopOpacity={0.22} />
                <stop offset="100%" stopColor="hsl(var(--chart-provision))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="month" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis fontSize={11} tickLine={false} axisLine={false} label={{ value: "T€", position: "insideTopLeft", offset: -5, fontSize: 10 }} />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              formatter={(v: number, name: string) => [`${v} T€`, labelFor(name)]}
            />
            {(showTeam || showCompany) && (
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: "11px" }}
                formatter={(v) => labelFor(String(v))}
              />
            )}
            <Area type="monotone" dataKey="eigen" stroke="hsl(var(--chart-b2c))" strokeWidth={2.5} fill="url(#umsatzEigenFill)" dot={{ r: 3, strokeWidth: 2, fill: "hsl(var(--background))" }} activeDot={{ r: 5 }} />
            {showTeam && (
              <Area type="monotone" dataKey="team" stroke="hsl(var(--muted-foreground))" strokeWidth={2} fill="url(#umsatzTeamFill)" dot={{ r: 2.5, strokeWidth: 2, fill: "hsl(var(--background))" }} />
            )}
            {showCompany && (
              <Area type="monotone" dataKey="company" stroke="hsl(var(--chart-provision))" strokeWidth={2} fill="url(#umsatzCompanyFill)" dot={{ r: 2.5, strokeWidth: 2, fill: "hsl(var(--background))" }} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
