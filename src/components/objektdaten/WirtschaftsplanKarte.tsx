import { useState } from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { leseExcel } from "@/lib/excelLesen";
import { ausInvestagon } from "@/lib/investagonHerkunft";
import {
  HAUSGELD_KATEGORIEN, KPL_STANDARD, kategorieSumme, neueWpPosition,
  type HausgeldKategorie, type Verteiler, type Wirtschaftsplan,
} from "@/lib/kaufpreisliste";
import { listendatenFuerEinheit, listenZahl } from "@/lib/listendaten";
import { objektMetaErgaenzen, updateWohnung, type ObjektData } from "@/lib/objekteStore";
import { zahlAus } from "@/lib/objektdatenFormular";
import { hausgeldAusPlan, wirtschaftsplanAusBlatt } from "@/lib/wirtschaftsplanObjekt";

/*
 * Der Wirtschaftsplan eines Objekts in den Objektdaten (17.10.2026): Ansätze
 * der Gemeinschaft je Jahr, daraus das Hausgeld jeder Einheit über ihre MEA.
 * Gespeichert in `objekte.meta.wirtschaftsplan`, gerechnet wie in der
 * Kaufpreisliste. Pflegen dürfen Admin, Inhaber und Objektpartner.
 */

const eur = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
// Deutsche Eingabe, auch „12.000“ ohne Komma.
const lesen = zahlAus;
const alsText = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));
const auswahl = "h-8 w-full rounded-md border border-input bg-background px-1 text-sm";

export function WirtschaftsplanKarte({ objekt, wp, darfSchreiben }: { objekt: ObjektData; wp: Wirtschaftsplan | null; darfSchreiben: boolean }) {
  const [entwurf, setEntwurf] = useState<Wirtschaftsplan | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const speichern = async (plan: Wirtschaftsplan) => {
    try {
      await objektMetaErgaenzen(objekt.id, { wirtschaftsplan: plan });
      toast({ title: "Wirtschaftsplan gespeichert" });
      setEntwurf(null);
    } catch (e) {
      toast({ title: "Nicht gespeichert", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
  };

  const ausExcel = async (f: File | undefined) => {
    if (!f) return;
    try {
      const plan = (await leseExcel(f)).map(wirtschaftsplanAusBlatt).find(Boolean);
      if (!plan) { toast({ title: "Kein Wirtschaftsplan gefunden", description: "Erwartet wird ein Blatt mit den Spalten Position, Kategorie, Ansatz €/Jahr, Verteiler.", variant: "destructive" }); return; }
      setEntwurf(plan);
    } catch {
      toast({ title: "Datei nicht lesbar", description: "Bitte eine .xlsx wählen.", variant: "destructive" });
    }
  };

  /** Das Hausgeld laut Plan in die Rechenfelder aller selbst angelegten Einheiten mit MEA schreiben. */
  const inEinheiten = async () => {
    if (!wp) return;
    setLaeuft(true);
    let geschrieben = 0, ohneMea = 0, investagon = 0;
    for (const w of objekt.wohnungen) {
      if (ausInvestagon(w)) { investagon++; continue; }
      const hg = hausgeldAusPlan(wp, listenZahl(listendatenFuerEinheit(w.id), "mea"));
      if (!hg) { ohneMea++; continue; }
      const fehler = await updateWohnung(objekt.id, w.id, {
        hausgeldMonat: hg.gesamt, hausgeldUmlagefaehigEuro: hg.umlagefaehig,
        hausgeldNichtUmlagefaehigEuro: hg.nichtUmlagefaehig, ruecklageZufuehrungMonat: hg.ruecklage,
      });
      if (!fehler) geschrieben++;
    }
    setLaeuft(false);
    toast({ title: `Hausgeld bei ${geschrieben} Einheiten übernommen`, description: [ohneMea ? `${ohneMea} ohne MEA` : "", investagon ? `${investagon} aus Investagon (dort pflegen)` : ""].filter(Boolean).join(", ") || undefined });
  };

  const summen = wp ? HAUSGELD_KATEGORIEN.map((k) => [k, kategorieSumme(wp, k)] as const) : [];
  const gesamt = summen.reduce((s, [, v]) => s + v, 0);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold">Wirtschaftsplan{wp?.gueltigAb ? ` ${wp.gueltigAb}` : ""}</div>
          {darfSchreiben && (
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
                <Upload className="mr-2 h-4 w-4" /> Aus Excel
                <input type="file" accept=".xlsx" className="hidden" onChange={(e) => { ausExcel(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
              <Button size="sm" variant="outline" onClick={() => setEntwurf(wp ? structuredClone(wp) : KPL_STANDARD().wirtschaftsplan)}>{wp ? "Bearbeiten" : "Anlegen"}</Button>
              {wp && <Button size="sm" disabled={laeuft} onClick={inEinheiten}>Hausgeld in Einheiten übernehmen</Button>}
            </div>
          )}
        </div>
        {wp ? (
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
            <span>Gesamt-MEA {wp.gesamtMea ?? "–"}</span>
            <span>{wp.anzahlEinheiten ?? "–"} Einheiten</span>
            {summen.map(([k, v]) => <span key={k}>{k} {eur(v)}</span>)}
            <span className="font-medium text-foreground">Ausgaben gesamt {eur(gesamt)} im Jahr</span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Noch kein Wirtschaftsplan hinterlegt. Mit ihm rechnet das CRM das Hausgeld jeder Einheit über ihre MEA, wie im Einzelwirtschaftsplan.</p>
        )}
        {wp && <p className="mt-2 text-xs text-muted-foreground">„Hausgeld in Einheiten übernehmen“ schreibt das Hausgeld laut Plan in alle selbst angelegten Einheiten mit MEA. Einheiten aus Investagon werden dort gepflegt.</p>}
      </CardContent>
      {entwurf && <PlanDialog entwurf={entwurf} setEntwurf={setEntwurf} speichern={speichern} />}
    </Card>
  );
}

function PlanDialog({ entwurf, setEntwurf, speichern }: {
  entwurf: Wirtschaftsplan; setEntwurf: (wp: Wirtschaftsplan | null) => void; speichern: (wp: Wirtschaftsplan) => void;
}) {
  const setze = (teil: Partial<Wirtschaftsplan>) => setEntwurf({ ...entwurf, ...teil });
  const position = (id: string, teil: Partial<Wirtschaftsplan["positionen"][number]>) =>
    setze({ positionen: entwurf.positionen.map((p) => (p.id === id ? { ...p, ...teil } : p)) });
  return (
    <Dialog open onOpenChange={(o) => { if (!o) setEntwurf(null); }}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader><DialogTitle>Wirtschaftsplan bearbeiten</DialogTitle></DialogHeader>
        <div className="grid grid-cols-3 gap-3">
          <div><Label>Gesamt-MEA</Label><Input inputMode="decimal" defaultValue={alsText(entwurf.gesamtMea)} onBlur={(e) => setze({ gesamtMea: lesen(e.target.value) })} /></div>
          <div><Label>Anzahl Einheiten (Verteiler WE)</Label><Input inputMode="numeric" defaultValue={alsText(entwurf.anzahlEinheiten)} onBlur={(e) => setze({ anzahlEinheiten: lesen(e.target.value) })} /></div>
          <div><Label>gültig ab</Label><Input defaultValue={entwurf.gueltigAb} placeholder="2027" onBlur={(e) => setze({ gueltigAb: e.target.value.trim() })} /></div>
        </div>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Position</TableHead><TableHead>Kategorie</TableHead><TableHead className="text-right">Ansatz €/Jahr</TableHead><TableHead>Verteiler</TableHead><TableHead /></TableRow>
          </TableHeader>
          <TableBody>
            {entwurf.positionen.map((p) => (
              <TableRow key={p.id}>
                <TableCell><Input className="h-8" defaultValue={p.position} onBlur={(e) => position(p.id, { position: e.target.value })} /></TableCell>
                <TableCell>
                  <select className={auswahl} value={p.kategorie} onChange={(e) => position(p.id, { kategorie: e.target.value as HausgeldKategorie })}>
                    {HAUSGELD_KATEGORIEN.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                </TableCell>
                <TableCell><Input className="h-8 text-right tabular-nums" inputMode="decimal" defaultValue={alsText(p.ansatzJahr)} onBlur={(e) => position(p.id, { ansatzJahr: lesen(e.target.value) })} /></TableCell>
                <TableCell>
                  <select className={auswahl} value={p.verteiler} onChange={(e) => position(p.id, { verteiler: e.target.value as Verteiler })}>
                    <option value="MEA">MEA</option><option value="WE">je Einheit</option>
                  </select>
                </TableCell>
                <TableCell><Button variant="ghost" size="icon" aria-label="Position entfernen" onClick={() => setze({ positionen: entwurf.positionen.filter((x) => x.id !== p.id) })}><Trash2 className="h-4 w-4" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex justify-between">
          <Button variant="outline" onClick={() => setze({ positionen: [...entwurf.positionen, neueWpPosition()] })}><Plus className="mr-2 h-4 w-4" /> Position</Button>
          <Button onClick={() => speichern(entwurf)}>Speichern</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
