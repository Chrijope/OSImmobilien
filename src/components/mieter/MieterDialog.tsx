import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUser } from "@/contexts/UserContext";
import { toast } from "@/hooks/use-toast";
import { addMieter, updateMieter, type Mieter } from "@/lib/mieterStore";
import { getObjekte } from "@/lib/objekteStore";
import { objekteFuerRolle } from "@/lib/objektdaten";

/*
 * Mieter anlegen oder bearbeiten, seit dem 17.10.2026 immer an einer Einheit
 * (Christian: die Hausverwaltung läuft auf der Mietertabelle der
 * Objektdaten). Vorher blieben Objekt und Einheit leer, der Mieter hing an
 * keiner Wohnung. Genutzt von `/mieter` und `/objektdaten/mieter`.
 */

const LEER = {
  vorname: "", nachname: "", email: "", telefon: "", objektId: "", wohneinheitId: "",
  kaltmiete: 0, nebenkosten: 0, kaution: 0, mietvertragBeginn: "", mietvertragEnde: "",
  status: "aktiv" as Mieter["status"], notizen: "",
};

export function MieterDialog({ open, onOpenChange, mieter, vorgabe, onGespeichert }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Zum Bearbeiten; ohne wird angelegt. */
  mieter?: Mieter | null;
  /** Objekt und Einheit vorbelegen, etwa aus der Mieterliste eines Objekts. */
  vorgabe?: { objektId: string; wohneinheitId: string };
  onGespeichert: () => void;
}) {
  const { user, authUser } = useUser();
  const [form, setForm] = useState(LEER);
  const objekte = useMemo(
    () => (open ? objekteFuerRolle(getObjekte(), user.role, authUser?.id).sort((a, b) => a.titel.localeCompare(b.titel, "de")) : []),
    [open, user.role, authUser?.id],
  );

  useEffect(() => {
    if (!open) return;
    setForm(mieter
      ? { vorname: mieter.vorname, nachname: mieter.nachname, email: mieter.email, telefon: mieter.telefon, objektId: mieter.objektId, wohneinheitId: mieter.wohneinheitId, kaltmiete: mieter.kaltmiete, nebenkosten: mieter.nebenkosten, kaution: mieter.kaution, mietvertragBeginn: mieter.mietvertragBeginn, mietvertragEnde: mieter.mietvertragEnde, status: mieter.status, notizen: mieter.notizen }
      : { ...LEER, ...vorgabe });
  }, [open, mieter, vorgabe]);

  const objekt = objekte.find((o) => o.id === form.objektId);
  const setze = <K extends keyof typeof LEER>(k: K, v: (typeof LEER)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const speichern = () => {
    if (!form.vorname.trim() || !form.nachname.trim()) { toast({ title: "Bitte Vor- und Nachname eingeben" }); return; }
    if (!form.objektId || !form.wohneinheitId) { toast({ title: "Bitte Objekt und Einheit wählen" }); return; }
    const einheit = objekt?.wohnungen.find((w) => w.id === form.wohneinheitId);
    // Die Namen stehen zusätzlich am Mieter, damit Listen ohne geladene Objekte lesbar bleiben.
    const daten = { ...form, objektName: objekt?.titel, wohneinheitName: einheit?.weNr };
    if (mieter) {
      updateMieter(mieter.id, daten);
      toast({ title: "Mieter gespeichert" });
    } else {
      addMieter({ ...daten, kautionEingegangen: false, dokumente: [], zahlungen: [] });
      toast({ title: "Mieter angelegt" });
    }
    onOpenChange(false);
    onGespeichert();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{mieter ? "Mieter bearbeiten" : "Neuen Mieter anlegen"}</DialogTitle></DialogHeader>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label>Objekt *</Label>
            <Select value={form.objektId} onValueChange={(v) => setForm((f) => ({ ...f, objektId: v, wohneinheitId: "" }))}>
              <SelectTrigger><SelectValue placeholder="Objekt wählen" /></SelectTrigger>
              <SelectContent>{objekte.map((o) => <SelectItem key={o.id} value={o.id}>{o.titel}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Einheit *</Label>
            <Select value={form.wohneinheitId} onValueChange={(v) => setze("wohneinheitId", v)} disabled={!objekt}>
              <SelectTrigger><SelectValue placeholder={objekt ? "Einheit wählen" : "Erst Objekt wählen"} /></SelectTrigger>
              <SelectContent>
                {(objekt?.wohnungen || []).map((w) => (
                  <SelectItem key={w.id} value={w.id}>{[w.weNr || "ohne Nr.", w.etage, w.lage].filter(Boolean).join(" · ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Vorname *</Label><Input value={form.vorname} onChange={(e) => setze("vorname", e.target.value)} /></div>
          <div><Label>Nachname *</Label><Input value={form.nachname} onChange={(e) => setze("nachname", e.target.value)} /></div>
          <div><Label>E-Mail</Label><Input value={form.email} onChange={(e) => setze("email", e.target.value)} /></div>
          <div><Label>Telefon</Label><PhoneInput value={form.telefon} onChange={(v) => setze("telefon", v)} /></div>
          <div><Label>Kaltmiete (€)</Label><Input type="number" value={form.kaltmiete} onChange={(e) => setze("kaltmiete", +e.target.value)} /></div>
          <div><Label>Nebenkosten (€)</Label><Input type="number" value={form.nebenkosten} onChange={(e) => setze("nebenkosten", +e.target.value)} /></div>
          <div><Label>Kaution (€)</Label><Input type="number" value={form.kaution} onChange={(e) => setze("kaution", +e.target.value)} /></div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setze("status", v as Mieter["status"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="neu">Neu</SelectItem>
                <SelectItem value="aktiv">Aktiv</SelectItem>
                <SelectItem value="gekuendigt">Gekündigt</SelectItem>
                <SelectItem value="ausgezogen">Ausgezogen</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Mietbeginn</Label><DateInput value={form.mietvertragBeginn} onChange={(v) => setze("mietvertragBeginn", v)} /></div>
          <div><Label>befristet bis</Label><DateInput value={form.mietvertragEnde} onChange={(v) => setze("mietvertragEnde", v)} /></div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={speichern}>{mieter ? "Speichern" : "Anlegen"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
