import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { updateObjektFieldFast, type ObjektData } from "@/lib/objekteStore";
import { OBJEKTARTEN, objektseiteFelder, objektseiteFelderInMeta, objektseiteHandwerte, type ObjektseiteFelder, type Objektart } from "@/lib/objektseiteDaten";
import { objektdetailsAnzeige } from "@/lib/objektdetailsAnzeige";

/**
 * Pflege der Objektfelder, die Investagon nicht liefert: Objektart,
 * Energieausweis, Einheiten im Haus, Gemeinschaftseigentum, Sanierungen und
 * Verwaltung.
 *
 * Geöffnet wird er seit dem 23.09.2026 nur noch vom Admin, über den Stift an
 * den Objektdetails der Objektseite beziehungsweise an den Objektangaben der
 * Einheitsseite eines Einzelobjekts.
 *
 * KURZBESCHREIBUNG UND STANDORTARGUMENTE NICHT MEHR HIER
 *
 * Seit demselben Tag entstehen sie immer automatisch und haben ihre eigene
 * Karte mit eigenem Dialog (`ObjektTexteDialog`): Zeichenzähler bis 1000,
 * genau fünf Argumente, Weg zurück zum automatischen Text. Stünden sie
 * zusätzlich hier, gäbe es zwei Wege mit verschiedenen Regeln. Beim Speichern
 * übernimmt dieser Dialog beide Felder wortgleich aus dem `meta`, das die
 * Seite gerade hat, statt sie aus seinen Formularwerten neu zu bilden. So
 * bleibt ein automatischer Text automatisch und ein gepflegter gepflegt.
 *
 * Bewusst ein eigener Dialog auf der Objektseite und keine Erweiterung des
 * großen Objektformulars: Dort wird in Lovable häufig parallel gearbeitet,
 * und die Felder gehören inhaltlich zur Objektseite. Gespeichert wird nur
 * das `meta` der Objektzeile, Bilder, Dokumente und Wohnungen bleiben
 * unangetastet.
 *
 * Der Dialog liest und schreibt ausschließlich die Handwerte
 * (`objektseiteHandwerte`). Was die Seite ohne Eintrag zeigt, etwa die
 * Energieklasse aus Investagon oder die Sanierungen aus den Angaben des
 * Bauträgers, steht nur als Hinweis unter dem Feld. Stünde es im Feld, würde
 * es beim Speichern zur Handeingabe und überdeckte jeden späteren Abgleich.
 */

const ENERGIEKLASSEN = ["A+", "A", "B", "C", "D", "E", "F", "G", "H"];
const KEINE = "__keine__";
const TEXT_SCHLUESSEL = ["kurzbeschreibung", "standortargumente"] as const;

export function ObjektseiteFelderDialog({ objekt, offen, onOpenChange, onGespeichert }: {
  objekt: ObjektData;
  offen: boolean;
  onOpenChange: (o: boolean) => void;
  onGespeichert?: () => void;
}) {
  const [f, setF] = useState<ObjektseiteFelder>(() => objektseiteHandwerte(objekt));
  const [speichert, setSpeichert] = useState(false);

  useEffect(() => {
    if (!offen) return;
    setF(objektseiteHandwerte(objekt));
  }, [offen, objekt]);

  const setEa = (key: keyof ObjektseiteFelder["energieausweis"], wert: string) =>
    setF((p) => ({ ...p, energieausweis: { ...p.energieausweis, [key]: key === "kennwert" ? (wert === "" ? undefined : Number(wert.replace(",", "."))) : wert } }));

  const setSan = (i: number, key: "jahr" | "massnahme" | "betrag", wert: string) =>
    setF((p) => {
      const liste = p.sanierungen.map((s, j) => (j === i ? { ...s, [key]: key === "betrag" ? (wert === "" ? undefined : Number(wert.replace(",", "."))) : wert } : s));
      return { ...p, sanierungen: liste };
    });

  // Was ohne Eintrag angezeigt wird, nur für die Hinweise unter den Feldern.
  // Gerechnet am Objekt ohne Handwerte, aber mit der gerade gewählten
  // Objektart, denn an ihr hängt die SEV-Verwaltung.
  const ohneEintrag = { ...objekt, meta: objektseiteFelderInMeta(objekt.meta, { objektart: f.objektart, standortargumente: [], energieausweis: {}, sanierungen: [] }) };
  const abgeleitet = objektdetailsAnzeige(ohneEintrag);
  const eaAnzeige = objektseiteFelder(ohneEintrag).energieausweis;
  const eaOhneEintrag = [eaAnzeige.art, eaAnzeige.klasse ? `Klasse ${eaAnzeige.klasse}` : ""].filter(Boolean).join(", ");
  const eaLeer = !f.energieausweis.art && !f.energieausweis.klasse;

  const speichern = async () => {
    setSpeichert(true);
    try {
      const vorher = (objekt.meta || {}) as Record<string, unknown>;
      const meta = objektseiteFelderInMeta(vorher, f);
      // Beschreibung und Standortargumente pflegt dieser Dialog nicht, sie
      // bleiben wortgleich so, wie sie jetzt am Objekt stehen (siehe oben).
      for (const schluessel of TEXT_SCHLUESSEL) {
        if (schluessel in vorher) meta[schluessel] = vorher[schluessel];
        else delete meta[schluessel];
      }
      await updateObjektFieldFast(objekt.id, { meta });
      toast.success("Objektangaben gespeichert.");
      onOpenChange(false);
      onGespeichert?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Die Angaben konnten nicht gespeichert werden.");
    } finally {
      setSpeichert(false);
    }
  };

  return (
    <Dialog open={offen} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-y-auto">
        <DialogHeader><DialogTitle>Objektangaben pflegen</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Was du hier einträgst, gewinnt vor den Angaben aus Investagon und vom Bauträger und erscheint auf Objektseite, Einheiten-Seite und im Exposé. Ein leeres Feld zeigt weiter, was darunter als Hinweis steht. Beschreibung und Standortargumente änderst du über den Stift an ihrer eigenen Karte.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Objektart</Label>
            <Select value={f.objektart ?? KEINE} onValueChange={(v) => setF((p) => ({ ...p, objektart: v === KEINE ? undefined : (v as Objektart) }))}>
              <SelectTrigger><SelectValue placeholder="Bitte wählen" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={KEINE}>Nicht festgelegt</SelectItem>
                {OBJEKTARTEN.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Verwaltung</Label>
            <Input value={f.verwaltung ?? ""} onChange={(e) => setF((p) => ({ ...p, verwaltung: e.target.value }))} placeholder="Hausverwaltung Beispiel GmbH, Augsburg" />
            <p className="mt-1 text-xs text-muted-foreground">Name des Verwalters. Als Verwaltung steht immer „{abgeleitet.verwaltung.wert}“, der Name darunter.</p>
          </div>
        </div>

        <div className="rounded-xl border border-border/60 p-3">
          <div className="mb-2 text-sm font-semibold">Energieausweis</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Art</Label>
              <Select value={f.energieausweis.art ?? KEINE} onValueChange={(v) => setEa("art", v === KEINE ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Bitte wählen" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={KEINE}>Nicht angegeben</SelectItem>
                  <SelectItem value="Verbrauchsausweis">Verbrauchsausweis</SelectItem>
                  <SelectItem value="Bedarfsausweis">Bedarfsausweis</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Klasse</Label>
              <Select value={f.energieausweis.klasse ?? KEINE} onValueChange={(v) => setEa("klasse", v === KEINE ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Bitte wählen" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={KEINE}>Nicht angegeben</SelectItem>
                  {ENERGIEKLASSEN.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Kennwert in kWh je m² und Jahr</Label>
              <Input inputMode="decimal" value={f.energieausweis.kennwert ?? ""} onChange={(e) => setEa("kennwert", e.target.value)} placeholder="121" />
            </div>
            <div>
              <Label className="text-xs">Energieträger</Label>
              <Input value={f.energieausweis.energietraeger ?? ""} onChange={(e) => setEa("energietraeger", e.target.value)} placeholder="Gas, Fernwärme, Wärmepumpe" />
            </div>
            <div>
              <Label className="text-xs">Gültig bis</Label>
              <Input value={f.energieausweis.gueltigBis ?? ""} onChange={(e) => setEa("gueltigBis", e.target.value)} placeholder="2034 oder 2034-05-31" />
            </div>
          </div>
          {eaLeer && eaOhneEintrag && <p className="mt-2 text-xs text-muted-foreground">Ohne Eintrag zeigt die Seite: {eaOhneEintrag}.</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="text-xs" htmlFor="einheiten-im-haus">Einheiten im Haus</Label>
            <Input id="einheiten-im-haus" type="number" inputMode="numeric" min={1} step={1}
              value={f.einheitenImHaus ?? ""}
              onChange={(e) => {
                const n = Number(e.target.value);
                setF((p) => ({ ...p, einheitenImHaus: e.target.value === "" || !Number.isInteger(n) || n < 1 ? undefined : n }));
              }}
              placeholder="14" data-testid="einheiten-im-haus" />
            <p className="mt-1 text-xs text-muted-foreground">Alle Wohneinheiten des Gebäudes, auch die verkauften und die nicht im Angebot. Ohne Eintrag steht nirgends eine Einheitenzahl.</p>
          </div>
        </div>

        <div>
          <Label className="text-xs">Gemeinschaftseigentum</Label>
          <Textarea rows={3} value={f.gemeinschaftseigentum ?? ""} onChange={(e) => setF((p) => ({ ...p, gemeinschaftseigentum: e.target.value }))}
            placeholder="5 Etagen, kein Aufzug, Keller je Einheit, Fahrradraum, 8 Außenstellplätze, Grundstück 780 m²" />
          {!f.gemeinschaftseigentum?.trim() && (
            <p className="mt-1 text-xs text-muted-foreground">
              Ohne Eintrag zeigt die Seite: {abgeleitet.gemeinschaftseigentum.angaben.length ? abgeleitet.gemeinschaftseigentum.angaben.join(", ") : abgeleitet.gemeinschaftseigentum.wert}.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-border/60 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold">Sanierungen am Gemeinschaftseigentum</div>
            <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => setF((p) => ({ ...p, sanierungen: [...p.sanierungen, { jahr: "", massnahme: "" }] }))}>
              <Plus className="h-3.5 w-3.5" /> Zeile
            </Button>
          </div>
          {f.sanierungen.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Noch keine Sanierung eingetragen. Ohne Eintrag zeigt die Seite: {[abgeleitet.sanierungen.wert, abgeleitet.sanierungen.unter].filter(Boolean).join(", ")}.
            </p>
          )}
          <div className="space-y-2">
            {f.sanierungen.map((s, i) => (
              <div key={i} className="grid grid-cols-[5rem_1fr_7rem_auto] items-end gap-2">
                <div><Label className="text-xs">Jahr</Label><Input value={s.jahr} onChange={(e) => setSan(i, "jahr", e.target.value)} placeholder="2024" /></div>
                <div><Label className="text-xs">Maßnahme</Label><Input value={s.massnahme} onChange={(e) => setSan(i, "massnahme", e.target.value)} placeholder="Dach, Fassade, Fenster" /></div>
                <div><Label className="text-xs">Betrag in €</Label><Input inputMode="decimal" value={s.betrag ?? ""} onChange={(e) => setSan(i, "betrag", e.target.value)} placeholder="180000" /></div>
                <Button type="button" size="icon" variant="ghost" aria-label="Zeile entfernen" onClick={() => setF((p) => ({ ...p, sanierungen: p.sanierungen.filter((_, j) => j !== i) }))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/*
          Auf dem Handy klebt die Knopfleiste unten im Dialog: Das Formular ist
          länger als der Bildschirm, und Speichern oder Abbrechen standen erst
          nach dem Scrollen bis ganz unten. -bottom-6 statt bottom-0, weil
          „sticky" am Innenrand des Dialogs hält und darunter sonst der
          Formularinhalt durchschaute. Ab sm wieder wie vorher.
        */}
        <div className="sticky -bottom-6 z-10 -mb-6 flex justify-end gap-2 border-t border-border/60 bg-card pb-6 pt-3 sm:static sm:mb-0 sm:border-t-0 sm:bg-transparent sm:pb-0 sm:pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button type="button" onClick={speichern} disabled={speichert}>{speichert ? "Speichert…" : "Speichern"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
