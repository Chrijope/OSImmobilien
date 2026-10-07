import { useState } from "react";
import { EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useUser } from "@/contexts/UserContext";
import { useVorfuehrmodus } from "@/hooks/useVorfuehrmodus";
import { darfVorfuehrmodusSchalten, setzeVorfuehrmodus } from "@/lib/vorfuehrmodus";

/**
 * Der Umschalter fuer den Vorfuehrmodus, als Knopf in der Kopfzeile.
 *
 * Warum die Kopfzeile und nicht das Dashboard: Der Modus wirkt im ganzen CRM,
 * nicht nur auf einer Seite. Ein Schalter, der nur auf dem Dashboard liegt,
 * waere genau dann nicht erreichbar, wenn er gebraucht wird, naemlich mitten
 * in der Vorfuehrung auf der Kontaktliste. Die Kopfzeile ist das einzige
 * Element, das auf jeder Seite steht. Ein eigenes Nutzermenue gibt es hier
 * nicht, die Kopfzeile traegt einzelne Knoepfe, also fuegt sich der Schalter
 * genau dort ein.
 *
 * Nur Inhaber und Admin sehen ihn. Das ist Anzeige, keine Zugriffskontrolle:
 * Wer den Modus nicht schalten kann, sieht die Daten trotzdem, wie seine
 * Rolle es erlaubt.
 */
export function VorfuehrmodusSchalter() {
  const { user } = useUser();
  const aktiv = useVorfuehrmodus();
  const [frageOffen, setFrageOffen] = useState(false);

  if (!darfVorfuehrmodusSchalten(user.role)) return null;

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={aktiv ? "Vorfuehrmodus beenden" : "Vorfuehrmodus starten"}
            aria-pressed={aktiv}
            onClick={() => (aktiv ? setzeVorfuehrmodus(false) : setFrageOffen(true))}
            className={aktiv ? "bg-amber-500 text-white hover:bg-amber-600 hover:text-white" : ""}
          >
            <EyeOff className={aktiv ? "h-5 w-5" : "h-5 w-5 text-muted-foreground"} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {aktiv ? "Vorführmodus beenden" : "Vorführmodus starten"}
        </TooltipContent>
      </Tooltip>

      <AlertDialog open={frageOffen} onOpenChange={setFrageOffen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vorführmodus starten?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left">
                <p>
                  Namen von Kunden, Bewerbern und Vertriebspartnern werden durch
                  gleichbleibende Kürzel ersetzt, zum Beispiel „Kunde M. B.“.
                  Telefonnummern, Mailadressen, Anschriften, Geburtsdaten und
                  Arbeitgeber werden maskiert.
                </p>
                <p>
                  Beträge, Provisionen und Kennzahlen werden nur weichgezeichnet.
                  Das wirkt ausschließlich optisch: Der Wert steht weiter im
                  Dokument und lässt sich mit den Entwicklerwerkzeugen des
                  Browsers auslesen. Gib den Bildschirm also nicht aus der Hand.
                </p>
                <p>
                  Der Modus ändert keine Daten und nimmt niemandem ein Recht. Er
                  bleibt an, bis du ihn beendest, auch nach einem Neuladen.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => setzeVorfuehrmodus(true)}>
              Vorführmodus starten
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
