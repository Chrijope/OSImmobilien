import { useMemo, useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Search, X, GitCompare, Filter, RefreshCw, MapPin, Sparkles, Database, Landmark, Star, LayoutGrid, Map as MapIcon, ScatterChart as ScatterIcon, ArrowDownUp } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { BUNDESLAENDER, bruttomietrendite, type Standort } from "@/data/marktanalyseSeed";
import { StandortKachel } from "@/components/marktanalyse/StandortKachel";
import { QuellenBlock } from "@/components/marktanalyse/QuellenBlock";
import { StandortKarte } from "@/components/marktanalyse/StandortKarte";
import { PreisRenditeStreuung } from "@/components/marktanalyse/PreisRenditeStreuung";
import { HerkunftBadge } from "@/components/marktanalyse/HerkunftBadge";
import { useMarktdaten, ladeMarktdaten } from "@/lib/marktdatenStore";
import { kaufpreisMieteFaktor } from "@/lib/marktKennzahlen";
import { ANZAHL_KURATIERT } from "@/lib/marktdatenHerkunft";
import { useUser } from "@/contexts/UserContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const FAV_KEY = "mi_marktanalyse_favoriten_v1";
/** Wie viele Kacheln auf einmal. 351 auf einen Schlag brachte die Seite ins Stocken. */
const SEITENGROESSE = 48;

type Sortierung =
  | "rendite_ab" | "rendite_auf"
  | "preis_auf" | "preis_ab"
  | "faktor_auf"
  | "einwohner_ab"
  | "wachstum_ab"
  | "name_auf";

const SORT_LABEL: Record<Sortierung, string> = {
  rendite_ab: "Rendite, höchste zuerst",
  rendite_auf: "Rendite, niedrigste zuerst",
  preis_auf: "Kaufpreis, günstigste zuerst",
  preis_ab: "Kaufpreis, teuerste zuerst",
  faktor_auf: "Kaufpreis-Miete-Faktor, niedrigster zuerst",
  einwohner_ab: "Einwohner, größte zuerst",
  wachstum_ab: "Bevölkerungswachstum, stärkstes zuerst",
  name_auf: "Name, A bis Z",
};

function sortiere(liste: Standort[], nach: Sortierung): Standort[] {
  const kopie = [...liste];
  switch (nach) {
    case "rendite_ab": return kopie.sort((a, b) => bruttomietrendite(b) - bruttomietrendite(a));
    case "rendite_auf": return kopie.sort((a, b) => bruttomietrendite(a) - bruttomietrendite(b));
    case "preis_auf": return kopie.sort((a, b) => a.kaufpreis_qm_wohnung_eur - b.kaufpreis_qm_wohnung_eur);
    case "preis_ab": return kopie.sort((a, b) => b.kaufpreis_qm_wohnung_eur - a.kaufpreis_qm_wohnung_eur);
    case "faktor_auf": return kopie.sort((a, b) => kaufpreisMieteFaktor(a) - kaufpreisMieteFaktor(b));
    case "einwohner_ab": return kopie.sort((a, b) => b.einwohner - a.einwohner);
    case "wachstum_ab": return kopie.sort((a, b) => b.einwohner_trend_5j_pct - a.einwohner_trend_5j_pct);
    case "name_auf": return kopie.sort((a, b) => a.name.localeCompare(b.name, "de"));
  }
}

export default function Marktanalyse() {
  const navigate = useNavigate();
  const { user } = useUser();
  const isAdmin = user.role === "admin" || user.role === "inhaber";
  const [syncing, setSyncing] = useState<null | "destatis" | "osm" | "arbeitgeber" | "boris">(null);
  const [dbStatus, setDbStatus] = useState<{ standorte: number; kennzahlen: number; arbeitgeber: number; last: string | null } | null>(null);
  // Seed und Datenbank werden nicht mehr hier zusammengeführt, sondern in
  // marktdatenStore. Vorher las nur diese Seite die Datenbank, Detailseite und
  // Vergleich zeigten daneben weiter die Werte aus der Datei.
  const { standorte: standorteMerged, belege, geladen } = useMarktdaten();
  const ausDbUeberlagert = belege.size;

  const loadDbStatus = async () => {
    if (!isAdmin) return;
    const [a, b, c, d] = await Promise.all([
      supabase.from("standorte").select("id", { count: "exact", head: true }),
      supabase.from("standort_kennzahlen").select("id", { count: "exact", head: true }),
      supabase.from("standort_arbeitgeber").select("id", { count: "exact", head: true }),
      supabase.from("standorte").select("last_sync_at").order("last_sync_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
    ]);
    setDbStatus({
      standorte: a.count ?? 0,
      kennzahlen: b.count ?? 0,
      arbeitgeber: c.count ?? 0,
      last: (d.data as any)?.last_sync_at ?? null,
    });
  };

  useEffect(() => { loadDbStatus(); }, [isAdmin]);

  type SyncFn = "sync-destatis" | "sync-osm-mikrolage" | "enrich-arbeitgeber" | "sync-boris";
  const runSync = async (fn: SyncFn) => {
    const key = fn === "sync-destatis" ? "destatis"
      : fn === "sync-osm-mikrolage" ? "osm"
      : fn === "sync-boris" ? "boris"
      : "arbeitgeber";
    setSyncing(key as any);
    try {
      const { data, error } = await supabase.functions.invoke(fn, { body: { limit: 60 } });
      if (error) throw error;
      const parts: string[] = [];
      if (data?.standorte_upserted ?? data?.standorte) parts.push(`${data.standorte_upserted ?? data.standorte} Standorte`);
      if (data?.kennzahlen_upserted ?? data?.kennzahlen) parts.push(`${data.kennzahlen_upserted ?? data.kennzahlen} Kennzahlen`);
      if (data?.arbeitgeber_upserted) parts.push(`${data.arbeitgeber_upserted} Arbeitgeber`);
      if (data?.wfs_erfolg != null) parts.push(`${data.wfs_erfolg} WFS · ${data.heuristik} Heuristik`);
      toast.success(`${fn}: ${parts.join(" · ") || "OK"}`);
      if (data?.errors?.length) console.warn(fn, "Fehler:", data.errors);
      loadDbStatus();
      void ladeMarktdaten(true);
    } catch (e: any) {
      toast.error(`${fn} fehlgeschlagen: ${e?.message ?? e}`);
    } finally {
      setSyncing(null);
    }
  };

  const [query, setQuery] = useState("");
  const [bl, setBl] = useState<string[]>([]);
  const [minRendite, setMinRendite] = useState(0);
  const [maxAlq, setMaxAlq] = useState(15);
  const [minKki, setMinKki] = useState(80);
  const [preisRange, setPreisRange] = useState<[number, number]>([1500, 12000]);
  const [selected, setSelected] = useState<string[]>([]);
  const [favoriten, setFavoriten] = useState<string[]>([]);
  const [zeigeFilter, setZeigeFilter] = useState(false);
  const [nurFavoriten, setNurFavoriten] = useState(false);
  const [sortierung, setSortierung] = useState<Sortierung>("rendite_ab");
  const [ansicht, setAnsicht] = useState<"kacheln" | "karte" | "streuung">("kacheln");
  const [sichtbar, setSichtbar] = useState(SEITENGROESSE);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FAV_KEY);
      if (raw) setFavoriten(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(favoriten));
    } catch {}
  }, [favoriten]);

  const gefiltert = useMemo(() => {
    const q = query.trim().toLowerCase();
    const treffer = standorteMerged.filter((s) => {
      if (q && !s.name.toLowerCase().includes(q) && !s.bundesland.toLowerCase().includes(q)) return false;
      if (bl.length && !bl.includes(s.bundesland)) return false;
      // Der Favoritenstern war bisher reine Zierde: gespeichert, gezählt, aber
      // ohne jede Wirkung auf die Liste.
      if (nurFavoriten && !favoriten.includes(s.id)) return false;
      if (bruttomietrendite(s) < minRendite) return false;
      if (s.arbeitslosenquote_pct > maxAlq) return false;
      if (s.kaufkraftindex < minKki) return false;
      if (s.kaufpreis_qm_wohnung_eur < preisRange[0] || s.kaufpreis_qm_wohnung_eur > preisRange[1]) return false;
      return true;
    });
    return sortiere(treffer, sortierung);
  }, [standorteMerged, query, bl, minRendite, maxAlq, minKki, preisRange, nurFavoriten, favoriten, sortierung]);

  // Bei jeder Änderung an Filter oder Sortierung wieder oben anfangen.
  useEffect(() => { setSichtbar(SEITENGROESSE); }, [query, bl, minRendite, maxAlq, minKki, preisRange, nurFavoriten, sortierung]);

  const toggleBl = (b: string) => setBl((cur) => (cur.includes(b) ? cur.filter((x) => x !== b) : [...cur, b]));
  const toggleSelected = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < 4 ? [...cur, id] : cur));
  const toggleFavorit = (id: string) =>
    setFavoriten((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const allQuellenIds = useMemo(() => Array.from(new Set(gefiltert.flatMap((s) => s.quellen))), [gefiltert]);

  const vergleichen = () => {
    if (selected.length < 2) return;
    navigate(`/marktanalyse/vergleich?ids=${selected.join(",")}`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-24">
        <PageHeader
          title="Marktanalyse"
          subtitle="Standort-Screening & Vergleich für die Kundenberatung"
        />

        {/* Score-Legende */}
        <Card className="p-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
          <span className="font-semibold text-foreground">Score-Legende:</span>
          <span className="inline-flex items-center gap-1.5">
            <Badge variant="outline" className="text-xs font-bold bg-emerald-500/15 text-emerald-700 border-emerald-500/30">A</Badge>
            <span className="text-muted-foreground">Metropole · Top-7 & Großstädte ab 500 Tsd. Einw. (o. ab 250 Tsd. mit KKI ≥ 105)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Badge variant="outline" className="text-xs font-bold bg-amber-500/15 text-amber-700 border-amber-500/30">B</Badge>
            <span className="text-muted-foreground">Speckgürtel & Mittelstadt · ab 100 Tsd. Einw. oder Kaufkraftindex ≥ 105</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Badge variant="outline" className="text-xs font-bold bg-rose-500/15 text-rose-700 border-rose-500/30">C</Badge>
            <span className="text-muted-foreground">Ländlich · Klein-/Landstädte unter 100 Tsd. Einw. mit KKI &lt; 105</span>
          </span>
          <span className="text-muted-foreground italic w-full sm:w-auto">
            Basis: Einwohner + Kaufkraftindex. Korrektor: starke Fundamentaldaten (Wachstum, ALQ) heben eine Stufe an, schwache senken sie ab.
          </span>
        </Card>

        {/* Woher die Zahlen stammen. Vorher stand alles im selben Schriftschnitt
            nebeneinander, als waere es gleichermassen erhoben. */}
        <Card className="p-3 space-y-2 text-xs">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="font-semibold text-foreground">Herkunft der Zahlen:</span>
            <span className="inline-flex items-center gap-1.5">
              <HerkunftBadge herkunft="gemessen" />
              <span className="text-muted-foreground">aus einer amtlichen Quelle, mit Stand und Beleg</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <HerkunftBadge herkunft="kuratiert" />
              <span className="text-muted-foreground">von Hand recherchierter Referenzwert ({ANZAHL_KURATIERT} Standorte)</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <HerkunftBadge herkunft="modelliert" />
              <span className="text-muted-foreground">rechnerisch aus Vergleichswerten abgeleitet</span>
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground border-t pt-2">
            Modellierte Zahlen sind als Grössenordnung gedacht. Wer einem Kunden eine konkrete Zahl
            zusagt, prüft sie vorher an der Originalquelle.
          </p>
        </Card>

        {isAdmin && (
          <Card className="p-3 space-y-2 bg-muted/40">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground mr-2">Admin-Sync:</span>
              <Button size="sm" variant="outline" disabled={syncing !== null} onClick={() => runSync("sync-destatis")}>
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncing === "destatis" ? "animate-spin" : ""}`} />
                Destatis (Einwohner + ALQ)
              </Button>
              <Button size="sm" variant="outline" disabled={syncing !== null} onClick={() => runSync("sync-osm-mikrolage")}>
                <MapPin className={`h-3.5 w-3.5 mr-1.5 ${syncing === "osm" ? "animate-spin" : ""}`} />
                OSM Mikrolage
              </Button>
              <Button size="sm" variant="outline" disabled={syncing !== null} onClick={() => runSync("sync-boris")}>
                <Landmark className={`h-3.5 w-3.5 mr-1.5 ${syncing === "boris" ? "animate-spin" : ""}`} />
                BORIS Bodenrichtwerte
              </Button>
              <Button size="sm" variant="outline" disabled={syncing !== null} onClick={() => runSync("enrich-arbeitgeber")}>
                <Sparkles className={`h-3.5 w-3.5 mr-1.5 ${syncing === "arbeitgeber" ? "animate-spin" : ""}`} />
                KI-Arbeitgeber
              </Button>
            </div>
            {ausDbUeberlagert > 0 && (
              <div className="text-[11px] text-emerald-700 flex items-center gap-1">
                <Database className="h-3 w-3" /> Erhobene Werte liegen für {ausDbUeberlagert} Standorte vor und überlagern den Seed.
              </div>
            )}
            {dbStatus && (
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground pt-1 border-t">
                <span className="flex items-center gap-1"><Database className="h-3 w-3" /> DB-Stand:</span>
                <span><b className="text-foreground">{dbStatus.standorte}</b> Standorte</span>
                <span><b className="text-foreground">{dbStatus.kennzahlen}</b> Kennzahlen</span>
                <span><b className="text-foreground">{dbStatus.arbeitgeber}</b> Arbeitgeber</span>
                {dbStatus.last && (
                  <span className="ml-auto">Letzter Sync: {new Date(dbStatus.last).toLocaleString("de-DE")}</span>
                )}
              </div>
            )}
          </Card>
        )}

        {/* Suche + Filter Toggle */}
        <Card className="p-4 space-y-4">
          <div className="flex flex-col md:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Ort oder Bundesland suchen…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button variant="outline" onClick={() => setZeigeFilter((v) => !v)}>
              <Filter className="h-4 w-4 mr-2" />
              Filter {zeigeFilter ? "ausblenden" : "einblenden"}
            </Button>
          </div>

          {/* Bundesland-Chips */}
          <div className="flex flex-wrap gap-1.5">
            {BUNDESLAENDER.map((b) => {
              const aktiv = bl.includes(b);
              return (
                <Badge
                  key={b}
                  variant={aktiv ? "default" : "outline"}
                  className="cursor-pointer hover:bg-primary/10"
                  onClick={() => toggleBl(b)}
                >
                  {b}
                  {aktiv && <X className="h-3 w-3 ml-1" />}
                </Badge>
              );
            })}
          </div>

          {zeigeFilter && (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 pt-2 border-t">
              <FilterSlider label={`Min. Bruttorendite: ${minRendite.toFixed(1)} %`} value={minRendite} min={0} max={8} step={0.1} onChange={setMinRendite} />
              <FilterSlider label={`Max. Arbeitslosenquote: ${maxAlq.toFixed(0)} %`} value={maxAlq} min={2} max={15} step={0.5} onChange={setMaxAlq} />
              <FilterSlider label={`Min. Kaufkraftindex: ${minKki}`} value={minKki} min={80} max={140} step={1} onChange={setMinKki} />
              <div>
                <div className="text-xs text-muted-foreground mb-2">Kaufpreis €/m² Wohnung: {preisRange[0]} – {preisRange[1]}</div>
                <Slider value={preisRange} min={1500} max={12000} step={100} onValueChange={(v) => setPreisRange([v[0], v[1]] as [number, number])} />
              </div>
            </div>
          )}
        </Card>

        {/* Ergebnisse */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-sm text-muted-foreground">
            {gefiltert.length} {gefiltert.length === 1 ? "Standort" : "Standorte"}
          </div>

          <Button
            size="sm"
            variant={nurFavoriten ? "default" : "outline"}
            onClick={() => setNurFavoriten((v) => !v)}
            disabled={favoriten.length === 0 && !nurFavoriten}
            className="h-8"
          >
            <Star className={`h-3.5 w-3.5 mr-1.5 ${nurFavoriten ? "fill-current" : ""}`} />
            Favoriten{favoriten.length > 0 ? ` (${favoriten.length})` : ""}
          </Button>

          <div className="flex items-center gap-1.5">
            <ArrowDownUp className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              value={sortierung}
              onChange={(e) => setSortierung(e.target.value as Sortierung)}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              {(Object.keys(SORT_LABEL) as Sortierung[]).map((k) => (
                <option key={k} value={k}>{SORT_LABEL[k]}</option>
              ))}
            </select>
          </div>

          <div className="ml-auto inline-flex rounded-lg border bg-card p-0.5 gap-0.5">
            {([
              { key: "kacheln", label: "Kacheln", Icon: LayoutGrid },
              { key: "karte", label: "Karte", Icon: MapIcon },
              { key: "streuung", label: "Preis / Rendite", Icon: ScatterIcon },
            ] as const).map(({ key, label, Icon }) => (
              <Button
                key={key}
                size="sm"
                variant={ansicht === key ? "default" : "ghost"}
                onClick={() => setAnsicht(key)}
                className="h-7 gap-1.5 text-xs"
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </Button>
            ))}
          </div>
        </div>

        {gefiltert.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground text-sm">
            Keine Standorte passen zu den Filtern.
          </Card>
        ) : ansicht === "karte" ? (
          <Card className="p-4">
            <StandortKarte standorte={gefiltert} markiert={selected} onWaehlen={toggleSelected} />
          </Card>
        ) : ansicht === "streuung" ? (
          <Card className="p-4">
            <PreisRenditeStreuung standorte={gefiltert} markiert={selected} onWaehlen={toggleSelected} />
          </Card>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {gefiltert.slice(0, sichtbar).map((s) => (
                <StandortKachel
                  key={s.id}
                  standort={s}
                  selected={selected.includes(s.id)}
                  onToggle={() => toggleSelected(s.id)}
                  favorit={favoriten.includes(s.id)}
                  onToggleFavorit={() => toggleFavorit(s.id)}
                  hatErhobeneWerte={belege.has(s.id)}
                />
              ))}
            </div>
            {gefiltert.length > sichtbar && (
              <div className="flex flex-col items-center gap-2 pt-2">
                <Button variant="outline" onClick={() => setSichtbar((n) => n + SEITENGROESSE)}>
                  Weitere {Math.min(SEITENGROESSE, gefiltert.length - sichtbar)} Standorte anzeigen
                </Button>
                <span className="text-[11px] text-muted-foreground">
                  {sichtbar} von {gefiltert.length} angezeigt
                </span>
              </div>
            )}
          </>
        )}

        <QuellenBlock quellenIds={allQuellenIds} />
      </div>

      {/* Sticky Vergleichs-Footer */}
      {selected.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-background border shadow-lg rounded-full px-4 py-2 flex items-center gap-3">
          <span className="text-sm font-medium">{selected.length} / 4 ausgewählt</span>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
            <X className="h-4 w-4" />
          </Button>
          <Button size="sm" disabled={selected.length < 2} onClick={vergleichen}>
            <GitCompare className="h-4 w-4 mr-1" />
            Vergleichen
          </Button>
        </div>
      )}
    </DashboardLayout>
  );
}

function FilterSlider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-2">{label}</div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} />
    </div>
  );
}