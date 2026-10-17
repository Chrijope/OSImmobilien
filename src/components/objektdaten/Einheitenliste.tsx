import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Calculator, Lock, Pencil, Upload } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListenImportDialog } from "@/components/objektdaten/ListenImportDialog";
import { useUser } from "@/contexts/UserContext";
import { toast } from "@/hooks/use-toast";
import { useLiveVersion } from "@/hooks/useLiveData";
import { ausInvestagon, PFLEGE_GESPERRT_HINWEIS } from "@/lib/investagonHerkunft";
import {
  GARAGEN_STATUS_TEXT, berechneGarantie, garageFuerEinheit, mietgarantieFuerObjekt,
  type EinheitGarage, type ObjektMietgarantie,
} from "@/lib/mietgarantie";
import { getMieter, updateMieter } from "@/lib/mieterStore";
import { objektMetaErgaenzen, updateWohnung, wohnungMetaErgaenzen, type ObjektData, type ObjektWohnung } from "@/lib/objekteStore";
import { aktuellerMieter, einheitZeile } from "@/lib/objektdaten";
import { listendatenFuerEinheit, listenZahl } from "@/lib/listendaten";
import { bruttoRendite, nettoRendite, renditeEingabe } from "@/lib/renditeBruttoNetto";
import { hausgeldAusPlan, wirtschaftsplanFuerObjekt } from "@/lib/wirtschaftsplanObjekt";
import { WirtschaftsplanKarte } from "@/components/objektdaten/WirtschaftsplanKarte";
import { SortKopf } from "@/components/objektdaten/sortierung";
import { useSortierung, type SortWert } from "@/lib/sortierung";
import { handlungsbedarf, potenzialMonat, type HinweisArt } from "@/lib/handlungsbedarf";
import { einheitVollstaendigkeit } from "@/lib/objektdaten";
import { getInvestments, setInvestmentNotarFields, type Investment } from "@/lib/investmentsStore";
import { ABWICKLUNG_GELD_ROLLEN, ABWICKLUNG_ROLLEN, getAbwicklungDaten, saveAbwicklungDaten, type AbwicklungDaten } from "@/lib/abwicklungStore";
import { abwicklungStufeNachziehen } from "@/lib/abwicklungStufe";
import { PIPELINE_STUFEN } from "@/lib/pipelineStufen";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { excelDatumIso } from "@/lib/excelLesen";

/*
 * Einheitenliste der Objektdaten (17.10.2026). Jede Zahl kommt aus der Einheit
 * oder dem Mietverhältnis und wird auch dort gespeichert, die Liste hat keine
 * eigenen Werte. Was Investagon liefert (Fläche, Kaufpreis, Miete, Preis der
 * Garage), ist mit Schloss gesperrt und wird in Investagon geändert
 * (Christian, 17.10.2026). Frei pflegbar sind Ist-Kaltmiete (am Mieter),
 * Garage und Mietgarantie.
 */

/** Wer Einheiten und Objekte schreiben darf, wie die Zeilensicherheit an `wohnungen` und `objekte`. */
const SCHREIBT_OBJEKTE = ["admin", "inhaber", "objektpartner"];

const eur = (n: number | null | undefined, stellen = 0) =>
  n === null || n === undefined ? "–" : n.toLocaleString("de-DE", { minimumFractionDigits: stellen, maximumFractionDigits: stellen }) + " €";
const zahl = (n: number | null | undefined, stellen = 2) =>
  n === null || n === undefined ? "–" : n.toLocaleString("de-DE", { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
const prozent = (n: number | null) =>
  n === null ? "–" : (n * 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " %";
const lesen = (s: string): number | null => {
  const t = s.trim().replace(/\s|€/g, "");
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : null;
};

function Kennzahl({ titel, wert }: { titel: string; wert: string }) {
  return (
    <Card><CardContent className="p-3">
      <div className="text-[11px] text-muted-foreground">{titel}</div>
      <div className="text-lg font-semibold tabular-nums whitespace-nowrap">{wert}</div>
    </CardContent></Card>
  );
}

function Schloss() {
  return <span title={`${PFLEGE_GESPERRT_HINWEIS} Bitte in Investagon anpassen.`}><Lock className="ml-1 inline h-3 w-3 text-muted-foreground" aria-label="in Investagon ändern" /></span>;
}

type WertArt = "zahl" | "text" | "datum";

/**
 * Ein Wert, der sich per Klick ändern lässt: Zahl, Text oder Datum. Ohne
 * `speichern` nur Anzeige, mit `gesperrt` ein Schloss (Investagon). Die
 * gestrichelte Linie zeigt, was bearbeitbar ist (Christian: „Ich sehe keine
 * Möglichkeit, wo ich die Listen bearbeiten kann“).
 */
function ZahlZelle({ wert, anzeige, speichern, gesperrt, art = "zahl" }: {
  wert: number | string | null; anzeige: string; speichern?: (v: never) => Promise<void>; gesperrt?: boolean; art?: WertArt;
}) {
  const [offen, setOffen] = useState(false);
  const [text, setText] = useState("");
  if (gesperrt) return <span className="whitespace-nowrap">{anzeige}<Schloss /></span>;
  if (!speichern) return <span className="whitespace-nowrap">{anzeige}</span>;
  if (!offen) {
    return (
      <button type="button" className="whitespace-nowrap rounded border-b border-dashed border-primary/50 px-1 hover:bg-muted" title="Zum Ändern klicken"
        onClick={() => { setText(wert === null ? "" : art === "zahl" ? String(wert).replace(".", ",") : art === "datum" ? datum(wert) : String(wert)); setOffen(true); }}>
        {anzeige}<Pencil className="ml-1 inline h-3 w-3 opacity-40" />
      </button>
    );
  }
  const fertig = async () => {
    setOffen(false);
    const neu = art === "zahl" ? lesen(text) : art === "datum" ? (excelDatumIso(text.trim()) || null) : (text.trim() || null);
    if (art === "datum" && text.trim() && !neu) { toast({ title: "Datum bitte als TT.MM.JJJJ", variant: "destructive" }); return; }
    if (neu === wert) return;
    try { await (speichern as (v: number | string | null) => Promise<void>)(neu); toast({ title: "Gespeichert" }); }
    catch (e) { toast({ title: "Nicht gespeichert", description: e instanceof Error ? e.message : undefined, variant: "destructive" }); }
  };
  return (
    <Input autoFocus inputMode={art === "zahl" ? "decimal" : "text"} value={text} placeholder={art === "datum" ? "TT.MM.JJJJ" : undefined}
      className={cn("h-7 px-1", art === "zahl" ? "w-24 text-right tabular-nums" : "w-32")}
      onChange={(e) => setText(e.target.value)} onBlur={fertig}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setOffen(false); }} />
  );
}

/*
 * Woher eine Spalte ihren Wert hat. „rechnet“: wird aus anderen Werten
 * gerechnet, nicht bearbeitbar. „investagon“: kommt bei Objekten aus
 * Investagon von dort und wird dort geändert. Alles andere ist hier pflegbar.
 */
const BERECHNET = new Set(["VK €/m²", "Brutto Ist", "Brutto", "Netto", "Ist €/m²", "Soll €/m²", "Zielmiete", "Garantie mtl.", "Garantie Laufzeit",
  "Eigentümerlast", "Überschuss mtl.", "laut Plan", "Garagen-Subv. mtl.", "Mehrertrag mtl.", "Hinweise"]);
const AUS_INVESTAGON = new Set(["Fläche m²", "Kaufpreis", "Miete Vertrieb", "KP Garage", "Hausgeld gesamt", "umlagefähig", "nicht umlagefähig", "Rücklage"]);

function GarageDialog({ einheit, garage, onClose }: { einheit: ObjektWohnung | null; garage: EinheitGarage | null; onClose: () => void }) {
  const [form, setForm] = useState({ nr: "", art: "garage", status: "frei", istMiete: "" });
  useEffect(() => {
    if (einheit) setForm({ nr: garage?.nr || "", art: garage?.art || "garage", status: garage?.status || "frei", istMiete: garage?.istMiete == null ? "" : String(garage.istMiete).replace(".", ",") });
  }, [einheit, garage]);
  if (!einheit) return null;
  const speichern = async (neu: EinheitGarage | null) => {
    try {
      await wohnungMetaErgaenzen(einheit.id, { garage: neu });
      toast({ title: neu ? "Garage gespeichert" : "Garage entfernt" });
      onClose();
    } catch (e) {
      toast({ title: "Nicht gespeichert", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Garage oder Stellplatz {einheit.weNr}</DialogTitle></DialogHeader>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <div><Label>Nummer</Label><Input value={form.nr} placeholder="G22 oder SP13" onChange={(e) => setForm((f) => ({ ...f, nr: e.target.value }))} /></div>
          <div>
            <Label>Art</Label>
            <Select value={form.art} onValueChange={(v) => setForm((f) => ({ ...f, art: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="garage">Garage</SelectItem><SelectItem value="stellplatz">Stellplatz</SelectItem></SelectContent>
            </Select>
          </div>
          <div>
            <Label>vermietet</Label>
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(GARAGEN_STATUS_TEXT).map(([k, t]) => <SelectItem key={k} value={k}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Ist-Miete im Monat (€)</Label><Input inputMode="decimal" value={form.istMiete} onChange={(e) => setForm((f) => ({ ...f, istMiete: e.target.value }))} /></div>
        </div>
        <div className="mt-4 flex justify-between">
          <Button variant="ghost" disabled={!garage} onClick={() => speichern(null)}>Keine Garage</Button>
          <Button disabled={!form.nr.trim()} onClick={() => speichern({
            nr: form.nr.trim().toUpperCase(), art: form.art as EinheitGarage["art"], status: form.status as EinheitGarage["status"], istMiete: lesen(form.istMiete),
          })}>Speichern</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MietgarantieKarte({ objekt, regel, darfSchreiben }: { objekt: ObjektData; regel: ObjektMietgarantie | null; darfSchreiben: boolean }) {
  const [form, setForm] = useState({ zielQm: "", garageAnrechnung: "", laufzeitMonate: "36", garagenSubventionMonate: "12" });
  useEffect(() => {
    setForm({
      zielQm: regel ? String(regel.zielQm).replace(".", ",") : "",
      garageAnrechnung: regel ? String(regel.garageAnrechnung).replace(".", ",") : "",
      laufzeitMonate: String(regel?.laufzeitMonate ?? 36),
      garagenSubventionMonate: String(regel?.garagenSubventionMonate ?? 12),
    });
  }, [regel]);
  const speichern = async () => {
    const zielQm = lesen(form.zielQm);
    try {
      await objektMetaErgaenzen(objekt.id, {
        mietgarantie: zielQm ? {
          zielQm, garageAnrechnung: lesen(form.garageAnrechnung) ?? 0,
          laufzeitMonate: lesen(form.laufzeitMonate) ?? 36, garagenSubventionMonate: lesen(form.garagenSubventionMonate) ?? 12,
        } : null,
      });
      toast({ title: zielQm ? "Mietgarantie gespeichert" : "Mietgarantie entfernt" });
    } catch (e) {
      toast({ title: "Nicht gespeichert", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
  };
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-2 text-sm font-semibold">Mietdifferenz-Garantie</div>
        <p className="mb-3 text-xs text-muted-foreground">
          Ist-Kaltmiete plus Garage in der Rechnung plus Garantie ergibt Zielmiete je m² mal Fläche. Eine zugeordnete Garage zählt mit dem Anrechnungsbetrag und wird im ersten Jahr auf ihn subventioniert; ein Stellplatz zählt nur mit seiner Ist-Miete. Leeres Ziel heißt: keine Garantie.
        </p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5 md:items-end">
          <div><Label>Zielmiete €/m²</Label><Input disabled={!darfSchreiben} inputMode="decimal" value={form.zielQm} onChange={(e) => setForm((f) => ({ ...f, zielQm: e.target.value }))} /></div>
          <div><Label>Garage zählt mit (€)</Label><Input disabled={!darfSchreiben} inputMode="decimal" value={form.garageAnrechnung} onChange={(e) => setForm((f) => ({ ...f, garageAnrechnung: e.target.value }))} /></div>
          <div><Label>Laufzeit (Monate)</Label><Input disabled={!darfSchreiben} inputMode="numeric" value={form.laufzeitMonate} onChange={(e) => setForm((f) => ({ ...f, laufzeitMonate: e.target.value }))} /></div>
          <div><Label>Garagen-Subvention (Monate)</Label><Input disabled={!darfSchreiben} inputMode="numeric" value={form.garagenSubventionMonate} onChange={(e) => setForm((f) => ({ ...f, garagenSubventionMonate: e.target.value }))} /></div>
          {darfSchreiben && <Button onClick={speichern}>Speichern</Button>}
        </div>
      </CardContent>
    </Card>
  );
}

type Ansicht = "handlung" | "preise" | "miete" | "hausgeld" | "garagen" | "verkauf";
const ANSICHTEN: { wert: Ansicht; titel: string }[] = [
  { wert: "handlung", titel: "Handlungsbedarf" },
  { wert: "preise", titel: "Preise & Rendite" },
  { wert: "miete", titel: "Miete & Garantie" },
  { wert: "hausgeld", titel: "Hausgeld" },
  { wert: "garagen", titel: "Garagen" },
  { wert: "verkauf", titel: "Verkaufsstand" },
];

const HINWEIS_FARBE: Record<HinweisArt, string> = {
  potenzial: "bg-emerald-50 text-emerald-800", termin: "bg-blue-50 text-blue-800", risiko: "bg-red-50 text-red-700",
  kosten: "bg-amber-50 text-amber-800", unterlagen: "bg-slate-100 text-slate-700",
};

const STUFE_TEXT = Object.fromEntries(PIPELINE_STUFEN.map((s) => [s.key, s.label])) as Record<string, string>;

/**
 * Das laufende Investment einer Einheit: der Kauf, an dem Notartermin und
 * Abwicklung hängen. Verlorene Vorgänge zählen nicht, bei mehreren der jüngste.
 * Notartermin und Abwicklung werden hier und im Kundenprofil am selben
 * Investment gelesen und geschrieben, beide Seiten sind damit immer gleich.
 */
function investmentFuerEinheit(investments: Investment[], wohnungId: string): Investment | undefined {
  return investments
    .filter((i) => i.wohnungId === wohnungId && i.pipelineStufe !== "verloren")
    .sort((a, b) => (b.erstellt_am || "").localeCompare(a.erstellt_am || ""))[0];
}

const datum = (iso: unknown) => (typeof iso === "string" && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : typeof iso === "string" && iso ? iso : "–");

export function Einheitenliste({ objekte, objektWahl }: { objekte: ObjektData[]; objektWahl: React.ReactNode }) {
  const { user } = useUser();
  // Mieter, Objekt- und Einheitenzusätze ändern sich nach dem Speichern; neu zeichnen.
  useLiveVersion(["mieter", "objekte", "wohnungen"]);
  const [garageEinheit, setGarageEinheit] = useState<ObjektWohnung | null>(null);
  const [importOffen, setImportOffen] = useState(false);
  const [ansicht, setAnsicht] = useState<Ansicht>("handlung");
  const darfSchreiben = SCHREIBT_OBJEKTE.includes(user.role);
  const mieter = getMieter();
  useLiveVersion(["investments"]);
  const investments = getInvestments();
  const darfAbwicklung = ABWICKLUNG_ROLLEN.includes(user.role);
  const darfGeld = ABWICKLUNG_GELD_ROLLEN.includes(user.role);
  const einzeln = objekte.length === 1 ? objekte[0] : null;

  /*
   * Eine Zeile je Einheit mit allen abgeleiteten Werten. Alles wird bei jedem
   * Zeichnen aus Einheit, Mieter, Listendaten und Objektregel neu gerechnet:
   * Wer einen Wert ändert, sieht sofort Rendite, Garantie und Summen neu.
   */
  const zeilen = objekte.flatMap((o) => {
    const regel = mietgarantieFuerObjekt(o.id);
    return o.wohnungen.map((w) => {
      const z = einheitZeile(w);
      const m = aktuellerMieter(mieter, w.id);
      const ist = m ? m.kaltmiete || 0 : null;
      const garage = garageFuerEinheit(w.id);
      const l = listendatenFuerEinheit(w.id);
      const garantie = regel && z.flaeche ? berechneGarantie(regel, z.flaeche, ist ?? 0, garage) : null;
      // Hausgeld: die Felder des CRM zuerst (bei Investagon von dort), sonst die Liste.
      const hg = {
        gesamt: w.hausgeldMonat ?? listenZahl(l, "hausgeldGesamt"),
        uml: w.hausgeldUmlagefaehigEuro ?? listenZahl(l, "hausgeldUmlagefaehig"),
        nichtUml: w.hausgeldNichtUmlagefaehigEuro ?? listenZahl(l, "hausgeldNichtUmlagefaehig"),
        ruecklage: w.ruecklageZufuehrungMonat ?? listenZahl(l, "ruecklage"),
      };
      const wp = wirtschaftsplanFuerObjekt(o.id);
      const hgPlan = wp ? hausgeldAusPlan(wp, listenZahl(l, "mea")) : null;
      const eingabe = renditeEingabe(o, w, z.mieteMonat ?? 0);
      if (hg.nichtUml !== null && w.hausgeldNichtUmlagefaehigEuro === undefined) { eingabe.nichtUmlagefaehigMonat = hg.nichtUml; eingabe.ruecklageMonat = hg.ruecklage ?? 0; }
      return {
        objekt: o, w, z, m, ist, garage, regel, garantie, l, hg, hgPlan, gesperrt: ausInvestagon(w),
        inv: investmentFuerEinheit(investments, w.id),
        bruttoIst: ist ? bruttoRendite(ist, z.kaufpreis ?? 0) : null,
        brutto: z.rendite,
        netto: nettoRendite(eingabe),
        knk: eingabe.kaufnebenkostenProzent,
        ...(() => {
          // Eigentümersicht: was an dieser Wohnung zu tun ist (`handlungsbedarf.ts`).
          const last = hg.nichtUml !== null || hg.ruecklage !== null ? (hg.nichtUml ?? 0) + (hg.ruecklage ?? 0) : null;
          const v = einheitVollstaendigkeit(w, l?.werte);
          const naechste = l?.werte.naechsteErhoehungAb;
          const hinweise = handlungsbedarf({
            verkauft: w.status === "verkauft", istMiete: ist, mieterGekuendigt: m?.status === "gekuendigt",
            sollMiete: listenZahl(l, "sollMiete"), mieteVertrieb: z.mieteMonat, befristetBis: m?.mietvertragEnde || "",
            naechsteErhoehungAb: typeof naechste === "string" ? naechste : "", naechsteErhoehungMiete: listenZahl(l, "naechsteErhoehungMiete"),
            eigentuemerlast: last, garageFrei: garage?.status === "frei", garantieMonat: garantie?.garantieMonat ?? null,
            fehlendeUnterlagen: v.gesamt - v.vorhanden,
          }, new Date().toISOString().slice(0, 10));
          return { last, hinweise, potenzial: potenzialMonat(hinweise) };
        })(),
      };
    });
  });
  type Zeile = (typeof zeilen)[number];
  // Sortierschlüssel je Spaltentitel; die Titel sind über alle Ansichten eindeutig.
  const SORT: Record<string, (x: Zeile) => SortWert> = {
    Objekt: (x) => x.objekt.titel, WE: (x) => x.z.weNr, Lage: (x) => [x.l?.werte.haus, x.z.lage].filter(Boolean).join(" "),
    Status: (x) => x.z.status, "Fläche m²": (x) => x.z.flaeche, MEA: (x) => listenZahl(x.l, "mea"), Kaufpreis: (x) => x.z.kaufpreis,
    "VK €/m²": (x) => x.z.kaufpreisQm, "Miete Vertrieb": (x) => x.z.mieteMonat, "Brutto Ist": (x) => x.bruttoIst, Brutto: (x) => x.brutto,
    Netto: (x) => x.netto, Mietsubvention: (x) => listenZahl(x.l, "mietsubvention"), Käufer: (x) => x.z.kaeufer,
    "Ist-Kaltmiete": (x) => x.ist, "Ist €/m²": (x) => (x.ist && x.z.flaeche ? x.ist / x.z.flaeche : null),
    Sollmiete: (x) => listenZahl(x.l, "sollMiete"), "Soll €/m²": (x) => { const s = listenZahl(x.l, "sollMiete"); return s && x.z.flaeche ? s / x.z.flaeche : null; },
    Zielmiete: (x) => x.garantie?.zielMiete, "Garantie mtl.": (x) => x.garantie?.garantieMonat, "Garantie Laufzeit": (x) => x.garantie?.summeLaufzeit,
    "laut Liste": (x) => listenZahl(x.l, "garantieLaufzeitListe"), "Letzte Erhöhung": (x) => String(x.l?.werte.letzteErhoehung ?? ""),
    "Nächste ab": (x) => String(x.l?.werte.naechsteErhoehungAb ?? ""), "Miete danach": (x) => listenZahl(x.l, "naechsteErhoehungMiete"),
    "in 3 Jahren": (x) => listenZahl(x.l, "mieteIn3Jahren"), "Hausgeld gesamt": (x) => x.hg.gesamt, umlagefähig: (x) => x.hg.uml,
    "nicht umlagefähig": (x) => x.hg.nichtUml, Rücklage: (x) => x.hg.ruecklage, Eigentümerlast: (x) => x.last,
    "Überschuss mtl.": (x) => (x.last !== null && x.z.mieteMonat ? x.z.mieteMonat - x.last : null), "laut Plan": (x) => x.hgPlan?.gesamt,
    "Garage/SP": (x) => x.garage?.nr, "KP Garage": (x) => x.w.stellplatzPreis, "Ist-Miete Garage": (x) => x.garage?.istMiete,
    "Sollmiete Garage": (x) => listenZahl(x.l, "garageSollMiete"), "Garagen-Subv. mtl.": (x) => x.garantie?.garagenSubventionMonat,
    "gekündigt zum": (x) => String(x.l?.werte.garageGekuendigtZum ?? ""),
    "Mehrertrag mtl.": (x) => x.potenzial || null, Hinweise: (x) => x.hinweise.length || null,
    Stufe: (x) => (x.inv ? STUFE_TEXT[x.inv.pipelineStufe] || x.inv.pipelineStufe : null), Notartermin: (x) => x.inv?.notarTermin,
    Fälligkeit: (x) => (x.inv ? getAbwicklungDaten(x.inv.id).kaufpreisfaelligkeitDatum : null),
    "Kaufpreis da": (x) => (x.inv ? (getAbwicklungDaten(x.inv.id).kaufpreisEingegangen ? 1 : 0) : null),
    "Grundbuch am": (x) => (x.inv ? getAbwicklungDaten(x.inv.id).grundbuchDatum : null),
    "Grundbuch erfolgt": (x) => (x.inv ? (getAbwicklungDaten(x.inv.id).grundbuchEingetragen ? 1 : 0) : null),
    Übergabe: (x) => (x.inv ? getAbwicklungDaten(x.inv.id).uebergabeDatum : null),
  };
  const sort = useSortierung<Zeile>(SORT);
  const mitGarantie = zeilen.some((x) => x.regel);
  const summe = (f: (x: Zeile) => number | null | undefined) => zeilen.reduce((s, x) => s + (f(x) ?? 0), 0);
  const kaufpreis = summe((x) => x.z.kaufpreis);
  const istMonat = summe((x) => x.ist);
  const mieteVertrieb = summe((x) => x.z.mieteMonat);
  const mehrere = objekte.length > 1;

  const wohnungSpeichern = (o: ObjektData, w: ObjektWohnung, feld: keyof ObjektWohnung) => async (n: number | null) => {
    const fehler = await updateWohnung(o.id, w.id, { [feld]: n ?? undefined } as Partial<ObjektWohnung>);
    if (fehler) throw new Error("Die Einheit darfst du nicht ändern.");
  };
  const listeSpeichern = (w: ObjektWohnung, schluessel: string) => async (n: number | null) => {
    const alt = listendatenFuerEinheit(w.id);
    const werte = { ...(alt?.werte || {}) };
    if (n === null) delete werte[schluessel]; else werte[schluessel] = n;
    await wohnungMetaErgaenzen(w.id, { listendaten: { ...alt, werte, quelle: alt?.quelle ? `${alt.quelle}, von Hand ergänzt` : "von Hand", stand: new Date().toISOString().slice(0, 10) } });
  };
  const listeTextSpeichern = (w: ObjektWohnung, schluessel: string) => async (v: string | null) => {
    const alt = listendatenFuerEinheit(w.id);
    const werte = { ...(alt?.werte || {}) };
    if (v === null) delete werte[schluessel]; else werte[schluessel] = v;
    await wohnungMetaErgaenzen(w.id, { listendaten: { ...alt, werte, quelle: alt?.quelle ? `${alt.quelle}, von Hand ergänzt` : "von Hand", stand: new Date().toISOString().slice(0, 10) } });
  };
  /** Ein Feld der Abwicklung am Investment ändern, danach dieselbe Stufenregel wie im Kundenprofil. */
  const abwicklungAendern = (inv: Investment, teil: Partial<AbwicklungDaten>) => {
    const neu = { ...getAbwicklungDaten(inv.id), ...teil };
    saveAbwicklungDaten(inv.id, neu);
    void abwicklungStufeNachziehen(inv, neu, darfGeld);
  };
  const abwicklungDatum = (inv: Investment | undefined, feld: "kaufpreisfaelligkeitDatum" | "grundbuchDatum" | "uebergabeDatum") => {
    if (!inv) return "–";
    const wert = getAbwicklungDaten(inv.id)[feld] || null;
    return <ZahlZelle art="datum" wert={wert} anzeige={datum(wert)} speichern={darfAbwicklung ? async (v: string | null) => abwicklungAendern(inv, { [feld]: v ?? undefined }) : undefined} />;
  };
  /** Text oder Datum aus den Listendaten, bearbeitbar für Rollen mit Schreibrecht. */
  const listenTextZelle = (x: Zeile, schluessel: string, art: "text" | "datum" = "text") => {
    const v = x.l?.werte[schluessel];
    const wert = typeof v === "string" ? v : null;
    return <ZahlZelle art={art} wert={wert} anzeige={art === "datum" ? datum(wert) : wert || "–"} speichern={darfSchreiben ? listeTextSpeichern(x.w, schluessel) : undefined} />;
  };
  /** Eine Zahl aus den Listendaten, bearbeitbar für Rollen mit Schreibrecht. */
  const listenZelle = (x: Zeile, schluessel: string, stellen = 2, einheit = "€") => {
    const v = listenZahl(x.l, schluessel);
    const anzeige = v === null ? "–" : einheit === "€" ? eur(v, stellen) : zahl(v, stellen);
    return <ZahlZelle wert={v} anzeige={anzeige} speichern={darfSchreiben ? listeSpeichern(x.w, schluessel) : undefined} />;
  };
  /** Hausgeld-Teil: bei Investagon gesperrt, sonst im Rechenfeld der Einheit gepflegt. */
  const hausgeldZelle = (x: Zeile, wert: number | null, feld: keyof ObjektWohnung) => (
    <ZahlZelle wert={wert} anzeige={eur(wert, 2)} gesperrt={x.gesperrt && wert !== null}
      speichern={darfSchreiben ? wohnungSpeichern(x.objekt, x.w, feld) : undefined} />
  );

  const mitInvestagon = zeilen.some((x) => x.gesperrt);
  const kopf = (titel: string, rechts = true, hinweis?: string) => {
    const zeichen = BERECHNET.has(titel) ? "rechnet" : AUS_INVESTAGON.has(titel) && mitInvestagon ? "investagon" : null;
    const erklaerung = zeichen === "rechnet" ? "Wird automatisch berechnet." : zeichen === "investagon" ? "Bei Objekten aus Investagon dort ändern." : undefined;
    return <SortKopf titel={`${titel}${zeichen === "rechnet" ? " ƒ" : zeichen === "investagon" ? " 🔒" : ""}`} schluessel={SORT[titel] ? titel : undefined}
      sort={sort} rechts={rechts} hinweis={[hinweis, erklaerung].filter(Boolean).join(" ") || undefined} />;
  };
  const r = "text-right tabular-nums whitespace-nowrap";

  return (
    <>
      <PageHeader title="Einheitenliste" subtitle="Alle Zahlen je Einheit aus den Objektdaten, mit Rendite, Mietgarantie, Hausgeld und Garagen">
        {einzeln && (darfSchreiben || user.role === "backoffice") && (
          <Button variant="outline" onClick={() => setImportOffen(true)}><Upload className="mr-2 h-4 w-4" /> Excel-Liste übernehmen</Button>
        )}
      </PageHeader>
      {objektWahl}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
        <Kennzahl titel="Einheiten" wert={String(zeilen.length)} />
        <Kennzahl titel="Fläche gesamt" wert={`${zahl(summe((x) => x.z.flaeche))} m²`} />
        <Kennzahl titel="Kaufpreise gesamt" wert={eur(kaufpreis)} />
        <Kennzahl titel="Ist-Kaltmiete im Monat" wert={eur(istMonat, 2)} />
        <Kennzahl titel="Brutto Ist" wert={prozent(kaufpreis > 0 && istMonat > 0 ? (istMonat * 12) / kaufpreis : null)} />
        <Kennzahl titel="Brutto Vertrieb" wert={prozent(kaufpreis > 0 && mieteVertrieb > 0 ? (mieteVertrieb * 12) / kaufpreis : null)} />
        <Kennzahl titel="Mehrertrag möglich im Monat" wert={eur(summe((x) => x.potenzial), 2)} />
        {mitGarantie && <Kennzahl titel="Garantie im Monat" wert={eur(summe((x) => x.garantie?.garantieMonat), 2)} />}
        {mitGarantie && <Kennzahl titel="Garantie über Laufzeit" wert={eur(summe((x) => x.garantie?.summeLaufzeit))} />}
      </div>
      {einzeln && ansicht !== "hausgeld" && <MietgarantieKarte objekt={einzeln} regel={mietgarantieFuerObjekt(einzeln.id)} darfSchreiben={darfSchreiben} />}
      {einzeln && ansicht === "hausgeld" && <WirtschaftsplanKarte objekt={einzeln} wp={wirtschaftsplanFuerObjekt(einzeln.id)} darfSchreiben={darfSchreiben} />}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {darfSchreiben
          ? <span><span className="border-b border-dashed border-primary/50 px-1">Wert<Pencil className="ml-1 inline h-3 w-3 opacity-40" /></span> anklicken und ändern</span>
          : <span>Ändern dürfen Admin, Inhaber und Objektpartner, Ist-Miete auch das Backoffice.</span>}
        <span>ƒ <Calculator className="inline h-3 w-3" /> wird automatisch berechnet</span>
        {mitInvestagon && <span>🔒 kommt aus Investagon und wird dort geändert, sonst überschreibt es der Abgleich alle 15 Minuten</span>}
      </div>
      <div className="flex flex-wrap gap-2" role="tablist">
        {ANSICHTEN.map((a) => (
          <Button key={a.wert} size="sm" variant={ansicht === a.wert ? "default" : "outline"} role="tab" aria-selected={ansicht === a.wert} onClick={() => setAnsicht(a.wert)}>{a.titel}</Button>
        ))}
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {mehrere && kopf("Objekt", false)}
                {kopf("WE", false)}
                {kopf("Lage", false)}
                {ansicht === "handlung" && <>
                  {kopf("Status", false)}
                  {kopf("Mehrertrag mtl.", true, "Was sich je Monat mehr erzielen ließe: Miete bis zum Soll, Leerstand vermieten, nächste Mieterhöhung")}
                  {kopf("Hinweise", false, "Sortiert nach Anzahl der Hinweise")}
                </>}
                {ansicht === "preise" && <>
                  {kopf("Status", false)}
                  {kopf("Fläche m²")}{kopf("MEA")}{kopf("Kaufpreis")}{kopf("VK €/m²")}
                  {kopf("Miete Vertrieb", true, "Miete, mit der der Vertrieb rechnet (bei Garantie die Zielmiete)")}
                  {kopf("Brutto Ist", true, "Ist-Kaltmiete × 12 durch Kaufpreis")}
                  {kopf("Brutto", true, "Miete Vertrieb × 12 durch Kaufpreis")}
                  {kopf("Netto", true, "(Miete Vertrieb − nicht umlagefähiges Hausgeld − Rücklage) × 12 durch (Kaufpreis plus Kaufnebenkosten)")}
                  {kopf("Mietsubvention", true, "Einmalbetrag laut Liste")}
                  {kopf("Käufer", false)}
                </>}
                {ansicht === "miete" && <>
                  {kopf("Ist-Kaltmiete")}{kopf("Ist €/m²")}{kopf("Sollmiete")}{kopf("Soll €/m²")}
                  {mitGarantie && <>{kopf("Zielmiete")}{kopf("Garantie mtl.")}{kopf("Garantie Laufzeit")}{kopf("laut Liste", true, "Garantie über die Laufzeit laut Excel, mit Mieterhöhungen")}</>}
                  {kopf("Letzte Erhöhung", false)}{kopf("Nächste ab", false)}{kopf("Miete danach")}{kopf("in 3 Jahren", true, "Erreichbare Miete in 3 Jahren laut Liste (Kappungsgrenze)")}
                </>}
                {ansicht === "hausgeld" && <>
                  {kopf("Hausgeld gesamt")}{kopf("umlagefähig")}{kopf("nicht umlagefähig")}{kopf("Rücklage")}
                  {kopf("Eigentümerlast", true, "nicht umlagefähig plus Rücklage")}{kopf("Überschuss mtl.", true, "Miete Vertrieb minus Eigentümerlast")}
                  {kopf("laut Plan", true, "Hausgeld gesamt aus dem Wirtschaftsplan über die MEA der Einheit")}
                </>}
                {ansicht === "verkauf" && <>
                  {kopf("Status", false)}{kopf("Käufer", false)}{kopf("Stufe", false)}{kopf("Notartermin", false)}
                  {kopf("Fälligkeit", false, "Kaufpreisfälligkeit")}{kopf("Kaufpreis da", false, "Kaufpreis eingegangen, setzt nur das Backoffice")}
                  {kopf("Grundbuch am", false)}{kopf("Grundbuch erfolgt", false)}{kopf("Übergabe", false)}
                </>}
                {ansicht === "garagen" && <>
                  {kopf("Garage/SP", false)}{kopf("KP Garage")}{kopf("Ist-Miete Garage")}{kopf("Sollmiete Garage")}
                  {mitGarantie && kopf("Garagen-Subv. mtl.")}{kopf("gekündigt zum", false)}
                </>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sort.sortiert(zeilen).map((x) => {
                const { objekt, w, z, m, ist, garage, regel, garantie, l, hg, gesperrt } = x;
                const soll = listenZahl(l, "sollMiete");
                const last = hg.nichtUml !== null || hg.ruecklage !== null ? (hg.nichtUml ?? 0) + (hg.ruecklage ?? 0) : null;
                return (
                  <TableRow key={w.id}>
                    {mehrere && <TableCell className="whitespace-nowrap text-xs">{objekt.titel}</TableCell>}
                    <TableCell className="whitespace-nowrap font-medium"><Link to={`/objekte/${objekt.id}/einheiten/${w.id}`} className="hover:underline">{z.weNr || "ohne Nr."}</Link></TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {l?.werte.haus ? `${l.werte.haus} · ` : ""}
                      <ZahlZelle art="text" wert={w.lage || null} anzeige={w.lage || "–"}
                        speichern={darfSchreiben ? async (v: string | null) => { const f = await updateWohnung(objekt.id, w.id, { lage: v ?? "" }); if (f) throw new Error("Die Einheit darfst du nicht ändern."); } : undefined} />
                    </TableCell>
                    {ansicht === "handlung" && <>
                      <TableCell className="whitespace-nowrap text-xs">{z.status}</TableCell>
                      <TableCell className={cn(r, x.potenzial > 0 && "font-medium text-emerald-700")}>{x.potenzial > 0 ? eur(x.potenzial, 2) : "–"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {x.hinweise.length === 0 && <span className="text-xs text-muted-foreground">nichts zu tun</span>}
                          {x.hinweise.map((h, i) => <span key={i} className={cn("rounded px-1.5 py-0.5 text-[11px]", HINWEIS_FARBE[h.art])}>{h.text}</span>)}
                        </div>
                      </TableCell>
                    </>}
                    {ansicht === "preise" && <>
                      <TableCell className="whitespace-nowrap text-xs">{z.status}</TableCell>
                      <TableCell className={r}><ZahlZelle wert={z.flaeche} anzeige={zahl(z.flaeche)} gesperrt={gesperrt} speichern={darfSchreiben ? wohnungSpeichern(objekt, w, "groesse") : undefined} /></TableCell>
                      <TableCell className={r}>{listenZelle(x, "mea", 2, "")}</TableCell>
                      <TableCell className={r}><ZahlZelle wert={z.kaufpreis} anzeige={eur(z.kaufpreis)} gesperrt={gesperrt} speichern={darfSchreiben ? wohnungSpeichern(objekt, w, "vkGesamt") : undefined} /></TableCell>
                      <TableCell className={r}>{zahl(z.kaufpreisQm)}</TableCell>
                      <TableCell className={r}><ZahlZelle wert={z.mieteMonat} anzeige={eur(z.mieteMonat, 2)} gesperrt={gesperrt} speichern={darfSchreiben ? wohnungSpeichern(objekt, w, "mieteGesamt") : undefined} /></TableCell>
                      <TableCell className={r}>{prozent(x.bruttoIst)}</TableCell>
                      <TableCell className={r}>{prozent(x.brutto)}</TableCell>
                      <TableCell className={r} title={`Kaufnebenkosten ${zahl(x.knk, 1)} %`}>{prozent(x.netto)}</TableCell>
                      <TableCell className={r}>{listenZelle(x, "mietsubvention")}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{z.kaeufer || "–"}</TableCell>
                    </>}
                    {ansicht === "miete" && <>
                      <TableCell className={r}>
                        {m ? <ZahlZelle wert={ist} anzeige={eur(ist, 2)} speichern={async (n) => updateMieter(m.id, { kaltmiete: n ?? 0 })} />
                          : <span className="text-xs text-muted-foreground" title="Ohne Mieter keine Ist-Miete. Mieter unter „Mieter & Mietverträge“ erfassen.">kein Mieter</span>}
                      </TableCell>
                      <TableCell className={r}>{ist && z.flaeche ? zahl(ist / z.flaeche) : "–"}</TableCell>
                      <TableCell className={r}>{listenZelle(x, "sollMiete")}</TableCell>
                      <TableCell className={r}>{soll && z.flaeche ? zahl(soll / z.flaeche) : "–"}</TableCell>
                      {mitGarantie && <>
                        <TableCell className={r}>{garantie ? <span title={`${zahl(regel!.zielQm)} €/m²`}>{eur(garantie.zielMiete, 2)}</span> : "–"}</TableCell>
                        <TableCell className={cn(r, garantie?.garantieMonat && "font-medium")}>{garantie ? eur(garantie.garantieMonat, 2) : "–"}</TableCell>
                        <TableCell className={r}>{garantie ? eur(garantie.summeLaufzeit) : "–"}</TableCell>
                        <TableCell className={r}>{listenZelle(x, "garantieLaufzeitListe", 0)}</TableCell>
                      </>}
                      <TableCell className="whitespace-nowrap text-xs">{listenTextZelle(x, "letzteErhoehung")}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{listenTextZelle(x, "naechsteErhoehungAb", "datum")}</TableCell>
                      <TableCell className={r}>{listenZelle(x, "naechsteErhoehungMiete")}</TableCell>
                      <TableCell className={r}>{listenZelle(x, "mieteIn3Jahren")}</TableCell>
                    </>}
                    {ansicht === "hausgeld" && <>
                      <TableCell className={r}>{hausgeldZelle(x, hg.gesamt, "hausgeldMonat")}</TableCell>
                      <TableCell className={r}>{hausgeldZelle(x, hg.uml, "hausgeldUmlagefaehigEuro")}</TableCell>
                      <TableCell className={r}>{hausgeldZelle(x, hg.nichtUml, "hausgeldNichtUmlagefaehigEuro")}</TableCell>
                      <TableCell className={r}>{hausgeldZelle(x, hg.ruecklage, "ruecklageZufuehrungMonat")}</TableCell>
                      <TableCell className={r}>{eur(last, 2)}</TableCell>
                      <TableCell className={r}>{last !== null && z.mieteMonat ? eur(z.mieteMonat - last, 2) : "–"}</TableCell>
                      <TableCell className={cn(r, x.hgPlan && hg.gesamt !== null && Math.abs(x.hgPlan.gesamt - hg.gesamt) > 0.01 && "text-amber-600 font-medium")}
                        title={x.hgPlan ? `umlagefähig ${eur(x.hgPlan.umlagefaehig, 2)}, nicht umlagefähig ${eur(x.hgPlan.nichtUmlagefaehig, 2)}, Rücklage ${eur(x.hgPlan.ruecklage, 2)}` : "Ohne Wirtschaftsplan oder MEA"}>
                        {x.hgPlan ? eur(x.hgPlan.gesamt, 2) : "–"}
                      </TableCell>
                    </>}
                    {ansicht === "verkauf" && (() => {
                      const inv = x.inv;
                      const abw = inv ? getAbwicklungDaten(inv.id) : null;
                      return <>
                        <TableCell className="whitespace-nowrap text-xs">{z.status}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{inv ? <Link to={`/kunden/${inv.kontaktId}`} className="hover:underline">{z.kaeufer || "zum Kunden"}</Link> : z.kaeufer || "–"}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{inv ? STUFE_TEXT[inv.pipelineStufe] || inv.pipelineStufe : "–"}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {inv ? <ZahlZelle art="datum" wert={inv.notarTermin || null} anzeige={datum(inv.notarTermin)}
                            speichern={darfAbwicklung ? async (v: string | null) => setInvestmentNotarFields(inv.id, { datum: v ?? "" }) : undefined} /> : "–"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{abwicklungDatum(inv, "kaufpreisfaelligkeitDatum")}</TableCell>
                        <TableCell>
                          {inv && abw ? <Checkbox checked={!!abw.kaufpreisEingegangen} disabled={!darfGeld} aria-label="Kaufpreis eingegangen"
                            onCheckedChange={(c) => abwicklungAendern(inv, { kaufpreisEingegangen: !!c, kaufpreisEingegangenDatum: c ? (abw.kaufpreisEingegangenDatum || new Date().toISOString().slice(0, 10)) : undefined })} /> : "–"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{abwicklungDatum(inv, "grundbuchDatum")}</TableCell>
                        <TableCell>
                          {inv && abw ? <Checkbox checked={!!abw.grundbuchEingetragen} disabled={!darfAbwicklung} aria-label="Grundbucheintrag erfolgt"
                            onCheckedChange={(c) => abwicklungAendern(inv, { grundbuchEingetragen: !!c, grundbuchDatum: c ? (abw.grundbuchDatum || new Date().toISOString().slice(0, 10)) : abw.grundbuchDatum })} /> : "–"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{abwicklungDatum(inv, "uebergabeDatum")}</TableCell>
                      </>;
                    })()}
                    {ansicht === "garagen" && <>
                      <TableCell className="whitespace-nowrap text-xs">
                        {darfSchreiben
                          ? <button type="button" className="rounded px-1 hover:bg-muted" onClick={() => setGarageEinheit(w)}>{garage ? `${garage.nr} · ${GARAGEN_STATUS_TEXT[garage.status]}` : <span className="text-muted-foreground">+ Garage</span>}</button>
                          : garage ? `${garage.nr} · ${GARAGEN_STATUS_TEXT[garage.status]}` : "–"}
                      </TableCell>
                      <TableCell className={r}>{w.stellplatzPreis ? <>{eur(w.stellplatzPreis)}{gesperrt && <Schloss />}</> : "–"}</TableCell>
                      <TableCell className={r}>{garage?.istMiete != null ? eur(garage.istMiete, 2) : "–"}</TableCell>
                      <TableCell className={r}>{listenZelle(x, "garageSollMiete")}</TableCell>
                      {mitGarantie && <TableCell className={r}>{garantie?.garagenSubventionMonat ? eur(garantie.garagenSubventionMonat, 2) : "–"}</TableCell>}
                      <TableCell className="whitespace-nowrap text-xs">{listenTextZelle(x, "garageGekuendigtZum", "datum")}</TableCell>
                    </>}
                  </TableRow>
                );
              })}
              {zeilen.length === 0 && (
                <TableRow><TableCell colSpan={16} className="py-8 text-center text-sm text-muted-foreground">Keine Einheiten erfasst.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Schloss: Der Wert kommt aus Investagon und wird dort geändert, sonst überschreibt ihn der nächste Abgleich. Ein Klick auf einen anderen Wert ändert ihn; Rendite, Garantie, Eigentümerlast und Summen rechnen sofort neu, auch auf der Objekt- und Einheitenseite. Die Garantie über die Laufzeit ist ohne Mieterhöhungen gerechnet; „laut Liste“ ist der Wert aus der Excel mit Erhöhungen.
      </p>
      <GarageDialog einheit={garageEinheit} garage={garageEinheit ? garageFuerEinheit(garageEinheit.id) : null} onClose={() => setGarageEinheit(null)} />
      {einzeln && <ListenImportDialog open={importOffen} onOpenChange={setImportOffen} objekt={einzeln} />}
    </>
  );
}
