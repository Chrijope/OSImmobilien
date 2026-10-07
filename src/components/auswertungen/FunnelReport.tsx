import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PIPELINE_STUFEN,
  PIPELINE_ORDER,
  getEffectivePipelineStufe,
  normalizePipelineStufe,
  type PipelineStufe,
} from "@/lib/kontaktPipeline";
import { getKontakte } from "@/lib/kundenStore";
import { istZustaendig } from "@/lib/kontaktOwnership";
import { useLiveVersion } from "@/hooks/useLiveData";

// Der Funnel zeigt bewusst nur die grossen Etappen. Die Stufen dazwischen
// verschwinden aber nicht mehr: jeder Kontakt wird auf die letzte Etappe
// gerechnet, die er hinter sich gebracht hat. Vorher fielen neun Stufen
// ("Nicht erreicht", "Follow-Up", "Erstgespräch geplant", die NoShows,
// "Selbstauskunft", "Abrechnung" …) durch das Raster, ihre Kontakte tauchten
// im Funnel überhaupt nicht auf.
//
// Die Auswahl der Etappen ist eine Anzeigefrage, ihre REIHENFOLGE nicht: Sie
// muss der von `PIPELINE_STUFEN` folgen. Bis zum 08.09.2026 stand hier die
// Bonitaet noch vor der Objektauswahl, die Pipeline fuehrt sie seit dem
// 06.08.2026 hinter die Reservierung. Der Test in `statistikReihenfolge.test.ts`
// wacht darueber, dass die Liste nicht wieder abweicht.
const FUNNEL_STUFEN: PipelineStufe[] = [
  "neuer_lead",
  "erreicht",
  "erstgespraech_geplant",
  "beratungsgespraech",
  "objektauswahl",
  "reservierung",
  "bonitaetsunterlagen",
  "finanzierung",
  "notar",
  "faelligkeit",
  "abgeschlossen",
];

/** Stufen, die keinen Fortschritt beschreiben und deshalb nicht mitzaehlen. */
const AUSSERHALB = new Set<string>(["verloren", "archiviert", "bestandsimport"]);

/**
 * Ordnet jede Pipeline-Stufe der hoechsten Funnel-Etappe zu, die sie
 * einschliesst. "Follow-Up" landet damit bei "Erreicht", "BG NoShow" bei
 * "Beratungsgespräch", "Abrechnung" bei "Fälligkeit".
 */
const FUNNEL_INDEX: Map<string, number> = (() => {
  const map = new Map<string, number>();
  const posImPlan = (s: string) => PIPELINE_ORDER.indexOf(s as PipelineStufe);
  const etappen = FUNNEL_STUFEN.map((s, i) => ({ pos: posImPlan(s), index: i }));
  for (const stufe of PIPELINE_ORDER) {
    if (AUSSERHALB.has(stufe)) continue;
    const pos = posImPlan(stufe);
    /*
     * Gesucht ist die HOECHSTE Etappe, die der Kontakt hinter sich hat, also
     * die mit der groessten Position, die noch vor ihm liegt. Vorher gewann
     * schlicht der letzte Treffer in der Liste. Das ging nur gut, solange die
     * Liste nach Position sortiert war, und genau das war sie nicht mehr: Ein
     * Kontakt in "Bonitaetsunterlagen" landete in der Etappe "Reservierung".
     */
    let treffer = -1;
    let besteEtappe = -1;
    for (const e of etappen) {
      if (e.pos >= 0 && e.pos <= pos && e.pos > besteEtappe) {
        besteEtappe = e.pos;
        treffer = e.index;
      }
    }
    if (treffer >= 0) map.set(stufe, treffer);
  }
  return map;
})();

const ZEITRAEUME = [
  { key: "30", label: "30 Tage", tage: 30 },
  { key: "90", label: "90 Tage", tage: 90 },
  { key: "365", label: "365 Tage", tage: 365 },
  { key: "all", label: "Gesamt", tage: 0 },
] as const;

function labelFor(stufe: PipelineStufe): string {
  return PIPELINE_STUFEN.find(s => s.key === stufe)?.label ?? stufe;
}

export function FunnelReport({ beraterFilter, beraterId }: { beraterFilter?: string; beraterId?: string }) {
  useLiveVersion(["kontakte", "investments"]);
  const [zeitraum, setZeitraum] = useState<(typeof ZEITRAEUME)[number]["key"]>("90");

  const data = useMemo(() => {
    const zr = ZEITRAEUME.find(z => z.key === zeitraum)!;
    const cutoff = zr.tage > 0 ? Date.now() - zr.tage * 86400000 : 0;

    const kontakte = getKontakte().filter(k => {
      if (k.geloescht || k.archiviert) return false;
      // Kennung zuerst, der Name nur fuer Altbestand ohne Kennung und nur eindeutig.
      if (beraterFilter && beraterFilter !== "alle" && !istZustaendig(k, { userId: beraterId, userName: beraterFilter })) return false;
      if (cutoff > 0) {
        const t = new Date(k.erstellt_am || 0).getTime();
        if (!t || t < cutoff) return false;
      }
      return true;
    });

    // Map: für jeden Kontakt → höchste erreichte Stufe
    const reachedCount = new Array(FUNNEL_STUFEN.length).fill(0);

    for (const k of kontakte) {
      const effective = normalizePipelineStufe(getEffectivePipelineStufe(k));
      const idx = effective === null ? -1 : FUNNEL_INDEX.get(effective) ?? -1;
      if (idx < 0) continue;
      // Lead hat alle Stufen bis inkl. seiner aktuellen erreicht
      for (let i = 0; i <= idx; i++) reachedCount[i]++;
    }

    const total = reachedCount[0] || 0;
    return FUNNEL_STUFEN.map((stufe, i) => {
      const count = reachedCount[i];
      const prev = i === 0 ? count : reachedCount[i - 1];
      const overall = total > 0 ? (count / total) * 100 : 0;
      const step = prev > 0 ? (count / prev) * 100 : 0;
      return { stufe, label: labelFor(stufe), count, overall, step };
    });
  }, [zeitraum, beraterFilter, beraterId]);

  const max = Math.max(...data.map(d => d.count), 1);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-sm font-semibold font-sans flex items-center gap-2">
              Pipeline-Funnel
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Konversionsraten pro Stufe — höchste je Lead erreichte Stufe
              {beraterFilter && beraterFilter !== "alle" ? ` · ${beraterFilter}` : ""}
            </p>
          </div>
          <div className="flex gap-1">
            {ZEITRAEUME.map(z => (
              <button
                key={z.key}
                onClick={() => setZeitraum(z.key)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  zeitraum === z.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {z.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {data[0]?.count === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Keine Daten im gewählten Zeitraum.</p>
        ) : (
          data.map((row, i) => {
            const widthPct = (row.count / max) * 100;
            return (
              <div key={row.stufe} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">{row.label}</span>
                  <span className="text-muted-foreground tabular-nums">
                    <strong className="text-foreground">{row.count}</strong>
                    <span className="mx-2">·</span>
                    {row.overall.toFixed(1)} % gesamt
                    {i > 0 && (
                      <>
                        <span className="mx-2">·</span>
                        {row.step.toFixed(1)} % vs. vorher
                      </>
                    )}
                  </span>
                </div>
                <div className="h-5 bg-muted rounded-md overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${Math.max(widthPct, 1.5)}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}