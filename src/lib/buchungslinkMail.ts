/**
 * Versendet den persoenlichen Buchungslink per E-Mail an den Kunden.
 *
 * Bisher gab es an den vergebenen Links im Dialog "Meeting erstellen" nur
 * einen mailto-Knopf mit generischem Text. Jetzt geht die Mail direkt ueber
 * denselben Weg hinaus wie alle anderen Kundenmails: die Edge Function
 * `send-transactional-email` mit der Vorlage `buchungslink-einladung`.
 *
 * Die Texte je Anlass (Erstgespraech, Beratung, Objektvorstellung,
 * Finanzierungsgespraech, sonstiges als Rueckfall) liegen zentral in der
 * Vorlage `supabase/functions/_shared/transactional-email-templates/
 * buchungslink-einladung.tsx`.
 */
import { supabase } from "@/integrations/supabase/client";
import { loadAllUsers } from "./loadAllUsers";
import { kennungZuName } from "./beraterNamensabgleich";
import { berufsbezeichnung } from "@/lib/berufsbezeichnung";
import type { BuchungAnlass } from "./buchungStore";

export interface BuchungslinkMail {
  kundeId: string;
  kundeName: string;
  kundeEmail: string;
  /** Name des Beraters, wie er im Dialog steht. */
  berater: string;
  /** Kennung des Beraters. Vorrang vor dem Namen, der doppelt vorkommen kann. */
  beraterId?: string;
  /** Kennung des Buchungslinks, fuer den Schutz vor Doppelversand. */
  linkId: string;
  /** Der vollstaendige Buchungslink, das Ziel des Knopfes in der Mail. */
  buchungUrl: string;
  anlass: BuchungAnlass;
  /** Bezeichnung der Terminart, etwa "Telefonisches Erstgespräch". */
  terminartName?: string;
  dauerMinuten?: number;
  /** Ablauf des Links als ISO-Zeitpunkt, null bei unbegrenzter Gueltigkeit. */
  gueltigBis?: string | null;
}

/** Aus "2026-09-30T…" wird "30. September 2026". */
function formatiereGueltigBis(iso?: string | null): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
}

export async function versendeBuchungslinkMail(e: BuchungslinkMail): Promise<boolean> {
  if (!e.kundeEmail) return false;
  // Einmalige Rückfrage „Deutsch oder English?“, falls noch nie gewählt (Plan
  // Kundensprache 2.4). Dynamisch geladen, damit kein Importkreis zum Kundenstore entsteht.
  const sprache = await (await import("./kundenSprache")).stelleKundenspracheSicher(e.kundeId);

  // Kontaktdaten des Beraters fuer die Unterschrift, dasselbe Muster wie in
  // meetingEinladung.ts. Die Edge Function loest den Ansprechpartner zusaetzlich
  // selbst gegen die Datenbank auf, siehe _shared/ansprechpartner.ts.
  let beraterEmail = "";
  let beraterTelefon = "";
  let beraterPosition = "";
  try {
    // Kennung zuerst; der Name nur, wenn genau ein Nutzer so heisst.
    const kennung = e.beraterId || kennungZuName(e.berater);
    const treffer = kennung ? loadAllUsers().find((u) => u.id === kennung) : undefined;
    if (treffer) {
      beraterEmail = (treffer as { email?: string }).email || "";
      // Die Bezeichnung kommt aus der Rolle. Der frueher hier gelesene Wert
      // `position` steht gar nicht im SystemUser, das Feld blieb also immer
      // leer, und in der Mail fehlte die Zeile unter dem Namen.
      beraterPosition = berufsbezeichnung(treffer.rollen ?? treffer.rolle);
      beraterTelefon = (treffer as { telefon?: string }).telefon || "";
    }
  } catch { /* ignore */ }

  try {
    const { error } = await supabase.functions.invoke("send-transactional-email", {
      body: {
        templateName: "buchungslink-einladung",
        recipientEmail: e.kundeEmail,
        // Ein versehentlicher Doppelklick loest keine zweite Mail aus. Ein
        // bewusster erneuter Versand an einem spaeteren Tag bleibt moeglich.
        idempotencyKey: `buchungslink-${e.linkId}-${new Date().toISOString().slice(0, 10)}`,
        // Die eben gewählte oder gespeicherte Kundensprache.
        sprache,
        templateData: {
          kundeName: e.kundeName,
          anlass: e.anlass,
          terminartName: e.terminartName || undefined,
          dauerMinuten: e.dauerMinuten || undefined,
          buchungUrl: e.buchungUrl,
          gueltigBis: formatiereGueltigBis(e.gueltigBis),
          beraterName: e.berater,
          berater: {
            name: e.berater,
            rolle: beraterPosition || undefined,
            telefon: beraterTelefon || undefined,
            email: beraterEmail || undefined,
          },
        },
        metadata: { kontaktId: e.kundeId, quelle: "buchungslink-dialog" },
      },
    });
    if (error) {
      console.error("versendeBuchungslinkMail:", error);
      return false;
    }
    return true;
  } catch (fehler) {
    console.error("versendeBuchungslinkMail:", fehler);
    return false;
  }
}
