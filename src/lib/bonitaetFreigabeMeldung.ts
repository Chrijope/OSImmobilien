import { notifyByRole } from "@/lib/bellNotifications";
import { addProzessAufgabe } from "@/lib/prozessAufgabe";
import { supabase } from "@/integrations/supabase/client";

/**
 * Die Leitung rufen, sobald die Bonität steht: Jetzt wird bei Finanzierern
 * eingereicht.
 *
 * Bis zum 27.10.2026 ging diese Meldung an alle Finanzierungspartner, mit
 * Glocke und Mail. Seit mehrere externe Finanzierer angebunden sind, erfährt
 * ein Finanzierer nur noch von Kunden, die ihm eingereicht werden
 * (`FinanzierungspartnerKarte`, Edge Function
 * `finanzierung-partner-benachrichtigen`). Hier rufen wir deshalb nur noch
 * admin, inhaber und backoffice, die einreichen.
 *
 * Glocke und Aufgabe, weil sie Verschiedenes leisten: Die Glocke sieht man
 * beim nächsten Blick ins CRM, die Aufgabe bleibt stehen, bis sie erledigt ist.
 *
 * Genau einmal je Investment. Wer bei jeder gespeicherten Änderung erneut
 * gerufen wird, hört irgendwann auf hinzusehen.
 */

export interface FreigabeMeldung {
  gemeldet: boolean;
  /** Warum nicht gemeldet wurde. Für die Anzeige im CRM. */
  grund?: string;
}

/**
 * Meldet die Freigabe, sofern es noch nicht geschehen ist.
 *
 * Der Riegel liegt im Investment-Merkmal `bonitaetFreigabeGemeldetAm`. Er wird
 * VOR dem Versand gesetzt: Eine ausgebliebene Meldung ist der harmlosere
 * Fehler, verglichen mit einer, die bei jedem Laden erneut hinausgeht.
 */
export async function meldeBonitaetFreigabe(
  investmentId: string,
  kundeId: string,
  kundeName: string,
): Promise<FreigabeMeldung> {
  try {
    const { data: inv } = await supabase
      .from("investments").select("meta").eq("id", investmentId).maybeSingle();
    const meta = ((inv?.meta as Record<string, unknown>) || {});
    if (meta.bonitaetFreigabeGemeldetAm) {
      return { gemeldet: false, grund: "Die Freigabe wurde bereits gemeldet." };
    }

    const { error: riegel } = await supabase
      .from("investments")
      .update({ meta: { ...meta, bonitaetFreigabeGemeldetAm: new Date().toISOString() } })
      .eq("id", investmentId)
      .is("meta->>bonitaetFreigabeGemeldetAm", null);
    if (riegel) return { gemeldet: false, grund: riegel.message };

    /*
     * Den Reiter "finanzierungen" gab es nie, der Link landete still auf der
     * Uebersicht. Seit Welle 2 heisst der Reiter "investments", und das
     * gemeinte Investment steht in `?investment=`.
     */
    const link = `/kunden/${kundeId}?tab=investments&investment=${investmentId}`;

    notifyByRole(["admin", "inhaber", "backoffice"], {
      titel: "Bonitätsunterlagen freigegeben",
      nachricht: `${kundeName}: Die Bonitätsunterlagen sind vollständig geprüft und freigegeben. Jetzt bei den Finanzierern einreichen.`,
      link,
    });

    /*
     * Die Aufgabe hängt am Kontakt und geht an den Zuständigen, ohne ihn an
     * die Leitung, nicht mehr an den, der gerade freigegeben hat.
     */
    await addProzessAufgabe({
      titel: "Bonität freigegeben: bei Finanzierern einreichen",
      beschreibung:
        `Die Bonitätsunterlagen von ${kundeName} sind vollständig geprüft und freigegeben. ` +
        `Im Abschnitt Finanzierung die Finanzierer wählen und einreichen.`,
      prioritaet: "hoch",
      typ: "aufgabe",
      kundeId,
      kundeName,
      faellig_am: new Date().toISOString().slice(0, 10),
      uhrzeit: "09:00",
      investmentId,
      // Ausloeser, damit dieselbe Aufgabe nicht zweimal entsteht.
      ausloeserSchluessel: `bonitaet_freigabe:${investmentId}`,
    });

    return { gemeldet: true };
  } catch (fehler) {
    console.error("Bonitätsfreigabe nicht gemeldet:", fehler);
    return { gemeldet: false, grund: fehler instanceof Error ? fehler.message : "Unbekannter Fehler" };
  }
}
