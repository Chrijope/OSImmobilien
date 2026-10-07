/**
 * Verschieben aus dem Fokus-Modus heraus.
 *
 * Die geteilten Aufgaben (`ag-`) fehlten hier genauso wie beim Zählen. Ein
 * Klick auf „Verschieben" lief dann in den Zweig für die persönlichen
 * Inbox-Aufgaben, fand dort nichts und tat still gar nichts.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const updates: { tabelle: string; id: string; daten: Record<string, unknown> }[] = [];
type Zeile = Record<string, unknown>;

const inboxTasks: Zeile[] = [];
let gespeicherteInboxTasks: Zeile[] | null = null;

vi.mock("@/lib/dataCache", () => ({
  cacheUpdate: (tabelle: string, id: string, daten: Record<string, unknown>) => {
    updates.push({ tabelle, id, daten });
    return Promise.resolve(true);
  },
}));
vi.mock("@/lib/aktivitaetenStore", () => ({
  getInboxTasks: () => inboxTasks,
  setInboxTasks: (next: Zeile[]) => { gespeicherteInboxTasks = next; },
}));
vi.mock("@/lib/dbStoreHelper", () => ({
  isTestAccount: () => false,
  localGet: () => [],
  localSet: () => {},
}));
vi.mock("@/lib/bewerbungStore", () => ({
  getBewerber: () => [],
  updateBewerber: () => {},
}));
vi.mock("@/lib/bewerberErinnerungen", () => ({
  tageVorher: () => 1,
}));

const { postponeTask } = await import("@/lib/postponeTask");

beforeEach(() => {
  updates.length = 0;
  inboxTasks.length = 0;
  gespeicherteInboxTasks = null;
});

describe("Aufgabe verschieben", () => {
  it("schreibt bei einer geteilten Aufgabe in die Tabelle aufgaben", () => {
    postponeTask("ag-abc", new Date("2026-09-20T10:00:00"));

    expect(updates).toHaveLength(1);
    expect(updates[0].tabelle).toBe("aufgaben");
    expect(updates[0].id).toBe("abc");
    expect(updates[0].daten.faellig_am).toBe("2026-09-20");
    // Ohne geleerte Uhrzeit fiele die Aufgabe am neuen Tag wieder aus dem Fokus.
    expect(updates[0].daten.uhrzeit).toBeNull();
  });

  it("fasst die persönliche Inbox-Aufgabe nicht an, wenn eine geteilte gemeint war", () => {
    inboxTasks.push({ id: "abc", faellig_am: "2026-09-14" });
    postponeTask("ag-abc", new Date("2026-09-20T10:00:00"));
    expect(gespeicherteInboxTasks).toBeNull();
  });

  it("schreibt bei einem Follow-Up weiterhin in follow_ups", () => {
    postponeTask("fu-xyz", new Date("2026-09-20T10:00:00"));
    expect(updates[0].tabelle).toBe("follow_ups");
    expect(updates[0].id).toBe("xyz");
  });
});
