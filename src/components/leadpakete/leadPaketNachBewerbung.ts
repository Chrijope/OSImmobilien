import { toast } from "@/hooks/use-toast";
import { hinweisDialog } from "@/lib/confirm";
import { leadPaketAusBewerbung } from "@/lib/leadPaketStore";

/**
 * Nach bestätigter Zahlung und nach dem Anlegen des Nutzers: Leadpaket aus
 * der Bewerbung anlegen lassen und das Ergebnis melden. Wartet erst auf das
 * Speichern der Bewerbung, denn die Datenbank liest Zahlung und Konto dort.
 */
export async function leadPaketNachBewerbung(bewerbungId: string, gespeichert?: unknown): Promise<void> {
  try {
    await gespeichert;
  } catch {
    // Das Speichern meldet seinen Fehler selbst; ohne gespeicherte Werte
    // legt die Datenbank ohnehin nichts an.
  }
  const e = await leadPaketAusBewerbung(bewerbungId);
  if (!e.ok) {
    toast({ title: "Leadpaket nicht angelegt", description: e.meldung, variant: "destructive" });
    return;
  }
  if (e.status === "angelegt") {
    toast({ title: e.anzahl ? `Leadpaket angelegt: ${e.anzahl} Leads` : "Leadpaket angelegt" });
  } else if (e.status === "email_abweichend") {
    await hinweisDialog({
      title: "Leadpaket nicht angelegt",
      description:
        "Die E-Mail des verknüpften Nutzerkontos passt nicht zur E-Mail der Bewerbung. Damit das Paket nicht beim falschen Konto landet, ist es nicht angelegt. Prüfe die Verknüpfung und lege das Paket unter Statistik, Lead-Zuweisung, Leadpakete von Hand an.",
      buttonText: "Verstanden",
    });
  }
}
