// Central store for inbox open task count (reactive via CustomEvent)
// Done tasks stay done permanently (no daily reset)

import { getUserSetting, setUserSetting } from "./userSettingsCache";
import { isTestAccount } from "./dbStoreHelper";

const INBOX_OPEN_KEY = "mi_inbox_open_count";
const INBOX_DONE_KEY = "mi_inbox_done_ids";

function lsGet(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } }
function lsSet(key: string, val: string) { try { localStorage.setItem(key, val); } catch {} }

export function getInboxOpenCount(): number {
  if (isTestAccount()) {
    try { const v = lsGet(INBOX_OPEN_KEY); if (v !== null) return parseInt(v, 10); return -getDoneInboxIds().length; } catch { return 0; }
  }
  return getUserSetting<number>("inbox_open_count", -getDoneInboxIds().length);
}

export function setInboxOpenCount(count: number) {
  if (isTestAccount()) { lsSet(INBOX_OPEN_KEY, String(count)); }
  else { setUserSetting("inbox_open_count", count); }
  window.dispatchEvent(new CustomEvent("inbox-count-updated"));
}

export function getDoneInboxIds(): string[] {
  if (isTestAccount()) { try { const raw = lsGet(INBOX_DONE_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; } }
  return getUserSetting<string[]>("inbox_done_ids", []);
}

export function markInboxTaskDone(id: string) {
  const ids = getDoneInboxIds();
  if (!ids.includes(id)) {
    ids.push(id);
    if (isTestAccount()) { lsSet(INBOX_DONE_KEY, JSON.stringify(ids)); }
    else { setUserSetting("inbox_done_ids", ids); }
  }
}

export function unmarkInboxTaskDone(id: string) {
  const ids = getDoneInboxIds().filter((d) => d !== id);
  if (isTestAccount()) { lsSet(INBOX_DONE_KEY, JSON.stringify(ids)); }
  else { setUserSetting("inbox_done_ids", ids); }
}

export function isInboxTaskDone(id: string): boolean {
  return getDoneInboxIds().includes(id);
}

/** Get all done task IDs */
export function getTodayDoneIds(): string[] {
  if (isTestAccount()) { try { const raw = lsGet(INBOX_DONE_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; } }
  return getUserSetting<string[]>("inbox_done_ids", []);
}

// ── Fälligkeit ────────────────────────────────────────────────────────────
// Die Regel steht seit dem Abgleich mit dem Dashboard in faelligkeit.ts.
// Hier bleiben nur die Namen, die der Rest des Projekts schon benutzt.

export {
  alsDatumsString as toDateString,
  heuteAlsString as getTodayDateString,
  istUeberfaellig as isTaskOverdue,
  istVomVortag as isTaskFromPreviousDay,
} from "./faelligkeit";
