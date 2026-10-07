import { supabase } from "@/integrations/supabase/client";
import type { Bewerber } from "./bewerbungStore";

/**
 * Verschickt die kurze, wertschätzende Absage-Mail an einen Bewerber
 * (Vorlage "bewerber-absage"). Wird aus den Ablehnen-Dialogen in
 * ErstgespraechsTab und ClosingTab aufgerufen, wenn die Checkbox
 * "Wertschätzende Absage-Mail senden" gesetzt ist.
 *
 * Bewusst best-effort: Der Statuswechsel auf Abgelehnt/Kein Interesse darf
 * nicht daran scheitern, dass die Mail gerade nicht rausgeht. Der Aufrufer
 * bekommt das Ergebnis zurück und zeigt es im Toast an.
 */
export async function sendeBewerberAbsageMail(
  b: Pick<Bewerber, "id" | "vorname" | "email">,
): Promise<{ ok: boolean; grund?: string }> {
  return versendeAbsage(b, "bewerber-absage");
}

/**
 * Die Absage nach einem gelesenen Kennenlernbogen, ohne dass jemals ein
 * Gespräch stattgefunden hat.
 *
 * **Warum nicht dieselbe Vorlage wie oben.** `bewerber-absage` sagt wörtlich
 * „Nach unserem Gespräch sind wir zu dem Schluss gekommen". Sie wird aus dem
 * Erstgespräch, dem Closing und dem Videocall verschickt, also immer, nachdem
 * jemand mit dem Bewerber gesprochen hat. Diese hier kommt davor: Wir haben
 * seinen Bogen gelesen, sonst nichts. Ein Satz, der ein Gespräch behauptet,
 * das es nie gab, ist für den Empfänger nachweislich falsch, und genau daran
 * erkennt er den Textbaustein.
 *
 * Der Versandweg ist derselbe, deshalb steht sie hier und nicht in einer
 * zweiten Datei daneben. Nur der Wortlaut unterscheidet sich, und der liegt in
 * der Vorlage.
 */
export async function sendeKennenlernAbsageMail(
  b: Pick<Bewerber, "id" | "vorname" | "email">,
): Promise<{ ok: boolean; grund?: string }> {
  return versendeAbsage(b, "bewerber-kennenlernen-absage");
}

/** Der gemeinsame Versandweg beider Absagen. */
async function versendeAbsage(
  b: Pick<Bewerber, "id" | "vorname" | "email">,
  vorlage: string,
): Promise<{ ok: boolean; grund?: string }> {
  if (!b.email) {
    return { ok: false, grund: "Keine E-Mail-Adresse hinterlegt" };
  }
  try {
    const { data, error } = await supabase.functions.invoke("send-transactional-email", {
      body: {
        templateName: vorlage,
        recipientEmail: b.email,
        idempotencyKey: `${vorlage}-${b.id}-${Date.now()}`,
        templateData: { vorname: b.vorname || "" },
      },
    });
    if (error) {
      return { ok: false, grund: error.message || "Versand fehlgeschlagen" };
    }
    const antwort = data as { success?: boolean; reason?: string } | null;
    if (antwort && antwort.success === false) {
      return { ok: false, grund: String(antwort.reason || "nicht zugestellt") };
    }
    return { ok: true };
  } catch (e) {
    const grund = e instanceof Error ? e.message : "Versand fehlgeschlagen";
    return { ok: false, grund };
  }
}
