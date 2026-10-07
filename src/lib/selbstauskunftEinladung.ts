import { supabase } from "@/integrations/supabase/client";
import { getSaData, setSaInvitationSentAt } from "@/lib/investmentsStore";
import { scheduleSaFollowUpReminders, notifySaEinladungVerschickt } from "@/lib/bellNotifications";
import { addAktivitaet } from "@/lib/aktivitaetenStore";

/**
 * Die Einladung zur Selbstauskunft an den Kunden schicken.
 *
 * Liegt hier und nicht in der Kundenakte, weil es zwei Wege dorthin gibt und
 * beide dasselbe tun muessen: der Knopf in der Kundenakte und der Knopf im
 * Formular selbst. Letzterer ist der wichtigere, denn wenn im Termin die Zeit
 * ausgeht, sitzt der Berater im Formular und nicht in der Akte.
 *
 * Der angefangene Stand geht immer mit. Er liegt am Investment, weil das
 * Formular alle anderthalb Sekunden dorthin spiegelt. Der Kunde macht deshalb
 * dort weiter, wo der Berater aufgehoert hat, statt von vorne anzufangen.
 */
export async function sendeSelbstauskunftEinladung(opts: {
  kontaktId: string;
  investmentId: string;
  kundeName: string;
  kundeEmail: string;
  /** Wer versendet, fuer die Aktivitaet in der Akte. */
  absenderName: string;
  /** Zustaendiger Vertriebspartner, fuer Glocke und Erinnerungen. */
  beraterId?: string;
  /** Beim erneuten Senden steht schon ein Datum, dann keine neuen Erinnerungen. */
  erneut?: boolean;
  /** Pipeline anheben. Nur die Kundenakte kann das, deshalb hereingereicht. */
  hebeStufe?: () => void;
}): Promise<void> {
  const { kontaktId, investmentId, kundeName, kundeEmail, absenderName, beraterId, erneut, hebeStufe } = opts;

  // Einmalige Rückfrage „Deutsch oder English?“, falls noch nie gewählt (Plan
  // Kundensprache 2.4). Dynamisch geladen, damit kein Importkreis zum Kundenstore entsteht.
  await (await import("./kundenSprache")).stelleKundenspracheSicher(kontaktId);

  const vorhandenerStand = getSaData(investmentId);

  // Direkt via fetch statt supabase.functions.invoke: Das spart den
  // auth.getUser()-Roundtrip, der bei Netzaussetzern sporadisch mit
  // "Failed to send a request to the Edge Function" gescheitert ist.
  const { data: sessionRes } = await supabase.auth.getSession();
  const accessToken = sessionRes?.session?.access_token;
  if (!accessToken) throw new Error("Sitzung abgelaufen, bitte neu anmelden.");

  const resp = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-sa-invitation`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({
        kontaktId,
        investmentId,
        kundeName,
        kundeEmail,
        prefillData: vorhandenerStand || undefined,
      }),
    },
  );

  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`;
    try {
      const j = await resp.json();
      msg = j?.error || j?.message || msg;
    } catch { /* Antwort ohne JSON, dann bleibt der Statuscode */ }
    throw new Error(msg);
  }

  // Ab hier ist die Mail draussen. Alles Weitere darf den Versand nicht mehr
  // scheitern lassen, deshalb einzeln abgesichert.
  try { setSaInvitationSentAt(investmentId); } catch (e) { console.warn("[SA] Versanddatum", e); }
  try { hebeStufe?.(); } catch (e) { console.warn("[SA] Pipelinestufe", e); }
  if (beraterId) {
    try {
      if (!erneut) scheduleSaFollowUpReminders(kundeName, kontaktId, investmentId, beraterId);
      notifySaEinladungVerschickt(kundeName, kontaktId, beraterId);
    } catch (e) { console.warn("[SA] Erinnerungen", e); }
  }
  try {
    addAktivitaet({
      kundeId: kontaktId,
      art: "email",
      beschreibung: erneut
        ? `Selbstauskunft-Einladung erneut versendet an ${kundeName}`
        : `Selbstauskunft-Einladung versendet an ${kundeName}`,
      von: absenderName,
    });
  } catch (e) { console.warn("[SA] Aktivitaet", e); }
}

/**
 * Wie viele Angaben schon drinstehen. Nur fuer die Frage, ob im Dialog
 * "Ihre bisherigen Eingaben werden mitgeschickt" stehen soll oder nicht.
 */
export function hatAngefangenenStand(investmentId: string): boolean {
  const stand = getSaData(investmentId) as Record<string, unknown> | null;
  if (!stand || typeof stand !== "object") return false;
  // Name und Anschrift kommen aus dem Kontakt und zaehlen deshalb nicht.
  // Erst eine Zahl aus dem Finanzteil heisst: Hier hat jemand gearbeitet.
  const einkommen = stand.einkommen as Record<string, unknown> | undefined;
  const zahlen = [
    einkommen?.netto, einkommen?.gewerbe, einkommen?.rente, einkommen?.miet,
    stand.lebenshaltungskosten, stand.mieteWarm, stand.beruf, stand.arbeitgeber,
  ];
  return zahlen.some((w) => typeof w === "string" ? w.trim() !== "" && w !== "0,00" : !!w);
}
