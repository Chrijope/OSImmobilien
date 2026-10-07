import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { cacheGet } from "@/lib/dataCache";
import { ART_LABELS_SHORT, type AktivitaetEntry } from "@/lib/aktivitaetenStore";
import { InfoTooltip } from "@/components/ui/info-tooltip";

const ACT_COLORS: Record<string, string> = {
  anruf: "hsl(210 40% 55%)",
  anruf_protokoll: "hsl(210 55% 45%)",
  email: "hsl(280 45% 55%)",
  meeting: "hsl(38 92% 50%)",
  meeting_protokoll: "hsl(43 70% 55%)",
  notiz: "hsl(72 18% 42%)",
  aufgabe: "hsl(160 45% 45%)",
};

function fromDb(r: any): AktivitaetEntry {
  return {
    id: r.id, kundeId: r.kunde_id, art: r.art, beschreibung: r.beschreibung || "",
    von: r.von || "", datum: r.datum || "", details: r.details || undefined,
  };
}

export function StatistikActivity({
  kontaktIds,
  aufEigeneBeschraenkt = false,
}: {
  kontaktIds: Set<string>;
  /** true, wenn der Nutzer nur seine eigenen Zahlen sehen darf. */
  aufEigeneBeschraenkt?: boolean;
}) {
  const [rangeDays, setRangeDays] = useState<number>(30);
  const RANGE_OPTIONS: { value: number; label: string }[] = [
    { value: 7, label: "7 Tage" },
    { value: 30, label: "30 Tage" },
    { value: 90, label: "90 Tage" },
    { value: 180, label: "6 Monate" },
    { value: 365, label: "12 Monate" },
  ];
  const rangeLabel = RANGE_OPTIONS.find((o) => o.value === rangeDays)?.label || `${rangeDays}T`;

  const akts: AktivitaetEntry[] = useMemo(() => {
    const raw = cacheGet("aktivitaeten") || [];
    /*
      Der Rückfall auf "alle Aktivitäten", wenn keine Kontakte übergeben wurden,
      war ein Leck: Ein Vertriebspartner ohne Kontakte, oder mit einem Filter
      ohne Treffer, sah den Aktivitätsstrom des ganzen Unternehmens samt der
      Rangliste mit Klarnamen. Wer nur seine eigenen Zahlen sehen darf, bekommt
      bei leerer Auswahl deshalb nichts, nicht alles.
    */
    return raw
      .map(fromDb)
      .filter((a) =>
        kontaktIds.size === 0 ? !aufEigeneBeschraenkt : kontaktIds.has(a.kundeId),
      );
  }, [kontaktIds, aufEigeneBeschraenkt]);

  const last30 = useMemo(() => {
    const cutoff = Date.now() - rangeDays * 86400000;
    return akts.filter(a => new Date(a.datum).getTime() >= cutoff);
  }, [akts, rangeDays]);

  // Bei langen Zeiträumen pro Woche/Monat statt pro Tag bucketen
  const bucketMode: "day" | "week" | "month" = rangeDays <= 60 ? "day" : rangeDays <= 180 ? "week" : "month";

  const dailyStacked = useMemo(() => {
    const buckets: Record<string, Record<string, number>> = {};
    const order: string[] = [];

    const pushBucket = (key: string) => {
      if (!buckets[key]) {
        buckets[key] = {};
        order.push(key);
      }
    };

    const bucketKey = (d: Date): string => {
      if (bucketMode === "day") return d.toISOString().slice(0, 10);
      if (bucketMode === "week") {
        // ISO Woche-Anfang (Montag)
        const tmp = new Date(d);
        const day = (tmp.getDay() + 6) % 7;
        tmp.setDate(tmp.getDate() - day);
        return tmp.toISOString().slice(0, 10);
      }
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    };

    // Lücken-freie Skala
    const now = new Date();
    if (bucketMode === "day") {
      for (let i = rangeDays - 1; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 86400000);
        pushBucket(bucketKey(d));
      }
    } else if (bucketMode === "week") {
      const weeks = Math.ceil(rangeDays / 7);
      for (let i = weeks - 1; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 7 * 86400000);
        pushBucket(bucketKey(d));
      }
    } else {
      const months = Math.ceil(rangeDays / 30);
      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        pushBucket(bucketKey(d));
      }
    }

    last30.forEach(a => {
      const d = new Date(a.datum);
      if (isNaN(d.getTime())) return;
      const key = bucketKey(d);
      pushBucket(key);
      buckets[key][a.art] = (buckets[key][a.art] || 0) + 1;
    });

    const labelFor = (key: string) => {
      if (bucketMode === "day") return key.slice(5);
      if (bucketMode === "week") {
        const d = new Date(key);
        return `KW ${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
      }
      const [y, m] = key.split("-");
      const MONTHS_DE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
      return `${MONTHS_DE[parseInt(m, 10) - 1]} ${y.slice(2)}`;
    };

    return order
      .sort()
      .map(key => ({ date: labelFor(key), ...buckets[key] }));
  }, [last30, rangeDays, bucketMode]);

  const types = useMemo(() => {
    const set = new Set<string>();
    last30.forEach(a => set.add(a.art));
    return Array.from(set);
  }, [last30]);

  const topUsers = useMemo(() => {
    // Build name → roles lookup from profiles + user_roles cache
    const profiles = (cacheGet("profiles") || []) as any[];
    const userRoles = (cacheGet("user_roles") || []) as any[];
    const nameToRoles = new Map<string, Set<string>>();
    const profileIdToRoles = new Map<string, Set<string>>();
    for (const ur of userRoles) {
      const pid = ur.user_id;
      const role = ur.role;
      if (!pid || !role) continue;
      if (!profileIdToRoles.has(pid)) profileIdToRoles.set(pid, new Set());
      profileIdToRoles.get(pid)!.add(role);
    }
    for (const p of profiles) {
      const roles = profileIdToRoles.get(p.id);
      if (roles) {
        nameToRoles.set(p.name, roles);
      }
    }
    const ALLOWED_ROLES = new Set(["admin", "vertriebsleiter", "vertriebspartner"]);

    const map = new Map<string, number>();
    last30.forEach(a => {
      const von = a.von || "Unbekannt";
      const roles = nameToRoles.get(von);
      const hasAllowedRole = roles ? Array.from(roles).some(r => ALLOWED_ROLES.has(r)) : false;
      if (hasAllowedRole) {
        map.set(von, (map.get(von) || 0) + 1);
      }
    });
    return Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [last30]);

  const typeBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    last30.forEach(a => map.set(a.art, (map.get(a.art) || 0) + 1));
    return Array.from(map.entries()).map(([art, count]) => ({ art, label: (ART_LABELS_SHORT as any)[art] || art, count }));
  }, [last30]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6 text-center"><p className="text-xs text-muted-foreground inline-flex items-center justify-center gap-1">Aktivitäten ({rangeLabel}) <InfoTooltip text="Summe aller protokollierten Aktivitäten im gewählten Zeitraum: Anrufe, E-Mails, Meetings, Notizen, Aufgaben." /></p><p className="text-2xl font-bold">{last30.length}</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><p className="text-xs text-muted-foreground inline-flex items-center justify-center gap-1">Aktive Nutzer <InfoTooltip text="Anzahl unterschiedlicher Nutzer mit mindestens einer Aktivität im gewählten Zeitraum." /></p><p className="text-2xl font-bold">{topUsers.length}</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><p className="text-xs text-muted-foreground inline-flex items-center justify-center gap-1">Anrufe ({rangeLabel}) <InfoTooltip text="Anzahl protokollierter Anrufe im gewählten Zeitraum." /></p><p className="text-2xl font-bold">{last30.filter(a => a.art === "anruf" || a.art === "anruf_protokoll").length}</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><p className="text-xs text-muted-foreground inline-flex items-center justify-center gap-1">Ø pro Tag <InfoTooltip text="Durchschnittliche Aktivitäten pro Kalendertag im gewählten Zeitraum (inkl. Wochenenden)." /></p><p className="text-2xl font-bold">{Math.round(last30.length / Math.max(1, rangeDays))}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              {bucketMode === "day" ? "Aktivitäten pro Tag" : bucketMode === "week" ? "Aktivitäten pro Woche" : "Aktivitäten pro Monat"}
              {" "}<span className="text-xs font-normal text-muted-foreground">(letzte {rangeLabel})</span>
              <InfoTooltip text="Gestapelte Balken nach Aktivitäts-Typ. Zeitraum oben rechts wählbar." />
            </CardTitle>
            <div className="inline-flex items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5">
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRangeDays(opt.value)}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded-sm transition-colors tabular-nums ${
                    rangeDays === opt.value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dailyStacked} margin={{ top: 10, right: 20, bottom: 30, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={12} />
              <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
              />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
              {types.map((t) => {
                const color = ACT_COLORS[t] || "hsl(220 10% 60%)";
                return (
                  <Bar
                    key={t}
                    dataKey={t}
                    stackId="acts"
                    name={(ART_LABELS_SHORT as any)[t] || t}
                    fill={color}
                    radius={[2, 2, 0, 0]}
                    maxBarSize={28}
                  />
                );
              })}
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2">Top-aktive Nutzer ({rangeLabel}) <InfoTooltip text="Ranking der Team-Mitglieder nach Anzahl protokollierter Aktivitäten im gewählten Zeitraum. Nur Admin, Vertriebsleiter und Vertriebspartner. Top 10." /></CardTitle></CardHeader>
          <CardContent>
            {topUsers.length === 0 ? <p className="text-sm text-muted-foreground">Keine Aktivitäten.</p> : (
              <div className="space-y-2">
                {topUsers.map(u => (
                  <div key={u.name} className="flex items-center justify-between text-sm border-b border-border pb-2">
                    <span>{u.name}</span>
                    <Badge variant="outline">{u.count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2">Aktivitäten nach Typ (30T) <InfoTooltip text="Verteilung der Aktivitäts-Typen der letzten 30 Tage. Zeigt, ob das Team eher telefoniert, schreibt oder Meetings führt." /></CardTitle></CardHeader>
          <CardContent>
            {typeBreakdown.length === 0 ? <p className="text-sm text-muted-foreground">Keine Aktivitäten.</p> : (
              <div className="space-y-2">
                {typeBreakdown.sort((a, b) => b.count - a.count).map(t => (
                  <div key={t.art} className="flex items-center justify-between text-sm border-b border-border pb-2">
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-sm" style={{ background: ACT_COLORS[t.art] || "hsl(220 10% 60%)" }} />
                      {t.label}
                    </span>
                    <Badge variant="outline">{t.count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}