import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Lock, Pencil, Upload } from "lucide-react";
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
import { cn } from "@/lib/utils";

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

/** Eine Zahl, die sich per Klick ändern lässt. Ohne `speichern` nur Anzeige. */
function ZahlZelle({ wert, anzeige, speichern, gesperrt }: {
  wert: number | null; anzeige: string; speichern?: (n: number | null) => Promise<void>; gesperrt?: boolean;
}) {
  const [offen, setOffen] = useState(false);
  const [text, setText] = useState("");
  if (gesperrt) return <span className="whitespace-nowrap">{anzeige}<Schloss /></span>;
  if (!speichern) return <span className="whitespace-nowrap">{anzeige}</span>;
  if (!offen) {
    return (
      <button type="button" className="group whitespace-nowrap rounded px-1 hover:bg-muted" title="Zum Ändern klicken"
        onClick={() => { setText(wert === null ? "" : String(wert).replace(".", ",")); setOffen(true); }}>
        {anzeige}<Pencil className="ml-1 inline h-3 w-3 opacity-0 group-hover:opacity-60" />
      </button>
    );
  }
  const fertig = async () => {
    setOffen(false);
    const neu = lesen(text);
    if (neu === wert) return;
    try { await speichern(neu); toast({ title: "Gespeichert" }); }
    catch (e) { toast({ title: "Nicht gespeichert", description: e instanceof Error ? e.message : undefined, variant: "destructive" }); }
  };
  return (
    <Input autoFocus inputMode="decimal" value={text} className="h-7 w-24 px-1 text-right tabular-nums"
      onChange={(e) => setText(e.target.value)} onBlur={fertig}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setOffen(false); }} />
  );
}

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

export function Einheitenliste({ objekte, objektWahl }: { objekte: ObjektData[]; objektWahl: React.ReactNode }) {
  const { user } = useUser();
  // Mieter, Objekt- und Einheitenzusätze ändern sich nach dem Speichern; neu zeichnen.
  useLiveVersion(["mieter", "objekte", "wohnungen"]);
  const [garageEinheit, setGarageEinheit] = useState<ObjektWohnung | null>(null);
  const [importOffen, setImportOffen] = useState(false);
  const darfSchreiben = SCHREIBT_OBJEKTE.includes(user.role);
  const mieter = getMieter();
  const einzeln = objekte.length === 1 ? objekte[0] : null;

  const zeilen = objekte.flatMap((o) => {
    const regel = mietgarantieFuerObjekt(o.id);
    return o.wohnungen.map((w) => {
      const z = einheitZeile(w);
      const m = aktuellerMieter(mieter, w.id);
      const ist = m ? m.kaltmiete || 0 : null;
      const garage = garageFuerEinheit(w.id);
      const garantie = regel && z.flaeche ? berechneGarantie(regel, z.flaeche, ist ?? 0, garage) : null;
      return { objekt: o, w, z, m, ist, garage, regel, garantie, gesperrt: ausInvestagon(w) };
    });
  });
  const mitGarantie = zeilen.some((x) => x.regel);
  const summe = (f: (x: (typeof zeilen)[number]) => number | null | undefined) => zeilen.reduce((s, x) => s + (f(x) ?? 0), 0);
  const kaufpreis = summe((x) => x.z.kaufpreis);
  const istMonat = summe((x) => x.ist);
  const mehrere = objekte.length > 1;

  const wohnungSpeichern = (o: ObjektData, w: ObjektWohnung, feld: "groesse" | "vkGesamt" | "mieteGesamt") => async (n: number | null) => {
    const fehler = await updateWohnung(o.id, w.id, { [feld]: n ?? 0 });
    if (fehler) throw new Error("Die Einheit darfst du nicht ändern.");
  };

  return (
    <>
      <PageHeader title="Einheitenliste" subtitle="Fläche, Kaufpreis, Miete, Mietgarantie und Garagen je Einheit, direkt aus den Objektdaten">
        {einzeln && (darfSchreiben || user.role === "backoffice") && (
          <Button variant="outline" onClick={() => setImportOffen(true)}><Upload className="mr-2 h-4 w-4" /> Excel-Liste übernehmen</Button>
        )}
      </PageHeader>
      {objektWahl}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kennzahl titel="Einheiten" wert={String(zeilen.length)} />
        <Kennzahl titel="Fläche gesamt" wert={`${zahl(summe((x) => x.z.flaeche))} m²`} />
        <Kennzahl titel="Kaufpreise gesamt" wert={eur(kaufpreis)} />
        <Kennzahl titel="Ist-Kaltmiete im Monat" wert={eur(istMonat, 2)} />
        {mitGarantie && <Kennzahl titel="Garantie im Monat" wert={eur(summe((x) => x.garantie?.garantieMonat), 2)} />}
        {mitGarantie && <Kennzahl titel="Garantie über Laufzeit" wert={eur(summe((x) => x.garantie?.summeLaufzeit))} />}
      </div>
      {einzeln && <MietgarantieKarte objekt={einzeln} regel={mietgarantieFuerObjekt(einzeln.id)} darfSchreiben={darfSchreiben} />}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {mehrere && <TableHead>Objekt</TableHead>}
                <TableHead>WE</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Lage</TableHead>
                <TableHead className="text-right">Fläche m²</TableHead>
                <TableHead className="text-right">Kaufpreis</TableHead>
                <TableHead className="text-right">KP Garage</TableHead>
                <TableHead className="text-right">VK €/m²</TableHead>
                <TableHead className="text-right" title="Miete, mit der der Vertrieb rechnet (bei Garantie die Zielmiete)">Miete Vertrieb</TableHead>
                <TableHead className="text-right">Rendite</TableHead>
                <TableHead className="text-right" title="Kaltmiete laut aktuellem Mieter">Ist-Kaltmiete</TableHead>
                <TableHead className="text-right">Ist €/m²</TableHead>
                {mitGarantie && <TableHead className="text-right">Zielmiete</TableHead>}
                {mitGarantie && <TableHead className="text-right">Garantie mtl.</TableHead>}
                <TableHead>Garage/SP</TableHead>
                {mitGarantie && <TableHead className="text-right">Garagen-Subv. mtl.</TableHead>}
                <TableHead className="text-right">Hausgeld mtl.</TableHead>
                <TableHead>Käufer</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {zeilen.map(({ objekt, w, z, m, ist, garage, regel, garantie, gesperrt }) => (
                <TableRow key={w.id}>
                  {mehrere && <TableCell className="whitespace-nowrap text-xs">{objekt.titel}</TableCell>}
                  <TableCell className="whitespace-nowrap font-medium"><Link to={`/objekte/${objekt.id}/einheiten/${w.id}`} className="hover:underline">{z.weNr || "ohne Nr."}</Link></TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{z.status}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{z.lage || "–"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <ZahlZelle wert={z.flaeche} anzeige={zahl(z.flaeche)} gesperrt={gesperrt} speichern={darfSchreiben ? wohnungSpeichern(objekt, w, "groesse") : undefined} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <ZahlZelle wert={z.kaufpreis} anzeige={eur(z.kaufpreis)} gesperrt={gesperrt} speichern={darfSchreiben ? wohnungSpeichern(objekt, w, "vkGesamt") : undefined} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">{w.stellplatzPreis ? <>{eur(w.stellplatzPreis)}{gesperrt && <Schloss />}</> : "–"}</TableCell>
                  <TableCell className="text-right tabular-nums">{zahl(z.kaufpreisQm)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <ZahlZelle wert={z.mieteMonat} anzeige={eur(z.mieteMonat, 2)} gesperrt={gesperrt} speichern={darfSchreiben ? wohnungSpeichern(objekt, w, "mieteGesamt") : undefined} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{prozent(z.rendite)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {m
                      ? <ZahlZelle wert={ist} anzeige={eur(ist, 2)} speichern={async (n) => updateMieter(m.id, { kaltmiete: n ?? 0 })} />
                      : <span className="text-xs text-muted-foreground" title="Ohne Mieter keine Ist-Miete. Mieter unter „Mieter & Mietverträge“ erfassen.">kein Mieter</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{ist && z.flaeche ? zahl(ist / z.flaeche) : "–"}</TableCell>
                  {mitGarantie && <TableCell className="text-right tabular-nums whitespace-nowrap">{garantie ? <span title={`${zahl(regel!.zielQm)} €/m²`}>{eur(garantie.zielMiete, 2)}</span> : "–"}</TableCell>}
                  {mitGarantie && <TableCell className={cn("text-right tabular-nums whitespace-nowrap", garantie?.garantieMonat && "font-medium")}>{garantie ? eur(garantie.garantieMonat, 2) : "–"}</TableCell>}
                  <TableCell className="whitespace-nowrap text-xs">
                    {darfSchreiben
                      ? <button type="button" className="rounded px-1 hover:bg-muted" onClick={() => setGarageEinheit(w)}>{garage ? `${garage.nr} · ${GARAGEN_STATUS_TEXT[garage.status]}${garage.istMiete ? ` · ${eur(garage.istMiete)}` : ""}` : <span className="text-muted-foreground">+ Garage</span>}</button>
                      : garage ? `${garage.nr} · ${GARAGEN_STATUS_TEXT[garage.status]}${garage.istMiete ? ` · ${eur(garage.istMiete)}` : ""}` : "–"}
                  </TableCell>
                  {mitGarantie && <TableCell className="text-right tabular-nums whitespace-nowrap">{garantie?.garagenSubventionMonat ? eur(garantie.garagenSubventionMonat, 2) : "–"}</TableCell>}
                  <TableCell className="text-right tabular-nums whitespace-nowrap">{eur(z.hausgeldMonat, 2)}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{z.kaeufer || "–"}</TableCell>
                </TableRow>
              ))}
              {zeilen.length === 0 && (
                <TableRow><TableCell colSpan={18} className="py-8 text-center text-sm text-muted-foreground">Keine Einheiten erfasst.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Schloss: Der Wert kommt aus Investagon und wird dort geändert, sonst überschreibt ihn der nächste Abgleich. Bearbeitete Werte gelten sofort überall im CRM, auch auf der Objekt- und Einheitenseite. Die Garantie über die Laufzeit ist ohne Mieterhöhungen gerechnet und damit die Obergrenze; Mieterhöhungen senken sie.
      </p>
      <GarageDialog einheit={garageEinheit} garage={garageEinheit ? garageFuerEinheit(garageEinheit.id) : null} onClose={() => setGarageEinheit(null)} />
      {einzeln && <ListenImportDialog open={importOffen} onOpenChange={setImportOffen} objekt={einzeln} />}
    </>
  );
}
