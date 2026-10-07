import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Wie viele Chatnachrichten der Kunde noch nicht gelesen hat.
 *
 * Fuer die Zahl am Menuepunkt "Chat" im Kundenportal. Ohne sie merkt der
 * Kunde gar nicht, dass sein Berater ihm geschrieben hat: Er sieht die
 * Nachricht erst, wenn er von sich aus auf Chat klickt.
 *
 * Gezaehlt wird wie im CRM (`getUnreadChatCount`): Nachrichten in Chats, in
 * denen er Teilnehmer ist, die nicht von ihm stammen und in deren
 * `gelesen_von` er nicht steht.
 *
 * Bewusst eine eigene Abfrage und nicht der Zwischenspeicher des CRM. Den
 * gibt es im Portal nicht, und ihn dafuer zu laden hiesse, dem Kunden die
 * halbe Datenbank in den Browser zu legen.
 */
export function useUngeleseneChats(userId?: string | null): number {
  const [anzahl, setAnzahl] = useState(0);

  useEffect(() => {
    if (!userId) {
      setAnzahl(0);
      return;
    }
    let abgebrochen = false;

    const zaehlen = async () => {
      try {
        const { data: teilnahmen } = await supabase
          .from("chat_teilnehmer")
          .select("chat_id")
          .eq("benutzer_id", userId);

        const chatIds = (teilnahmen ?? []).map((t: { chat_id: string }) => t.chat_id);
        if (abgebrochen) return;
        if (chatIds.length === 0) {
          setAnzahl(0);
          return;
        }

        const { data: nachrichten } = await supabase
          .from("chat_nachrichten")
          .select("id, absender_id, gelesen_von")
          .in("chat_id", chatIds);

        if (abgebrochen) return;
        const offen = (nachrichten ?? []).filter((m) => {
          if (m.absender_id === userId) return false;
          const gelesen = Array.isArray(m.gelesen_von) ? (m.gelesen_von as unknown[]) : [];
          return !gelesen.includes(userId);
        });
        setAnzahl(offen.length);
      } catch {
        // Eine Zahl am Menuepunkt ist Beiwerk. Faellt die Abfrage aus, steht
        // dort nichts, und das Portal laeuft unveraendert weiter.
      }
    };

    void zaehlen();

    // Neue Nachrichten und Lesevermerke kommen ueber denselben Kanal herein.
    const kanal = supabase
      .channel(`portal-ungelesen-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_nachrichten" }, () => void zaehlen())
      .subscribe();

    return () => {
      abgebrochen = true;
      void supabase.removeChannel(kanal);
    };
  }, [userId]);

  return anzahl;
}
