import { Card } from "@/components/ui/card";
import { useMemo, useState } from "react";
import { getKontakte } from "@/lib/kundenStore";
import { excludeStatsKontakte } from "@/lib/statsExclusion";
import { useLiveVersion } from "@/hooks/useLiveData";
import { useUser } from "@/contexts/UserContext";
import { tarnName, unscharfKlasse } from "@/lib/vorfuehrmodus";
import { XCircle, TrendingDown, TrendingUp, Info } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface NoShowEntry {
  datum: string;
  uhrzeit: string;
  berater: string;
  setter?: string;
  gemeldetAm: string;
}

function getColorClass(quote: number): string {
  if (quote < 20) return "text-[hsl(var(--success))]";
  if (quote < 35) return "text-[hsl(var(--warning))]";
  return "text-destructive";
}

function inRange(iso: string, days: number): boolean {
  if (!iso) return false;
  if (days === Infinity) return true;
  const ts = new Date(iso).getTime();
  if (!ts) return false;
  return ts >= Date.now() - days * 86_400_000;
}

export function NoShowQuoteCard() {
  const { user } = useUser();
  const _cv = useLiveVersion(["kontakte"]);
  const [zeitraum, setZeitraum] = useState<"7" | "30" | "90" | "all">("30");
  const isAdmin = ["admin", "inhaber"].includes(user.role);
  const isSetterin = user.role === "setterin";

  const stats = useMemo(() => {
    const days = zeitraum === "all" ? Infinity : parseInt(zeitraum, 10);
    const all = excludeStatsKontakte(getKontakte());
    let erschienen = 0;
    let noshow = 0;
    const noshowsBySetter = new Map<string, { ns: number; total: number }>();
    const noshowsByBerater = new Map<string, { ns: number; total: number }>();
    let lastPeriodNoshow = 0;
    let lastPeriodErschienen = 0;

    for (const k of all) {
      // Personal filter for setterin: only own leads
      if (isSetterin && k.setter !== user.name) continue;

      // Erschienen-Zähler (im Zeitraum)
      if (k.terminErgebnis === "erschienen" && inRange(k.terminErgebnisAm || "", days)) {
        erschienen++;
        const setterName = k.setter || "–";
        const beraterName = k.terminErgebnisVon || k.berater || "–";
        const s = noshowsBySetter.get(setterName) || { ns: 0, total: 0 };
        s.total++;
        noshowsBySetter.set(setterName, s);
        const b = noshowsByBerater.get(beraterName) || { ns: 0, total: 0 };
        b.total++;
        noshowsByBerater.set(beraterName, b);
      }
      // No-Show-Historie durchgehen
      const hist = (k.noShowHistorie || []) as NoShowEntry[];
      for (const h of hist) {
        if (!inRange(h.gemeldetAm, days)) {
          // count for previous period (days...2*days ago)
          const ts = new Date(h.gemeldetAm).getTime();
          if (ts && ts >= Date.now() - 2 * days * 86_400_000 && ts < Date.now() - days * 86_400_000) {
            if (!isSetterin || h.setter === user.name) lastPeriodNoshow++;
          }
          continue;
        }
        if (isSetterin && h.setter !== user.name) continue;
        noshow++;
        const setterName = h.setter || "–";
        const beraterName = h.berater || "–";
        const s = noshowsBySetter.get(setterName) || { ns: 0, total: 0 };
        s.ns++;
        s.total++;
        noshowsBySetter.set(setterName, s);
        const b = noshowsByBerater.get(beraterName) || { ns: 0, total: 0 };
        b.ns++;
        b.total++;
        noshowsByBerater.set(beraterName, b);
      }
      if (k.terminErgebnis === "erschienen" && k.terminErgebnisAm) {
        const ts = new Date(k.terminErgebnisAm).getTime();
        if (ts && ts >= Date.now() - 2 * days * 86_400_000 && ts < Date.now() - days * 86_400_000) {
          if (!isSetterin || k.setter === user.name) lastPeriodErschienen++;
        }
      }
    }

    const total = erschienen + noshow;
    const quote = total > 0 ? Math.round((noshow / total) * 100) : 0;
    const lastTotal = lastPeriodErschienen + lastPeriodNoshow;
    const lastQuote = lastTotal > 0 ? Math.round((lastPeriodNoshow / lastTotal) * 100) : 0;
    const trend = quote - lastQuote;

    const setterTable = Array.from(noshowsBySetter.entries())
      .map(([name, v]) => ({ name, ...v, quote: v.total > 0 ? Math.round((v.ns / v.total) * 100) : 0 }))
      .sort((a, b) => b.quote - a.quote);
    const beraterTable = Array.from(noshowsByBerater.entries())
      .map(([name, v]) => ({ name, ...v, quote: v.total > 0 ? Math.round((v.ns / v.total) * 100) : 0 }))
      .sort((a, b) => b.quote - a.quote);

    return { erschienen, noshow, total, quote, trend, setterTable, beraterTable };
  }, [_cv, zeitraum, isSetterin, user.name]);

  return (
    <Card className="p-6">      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold flex items-center gap-2">
          <XCircle className="h-4 w-4 text-destructive" />
          {isSetterin ? "Deine No-Show-Quote" : "No-Show-Quote (Team)"}
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="p-0.5"><Info className="h-3 w-3 text-muted-foreground/60" /></button>
            </PopoverTrigger>
            <PopoverContent className="max-w-[280px] text-xs">
              No-Show-Quote = Termine mit Ergebnis „No-Show" / Alle Termine mit Ergebnis (Erschienen + No-Show). „Verschoben" zählt nicht.
            </PopoverContent>
          </Popover>
        </h3>
        <Select value={zeitraum} onValueChange={(v) => setZeitraum(v as any)}>
          <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 Tage</SelectItem>
            <SelectItem value="30">30 Tage</SelectItem>
            <SelectItem value="90">90 Tage</SelectItem>
            <SelectItem value="all">Alle</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Im Vorfuehrmodus bleiben Ueberschrift und Beschriftungen scharf, nur
          die Werte werden weichgezeichnet. Der Zuschauer sieht also, dass die
          Karte eine Quote fuehrt, aber nicht wie sie ausfaellt. */}
      <div className="flex items-baseline gap-3">
        <span className={unscharfKlasse(`text-4xl font-bold ${getColorClass(stats.quote)}`)}>{stats.quote}%</span>
        {stats.trend !== 0 && (
          <span className={unscharfKlasse(`text-xs flex items-center gap-0.5 ${stats.trend < 0 ? "text-[hsl(var(--success))]" : "text-destructive"}`)}>
            {stats.trend < 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
            {Math.abs(stats.trend)}%
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        <span className={unscharfKlasse()}>{stats.noshow}</span> von{" "}
        <span className={unscharfKlasse()}>{stats.total}</span>{" "}
        {stats.total === 1 ? "Termin" : "Terminen"} (
        <span className={unscharfKlasse()}>{stats.erschienen}</span> erschienen)
      </p>

      {(
        <div className={`grid grid-cols-1 ${isAdmin ? "md:grid-cols-2" : ""} gap-4 mt-4 pt-4 border-t`}>
          {isAdmin && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">Quote pro Setterin</p>
              <div className="space-y-1">
                {stats.setterTable.map(s => (
                  <div key={s.name} className="flex items-center justify-between text-xs">
                    <span className="truncate">{tarnName(s.name, "partner")}</span>
                    <span className="flex items-center gap-2">
                      <span className={unscharfKlasse("text-muted-foreground")}>{s.ns}/{s.total}</span>
                      <span className={unscharfKlasse(`font-semibold ${getColorClass(s.quote)}`)}>{s.quote}%</span>
                    </span>
                  </div>
                ))}
                {stats.setterTable.length === 0 && <p className="text-xs text-muted-foreground italic">Keine Daten</p>}
              </div>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">
              {isSetterin ? "No-Show-Quote pro Vertriebspartner (deine Termine)" : "Quote pro Vertriebspartner"}
            </p>
            <div className="space-y-1">
              {stats.beraterTable.map(b => (
                <div key={b.name} className="flex items-center justify-between text-xs">
                  <span className="truncate">{tarnName(b.name, "partner")}</span>
                  <span className="flex items-center gap-2">
                    <span className={unscharfKlasse("text-muted-foreground")}>{b.ns}/{b.total}</span>
                    <span className={unscharfKlasse(`font-semibold ${getColorClass(b.quote)}`)}>{b.quote}%</span>
                  </span>
                </div>
              ))}
              {stats.beraterTable.length === 0 && <p className="text-xs text-muted-foreground italic">Keine Daten</p>}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
