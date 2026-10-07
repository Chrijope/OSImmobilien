import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { hinweisDialog } from "@/lib/confirm";
import { updateWohnung, type ObjektWohnung } from "@/lib/objekteStore";

/**
 * Pflege der Einheitenfelder für Objektseite und Exposé: Stadtteil,
 * Sanierung, Nebenkosten, Mietgarantie, Verwaltung und Mietbeginn.
 *
 * Stadtteil, Sanierungsjahr und Sanierungsanteil kommen aus Investagon,
 * sobald die API sie liefert; bis dahin (und wenn sie fehlen) werden sie
 * hier gepflegt. Der Import überschreibt nur, was er tatsächlich bekommt.
 */

type Feld = "stadtteil" | "sanierungsjahr" | "sanierungAnteilProzent" | "sanierungAnteilBetrag" | "nebenkostenMonat"
  | "mietgarantieKalt" | "mietgarantieMonate" | "verwaltungWegMonat" | "verwaltungSevMonat" | "vermietetSeit";

type Werte = Record<Feld, string> & { sevErstesJahrInklusive: boolean };

function ausWohnung(w: ObjektWohnung): Werte {
  const s = (v: unknown) => (v === undefined || v === null ? "" : String(v));
  return {
    stadtteil: s(w.stadtteil),
    sanierungsjahr: s(w.sanierungsjahr),
    sanierungAnteilProzent: s(w.sanierungAnteilProzent),
    sanierungAnteilBetrag: s(w.sanierungAnteilBetrag),
    nebenkostenMonat: s(w.nebenkostenMonat),
    mietgarantieKalt: s(w.mietgarantieKalt),
    mietgarantieMonate: s(w.mietgarantieMonate),
    verwaltungWegMonat: s(w.verwaltungWegMonat),
    verwaltungSevMonat: s(w.verwaltungSevMonat),
    vermietetSeit: s(w.vermietetSeit),
    sevErstesJahrInklusive: !!w.sevErstesJahrInklusive,
  };
}

const zahl = (v: string): number | undefined => {
  const t = v.trim();
  if (!t) return undefined;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Ein Eingabefeld mit Beschriftung. Steht bewusst außerhalb des Dialogs:
 * Eine im Dialog definierte Komponente würde bei jedem Render neu erzeugt,
 * und das Eingabefeld verlöre bei jedem Tastendruck den Fokus.
 */
function Feldzeile({ label, platzhalter, hinweis, wert, onChange, text }: {
  label: string; platzhalter?: string; hinweis?: string; wert: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; text: boolean;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input value={wert} onChange={onChange} placeholder={platzhalter} inputMode={text ? undefined : "decimal"} />
      {hinweis && <p className="mt-1 text-[11px] text-muted-foreground">{hinweis}</p>}
    </div>
  );
}

export function EinheitFelderDialog({ objektId, wohnung, offen, onOpenChange, onGespeichert }: {
  objektId: string;
  wohnung: ObjektWohnung;
  offen: boolean;
  onOpenChange: (o: boolean) => void;
  onGespeichert?: () => void;
}) {
  const [w, setW] = useState<Werte>(() => ausWohnung(wohnung));
  const [speichert, setSpeichert] = useState(false);

  useEffect(() => { if (offen) setW(ausWohnung(wohnung)); }, [offen, wohnung]);

  const set = (feld: Feld) => (e: React.ChangeEvent<HTMLInputElement>) => setW((p) => ({ ...p, [feld]: e.target.value }));

  const speichern = async () => {
    setSpeichert(true);
    try {
      const fehler = await updateWohnung(objektId, wohnung.id, {
        stadtteil: w.stadtteil.trim() || undefined,
        sanierungsjahr: zahl(w.sanierungsjahr),
        sanierungAnteilProzent: zahl(w.sanierungAnteilProzent),
        sanierungAnteilBetrag: zahl(w.sanierungAnteilBetrag),
        nebenkostenMonat: zahl(w.nebenkostenMonat),
        mietgarantieKalt: zahl(w.mietgarantieKalt),
        mietgarantieMonate: zahl(w.mietgarantieMonate),
        verwaltungWegMonat: zahl(w.verwaltungWegMonat),
        verwaltungSevMonat: zahl(w.verwaltungSevMonat),
        sevErstesJahrInklusive: w.sevErstesJahrInklusive || undefined,
        vermietetSeit: w.vermietetSeit.trim() || undefined,
      });
      // Abgelehnt oder nicht gespeichert: sagen, statt Erfolg vorzutäuschen.
      if (fehler) {
        await hinweisDialog({
          title: "Einheit nicht gespeichert",
          description: (fehler as { message?: string }).message || "Die Einheit konnte nicht gespeichert werden.",
          buttonText: "Verstanden",
        });
        return;
      }
      toast.success("Einheit gespeichert.");
      onOpenChange(false);
      onGespeichert?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Die Einheit konnte nicht gespeichert werden.");
    } finally {
      setSpeichert(false);
    }
  };

  // Als Funktionsaufruf, nicht als eigene Komponente: So bleibt der
  // Elementtyp `Feldzeile` über alle Renders gleich und der Fokus erhalten.
  const feld = (name: Feld, label: string, platzhalter?: string, hinweis?: string) => (
    <Feldzeile key={name} label={label} platzhalter={platzhalter} hinweis={hinweis} wert={w[name]} onChange={set(name)}
      text={name === "stadtteil" || name === "vermietetSeit"} />
  );

  return (
    <Dialog open={offen} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-xl flex-col overflow-y-auto">
        <DialogHeader><DialogTitle>Einheit {wohnung.weNr} pflegen</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Stadtteil, Sanierungsjahr und Sanierungsanteil übernimmt der Investagon-Abgleich, sobald er sie liefert. Alles andere wird hier gepflegt.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {feld("stadtteil", "Stadtteil", "Göggingen")}
          {feld("sanierungsjahr", "Sanierungsjahr", "2024")}
          {feld("sanierungAnteilProzent", "Sanierungsanteil in %", "11,8", "Anteil nach Miteigentumsanteil")}
          {feld("sanierungAnteilBetrag", "Sanierungsanteil in €", "21240")}
          {feld("nebenkostenMonat", "Nebenkosten je Monat in €", "95", "Für die Warmmiete")}
          {feld("vermietetSeit", "Vermietet seit", "2023-04", "Jahr-Monat, nur bei vermieteten Einheiten")}
          {feld("mietgarantieKalt", "Erstvermietung garantiert, kalt in €", "790", "Nur bei Neubau oder Leerstand")}
          {feld("mietgarantieMonate", "Garantie in Monaten", "24")}
          {feld("verwaltungWegMonat", "WEG-Verwaltung je Monat in €", "28")}
          {feld("verwaltungSevMonat", "SEV je Monat in €", "25")}
        </div>
        <div className="flex items-center gap-2 pt-1">
          <Switch id="sev-inkl" checked={w.sevErstesJahrInklusive} onCheckedChange={(v) => setW((p) => ({ ...p, sevErstesJahrInklusive: v }))} />
          <Label htmlFor="sev-inkl" className="text-sm">SEV im ersten Jahr inklusive</Label>
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
