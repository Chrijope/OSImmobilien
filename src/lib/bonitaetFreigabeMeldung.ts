import { notifyByRole } from "@/lib/bellNotifications";
import { addGeteilteAufgabe } from "@/lib/aktivitaetenStore";
import { supabase } from "@/integrations/supabase/client";

/**
 * Den Finanzierungspartner rufen, sobald die Bonität steht.
 *
 * Seit die Bonitätsunterlagen hinter der Reservierung liegen, ist ihre
 * Freigabe der Startschuss für die Finanzierung. Vorher lag die Bonität weit
 * vorne im Prozess und der Finanzierungspartner erfuhr erst viel später, dass
 * etwas für ihn anliegt.
 *
 * Drei Wege gleichzeitig, weil sie Verschiedenes leisten:
 *
 *   Glocke   sieht er beim nächsten Blick ins CRM.
 *   Aufgabe  bleibt stehen, bis er sie erledigt. Eine Glocke ist weg, sobald
 *            man sie angeklickt hat, und dann erinnert nichts mehr daran.
 *   E-Mail   erreicht ihn, wenn er gerade nicht im CRM ist.
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
      return { gemeldet: false, grund: "Der Finanzierungspartner wurde bereits informiert." };
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

    notifyByRole(["finanzierungspartner", "admin", "inhaber"], {
      titel: "Bonitätsunterlagen freigegeben",
      nachricht: `${kundeName}: Die Bonitätsunterlagen sind vollständig geprüft und freigegeben. Die Finanzierung kann gestartet werden.`,
      link,
    });

    /*
     * Die Aufgabe hängt am Kontakt, nicht an einer Person.
     *
     * So sieht sie jeder, der den Kunden betreut, auch wenn der
     * Finanzierungspartner wechselt oder im Urlaub ist.
     */
    await addGeteilteAufgabe({
      titel: `Finanzierung starten: ${kundeName}`,
      beschreibung:
        `Die Bonitätsunterlagen von ${kundeName} sind vollständig geprüft und freigegeben. ` +
        `Die Finanzierung kann jetzt angestoßen werden.`,
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

    // Die Mail läuft über eine Edge Function, damit sie auch dann hinausgeht,
    // wenn der Browser die Seite gleich danach verlässt.
    const { error: mailFehler } = await supabase.functions.invoke("bonitaet-freigabe-mail", {
      body: { investmentId, kontaktId: kundeId, kundeName },
    });
    if (mailFehler) {
      console.error("Freigabemail an den Finanzierungspartner:", mailFehler);
      // Glocke und Aufgabe sind draußen, das ist das Wichtigere. Die fehlende
      // Mail wird gemeldet, hebt die Meldung aber nicht auf.
      return { gemeldet: true, grund: "Die E-Mail konnte nicht versendet werden, Glocke und Aufgabe stehen." };
    }

    return { gemeldet: true };
  } catch (fehler) {
    console.error("Bonitätsfreigabe nicht gemeldet:", fehler);
    return { gemeldet: false, grund: fehler instanceof Error ? fehler.message : "Unbekannter Fehler" };
  }
}
