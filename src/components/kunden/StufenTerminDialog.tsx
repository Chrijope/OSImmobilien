import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { heuteIso } from "@/lib/kontaktPipeline";
import { pruefeStufenTermin, terminFehlerText, TERMIN_STUFEN, type StufenTerminEingabe, type TerminStufe } from "@/lib/stufenTermin";

/**
 * Das Fenster beim Setzen von „Besichtigung" oder „Termin Bankgutachter".
 *
 * Nur die Oberflaeche: Was gespeichert wird, entscheidet der Aufrufer in
 * `onSpeichern` (Meeting anlegen, dann Stufe setzen, siehe
 * `stufenTerminAktionen.ts`). Abbrechen setzt nichts. Liefert `onSpeichern`
 * eine Meldung zurueck, bleibt das Fenster offen und zeigt sie an, damit die
 * Eingabe nicht verloren geht.
 */
export function StufenTerminDialog({
  stufe,
  kundeName,
  onAbbrechen,
  onSpeichern,
}: {
  /** `null` heisst geschlossen. */
  stufe: TerminStufe | null;
  kundeName?: string;
  onAbbrechen: () => void;
  /** `null` bei Erfolg, sonst die Meldung fuer das Fenster. */
  onSpeichern: (eingabe: StufenTerminEingabe) => Promise<string | null>;
}) {
  const [datum, setDatum] = useState("");
  const [uhrzeit, setUhrzeit] = useState("");
  const [ort, setOrt] = useState("");
  const [notiz, setNotiz] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  // Bei jedem Oeffnen leer beginnen.
  useEffect(() => {
    if (!stufe) return;
    setDatum(""); setUhrzeit(""); setOrt(""); setNotiz(""); setFehler(null); setLaeuft(false);
  }, [stufe]);

  if (!stufe) return null;
  const info = TERMIN_STUFEN[stufe];

  const speichern = async () => {
    if (laeuft) return;
    const eingabe = { datum, uhrzeit, ort, notiz };
    const meldung = pruefeStufenTermin(eingabe);
    if (meldung) { setFehler(meldung); return; }
    setLaeuft(true);
    setFehler(null);
    let ergebnis: string | null;
    try {
      ergebnis = await onSpeichern(eingabe);
    } catch (e) {
      ergebnis = terminFehlerText(e);
    }
    setLaeuft(false);
    if (ergebnis) setFehler(ergebnis);
  };

  return (
    <Dialog open onOpenChange={(offen) => { if (!offen && !laeuft) onAbbrechen(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{info.titel} eintragen</DialogTitle>
          <DialogDescription>
            {info.hinweis} {kundeName ? `Der Termin mit ${kundeName} ` : "Der Termin "}
            erscheint unter „Nächste Aktionen" am Investment. Ohne Termin wird die Stufe nicht gesetzt.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs" htmlFor="stufen-termin-datum">Datum *</Label>
            <Input id="stufen-termin-datum" type="date" className="mt-1" min={heuteIso()} value={datum} onChange={(e) => setDatum(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs" htmlFor="stufen-termin-uhrzeit">Uhrzeit *</Label>
            <Input id="stufen-termin-uhrzeit" type="time" className="mt-1" value={uhrzeit} onChange={(e) => setUhrzeit(e.target.value)} />
          </div>
        </div>
        <div>
          <Label className="text-xs" htmlFor="stufen-termin-ort">Ort (optional)</Label>
          <Input id="stufen-termin-ort" className="mt-1" value={ort} onChange={(e) => setOrt(e.target.value)} placeholder="Adresse oder Treffpunkt" />
        </div>
        <div>
          <Label className="text-xs" htmlFor="stufen-termin-notiz">Notiz (optional)</Label>
          <Textarea id="stufen-termin-notiz" className="mt-1" rows={2} value={notiz} onChange={(e) => setNotiz(e.target.value)} />
        </div>
        {fehler && <p role="alert" className="text-xs text-destructive">{fehler}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onAbbrechen} disabled={laeuft}>Abbrechen</Button>
          <Button onClick={() => void speichern()} disabled={laeuft}>{laeuft ? "Speichert…" : "Termin speichern"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
