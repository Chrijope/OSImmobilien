import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Calculator, FileDown, FileSpreadsheet, Lock, Pencil, Upload } from "lucide-react";
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
  GARAGEN_STATUS_TEXT, berechneGarantie, einmalAnteil, garageFuerEinheit, mietgarantieFuerObjekt,
  type EinheitGarage, type ObjektMietgarantie, type SubventionsArt,
} from "@/lib/mietgarantie";
import { getMieter, updateMieter } from "@/lib/mieterStore";
import { objektMetaErgaenzen, updateWohnung, wohnungMetaErgaenzen, type ObjektData, type ObjektWohnung } from "@/lib/objekteStore";
import { aktuellerMieter, einheitZeile } from "@/lib/objektdaten";
import { listendatenFuerEinheit, listenZahl } from "@/lib/listendaten";
import { bruttoRendite, nettoRendite, renditeEingabe } from "@/lib/renditeBruttoNetto";
import { hausgeldAusPlan, wirtschaftsplanFuerObjekt } from "@/lib/wirtschaftsplanObjekt";
import { WirtschaftsplanKarte } from "@/components/objektdaten/WirtschaftsplanKarte";
import { SortKopf } from "@/components/objektdaten/sortierung";
import { SPALTEN, spaltenName } from "@/lib/objektdatenSpalten";
import { zahlAus } from "@/lib/objektdatenFormular";
import { abverkauf, aufteilungFuerObjekt, kalkulationenLaden, kaufpreisEingaenge, margeJeEinheit, type ObjektKalkulation } from "@/lib/projektObjekt";
import { ProjektKarte } from "@/components/objektdaten/ProjektKarte";
import { useSortierung, type SortWert } from "@/lib/sortierung";
import { handlungsbedarf, potenzialMonat, type HinweisArt } from "@/lib/handlungsbedarf";
import { einheitVollstaendigkeit } from "@/lib/objektdaten";
import { getInvestments, setInvestmentNotarFields, type Investment } from "@/lib/investmentsStore";
import { ABWICKLUNG_GELD_ROLLEN, ABWICKLUNG_ROLLEN, getAbwicklungDaten, saveAbwicklungDaten, type AbwicklungDaten } from "@/lib/abwicklungStore";
import { abwicklungStufeNachziehen } from "@/lib/abwicklungStufe";
import { PIPELINE_STUFEN } from "@/lib/pipelineStufen";
import { erhoehungsRegelAusMeta, naechsteErhoehung, type ErhoehungsRegel } from "@/lib/mieterhoehung";
import { bundeslandFromPlz } from "@/lib/kaufnebenkosten";
import { KOSTEN_ZEILEN, kostenJahr } from "@/lib/kostenJahr";
import { fristenSammeln, type Frist } from "@/lib/fristenObjekt";
import { tabelleAlsPdf, tabelleAlsXlsx, type ExportTabelle } from "@/lib/tabelleExport";
import { dateiHerunterladen } from "@/lib/kaufpreislisteExport";
import { objektseiteFelder } from "@/lib/objektseiteDaten";
import { cacheGet } from "@/lib/dataCache";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { excelDatumIso } from "@/lib/excelLesen";
import { garagenUnterlagenFuer, garagenUnterlagenHerunterladen, versendetAm } from "@/lib/garagenUnterlagenVersand";

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
const FINANZIERUNG_TEXT: Record<string, string> = { offen: "offen", bestaetigt: "bestätigt", abgelehnt: "abgelehnt" };

const eur = (n: number | null | undefined, stellen = 0) =>
  n === null || n === undefined ? "–" : n.toLocaleString("de-DE", { minimumFractionDigits: stellen, maximumFractionDigits: stellen }) + " €";
const zahl = (n: number | null | undefined, stellen = 2) =>
  n === null || n === undefined ? "–" : n.toLocaleString("de-DE", { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
const prozent = (n: number | null) =>
  n === null ? "–" : (n * 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " %";
// Deutsche Eingabe, auch „250.000“ ohne Komma.
const lesen = zahlAus;

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
  "Eigentümerlast", "Überschuss mtl.", "laut Plan", "Garagen-Subv. mtl.", "Mehrertrag mtl.", "Hinweise", "Einmalanteil",
  "Erhöhung ab", "neue Miete", "+ mtl.", "Grenze"]);
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

const ART_TEXT: Record<SubventionsArt, string> = {
  ziel: "Zielmiete je m² (Differenz zur Ist-Miete monatlich)",
  steigerung: "Steigerung der Ist-Miete in % (Kappungsgrenze)",
  einmal: "Einmalbetrag für das Objekt, verteilt nach Kaufpreis",
};

/**
 * Die Mietsubvention eines Objekts (17.10.2026): eine der drei Arten aus
 * `mietgarantie.ts`, mit den Feldern, die die Art braucht. Ersetzt das frühere
 * Werkzeug „Mietsubvention“ und die Excel-Rechnungen je Objekt.
 */
function MietgarantieKarte({ objekt, regel, darfSchreiben }: { objekt: ObjektData; regel: ObjektMietgarantie | null; darfSchreiben: boolean }) {
  const leer = { art: "ziel" as SubventionsArt, zielQm: "", steigerung: "", einmalBetrag: "", garageAnrechnung: "", laufzeitMonate: "36", garagenSubventionMonate: "12" };
  const [form, setForm] = useState(leer);
  const alsText = (n: number | undefined) => (n ? String(n).replace(".", ",") : "");
  useEffect(() => {
    setForm(regel ? {
      art: regel.art, zielQm: alsText(regel.zielQm), steigerung: alsText(regel.steigerung ? Math.round(regel.steigerung * 10000) / 100 : 0),
      einmalBetrag: alsText(regel.einmalBetrag), garageAnrechnung: alsText(regel.garageAnrechnung),
      laufzeitMonate: String(regel.laufzeitMonate), garagenSubventionMonate: String(regel.garagenSubventionMonate),
    } : leer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regel]);
  const setze = (teil: Partial<typeof leer>) => setForm((f) => ({ ...f, ...teil }));
  const speichern = async (entfernen = false) => {
    const regelNeu = entfernen ? null : {
      art: form.art, zielQm: lesen(form.zielQm) ?? 0, steigerung: (lesen(form.steigerung) ?? 0) / 100, einmalBetrag: lesen(form.einmalBetrag) ?? 0,
      garageAnrechnung: lesen(form.garageAnrechnung) ?? 0, laufzeitMonate: lesen(form.laufzeitMonate) ?? 36, garagenSubventionMonate: lesen(form.garagenSubventionMonate) ?? 12,
    };
    try {
      await objektMetaErgaenzen(objekt.id, { mietgarantie: regelNeu });
      toast({ title: regelNeu ? "Mietsubvention gespeichert" : "Mietsubvention entfernt" });
    } catch (e) {
      toast({ title: "Nicht gespeichert", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
  };
  const feld = (label: string, k: keyof typeof leer, modus: "decimal" | "numeric" = "decimal") => (
    <div><Label>{label}</Label><Input disabled={!darfSchreiben} inputMode={modus} value={form[k] as string} onChange={(e) => setze({ [k]: e.target.value })} /></div>
  );
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-2 text-sm font-semibold">Mietsubvention</div>
        <p className="mb-3 text-xs text-muted-foreground">
          {form.art === "ziel" && "Ist-Kaltmiete plus Garage in der Rechnung plus Subvention ergibt Zielmiete je m² mal Fläche. Eine zugeordnete Garage zählt mit dem Anrechnungsbetrag und wird im ersten Jahr auf ihn subventioniert; ein Stellplatz zählt nur mit seiner Ist-Miete."}
          {form.art === "steigerung" && "Sollmiete = Ist-Kaltmiete plus Steigerung (Kappungsgrenze: Umland 20 %, Berlin 15 %). Die Differenz zahlen wir über die Laufzeit."}
          {form.art === "einmal" && "Ein Betrag für das ganze Objekt, verteilt auf die Einheiten nach ihrem Anteil an den Kaufpreisen."}
        </p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6 md:items-end">
          <div className="col-span-2">
            <Label>Art</Label>
            <Select value={form.art} onValueChange={(v) => setze({ art: v as SubventionsArt })} disabled={!darfSchreiben}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(ART_TEXT) as SubventionsArt[]).map((a) => <SelectItem key={a} value={a}>{ART_TEXT[a]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {form.art === "ziel" && <>{feld("Zielmiete €/m²", "zielQm")}{feld("Garage zählt mit (€)", "garageAnrechnung")}</>}
          {form.art === "steigerung" && feld("Steigerung in %", "steigerung")}
          {form.art === "einmal" && feld("Betrag gesamt (€)", "einmalBetrag")}
          {form.art !== "einmal" && feld("Laufzeit (Monate)", "laufzeitMonate", "numeric")}
          {form.art === "ziel" && feld("Garagen-Subvention (Monate)", "garagenSubventionMonate", "numeric")}
        </div>
        {darfSchreiben && (
          <div className="mt-3 flex gap-2">
            <Button onClick={() => speichern()}>Speichern</Button>
            {regel && <Button variant="ghost" onClick={() => speichern(true)}>Keine Subvention</Button>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Kappungsgrenze und Vergleichsmiete eines Objekts für den Mieterhöhungsplaner (`objekte.meta.mieterhoehung`). */
function ErhoehungsKarte({ objekt, regel, darfSchreiben }: { objekt: ObjektData; regel: ErhoehungsRegel; darfSchreiben: boolean }) {
  const [kappung, setKappung] = useState("");
  const [vergleich, setVergleich] = useState("");
  useEffect(() => {
    setKappung(String(Math.round(regel.kappungsgrenze * 1000) / 10).replace(".", ","));
    setVergleich(regel.vergleichsmieteQm ? String(regel.vergleichsmieteQm).replace(".", ",") : "");
  }, [regel.kappungsgrenze, regel.vergleichsmieteQm]);
  const speichern = async () => {
    try {
      await objektMetaErgaenzen(objekt.id, { mieterhoehung: { kappungsgrenze: (lesen(kappung) ?? 20) / 100, vergleichsmieteQm: lesen(vergleich) } });
      toast({ title: "Mieterhöhungsplaner gespeichert" });
    } catch (e) {
      toast({ title: "Nicht gespeichert", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
  };
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-2 text-sm font-semibold">Mieterhöhungsplaner</div>
        <p className="mb-3 text-xs text-muted-foreground">
          Nach § 558 BGB: frühestens 15 Monate nach Mietbeginn oder letzter Erhöhung und ab dem dritten Monat nach Zugang des Schreibens (Versand heute angenommen); höchstens die Kappungsgrenze auf die Miete von vor drei Jahren und höchstens die ortsübliche Vergleichsmiete. Eine Planung, keine Rechtsberatung.
        </p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:items-end">
          <div><Label>Kappungsgrenze in %</Label><Input disabled={!darfSchreiben} inputMode="decimal" value={kappung} onChange={(e) => setKappung(e.target.value)} /></div>
          <div><Label>Vergleichsmiete €/m²</Label><Input disabled={!darfSchreiben} inputMode="decimal" value={vergleich} placeholder="ohne Angabe nur Kappungsgrenze" onChange={(e) => setVergleich(e.target.value)} /></div>
          {darfSchreiben && <Button onClick={speichern}>Speichern</Button>}
        </div>
      </CardContent>
    </Card>
  );
}

type Ansicht = "handlung" | "preise" | "marge" | "miete" | "subvention" | "hausgeld" | "garagen" | "verkauf" | "kosten" | "fristen";
// Gruppiert nach der Frage, mit der man kommt; `zweck` steht unter den Reitern.
const ANSICHTEN: { wert: Ansicht; titel: string; gruppe: string; zweck: string }[] = [
  { wert: "handlung", titel: "Handlungsbedarf", gruppe: "Überblick", zweck: "Was an welcher Einheit zu tun ist und wie viel Miete im Monat mehr möglich wäre." },
  { wert: "preise", titel: "Preise & Rendite", gruppe: "Verkauf", zweck: "Kaufpreise, Exposé-Miete und Rendite je Einheit, so wie der Vertrieb sie anbietet." },
  { wert: "marge", titel: "Marge & Abverkauf", gruppe: "Verkauf", zweck: "Was jede Einheit nach Ankauf, Aufteilung und Provision einbringt, wie weit der Abverkauf ist und wann Kaufpreise kommen." },
  { wert: "verkauf", titel: "Verkaufsstand", gruppe: "Verkauf", zweck: "Wer welche Einheit gekauft hat und wie weit Notar, Kaufpreis, Grundbuch und Übergabe sind." },
  { wert: "fristen", titel: "Fristen", gruppe: "Verkauf", zweck: "Alle Termine aus Verkauf, Vermietung und Subvention in einer Liste, nach Datum." },
  { wert: "miete", titel: "Miete & Erhöhungen", gruppe: "Vermietung", zweck: "Ist- und Sollmiete, wann die nächste Mieterhöhung möglich ist und wie hoch." },
  { wert: "subvention", titel: "Mietsubvention", gruppe: "Vermietung", zweck: "Was wir je Einheit an Mietsubvention zahlen, im Monat und über die Laufzeit." },
  { wert: "garagen", titel: "Garagen", gruppe: "Vermietung", zweck: "Garagen und Stellplätze je Einheit: Kaufpreis, Miete, Subvention, Unterlagen an den Käufer." },
  { wert: "hausgeld", titel: "Hausgeld", gruppe: "Bewirtschaftung", zweck: "Hausgeld je Einheit, was der Eigentümer davon trägt und was nach Kosten übrig bleibt." },
  { wert: "kosten", titel: "Kosten je Jahr", gruppe: "Bewirtschaftung", zweck: "Einnahmen und Ausgaben je Monat, solange die Einheiten uns gehören, und unsere Subventionen danach." },
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
  const [jahr, setJahr] = useState(new Date().getFullYear());
  const [nurKommende, setNurKommende] = useState(true);
  type FristZeile = Frist & { objekt: string };
  const fristSort = useSortierung<FristZeile>({ datum: (f) => f.datum, art: (f) => f.art, objekt: (f) => f.objekt, einheit: (f) => f.einheit });
  const darfSchreiben = SCHREIBT_OBJEKTE.includes(user.role);
  const mieter = getMieter();
  useLiveVersion(["investments"]);
  const investments = getInvestments();
  const darfAbwicklung = ABWICKLUNG_ROLLEN.includes(user.role);
  const darfGeld = ABWICKLUNG_GELD_ROLLEN.includes(user.role);
  const einzeln = objekte.length === 1 ? objekte[0] : null;
  // Kalkulation (Geld) liegt gesperrt in `objekt_kalkulation`; nur die Schreibrollen laden sie.
  const [kalkulationen, setKalkulationen] = useState<Map<string, ObjektKalkulation>>(new Map());
  const [kalkStand, setKalkStand] = useState(0);
  const objektIds = objekte.map((o) => o.id).join(",");
  useEffect(() => {
    if (!darfSchreiben || !objektIds) return;
    let aktiv = true;
    kalkulationenLaden(objektIds.split(","))
      .then((m) => { if (aktiv) setKalkulationen(m); })
      .catch(() => { if (aktiv) setKalkulationen(new Map()); });
    return () => { aktiv = false; };
  }, [darfSchreiben, objektIds, kalkStand]);

  /*
   * Eine Zeile je Einheit mit allen abgeleiteten Werten. Alles wird bei jedem
   * Zeichnen aus Einheit, Mieter, Listendaten und Objektregel neu gerechnet:
   * Wer einen Wert ändert, sieht sofort Rendite, Garantie und Summen neu.
   */
  const zeilen = objekte.flatMap((o) => {
    const regel = mietgarantieFuerObjekt(o.id);
    const summeKaufpreise = o.wohnungen.reduce((s, w) => s + (w.vkGesamt || 0), 0);
    const erhRegel = erhoehungsRegelAusMeta(cacheGet("objekte").find((r: { id: string }) => r.id === o.id)?.meta, bundeslandFromPlz(o.plz));
    const projekt = aufteilungFuerObjekt(o.id);
    const margen = margeJeEinheit(kalkulationen.get(o.id) ?? {}, o.wohnungen.map((w) => ({
      id: w.id, kaufpreis: w.vkGesamt || null, mea: listenZahl(listendatenFuerEinheit(w.id), "mea"), flaeche: einheitZeile(w).flaeche,
    })));
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
      // Mieterhöhungsplaner (`mieterhoehung.ts`), für die Spalten und den Handlungsbedarf.
      const erhoehung = ist && z.flaeche ? naechsteErhoehung({
        istMiete: ist, flaeche: z.flaeche, mietbeginn: m?.mietvertragBeginn || "",
        letzteErhoehung: excelDatumIso(typeof l?.werte.letzteErhoehung === "string" ? l.werte.letzteErhoehung : ""),
        mieteVorErhoehung: listenZahl(l, "mieteVorErhoehung"),
      }, erhRegel, new Date().toISOString().slice(0, 10)) : null;
      if (hg.nichtUml !== null && w.hausgeldNichtUmlagefaehigEuro === undefined) { eingabe.nichtUmlagefaehigMonat = hg.nichtUml; eingabe.ruecklageMonat = hg.ruecklage ?? 0; }
      return {
        objekt: o, w, z, m, ist, garage, regel, garantie, l, hg, hgPlan, gesperrt: ausInvestagon(w),
        inv: investmentFuerEinheit(investments, w.id),
        projekt, marge: margen.get(w.id) ?? null,
        einmal: regel ? einmalAnteil(regel, w.vkGesamt || 0, summeKaufpreise) : 0,
        erhoehung,
        bruttoIst: ist ? bruttoRendite(ist, z.kaufpreis ?? 0) : null,
        brutto: z.rendite,
        netto: nettoRendite(eingabe),
        knk: eingabe.kaufnebenkostenProzent,
        ...(() => {
          // Eigentümersicht: was an dieser Wohnung zu tun ist (`handlungsbedarf.ts`).
          const last = hg.nichtUml !== null || hg.ruecklage !== null ? (hg.nichtUml ?? 0) + (hg.ruecklage ?? 0) : null;
          const v = einheitVollstaendigkeit(w, l?.werte);
          // Der Planer geht vor; ohne ihn (etwa ohne Ist-Miete) der Termin laut Liste.
          const planung = erhoehung;
          const naechste = planung?.plus ? planung.ab : l?.werte.naechsteErhoehungAb;
          const hinweise = handlungsbedarf({
            verkauft: w.status === "verkauft", istMiete: ist, mieterGekuendigt: m?.status === "gekuendigt",
            sollMiete: listenZahl(l, "sollMiete"), mieteVertrieb: z.mieteMonat, befristetBis: m?.mietvertragEnde || "",
            naechsteErhoehungAb: typeof naechste === "string" ? naechste : "", naechsteErhoehungMiete: planung?.plus ? planung.neueMiete : listenZahl(l, "naechsteErhoehungMiete"),
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
    "Sollmiete Garage": (x) => listenZahl(x.l, "garageSollMiete"), "Garagen-Subv. mtl.": (x) => x.garantie?.garagenSubventionMonat, Einmalanteil: (x) => x.einmal || null,
    "Miete vorher": (x) => listenZahl(x.l, "mieteVorErhoehung"), "Erhöhung ab": (x) => x.erhoehung?.ab, "neue Miete": (x) => x.erhoehung?.neueMiete,
    "+ mtl.": (x) => x.erhoehung?.plus || null, Grenze: (x) => x.erhoehung?.begrenztDurch,
    "gekündigt zum": (x) => String(x.l?.werte.garageGekuendigtZum ?? ""),
    "Unterlagen versendet": (x) => (x.inv && garagenUnterlagenFuer(x.inv) ? versendetAm(x.inv).slice(0, 10) || "offen" : null),
    "Mehrertrag mtl.": (x) => x.potenzial || null, Hinweise: (x) => x.hinweise.length || null,
    Stufe: (x) => (x.inv ? STUFE_TEXT[x.inv.pipelineStufe] || x.inv.pipelineStufe : null), Notartermin: (x) => x.inv?.notarTermin,
    Fälligkeit: (x) => (x.inv ? getAbwicklungDaten(x.inv.id).kaufpreisfaelligkeitDatum : null),
    "Kaufpreis da": (x) => (x.inv ? (getAbwicklungDaten(x.inv.id).kaufpreisEingegangen ? 1 : 0) : null),
    "Grundbuch am": (x) => (x.inv ? getAbwicklungDaten(x.inv.id).grundbuchDatum : null),
    "Grundbuch erfolgt": (x) => (x.inv ? (getAbwicklungDaten(x.inv.id).grundbuchEingetragen ? 1 : 0) : null),
    Übergabe: (x) => (x.inv ? getAbwicklungDaten(x.inv.id).uebergabeDatum : null),
    "Reserviert am": (x) => x.w.reserviertAm?.slice(0, 10), Finanzierung: (x) => (x.inv?.finanzierungsStatus ? FINANZIERUNG_TEXT[x.inv.finanzierungsStatus] : null),
    "Vorkaufsrecht mitgeteilt": (x) => String(x.l?.werte.vorkaufMitgeteilt ?? ""),
    Kostenanteil: (x) => x.marge?.kostenanteil, Provision: (x) => x.marge?.provision, Marge: (x) => x.marge?.marge, "Marge %": (x) => x.marge?.margeProzent,
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

  const fristenBerechnen = (): FristZeile[] => objekte.flatMap((o) => {
    const eigene = zeilen.filter((x) => x.objekt.id === o.id);
    const ausweis = objektseiteFelder(o).energieausweis.gueltigBis;
    return fristenSammeln(eigene.map((x) => {
      const abw = x.inv ? getAbwicklungDaten(x.inv.id) : null;
      const gek = x.l?.werte.garageGekuendigtZum;
      return {
        weNr: x.z.weNr, befristetBis: x.m?.mietvertragEnde, erhoehungAb: x.erhoehung?.ab, erhoehungPlus: x.erhoehung?.plus,
        garageGekuendigtZum: typeof gek === "string" ? gek : undefined, notartermin: x.inv?.notarTermin,
        faelligkeit: abw?.kaufpreisfaelligkeitDatum, uebergabe: abw?.uebergabeDatum,
        subventionMonate: x.regel?.art !== "einmal" && x.garantie?.garantieMonat ? x.regel?.laufzeitMonate : undefined,
        garagenSubventionMonate: x.garantie?.garagenSubventionMonat ? x.regel?.garagenSubventionMonate : undefined,
        reserviertAm: x.w.status === "reserviert" ? x.w.reserviertAm : undefined, reservierungTage: x.projekt.reservierungTage,
        vorkaufMitgeteilt: typeof x.l?.werte.vorkaufMitgeteilt === "string" ? x.l.werte.vorkaufMitgeteilt : undefined,
        // Kündigungssperre nach § 577a BGB: drei Jahre, in Berlin per Verordnung zehn (andere Orte prüfen).
        vermietet: !!x.ist, sperrfristJahre: bundeslandFromPlz(o.plz) === "berlin" ? 10 : 3,
      };
    }), ausweis ? excelDatumIso(ausweis) || (/^\d{4}$/.test(ausweis) ? `${ausweis}-12-31` : "") : "", aufteilungFuerObjekt(o.id).meilensteine?.abnahme).map((f) => ({ ...f, objekt: o.titel }));
  });
  const kostenBerechnen = () => kostenJahr(zeilen.filter((x) => x.w.status !== "verkauft" || x.inv).map((x) => ({
    istMiete: x.ist, eigentuemerlast: x.last, hausgeldGesamt: x.hg.gesamt,
    uebergabe: x.inv ? getAbwicklungDaten(x.inv.id).uebergabeDatum || "" : "",
    subventionMonat: x.regel?.art !== "einmal" ? x.garantie?.garantieMonat ?? 0 : 0, subventionMonate: x.regel?.laufzeitMonate ?? 0,
    garagenSubventionMonat: x.garantie?.garagenSubventionMonat ?? 0, garagenSubventionMonate: x.regel?.garagenSubventionMonate ?? 0,
    einmalSubvention: x.einmal,
  })), jahr);

  /** Spalten je Ansicht für den Export, in der Reihenfolge der Tabelle; die Werte liefern die Sortierschlüssel. */
  const EXPORT_SPALTEN: Record<Exclude<Ansicht, "kosten" | "fristen">, string[]> = {
    handlung: ["WE", "Lage", "Status", "Mehrertrag mtl."],
    preise: ["WE", "Lage", "Status", "Fläche m²", "MEA", "Kaufpreis", "VK €/m²", "Miete Vertrieb", "Brutto Ist", "Brutto", "Netto", "Mietsubvention", "Käufer"],
    miete: ["WE", "Lage", "Ist-Kaltmiete", "Ist €/m²", "Sollmiete", "Soll €/m²", "Letzte Erhöhung", "Miete vorher", "Erhöhung ab", "neue Miete", "+ mtl.", "Grenze", "Nächste ab", "Miete danach", "in 3 Jahren"],
    subvention: ["WE", "Lage", "Ist-Kaltmiete", "Zielmiete", "Garantie mtl.", "Garantie Laufzeit", "Garagen-Subv. mtl.", "Einmalanteil", "Mietsubvention", "laut Liste"],
    hausgeld: ["WE", "Lage", "Hausgeld gesamt", "umlagefähig", "nicht umlagefähig", "Rücklage", "Eigentümerlast", "Überschuss mtl.", "laut Plan"],
    garagen: ["WE", "Lage", "Garage/SP", "KP Garage", "Ist-Miete Garage", "Sollmiete Garage", "Garagen-Subv. mtl.", "gekündigt zum", "Unterlagen versendet"],
    verkauf: ["WE", "Lage", "Status", "Reserviert am", "Käufer", "Finanzierung", "Stufe", "Notartermin", "Fälligkeit", "Kaufpreis da", "Grundbuch am", "Grundbuch erfolgt", "Übergabe", "Vorkaufsrecht mitgeteilt"],
    marge: ["WE", "Lage", "Status", "Kaufpreis", "Kostenanteil", "Provision", "Marge", "Marge %"],
  };
  const exportTabelle = (): ExportTabelle => {
    const titel = `${ANSICHTEN.find((a) => a.wert === ansicht)?.titel ?? "Einheitenliste"}${einzeln ? ` ${einzeln.titel}` : ""}`;
    const stand = `Stand ${new Date().toLocaleDateString("de-DE")}`;
    if (ansicht === "kosten") {
      const k = kostenBerechnen();
      const MONATE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
      return { titel: `${titel} ${jahr}`, untertitel: stand, kopf: ["Position", ...MONATE, "Jahr"], zeilen: [
        ...KOSTEN_ZEILEN.map((z) => [`${z.vorzeichen < 0 ? "− " : "+ "}${z.titel}`, ...k.monate[z.schluessel], k.summe[z.schluessel]]),
        ["Saldo", ...k.saldoMonat, k.saldo],
      ] };
    }
    if (ansicht === "fristen") {
      const heute = new Date().toISOString().slice(0, 10);
      const f = fristSort.sortiert(fristenBerechnen().filter((x) => !nurKommende || x.datum >= heute));
      return { titel, untertitel: stand, kopf: ["Datum", "Frist", "Objekt", "Einheit", "Hinweis"], zeilen: f.map((x) => [datum(x.datum), x.art, x.objekt, x.einheit || "ganzes Objekt", x.detail ?? ""]) };
    }
    const spalten = [...(mehrere ? ["Objekt"] : []), ...EXPORT_SPALTEN[ansicht]];
    const zeilenExport = sort.sortiert(zeilen).map((x) => spalten.map((sp) => {
      const v = SORT[sp]?.(x);
      if (ansicht === "handlung" && sp === "Mehrertrag mtl.") return x.potenzial || null;
      if (["Brutto Ist", "Brutto", "Netto", "Marge %"].includes(sp) && typeof v === "number") return Math.round(v * 10000) / 100;
      if (["Kaufpreis da", "Grundbuch erfolgt"].includes(sp)) return v === 1 ? "ja" : v === 0 ? "nein" : null;
      return v ?? null;
    }));
    const kopfZeile = spalten.map((sp) => (["Brutto Ist", "Brutto", "Netto"].includes(sp) ? `${spaltenName(sp)} %` : spaltenName(sp)));
    if (ansicht === "handlung") {
      kopfZeile.push("Hinweise");
      sort.sortiert(zeilen).forEach((x, i) => zeilenExport[i].push(x.hinweise.map((h) => h.text).join("; ")));
    }
    return { titel, untertitel: stand, kopf: kopfZeile, zeilen: zeilenExport };
  };
  const exportieren = async (art: "xlsx" | "pdf") => {
    try {
      const t = exportTabelle();
      const datei = art === "xlsx" ? await tabelleAlsXlsx(t) : await tabelleAlsPdf(t);
      dateiHerunterladen(datei, `${t.titel.replace(/[^\p{L}\p{N}]+/gu, "_")}_${new Date().toISOString().slice(0, 10)}.${art}`);
    } catch (e) {
      toast({ title: "Export fehlgeschlagen", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
  };

  const mitInvestagon = zeilen.some((x) => x.gesperrt);
  const kopf = (titel: string, rechts = true, hinweis?: string) => {
    const zeichen = BERECHNET.has(titel) ? "rechnet" : AUS_INVESTAGON.has(titel) && mitInvestagon ? "investagon" : null;
    const erklaerung = zeichen === "rechnet" ? "Wird automatisch berechnet." : zeichen === "investagon" ? "Bei Objekten aus Investagon dort ändern." : undefined;
    hinweis = SPALTEN[titel]?.info ?? hinweis;
    return <SortKopf titel={`${spaltenName(titel)}${zeichen === "rechnet" ? " ƒ" : zeichen === "investagon" ? " 🔒" : ""}`} schluessel={SORT[titel] ? titel : undefined}
      sort={sort} rechts={rechts} hinweis={[hinweis, erklaerung].filter(Boolean).join(" ") || undefined} />;
  };
  const r = "text-right tabular-nums whitespace-nowrap";

  return (
    <>
      <PageHeader title="Einheitenliste" subtitle="Alle Zahlen je Einheit aus den Objektdaten, mit Rendite, Mietgarantie, Hausgeld und Garagen">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => exportieren("xlsx")}><FileSpreadsheet className="mr-2 h-4 w-4" /> Excel</Button>
          <Button variant="outline" onClick={() => exportieren("pdf")}><FileDown className="mr-2 h-4 w-4" /> PDF</Button>
          {einzeln && (darfSchreiben || user.role === "backoffice") && (
            <Button variant="outline" onClick={() => setImportOffen(true)}><Upload className="mr-2 h-4 w-4" /> Liste übernehmen</Button>
          )}
        </div>
      </PageHeader>
      {objektWahl}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
        <Kennzahl titel="Einheiten" wert={String(zeilen.length)} />
        <Kennzahl titel="Fläche gesamt" wert={`${zahl(summe((x) => x.z.flaeche))} m²`} />
        <Kennzahl titel="Kaufpreise gesamt" wert={eur(kaufpreis)} />
        <Kennzahl titel="Ist-Kaltmiete im Monat" wert={eur(istMonat, 2)} />
        <Kennzahl titel="Rendite brutto Ist" wert={prozent(kaufpreis > 0 && istMonat > 0 ? (istMonat * 12) / kaufpreis : null)} />
        <Kennzahl titel="Rendite brutto Exposé" wert={prozent(kaufpreis > 0 && mieteVertrieb > 0 ? (mieteVertrieb * 12) / kaufpreis : null)} />
        <Kennzahl titel="Mehrertrag möglich im Monat" wert={eur(summe((x) => x.potenzial), 2)} />
        {mitGarantie && <Kennzahl titel="Subvention im Monat" wert={eur(summe((x) => x.garantie?.garantieMonat), 2)} />}
        {mitGarantie && <Kennzahl titel="Subvention gesamt" wert={eur(summe((x) => (x.garantie?.summeLaufzeit ?? 0) + x.einmal))} />}
      </div>
      {einzeln && ansicht === "miete" && (
        <ErhoehungsKarte objekt={einzeln} darfSchreiben={darfSchreiben}
          regel={erhoehungsRegelAusMeta(cacheGet("objekte").find((r: { id: string }) => r.id === einzeln.id)?.meta, bundeslandFromPlz(einzeln.plz))} />
      )}
      {einzeln && ansicht === "subvention" && <MietgarantieKarte objekt={einzeln} regel={mietgarantieFuerObjekt(einzeln.id)} darfSchreiben={darfSchreiben} />}
      {ansicht === "marge" && darfSchreiben && (() => {
        const a = abverkauf(zeilen.map((x) => ({ status: x.w.status || "", kaufpreis: x.z.kaufpreis, flaeche: x.z.flaeche })));
        const eingaenge = kaufpreisEingaenge(zeilen.filter((x) => x.inv).map((x) => {
          const abw = getAbwicklungDaten(x.inv!.id);
          return { faellig: abw.kaufpreisfaelligkeitDatum, betrag: x.z.kaufpreis, eingegangen: abw.kaufpreisEingegangen };
        }));
        const margeSumme = zeilen.some((x) => x.marge) ? summe((x) => x.marge?.marge) : null;
        return <>
          {einzeln && <ProjektKarte objekt={einzeln} kalkulation={kalkulationen.get(einzeln.id) ?? {}} aufteilung={aufteilungFuerObjekt(einzeln.id)}
            darfSchreiben={darfSchreiben} onGespeichert={() => setKalkStand((n) => n + 1)} />}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
            <Kennzahl titel="Verkauft" wert={`${a.verkauft.anzahl} von ${a.anzahl} (${prozent(a.quote)})`} />
            <Kennzahl titel="Reserviert" wert={String(a.reserviert.anzahl)} />
            <Kennzahl titel="Umsatz verkauft" wert={eur(a.verkauft.umsatz)} />
            <Kennzahl titel="Umsatz noch offen" wert={eur(a.offen.umsatz)} />
            <Kennzahl titel="€/m² verkauft · offen" wert={`${eur(a.verkauft.qmPreis)} · ${eur(a.offen.qmPreis)}`} />
            {margeSumme !== null && <Kennzahl titel="Marge gesamt (alle Einheiten)" wert={eur(margeSumme)} />}
          </div>
          <Card>
            <CardContent className="p-4 text-sm">
              <div className="mb-1 font-semibold">Erwartete Kaufpreiseingänge</div>
              {eingaenge.length
                ? <div className="flex flex-wrap gap-x-6 gap-y-1">{eingaenge.map((e) => <span key={e.monat} className="tabular-nums">{e.monat.slice(5)}/{e.monat.slice(0, 4)}: {eur(e.betrag)} ({e.anzahl})</span>)}</div>
                : <span className="text-muted-foreground">Keine offenen Kaufpreise mit Fälligkeit.</span>}
            </CardContent>
          </Card>
        </>;
      })()}
      {einzeln && ansicht === "hausgeld" && <WirtschaftsplanKarte objekt={einzeln} wp={wirtschaftsplanFuerObjekt(einzeln.id)} darfSchreiben={darfSchreiben} />}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {darfSchreiben
          ? <span><span className="border-b border-dashed border-primary/50 px-1">Wert<Pencil className="ml-1 inline h-3 w-3 opacity-40" /></span> anklicken und ändern</span>
          : <span>Ändern dürfen Admin, Inhaber und Objektpartner, Ist-Miete auch das Backoffice.</span>}
        <span>ƒ <Calculator className="inline h-3 w-3" /> wird automatisch berechnet</span>
        {mitInvestagon && <span>🔒 kommt aus Investagon und wird dort geändert, sonst überschreibt es der Abgleich alle 15 Minuten</span>}
      </div>
      <div className="flex flex-wrap items-end gap-x-5 gap-y-2" role="tablist">
        {[...new Set(ANSICHTEN.map((a) => a.gruppe))].map((g) => (
          <div key={g} className="space-y-1">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{g}</div>
            <div className="flex flex-wrap gap-2">
              {ANSICHTEN.filter((a) => a.gruppe === g && (a.wert !== "marge" || darfSchreiben)).map((a) => (
                <Button key={a.wert} size="sm" variant={ansicht === a.wert ? "default" : "outline"} role="tab" aria-selected={ansicht === a.wert} onClick={() => setAnsicht(a.wert)}>{a.titel}</Button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">{ANSICHTEN.find((a) => a.wert === ansicht)?.zweck}</p>
      {ansicht === "fristen" && (() => {
        const heute = new Date().toISOString().slice(0, 10);
        const alle = fristenBerechnen();
        const liste = fristSort.sortiert(alle.filter((f) => !nurKommende || f.datum >= heute));
        return (
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-semibold">Fristen</span>
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={nurKommende} onCheckedChange={(c) => setNurKommende(!!c)} /> nur kommende</label>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortKopf titel="Datum" schluessel="datum" sort={fristSort} />
                      <SortKopf titel="Frist" schluessel="art" sort={fristSort} />
                      {mehrere && <SortKopf titel="Objekt" schluessel="objekt" sort={fristSort} />}
                      <SortKopf titel="Einheit" schluessel="einheit" sort={fristSort} />
                      <TableHead>Hinweis</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {liste.map((f, i) => (
                      <TableRow key={i}>
                        <TableCell className={cn("whitespace-nowrap tabular-nums text-xs", f.datum < heute && "text-muted-foreground")}>{datum(f.datum)}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{f.art}</TableCell>
                        {mehrere && <TableCell className="whitespace-nowrap text-xs">{f.objekt}</TableCell>}
                        <TableCell className="whitespace-nowrap text-xs">{f.einheit || "ganzes Objekt"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{f.detail || ""}</TableCell>
                      </TableRow>
                    ))}
                    {liste.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Keine Fristen.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground">Gesammelt aus Mietern, Mieterhöhungsplaner, Abwicklung, Mietsubvention und Energieausweis. Ohne Erinnerungen oder Benachrichtigungen.</p>
            </CardContent>
          </Card>
        );
      })()}
      {ansicht === "fristen" ? null : ansicht === "kosten" ? (() => {
        const k = kostenBerechnen();
        const MONATE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
        return (
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">Kosten und Einnahmen {jahr}</span>
                {[jahr - 1, jahr + 1].map((j) => <Button key={j} size="sm" variant="outline" onClick={() => setJahr(j)}>{j}</Button>)}
                <span className={cn("ml-auto text-sm font-semibold", k.saldo < 0 ? "text-red-600" : "text-emerald-700")}>Saldo {eur(k.saldo, 2)}</span>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Position</TableHead>
                      {MONATE.map((m) => <TableHead key={m} className="text-right">{m}</TableHead>)}
                      <TableHead className="text-right">Jahr</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {KOSTEN_ZEILEN.map((zeile) => (
                      <TableRow key={zeile.schluessel}>
                        <TableCell className="whitespace-nowrap text-xs">{zeile.vorzeichen < 0 ? "− " : "+ "}{zeile.titel}</TableCell>
                        {k.monate[zeile.schluessel].map((v, i) => <TableCell key={i} className={r}>{v ? eur(v) : "–"}</TableCell>)}
                        <TableCell className={cn(r, "font-medium")}>{eur(k.summe[zeile.schluessel])}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell className="text-xs font-semibold">Saldo</TableCell>
                      {k.saldoMonat.map((v, i) => <TableCell key={i} className={cn(r, "font-semibold", v < 0 && "text-red-600")}>{eur(v)}</TableCell>)}
                      <TableCell className={cn(r, "font-semibold", k.saldo < 0 && "text-red-600")}>{eur(k.saldo)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground">
                Bis zum Übergabetermin (Abwicklung im Kundenprofil oder Verkaufsstand) gehört die Wohnung uns: Miete herein, Eigentümerlast oder bei Leerstand das ganze Hausgeld hinaus. Ab der Übergabe zahlen wir die Mietsubvention über ihre Laufzeit, die Garagen-Subvention und den Einmalanteil.
                {k.ohneUebergabe > 0 && ` ${k.ohneUebergabe} Wohnungen ohne Übergabetermin zählen das ganze Jahr als unsere.`}
                {" "}Mieterhöhungen sind nicht eingerechnet.
              </p>
            </CardContent>
          </Card>
        );
      })() : (
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {/* Erste Spalte (WE oder Objekt) bleibt beim seitlichen Scrollen stehen. */}
          <Table className="[&_tr>*:first-child]:sticky [&_tr>*:first-child]:left-0 [&_tr>*:first-child]:z-10 [&_tr>*:first-child]:bg-card">
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
                  {kopf("Letzte Erhöhung", false)}{kopf("Miete vorher", true, "Miete vor der letzten Erhöhung, für die Kappungsgrenze")}
                  {kopf("Erhöhung ab", false, "Frühester Termin laut Mieterhöhungsplaner")}{kopf("neue Miete", true, "Höchstmögliche Miete laut Planer")}{kopf("+ mtl.", true)}{kopf("Grenze", false)}
                  {kopf("Nächste ab", false, "Termin laut Excel-Liste")}{kopf("Miete danach", true, "Miete laut Excel-Liste")}{kopf("in 3 Jahren", true, "Erreichbare Miete in 3 Jahren laut Liste (Kappungsgrenze)")}
                </>}
                {ansicht === "subvention" && <>
                  {kopf("Ist-Kaltmiete")}{kopf("Zielmiete", true, "Die Miete, auf die wir subventionieren")}{kopf("Garantie mtl.", true, "Subvention je Monat")}
                  {kopf("Garantie Laufzeit", true, "Summe über die Laufzeit, ohne Mieterhöhungen")}{kopf("Garagen-Subv. mtl.")}
                  {kopf("Einmalanteil", true, "Anteil am Einmalbetrag nach Kaufpreis")}
                  {kopf("Mietsubvention", true, "Mietsubvention laut Excel-Liste")}{kopf("laut Liste", true, "Garantie über die Laufzeit laut Excel, mit Mieterhöhungen")}
                </>}
                {ansicht === "hausgeld" && <>
                  {kopf("Hausgeld gesamt")}{kopf("umlagefähig")}{kopf("nicht umlagefähig")}{kopf("Rücklage")}
                  {kopf("Eigentümerlast", true, "nicht umlagefähig plus Rücklage")}{kopf("Überschuss mtl.", true, "Miete Vertrieb minus Eigentümerlast")}
                  {kopf("laut Plan", true, "Hausgeld gesamt aus dem Wirtschaftsplan über die MEA der Einheit")}
                </>}
                {ansicht === "marge" && <>
                  {kopf("Status", false)}{kopf("Kaufpreis")}{kopf("Kostenanteil")}{kopf("Provision")}{kopf("Marge")}{kopf("Marge %")}
                </>}
                {ansicht === "verkauf" && <>
                  {kopf("Status", false)}{kopf("Reserviert am", false)}{kopf("Käufer", false)}{kopf("Finanzierung", false)}{kopf("Stufe", false)}{kopf("Notartermin", false)}
                  {kopf("Fälligkeit", false, "Kaufpreisfälligkeit")}{kopf("Kaufpreis da", false, "Kaufpreis eingegangen, setzt nur das Backoffice")}
                  {kopf("Grundbuch am", false)}{kopf("Grundbuch erfolgt", false)}{kopf("Übergabe", false)}{kopf("Vorkaufsrecht mitgeteilt", false)}
                </>}
                {ansicht === "garagen" && <>
                  {kopf("Garage/SP", false)}{kopf("KP Garage")}{kopf("Ist-Miete Garage")}{kopf("Sollmiete Garage")}
                  {mitGarantie && kopf("Garagen-Subv. mtl.")}{kopf("gekündigt zum", false)}
                  {kopf("Unterlagen versendet", false, "Garagenunterlagen an den Käufer, versendet im Kundenprofil unter Abwicklung")}
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
                      <TableCell className="whitespace-nowrap text-xs">{listenTextZelle(x, "letzteErhoehung")}</TableCell>
                      <TableCell className={r}>{listenZelle(x, "mieteVorErhoehung")}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs" title={x.erhoehung?.hinweis}>{x.erhoehung ? datum(x.erhoehung.ab) : "–"}</TableCell>
                      <TableCell className={r}>{x.erhoehung ? eur(x.erhoehung.neueMiete, 2) : "–"}</TableCell>
                      <TableCell className={cn(r, x.erhoehung?.plus && "font-medium text-emerald-700")}>{x.erhoehung?.plus ? eur(x.erhoehung.plus, 2) : "–"}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{x.erhoehung ? x.erhoehung.begrenztDurch : "–"}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{listenTextZelle(x, "naechsteErhoehungAb", "datum")}</TableCell>
                      <TableCell className={r}>{listenZelle(x, "naechsteErhoehungMiete")}</TableCell>
                      <TableCell className={r}>{listenZelle(x, "mieteIn3Jahren")}</TableCell>
                    </>}
                    {ansicht === "subvention" && <>
                      <TableCell className={r}>{ist !== null ? eur(ist, 2) : <span className="text-xs text-muted-foreground">kein Mieter</span>}</TableCell>
                      <TableCell className={r}>{garantie && regel?.art !== "einmal" ? <span title={regel?.art === "ziel" ? `${zahl(regel.zielQm)} €/m²` : `plus ${zahl((regel?.steigerung ?? 0) * 100, 1)} %`}>{eur(garantie.zielMiete, 2)}</span> : "–"}</TableCell>
                      <TableCell className={cn(r, garantie?.garantieMonat && "font-medium")}>{garantie && regel?.art !== "einmal" ? eur(garantie.garantieMonat, 2) : "–"}</TableCell>
                      <TableCell className={r}>{garantie && regel?.art !== "einmal" ? eur(garantie.summeLaufzeit) : "–"}</TableCell>
                      <TableCell className={r}>{garantie?.garagenSubventionMonat ? eur(garantie.garagenSubventionMonat, 2) : "–"}</TableCell>
                      <TableCell className={r}>{x.einmal ? eur(x.einmal, 2) : "–"}</TableCell>
                      <TableCell className={r}>{listenZelle(x, "mietsubvention")}</TableCell>
                      <TableCell className={r}>{listenZelle(x, "garantieLaufzeitListe", 0)}</TableCell>
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
                        <TableCell className="whitespace-nowrap text-xs">{w.status === "reserviert" && w.reserviertAm ? datum(w.reserviertAm.slice(0, 10)) : "–"}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{inv ? <Link to={`/kunden/${inv.kontaktId}`} className="hover:underline">{z.kaeufer || "zum Kunden"}</Link> : z.kaeufer || "–"}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{inv?.finanzierungsStatus ? FINANZIERUNG_TEXT[inv.finanzierungsStatus] : "–"}</TableCell>
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
                        <TableCell className="whitespace-nowrap text-xs">{x.ist ? listenTextZelle(x, "vorkaufMitgeteilt", "datum") : "–"}</TableCell>
                      </>;
                    })()}
                    {ansicht === "marge" && <>
                      <TableCell className="whitespace-nowrap text-xs">{z.status}</TableCell>
                      <TableCell className={r}>{eur(z.kaufpreis)}</TableCell>
                      <TableCell className={r}>{x.marge ? eur(x.marge.kostenanteil) : "–"}</TableCell>
                      <TableCell className={r}>{x.marge ? eur(x.marge.provision) : "–"}</TableCell>
                      <TableCell className={cn(r, x.marge && x.marge.marge < 0 && "text-red-600")}>{x.marge ? eur(x.marge.marge) : "–"}</TableCell>
                      <TableCell className={r}>{x.marge ? prozent(x.marge.margeProzent) : "–"}</TableCell>
                    </>}
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
                      <TableCell className="whitespace-nowrap text-xs">
                        {x.inv && garagenUnterlagenFuer(x.inv) ? <>
                          {versendetAm(x.inv) ? datum(versendetAm(x.inv).slice(0, 10)) : <span className="text-muted-foreground">offen</span>}
                          <button type="button" className="ml-1 rounded p-0.5 align-middle hover:bg-muted" title="Garagenunterlagen herunterladen" onClick={() => void garagenUnterlagenHerunterladen(x.inv!)}>
                            <FileDown className="h-3.5 w-3.5" />
                          </button>
                        </> : "–"}
                      </TableCell>
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
      )}
      <p className="text-xs text-muted-foreground">
        Schloss: Der Wert kommt aus Investagon und wird dort geändert, sonst überschreibt ihn der nächste Abgleich. Ein Klick auf einen anderen Wert ändert ihn; Rendite, Garantie, Eigentümerlast und Summen rechnen sofort neu, auch auf der Objekt- und Einheitenseite. Die Garantie über die Laufzeit ist ohne Mieterhöhungen gerechnet; „laut Liste“ ist der Wert aus der Excel mit Erhöhungen.
      </p>
      <GarageDialog einheit={garageEinheit} garage={garageEinheit ? garageFuerEinheit(garageEinheit.id) : null} onClose={() => setGarageEinheit(null)} />
      {einzeln && <ListenImportDialog open={importOffen} onOpenChange={setImportOffen} objekt={einzeln} />}
    </>
  );
}
