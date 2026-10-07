/**
 * Focus-Modus: fokussiert nacheinander alle heute fälligen Aufgaben ohne
 * feste Uhrzeit im jeweiligen Kundenprofil ab. Inspiriert vom HubSpot Task
 * Queue / Play-Mode.
 *
 * State liegt in localStorage – die Reihenfolge wird beim Start fixiert und
 * überlebt Reloads / Tab-Wechsel. Änderungen an der Task-Liste (neue Tasks,
 * externe Erledigungen) beeinflussen laufende Queues nicht.
 */

import { getInboxTasks, type InboxTask } from "./aktivitaetenStore";
import { getMeineAufgaben } from "./aufgabenStore";
import { getFollowUps } from "./followUpStore";
import { getKontakte } from "./kundenStore";
import { getBewerber } from "./bewerbungStore";
import { bewerberErinnerungen } from "./bewerberErinnerungen";
import { kontaktBelongsToUser } from "./kontaktOwnership";
import { toDateString, getTodayDateString, getDoneInboxIds } from "./inboxCountStore";

export type FocusTaskTyp = "anruf" | "meeting" | "follow_up" | "aufgabe" | "deadline";

export interface FocusTask {
  /**
   * Task-ID, genau wie in der Inbox-Liste: reine UUID für die persönlichen
   * Inbox-Aufgaben, `ag-` für die geteilten Aufgaben aus der Tabelle,
   * `fu-` für Follow-Ups, `bw-`/`bz-` für Bewerber-Erinnerungen.
   */
  id: string;
  kundeId: string;
  kundeName: string;
  titel: string;
  beschreibung: string;
  typ: FocusTaskTyp;
  faellig_am: string;
  uhrzeit: string;
  /** Quelle bestimmt Navigation & Erledigung im Fokus-Banner. */
  source?: "inbox" | "aufgabe" | "followup" | "bewerber";
}

export interface FocusQueueState {
  startedAt: string;
  taskIds: string[];
  tasks: FocusTask[];
  currentIndex: number;
  completedIds: string[];
  skippedIds: string[];
  paused: boolean;
}

const LS_KEY = "mi_focus_queue";
const EVENT = "focus-queue-updated";

const ELIGIBLE_TYPES: FocusTaskTyp[] = ["anruf", "meeting", "follow_up", "aufgabe", "deadline"];

function isNoFixedTime(uhrzeit: string | undefined): boolean {
  if (!uhrzeit) return true;
  const trimmed = uhrzeit.trim();
  return trimmed === "" || trimmed === "—" || trimmed === "-" || trimmed === "00:00";
}

/**
 * Passt der Eintrag ins Zeitfenster des Fokus-Modus?
 *
 * Überfälliges kommt immer mit, auch mit fester Uhrzeit, denn der Termin ist
 * bereits verpasst. Von heute kommt nur mit, was keine feste Uhrzeit trägt,
 * denn Termine mit Uhrzeit stehen im Kalender. Ohne lesbares Datum bleibt ein
 * Eintrag draußen, sonst wüsste die Reihenfolge nicht, wohin mit ihm.
 */
function passtInsZeitfenster(faellig: string | undefined, uhrzeit: string | undefined, today: string): boolean {
  const ds = toDateString(faellig);
  if (!ds || ds > today) return false;
  if (ds === today && !isNoFixedTime(uhrzeit)) return false;
  return true;
}

/**
 * Liefert alle für den Fokus-Modus geeigneten Einträge. Maßgeblich ist, was
 * die Inbox als offen anzeigt, deshalb kommen dieselben vier Quellen vor:
 *
 *   1. die persönlichen Inbox-Aufgaben aus den Einstellungen,
 *   2. die geteilten Aufgaben aus der Tabelle `aufgaben` (Präfix `ag-`),
 *   3. die Follow-Ups der eigenen Kunden,
 *   4. die Bewerber-Erinnerungen, sofern der Nutzer sie sehen darf.
 *
 * Quelle 2 fehlte früher ganz. Weil fast jede Aufgabe im CRM inzwischen dort
 * landet, konnten zehn Einträge in der Liste stehen, während der Fokus-Modus
 * null zählte und der Knopf grau blieb.
 *
 * Zeitfenster: alles Überfällige plus alles, was heute ohne feste Uhrzeit
 * ansteht. Bereits abgehakte Einträge bleiben draußen.
 */
export function getFocusEligibleTasks(
  userName: string,
  userId?: string,
  opts: { includeBewerber?: boolean } = {},
): FocusTask[] {
  const today = getTodayDateString();
  const list: FocusTask[] = [];
  const erledigteIds = new Set<string>((() => { try { return getDoneInboxIds(); } catch { return []; } })());

  // 1) Inbox-Tasks aus user_settings
  try {
    const inbox = getInboxTasks();
    inbox.forEach((t: InboxTask) => {
      if (!ELIGIBLE_TYPES.includes(t.typ as FocusTaskTyp)) return;
      if (erledigteIds.has(t.id)) return;
      if (!passtInsZeitfenster(t.faellig_am, t.uhrzeit, today)) return;
      list.push({
        id: t.id,
        kundeId: t.kundeId,
        kundeName: t.kundeName,
        titel: t.titel,
        beschreibung: t.beschreibung,
        typ: t.typ as FocusTaskTyp,
        faellig_am: t.faellig_am,
        uhrzeit: t.uhrzeit,
        source: "inbox",
      });
    });
  } catch { /* ignore */ }

  // 1b) Geteilte Aufgaben aus der Tabelle. Das ist der Weg, den heute fast
  // jede Aufgabe im CRM nimmt, siehe addGeteilteAufgabe().
  try {
    const namenJeKunde = new Map<string, string>();
    try {
      getKontakte().forEach((k) => {
        const name = [k.vorname, k.nachname].filter(Boolean).join(" ").trim();
        namenJeKunde.set(k.id, name || "Kunde");
      });
    } catch { /* ignore */ }
    const namenJeBewerber = new Map<string, string>();
    try {
      getBewerber().forEach((b) => {
        const name = [b.vorname, b.nachname].filter(Boolean).join(" ").trim();
        namenJeBewerber.set(b.id, name || "Bewerber");
      });
    } catch { /* ignore */ }

    // Bewusst ohne Rollenfilter: Eine Aufgabe aus der Tabelle steht ohnehin
    // nur dem zur Verfügung, der sie angelegt hat oder der sie abarbeiten
    // soll, dafür sorgt die Zugriffskontrolle der Datenbank. Genau so zeigt
    // die Inbox-Liste sie auch an. Der Schalter `includeBewerber` gilt nur
    // für die abgeleiteten Bewerber-Erinnerungen weiter unten.
    getMeineAufgaben(userId).forEach((a) => {
      if (!ELIGIBLE_TYPES.includes(a.typ as FocusTaskTyp)) return;
      const id = `ag-${a.id}`;
      if (erledigteIds.has(id)) return;
      if (!passtInsZeitfenster(a.faelligAm, a.uhrzeit, today)) return;
      // Der Fokus-Modus führt in ein Profil. Eine Aufgabe ohne Kunde und ohne
      // Bewerber hat keines und bleibt deshalb in der Liste stehen.
      const zielId = a.bewerbungId || a.kontaktId || "";
      if (!zielId) return;
      list.push({
        id,
        kundeId: zielId,
        kundeName: a.bewerbungId
          ? (namenJeBewerber.get(a.bewerbungId) || "Bewerber")
          : (namenJeKunde.get(a.kontaktId || "") || "Kunde"),
        titel: a.titel,
        beschreibung: a.beschreibung || "",
        typ: a.typ as FocusTaskTyp,
        faellig_am: a.faelligAm || "",
        uhrzeit: a.uhrzeit || "—",
        source: a.bewerbungId ? "bewerber" : "aufgabe",
      });
    });
  } catch { /* ignore */ }

  // 2) Follow-Ups (nur eigene Kunden)
  try {
    const ownedKundeIds = new Set<string>();
    getKontakte().forEach((k: any) => {
      if (kontaktBelongsToUser(k, { userName, userId })) ownedKundeIds.add(k.id);
    });
    getFollowUps().forEach((f) => {
      if (f.status === "erledigt") return;
      if (!ownedKundeIds.has(f.kundeId)) return;
      const ds = toDateString(f.faelligAm);
      if (!ds || ds > today) return;
      list.push({
        id: `fu-${f.id}`,
        kundeId: f.kundeId,
        kundeName: f.kundeName,
        titel: f.titel,
        beschreibung: f.beschreibung,
        typ: "follow_up",
        faellig_am: f.faelligAm,
        uhrzeit: "—",
        source: "followup",
      });
    });
  } catch { /* ignore */ }

  // 3) Bewerber-Follow-Ups (nur für Admin/Inhaber – über Flag gesteuert)
  if (opts.includeBewerber) {
    try {
      // Manuelle Follow-Ups und Rückrufe aus der Bedenkzeit, siehe bewerberErinnerungen.ts
      getBewerber().flatMap(bewerberErinnerungen).forEach((e) => {
        const ds = toDateString(e.faelligAm);
        if (!ds || ds > today) return;
        if (erledigteIds.has(e.id)) return;
        list.push({
          id: e.id,
          kundeId: e.bewerberId,
          kundeName: e.name,
          titel: e.titel,
          beschreibung: e.beschreibung,
          typ: "follow_up",
          faellig_am: ds,
          uhrzeit: e.uhrzeit || "—",
          source: "bewerber",
        });
      });
    } catch { /* ignore */ }
  }

  // Stable sort: älteste Fälligkeit zuerst
  list.sort((a, b) => (a.faellig_am || "").localeCompare(b.faellig_am || ""));
  return list;
}

/** Der Teil eines offenen Inbox-Eintrags, den die Erklärung unten braucht. */
export interface OffenerEintrag {
  faellig_am: string;
  uhrzeit: string;
  kundeId: string;
}

/**
 * Erklärt in ganzen Sätzen, warum der Fokus-Modus nichts zu tun findet,
 * obwohl in der Inbox Einträge stehen.
 *
 * Ohne diese Erklärung blieb der Knopf nur grau. Zehn Einträge auf dem Schirm
 * und ein toter Knopf daneben ist für den Nutzer nicht auflösbar, deshalb
 * sagt der Fokus-Modus jetzt, was er gezählt hat und was ihm fehlt.
 */
export function fokusLeerGrund(offene: OffenerEintrag[], heute: string = getTodayDateString()): string {
  if (offene.length === 0) {
    return "In deiner Inbox steht gerade nichts Offenes. Sobald eine Aufgabe für heute ansteht oder überfällig wird, kannst du den Fokus-Modus starten.";
  }

  let zukunft = 0;
  let heuteMitUhrzeit = 0;
  let ohneDatum = 0;
  let ohneProfil = 0;

  offene.forEach((e) => {
    const ds = toDateString(e.faellig_am);
    if (!ds) { ohneDatum += 1; return; }
    if (ds > heute) { zukunft += 1; return; }
    if (ds === heute && !isNoFixedTime(e.uhrzeit)) { heuteMitUhrzeit += 1; return; }
    if (!e.kundeId) { ohneProfil += 1; return; }
  });

  const gruende: string[] = [];
  if (zukunft > 0) gruende.push(`${zukunft} ${zukunft === 1 ? "ist" : "sind"} erst später fällig`);
  if (heuteMitUhrzeit > 0) gruende.push(`${heuteMitUhrzeit} ${heuteMitUhrzeit === 1 ? "hat" : "haben"} heute eine feste Uhrzeit und ${heuteMitUhrzeit === 1 ? "steht" : "stehen"} damit im Kalender`);
  if (ohneDatum > 0) gruende.push(`${ohneDatum} ${ohneDatum === 1 ? "hat" : "haben"} gar kein Fälligkeitsdatum`);
  if (ohneProfil > 0) gruende.push(`${ohneProfil} ${ohneProfil === 1 ? "hängt" : "hängen"} an keinem Kunden und keinem Bewerber`);

  const einleitung = `Der Fokus-Modus nimmt alles Überfällige und alles, was heute ohne feste Uhrzeit ansteht. Von deinen ${offene.length} offenen Einträgen passt gerade keiner.`;
  if (gruende.length === 0) return einleitung;
  return `${einleitung} Grund: ${gruende.join(", ")}.`;
}

export function loadFocusQueue(): FocusQueueState | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as FocusQueueState;
  } catch {
    return null;
  }
}

function saveFocusQueue(state: FocusQueueState | null) {
  try {
    if (!state) localStorage.removeItem(LS_KEY);
    else localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent(EVENT)); } catch { /* ignore */ }
}

export function startFocusQueue(tasks: FocusTask[]): FocusQueueState | null {
  if (!tasks.length) return null;
  const state: FocusQueueState = {
    startedAt: new Date().toISOString(),
    taskIds: tasks.map((t) => t.id),
    tasks,
    currentIndex: 0,
    completedIds: [],
    skippedIds: [],
    paused: false,
  };
  saveFocusQueue(state);
  return state;
}

export function exitFocusQueue() {
  saveFocusQueue(null);
}

export function pauseFocusQueue() {
  const s = loadFocusQueue();
  if (!s) return;
  saveFocusQueue({ ...s, paused: true });
}

export function resumeFocusQueue() {
  const s = loadFocusQueue();
  if (!s) return;
  saveFocusQueue({ ...s, paused: false });
}

/** Setzt currentIndex auf nächsten offenen Task – oder markiert Queue als fertig. */
export function advanceFocusQueue(): FocusQueueState | null {
  const s = loadFocusQueue();
  if (!s) return null;
  const next = s.currentIndex + 1;
  const updated: FocusQueueState = { ...s, currentIndex: next };
  saveFocusQueue(updated);
  return updated;
}

export function markCurrentCompleted(): FocusQueueState | null {
  const s = loadFocusQueue();
  if (!s) return null;
  const currentId = s.taskIds[s.currentIndex];
  if (!currentId) return s;
  const updated: FocusQueueState = {
    ...s,
    completedIds: [...s.completedIds, currentId],
    currentIndex: s.currentIndex + 1,
  };
  saveFocusQueue(updated);
  return updated;
}

export function markCurrentSkipped(): FocusQueueState | null {
  const s = loadFocusQueue();
  if (!s) return null;
  const currentId = s.taskIds[s.currentIndex];
  if (!currentId) return s;
  const updated: FocusQueueState = {
    ...s,
    skippedIds: [...s.skippedIds, currentId],
    currentIndex: s.currentIndex + 1,
  };
  saveFocusQueue(updated);
  return updated;
}

export function focusQueueEvent(): string {
  return EVENT;
}

export function currentFocusTask(state: FocusQueueState | null): FocusTask | null {
  if (!state) return null;
  return state.tasks[state.currentIndex] ?? null;
}

export function isFocusQueueFinished(state: FocusQueueState | null): boolean {
  if (!state) return false;
  return state.currentIndex >= state.tasks.length;
}