import React, { useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { bruttomietrendite, scoreBadge, type Standort } from "@/data/marktanalyseSeed";
import { mikrolage, immo, wirtschaft, infra } from "@/data/marktanalyseErweitert";
import { QuellenBlock } from "@/components/marktanalyse/QuellenBlock";
import { HerkunftBadge } from "@/components/marktanalyse/HerkunftBadge";
import { StandortKarte } from "@/components/marktanalyse/StandortKarte";
import { useMarktdaten } from "@/lib/marktdatenStore";
import { standortHerkunft } from "@/lib/marktdatenHerkunft";
import { normiert, VERGLEICHSFELDER } from "@/lib/marktKennzahlen";
import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend, Tooltip,
} from "recharts";

/** Farben für die überlagerten Profile. Bewusst gut unterscheidbar. */
const PROFIL_FARBEN = ["#187F58", "#059669", "#D97706", "#DC2626"];

function nfmt(n: number, digits = 0) {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: digits }).format(n);
}

interface Zeile {
  label: string;
  values: (string | number)[];
  raw: number[];
  best: "high" | "low";
  format?: (v: number) => string;
}

interface Gruppe { titel: string; zeilen: Zeile[]; }

export default function MarktanalyseVergleich() {
  const [params] = useSearchParams();
  const ids = (params.get("ids") || "").split(",").filter(Boolean);
  // Über den gemeinsamen Bestand, damit hier dieselben Werte stehen wie in der
  // Liste und auf der Detailseite.
  const { standorte: alleStandorte } = useMarktdaten();
  const standorte = useMemo(
    () => ids.map((id) => alleStandorte.find((s) => s.id === id)).filter(Boolean) as Standort[],
    [ids, alleStandorte],
  );

  if (standorte.length < 2) {
    return (
      <DashboardLayout>
        <div className="w-full p-6">
          <Card className="p-8 text-center">
            <p className="text-muted-foreground mb-4">Bitte mindestens 2 Standorte zum Vergleich auswählen.</p>
            <Button asChild><Link to="/marktanalyse"><ArrowLeft className="h-4 w-4 mr-2" />Zur Übersicht</Link></Button>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const mik = standorte.map(mikrolage);
  const im = standorte.map(immo);
  const wi = standorte.map(wirtschaft);
  const inf = standorte.map(infra);

  const num = (fn: (i: number) => number, fmt: (v: number) => string, label: string, best: "high" | "low"): Zeile => {
    const raw = standorte.map((_, i) => fn(i));
    return { label, raw, values: raw.map(fmt), best };
  };
  const bool = (fn: (i: number) => boolean, label: string, best: "high" | "low" = "high"): Zeile => {
    const raw = standorte.map((_, i) => (fn(i) ? 1 : 0));
    return { label, raw, values: raw.map((v) => (v ? "Ja" : "Nein")), best };
  };

  const gruppen: Gruppe[] = [
    {
      titel: "Makrolage & Demografie",
      zeilen: [
        num((i) => standorte[i].einwohner, (v) => nfmt(v), "Einwohner", "high"),
        num((i) => standorte[i].einwohner_trend_5j_pct, (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)} %`, "Bevölkerungstrend 5J", "high"),
        num((i) => standorte[i].arbeitslosenquote_pct, (v) => `${v.toFixed(1)} %`, "Arbeitslosenquote", "low"),
        num((i) => standorte[i].kaufkraftindex, (v) => String(v), "Kaufkraftindex", "high"),
        num((i) => standorte[i].bip_pro_kopf_eur, (v) => `${nfmt(v)} €`, "BIP pro Kopf", "high"),
        bool((i) => standorte[i].uni_stadt, "Universitätsstadt"),
      ],
    },
    {
      titel: "Mikrolage · POIs (2 km)",
      zeilen: [
        num((i) => mik[i].kitas_2km, (v) => String(v), "Kitas", "high"),
        num((i) => mik[i].schulen_2km, (v) => String(v), "Schulen", "high"),
        num((i) => mik[i].aerzte_2km, (v) => String(v), "Ärzte", "high"),
        num((i) => mik[i].apotheken_2km, (v) => String(v), "Apotheken", "high"),
        num((i) => mik[i].supermaerkte_2km, (v) => String(v), "Supermärkte", "high"),
        num((i) => mik[i].restaurants_2km, (v) => String(v), "Gastronomie", "high"),
        num((i) => mik[i].oepnv_stops_2km, (v) => String(v), "ÖPNV-Halte", "high"),
        num((i) => mik[i].spielplaetze_2km, (v) => String(v), "Spielplätze", "high"),
        num((i) => mik[i].gruenflaechen_pct, (v) => `${v.toFixed(1)} %`, "Grünflächen", "high"),
        num((i) => mik[i].laerm_index, (v) => `${v} / 5`, "Lärm-Index", "low"),
        num((i) => standorte[i].oepnv_score, (v) => `${v} / 5`, "ÖPNV-Score", "high"),
      ],
    },
    {
      titel: "Immobilienmarkt",
      zeilen: [
        num((i) => standorte[i].kaufpreis_qm_wohnung_eur, (v) => nfmt(v), "Kauf €/m² Wohnung", "low"),
        num((i) => standorte[i].kaufpreis_qm_haus_eur, (v) => nfmt(v), "Kauf €/m² Haus", "low"),
        num((i) => im[i].bodenrichtwert_eur_qm, (v) => nfmt(v), "Bodenrichtwert €/m²", "low"),
        num((i) => standorte[i].miete_qm_eur, (v) => v.toFixed(2), "Miete €/m² Ø", "high"),
        num((i) => im[i].miete_min_eur, (v) => v.toFixed(1), "Miete min €/m²", "high"),
        num((i) => im[i].miete_max_eur, (v) => v.toFixed(1), "Miete max €/m²", "high"),
        num((i) => bruttomietrendite(standorte[i]), (v) => `${v.toFixed(2)} %`, "Bruttomietrendite", "high"),
        num((i) => im[i].preistrend_5j_pct, (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)} %`, "Preistrend 5J", "high"),
        num((i) => standorte[i].leerstand_pct, (v) => `${v.toFixed(1)} %`, "Leerstand", "low"),
        num((i) => im[i].neubauquote_pct, (v) => `${v.toFixed(2)} %`, "Neubauquote", "high"),
        num((i) => im[i].wohnungsgroesse_avg_qm, (v) => `${v} m²`, "Ø Wohnungsgröße", "high"),
        num((i) => im[i].eigentumsquote_pct, (v) => `${v} %`, "Eigentumsquote", "high"),
      ],
    },
    {
      titel: "Wirtschaft & Arbeitgeber",
      zeilen: [
        num((i) => wi[i].kaufkraft_eur_kopf, (v) => `${nfmt(v)} €`, "Kaufkraft €/Kopf", "high"),
        num((i) => wi[i].gewerbesteuer_hebesatz, (v) => `${v} %`, "Gewerbesteuer-Hebesatz", "low"),
        num((i) => wi[i].gruendungsquote_pro_1000, (v) => v.toFixed(1), "Gründungen / 1.000 EW", "high"),
        num((i) => wi[i].pendlersaldo, (v) => `${v >= 0 ? "+" : ""}${nfmt(v)}`, "Pendlersaldo", "high"),
        num((i) => wi[i].einzelhandel_umsatz_index, (v) => String(v), "Einzelhandel-Index", "high"),
        num((i) => standorte[i].top_arbeitgeber.length, (v) => String(v), "Top-Arbeitgeber (Anzahl)", "high"),
      ],
    },
    {
      titel: "Infrastruktur",
      zeilen: [
        num((i) => inf[i].autobahn_km, (v) => `${v.toFixed(1)} km`, "Nächste Autobahn", "low"),
        bool((i) => inf[i].ice_bahnhof, "ICE-Bahnhof"),
        num((i) => inf[i].flughafen_km, (v) => `${v} km`, "Nächster Flughafen", "low"),
        num((i) => inf[i].breitband_gbit_pct, (v) => `${v} %`, "Breitband ≥ 1 Gbit/s", "high"),
        num((i) => inf[i].ladesaeulen_pro_1000, (v) => v.toFixed(1), "Ladesäulen / 1.000 EW", "high"),
        num((i) => inf[i].radweg_km, (v) => `${v} km`, "Radwege", "high"),
      ],
    },
  ];

  const allQuellen = Array.from(new Set(standorte.flatMap((s) => s.quellen)));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/marktanalyse"><ArrowLeft className="h-4 w-4 mr-1" />Übersicht</Link>
        </Button>

        <PageHeader
          title={`Vergleich · ${standorte.length} Standorte`}
          subtitle={standorte.map((s) => s.name).join(" · ")}
        />

        {/* Profilvergleich als Überlagerung. Eine Tabelle mit 41 Zeilen
            beantwortet die Frage "welcher passt besser" nicht; ein Netz aus
            acht Dimensionen tut es auf einen Blick. Die Tabelle darunter
            bleibt für die Einzelheiten. */}
        <div className="grid lg:grid-cols-2 gap-4">
          <Card className="p-4">
            <h3 className="font-semibold mb-1">Profile im Vergleich</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Jede Achse ist auf alle {alleStandorte.length} Standorte normiert, 100 ist der beste
              Wert im Feld. Bei Kennzahlen, bei denen weniger besser ist, ist die Skala gedreht.
            </p>
            <ResponsiveContainer width="100%" height={340}>
              <RadarChart
                data={VERGLEICHSFELDER.map((f) => {
                  const zeile: Record<string, string | number> = { dimension: f.label };
                  standorte.forEach((s) => {
                    zeile[s.name] = normiert(s, f.key, alleStandorte);
                  });
                  return zeile;
                })}
              >
                <PolarGrid opacity={0.3} />
                <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 10 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {standorte.map((s, i) => (
                  <Radar
                    key={s.id}
                    name={s.name}
                    dataKey={s.name}
                    stroke={PROFIL_FARBEN[i % PROFIL_FARBEN.length]}
                    fill={PROFIL_FARBEN[i % PROFIL_FARBEN.length]}
                    fillOpacity={0.14}
                    strokeWidth={2}
                  />
                ))}
              </RadarChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-4">
            <h3 className="font-semibold mb-3">Lage der Standorte</h3>
            <StandortKarte standorte={standorte} markiert={ids} hoehe={340} />
          </Card>
        </div>

        {/* Herkunft je Standort, damit im Vergleich nicht ein recherchierter
            Wert gegen einen gerechneten antritt, ohne dass es jemand merkt. */}
        <Card className="p-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
          <span className="font-semibold text-foreground">Herkunft der Zahlen:</span>
          {standorte.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1.5">
              <span className="font-medium">{s.name}</span>
              <HerkunftBadge herkunft={standortHerkunft(s.id)} />
            </span>
          ))}
        </Card>

        <Card className="p-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background z-10">
              <tr className="border-b">
                <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground uppercase min-w-[180px]">Kennzahl</th>
                {standorte.map((s) => (
                  <th key={s.id} className="text-right py-3 px-2 font-semibold min-w-[110px]">
                    <Link to={`/marktanalyse/${s.id}`} className="hover:underline">{s.name}</Link>
                    <div className="text-[10px] font-normal text-muted-foreground">{s.bundesland}</div>
                  </th>
                ))}
              </tr>
              <tr className="border-b bg-muted/40">
                <td className="py-2 px-2 text-xs text-muted-foreground font-medium">Gesamt-Score</td>
                {standorte.map((s) => <td key={s.id} className="text-right py-2 px-2 font-bold">{scoreBadge(s)}</td>)}
              </tr>
            </thead>
            <tbody>
              {gruppen.map((g) => (
                // Der key gehoerte an das Fragment, nicht an die innere Zeile.
                // React hat das bei jedem Rendern angemahnt.
                <React.Fragment key={g.titel}>
                  <tr key={g.titel} className="bg-muted/30">
                    <td colSpan={1 + standorte.length} className="py-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-primary">
                      {g.titel}
                    </td>
                  </tr>
                  {g.zeilen.map((z) => {
                    const bestVal = z.best === "high" ? Math.max(...z.raw) : Math.min(...z.raw);
                    const worstVal = z.best === "high" ? Math.min(...z.raw) : Math.max(...z.raw);
                    return (
                      <tr key={g.titel + z.label} className="border-b last:border-0">
                        <td className="py-1.5 px-2 text-muted-foreground text-xs">{z.label}</td>
                        {z.raw.map((val, i) => {
                          const cls =
                            val === bestVal && bestVal !== worstVal ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold" :
                            val === worstVal && bestVal !== worstVal ? "bg-rose-500/10 text-rose-700 dark:text-rose-400" : "";
                          return (
                            <td key={i} className={`text-right py-1.5 px-2 tabular-nums text-xs ${cls}`}>{z.values[i]}</td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </Card>

        <QuellenBlock quellenIds={allQuellen} />
      </div>
    </DashboardLayout>
  );
}