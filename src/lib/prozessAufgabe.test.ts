/**
 * Empfängerregel der automatischen Aufgaben und der Nachfass-Anruf nach dem
 * Erstgespräch (15.10.2026).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const zustand = vi.hoisted(() => ({
  tabellen: {} as Record<string, Array<Record<string, unknown>>>,
  aufgabenGeladen: true,
  angelegt: [] as Array<Record<string, unknown>>,
  anlegenKlappt: true,
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getUser: async () => ({ data: { user: null } }) } } }));
vi.mock("./dataCache", async (original) => ({
  ...(await original<typeof import("./dataCache")>()),
  cacheGet: (t: string) => zustand.tabellen[t] || [],
  isTableLoaded: (t: string) => (t === "aufgaben" ? zustand.aufgabenGeladen : true),
  ladeTabellen: async () => {},
  cacheLadeZeilenFuer: async () => true,
}));
vi.mock("./aktivitaetenStore", () => ({
  addGeteilteAufgabe: async (task: Record<string, unknown>) => {
    if (!zustand.anlegenKlappt) return false;
    zustand.angelegt.push(task);
    zustand.tabellen.aufgaben = [...(zustand.tabellen.aufgaben || []), {
      id: `a${zustand.angelegt.length}`, kontakt_id: task.kundeId, zugewiesen_an: task.zugewiesenAn,
      ausloeser_schluessel: task.ausloeserSchluessel, status: "offen", titel: task.titel,
    }];
    return true;
  },
}));
vi.mock("./aufgabenStore", () => ({
  getAufgaben: () => (zustand.tabellen.aufgaben || []).map((r) => ({
    id: r.id, kontaktId: r.kontakt_id, zugewiesenAn: r.zugewiesen_an,
    ausloeserSchluessel: r.ausloeser_schluessel, status: r.status, titel: r.titel,
  })),
}));

import { addProzessAufgabe, aufgabenEmpfaenger } from "./prozessAufgabe";
import {
  istErstgespraech, legeNachfassNachErstgespraechAn, NACHFASS_TITEL, nachfassSchluessel, nachfassTag,
} from "./nachfassNachErstgespraech";

const ROLLEN = [
  { user_id: "u-admin", role: "admin" },
  { user_id: "u-admin", role: "inhaber" },
  { user_id: "u-vl", role: "vertriebsleiter" },
  { user_id: "u-bo", role: "backoffice" },
  { user_id: "u-vp", role: "vertriebspartner" },
];

beforeEach(() => {
  zustand.tabellen = { user_roles: ROLLEN, aufgaben: [], kontakte: [] };
  zustand.aufgabenGeladen = true;
  zustand.angelegt = [];
  zustand.anlegenKlappt = true;
});

describe("aufgabenEmpfaenger", () => {
  it("nimmt den aktuell Zuständigen aus dem Speicher, nicht die mitgegebene Kennung", () => {
    zustand.tabellen.kontakte = [{ id: "k1", zustaendig_id: "u-neu" }];
    expect(aufgabenEmpfaenger("k1", "u-alt")).toEqual(["u-neu"]);
  });

  it("nimmt die mitgegebene Kennung nur, wenn der Kontakt nicht im Speicher steht", () => {
    expect(aufgabenEmpfaenger("k-fehlt", "u-alt")).toEqual(["u-alt"]);
  });

  it("ohne Zuständigen jede Person der Leitung genau einmal, nie Backoffice oder Partner", () => {
    zustand.tabellen.kontakte = [{ id: "k1", zustaendig_id: null }];
    expect(aufgabenEmpfaenger("k1").sort()).toEqual(["u-admin", "u-vl"]);
  });

  it("ohne Zuständigen und ohne geladene Rollen leer", () => {
    zustand.tabellen.kontakte = [{ id: "k1", zustaendig_id: null }];
    zustand.tabellen.user_roles = [];
    expect(aufgabenEmpfaenger("k1")).toEqual([]);
  });
});

describe("addProzessAufgabe", () => {
  const aufgabe = {
    titel: "Bonität freigegeben: Finanzierung starten", beschreibung: "", prioritaet: "hoch" as const, typ: "aufgabe" as const,
    faellig_am: "2026-10-15", uhrzeit: "09:00", kundeId: "k1", kundeName: "Kunde", ausloeserSchluessel: "bonitaet_freigabe:i1",
  };

  it("legt für jede Person der Leitung eine eigene an und überspringt, wer schon eine offene hat", async () => {
    zustand.tabellen.kontakte = [{ id: "k1", zustaendig_id: null }];
    zustand.tabellen.aufgaben = [{ id: "x", kontakt_id: "k1", zugewiesen_an: "u-vl", ausloeser_schluessel: "bonitaet_freigabe:i1", status: "offen" }];
    expect(await addProzessAufgabe(aufgabe)).toBe(true);
    expect(zustand.angelegt.map((t) => t.zugewiesenAn)).toEqual(["u-admin"]);
  });

  it("bleibt ohne jeden Empfänger beim Anlegenden", async () => {
    zustand.tabellen.kontakte = [{ id: "k1", zustaendig_id: null }];
    zustand.tabellen.user_roles = [];
    expect(await addProzessAufgabe(aufgabe)).toBe(true);
    expect(zustand.angelegt).toHaveLength(1);
    expect(zustand.angelegt[0].zugewiesenAn).toBeUndefined();
  });
});

describe("Nachfass-Anruf nach dem Erstgespräch", () => {
  it("ist drei Tage nach dem Gesprächstag fällig, auch über den Monatswechsel", () => {
    expect(nachfassTag("2026-10-15")).toBe("2026-10-18");
    expect(nachfassTag("2026-10-30")).toBe("2026-11-02");
    expect(nachfassTag("2026-12-30")).toBe("2027-01-02");
  });

  it("erkennt das Erstgespräch am Anlass, sonst am Titel", () => {
    expect(istErstgespraech("Termin", "erstgespraech")).toBe(true);
    expect(istErstgespraech("Erstgespräch", "beratung")).toBe(false);
    expect(istErstgespraech("Telefonisches Erstgespräch")).toBe(true);
    expect(istErstgespraech("Beratungsgespräch")).toBe(false);
  });

  it("legt ihn einmal je Empfänger und Gesprächstag an, beim zweiten Mal vorhanden", async () => {
    zustand.tabellen.kontakte = [{ id: "k1", zustaendig_id: "u-vp" }];
    const anlass = { kontaktId: "k1", kundeName: "Kunde", gespraech: "2026-10-15" };
    expect(await legeNachfassNachErstgespraechAn(anlass)).toBe("angelegt");
    expect(zustand.angelegt[0]).toMatchObject({
      titel: NACHFASS_TITEL, typ: "anruf", prioritaet: "hoch", faellig_am: "2026-10-18", uhrzeit: "09:00",
      zugewiesenAn: "u-vp", ausloeserSchluessel: nachfassSchluessel("k1", "2026-10-15"),
    });
    expect(await legeNachfassNachErstgespraechAn(anlass)).toBe("vorhanden");
    expect(zustand.angelegt).toHaveLength(1);
  });

  it("eine erledigte zählt als vorhanden, eine abgesagte nicht", async () => {
    zustand.tabellen.kontakte = [{ id: "k1", zustaendig_id: "u-vp" }];
    const schluessel = nachfassSchluessel("k1", "2026-10-15");
    zustand.tabellen.aufgaben = [{ id: "e", kontakt_id: "k1", zugewiesen_an: "u-vp", ausloeser_schluessel: schluessel, status: "erledigt" }];
    expect(await legeNachfassNachErstgespraechAn({ kontaktId: "k1", kundeName: "Kunde", gespraech: "2026-10-15" })).toBe("vorhanden");
    zustand.tabellen.aufgaben = [{ id: "e", kontakt_id: "k1", zugewiesen_an: "u-vp", ausloeser_schluessel: schluessel, status: "abgesagt" }];
    expect(await legeNachfassNachErstgespraechAn({ kontaktId: "k1", kundeName: "Kunde", gespraech: "2026-10-15" })).toBe("angelegt");
  });

  it("meldet fehler ohne geladene Aufgaben, ohne Empfänger oder wenn das Speichern scheitert", async () => {
    const anlass = { kontaktId: "k1", kundeName: "Kunde", gespraech: "2026-10-15" };
    zustand.tabellen.kontakte = [{ id: "k1", zustaendig_id: "u-vp" }];
    zustand.aufgabenGeladen = false;
    expect(await legeNachfassNachErstgespraechAn(anlass)).toBe("fehler");
    zustand.aufgabenGeladen = true;
    zustand.anlegenKlappt = false;
    expect(await legeNachfassNachErstgespraechAn(anlass)).toBe("fehler");
    zustand.anlegenKlappt = true;
    zustand.tabellen.kontakte = [{ id: "k1", zustaendig_id: null }];
    zustand.tabellen.user_roles = [];
    expect(await legeNachfassNachErstgespraechAn(anlass)).toBe("fehler");
  });
});
