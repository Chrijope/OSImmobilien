import { useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, MapPin, Users, Briefcase, Building2, Train, GraduationCap,
  Stethoscope, ShoppingCart, TrendingUp, Home, Percent, KeyRound,
  Landmark, Car, Wifi, Sparkles, Trees, ArrowLeftRight, Factory,
} from "lucide-react";
import { bruttomietrendite, scoreBadge } from "@/data/marktanalyseSeed";
import { mikrolage, immo, wirtschaft, infra } from "@/data/marktanalyseErweitert";
import { QuellenBlock } from "@/components/marktanalyse/QuellenBlock";
import { StandortCharts } from "@/components/marktanalyse/StandortCharts";
import { HerkunftBadge } from "@/components/marktanalyse/HerkunftBadge";
import { StandortKarte } from "@/components/marktanalyse/StandortKarte";
import { useMarktdaten, useStandort } from "@/lib/marktdatenStore";
import { standortHerkunft, kennzahlHerkunft, belegText, type Herkunft } from "@/lib/marktdatenHerkunft";
import { einordnen, perzentilText, kaufpreisMieteFaktor, faktorEinordnung, VERGLEICHSFELDER } from "@/lib/marktKennzahlen";

function nfmt(n: number, digits = 0) {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: digits }).format(n);
}

export default function MarktanalyseDetail() {
  const { standortId } = useParams<{ standortId: string }>();
  const navigate = useNavigate();
  // Über den gemeinsamen Bestand, damit hier dieselben Werte stehen wie in der
  // Liste. Vorher las diese Seite roh aus der Datei und zeigte den alten Stand,
  // während die Liste daneben den frisch erhobenen anzeigte.
  const { standorte } = useMarktdaten();
  const { standort: s, belege, arbeitgeber: dbArbeitgeber } = useStandort(standortId);

  if (!s) {
    return (
      <DashboardLayout>
        <div className="w-full p-6">
          <Card className="p-8 text-center">
            <p className="text-muted-foreground mb-4">Standort nicht gefunden.</p>
            <Button onClick={() => navigate("/marktanalyse")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Zurück zur Übersicht
            </Button>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const rendite = bruttomietrendite(s);
  const score = scoreBadge(s);
  const herkunft = belege.size > 0 ? "gemessen" : standortHerkunft(s.id);
  const faktor = kaufpreisMieteFaktor(s);
  const faktorInfo = faktorEinordnung(faktor);
  // Der Bodenrichtwert kommt aus dem Sync, wenn er vorliegt. Vorher zeigte die
  // Seite auch dann den gerechneten Wert an.
  const brwBeleg = belege.get("bodenrichtwert_eur_qm");
  const mik = mikrolage(s);
  const im = immo(s);
  const wi = wirtschaft(s);
  const inf = infra(s);

  // Normalisierung 0–100 für Radar
  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  const scores = [
    { dim: "Demografie", wert: clamp(50 + s.einwohner_trend_5j_pct * 8) },
    { dim: "Wirtschaft", wert: clamp((s.kaufkraftindex - 80) * 2.5) },
    { dim: "Arbeit", wert: clamp(100 - s.arbeitslosenquote_pct * 8) },
    { dim: "Rendite", wert: clamp(rendite * 18) },
    { dim: "Mikrolage", wert: clamp((mik.kitas_2km + mik.schulen_2km + mik.aerzte_2km + mik.supermaerkte_2km) * 1.6) },
    { dim: "Infrastruktur", wert: clamp(s.oepnv_score * 15 + inf.breitband_gbit_pct * 0.25 + (inf.ice_bahnhof ? 15 : 0)) },
  ];
  const pois = [
    { name: "Kitas", wert: mik.kitas_2km },
    { name: "Schulen", wert: mik.schulen_2km },
    { name: "Ärzte", wert: mik.aerzte_2km },
    { name: "Apotheken", wert: mik.apotheken_2km },
    { name: "Supermärkte", wert: mik.supermaerkte_2km },
    { name: "Gastro", wert: mik.restaurants_2km },
    { name: "ÖPNV", wert: mik.oepnv_stops_2km },
    { name: "Spielplätze", wert: mik.spielplaetze_2km },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8 pb-16">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/marktanalyse">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Übersicht
            </Link>
          </Button>
        </div>

        <PageHeader
          title={s.name}
          subtitle={`${s.bundesland} · AGS ${s.ags} · Score ${score}`}
        />

        {/* Herkunft gleich oben. Wer eine dieser Zahlen im Kundengespräch
            nennt, muss wissen, worauf sie beruht. */}
        <Card className="p-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <HerkunftBadge herkunft={herkunft} />
          <span className="text-muted-foreground">
            {herkunft === "gemessen"
              ? `Für diesen Standort liegen ${belege.size} erhobene Kennzahlen vor. Die übrigen Werte sind abgeleitet.`
              : herkunft === "kuratiert"
              ? "Die Grunddaten sind von Hand recherchierte Referenzwerte aus öffentlichen Quellen. Die Detailkennzahlen weiter unten sind rechnerisch abgeleitet."
              : "Die Werte dieses Standorts sind aus Vergleichswerten des Bundeslandes abgeleitet, nicht für diesen Ort erhoben. Als Grössenordnung brauchbar, für eine Zusage nicht."}
          </span>
        </Card>

        {/* KPI-Header */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <KpiCard label="Einwohner" value={nfmt(s.einwohner)} />
          <KpiCard label="Trend 5J" value={`${s.einwohner_trend_5j_pct >= 0 ? "+" : ""}${s.einwohner_trend_5j_pct.toFixed(1)} %`} />
          <KpiCard label="Kauf €/m²" value={nfmt(s.kaufpreis_qm_wohnung_eur)} />
          <KpiCard label="Miete €/m²" value={nfmt(s.miete_qm_eur, 2)} />
          <KpiCard label="Bruttorendite" value={`${rendite.toFixed(2)} %`} highlight />
          <KpiCard label="Kaufpreis-Miete-Faktor" value={`${faktor.toFixed(1)} ×`} />
        </div>

        {/* ============ EINORDNUNG ============
            Eine Rendite von 4,1 Prozent sagt für sich genommen nichts. Ob das
            viel ist, entscheidet der Vergleich. Genau der fehlte bisher. */}
        <Card className="p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
            <h3 className="font-semibold">Wie {s.name} im Vergleich dasteht</h3>
            <p className="text-xs text-muted-foreground">
              Gemessen an allen {standorte.length} Standorten und am Median in {s.bundesland}
            </p>
          </div>
          <div className="space-y-4">
            {VERGLEICHSFELDER.map((f) => {
              const e = einordnen(s, f.key, standorte);
              if (!e.wert) return null;
              const wertText = `${e.wert.toLocaleString("de-DE", { maximumFractionDigits: 2 })}${f.einheit ? " " + f.einheit : ""}`;
              return (
                <div key={f.key}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-1.5">
                    <span className="text-sm font-medium">{f.label}</span>
                    <span className="text-sm tabular-nums">
                      <strong>{wertText}</strong>
                      <span className="text-muted-foreground">
                        {" · "}
                        {s.bundesland} {e.medianBundesland.toLocaleString("de-DE", { maximumFractionDigits: 2 })}
                        {" · "}
                        Bund {e.medianBund.toLocaleString("de-DE", { maximumFractionDigits: 2 })}
                      </span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        e.perzentil >= 60
                          ? "bg-emerald-500"
                          : e.perzentil >= 40
                          ? "bg-amber-500"
                          : "bg-rose-500"
                      }`}
                      style={{ width: `${Math.max(2, e.perzentil)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">{perzentilText(e.perzentil)}</p>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-5 pt-4 border-t">
            Kaufpreis-Miete-Faktor {faktor.toFixed(1)} bedeutet: Die Wohnung kostet das{" "}
            {faktor.toFixed(1)}-fache einer Jahreskaltmiete. Das gilt als{" "}
            <strong className={
              faktorInfo.ton === "gut" ? "text-emerald-600" : faktorInfo.ton === "teuer" ? "text-rose-600" : ""
            }>{faktorInfo.text}</strong>. Unter 25 gilt als günstig, über 35 als teuer.
          </p>
        </Card>

        {/* ============ LAGE ============ */}
        <Card className="p-4">
          <h3 className="font-semibold mb-3">Wo {s.name} liegt</h3>
          <StandortKarte standorte={[s]} markiert={[s.id]} hoehe={280} />
        </Card>

        {/* ============ VISUAL DASHBOARD ============ */}
        <StandortCharts scores={scores} pois={pois} rendite={rendite} eigentumsquote={im.eigentumsquote_pct} />

        {/* ============ MAKROLAGE — nur Entscheidungs-Kennzahlen ============ */}
        <Section
          icon={Users}
          title="Makrolage & Demografie"
          herkunft={belege.has("einwohner") || belege.has("arbeitslosenquote_pct") ? "gemessen" : herkunft}
        >
          <TileGrid>
            <Tile icon={Users} label="Einwohner" value={nfmt(s.einwohner)} />
            <Tile icon={TrendingUp} label="Bevölkerungstrend 5J" value={`${s.einwohner_trend_5j_pct >= 0 ? "+" : ""}${s.einwohner_trend_5j_pct.toFixed(1)} %`} good={s.einwohner_trend_5j_pct >= 1} />
            <Tile icon={Percent} label="Arbeitslosenquote" value={`${s.arbeitslosenquote_pct.toFixed(1)} %`} good={s.arbeitslosenquote_pct <= 6} bad={s.arbeitslosenquote_pct >= 10} />
            <Tile icon={ShoppingCart} label="Kaufkraftindex" value={`${s.kaufkraftindex} (DE=100)`} good={s.kaufkraftindex >= 105} />
            <Tile icon={Landmark} label="BIP pro Kopf" value={`${nfmt(s.bip_pro_kopf_eur)} €`} />
            <Tile icon={GraduationCap} label="Universitätsstadt" value={s.uni_stadt ? "Ja" : "Nein"} good={s.uni_stadt} />
          </TileGrid>
          {s.highlights.length > 0 && (
            <Card className="p-4 mt-3">
              <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1"><Sparkles className="h-3 w-3" /> Highlights</div>
              <div className="flex flex-wrap gap-2">
                {s.highlights.map((h) => <Badge key={h} variant="secondary" className="text-xs">{h}</Badge>)}
              </div>
            </Card>
          )}
        </Section>

        {/* ============ MIKROLAGE — Kern-POIs ============ */}
        <Section
          icon={MapPin}
          title="Mikrolage · Umfeld im 2 km Umkreis"
          herkunft={belege.has("poi_kitas") ? "gemessen" : "modelliert"}
          hinweis={
            belege.has("poi_kitas")
              ? belegText(belege.get("poi_kitas"))
              : "Aus Einwohnerdichte und ÖPNV-Note gerechnet, nicht vor Ort gezählt."
          }
        >
          <TileGrid>
            <Tile icon={GraduationCap} label="Schulen" value={String(mik.schulen_2km)} />
            <Tile icon={Stethoscope} label="Ärzte" value={String(mik.aerzte_2km)} />
            <Tile icon={ShoppingCart} label="Supermärkte" value={String(mik.supermaerkte_2km)} />
            <Tile icon={Train} label="ÖPNV-Halte" value={String(mik.oepnv_stops_2km)} />
            <Tile icon={Trees} label="Grünflächen" value={`${mik.gruenflaechen_pct.toFixed(1)} %`} good={mik.gruenflaechen_pct >= 28} />
            <Tile icon={Train} label="ÖPNV-Score" value={`${s.oepnv_score} / 5`} good={s.oepnv_score >= 4} />
          </TileGrid>
        </Section>

        {/* ============ IMMOBILIENMARKT — Kaufen / Mieten / Rendite ============ */}
        <Section
          icon={Building2}
          title="Immobilienmarkt"
          herkunft={brwBeleg ? (kennzahlHerkunft(brwBeleg) ?? "modelliert") : "modelliert"}
          hinweis={brwBeleg ? belegText(brwBeleg) : "Aus Kaufpreis und Vergleichswerten gerechnet."}
        >
          <TileGrid>
            <Tile icon={Building2} label="Kaufpreis Wohnung" value={`${nfmt(s.kaufpreis_qm_wohnung_eur)} €/m²`} />
            <Tile
              icon={KeyRound}
              label="Bodenrichtwert"
              value={`${nfmt(brwBeleg?.wert ?? im.bodenrichtwert_eur_qm)} €/m²`}
              highlight={!!brwBeleg}
            />
            <Tile icon={Home} label="Miete Ø" value={`${s.miete_qm_eur.toFixed(2)} €/m²`} />
            <Tile icon={Percent} label="Bruttorendite" value={`${rendite.toFixed(2)} %`} good={rendite >= 4} bad={rendite < 3} highlight />
            <Tile icon={TrendingUp} label="Preistrend 5J" value={`${im.preistrend_5j_pct >= 0 ? "+" : ""}${im.preistrend_5j_pct.toFixed(1)} %`} good={im.preistrend_5j_pct >= 5} />
            <Tile icon={Percent} label="Leerstand" value={`${s.leerstand_pct.toFixed(1)} %`} good={s.leerstand_pct < 1.5} bad={s.leerstand_pct > 3} />
            <Tile icon={KeyRound} label="Angebotsknappheit" value={im.angebotsknappheit} good={im.angebotsknappheit === "hoch"} />
          </TileGrid>
        </Section>

        {/* ============ WIRTSCHAFT & ARBEITGEBER ============ */}
        <Section
          icon={Briefcase}
          title="Wirtschaft & Arbeitgeber"
          herkunft={dbArbeitgeber.length > 0 ? "gemessen" : "modelliert"}
          hinweis={
            dbArbeitgeber.length > 0
              ? `${dbArbeitgeber.length} Arbeitgeber aus der Datenbank`
              : "Hebesatz, Pendlersaldo und Gründungsquote sind gerechnet, nicht erhoben."
          }
        >
          <TileGrid>
            <Tile icon={ShoppingCart} label="Kaufkraft" value={`${nfmt(wi.kaufkraft_eur_kopf)} €/Kopf`} />
            <Tile icon={Percent} label="Gewerbesteuer" value={`${wi.gewerbesteuer_hebesatz} %`} good={wi.gewerbesteuer_hebesatz < 420} bad={wi.gewerbesteuer_hebesatz > 480} />
            <Tile icon={ArrowLeftRight} label="Pendlersaldo" value={`${wi.pendlersaldo >= 0 ? "+" : ""}${nfmt(wi.pendlersaldo)}`} good={wi.pendlersaldo > 0} />
          </TileGrid>

          <div className="grid md:grid-cols-2 gap-3 mt-3">
            <Card className="p-4">
              <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <Factory className="h-3.5 w-3.5" /> Top-Branchen
              </div>
              <div className="flex flex-wrap gap-1.5">
                {wi.top_branchen.map((b) => <Badge key={b} variant="outline" className="text-xs">{b}</Badge>)}
              </div>
            </Card>
            <Card className="p-4">
              {/* Die erhobenen Arbeitgeber schlagen die Seed-Liste. Sie wurden
                  schon bisher gesynct, aber nie gelesen. */}
              {(() => {
                const liste = dbArbeitgeber.length > 0
                  ? dbArbeitgeber.map((a) => ({
                      name: a.name,
                      branche: a.branche || "–",
                      mitarbeiter: a.mitarbeiter ?? 0,
                    }))
                  : s.top_arbeitgeber;
                return (
                  <>
                    <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                      <Briefcase className="h-3.5 w-3.5" /> Top-Arbeitgeber ({liste.length})
                    </div>
                    <ul className="space-y-1.5 text-sm">
                      {liste.map((a) => (
                        <li key={a.name} className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium truncate">{a.name}</div>
                            <div className="text-[11px] text-muted-foreground">{a.branche}</div>
                          </div>
                          {a.mitarbeiter > 0 && (
                            <span className="tabular-nums text-xs font-semibold">{nfmt(a.mitarbeiter)}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                );
              })()}
            </Card>
          </div>
        </Section>

        {/* ============ INFRASTRUKTUR — Anbindung & Digitalisierung ============ */}
        <Section
          icon={Car}
          title="Infrastruktur & Anbindung"
          herkunft="modelliert"
          hinweis="Breitband, Ladesäulen und Radwegnetz sind gerechnet, nicht erhoben."
        >
          <TileGrid>
            <Tile icon={Car} label="Nächste Autobahn" value={`${inf.autobahn_km.toFixed(1)} km`} good={inf.autobahn_km < 5} />
            <Tile icon={Train} label="ICE-Bahnhof" value={inf.ice_bahnhof ? "Ja" : "Nein"} good={inf.ice_bahnhof} />
            <Tile icon={Wifi} label="Breitband ≥ 1 Gbit/s" value={`${inf.breitband_gbit_pct} %`} good={inf.breitband_gbit_pct >= 80} bad={inf.breitband_gbit_pct < 60} />
          </TileGrid>
        </Section>

        <QuellenBlock quellenIds={s.quellen} />
      </div>
    </DashboardLayout>
  );
}

function KpiCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card className="p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${highlight ? "text-primary" : ""}`}>{value}</div>
    </Card>
  );
}

function Section({
  icon: Icon,
  title,
  herkunft,
  hinweis,
  children,
}: {
  icon: any;
  title: string;
  /** Woher die Zahlen dieses Abschnitts stammen. */
  herkunft?: Herkunft;
  hinweis?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="border-b pb-2">
        <h2 className="text-lg font-semibold flex flex-wrap items-center gap-x-2 gap-y-1">
          <Icon className="h-4 w-4 text-primary" /> {title}
          {herkunft && <HerkunftBadge herkunft={herkunft} beleg={hinweis} />}
        </h2>
      </div>
      {children}
    </section>
  );
}

function TileGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {children}
    </div>
  );
}

function Tile({ icon: Icon, label, value, good, bad, highlight }: { icon: any; label: string; value: string; good?: boolean; bad?: boolean; highlight?: boolean }) {
  const colorCls = highlight
    ? "text-primary"
    : good
    ? "text-emerald-600 dark:text-emerald-400"
    : bad
    ? "text-rose-600 dark:text-rose-400"
    : "";
  return (
    <Card className="p-3 flex flex-col gap-1 hover:border-primary/40 transition-colors">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3" /> <span className="truncate">{label}</span>
      </div>
      <div className={`text-base font-semibold tabular-nums ${colorCls}`}>{value}</div>
    </Card>
  );
}