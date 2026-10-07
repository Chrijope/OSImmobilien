import { useEffect } from "react";
import { wennTabellenGeladen } from "@/lib/dataCache";
import { getKontakte } from "@/lib/kundenStore";
import { addInboxTask, getInboxTasks, setInboxTasks } from "@/lib/aktivitaetenStore";
import { getUserSetting, setUserSetting } from "@/lib/userSettingsCache";
import { isTestAccount } from "@/lib/dbStoreHelper";
import { kontaktBelongsToUser } from "@/lib/kontaktOwnership";
import { getEffectivePipelineStufe, type PipelineStufe } from "@/lib/kontaktPipeline";
import { hatVereinbartenKontakt } from "@/lib/kontaktTermine";

/**
 * Phase 6 – Stillstands-Nudges pro Pipeline-Stufe.
 *
 * Für Leads, die zu lange in einer Stufe „hängen" (SLA-Verletzung),
 * wird eine Inbox-Aufgabe erzeugt, damit der zuständige Nutzer sie
 * aktiv weiterbewegt (oder als verloren markiert). Der Nudge feuert
 * pro Kalenderwoche einmal — falls der Lead nach 7 Tagen weiter still
 * ist, gibt es einen frischen Reminder. Sobald die Stufe wechselt,
 * wird der offene Nudge aus der Inbox entfernt.
 *
 * Signal für „wie lange in der Stufe": `aktualisiert_am` als Näherung
 * (jede Aktion setzt das Feld). Fallback: `erstellt_am`.
 *
 * Hat der Zuständige einen nächsten Schritt in der Zukunft eingetragen, gibt
 * es keinen Nudge, und ein offener verschwindet (siehe hatVereinbartenKontakt).
 */

const REMINDER_KEY = "mi_stagnation_nudges_sent";
const NUDGE_MARK = "[Stillstand]";

// SLA in Tagen pro Stufe. Fehlt eine Stufe → kein Nudge.
const SLA_DAYS: Partial<Record<PipelineStufe, number>> = {
  erstgespraech_geplant: 3,
  beratungsgespraech: 7,
  selbstauskunft: 5,
  bonitaetsunterlagen: 5,
  objektauswahl: 10,
  follow_up_objekt: 10,
  reservierung: 14,
  finanzierung: 10,
};

const STUFE_LABEL: Partial<Record<PipelineStufe, string>> = {
  erstgespraech_geplant: "Erstgespräch",
  beratungsgespraech: "Beratungsgespräch",
  selbstauskunft: "Selbstauskunft",
  bonitaetsunterlagen: "Bonitätsunterlagen",
  objektauswahl: "Objektauswahl",
  follow_up_objekt: "Follow-Up",
  reservierung: "Reservierung",
  finanzierung: "Finanzierung",
};

function getSent(): Record<string, string[]> {
  if (isTestAccount()) {
    try { const raw = localStorage.getItem(REMINDER_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
  }
  return getUserSetting<Record<string, string[]>>(REMINDER_KEY, {});
}
function markSent(kundeId: string, key: string) {
  const sent = getSent();
  if (!sent[kundeId]) sent[kundeId] = [];
  if (!sent[kundeId].includes(key)) {
    sent[kundeId].push(key);
    if (isTestAccount()) localStorage.setItem(REMINDER_KEY, JSON.stringify(sent));
    else setUserSetting(REMINDER_KEY, sent);
  }
}
function wasSent(kundeId: string, key: string): boolean {
  return getSent()[kundeId]?.includes(key) ?? false;
}

/** ISO-Kalenderwoche als stabiler Anker (YYYY-Www) für idempotente Nudges. */
function isoWeekAnchor(d: Date): string {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export function useStagnationInboxNudges(userName?: string, userId?: string) {
  useEffect(() => {
    function check() {
      const kontakte = getKontakte();
      const now = Date.now();
      let inbox = getInboxTasks();

      // Cleanup: Stillstand-Nudges entfernen, wenn Lead die Stufe verlassen hat
      // oder Lead archiviert / verloren ist.
      const kontaktById = new Map(kontakte.map(k => [k.id, k] as const));
      const cleaned = inbox.filter(t => {
        if (!t.titel?.includes(NUDGE_MARK)) return true;
        const k: any = kontaktById.get(t.kundeId);
        if (!k) return false;
        if (k.archiviert) return false;
        if (hatVereinbartenKontakt(k)) return false;
        const currentStufe = getEffectivePipelineStufe(k);
        // Ableiten, für welche Stufe der Nudge ursprünglich war (aus Titel)
        const stagesInTitle = Object.entries(STUFE_LABEL).find(([, label]) => t.titel.includes(label!));
        if (!stagesInTitle) return true;
        return currentStufe === stagesInTitle[0];
      });
      if (cleaned.length !== inbox.length) {
        setInboxTasks(cleaned);
        inbox = cleaned;
      }

      for (const k of kontakte as any[]) {
        if (k.archiviert) continue;
        if (!kontaktBelongsToUser(k, { userName, userId })) continue;

        const stufe = getEffectivePipelineStufe(k);
        const sla = SLA_DAYS[stufe];
        const label = STUFE_LABEL[stufe];
        if (!sla || !label) continue;

        const anchorRaw: string = k.aktualisiert_am || k.erstellt_am || k.erstelltAm;
        if (!anchorRaw) continue;
        const anchorMs = new Date(anchorRaw).getTime();
        if (isNaN(anchorMs)) continue;

        const daysInStage = (now - anchorMs) / (24 * 60 * 60 * 1000);
        if (daysInStage < sla) continue;
        if (hatVereinbartenKontakt(k)) continue;

        const weekAnchor = isoWeekAnchor(new Date());
        const sentKey = `${stufe}::${weekAnchor}`;
        if (wasSent(k.id, sentKey)) continue;

        const name = `${k.vorname || ""} ${k.nachname || ""}`.trim();
        const titleNeedle = `${NUDGE_MARK} ${label}: ${name}`;
        // Doppelt absichern gegen bestehende offene Nudges dieser Stufe
        if (inbox.some(t => t.kundeId === k.id && t.titel.includes(NUDGE_MARK) && t.titel.includes(label))) {
          markSent(k.id, sentKey);
          continue;
        }

        const d = new Date();
        const fmtDate = (x: Date) => x.toISOString().split("T")[0];
        const fmtTime = (x: Date) => x.toTimeString().slice(0, 5);
        addInboxTask({
          titel: `⏳ ${titleNeedle}`,
          beschreibung: `Lead steht seit ${Math.floor(daysInStage)} Tagen in „${label}" ohne Fortschritt (SLA ${sla} Tage). Bitte kontaktieren, weiterbewegen oder als verloren markieren.`,
          prioritaet: "hoch",
          typ: "aufgabe",
          faellig_am: fmtDate(d),
          uhrzeit: fmtTime(d),
          kundeId: k.id,
          kundeName: name,
        });
        markSent(k.id, sentKey);
      }
    }

    // Erst rechnen, wenn die Kontakte im Cache liegen (Laden je Route).
    let abmelden = () => {};
    const t = setTimeout(() => { abmelden = wennTabellenGeladen(["kontakte"], check); }, 6_000);
    const iv = setInterval(check, 10 * 60 * 1000);
    return () => { clearTimeout(t); abmelden(); clearInterval(iv); };
  }, [userName, userId]);
}