/**
 * Der Fokus-Modus muss dieselben Einträge zählen, die die Inbox anzeigt.
 *
 * Anlass: In der Inbox standen zehn Einträge, der Knopf „Starten" zeigte
 * trotzdem null und ließ sich nicht drücken. Grund war, dass die geteilten
 * Aufgaben aus der Tabelle `aufgaben` gar nicht mitgezählt wurden, obwohl
 * inzwischen fast jede Aufgabe im CRM dort landet.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

/** Die Attrappen halten lose Zeilen, genau wie die Stores sie liefern. */
type Zeile = Record<string, unknown>;

const inboxTasks: Zeile[] = [];
const meineAufgaben: Zeile[] = [];
const followUps: Zeile[] = [];
const kontakte: Zeile[] = [];
const erledigteIds: string[] = [];

vi.mock("@/lib/aktivitaetenStore", () => ({
  getInboxTasks: () => inboxTasks,
}));
vi.mock("@/lib/aufgabenStore", () => ({
  getMeineAufgaben: () => meineAufgaben,
}));
vi.mock("@/lib/followUpStore", () => ({
  getFollowUps: () => followUps,
}));
vi.mock("@/lib/kundenStore", () => ({
  getKontakte: () => kontakte,
}));
vi.mock("@/lib/bewerbungStore", () => ({
  getBewerber: () => [],
}));
vi.mock("@/lib/bewerberErinnerungen", () => ({
  bewerberErinnerungen: () => [],
}));
vi.mock("@/lib/kontaktOwnership", () => ({
  kontaktBelongsToUser: () => true,
}));
vi.mock("@/lib/inboxCountStore", async () => {
  const echt = await import("@/lib/faelligkeit");
  return {
    toDateString: echt.alsDatumsString,
    getTodayDateString: echt.heuteAlsString,
    getDoneInboxIds: () => erledigteIds,
  };
});

const { getFocusEligibleTasks, fokusLeerGrund } = await import("@/lib/focusQueueStore");

const HEUTE = "2026-09-14";
const GESTERN = "2026-09-13";
const MORGEN = "2026-09-15";

/** Eine geteilte Aufgabe, wie sie aus der Tabelle `aufgaben` kommt. */
const aufgabe = (over: Zeile = {}): Zeile => ({
  id: "a1",
  benutzerId: "u1",
  kontaktId: "k1",
  typ: "aufgabe",
  prioritaet: "mittel",
  status: "offen",
  titel: "Herrn Vogl zurückrufen",
  beschreibung: "",
  faelligAm: HEUTE,
  uhrzeit: undefined,
  ...over,
});

function leere(arr: unknown[]) { arr.length = 0; }

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${HEUTE}T09:00:00`));
  leere(inboxTasks);
  leere(meineAufgaben);
  leere(followUps);
  leere(kontakte);
  leere(erledigteIds);
  kontakte.push({ id: "k1", vorname: "Hermann", nachname: "Vogl" });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Fokus-Modus, geeignete Einträge", () => {
  it("nimmt die geteilten Aufgaben aus der Tabelle mit, das war die Lücke", () => {
    meineAufgaben.push(aufgabe(), aufgabe({ id: "a2", titel: "Unterlagen prüfen" }));

    const liste = getFocusEligibleTasks("Christian Peetz", "u1");

    expect(liste).toHaveLength(2);
    expect(liste[0].id).toBe("ag-a1");
    expect(liste[0].source).toBe("aufgabe");
    expect(liste[0].kundeName).toBe("Hermann Vogl");
  });

  it("nimmt den Typ Aufgabe mit, nicht nur Anruf, Meeting, Follow-Up und Deadline", () => {
    meineAufgaben.push(aufgabe({ typ: "aufgabe" }));
    expect(getFocusEligibleTasks("Christian Peetz", "u1")).toHaveLength(1);
  });

  it("lässt heute Fälliges mit fester Uhrzeit liegen, das steht im Kalender", () => {
    meineAufgaben.push(aufgabe({ uhrzeit: "14:30" }));
    expect(getFocusEligibleTasks("Christian Peetz", "u1")).toHaveLength(0);
  });

  it("nimmt Überfälliges auch mit fester Uhrzeit mit, der Termin ist ja verpasst", () => {
    meineAufgaben.push(aufgabe({ faelligAm: GESTERN, uhrzeit: "14:30" }));
    expect(getFocusEligibleTasks("Christian Peetz", "u1")).toHaveLength(1);
  });

  it("lässt liegen, was erst morgen fällig ist", () => {
    meineAufgaben.push(aufgabe({ faelligAm: MORGEN }));
    expect(getFocusEligibleTasks("Christian Peetz", "u1")).toHaveLength(0);
  });

  it("lässt eine Aufgabe ohne Kunde und ohne Bewerber liegen, sie hat kein Profil", () => {
    meineAufgaben.push(aufgabe({ kontaktId: undefined }));
    expect(getFocusEligibleTasks("Christian Peetz", "u1")).toHaveLength(0);
  });

  it("überspringt abgehakte Einträge, sonst zählt der Fokus mehr als die Liste zeigt", () => {
    meineAufgaben.push(aufgabe());
    erledigteIds.push("ag-a1");
    expect(getFocusEligibleTasks("Christian Peetz", "u1")).toHaveLength(0);
  });

  it("nimmt persönliche Inbox-Aufgaben und Follow-Ups weiterhin mit", () => {
    inboxTasks.push({
      id: "i1", titel: "Nachfassen", beschreibung: "", prioritaet: "mittel",
      typ: "anruf", faellig_am: HEUTE, uhrzeit: "—", kundeId: "k1", kundeName: "Hermann Vogl",
    });
    followUps.push({
      id: "f1", status: "offen", kundeId: "k1", kundeName: "Hermann Vogl",
      titel: "Angebot", beschreibung: "", faelligAm: GESTERN, prioritaet: "mittel",
    });

    const ids = getFocusEligibleTasks("Christian Peetz", "u1").map((t) => t.id);
    expect(ids).toContain("i1");
    expect(ids).toContain("fu-f1");
  });

  it("nimmt eine mir zugewiesene Bewerberaufgabe mit und führt in die Bewerberakte", () => {
    // Ob jemand diese Zeile überhaupt bekommt, entscheidet die
    // Zugriffskontrolle der Datenbank, nicht der Fokus-Modus. Die Inbox-Liste
    // zeigt sie ebenfalls, also muss der Fokus-Modus sie auch zählen.
    meineAufgaben.push(aufgabe({ kontaktId: undefined, bewerbungId: "b1" }));
    const [t] = getFocusEligibleTasks("Christian Peetz", "u1");
    expect(t.source).toBe("bewerber");
    expect(t.kundeId).toBe("b1");
  });
});

describe("Erklärung, wenn der Fokus-Modus nichts findet", () => {
  it("sagt es klar, wenn die Inbox leer ist", () => {
    expect(fokusLeerGrund([], HEUTE)).toContain("nichts Offenes");
  });

  it("nennt die Zahl der offenen Einträge und den Grund", () => {
    const text = fokusLeerGrund(
      [
        { faellig_am: MORGEN, uhrzeit: "—", kundeId: "k1" },
        { faellig_am: MORGEN, uhrzeit: "—", kundeId: "k1" },
        { faellig_am: HEUTE, uhrzeit: "14:00", kundeId: "k1" },
      ],
      HEUTE,
    );
    expect(text).toContain("3 offenen Einträgen");
    expect(text).toContain("2 sind erst später fällig");
    expect(text).toContain("feste Uhrzeit");
  });

  it("nennt auch Einträge ohne Datum", () => {
    const text = fokusLeerGrund([{ faellig_am: "", uhrzeit: "—", kundeId: "k1" }], HEUTE);
    expect(text).toContain("kein Fälligkeitsdatum");
  });
});
