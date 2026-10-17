import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUser } from "@/contexts/UserContext";
import { toast } from "@/hooks/use-toast";
import { type Blatt } from "@/lib/excelLesen";
import { LISTEN_DATEITYPEN, leseListe } from "@/lib/listeLesen";
import { importAusfuehren, importPlanen, kopfErkennen } from "@/lib/listenImport";
import { listendatenFuerEinheit } from "@/lib/listendaten";
import { garageFuerEinheit } from "@/lib/mietgarantie";
import { addMieter, getMieter, updateMieter } from "@/lib/mieterStore";
import { einheitenAusBlatt, objektAusListe, type ObjektAngaben } from "@/lib/objektAusListe";
import { getLastObjektSaveError, getObjektById, saveObjekt, updateWohnung, wohnungMetaErgaenzen } from "@/lib/objekteStore";

/*
 * „Objekt aus Excel-Liste anlegen“ (17.10.2026): Liste wählen, Adresse
 * eintragen, anlegen. Das Objekt entsteht als unsichtbarer Entwurf mit allen
 * Einheiten; danach trägt der Listenimport Mieter, Garagen und Listendaten
 * ein, und das Objektformular öffnet sich für den Rest.
 */

export function ObjektAusListeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { authUser } = useUser();
  const navigate = useNavigate();
  const [datei, setDatei] = useState("");
  const [blaetter, setBlaetter] = useState<Blatt[]>([]);
  const [blattName, setBlattName] = useState("");
  const [angaben, setAngaben] = useState<ObjektAngaben>({ titel: "", adresse: "", plz: "", ort: "", mieteAus: "ist" });
  const [laeuft, setLaeuft] = useState(false);

  const blatt = blaetter.find((b) => b.name === blattName);
  const kopf = blatt ? kopfErkennen(blatt) : null;
  const einheiten = blatt ? einheitenAusBlatt(blatt, angaben.mieteAus) : [];
  const setze = (teil: Partial<ObjektAngaben>) => setAngaben((a) => ({ ...a, ...teil }));

  const lesen = async (f: File | undefined) => {
    if (!f) return;
    try {
      const b = await leseListe(f);
      setDatei(f.name);
      setBlaetter(b);
      setBlattName((b.find((x) => kopfErkennen(x)) ?? b[0])?.name ?? "");
    } catch (e) {
      toast({ title: "Datei nicht lesbar", description: e instanceof Error ? e.message : "Bitte eine .xlsx oder ein PDF wählen.", variant: "destructive" });
    }
  };

  const anlegen = async () => {
    if (!blatt || !einheiten.length) return;
    setLaeuft(true);
    const objekt = objektAusListe(angaben, einheiten, authUser?.id);
    if (!(await saveObjekt(objekt))) {
      setLaeuft(false);
      toast({ title: "Objekt nicht angelegt", description: getLastObjektSaveError() || "Bitte erneut versuchen.", variant: "destructive" });
      return;
    }
    // Mieter, Garagen und Listendaten wie beim Import in ein bestehendes Objekt.
    const gespeichert = getObjektById(objekt.id) ?? objekt;
    const { zeilen } = importPlanen(blatt, gespeichert.wohnungen, getMieter(), garageFuerEinheit, listendatenFuerEinheit);
    const fehler = await importAusfuehren(gespeichert, zeilen, `${datei}, Blatt „${blattName}“`, {
      mieterAnlegen: (m) => { addMieter(m); },
      mieterAendern: updateMieter,
      garageSetzen: (id, g) => wohnungMetaErgaenzen(id, { garage: g }),
      wohnungAendern: (id, felder) => updateWohnung(objekt.id, id, felder),
      listendatenSetzen: (id, werte, q) => wohnungMetaErgaenzen(id, { listendaten: { werte, quelle: q, stand: new Date().toISOString().slice(0, 10) } }),
    });
    setLaeuft(false);
    toast({
      title: `${objekt.titel} mit ${einheiten.length} Einheiten angelegt`,
      description: fehler.length ? `${fehler.length} Zeilen nicht vollständig übernommen.` : "Jetzt Adresse, Texte, Bilder und AfA im Formular ergänzen.",
    });
    onOpenChange(false);
    navigate(`/objekte/${objekt.id}/bearbeiten`);
  };

  const fertig = !!angaben.titel.trim() && !!angaben.plz.trim() && !!angaben.ort.trim() && einheiten.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Objekt aus Liste anlegen (Excel oder PDF)</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Aus der Liste entstehen alle Einheiten mit Fläche, Kaufpreis, Miete, Lage und Zimmern, dazu Mieter, Garagen, MEA, Hausgeld und die übrigen Listenwerte. Das Objekt bleibt ein Entwurf und unsichtbar, bis du es im Formular freigibst.
        </p>
        <input type="file" accept={LISTEN_DATEITYPEN} className="text-sm" onChange={(e) => lesen(e.target.files?.[0])} />
        {blaetter.length > 1 && (
          <Select value={blattName} onValueChange={setBlattName}>
            <SelectTrigger><SelectValue placeholder="Blatt wählen" /></SelectTrigger>
            <SelectContent>{blaetter.map((b) => <SelectItem key={b.name} value={b.name}>{b.name}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {blatt && !kopf && <p className="text-sm text-red-600">In diesem Blatt gibt es keine Spalte „WE“.</p>}
        {kopf && <p className="text-sm">{einheiten.length} Einheiten erkannt.</p>}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Objektname *</Label><Input value={angaben.titel} placeholder="Jamlitzer Straße, Cottbus" onChange={(e) => setze({ titel: e.target.value })} /></div>
          <div className="col-span-2"><Label>Straße und Hausnummer</Label><Input value={angaben.adresse} onChange={(e) => setze({ adresse: e.target.value })} /></div>
          <div><Label>PLZ *</Label><Input value={angaben.plz} inputMode="numeric" onChange={(e) => setze({ plz: e.target.value })} /></div>
          <div><Label>Ort *</Label><Input value={angaben.ort} onChange={(e) => setze({ ort: e.target.value })} /></div>
          {kopf?.listen.sollMiete !== undefined && (
            <div className="col-span-2">
              <Label>Miete für den Vertrieb</Label>
              <Select value={angaben.mieteAus} onValueChange={(v) => setze({ mieteAus: v as ObjektAngaben["mieteAus"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ist">Ist-Miete laut Liste</SelectItem>
                  <SelectItem value="soll">Sollmiete laut Liste</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Die PLZ bestimmt die Kaufnebenkosten (Berlin 8,0 %, Brandenburg 8,5 %).</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button disabled={!fertig || laeuft} onClick={anlegen}>{laeuft ? "Wird angelegt …" : "Anlegen und Formular öffnen"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
