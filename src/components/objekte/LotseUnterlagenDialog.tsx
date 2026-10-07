import { useRef, useState } from "react";
import { FileSearch, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useUser } from "@/contexts/UserContext";
import { lotseUnterlagenAuswerten } from "@/lib/lotseStore";

/**
 * „Lotse: Unterlagen auswerten“ für Admin und Inhaber (05.10.2026).
 *
 * Wertet die Unterlagen aller Objekte und Einheiten für den MORE Lotsen aus,
 * Abschnitt für Abschnitt (ein Objekt oder eine Einheit). Ruft die Function
 * so lange auf, bis alle Abschnitte geprüft sind; je Aufruf höchstens acht
 * Unterlagen. Abbrechen ist jederzeit möglich, ein neuer Start macht vorn
 * weiter und überspringt alles, was schon ausgewertet ist. Die Rolle prüft
 * die Function selbst noch einmal.
 */
interface Stand {
  geprueft: number;
  gesamt: number;
  ausgewertet: number;
  fehler: number;
  gesperrt: number;
}

const LEER: Stand = { geprueft: 0, gesamt: 0, ausgewertet: 0, fehler: 0, gesperrt: 0 };

export function LotseUnterlagenDialog() {
  const { user } = useUser();
  const [laeuft, setLaeuft] = useState(false);
  const [stand, setStand] = useState<Stand>(LEER);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fertig, setFertig] = useState(false);
  const stopp = useRef(false);

  const starten = async () => {
    stopp.current = false;
    setLaeuft(true);
    setFertig(false);
    setMeldung(null);
    let summe = { ...LEER };
    setStand(summe);
    let ab = 0;
    for (;;) {
      if (stopp.current) { setMeldung("Angehalten. Ein neuer Start überspringt alles, was schon ausgewertet ist."); break; }
      const schritt = await lotseUnterlagenAuswerten(user.role, ab);
      if ("meldung" in schritt) { setMeldung(schritt.meldung); break; }
      summe = {
        geprueft: schritt.geprueft, gesamt: schritt.gesamt,
        ausgewertet: summe.ausgewertet + schritt.ausgewertet,
        fehler: summe.fehler + schritt.fehler,
        gesperrt: summe.gesperrt + schritt.gesperrt,
      };
      setStand(summe);
      if (schritt.weiter === null) { setFertig(true); break; }
      // Kein Fortschritt, etwa weil Sperrvermerke nicht schreibbar sind: anhalten statt endlos fragen.
      if (schritt.weiter === ab && schritt.ausgewertet + schritt.fehler + schritt.gesperrt === 0) {
        setMeldung("Es geht gerade nicht weiter. Bitte versuch es in einigen Minuten noch einmal.");
        break;
      }
      ab = schritt.weiter;
    }
    setLaeuft(false);
  };

  const prozent = stand.gesamt ? Math.round((stand.geprueft / stand.gesamt) * 100) : 0;

  return (
    <Dialog onOpenChange={(offen) => { if (!offen) stopp.current = true; }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileSearch className="mr-1 h-4 w-4" /> Lotse: Unterlagen auswerten
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Unterlagen für den MORE Lotsen auswerten</DialogTitle>
          <DialogDescription>
            Der Lotse liest alle Unterlagen aller Objekte und Einheiten einmal: freigegebene als Zusammenfassung,
            Mietverträge und Grundbuch nur als Faktenauszug ohne Namen. Interne Unterlagen und Vertriebsvereinbarungen
            liest er nie. Was schon ausgewertet ist, wird übersprungen. Je Schritt höchstens acht Unterlagen.
            Lass das Fenster offen, bis alles geprüft ist.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm" data-testid="lotse-auswertung">
          {(laeuft || stand.gesamt > 0) && (
            <>
              <Progress value={prozent} />
              <p>
                {stand.geprueft} von {stand.gesamt} Objekten und Einheiten geprüft ({prozent} %).
              </p>
              <p className="text-muted-foreground">
                Ausgewertet: {stand.ausgewertet} · nicht lesbar: {stand.fehler} · gesperrt: {stand.gesperrt}
              </p>
            </>
          )}
          {fertig && (
            <p className="font-medium">
              Fertig. Nicht lesbare Unterlagen versucht der Lotse frühestens nach 24 Stunden noch einmal.
            </p>
          )}
          {meldung && <p className="text-destructive" role="alert">{meldung}</p>}
        </div>

        <div className="flex justify-end gap-2">
          {laeuft ? (
            <Button variant="outline" onClick={() => { stopp.current = true; }}>
              <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Anhalten
            </Button>
          ) : (
            <Button variant="brand" onClick={() => void starten()}>
              {stand.gesamt > 0 ? "Noch einmal prüfen" : "Auswertung starten"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
