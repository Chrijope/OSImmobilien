import { useEffect } from "react";
import { wennTabellenGeladen } from "@/lib/dataCache";
import { getKontakte } from "@/lib/kundenStore";
import { addInboxTask, getInboxTasks, setInboxTasks } from "@/lib/aktivitaetenStore";
import { getUserSetting, setUserSetting } from "@/lib/userSettingsCache";
import { isTestAccount } from "@/lib/dbStoreHelper";
import { kontaktBelongsToUser } from "@/lib/kontaktOwnership";
import { MAX_KONTAKTVERSUCHE } from "@/lib/kontaktversuchSchedule";

/**
 * Kontaktversuch-Inbox-Reminder.
 *
 * Wenn im Kundenprofil "Nicht erreicht" gedrückt wurde (pipelineStufe =
 * "kontaktversuche"), wird der Lead bis `verstecktBis` ausgeblendet
 * (Staffelung siehe kontaktversuchSchedule.ts, max. 15 Versuche).
 * Sobald die Wartezeit abgelaufen ist, erscheint hier eine Inbox-Aufgabe
 * ("Glocke") mit der Aufforderung, den Lead erneut für das Erstgespräch
 * anzurufen. Idempotent pro (kundeId, verstecktBis-Anker) — bei einem
 * neuen "Nicht erreicht"-Klick (neues verstecktBis) wird ein neuer
 * Reminder erzeugt. Sobald der Lead die Stufe verlässt, wird der offene
 * Reminder wieder aus der Inbox entfernt.
 */

const REMINDER_KEY = "mi_kontaktversuch_inbox_reminders_sent";

function getSent(): Record<string, string[]> {
  if (isTestAccount()) {
    try { const raw = localStorage.getItem(REMINDER_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
  }
  return getUserSetting<Record<string, string[]>>(REMINDER_KEY, {});
}
function markSent(kundeId: string, anchor: string) {
  const sent = getSent();
  if (!sent[kundeId]) sent[kundeId] = [];
  if (!sent[kundeId].includes(anchor)) {
    sent[kundeId].push(anchor);
    if (isTestAccount()) localStorage.setItem(REMINDER_KEY, JSON.stringify(sent));
    else setUserSetting(REMINDER_KEY, sent);
  }
}
function wasSent(kundeId: string, anchor: string): boolean {
  return getSent()[kundeId]?.includes(anchor) ?? false;
}

export function useKontaktversuchInboxReminder(userName?: string, userId?: string) {
  useEffect(() => {
    function check() {
      const kontakte = getKontakte();
      const now = Date.now();
      let inbox = getInboxTasks();

      // Cleanup: Reminder entfernen, wenn der Lead die Stufe verlassen hat.
      const kontaktById = new Map(kontakte.map(k => [k.id, k] as const));
      const cleaned = inbox.filter(t => {
        if (t.typ !== "anruf") return true;
        if (!t.titel?.includes("Erneut anrufen:")) return true;
        const k: any = kontaktById.get(t.kundeId);
        if (!k) return true;
        if (k.pipelineStufe !== "kontaktversuche") return false;
        return true;
      });
      if (cleaned.length !== inbox.length) {
        setInboxTasks(cleaned);
        inbox = cleaned;
      }

      for (const k of kontakte as any[]) {
        if (k.pipelineStufe !== "kontaktversuche") continue;
        if (k.archiviert) continue;
        if (!kontaktBelongsToUser(k, { userName, userId })) continue;

        const verstecktBis: string | undefined = k.verstecktBis;
        if (!verstecktBis) continue;
        const dueAt = new Date(verstecktBis).getTime();
        if (isNaN(dueAt) || now < dueAt) continue;

        const count = Number(k.nichtErreichtCount || 0);
        if (count >= MAX_KONTAKTVERSUCHE) continue;

        const anchor = verstecktBis;
        if (wasSent(k.id, anchor)) continue;

        const name = `${k.vorname || ""} ${k.nachname || ""}`.trim();
        const titelNeedle = `Erneut anrufen: ${name}`;
        if (inbox.some(t => t.kundeId === k.id && t.titel.includes(titelNeedle))) {
          markSent(k.id, anchor);
          continue;
        }

        const d = new Date(dueAt);
        const fmtDate = (x: Date) => x.toISOString().split("T")[0];
        const fmtTime = (x: Date) => x.toTimeString().slice(0, 5);
        const next = count + 1;
        addInboxTask({
          titel: `📞 ${titelNeedle}`,
          beschreibung: `Wartezeit nach Versuch ${count}/${MAX_KONTAKTVERSUCHE} abgelaufen. Bitte Lead für das Erstgespräch erneut anrufen (Versuch ${next}/${MAX_KONTAKTVERSUCHE}).`,
          prioritaet: "hoch",
          typ: "anruf",
          faellig_am: fmtDate(d),
          uhrzeit: fmtTime(d),
          kundeId: k.id,
          kundeName: name,
        });
        markSent(k.id, anchor);
      }
    }

    // Erst rechnen, wenn die Kontakte im Cache liegen (Laden je Route).
    let abmelden = () => {};
    const t = setTimeout(() => { abmelden = wennTabellenGeladen(["kontakte"], check); }, 5_000);
    const iv = setInterval(check, 5 * 60 * 1000);
    return () => { clearTimeout(t); abmelden(); clearInterval(iv); };
  }, [userName, userId]);
}