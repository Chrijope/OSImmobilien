import { getInboxTasks } from "./aktivitaetenStore";
import { getMeineAufgaben } from "./aufgabenStore";
import { getBewerber } from "./bewerbungStore";
import { bewerberErinnerungen } from "./bewerberErinnerungen";
import { siehtBewerberMeldungen } from "./bewerberRechte";
import { getFollowUps } from "./followUpStore";
import { getKontakte } from "./kundenStore";
import { getDoneInboxIds, isTaskOverdue } from "./inboxCountStore";
import { kontaktBelongsToUser } from "./kontaktOwnership";
import { liegtInZukunft } from "./faelligkeit";

type InboxTyp = "anruf" | "meeting" | "follow_up" | "aufgabe" | "deadline";

type InboxKpiTask = {
  id: string;
  typ: InboxTyp;
  faelligAm: string;
  uhrzeit?: string;
};

export type InboxKpiCounts = {
  followUpsOffen: number;
  followUpsUeberfaellig: number;
  aufgabenOffen: number;
  aufgabenUeberfaellig: number;
  sonstigeOffen: number;
  sonstigeUeberfaellig: number;
};

function parseGermanDateToISO(d?: string): string {
  if (!d) return "";
  const m = d.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return d;
  const [, dd, mm, yyyy] = m;
  return new Date(+yyyy, +mm - 1, +dd).toISOString();
}

/**
 * Zählt exakt die offene eigene Inbox-Liste, getrennt nach den Inbox-Filtern
 * „Follow-Ups" und „Aufgaben". Diese Funktion ist bewusst an die Inbox-Seite
 * gekoppelt, damit die Dashboard-Kacheln keine zweite, abweichende Logik haben.
 */
export function zaehleEigeneInboxKacheln(input: {
  userName: string;
  userId?: string;
  role?: string;
  /**
   * Nur zählen, was heute fällig oder überfällig ist. Alles mit einem Datum
   * in der Zukunft bleibt außen vor, weil dort heute nichts zu tun ist.
   */
  nurFaellig?: boolean;
}): InboxKpiCounts {
  const doneIds = getDoneInboxIds();
  const userId = input.userId;

  const ownedKundeIds = new Set<string>();
  try {
    getKontakte().forEach((k) => {
      if (kontaktBelongsToUser(k, { userName: input.userName, userId })) {
        ownedKundeIds.add(k.id);
      }
    });
  } catch { /* ignore */ }

  const storedTasks: InboxKpiTask[] = getInboxTasks().map((t) => ({
    id: t.id,
    typ: t.typ,
    faelligAm: t.faellig_am,
    uhrzeit: t.uhrzeit,
  }));

  const aufgabenTasks: InboxKpiTask[] = getMeineAufgaben(userId).map((a) => ({
    id: `ag-${a.id}`,
    typ: a.typ,
    faelligAm: a.faelligAm || "",
    uhrzeit: a.uhrzeit || "—",
  }));

  const followUpTasks: InboxKpiTask[] = getFollowUps()
    .filter((f) => f.status !== "erledigt" && ownedKundeIds.has(f.kundeId))
    .map((f) => ({
      id: `fu-${f.id}`,
      typ: "follow_up" as const,
      faelligAm: f.faelligAm,
      uhrzeit: "—",
    }));

  // Dieselbe Regel wie in der Inbox-Seite: Bewerbersachen sieht nur HR. Liefe
  // der Zähler weiter über die Admin-Rolle, stünde auf dem Dashboard eine Zahl
  // und in der Inbox eine leere Liste.
  const bewerberFollowUps: InboxKpiTask[] = siehtBewerberMeldungen(input.role)
    ? getBewerber()
        .flatMap(bewerberErinnerungen)
        .map((e) => ({
          id: e.id,
          typ: "follow_up" as const,
          faelligAm: parseGermanDateToISO(e.faelligAm),
          uhrzeit: e.uhrzeit || "—",
        }))
    : [];

  const offen = [...storedTasks, ...aufgabenTasks, ...followUpTasks, ...bewerberFollowUps]
    .filter((t) => !doneIds.includes(t.id))
    .filter((t) => !input.nurFaellig || !liegtInZukunft(t.faelligAm));

  return offen.reduce<InboxKpiCounts>(
    (summe, task) => {
      const overdue = isTaskOverdue(task.faelligAm, task.uhrzeit);
      if (task.typ === "follow_up") {
        summe.followUpsOffen += 1;
        if (overdue) summe.followUpsUeberfaellig += 1;
      }
      if (task.typ === "aufgabe") {
        summe.aufgabenOffen += 1;
        if (overdue) summe.aufgabenUeberfaellig += 1;
      }
      if (task.typ !== "follow_up" && task.typ !== "aufgabe") {
        summe.sonstigeOffen += 1;
        if (overdue) summe.sonstigeUeberfaellig += 1;
      }
      return summe;
    },
    {
      followUpsOffen: 0,
      followUpsUeberfaellig: 0,
      aufgabenOffen: 0,
      aufgabenUeberfaellig: 0,
      sonstigeOffen: 0,
      sonstigeUeberfaellig: 0,
    },
  );
}