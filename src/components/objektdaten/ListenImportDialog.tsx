import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { type Blatt } from "@/lib/excelLesen";
import { LISTEN_DATEITYPEN, leseListe } from "@/lib/listeLesen";
import {
  FELD_NAME, importAusfuehren, importPlanen, planZaehlen, type ImportFeld, type ImportZeile, type PruefErgebnis,
} from "@/lib/listenImport";
import { GARAGEN_STATUS_TEXT, garageFuerEinheit } from "@/lib/mietgarantie";
import { LISTEN_FELDER, listendatenFuerEinheit } from "@/lib/listendaten";
import { addMieter, getMieter, updateMieter } from "@/lib/mieterStore";
import { getObjektById, updateWohnung, wohnungMetaErgaenzen, type ObjektData } from "@/lib/objekteStore";
import { cn } from "@/lib/utils";

/*
 * Eine Excel-Liste eines Objekts übernehmen (17.10.2026): Datei wählen, Blatt
 * wählen, Vorschau prüfen, übernehmen. Die Regeln stehen in `listenImport.ts`.
 * Bis zur Bestätigung wird nichts geschrieben.
 */

const eur = (n: number | null) => (n === null ? "–" : n.toLocaleString("de-DE", { maximumFractionDigits: 2 }) + " €");
const qm = (n: number | null) => (n === null ? "–" : n.toLocaleString("de-DE", { maximumFractionDigits: 2 }));
const FARBE: Record<PruefErgebnis, string> = { gleich: "text-emerald-700", abweichend: "text-red-600 font-medium", fehlt: "text-muted-foreground" };

export function ListenImportDialog({ open, onOpenChange, objekt }: { open: boolean; onOpenChange: (o: boolean) => void; objekt: ObjektData }) {
  const [datei, setDatei] = useState("");
  const [blaetter, setBlaetter] = useState<Blatt[]>([]);
  const [blattName, setBlattName] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  const blatt = blaetter.find((b) => b.name === blattName);
  const aktuell = getObjektById(objekt.id) ?? objekt;
  const plan = blatt ? importPlanen(blatt, aktuell.wohnungen, getMieter(), garageFuerEinheit, listendatenFuerEinheit) : null;
  const n = plan ? planZaehlen(plan.zeilen) : null;

  const zuruecksetzen = () => { setDatei(""); setBlaetter([]); setBlattName(""); };

  const lesen = async (f: File | undefined) => {
    if (!f) return;
    try {
      const b = await leseListe(f);
      setDatei(f.name);
      setBlaetter(b);
      // Das erste Blatt mit erkennbarer WE-Spalte vorwählen.
      setBlattName((b.find((x) => importPlanen(x, [], [], () => null).kopf) ?? b[0])?.name ?? "");
    } catch (e) {
      toast({ title: "Datei nicht lesbar", description: e instanceof Error ? e.message : "Bitte eine .xlsx oder ein PDF wählen.", variant: "destructive" });
    }
  };

  const uebernehmen = async () => {
    if (!plan) return;
    setLaeuft(true);
    const fehler = await importAusfuehren(objekt, plan.zeilen, `${datei}, Blatt „${blattName}“`, {
      mieterAnlegen: (m) => { addMieter(m); },
      mieterAendern: updateMieter,
      garageSetzen: (id, g) => wohnungMetaErgaenzen(id, { garage: g }),
      wohnungAendern: (id, felder) => updateWohnung(objekt.id, id, felder),
      listendatenSetzen: (id, werte, q) => wohnungMetaErgaenzen(id, {
        listendaten: { werte: { ...(listendatenFuerEinheit(id)?.werte || {}), ...werte }, quelle: q, stand: new Date().toISOString().slice(0, 10) },
      }),
    });
    setLaeuft(false);
    if (fehler.length) toast({ title: `${fehler.length} Zeilen nicht übernommen`, description: fehler.slice(0, 4).join(" "), variant: "destructive" });
    else toast({ title: "Liste übernommen" });
    zuruecksetzen();
    onOpenChange(false);
  };

  const erkannt = plan?.kopf ? [
    ...(Object.keys(plan.kopf.spalten) as ImportFeld[]).map((f) => FELD_NAME[f]),
    ...LISTEN_FELDER.filter((f) => plan.kopf!.listen[f.schluessel] !== undefined).map((f) => f.label),
  ].join(", ") : "";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) zuruecksetzen(); onOpenChange(o); }}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Liste übernehmen (Excel oder PDF): {objekt.titel}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Erkannt werden Listen mit einer WE-Spalte, etwa Kaufpreis- und Flächenabgleich, Mietdifferenz-Abgleich, Mieterliste oder Vertriebsliste. Ein PDF liest die KI aus; bitte die Vorschau dann besonders genau prüfen. Werte werden unverändert übernommen. Kaufpreis und Fläche werden bei Objekten aus Investagon nur geprüft, ändern musst du sie dort.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input type="file" accept={LISTEN_DATEITYPEN} onChange={(e) => lesen(e.target.files?.[0])} className="text-sm" />
          {blaetter.length > 1 && (
            <Select value={blattName} onValueChange={setBlattName}>
              <SelectTrigger className="w-full sm:w-72"><SelectValue placeholder="Blatt wählen" /></SelectTrigger>
              <SelectContent>{blaetter.map((b) => <SelectItem key={b.name} value={b.name}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </div>
        {blatt && !plan?.kopf && <p className="text-sm text-red-600">In diesem Blatt gibt es keine Spalte „WE“. Bitte ein anderes Blatt wählen.</p>}
        {plan?.kopf && n && (
          <>
            <p className="text-xs text-muted-foreground">Erkannte Spalten: {erkannt}</p>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-muted px-2.5 py-1">{n.mieterNeu} Mieter neu</span>
              <span className="rounded-full bg-muted px-2.5 py-1">{n.mieterAktualisiert} Mieter aktualisiert</span>
              <span className="rounded-full bg-muted px-2.5 py-1">{n.garagen} Garagen</span>
              <span className="rounded-full bg-muted px-2.5 py-1">{n.listendaten} Einheiten mit neuen Listendaten</span>
              {n.stammdaten > 0 && <span className="rounded-full bg-muted px-2.5 py-1">{n.stammdaten} Einheiten mit neuem Kaufpreis oder Fläche</span>}
              {n.abweichendInvestagon > 0 && <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-700">{n.abweichendInvestagon} Abweichungen zu Investagon</span>}
              {n.ohneEinheit > 0 && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">{n.ohneEinheit} Zeilen ohne Einheit</span>}
            </div>
            <div className="overflow-x-auto rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Zeile</TableHead><TableHead>WE</TableHead>
                    <TableHead className="text-right">Fläche Liste / CRM</TableHead>
                    <TableHead className="text-right">Kaufpreis Liste / CRM</TableHead>
                    <TableHead>Mieter</TableHead><TableHead className="text-right">Ist-Kaltmiete</TableHead>
                    <TableHead>Garage</TableHead><TableHead>Hinweis</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plan.zeilen.map((z: ImportZeile) => (
                    <TableRow key={z.zeile}>
                      <TableCell className="text-xs text-muted-foreground">{z.zeile}</TableCell>
                      <TableCell className="whitespace-nowrap">{z.wohnung?.weNr || z.we}</TableCell>
                      <TableCell className={cn("text-right tabular-nums whitespace-nowrap", FARBE[z.flaeche.ergebnis])}>{qm(z.flaeche.liste)} / {qm(z.flaeche.crm)}</TableCell>
                      <TableCell className={cn("text-right tabular-nums whitespace-nowrap", FARBE[z.kaufpreis.ergebnis])}>
                        {eur(z.kaufpreis.wohnung)}{z.kaufpreis.garage ? ` + ${eur(z.kaufpreis.garage)}` : ""} / {eur(z.kaufpreis.crm)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{z.mieter ? `${z.mieter.name} (${z.mieter.aktion})` : "–"}</TableCell>
                      <TableCell className="text-right tabular-nums">{z.mieter ? eur(z.mieter.kaltmiete) : "–"}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {z.garage ? (z.garage.neu ? `${z.garage.neu.nr} · ${GARAGEN_STATUS_TEXT[z.garage.neu.status]}` : "keine") + (z.garage.aktion === "unverändert" ? "" : ` (${z.garage.aktion})`) : "–"}
                      </TableCell>
                      <TableCell className="max-w-xs text-xs text-muted-foreground">{z.hinweise.join(" ")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Abbrechen</Button>
              <Button disabled={laeuft || (n.mieterNeu + n.mieterAktualisiert + n.garagen + n.stammdaten + n.listendaten === 0)} onClick={uebernehmen}>
                {laeuft ? "Wird übernommen …" : "Übernehmen"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
