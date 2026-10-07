import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { XCircle, TrendingDown, AlertTriangle } from "lucide-react";
import { getEffectivePipelineStufe } from "@/lib/kontaktPipeline";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import type { KundeData } from "@/lib/kundenStore";
import {
  verlustGrundById,
  verlustGrundLabel,
  verlustGruppeVon,
  grundAusFreitext,
  type VerlustGruppeId,
} from "@/lib/verlustgruende";

type Zeitraum = "30" | "90" | "365" | "alle";

const ZEITRAEUME: { key: Zeitraum; label: string }[] = [
  { key: "30", label: "30 Tage" },
  { key: "90", label: "90 Tage" },
  { key: "365", label: "1 Jahr" },
  { key: "alle", label: "Gesamt" },
];

/**
 * Einen gespeicherten Verlust auf den Katalog abbilden.
 *
 * Neue Datensätze tragen bereits eine Katalog-ID. Alles, was vor der
 * Umstellung als Freitext eingetippt wurde, wird über die Regeln in
 * `verlustgruende.ts` zugeordnet. Was sich nicht sicher zuordnen lässt, wird
 * als solches ausgewiesen und nicht stillschweigend einsortiert.
 */
function katalogGrund(raw?: string): { grundId: string; unsicher: boolean } {
  const direkt = verlustGrundById(raw);
  if (direkt) return { grundId: direkt.id, unsicher: false };
  const abgeleitet = grundAusFreitext(raw);
  return { grundId: abgeleitet.grundId, unsicher: !abgeleitet.sicher };
}

/**
 * Felder aus einer Kontaktzeile lesen, egal ob sie schon aufbereitet ist.
 *
 * Diese Karte bekam bisher die rohen Datenbankzeilen, liest aber Felder wie
 * `verlorenGrund` und `setter`. Die gibt es an der Rohzeile nicht, sie liegen
 * in der JSON-Spalte `meta` und werden erst beim Aufbereiten hochgezogen.
 * Folge: Jeder verlorene Lead landete im Sammelposten "Kein Grund angegeben",
 * und in der Tabelle je Person tauchte keine einzige Setterin auf.
 */
function feld<T = string>(k: unknown, name: string): T | undefined {
  const obj = k as Record<string, unknown> & { meta?: Record<string, unknown> };
  return (obj?.[name] ?? obj?.meta?.[name]) as T | undefined;
}

/** Ist dieser Kontakt verloren? */
function istVerloren(k: unknown): boolean {
  const obj = k as Record<string, unknown> & { meta?: Record<string, unknown> };
  // Wer per Ziehen und Ablegen in die Spalte "Verloren" geschoben wird, bekommt
  // nur die Stufe und keinen Status. Beides muss deshalb geprüft werden.
  if (obj?.status === "verloren") return true;
  if (feld(k, "pipelineStufe") === "verloren") return true;
  try {
    return getEffectivePipelineStufe(k as KundeData) === "verloren";
  } catch {
    return false;
  }
}

/**
 * Zeitpunkt des Verlusts.
 *
 * `verlorenAm` ist der richtige Wert, wird heute aber nur vom nächtlichen Job
 * gesetzt. Solange das nicht überall passiert, bleibt das Änderungsdatum als
 * Notbehelf, mit dem bekannten Nachteil, dass jede spätere Bearbeitung den
 * Lead in ein anderes Zeitfenster schiebt.
 */
function verlorenZeitpunkt(k: unknown): number {
  const roh = k as Record<string, string | undefined>;
  const wert = feld<string>(k, "verlorenAm") || roh?.aktualisiert_am || roh?.erstellt_am;
  return wert ? new Date(wert).getTime() : 0;
}

export function StatistikVerlustgruende({ kontakte }: { kontakte: KundeData[] }) {
  const navigate = useNavigate();
  const [zeitraum, setZeitraum] = useState<Zeitraum>("90");
  const [offeneGruppe, setOffeneGruppe] = useState<VerlustGruppeId | null>(null);

  const data = useMemo(() => {
    const cutoffMs =
      zeitraum === "alle" ? 0 : Date.now() - parseInt(zeitraum, 10) * 24 * 3600 * 1000;

    const verloren = kontakte.filter((k) => {
      if (!istVerloren(k)) return false;
      if (zeitraum === "alle") return true;
      return verlorenZeitpunkt(k) >= cutoffMs;
    });

    // Zwei Ebenen: Die Gruppe ist die Frage, an der sich etwas ändern lässt,
    // der Grund ist die konkrete Nennung darunter.
    type GruppenWert = {
      id: VerlustGruppeId;
      label: string;
      bedeutung: string;
      count: number;
      gruende: Map<string, number>;
    };
    const gruppenMap = new Map<VerlustGruppeId, GruppenWert>();
    let unsicherZugeordnet = 0;
    let vonUns = 0;
    let wiederAnsprechbar = 0;

    for (const k of verloren) {
      const { grundId, unsicher } = katalogGrund(feld<string>(k, "verlorenGrund"));
      if (unsicher) unsicherZugeordnet += 1;
      const grund = verlustGrundById(grundId);
      if (grund?.verantwortung === "uns") vonUns += 1;
      if (grund?.wiederAnsprechbar) wiederAnsprechbar += 1;

      const gruppe = verlustGruppeVon(grundId);
      const eintrag = gruppenMap.get(gruppe.id) || {
        id: gruppe.id,
        label: gruppe.label,
        bedeutung: gruppe.bedeutung,
        count: 0,
        gruende: new Map<string, number>(),
      };
      eintrag.count += 1;
      // Beim Altbestand steht der ursprüngliche Text im Feld, deshalb wird
      // hier die Katalog-ID gezählt und erst zur Anzeige beschriftet.
      eintrag.gruende.set(grundId, (eintrag.gruende.get(grundId) || 0) + 1);
      gruppenMap.set(gruppe.id, eintrag);
    }

    const gruppen = Array.from(gruppenMap.values())
      .map((gr) => ({
        ...gr,
        pct: verloren.length > 0 ? (gr.count / verloren.length) * 100 : 0,
        gruende: Array.from(gr.gruende.entries())
          .map(([grundId, count]) => ({
            grundId,
            label: verlustGrundLabel(grundId),
            count,
            pct: gr.count > 0 ? (count / gr.count) * 100 : 0,
          }))
          .sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.count - a.count);

    // Verlustquote pro Setter/Berater (alle Kontakte des Zeitraums)
    const allImZeitraum = kontakte.filter((k) => {
      if (zeitraum === "alle") return true;
      const ts = new Date((k as unknown as Record<string, string>)?.erstellt_am || 0).getTime();
      return ts >= cutoffMs;
    });
    const perPersonMap = new Map<string, { gesamt: number; verloren: number }>();
    for (const k of allImZeitraum) {
      const setter = feld<string>(k, "setter") || feld<string>(k, "berater") || "—";
      const entry = perPersonMap.get(setter) || { gesamt: 0, verloren: 0 };
      entry.gesamt += 1;
      if (istVerloren(k)) entry.verloren += 1;
      perPersonMap.set(setter, entry);
    }
    const alleMitMindestmenge = Array.from(perPersonMap.entries())
      .filter(([_, v]) => v.gesamt >= 3) // Mindestens 3 Leads für aussagekräftige Quote
      .map(([name, v]) => ({ name, ...v, quote: (v.verloren / v.gesamt) * 100 }))
      .sort((a, b) => b.quote - a.quote);

    // Der Durchschnitt wird über ALLE gerechnet, nicht über die sechs, die
    // gleich angezeigt werden. Vorher war er der Mittelwert der sechs
    // schlechtesten und damit als Vergleichsmaßstab unbrauchbar.
    const teamAvgQuote =
      alleMitMindestmenge.length > 0
        ? alleMitMindestmenge.reduce((s, p) => s + p.quote, 0) / alleMitMindestmenge.length
        : 0;

    return {
      gruppen,
      verlorenGesamt: verloren.length,
      unsicherZugeordnet,
      vonUns,
      wiederAnsprechbar,
      perPerson: alleMitMindestmenge.slice(0, 6),
      teamAvgQuote,
    };
  }, [kontakte, zeitraum]);

  const teamAvgQuote = data.teamAvgQuote;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 bg-destructive rounded-full" />
            <CardTitle className="text-sm font-semibold font-sans flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-destructive" />
              Verlustgründe: Wo verlieren wir Leads?
              <InfoTooltip text="Alle im Zeitraum als verloren markierten Leads. Oben nach Gruppen aus dem festen Katalog, ein Klick auf eine Gruppe zeigt die einzelnen Gründe. Unten die Verlustquote pro Setter und VP, um auffällige Muster zu erkennen." />
            </CardTitle>
          </div>
          <div className="flex items-center gap-1.5">
            {ZEITRAEUME.map((z) => (
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
        <p className="text-xs text-muted-foreground mt-1">
          {data.verlorenGesamt} verlorene Leads im gewählten Zeitraum.
          {data.verlorenGesamt > 0 && (
            <>
              {" "}Davon {data.vonUns} an etwas, das bei uns lag, und {data.wiederAnsprechbar} später
              wieder ansprechbar.
            </>
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Gruppen mit aufklappbaren Einzelgründen */}
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 font-semibold">
            <span className="inline-flex items-center gap-1">Verlustgruppen <InfoTooltip text="Die Gruppe beantwortet die Frage, an der sich etwas ändern lässt. Ein Klick auf die Gruppe zeigt die einzelnen Gründe darunter." /></span>
          </p>
          {data.gruppen.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-4 text-center">
              Keine verlorenen Leads im gewählten Zeitraum.
            </p>
          ) : (
            <div className="space-y-1.5">
              {data.gruppen.map((gr) => {
                const offen = offeneGruppe === gr.id;
                return (
                  <div key={gr.id}>
                    <button
                      onClick={() => setOffeneGruppe(offen ? null : gr.id)}
                      className="w-full text-left group"
                      title={gr.bedeutung}
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="flex items-center gap-1.5 text-foreground group-hover:text-destructive transition-colors">
                          <XCircle className="h-3 w-3 text-destructive" />
                          <span className="font-medium">{gr.label}</span>
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          <span className="font-semibold text-foreground">{gr.count}</span> · {gr.pct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-destructive/70 group-hover:bg-destructive transition-all"
                          style={{ width: `${Math.max(2, gr.pct)}%` }}
                        />
                      </div>
                    </button>
                    {offen && (
                      <div className="mt-1.5 ml-4 space-y-1 border-l border-border pl-3">
                        <p className="text-[10px] text-muted-foreground italic">{gr.bedeutung}</p>
                        {gr.gruende.map((g) => (
                          <button
                            key={g.grundId}
                            onClick={() => navigate("/verloren")}
                            className="w-full flex items-center justify-between text-[11px] py-0.5 hover:text-destructive transition-colors"
                          >
                            <span className="text-left">{g.label}</span>
                            <span className="tabular-nums text-muted-foreground">
                              {g.count} · {g.pct.toFixed(0)}%
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {data.unsicherZugeordnet > 0 && (
            <p className="text-[10px] text-muted-foreground mt-2 italic">
              {data.unsicherZugeordnet} Leads stammen aus der Zeit vor dem festen Katalog und ließen
              sich nicht sicher zuordnen. Sie zählen unter „Sonstiges".
            </p>
          )}
        </div>

        {/* Verlustquote pro Person */}
        {data.perPerson.length > 0 && (
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 font-semibold flex items-center gap-2">
              Verlustquote pro Setter / VP
              <InfoTooltip text="Anteil verlorener Leads pro Person (Verloren ÷ Gesamt im Zeitraum). Nur Personen mit ≥ 3 Leads. 'Auffällig' (rot) = > 30 % UND deutlich über Team-Schnitt — verdient ein 1:1-Coaching-Gespräch." />
              <span className="text-[10px] text-muted-foreground normal-case font-normal">
                Ø Team: {teamAvgQuote.toFixed(1)}%
              </span>
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-1.5 font-medium">Name</th>
                    <th className="text-right py-1.5 font-medium">Leads</th>
                    <th className="text-right py-1.5 font-medium">Verloren</th>
                    <th className="text-right py-1.5 font-medium">Quote</th>
                  </tr>
                </thead>
                <tbody>
                  {data.perPerson.map((p) => {
                    const auffaellig = p.quote > teamAvgQuote * 1.3 && p.quote > 30;
                    return (
                      <tr key={p.name} className="border-b border-border/40">
                        <td className="py-1.5 text-foreground flex items-center gap-1.5">
                          {auffaellig && <AlertTriangle className="h-3 w-3 text-destructive" />}
                          {p.name}
                        </td>
                        <td className="py-1.5 text-right text-muted-foreground tabular-nums">{p.gesamt}</td>
                        <td className="py-1.5 text-right text-muted-foreground tabular-nums">{p.verloren}</td>
                        <td className="py-1.5 text-right tabular-nums">
                          {auffaellig ? (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                              {p.quote.toFixed(0)}%
                            </Badge>
                          ) : (
                            <span className="text-foreground font-medium">{p.quote.toFixed(0)}%</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-[10px] text-muted-foreground mt-2 italic">
                Auffällig (rot) = mehr als 30% Verlust UND deutlich über Team-Durchschnitt. Mindestens 3 Leads pro Person.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}