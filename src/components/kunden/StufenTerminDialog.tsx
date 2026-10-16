import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { heuteIso } from "@/lib/kontaktPipeline";
import {
  ORT_ONLINE, pruefeStufenTermin, terminFehlerText, TERMIN_STUFEN, vortagIso, type StufenTerminEingabe, type TerminStufe,
} from "@/lib/stufenTermin";

/**
 * Das Fenster beim Setzen von „Besichtigung" oder „Termin Bankgutachter".
 *
 * Nur die Oberflaeche: Was gespeichert wird, entscheidet der Aufrufer in
 * `onSpeichern` (Meeting anlegen, dann Stufe setzen, siehe
 * `stufenTerminAktionen.ts`). Abbrechen setzt nichts. Liefert `onSpeichern`
 * eine Meldung zurueck, bleibt das Fenster offen und zeigt sie an, damit die
 * Eingabe nicht verloren geht.
 *
 * Bei der Besichtigung schlaegt das Fenster den Notartermin bzw. dessen Vortag
 * vor (`notarVorschlag`, siehe `besichtigungsVorschlag`) und bietet „online"
 * als Ort an.
 */
export function StufenTerminDialog({
  stufe,
  kundeName,
  notarVorschlag,
  ortVorschlag,
  onAbbrechen,
  onSpeichern,
}: {
  /** `null` heisst geschlossen. */
  stufe: TerminStufe | null;
  kundeName?: string;
  /** Notartermin des Investments, falls eingetragen (nur Besichtigung). */
  notarVorschlag?: { datum: string; uhrzeit: string } | null;
  /** Vorbelegung fuer den Ort, z. B. die Adresse des Objekts. */
  ortVorschlag?: string;
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
    const notar = stufe === "besichtigung" ? notarVorschlag : null;
    setDatum(notar?.datum || ""); setUhrzeit(notar?.uhrzeit || ""); setOrt(ortVorschlag || ""); setNotiz(""); setFehler(null); setLaeuft(false);
    // Nur beim Oeffnen vorbelegen, nicht bei jeder neuen Vorschlags-Referenz.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        {stufe === "besichtigung" && notarVorschlag && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">Vorschlag:</span>
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs"
              onClick={() => { setDatum(notarVorschlag.datum); if (notarVorschlag.uhrzeit) setUhrzeit(notarVorschlag.uhrzeit); }}>
              Am Notartag
            </Button>
            {vortagIso(notarVorschlag.datum) >= heuteIso() && (
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs"
                onClick={() => setDatum(vortagIso(notarVorschlag.datum))}>
                Am Vortag
              </Button>
            )}
          </div>
        )}
        <div>
          <Label className="text-xs" htmlFor="stufen-termin-ort">Ort (optional)</Label>
          <div className="mt-1 flex gap-2">
            <Input id="stufen-termin-ort" value={ort} onChange={(e) => setOrt(e.target.value)} placeholder="Adresse oder Treffpunkt" />
            {stufe === "besichtigung" && (
              <Button type="button" size="sm" variant={ort === ORT_ONLINE ? "default" : "outline"} className="shrink-0" onClick={() => setOrt(ORT_ONLINE)}>
                Online
              </Button>
            )}
          </div>
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
