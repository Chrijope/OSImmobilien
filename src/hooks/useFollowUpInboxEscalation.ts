import { useEffect } from "react";
import { wennTabellenGeladen } from "@/lib/dataCache";
import { getKontakte } from "@/lib/kundenStore";
import { addInboxTask, getInboxTasks, setInboxTasks } from "@/lib/aktivitaetenStore";
import { getUserSetting, setUserSetting } from "@/lib/userSettingsCache";
import { isTestAccount } from "@/lib/dbStoreHelper";
import { kontaktBelongsToUser } from "@/lib/kontaktOwnership";

/**
 * Follow-Up Inbox-Eskalation (Stufen 2/3 und 3/3).
 *
 * Beim Anlegen eines Follow-Ups im Kundenprofil wird NUR Stufe 1/3
 * sofort als Inbox-Aufgabe erzeugt. Stufen 2 und 3 erscheinen erst,
 * wenn sie wirklich fällig sind UND der Lead noch in der Follow-Up-Stufe
 * steht UND kein neuer Follow-Up-Termin in der Zukunft gesetzt wurde.
 *
 * Läuft alle 5 Minuten + 1x bei Mount. Idempotent via REMINDER_KEY.
 */

const REMINDER_KEY = "mi_followup_inbox_escalations_sent";

function getSent(): Record<string, string[]> {
  if (isTestAccount()) {
    try { const raw = localStorage.getItem(REMINDER_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
  }
  return getUserSetting<Record<string, string[]>>(REMINDER_KEY, {});
}
function markSent(kundeId: string, stage: string, anchor: string) {
  const key = `${stage}::${anchor}`;
  const sent = getSent();
  if (!sent[kundeId]) sent[kundeId] = [];
  if (!sent[kundeId].includes(key)) {
    sent[kundeId].push(key);
    if (isTestAccount()) localStorage.setItem(REMINDER_KEY, JSON.stringify(sent));
    else setUserSetting(REMINDER_KEY, sent);
  }
}
function wasSent(kundeId: string, stage: string, anchor: string): boolean {
  return getSent()[kundeId]?.includes(`${stage}::${anchor}`) ?? false;
}

export function useFollowUpInboxEscalation(userName?: string, userId?: string) {
  useEffect(() => {
    function check() {
      const kontakte = getKontakte();
      const now = Date.now();
      let inbox = getInboxTasks();

      // Cleanup: Eskalations-Tasks entfernen, wenn der Lead die Follow-Up-Stufe
      // verlassen hat (z.B. Beratungsgespräch gebucht) oder ein neuer Folgetermin
      // in der Zukunft gesetzt wurde.
      const kontaktById = new Map(kontakte.map(k => [k.id, k] as const));
      const cleaned = inbox.filter(t => {
        if (t.typ !== "follow_up") return true;
        const isEscalation = t.titel.includes("überfällig (3h)") || t.titel.includes("DRINGEND (24h");
        if (!isEscalation) return true;
        const k: any = kontaktById.get(t.kundeId);
        if (!k) return true;
        if (k.pipelineStufe !== "follow_up") return false;
        const am = k.meta?.followUpAm;
        const uhr = k.meta?.followUpUhrzeit || "09:00";
        if (am) {
          const due = new Date(`${am}T${uhr}:00`).getTime();
          if (!isNaN(due) && due > now) return false;
        }
        return true;
      });
      if (cleaned.length !== inbox.length) {
        setInboxTasks(cleaned);
        inbox = cleaned;
      }

      for (const k of kontakte) {
        if (k.pipelineStufe !== "follow_up") continue;
        if (!kontaktBelongsToUser(k, { userName, userId })) continue;

        const meta: any = (k as any).meta || {};
        const am: string = meta.followUpAm || "";
        if (!am) continue;
        const uhr: string = meta.followUpUhrzeit || "09:00";
        const dueAt = new Date(`${am}T${uhr}:00`);
        if (isNaN(dueAt.getTime())) continue;

        const minutesOverdue = (now - dueAt.getTime()) / 60_000;
        if (minutesOverdue < 180) continue; // Stufe 1 reicht

        const name = `${k.vorname || ""} ${k.nachname || ""}`.trim();
        const fmtDate = (d: Date) => d.toISOString().split("T")[0];
        const fmtTime = (d: Date) => d.toTimeString().slice(0, 5);
        const anchor = `${am}T${uhr}`; // Reset, sobald ein neuer Termin gesetzt wird

        // Doppelt absichern: existiert eine Inbox-Aufgabe mit demselben Titel?
        const titleAlready = (needle: string) => inbox.some(t => t.kundeId === k.id && t.titel.includes(needle));

        // Stufe 2/3 – +3h
        if (minutesOverdue >= 180 && minutesOverdue < 1440) {
          if (!wasSent(k.id, "stage2", anchor) && !titleAlready("überfällig (3h)")) {
            const d = new Date(dueAt.getTime() + 3 * 60 * 60 * 1000);
            addInboxTask({
              titel: `⏰ Follow-Up überfällig (3h): ${name}`,
              beschreibung: `Stufe 2/3 – Follow-Up seit 3 Stunden überfällig. Bitte den Kunden kontaktieren oder neuen Folgetermin setzen.`,
              prioritaet: "hoch",
              typ: "follow_up",
              faellig_am: fmtDate(d),
              uhrzeit: fmtTime(d),
              kundeId: k.id,
              kundeName: name,
            });
            markSent(k.id, "stage2", anchor);
          }
        }

        // Stufe 3/3 – +24h
        if (minutesOverdue >= 1440) {
          if (!wasSent(k.id, "stage3", anchor) && !titleAlready("DRINGEND (24h")) {
            const d = new Date(dueAt.getTime() + 24 * 60 * 60 * 1000);
            addInboxTask({
              titel: `🚨 Follow-Up DRINGEND (24h überfällig): ${name}`,
              beschreibung: `Stufe 3/3 – Follow-Up seit 24 Stunden ohne Reaktion. Lead bitte sofort bearbeiten oder verloren markieren.`,
              prioritaet: "hoch",
              typ: "follow_up",
              faellig_am: fmtDate(d),
              uhrzeit: fmtTime(d),
              kundeId: k.id,
              kundeName: name,
            });
            markSent(k.id, "stage3", anchor);
          }
        }
      }
    }

    // Erst rechnen, wenn die Kontakte im Cache liegen (Laden je Route).
    let abmelden = () => {};
    const t = setTimeout(() => { abmelden = wennTabellenGeladen(["kontakte"], check); }, 5_000);
    const iv = setInterval(check, 5 * 60 * 1000);
    return () => { clearTimeout(t); abmelden(); clearInterval(iv); };
  }, [userName, userId]);
}