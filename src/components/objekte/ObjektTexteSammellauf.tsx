import { useMemo, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import { cacheReload } from "@/lib/dataCache";
import type { ObjektData } from "@/lib/objekteStore";
import {
  KONTINGENT_STUNDE,
  objektTexteSammellauf,
  teileObjekteAuf,
  type SammellaufBericht,
  type SammellaufFortschritt,
} from "@/lib/objektTexteSammellauf";

/**
 * Der Sammellauf für Kurzbeschreibung und Standortargumente.
 *
 * Bisher entstanden die Texte nur, wenn jemand die Objektseite eines einzelnen
 * Objekts öffnete. Dieser Knopf holt sie für alle Objekte der aktuellen Liste
 * nach, eines nach dem anderen.
 *
 * WAS ER NICHT IST
 *
 * Keine Zugriffskontrolle. Der Knopf hängt an denselben Rollen wie „Neues
 * Objekt" in der Objektübersicht, aber entscheiden tun die Regeln der
 * Datenbank: Die Edge Function liest und schreibt mit dem Anmeldetoken des
 * Aufrufers, wer ein Objekt nicht ändern darf, ändert es auch über diesen Weg
 * nicht.
 *
 * WAS EIN ABBRUCH TUT
 *
 * Er hält vor dem nächsten Objekt an. Alles, was schon geschrieben wurde,
 * bleibt stehen. Der Lauf lässt sich jederzeit fortsetzen, er überspringt dann
 * alles, was inzwischen einen Text hat.
 */
export function ObjektTexteSammellauf({ objekte }: { objekte: ObjektData[] }) {
  const [offen, setOffen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [fortschritt, setFortschritt] = useState<SammellaufFortschritt | undefined>(undefined);
  const [bericht, setBericht] = useState<SammellaufBericht | undefined>(undefined);
  /*
   * Der Abbruchwunsch steht doppelt: im Ref für die Schleife, im Zustand für
   * die Anzeige.
   *
   * Die Schleife läuft in einem Versprechen und würde einen neuen Zustand erst
   * beim nächsten Zeichnen sehen, sie soll aber sofort anhalten. Der Knopf
   * wiederum muss sich sofort ändern, und dafür braucht es ein Zeichnen.
   */
  const abbruch = useRef(false);
  const [halteAn, setHalteAn] = useState(false);

  const aufteilung = useMemo(() => teileObjekteAuf(objekte), [objekte]);
  const zuTun = aufteilung.offen.length;
  const inDiesemLauf = Math.min(zuTun, KONTINGENT_STUNDE);

  const starten = async () => {
    abbruch.current = false;
    setHalteAn(false);
    setBericht(undefined);
    setLaeuft(true);
    try {
      const ergebnis = await objektTexteSammellauf(objekte, {
        melde: setFortschritt,
        abgebrochen: () => abbruch.current,
      });
      setBericht(ergebnis);
      // Ohne das Auffrischen zeigen Kacheln und Objektseiten den alten Stand:
      // Geschrieben hat die Function in der Datenbank, der Zwischenspeicher
      // dieses Fensters weiß davon nichts.
      if (ergebnis.fertig > 0) await cacheReload("objekte");
      toast({
        title: ergebnis.fertig === 1 ? "Ein Objekt hat jetzt einen Text." : `${ergebnis.fertig} Objekte haben jetzt einen Text.`,
        description: ergebnis.nochOffen > 0
          ? `Noch offen: ${ergebnis.nochOffen}. ${ergebnis.grenzeText || "Der Lauf lässt sich jederzeit fortsetzen."}`
          : "Es ist nichts offen geblieben.",
      });
    } finally {
      setLaeuft(false);
      setFortschritt(undefined);
    }
  };

  const anteil = fortschritt && fortschritt.gesamt > 0
    ? Math.round(((fortschritt.nummer - 1) / fortschritt.gesamt) * 100)
    : 0;

  return (
    <Dialog
      open={offen}
      onOpenChange={(auf) => {
        // Während der Lauf läuft, bleibt der Dialog stehen. Sonst liefe er
        // unsichtbar weiter und niemand könnte ihn mehr anhalten.
        if (!auf && laeuft) return;
        setOffen(auf);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" title="Beschreibung und Standortargumente für mehrere Objekte erzeugen">
          <Sparkles className="h-4 w-4 mr-1" /> Texte nachziehen
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Beschreibung und Standort nachziehen</DialogTitle>
          <DialogDescription>
            Für jedes Objekt ohne aktuellen Text entstehen eine Beschreibung mit bis zu 1000 Zeichen,
            fünf Standortargumente und die Liste der Sanierungen, aus den Objektangaben, den
            Investagon-Daten, der gemessenen Umgebung und den Objektunterlagen. Die Objekte laufen
            nacheinander, der Lauf lässt sich jederzeit anhalten. Nach jedem Investagon-Abgleich holt
            der Server dasselbe in kleinen Etappen auch von selbst nach.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border p-3 text-sm space-y-1">
            <p>
              <span className="font-semibold">{zuTun}</span> von {aufteilung.offen.length + aufteilung.hatTexte.length + aufteilung.ohneGrundlage.length} Objekten in dieser Liste haben noch keinen aktuellen Text.
            </p>
            <p className="text-muted-foreground text-xs">
              Übersprungen werden {aufteilung.hatTexte.length} mit aktuellem Text und {aufteilung.ohneGrundlage.length} ohne Grundlage,
              also ohne jede Objektangabe.
            </p>
          </div>

          {zuTun > KONTINGENT_STUNDE && !laeuft && !bericht && (
            <Alert>
              <AlertTitle>In mehreren Durchgängen</AlertTitle>
              <AlertDescription>
                Die Schnittstelle nimmt {KONTINGENT_STUNDE} Läufe je Stunde an. Dieser Durchgang
                erledigt deshalb {inDiesemLauf} Objekte, der Rest bleibt für die nächste Stunde
                stehen.
              </AlertDescription>
            </Alert>
          )}

          {laeuft && fortschritt && (
            <div className="space-y-2">
              <Progress value={anteil} className="h-2" />
              <p className="text-sm">
                Objekt {fortschritt.nummer} von {fortschritt.gesamt}: {fortschritt.titel}
              </p>
              <p className="text-xs text-muted-foreground">
                {fortschritt.fertig} fertig, {fortschritt.ohneText} ohne Text.
                {halteAn ? " Wird nach diesem Objekt angehalten." : ""}
              </p>
            </div>
          )}

          {bericht && (
            <div className="space-y-3">
              <Alert>
                <AlertTitle>
                  {bericht.ende === "abgebrochen"
                    ? "Angehalten"
                    : bericht.ende === "kontingent"
                      ? "Vorerst zu Ende"
                      : bericht.ende === "nicht-ausgerollt"
                        ? "Die Function ist nicht bereit"
                        : "Fertig"}
                </AlertTitle>
                <AlertDescription>
                  <ul className="list-disc pl-5 space-y-0.5 text-sm">
                    <li>{bericht.fertig} mit neuem Text</li>
                    <li>{bericht.uebersprungenHatTexte} übersprungen, es stand schon ein Text da</li>
                    <li>{bericht.uebersprungenOhneGrundlage} übersprungen, die Grundlage fehlt</li>
                    {bericht.fehlgeschlagen > 0 && <li>{bericht.fehlgeschlagen} fehlgeschlagen</li>}
                    <li>{bericht.nochOffen} noch offen</li>
                  </ul>
                  {bericht.grenzeText && <p className="mt-2 text-sm">{bericht.grenzeText}</p>}
                </AlertDescription>
              </Alert>

              {bericht.ohneText.length > 0 && (
                <div className="rounded-lg border p-3">
                  <p className="text-sm font-semibold">Ohne Text geblieben</p>
                  <ul className="mt-2 space-y-1.5 text-xs">
                    {bericht.ohneText.slice(0, 12).map((eintrag, i) => (
                      <li key={i}>
                        <span className="font-medium">{eintrag.titel}</span>
                        <span className="text-muted-foreground">: {eintrag.grund}</span>
                      </li>
                    ))}
                  </ul>
                  {bericht.ohneText.length > 12 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      und {bericht.ohneText.length - 12} weitere
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {laeuft ? (
              <Button
                variant="outline"
                onClick={() => { abbruch.current = true; setHalteAn(true); }}
                disabled={halteAn}
              >
                {halteAn ? "Wird angehalten..." : "Anhalten"}
              </Button>
            ) : (
              <>
                <Button onClick={starten} disabled={zuTun === 0}>
                  {bericht ? "Weiter nachziehen" : `Erzeugung starten (${inDiesemLauf})`}
                </Button>
                <Button variant="ghost" onClick={() => setOffen(false)}>Schließen</Button>
              </>
            )}
            {laeuft && !fortschritt && (
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Der Lauf beginnt...
              </span>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
