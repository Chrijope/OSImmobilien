import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Die Schreibwege zu Besichtigung und Termin Bankgutachter (16.10.2026):
 * Termin als Meeting mit gekoppelter Aufgabe am Investment, Vorruecken nach
 * „stattgefunden" und die Aufgaben „… vereinbaren".
 */

const stand = vi.hoisted(() => ({
  investments: {} as Record<string, { id: string; pipelineStufe: string; label?: string }>,
  aufgaben: [] as Array<{ id: string; ausloeserSchluessel?: string; status: string }>,
  meetings: [] as Array<{ id: string; aktivitaet: Record<string, unknown>; aufgabe: Record<string, unknown> }>,
  prozessAufgaben: [] as Array<Record<string, unknown>>,
  erledigt: [] as string[],
  updates: [] as Array<{ id: string; stufe: string }>,
  geladen: true,
}));

vi.mock("./meetingSpeichern", () => ({
  speichereMeeting: async (id: string, aktivitaet: Record<string, unknown>, aufgabe: Record<string, unknown>) => {
    stand.meetings.push({ id, aktivitaet, aufgabe });
    return "";
  },
}));
vi.mock("./dataCache", () => ({ isTableLoaded: () => stand.geladen }));
vi.mock("./aufgabenStore", () => ({
  getAufgaben: () => stand.aufgaben,
  erledigeAufgabe: async (id: string) => { stand.erledigt.push(id); },
}));
vi.mock("./investmentsStore", () => ({
  getInvestmentById: (id: string) => stand.investments[id],
  updateInvestment: async (id: string, f: { pipelineStufe: string }) => {
    stand.updates.push({ id, stufe: f.pipelineStufe });
    stand.investments[id].pipelineStufe = f.pipelineStufe;
    return true;
  },
}));
vi.mock("./prozessAufgabe", () => ({
  addProzessAufgabe: async (task: Record<string, unknown>) => { stand.prozessAufgaben.push(task); return true; },
}));

const { rueckeNachStufenTermin, speichereStufenTermin, stelleBesichtigungsAufgabeSicher } = await import("./stufenTerminAktionen");

const CTX = { kundeId: "k-1", kundeName: "Erika Muster" };

beforeEach(() => {
  stand.investments = { "inv-1": { id: "inv-1", pipelineStufe: "besichtigung", label: "Investment 1" } };
  stand.aufgaben = [];
  stand.meetings = [];
  stand.prozessAufgaben = [];
  stand.erledigt = [];
  stand.updates = [];
  stand.geladen = true;
});

describe("Termin speichern", () => {
  it("legt ein Meeting mit Aufgabe am Investment an und hakt „Besichtigung vereinbaren“ ab", async () => {
    stand.aufgaben = [
      { id: "a-1", ausloeserSchluessel: "besichtigung_vereinbaren:inv-1", status: "offen" },
      { id: "a-2", ausloeserSchluessel: "besichtigung_vereinbaren:inv-2", status: "offen" },
    ];
    await speichereStufenTermin("besichtigung", { datum: "2026-10-20", uhrzeit: "14:30", ort: "Hauptstr. 1" }, {
      ...CTX, investmentId: "inv-1", investmentLabel: "Investment 1", userName: "Partner",
    });
    expect(stand.meetings).toHaveLength(1);
    const { aktivitaet, aufgabe } = stand.meetings[0];
    expect(aktivitaet).toMatchObject({ art: "meeting", beschreibung: "Besichtigung", faelligAm: "2026-10-20", uhrzeit: "14:30", kundeId: "k-1" });
    expect(String(aktivitaet.details)).toContain("Treffpunkt: Hauptstr. 1");
    expect(aufgabe).toMatchObject({ kontaktId: "k-1", investmentId: "inv-1", typ: "meeting", titel: "Besichtigung" });
    // Nur die Aufgabe dieses Investments.
    expect(stand.erledigt).toEqual(["a-1"]);
  });
});

describe("Nach „stattgefunden“", () => {
  it("rueckt die Besichtigung auf den Bankgutachter vor und legt die Aufgabe dazu an", async () => {
    expect(await rueckeNachStufenTermin("Besichtigung", "inv-1", CTX)).toBe("bankgutachter");
    expect(stand.updates).toEqual([{ id: "inv-1", stufe: "bankgutachter" }]);
    expect(stand.prozessAufgaben).toHaveLength(1);
    expect(stand.prozessAufgaben[0]).toMatchObject({
      titel: "Termin Bankgutachter vereinbaren",
      ausloeserSchluessel: "bankgutachter_vereinbaren:inv-1",
      investmentId: "inv-1",
    });
  });

  it("rueckt den Bankgutachter auf Finanzierung vor, ohne neue Aufgabe", async () => {
    stand.investments["inv-1"].pipelineStufe = "bankgutachter";
    expect(await rueckeNachStufenTermin("Termin Bankgutachter", "inv-1", CTX)).toBe("finanzierung");
    expect(stand.prozessAufgaben).toHaveLength(0);
  });

  it("laesst einen weiter fortgeschrittenen Vorgang und fremde Termine stehen", async () => {
    stand.investments["inv-1"].pipelineStufe = "notar";
    expect(await rueckeNachStufenTermin("Besichtigung", "inv-1", CTX)).toBeNull();
    expect(await rueckeNachStufenTermin("Objektvorstellung", "inv-1", CTX)).toBeNull();
    expect(await rueckeNachStufenTermin("Besichtigung", undefined, CTX)).toBeNull();
    expect(stand.updates).toEqual([]);
  });
});

describe("„Besichtigung vereinbaren“ nach der Reservierung", () => {
  it("entsteht je Investment einmal, auch nach dem Abhaken nicht wieder", async () => {
    const ctx = { ...CTX, investmentId: "inv-1" };
    expect(await stelleBesichtigungsAufgabeSicher(ctx)).toBe(true);
    expect(stand.prozessAufgaben[0]).toMatchObject({ titel: "Besichtigung vereinbaren", ausloeserSchluessel: "besichtigung_vereinbaren:inv-1" });

    stand.aufgaben = [{ id: "a-1", ausloeserSchluessel: "besichtigung_vereinbaren:inv-1", status: "erledigt" }];
    expect(await stelleBesichtigungsAufgabeSicher(ctx)).toBe(false);
    expect(stand.prozessAufgaben).toHaveLength(1);
  });

  it("legt nichts an, solange die Aufgaben nicht geladen sind", async () => {
    stand.geladen = false;
    expect(await stelleBesichtigungsAufgabeSicher({ ...CTX, investmentId: "inv-1" })).toBe(false);
    expect(stand.prozessAufgaben).toHaveLength(0);
  });
});
