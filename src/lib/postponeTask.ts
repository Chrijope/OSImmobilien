/**
 * Verschiebt eine Fokus-/Inbox-Aufgabe um X Tage bzw. auf ein neues Datum.
 * Unterstützt dieselben Quellen wie die Inbox-Liste:
 *   - Geteilte Aufgaben (id-Prefix `ag-`) → updates `aufgaben.faellig_am`
 *   - Follow-Ups        (id-Prefix `fu-`) → updates `follow_ups.faellig_am`
 *   - Bewerber          (`bw-`, `bz-`)    → updates den Bewerber
 *   - Inbox-Tasks       (reine UUID)      → updates `user_settings.inbox_tasks[i].faellig_am`
 */
import { getInboxTasks, setInboxTasks } from "./aktivitaetenStore";
import { cacheUpdate } from "./dataCache";
import { isTestAccount, localGet, localSet } from "./dbStoreHelper";
import type { FollowUp } from "./followUpStore";
import { getBewerber, updateBewerber } from "./bewerbungStore";
import { tageVorher } from "./bewerberErinnerungen";

const LS_FU = "mi_followups";

function toIsoDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

export function nextWorkday(base: Date): Date {
  let next = addDays(base, 1);
  while (next.getDay() === 0 || next.getDay() === 6) next = addDays(next, 1);
  return next;
}

export type PostponePreset = "plus1" | "plus3" | "nextWorkday" | "plus7";

export function resolvePreset(preset: PostponePreset, from: Date = new Date()): Date {
  switch (preset) {
    case "plus1": return addDays(from, 1);
    case "plus3": return addDays(from, 3);
    case "plus7": return addDays(from, 7);
    case "nextWorkday": return nextWorkday(from);
  }
}

/**
 * Verschiebt eine Aufgabe. `taskId` ist die ID wie in FocusTask (mit `fu-` Prefix
 * für Follow-Ups). `newDate` ist ein Datum – nur der Tag zählt, Uhrzeit bleibt
 * absichtlich leer, damit die Aufgabe erneut für den Fokus-Modus geeignet ist.
 */
export function postponeTask(taskId: string, newDate: Date): void {
  const iso = toIsoDateOnly(newDate);

  // Geteilte Aufgabe aus der Tabelle. Die Uhrzeit wird bewusst geleert, sonst
  // fiele die verschobene Aufgabe am neuen Tag wieder aus dem Fokus-Modus.
  if (taskId.startsWith("ag-")) {
    const rawId = taskId.slice(3);
    cacheUpdate("aufgaben", rawId, { faellig_am: iso, uhrzeit: null, status: "offen" });
    return;
  }

  if (taskId.startsWith("fu-")) {
    const rawId = taskId.slice(3);
    if (isTestAccount()) {
      const all = localGet<FollowUp[]>(LS_FU, []);
      const idx = all.findIndex((f) => f.id === rawId);
      if (idx >= 0) {
        all[idx].faelligAm = iso;
        all[idx].status = "offen";
        localSet(LS_FU, all);
      }
    } else {
      cacheUpdate("follow_ups", rawId, { faellig_am: iso, status: "offen" });
    }
    return;
  }

  if (taskId.startsWith("bw-")) {
    const rawId = taskId.slice(3);
    const de = `${String(newDate.getDate()).padStart(2, "0")}.${String(newDate.getMonth() + 1).padStart(2, "0")}.${newDate.getFullYear()}`;
    updateBewerber(rawId, { followUpDatum: de });
    return;
  }

  // Erinnerung zum Bedenkzeit-Rückruf (bz-): Verschoben wird nur die
  // Erinnerung, nicht der mit dem Bewerber vereinbarte Rückruf. Der neue
  // Vorlauf ergibt sich aus dem Abstand zum Rückruftag.
  if (taskId.startsWith("bz-")) {
    const rawId = taskId.slice(3);
    const b = getBewerber().find((x) => x.id === rawId);
    if (!b?.bedenkzeitRueckrufAm) return;
    updateBewerber(rawId, { bedenkzeitErinnerungTage: tageVorher(b.bedenkzeitRueckrufAm, newDate) });
    return;
  }

  // Inbox-Task in user_settings
  const tasks = getInboxTasks();
  const next = tasks.map((t) => (t.id === taskId ? { ...t, faellig_am: iso } : t));
  setInboxTasks(next);
}