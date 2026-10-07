import { cacheGet } from "./dataCache";
import { loadAllUsers } from "./loadAllUsers";
import { addMessage, chatTeilnehmerEintragen, type ChatData, type ChatParticipant } from "./chatStore";
import { supabase } from "@/integrations/supabase/client";

/**
 * Wer darf wen in einen Chat einladen, und was passiert dabei.
 *
 * Diese Regel stand bis zum 19.09.2026 ausschliesslich in `pages/Chat.tsx`.
 * Christian moechte die Teilnehmerleiste jetzt auch im Kundenprofil sehen,
 * und damit braucht sie einen zweiten Ort. Eine Berechtigungsregel zweimal zu
 * schreiben ist genau die Art Fehler, die spaeter niemand mehr findet: Die
 * eine Fassung wird angepasst, die andere nicht, und ploetzlich laedt jemand
 * Leute ein, die er nicht einladen darf.
 *
 * Deshalb steht sie hier einmal, und beide Oberflaechen fragen sie.
 */

/** Nur diese Rollen kommen ueberhaupt als Chatteilnehmer infrage. */
const EINLADBARE_ROLLEN = ["admin", "inhaber", "vertriebspartner", "finanzierungspartner", "objektpartner"];

/**
 * Die Downline einer Person, rekursiv.
 *
 * Quelle ist `user_settings.einstellungen.teamleader_id`, dieselbe wie im
 * Strukturbaum unter /teampartner.
 */
function downline(myId: string): Set<string> {
  const settings = cacheGet("user_settings") || [];
  const kinder = new Map<string, string[]>();
  for (const s of settings as any[]) {
    const tlId = s?.einstellungen?.teamleader_id;
    if (tlId && s.user_id) {
      const arr = kinder.get(tlId) || [];
      arr.push(s.user_id);
      kinder.set(tlId, arr);
    }
  }
  const gefunden = new Set<string>();
  const gehe = (id: string) => {
    for (const k of kinder.get(id) || []) {
      if (gefunden.has(k)) continue;
      gefunden.add(k);
      gehe(k);
    }
  };
  gehe(myId);
  return gefunden;
}

function initialen(name: string): string {
  return name.split(" ").map((n) => n[0] || "").join("").toUpperCase().slice(0, 2) || "?";
}

/** Darf diese aktive Rolle alle einladbaren Nutzer einladen? */
function laedtAlleEin(rolle: string | null | undefined): boolean {
  return rolle === "admin" || rolle === "inhaber";
}

/**
 * Wen diese Person in ihrer aktiven Rolle (`user.role`) einladen darf.
 *
 * Admin und Inhaber: alle mit einer einladbaren Rolle.
 * Vertriebspartner: ausschliesslich Vertriebspartner aus der eigenen Downline.
 * Alle anderen Rollen: niemand, auch wenn die Person eine Downline hat.
 */
export function einladbareTeilnehmer(myId: string, rolle: string | null | undefined): ChatParticipant[] {
  const rollen = (cacheGet("user_roles") || []) as any[];
  const einladbareIds = new Set(rollen.filter((r) => EINLADBARE_ROLLEN.includes(r.role)).map((r) => r.user_id));
  const vpIds = new Set(rollen.filter((r) => r.role === "vertriebspartner").map((r) => r.user_id));

  const alle: ChatParticipant[] = loadAllUsers()
    .filter((u) => einladbareIds.has(u.id))
    .map((u) => ({ id: u.id, name: u.name, initials: initialen(u.name), role: u.rolle || "Nutzer" }));

  if (laedtAlleEin(rolle)) return alle;
  if (rolle !== "vertriebspartner") return [];
  const meine = downline(myId);
  return alle.filter((u) => vpIds.has(u.id) && meine.has(u.id));
}

/**
 * Traegt die ausgewaehlten Personen als Teilnehmer ein.
 *
 * Gibt zurueck, wie viele wirklich dazugekommen sind. Bereits Anwesende und
 * alles, was die Person gar nicht einladen darf, fallen still heraus; der
 * zweite Fall ist kein Versehen, sondern der Riegel: Die Liste der Erlaubten
 * wird hier noch einmal geprueft und nicht dem Aufrufer geglaubt.
 *
 * Wirft, wenn etwas Unerlaubtes dabei war. Der Aufrufer soll das melden und
 * nicht stillschweigend weniger einladen als angeklickt.
 *
 * `rolle` ist die aktive Rolle (`user.role`), wie in der Oberflaeche. Bis zum
 * 27.09.2026 las diese Funktion alle zugewiesenen Rollen der Person; wer Admin
 * war und in die Rolle Vertriebspartner gewechselt hatte, durfte hier
 * trotzdem jeden einladen. Die aeussere Grenze bleibt die RLS.
 */
export async function ladeTeilnehmerEin(
  chat: ChatData,
  ausgewaehlteIds: string[],
  myId: string,
  rolle: string | null | undefined,
): Promise<number> {
  const erlaubt = einladbareTeilnehmer(myId, rolle);
  const erlaubteIds = new Set(erlaubt.map((u) => u.id));

  const unerlaubt = ausgewaehlteIds.filter((id) => !erlaubteIds.has(id));
  if (unerlaubt.length > 0) {
    throw new Error("Du darfst nur Vertriebspartner aus deiner eigenen Downline einladen.");
  }

  const vorhanden = new Set(chat.teilnehmer.map((t) => t.id));
  const neue = erlaubt.filter((m) => ausgewaehlteIds.includes(m.id) && !vorhanden.has(m.id));

  for (const m of neue) {
    // Erst die Teilnehmerzeile, dann die Systemmeldung. Andersherum stuende im
    // Verlauf "wurde hinzugefuegt" fuer jemanden, der es nicht wurde.
    // Über die Datenbankfunktion; sie prüft die Grenze noch einmal selbst.
    await chatTeilnehmerEintragen(chat.id, [m]);

    chat.teilnehmer.push(m);

    await addMessage(chat.id, {
      senderId: "system",
      senderName: "System",
      senderInitials: "SY",
      text: `${m.name} (${m.role}) wurde zum Chat hinzugefügt`,
    }, myId);

    await supabase.from("benachrichtigungen").insert({
      benutzer_id: m.id,
      titel: "Zum Chat hinzugefügt",
      nachricht: `Du wurdest dem Chat "${chat.kundeName}" hinzugefügt.`,
      link: `/chat?id=${chat.id}`,
    });
  }

  return neue.length;
}
