import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { heuteIso, istTerminInZukunft, TERMIN_ZUKUNFT_MELDUNG } from "@/lib/kontaktPipeline";
import {
  lokalesDatum, lokaleUhrzeit, terminErschienen, terminNoShow, terminText, terminVerschieben,
  type ErgebnisKontext, type ErgebnisTermin,
} from "@/lib/terminErgebnis";

/**
 * Die drei Antworten auf einen Termin, als Dialog.
 *
 * Gebraucht wird er an zwei Stellen: in der Aktionsliste im Kundenprofil, wo
 * ein ueberfaelliger Termin abgeschlossen werden soll, und in der
 * Ergebnis-Karte im Reiter Stammdaten fuer das Verschieben. Beide Stellen
 * schreiben ueber `src/lib/terminErgebnis.ts`, also ueber dieselben drei
 * Funktionen. Hier steht nur die Oberflaeche.
 *
 * `startSchritt` bestimmt, womit der Dialog aufgeht: "wahl" zeigt die drei
 * Antworten, "verschieben" springt gleich in die Eingabe von Datum und
 * Uhrzeit, weil die Karte dafuer schon einen eigenen Knopf hat.
 */
export function TerminErgebnisDialog({
  termin,
  kontext,
  startSchritt = "wahl",
  onClose,
  onFertig,
}: {
  termin: ErgebnisTermin | null;
  kontext: ErgebnisKontext;
  startSchritt?: "wahl" | "verschieben";
  onClose: () => void;
  /** Nach einer gespeicherten Antwort, etwa um die Karte aus der Liste zu nehmen. */
  onFertig?: (termin: ErgebnisTermin, antwort: "erschienen" | "noshow" | "verschoben") => void;
}) {
  const { toast } = useToast();
  const [schritt, setSchritt] = useState<"wahl" | "verschieben">(startSchritt);
  const [laeuft, setLaeuft] = useState(false);
  const [neuDatum, setNeuDatum] = useState("");
  const [neuUhrzeit, setNeuUhrzeit] = useState("");
  // Christians Wunsch: beim Verschieben gleich eine Folgeaufgabe setzen
  // koennen. Voreingestellt an, weil ein verschobener Termin sonst leicht
  // wieder untergeht.
  const [folgeaufgabe, setFolgeaufgabe] = useState(true);

  // Bei jedem neuen Termin von vorn beginnen, sonst stuende im Dialog noch
  // die Zeit des zuletzt geoeffneten Termins.
  useEffect(() => {
    if (!termin) return;
    setSchritt(startSchritt);
    setLaeuft(false);
    setFolgeaufgabe(true);
    setNeuDatum(lokalesDatum(termin.startAt));
    setNeuUhrzeit(lokaleUhrzeit(termin.startAt));
  }, [termin, startSchritt]);

  if (!termin) return null;

  const fuehreAus = async (
    antwort: "erschienen" | "noshow" | "verschoben",
    tun: () => Promise<boolean>,
  ) => {
    if (laeuft) return;
    setLaeuft(true);
    let ok = false;
    try { ok = await tun(); } finally { setLaeuft(false); }
    if (!ok) return;
    onFertig?.(termin, antwort);
    onClose();
  };

  const verschieben = async () => {
    if (!neuDatum || !neuUhrzeit) return;
    if (!istTerminInZukunft(neuDatum, neuUhrzeit)) {
      toast({ title: TERMIN_ZUKUNFT_MELDUNG, variant: "destructive" });
      return;
    }
    await fuehreAus("verschoben", () =>
      terminVerschieben(termin, neuDatum, neuUhrzeit, kontext, { folgeaufgabe }));
  };

  return (
    <Dialog open onOpenChange={(offen) => { if (!offen && !laeuft) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{schritt === "verschieben" ? "Termin verschieben" : `${termin.titel}: Ergebnis`}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">
          Termin: <strong>{terminText(termin.startAt)}</strong>
        </p>

        {schritt === "wahl" ? (
          <>
            <div className="grid gap-2">
              <Button
                variant="outline"
                className="justify-start gap-2 border-[hsl(var(--success))]/40 hover:bg-[hsl(var(--success))]/10"
                disabled={laeuft}
                onClick={() => void fuehreAus("erschienen", () => terminErschienen(termin, kontext))}
              >
                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" /> Stattgefunden
              </Button>
              <Button
                variant="outline"
                className="justify-start gap-2 border-destructive/40 hover:bg-destructive/10"
                disabled={laeuft}
                onClick={() => void fuehreAus("noshow", () => terminNoShow(termin, kontext))}
              >
                <XCircle className="h-4 w-4 text-destructive" /> Nicht stattgefunden
              </Button>
              <Button
                variant="outline"
                className="justify-start gap-2 border-[hsl(var(--warning))]/40 hover:bg-[hsl(var(--warning))]/10"
                disabled={laeuft}
                onClick={() => setSchritt("verschieben")}
              >
                <RefreshCw className="h-4 w-4 text-[hsl(var(--warning))]" /> Verschoben
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs" htmlFor="termin-neu-datum">Neues Datum</Label>
                <Input
                  id="termin-neu-datum"
                  type="date"
                  className="mt-1"
                  min={heuteIso()}
                  value={neuDatum}
                  onChange={(e) => setNeuDatum(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs" htmlFor="termin-neu-uhrzeit">Neue Uhrzeit</Label>
                <Input
                  id="termin-neu-uhrzeit"
                  type="time"
                  className="mt-1"
                  value={neuUhrzeit}
                  onChange={(e) => setNeuUhrzeit(e.target.value)}
                />
              </div>
            </div>
            <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
              <Checkbox
                className="mt-0.5"
                checked={folgeaufgabe}
                onCheckedChange={(wert) => setFolgeaufgabe(wert === true)}
              />
              <span>Folgeaufgabe anlegen, damit der Kunde einen Tag vorher erinnert wird</span>
            </label>
            <Button onClick={() => void verschieben()} disabled={!neuDatum || !neuUhrzeit || laeuft}>
              Verschieben
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
