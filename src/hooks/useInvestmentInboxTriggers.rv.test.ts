/**
 * Die Erinnerung "Reservierung ohne Unterschrift" im Hook selbst.
 *
 * Die Rechnerei steht in `rvUnterschriftMahnung.test.ts`. Hier geht es um die
 * Verdrahtung: dass aus dem Versandmerkmal wirklich eine Aufgabe in der Inbox
 * wird, dass die Sperrliste sie beim naechsten Lauf haelt, dass die letzte
 * Stufe die Vertriebsleitung erreicht und dass nach der Unterschrift Ruhe ist.
 * Genau diese Probe hat den beiden Vorgaengern gefehlt, sie haben nie
 * ausgeloest.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

const zustand = vi.hoisted(() => ({
  investments: [] as Array<Record<string, unknown>>,
  kontakte: [] as Array<Record<string, unknown>>,
  meta: {} as Record<string, Record<string, unknown>>,
  einstellungen: {} as Record<string, unknown>,
  inbox: [] as Array<{ titel: string; beschreibung: string; prioritaet: string; kundeId?: string }>,
}));

const glocke = vi.hoisted(() => ({ nutzer: vi.fn(), vertriebsleitung: vi.fn() }));

vi.mock("@/lib/kontaktStumm", () => ({ istKontaktStumm: () => false }));
vi.mock("@/lib/investmentsStore", () => ({
  getInvestments: () => zustand.investments,
  getRvSigned: (id: string) => zustand.meta[id]?.rvSigned === true,
}));
vi.mock("@/lib/aktivitaetenStore", () => ({
  addInboxTask: (t: { titel: string; beschreibung: string; prioritaet: string; kundeId?: string }) => { zustand.inbox.push(t); },
  getInboxTasks: () => zustand.inbox,
  setInboxTasks: (t: typeof zustand.inbox) => { zustand.inbox = t; },
}));
vi.mock("@/lib/kundenStore", () => ({ getKontakte: () => zustand.kontakte }));
vi.mock("@/lib/userSettingsCache", () => ({
  getUserSetting: (k: string, fallback: unknown) => (k in zustand.einstellungen ? structuredClone(zustand.einstellungen[k]) : fallback),
  setUserSetting: (k: string, v: unknown) => { zustand.einstellungen[k] = structuredClone(v); },
}));
vi.mock("@/lib/dbStoreHelper", () => ({ isTestAccount: () => false }));
vi.mock("@/lib/dataCache", () => ({
  cacheGet: (t: string) => (t === "investments" ? zustand.investments.map((i) => ({ id: i.id, meta: zustand.meta[i.id as string] })) : []),
  wennTabellenGeladen: (_t: string[], aktion: () => void) => { aktion(); return () => {}; },
}));
vi.mock("@/lib/bonitaetDocs", () => ({ pflichtBonitaetDocs: () => [] }));
vi.mock("@/lib/finanzierungStore", () => ({ getFinanzierungDocStatus: () => ({ uploaded: false }) }));
vi.mock("@/lib/kontaktOwnership", () => ({ kontaktBelongsToUser: () => true }));
vi.mock("@/lib/bellNotifications", () => ({
  notifyUser: glocke.nutzer,
  notifyVertriebsleitung: glocke.vertriebsleitung,
}));

import { useInvestmentInboxTriggers } from "./useInvestmentInboxTriggers";

/** Nach dem Stichtag `RV_ERINNERUNG_AB` (25.09.2026), die Kette laeuft. */
const VERSAND = new Date(2026, 9, 1, 10, 0);
const tag = (n: number, ab = VERSAND) => new Date(ab.getTime() + n * 86_400_000);

/** Ein Lauf des Hooks am Tag n nach `ab`, als Vertriebspartnerin. */
function laufAm(n: number, ab = VERSAND) {
  vi.setSystemTime(tag(n, ab));
  const { unmount } = renderHook(() => useInvestmentInboxTriggers("vertriebspartner", "Paula Partner", "vp-1"));
  unmount();
}

const rvAufgaben = () => zustand.inbox.filter((t) => /Reservierung/.test(t.titel));

beforeEach(() => {
  vi.useFakeTimers();
  zustand.investments = [{ id: "inv-1", kontaktId: "k-1", label: "Investment 1", pipelineStufe: "reservierung" }];
  zustand.kontakte = [{ id: "k-1", vorname: "Anna", nachname: "Berger", berater: "Paula Partner" }];
  zustand.meta = {
    "inv-1": { rvSignaturePending: true, rvSigned: false, rvSignatureSentAt: VERSAND.toISOString() },
  };
  zustand.einstellungen = {};
  zustand.inbox = [];
  glocke.nutzer.mockReset();
  glocke.vertriebsleitung.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Reservierung ohne Unterschrift im Inbox-Hook", () => {
  it("legt nach 2, 5 und 10 Tagen je genau eine Aufgabe an, auch bei vielen Laeufen", () => {
    for (const n of [0, 1, 2, 2, 3, 5, 5, 6, 10, 10, 12]) laufAm(n);
    expect(rvAufgaben().map((t) => t.prioritaet)).toEqual(["mittel", "dringend", "dringend"]);
    expect(rvAufgaben()[0].titel).toBe("Reservierung unterschreiben lassen: Anna Berger");
    expect(rvAufgaben()[2].titel).toBe("Eskalation Reservierung ohne Unterschrift: Anna Berger");
  });

  it("meldet die erste Stufe dem Partner und nur die letzte der Vertriebsleitung, jeweils einmal", () => {
    for (const n of [2, 5, 10, 11]) laufAm(n);
    expect(glocke.nutzer).toHaveBeenCalledTimes(1);
    expect(glocke.nutzer.mock.calls[0][0]).toBe("vp-1");
    expect(glocke.vertriebsleitung).toHaveBeenCalledTimes(1);
    const meldung = glocke.vertriebsleitung.mock.calls[0][0] as { titel: string; nachricht: string; link: string };
    expect(meldung.nachricht).toContain("Zuständig ist Paula Partner");
    expect(meldung.link).toBe("/kunden/k-1");
  });

  it("ersetzt die beiden alten Trigger, die nie ausgeloest haben", () => {
    laufAm(12);
    expect(zustand.inbox.some((t) => /RV-Gegenzeichnung Kunde|RV noch nicht unterschrieben/.test(t.titel))).toBe(false);
  });

  it("schweigt nach der Unterschrift", () => {
    laufAm(2);
    // So hinterlaesst finalize-reservierung das Investment.
    zustand.meta["inv-1"] = {
      ...zustand.meta["inv-1"],
      rvSigned: true,
      rvSignaturePending: false,
      rvPdf: "Reservierung (Anna Berger).pdf",
    };
    for (const n of [5, 10, 20]) laufAm(n);
    expect(rvAufgaben()).toHaveLength(1);
    expect(glocke.vertriebsleitung).not.toHaveBeenCalled();
  });

  it("laesst eine vor dem Stichtag versendete Vereinbarung ruhig: keine Stufe, keine Glocke", () => {
    const alt = new Date("2026-09-20T09:00:00.000Z");
    zustand.meta["inv-1"] = { rvSignaturePending: true, rvSigned: false, rvSignatureSentAt: alt.toISOString() };
    for (const n of [2, 5, 10, 30, 60]) laufAm(n, alt);
    expect(rvAufgaben()).toEqual([]);
    expect(glocke.nutzer).not.toHaveBeenCalled();
    expect(glocke.vertriebsleitung).not.toHaveBeenCalled();
    // Auch keine Sperre, die spaeter etwas nachholen koennte.
    expect(zustand.einstellungen["mi_investment_inbox_triggers_sent"]).toBeUndefined();
  });

  it("laesst Altvorgaenge ohne Versandzeitpunkt ebenso ruhig", () => {
    zustand.meta["inv-1"] = { rvSignaturePending: true, rvSigned: false };
    for (const n of [0, 2, 5, 10, 40]) laufAm(n);
    expect(rvAufgaben()).toEqual([]);
    expect(glocke.nutzer).not.toHaveBeenCalled();
    expect(glocke.vertriebsleitung).not.toHaveBeenCalled();
    expect(zustand.einstellungen["mi_investment_inbox_triggers_sent"]).toBeUndefined();
  });

  it("nimmt einen Versand genau zum Stichtag in die Kette auf", () => {
    const stichtag = new Date("2026-09-24T22:00:00.000Z");
    zustand.meta["inv-1"] = { rvSignaturePending: true, rvSigned: false, rvSignatureSentAt: stichtag.toISOString() };
    for (const n of [2, 5, 10]) laufAm(n, stichtag);
    expect(rvAufgaben()).toHaveLength(3);
    expect(glocke.vertriebsleitung).toHaveBeenCalledTimes(1);
  });
});
