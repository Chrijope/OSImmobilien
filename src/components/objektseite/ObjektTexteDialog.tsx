import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Hinweis } from "@/components/objektseite/Bausteine";
import { toast } from "sonner";
import type { ObjektData } from "@/lib/objekteStore";
import {
  ANZAHL_MARKTARGUMENTE,
  ANZAHL_STANDORTARGUMENTE,
  anzuzeigendeObjektTexte,
  MAX_ARGUMENT,
  MAX_KURZBESCHREIBUNG,
  objektTexte,
  speichereGepflegteTexte,
} from "@/lib/objektTexteKi";
import { cn } from "@/lib/utils";

/**
 * Beschreibung und Standortargumente von Hand ändern. Nur für den Admin.
 *
 * SEIT DEM 23.09.2026
 *
 * Die Texte entstehen automatisch, Knöpfe zum Erzeugen und Löschen gibt es
 * nicht mehr (Christians Vorgabe). Der Admin kann den vorgeschriebenen Text
 * aber jederzeit abändern, und zwar hier. Was er speichert, steht in
 * `meta.kurzbeschreibung` und `meta.standortargumente` und gilt als von Hand
 * gepflegt: Der Serverlauf ersetzt ein Feld nur, wenn es leer ist oder
 * wortgleich den vorigen automatischen Stand trägt (`texteInGepflegteFelder`).
 *
 * „Automatischen Text wiederherstellen“ setzt nur die Felder zurück. Erst
 * „Speichern“ schreibt, deshalb braucht es keine Rückfrage: Wer es sich anders
 * überlegt, nimmt „Verwerfen“. Wortgleich gespeichert gilt der Text wieder als
 * automatisch, und der nächste Lauf darf ihn erneuern.
 *
 * Die Karte hängt den Dialog nur ein, solange er offen ist. Vorbelegt wird
 * deshalb genau einmal, beim Öffnen, und eine Live-Aktualisierung der Seite
 * wirft das Getippte nicht weg.
 *
 * Seit Fassung 3 kommen drei Felder für die Marktargumente dazu
 * (`meta.marktargumente`). Anders als die fünf Standortargumente dürfen sie
 * leer bleiben: Nicht zu jedem Ort gibt es Marktdaten.
 */

/** Genau so viele Felder, wie Argumente vorgesehen sind. */
function argumentFelder(liste: string[], anzahl = ANZAHL_STANDORTARGUMENTE): string[] {
  return Array.from({ length: anzahl }, (_, i) => liste[i] ?? "");
}

function gleicheListe(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

export function ObjektTexteDialog({ objekt, onOpenChange, onGespeichert }: {
  /** Das Objekt mit dem Stand, den die Karte gerade zeigt. Auf ihm wird auch gespeichert. */
  objekt: Pick<ObjektData, "id" | "meta" | "globalDaten">;
  onOpenChange: (offen: boolean) => void;
  /** Das geschriebene `meta`, damit die Karte es sofort zeigen kann. */
  onGespeichert?: (meta: Record<string, unknown>) => void;
}) {
  const [start] = useState(() => anzuzeigendeObjektTexte(objekt));
  const [kurzText, setKurzText] = useState(start.kurzbeschreibung);
  const [argumente, setArgumente] = useState(() => argumentFelder(start.standortargumente));
  const [markt, setMarkt] = useState(() => argumentFelder(start.marktargumente, ANZAHL_MARKTARGUMENTE));
  const [speichert, setSpeichert] = useState(false);

  // Der automatisch erstellte Stand, falls es einen gibt. Er ist das Ziel
  // von „Automatischen Text wiederherstellen“.
  const automatisch = useMemo(() => {
    const vorschlag = objektTexte(objekt);
    if (!vorschlag) return undefined;
    const liste = vorschlag.standortargumente.map((a) => a.argument);
    const marktListe = (vorschlag.marktargumente ?? []).map((a) => a.argument);
    if (!vorschlag.kurzbeschreibung && liste.length === 0 && marktListe.length === 0) return undefined;
    return { kurzbeschreibung: vorschlag.kurzbeschreibung, standortargumente: liste, marktargumente: marktListe };
  }, [objekt]);

  const kurz = kurzText.trim();
  const gefuellt = argumente.map((a) => a.trim()).filter(Boolean);
  const gefuelltMarkt = markt.map((a) => a.trim()).filter(Boolean);
  const entsprichtAutomatik =
    !!automatisch &&
    kurz === automatisch.kurzbeschreibung &&
    gleicheListe(gefuellt, automatisch.standortargumente) &&
    gleicheListe(gefuelltMarkt, automatisch.marktargumente);

  /*
   * Was dem Speichern im Weg steht.
   *
   * Vorgesehen sind eine Beschreibung und genau fünf Argumente. Der
   * automatische Stand darf trotzdem so gespeichert werden, wie er ist, auch
   * wenn der Lauf einmal weniger Argumente belegen konnte: Sonst liesse sich
   * der Weg zurück nicht gehen.
   */
  const fehlt: string[] = [];
  if (!entsprichtAutomatik) {
    if (!kurz) fehlt.push("die Beschreibung");
    const leer = argumente.flatMap((a, i) => (a.trim() ? [] : [i + 1]));
    if (leer.length === 1) fehlt.push(`Argument ${leer[0]}`);
    else if (leer.length > 1) fehlt.push(`die Argumente ${leer.join(", ")}`);
  }
  const kurzZuLang = kurz.length > MAX_KURZBESCHREIBUNG;
  const argumentZuLang = [...argumente, ...markt].some((a) => a.trim().length > MAX_ARGUMENT);
  const darfSpeichern = fehlt.length === 0 && !kurzZuLang && !argumentZuLang && !speichert;

  const setzeArgument = (i: number, wert: string) =>
    setArgumente((alt) => alt.map((a, j) => (j === i ? wert : a)));
  const setzeMarkt = (i: number, wert: string) =>
    setMarkt((alt) => alt.map((a, j) => (j === i ? wert : a)));

  const automatikZurueck = () => {
    if (!automatisch) return;
    setKurzText(automatisch.kurzbeschreibung);
    setArgumente(argumentFelder(automatisch.standortargumente));
    setMarkt(argumentFelder(automatisch.marktargumente, ANZAHL_MARKTARGUMENTE));
  };

  const speichern = async () => {
    if (!darfSpeichern) return;
    setSpeichert(true);
    try {
      const ergebnis = await speichereGepflegteTexte(objekt, {
        kurzbeschreibung: kurz,
        standortargumente: gefuellt,
        marktargumente: gefuelltMarkt,
      });
      if (!ergebnis.ok) {
        // Der Dialog bleibt offen, damit nichts Getipptes verloren geht.
        toast.error(ergebnis.fehler);
        return;
      }
      toast.success(entsprichtAutomatik ? "Der automatische Text steht wieder." : "Beschreibung und Standort gespeichert.");
      if (ergebnis.meta) onGespeichert?.(ergebnis.meta);
      onOpenChange(false);
    } finally {
      setSpeichert(false);
    }
  };

  return (
    <Dialog open onOpenChange={(offen) => { if (!speichert) onOpenChange(offen); }}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Beschreibung und Standort bearbeiten</DialogTitle>
          <DialogDescription>
            Was du hier änderst, gilt als von Hand gepflegt und erscheint auf Objektseite, Einheitsseite und im Exposé. Der automatische Lauf überschreibt es dann nicht mehr.
          </DialogDescription>
        </DialogHeader>

        <div>
          <Label htmlFor="objekt-texte-beschreibung" className="text-xs">Beschreibung</Label>
          <Textarea
            id="objekt-texte-beschreibung"
            rows={9}
            value={kurzText}
            onChange={(e) => setKurzText(e.target.value)}
            className="mt-1"
          />
          <Hinweis className="mt-1">
            <span className={cn(kurzZuLang && "font-semibold text-destructive")}>
              {kurz.length} von {MAX_KURZBESCHREIBUNG} Zeichen.
            </span>{" "}
            Etwa fünf bis sieben Sätze.
          </Hinweis>
        </div>

        <div className="space-y-3">
          <div className="text-xs font-medium">Standortargumente</div>
          {argumente.map((a, i) => {
            const laenge = a.trim().length;
            return (
              <div key={i}>
                <Label htmlFor={`objekt-texte-argument-${i + 1}`} className="text-xs text-muted-foreground">Argument {i + 1}</Label>
                <Textarea
                  id={`objekt-texte-argument-${i + 1}`}
                  rows={2}
                  value={a}
                  onChange={(e) => setzeArgument(i, e.target.value)}
                  className="mt-1 min-h-[60px]"
                />
                <p className={cn("mt-1 text-right text-[11px] text-muted-foreground", laenge > MAX_ARGUMENT && "font-semibold text-destructive")}>
                  {laenge} von {MAX_ARGUMENT} Zeichen
                </p>
              </div>
            );
          })}
          {start.standortargumente.length > ANZAHL_STANDORTARGUMENTE && (
            <Hinweis className="mt-0">
              Bisher standen hier {start.standortargumente.length} Argumente. Gespeichert werden die {ANZAHL_STANDORTARGUMENTE} Felder oben.
            </Hinweis>
          )}
        </div>

        <div className="space-y-3">
          <div className="text-xs font-medium">Markt und Standort</div>
          <Hinweis className="mt-0">
            Bis zu {ANZAHL_MARKTARGUMENTE} Argumente aus der Marktanalyse, jedes mit Quelle und Stand. Leere Felder sind erlaubt.
          </Hinweis>
          {markt.map((a, i) => {
            const laenge = a.trim().length;
            return (
              <div key={i}>
                <Label htmlFor={`objekt-texte-markt-${i + 1}`} className="text-xs text-muted-foreground">Marktargument {i + 1}</Label>
                <Textarea
                  id={`objekt-texte-markt-${i + 1}`}
                  rows={2}
                  value={a}
                  onChange={(e) => setzeMarkt(i, e.target.value)}
                  className="mt-1 min-h-[60px]"
                />
                <p className={cn("mt-1 text-right text-[11px] text-muted-foreground", laenge > MAX_ARGUMENT && "font-semibold text-destructive")}>
                  {laenge} von {MAX_ARGUMENT} Zeichen
                </p>
              </div>
            );
          })}
        </div>

        {automatisch && (
          <div className="rounded-xl border border-border/60 p-3">
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={automatikZurueck} disabled={entsprichtAutomatik || speichert}>
              <RotateCcw className="h-3.5 w-3.5" /> Automatischen Text wiederherstellen
            </Button>
            <Hinweis className="mt-2">
              {entsprichtAutomatik
                ? "In den Feldern steht der automatisch erstellte Text."
                : "Setzt die Felder auf den automatisch erstellten Text zurück. Gespeichert wird erst mit „Speichern“."}
            </Hinweis>
          </div>
        )}

        {(fehlt.length > 0 || kurzZuLang || argumentZuLang) && (
          <p className="text-xs text-destructive" role="status">
            {[
              fehlt.length > 0 ? `Zum Speichern fehlt noch ${fehlt.join(" und ")}.` : "",
              kurzZuLang ? `Die Beschreibung ist länger als ${MAX_KURZBESCHREIBUNG} Zeichen.` : "",
              argumentZuLang ? `Ein Argument ist länger als ${MAX_ARGUMENT} Zeichen.` : "",
            ].filter(Boolean).join(" ")}
          </p>
        )}

        {/*
          Auf dem Handy klebt die Knopfleiste unten im Dialog: Das Formular ist
          länger als der Bildschirm, und Speichern oder Abbrechen standen erst
          nach dem Scrollen bis ganz unten. -bottom-6 statt bottom-0, weil
          „sticky" am Innenrand des Dialogs hält und darunter sonst der
          Formularinhalt durchschaute. Ab sm wieder wie vorher.
        */}
        <div className="sticky -bottom-6 z-10 -mb-6 flex justify-end gap-2 border-t border-border/60 bg-card pb-6 pt-3 sm:static sm:mb-0 sm:border-t-0 sm:bg-transparent sm:pb-0 sm:pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={speichert}>Verwerfen</Button>
          <Button type="button" onClick={speichern} disabled={!darfSpeichern}>{speichert ? "Wird gespeichert..." : "Speichern"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
