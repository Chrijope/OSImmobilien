import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getInvestments } from "@/lib/investmentsStore";
import { getKontakte } from "@/lib/kundenStore";
import { excludeStatsKontakte } from "@/lib/statsExclusion";
import {
  Banknote,
  CheckCircle2,
  Percent,
  Hourglass,
  AlertTriangle,
  TrendingUp,
  Wallet,
} from "lucide-react";

/**
 * Compact KPI block für Finanzierungs-Performance.
 * Wird im FP-Dashboard, im Admin-Dashboard und im Statistiken-Tab verwendet.
 *
 * Haupt-KPI: Quote Finanzierung → Notar (Genehmigungsquote)
 * Sekundär: Quote Reservierung → Finanzierung (Volumen-Indikator)
 * Zusatz: Ø Tage RV→Angebot, Ø Tage Angebot→Darlehensvertrag,
 *         Offene Fälle >7/14 Tage, Finanzierungsvolumen (€)
 */

const RESERVATION_STAGES = ["reservierung"];
const FINANZIERUNG_STAGES = ["finanzierung"];
const POST_FINANZIERUNG_STAGES = ["notar", "notar_ohne_gs", "notar_mit_gs", "faelligkeit", "abrechnung", "abgeschlossen"];

function fmtCurrency(value: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function getKaufpreis(inv: any): number {
  const raw = (inv as any)?.kaufpreis;
  return typeof raw === "number" && raw > 0 ? raw : 0;
}

function daysBetween(aIso?: string, bIso?: string): number | null {
  if (!aIso || !bIso) return null;
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  if (isNaN(a) || isNaN(b) || b < a) return null;
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return Math.round(nums.reduce((s, n) => s + n, 0) / nums.length);
}

export interface FinanzierungsPerformanceData {
  reserviertCount: number;
  inFinanzierungCount: number;
  postFinanzierungCount: number;
  quoteResFin: number;
  quoteFinNotar: number;
  avgTageRvAngebot: number | null;
  avgTageAngebotVertrag: number | null;
  offene7: number;
  offene14: number;
  volumenGenehmigt: number;
  volumenInFinanzierung: number;
}

export function computeFinanzierungsPerformance(opts?: { filterFinanzierungspartnerId?: string }): FinanzierungsPerformanceData {
  const investments = getInvestments();

  // Optional: nur Investments, deren betreuender FP übereinstimmt — derzeit
  // ist FP global; Filter bleibt für künftige Zuweisung optional.
  const filtered = opts?.filterFinanzierungspartnerId
    ? investments // Platzhalter: keine FP-Zuweisung pro Investment vorhanden
    : investments;

  const reserviert = filtered.filter((i) => RESERVATION_STAGES.includes(i.pipelineStufe));
  const inFinanzierung = filtered.filter((i) => FINANZIERUNG_STAGES.includes(i.pipelineStufe));
  const postFinanzierung = filtered.filter((i) => POST_FINANZIERUNG_STAGES.includes(i.pipelineStufe));

  // Quote Reservierung → Finanzierung (Volumen-Indikator)
  const denomResFin = reserviert.length + inFinanzierung.length + postFinanzierung.length;
  const quoteResFin = denomResFin > 0
    ? Math.round(((inFinanzierung.length + postFinanzierung.length) / denomResFin) * 100)
    : 0;

  // Quote Finanzierung → Notar (Haupt-KPI / Genehmigungsquote)
  const denomFinNotar = inFinanzierung.length + postFinanzierung.length;
  const quoteFinNotar = denomFinNotar > 0
    ? Math.round((postFinanzierung.length / denomFinNotar) * 100)
    : 0;

  // Ø Tage RV → Angebot
  // Datenquelle: meta.reserviertAm → meta.finanzierungAngebotGesendetAm
  // Fallback: finanzierungen.aktualisiert_am als Proxy für ersten Angebots-Upload.
  const rvToAngebot: number[] = [];
  for (const inv of [...inFinanzierung, ...postFinanzierung]) {
    const meta = (inv as any).meta || {};
    const start = meta.reserviertAm || meta.pipelineSeit;
    const end = meta.finanzierungAngebotGesendetAm;
    const d = daysBetween(start, end);
    if (d !== null) rvToAngebot.push(d);
  }

  // Ø Tage Angebot → Darlehensvertrag
  // Datenquelle: meta.finanzierungAngebotGesendetAm → meta.darlehensvertragUploadedAm
  //
  // Frueher stand hier ein Rueckfall auf `finanzierungen.aktualisiert_am`, der
  // ueber `finanzierungen.kunde_id` gesucht wurde. Diese Spalte fuehrt aber
  // historisch die Investment-ID (siehe Kopfkommentar in `finanzierungStore`),
  // gesucht wurde mit der Kontakt-ID. Der Rueckfall hat deshalb nie gegriffen.
  // Er wurde nicht repariert, sondern entfernt: `aktualisiert_am` ist das
  // Datum der letzten beliebigen Aenderung an der Finanzierung und kein
  // Vertragsdatum. Ein Reparieren haette die Kennzahl verfaelscht statt sie zu
  // fuellen. Gerechnet wird jetzt wie in `financingData` im statistikController.
  const angebotToVertrag: number[] = [];
  for (const inv of [...inFinanzierung, ...postFinanzierung]) {
    const meta = (inv as any).meta || {};
    const start = meta.finanzierungAngebotGesendetAm;
    const end = meta.darlehensvertragUploadedAm;
    const d = daysBetween(start, end);
    if (d !== null && d <= 365) angebotToVertrag.push(d);
  }

  // Offene Fälle ohne Aktivität
  const now = Date.now();
  const isInactive = (inv: any, days: number) => {
    const meta = inv.meta || {};
    const last = meta.pipelineSeit || meta.reserviertAm || inv.erstellt_am;
    if (!last) return false;
    const t = new Date(last).getTime();
    return !isNaN(t) && (now - t) / 86400000 > days;
  };
  const offen = [...reserviert, ...inFinanzierung];
  const offene7 = offen.filter((i) => isInactive(i, 7)).length;
  const offene14 = offen.filter((i) => isInactive(i, 14)).length;

  const volumenGenehmigt = postFinanzierung.reduce((s, i) => s + getKaufpreis(i), 0);
  const volumenInFinanzierung = inFinanzierung.reduce((s, i) => s + getKaufpreis(i), 0);

  return {
    reserviertCount: reserviert.length,
    inFinanzierungCount: inFinanzierung.length,
    postFinanzierungCount: postFinanzierung.length,
    quoteResFin,
    quoteFinNotar,
    avgTageRvAngebot: avg(rvToAngebot),
    avgTageAngebotVertrag: avg(angebotToVertrag),
    offene7,
    offene14,
    volumenGenehmigt,
    volumenInFinanzierung,
  };
}

interface BlockProps {
  /** Optional Titel-Suffix; default zeigt nur "Finanzierungs-Performance" */
  title?: string;
  /** Kompakter Layout-Modus (für Admin-Dashboard) */
  compact?: boolean;
}

export function FinanzierungsPerformanceBlock({ title = "Finanzierungs-Performance", compact = false }: BlockProps) {
  const data = useMemo(() => computeFinanzierungsPerformance(), []);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm flex items-center gap-2">
            <Banknote className="h-4 w-4 text-primary" />
            {title}
          </CardTitle>
          <Badge variant="secondary" className="text-[10px]">
            Haupt-KPI: Finanzierung → Notar
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Haupt-KPI groß: Quote Fin → Notar */}
        <div className={`grid gap-3 ${compact ? "grid-cols-2 md:grid-cols-3" : "grid-cols-1 md:grid-cols-3"}`}>
          <div className="md:col-span-2 rounded-lg border bg-gradient-to-br from-primary/10 to-primary/5 p-4 flex items-center gap-4">
            <div className="rounded-full bg-primary/15 p-3">
              <CheckCircle2 className="h-7 w-7 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-3xl font-bold leading-none">{data.quoteFinNotar}%</p>
              <p className="text-xs text-muted-foreground mt-1">
                Quote Finanzierung → Notar (Genehmigungsquote)
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {data.postFinanzierungCount} genehmigt von {data.inFinanzierungCount + data.postFinanzierungCount} aktiven Anträgen
              </p>
            </div>
          </div>
          <div className="rounded-lg border p-4 flex items-center gap-3">
            <Percent className="h-5 w-5 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-xl font-semibold">{data.quoteResFin}%</p>
              <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                Reservierung → Finanzierung
              </p>
              <p className="text-[10px] text-muted-foreground">
                {data.reserviertCount} offene Res.
              </p>
            </div>
          </div>
        </div>

        {/* Zeit- und Risiko-KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiTile
            icon={Hourglass}
            label="Ø RV → Angebot"
            value={data.avgTageRvAngebot !== null ? `${data.avgTageRvAngebot}d` : "—"}
            sub="Reaktionszeit FP"
          />
          <KpiTile
            icon={Hourglass}
            label="Ø Angebot → Vertrag"
            value={data.avgTageAngebotVertrag !== null ? `${data.avgTageAngebotVertrag}d` : "—"}
            sub="Bearbeitung Bank"
          />
          <KpiTile
            icon={AlertTriangle}
            label="Offen >7 / >14 Tage"
            value={`${data.offene7} / ${data.offene14}`}
            sub="Ohne Aktivität"
            danger={data.offene14 > 0}
          />
          <KpiTile
            icon={Wallet}
            label="Volumen genehmigt"
            value={fmtCurrency(data.volumenGenehmigt)}
            sub={`In Fin.: ${fmtCurrency(data.volumenInFinanzierung)}`}
          />
        </div>

        {(data.avgTageRvAngebot === null || data.avgTageAngebotVertrag === null) && (
          <p className="text-[10px] text-muted-foreground italic">
            Hinweis: Ø-Tage werden aus Pipeline-Zeitstempeln abgeleitet — fehlende Werte
            erscheinen als „—", sobald genug Daten vorliegen.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function KpiTile({
  icon: Icon,
  label,
  value,
  sub,
  danger,
}: {
  icon: any;
  label: string;
  value: string;
  sub?: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start justify-between">
        <p className={`text-lg font-bold ${danger ? "text-destructive" : ""}`}>{value}</p>
        <Icon className={`h-4 w-4 shrink-0 ${danger ? "text-destructive" : "text-muted-foreground"}`} />
      </div>
      <p className="text-[11px] font-medium mt-1 leading-tight">{label}</p>
      {sub && <p className="text-[10px] text-muted-foreground leading-tight">{sub}</p>}
    </div>
  );
}