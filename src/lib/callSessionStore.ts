// Anruf-Session (Bulk-Call-Queue) — Phase 4.
// State lebt ausschließlich im sessionStorage (nicht geräteübergreifend nötig).

const KEY = "mi_call_session_v1";

export interface CallSession {
  ids: string[];
  index: number;
  startedAt: string;
}

function emitChange() {
  try {
    window.dispatchEvent(new CustomEvent("call-session-changed"));
  } catch {}
}

export function getCallSession(): CallSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CallSession;
    if (!parsed || !Array.isArray(parsed.ids) || parsed.ids.length === 0) return null;
    if (typeof parsed.index !== "number" || parsed.index < 0) parsed.index = 0;
    return parsed;
  } catch {
    return null;
  }
}

export function startCallSession(ids: string[]): CallSession | null {
  const clean = Array.from(new Set(ids.filter(Boolean)));
  if (clean.length === 0) return null;
  const session: CallSession = {
    ids: clean,
    index: 0,
    startedAt: new Date().toISOString(),
  };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {}
  emitChange();
  return session;
}

export function endCallSession() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {}
  emitChange();
}

/** Rückt die Session um eine Position weiter. Gibt die nächste Kunden-ID zurück oder `null`, wenn die Queue erschöpft ist. */
export function advanceCallSession(): string | null {
  const s = getCallSession();
  if (!s) return null;
  const nextIndex = s.index + 1;
  if (nextIndex >= s.ids.length) {
    endCallSession();
    return null;
  }
  const next: CallSession = { ...s, index: nextIndex };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  emitChange();
  return next.ids[nextIndex];
}

/** Positioniert die Session direkt auf die angegebene Kunden-ID (wenn enthalten). */
export function focusCallSessionOn(kundeId: string): CallSession | null {
  const s = getCallSession();
  if (!s) return null;
  const idx = s.ids.indexOf(kundeId);
  if (idx < 0) return s;
  if (idx === s.index) return s;
  const next: CallSession = { ...s, index: idx };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  emitChange();
  return next;
}

export function subscribeCallSession(cb: () => void): () => void {
  const handler = () => cb();
  const storageHandler = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  window.addEventListener("call-session-changed", handler);
  window.addEventListener("storage", storageHandler);
  return () => {
    window.removeEventListener("call-session-changed", handler);
    window.removeEventListener("storage", storageHandler);
  };
}