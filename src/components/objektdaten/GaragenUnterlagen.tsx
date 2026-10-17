import { useState } from "react";
import { FileDown, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { type Investment } from "@/lib/investmentsStore";
import { getKontaktById } from "@/lib/kundenStore";
import {
  garagenUnterlagenFuer, garagenUnterlagenHerunterladen, garagenUnterlagenSenden, nachNotartermin, versendetAm,
} from "@/lib/garagenUnterlagenVersand";

const datumZeit = (iso: string) => new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });

/** Abschnitt in der Abwicklung: Garagenunterlagen ansehen und an den Käufer senden. */
export function GaragenUnterlagenAbschnitt({ inv, darfSenden, onVersendet }: { inv: Investment; darfSenden: boolean; onVersendet: () => void }) {
  const [frage, setFrage] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  if (!garagenUnterlagenFuer(inv)) return null;
  const email = getKontaktById(inv.kontaktId)?.email || "";
  const am = versendetAm(inv);
  const bereit = nachNotartermin(inv);

  const senden = async () => {
    setLaeuft(true);
    try {
      await garagenUnterlagenSenden(inv);
      toast({ title: "Garagenunterlagen versendet", description: email });
      onVersendet();
    } catch (e) {
      toast({ title: "Nicht versendet", description: e instanceof Error ? e.message : "Bitte erneut versuchen.", variant: "destructive" });
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <p className="text-xs font-semibold">Garagenunterlagen</p>
      <p className="text-xs text-muted-foreground">
        Anschreiben „Ihre Garage: Miete und Subvention für die ersten 12 Monate“ und Musterschreiben an den Garagennutzer, ausgefüllt mit den Daten aus dem CRM. Bankverbindung, Telefon und Fristen trägt der Käufer selbst ein.
      </p>
      {!bereit && <p className="text-xs text-muted-foreground">Versand erst nach dem Notartermin.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => void garagenUnterlagenHerunterladen(inv)}>
          <FileDown className="h-4 w-4 mr-1" /> Ansehen
        </Button>
        {darfSenden && (
          <Button size="sm" disabled={!bereit || !email || laeuft} onClick={() => setFrage(true)}>
            <Mail className="h-4 w-4 mr-1" /> {laeuft ? "Wird gesendet …" : am ? "Erneut senden" : "An Käufer senden"}
          </Button>
        )}
        {am && <span className="text-xs text-emerald-700">versendet am {datumZeit(am)}</span>}
        {!email && <span className="text-xs text-red-600">Keine E-Mail-Adresse beim Käufer.</span>}
      </div>
      <AlertDialog open={frage} onOpenChange={setFrage}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Garagenunterlagen senden?</AlertDialogTitle>
            <AlertDialogDescription>Beide PDFs gehen per E-Mail an {email}.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => void senden()}>Senden</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
