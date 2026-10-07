import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { cacheGet } from "@/lib/dataCache";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { OHNE_KAMPAGNE, kampagneAusKontakt, kampagnenName } from "@/lib/kampagnenKennung";
import { bonitaetFuerStatistikFreigegeben } from "@/lib/bankpruefungListe";
import { quelleFuerAuswertung } from "@/lib/handbuch/leadStand";

function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : Math.round((v[mid - 1] + v[mid]) / 2);
}

function toTs(v: any): number | null {
  if (!v) return null;
  const t = typeof v === "string" || typeof v === "number" ? new Date(v).getTime() : NaN;
  return Number.isFinite(t) ? t : null;
}

function daysBetween(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

type RangeKey = "30" | "90" | "365" | "all";

export function StatistikConversion({ kontakte }: { kontakte: any[] }) {
  const [range, setRange] = useState<RangeKey>("all");

  const filteredKontakte = useMemo(() => {
    if (range === "all") return kontakte;
    const days = Number(range);
    const cutoff = Date.now() - days * 86_400_000;
    return kontakte.filter((k) => {
      const ts = toTs(k.erstellt_am || k.erstelltAm || k.created_at);
      return ts == null ? true : ts >= cutoff;
    });
  }, [kontakte, range]);

  const investments: any[] = cacheGet("investments") || [];
  const invByKontakt = useMemo(() => {
    const m = new Map<string, any[]>();
    investments.forEach(i => {
      const arr = m.get(i.kunde_id) || []; arr.push(i); m.set(i.kunde_id, arr);
    });
    return m;
  }, [investments]);

  const funnel = useMemo(() => {
    const total = filteredKontakte.length;
    let erstgespraech = 0, saSent = 0, saSigned = 0, bonitaet = 0, reservierung = 0, finanzierung = 0, notar = 0, abgeschlossen = 0;
    filteredKontakte.forEach(k => {
      const invs = invByKontakt.get(k.id) || [];
      const stufe = k.meta?.pipelineStufe;
      if (stufe === "erstgespraech_geplant" || stufe === "erstgespraech" || k.meta?.erstgespraechTermin || k.meta?.erstgespraechAt || invs.length) erstgespraech++;
      if (invs.some(i => i.meta?.saSentAt || i.meta?.saInvitedAt || i.meta?.saToken)) saSent++;
      if (invs.some(i => i.meta?.saSigned)) saSigned++;
      // Nur Pflichtzeilen und von Hand ergänzte Unterlagen zählen. Eine
      // abgelehnte Altzeile, die niemand mehr verlangt, hält die Stufe nicht auf.
      if (invs.some(i => bonitaetFuerStatistikFreigegeben(i, k.meta))) bonitaet++;
      if (invs.some(i => i.meta?.rvSigned)) reservierung++;
      if (invs.some(i => i.meta?.finanzierungBestaetigt || i.meta?.finanzierungAngebot)) finanzierung++;
      if (invs.some(i => i.meta?.notarTermin || i.meta?.notarData?.datum)) notar++;
      if (invs.some(i => i.meta?.kaufpreisfaelligkeitDatum && i.meta?.grundbuchDatum)) abgeschlossen++;
    });
    return [
      { stage: "Lead", count: total },
      { stage: "Erstgespräch", count: erstgespraech },
      { stage: "SA verschickt", count: saSent },
      { stage: "SA unterschrieben", count: saSigned },
      { stage: "Bonität ok", count: bonitaet },
      { stage: "Reservierung", count: reservierung },
      { stage: "Finanzierung", count: finanzierung },
      { stage: "Notar", count: notar },
      { stage: "Abgeschlossen", count: abgeschlossen },
    ];
  }, [filteredKontakte, invByKontakt]);

  const funnelWithDrop = funnel.map((row, i) => ({
    ...row,
    drop: i === 0 ? 0 : Math.max(0, funnel[i - 1].count - row.count),
    rate: i === 0 ? 100 : Math.round((row.count / Math.max(1, funnel[i - 1].count)) * 100),
  }));

  // Durchlaufzeit (Median in Tagen) – Lead-Anlage bis zur jeweiligen Stufe
  const durchlaufzeit = useMemo(() => {
    const buckets: Record<string, number[]> = {
      erstgespraech: [], saSent: [], saSigned: [], reservierung: [], notar: [], abschluss: [],
    };
    filteredKontakte.forEach((k) => {
      const t0 = toTs(k.erstellt_am || k.erstelltAm || k.created_at);
      if (t0 == null) return;
      const invs = invByKontakt.get(k.id) || [];
      const eg = toTs(k.meta?.erstgespraechAt || k.meta?.erstgespraechTermin);
      if (eg) buckets.erstgespraech.push(daysBetween(t0, eg)!);
      const saSentTs = Math.min(...invs.map((i: any) => toTs(i.meta?.saSentAt) ?? toTs(i.meta?.saInvitedAt) ?? Infinity));
      if (Number.isFinite(saSentTs)) buckets.saSent.push(daysBetween(t0, saSentTs)!);
      const saSignedTs = Math.min(...invs.map((i: any) => toTs(i.meta?.saSignedAt) ?? (i.meta?.saSigned ? toTs(i.meta?.saSigned) : null) ?? Infinity));
      if (Number.isFinite(saSignedTs)) buckets.saSigned.push(daysBetween(t0, saSignedTs)!);
      const rvTs = Math.min(...invs.map((i: any) => toTs(i.meta?.rvSignedAt) ?? (i.meta?.rvSigned ? toTs(i.meta?.rvSigned) : null) ?? Infinity));
      if (Number.isFinite(rvTs)) buckets.reservierung.push(daysBetween(t0, rvTs)!);
      const notarTs = Math.min(...invs.map((i: any) => toTs(i.meta?.notarTermin) ?? toTs(i.meta?.notarData?.datum) ?? Infinity));
      if (Number.isFinite(notarTs)) buckets.notar.push(daysBetween(t0, notarTs)!);
      const abTs = Math.min(...invs.map((i: any) => toTs(i.meta?.grundbuchDatum) ?? Infinity));
      if (Number.isFinite(abTs)) buckets.abschluss.push(daysBetween(t0, abTs)!);
    });
    return [
      { stage: "Erstgespräch", days: median(buckets.erstgespraech), n: buckets.erstgespraech.length },
      { stage: "SA verschickt", days: median(buckets.saSent), n: buckets.saSent.length },
      { stage: "SA unterschrieben", days: median(buckets.saSigned), n: buckets.saSigned.length },
      { stage: "Reservierung", days: median(buckets.reservierung), n: buckets.reservierung.length },
      { stage: "Notar", days: median(buckets.notar), n: buckets.notar.length },
      { stage: "Abschluss", days: median(buckets.abschluss), n: buckets.abschluss.length },
    ];
  }, [filteredKontakte, invByKontakt]);

  /*
   * Wonach die Quellen-Tabelle gruppiert.
   *
   * "quelle" ist der bisherige Stand: ein Textfeld am Lead, etwa
   * "Steuerrechner" oder "Meta Ads: München". Es beantwortet nicht, WELCHE
   * Anzeige den Lead gebracht hat, weil bei allen Leads eines Werkzeugs
   * dasselbe darin steht.
   *
   * "kampagne" gruppiert nach `utm_campaign` aus der Adresse. Das ist die
   * Ebene, auf der Budget verteilt wird: `utm_source` und `utm_medium` sind zu
   * grob, um zwei Anzeigen derselben Plattform zu trennen, `utm_content` so
   * fein, dass jede Bildvariante eine eigene Zeile bekäme.
   *
   * Bewusst als Umschalter in dieser Karte und nicht als zweite Karte
   * daneben: Es sind dieselben Kennzahlen für dieselben Leads, nur anders
   * gruppiert. Zwei Karten mit denselben Spalten laden zum Vergleich von
   * Zahlen ein, die sich nicht vergleichen lassen.
   */
  const [gruppierung, setGruppierung] = useState<"quelle" | "kampagne">("quelle");

  const sourceConversion = useMemo(() => {
    const map = new Map<string, { total: number; closing: number; signed: number }>();
    filteredKontakte.forEach(k => {
      // Leads ohne Kennung verschwinden nicht, sie sammeln sich in einer
      // eigenen, ehrlich benannten Zeile. Dort stehen alle Leads von vor der
      // Einführung der Kennungen und alle über den persönlichen Partnerlink.
      const src =
        gruppierung === "kampagne"
          ? kampagnenName(kampagneAusKontakt(k))
          : quelleFuerAuswertung(k.quelle);
      const e = map.get(src) || { total: 0, closing: 0, signed: 0 };
      e.total++;
      const invs = invByKontakt.get(k.id) || [];
      if (invs.some(i => i.meta?.saSigned)) e.signed++;
      if (invs.some(i => i.meta?.rvSigned || i.meta?.notarTermin)) e.closing++;
      map.set(src, e);
    });
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v, signedRate: Math.round((v.signed / Math.max(1, v.total)) * 100), closingRate: Math.round((v.closing / Math.max(1, v.total)) * 100) }))
      .sort((a, b) => b.total - a.total);
  }, [filteredKontakte, invByKontakt, gruppierung]);

  // Conversion je Berater / Setter (zugewiesener Berater)
  const beraterConversion = useMemo(() => {
    const map = new Map<string, { total: number; signed: number; closing: number; setter: Set<string> }>();
    filteredKontakte.forEach((k) => {
      const name = (k.berater || k.meta?.berater || "Ohne Zuweisung").toString();
      const e = map.get(name) || { total: 0, signed: 0, closing: 0, setter: new Set<string>() };
      e.total++;
      const setter = k.setter || k.meta?.setter;
      if (setter) e.setter.add(setter);
      const invs = invByKontakt.get(k.id) || [];
      if (invs.some((i: any) => i.meta?.saSigned)) e.signed++;
      if (invs.some((i: any) => i.meta?.rvSigned || i.meta?.notarTermin)) e.closing++;
      map.set(name, e);
    });
    return Array.from(map.entries())
      .map(([name, v]) => ({
        name,
        total: v.total,
        signed: v.signed,
        closing: v.closing,
        signedRate: Math.round((v.signed / Math.max(1, v.total)) * 100),
        closingRate: Math.round((v.closing / Math.max(1, v.total)) * 100),
        setters: Array.from(v.setter).join(", ") || "–",
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredKontakte, invByKontakt]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-muted-foreground">Zeitraum (Lead-Anlage):</span>
        <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
          <SelectTrigger className="w-44 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30">Letzte 30 Tage</SelectItem>
            <SelectItem value="90">Letzte 90 Tage</SelectItem>
            <SelectItem value="365">Letzte 365 Tage</SelectItem>
            <SelectItem value="all">Alle</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2">Funnel — Lead bis Abschluss <InfoTooltip text="Wie viele Leads erreichen jede Stufe des Vertriebsprozesses. Blaue Fläche = absolute Reichweite, rote Fläche = Drop-off zur Vorstufe. Die Prozentzahl in den Kacheln zeigt die Conversion zur jeweils vorherigen Stufe (Stage-to-Stage)." /></CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={340}>
            <AreaChart data={funnelWithDrop} margin={{ top: 10, right: 20, bottom: 60, left: 0 }}>
              <defs>
                <linearGradient id="funnelCountFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(210 40% 55%)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="hsl(210 40% 55%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="funnelDropFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(0 84% 60%)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(0 84% 60%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="stage" angle={-30} textAnchor="end" height={80} fontSize={11} tickLine={false} axisLine={false} interval={0} />
              <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
              />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
              <Area type="monotone" dataKey="count" name="Reichweite" stroke="hsl(210 40% 55%)" strokeWidth={2.5} fill="url(#funnelCountFill)" dot={{ r: 3, strokeWidth: 2, fill: "hsl(var(--background))" }} activeDot={{ r: 5 }} />
              <Area type="monotone" dataKey="drop" name="Drop-off vs. Vorstufe" stroke="hsl(0 84% 60%)" strokeWidth={2} fill="url(#funnelDropFill)" dot={{ r: 2.5, strokeWidth: 2, fill: "hsl(var(--background))" }} />
            </AreaChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-3 md:grid-cols-9 gap-2 mt-4 text-center text-xs">
            {funnelWithDrop.map(r => (
              <div key={r.stage} className="border border-border rounded-md p-2">
                <p className="font-bold">{r.count}</p>
                <p className="text-muted-foreground truncate">{r.stage}</p>
                <p className="text-primary font-medium">{r.rate}%</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">Durchlaufzeit je Stufe (Median in Tagen ab Lead-Anlage) <InfoTooltip text="Median (Mittelwert ohne Ausreißer) der Tage zwischen Lead-Anlage und Erreichen der jeweiligen Stufe. 'n =' = Anzahl der Leads, bei denen der Zeitstempel der Stufe vorliegt. Niedriger ist besser — zeigt Engpässe im Prozess auf." /></CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-center text-xs">
            {durchlaufzeit.map((d) => (
              <div key={d.stage} className="border border-border rounded-md p-3">
                <p className="text-muted-foreground truncate">{d.stage}</p>
                <p className="font-bold text-lg mt-1">{d.days != null ? `${d.days} T.` : "–"}</p>
                <p className="text-muted-foreground text-[10px]">n = {d.n}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">Median über alle Leads, bei denen der Zeitstempel der Stufe vorhanden ist.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              {gruppierung === "kampagne" ? "Conversion je Kampagne" : "Conversion je Lead-Quelle"}
              <InfoTooltip text="Performance pro Lead-Quelle (z. B. Empfehlung, Webseite, Tippgeber) oder, umgeschaltet, pro Werbekampagne aus utm_campaign. SA-Rate = Anteil mit unterschriebener Selbstauskunft. Closing-Rate = Anteil mit Reservierung oder Notartermin. Beantwortet, welche Anzeige Leads bringt und welche davon Kunden werden." />
            </CardTitle>
            <div className="flex items-center gap-1.5">
              {([
                { key: "quelle", label: "Quelle" },
                { key: "kampagne", label: "Kampagne" },
              ] as const).map((g) => (
                <button
                  key={g.key}
                  onClick={() => setGruppierung(g.key)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    gruppierung === g.key
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
          {gruppierung === "kampagne" && (
            <p className="text-xs text-muted-foreground pt-1">
              Gruppiert nach utm_campaign aus dem Werbelink. Leads ohne Kennung stehen unter
              „{OHNE_KAMPAGNE}"; dort sammeln sich auch alle Leads von vor der Einführung der
              Kampagnenkennungen.
            </p>
          )}
        </CardHeader>
        <CardContent>
          {sourceConversion.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Daten.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground text-xs">
                    <th className="py-2 px-2">{gruppierung === "kampagne" ? "Kampagne" : "Quelle"}</th>
                    <th className="py-2 px-2 text-right">Leads</th>
                    <th className="py-2 px-2 text-right">SA-Signed</th>
                    <th className="py-2 px-2 text-right">SA-Rate</th>
                    <th className="py-2 px-2 text-right">Closing</th>
                    <th className="py-2 px-2 text-right">Closing-Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {sourceConversion.map(s => (
                    <tr key={s.name} className="border-b border-border">
                      <td className="py-2 px-2 font-medium">{s.name}</td>
                      <td className="py-2 px-2 text-right">{s.total}</td>
                      <td className="py-2 px-2 text-right">{s.signed}</td>
                      <td className="py-2 px-2 text-right">{s.signedRate}%</td>
                      <td className="py-2 px-2 text-right">{s.closing}</td>
                      <td className="py-2 px-2 text-right">{s.closingRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2">Conversion je Berater <InfoTooltip text="Performance je zugewiesener Vertriebspartner. Spalte 'Setter' zeigt, von welchen Settern die Leads kommen. SA-Rate / Closing-Rate analog zur Quellen-Tabelle. Vergleichswerte für Coaching und Karriere-Stufen." /></CardTitle></CardHeader>
        <CardContent>
          {beraterConversion.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Daten.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground text-xs">
                    <th className="py-2 px-2">Vertriebspartner</th>
                    <th className="py-2 px-2">Setter</th>
                    <th className="py-2 px-2 text-right">Leads</th>
                    <th className="py-2 px-2 text-right">SA-Signed</th>
                    <th className="py-2 px-2 text-right">SA-Rate</th>
                    <th className="py-2 px-2 text-right">Closing</th>
                    <th className="py-2 px-2 text-right">Closing-Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {beraterConversion.map((s) => (
                    <tr key={s.name} className="border-b border-border">
                      <td className="py-2 px-2 font-medium">{s.name}</td>
                      <td className="py-2 px-2 text-xs text-muted-foreground">{s.setters}</td>
                      <td className="py-2 px-2 text-right">{s.total}</td>
                      <td className="py-2 px-2 text-right">{s.signed}</td>
                      <td className="py-2 px-2 text-right">{s.signedRate}%</td>
                      <td className="py-2 px-2 text-right">{s.closing}</td>
                      <td className="py-2 px-2 text-right">{s.closingRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}