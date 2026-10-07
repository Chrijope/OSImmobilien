/**
 * Ein Haken schliesst den Vorgang ueberall.
 *
 * Christian am 16.09.2026, am Beispiel Otto Hans, Investment 4: Eine Aufgabe
 * fuer heute 15:25 Uhr stand zugleich im Kasten "Offene Aufgaben" und in der
 * Kachel "Naechste Aktion". Der Haken in der Aktionsliste liess sie nur aus
 * dem Kasten verschwinden, in der Aktionsliste stand sie weiter, und erst ein
 * zweiter Haken schloss auch diese Anzeige.
 *
 * Der Grund: Eine Aufgabe aus der Schnellaktion existiert zweimal, als Zeile
 * in `aufgaben` und als Kopie in `aktivitaeten`. Wurde nur die Aufgabe
 * geschlossen, fand die Zusammenfuehrung in `kundenNaechsteAktion` die beiden
 * nicht mehr zusammen und zeigte die uebrig gebliebene Kopie als eigenen
 * Eintrag `aktivitaet:<id>`.
 *
 * Dieser Test faehrt genau diesen Ablauf nach, ueber alle drei Wege, auf
 * denen im Kundenprofil abgehakt wird.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

/** Zwei Tabellen im Arbeitsspeicher, nach Tabellenname getrennt. */
const state = vi.hoisted(() => ({
  tabellen: {} as Record<string, Record<string, unknown>[]>,
}));

vi.mock("@/lib/dataCache", () => ({
  isTableLoaded: () => true,
  cacheGet: (tabelle: string) => state.tabellen[tabelle] || [],
  cacheFilter: (tabelle: string, pruefe: (r: Record<string, unknown>) => boolean) =>
    (state.tabellen[tabelle] || []).filter(pruefe),
  cacheUpdate: async (tabelle: string, id: string, patch: Record<string, unknown>) => {
    const zeile = (state.tabellen[tabelle] || []).find((r) => r.id === id);
    if (zeile) Object.assign(zeile, patch);
  },
  cacheInsert: async () => {},
  cacheDelete: async () => true,
}));

// Kein Testkonto: Die Aktivitaeten liegen in der Tabelle, nicht im Browser.
vi.mock("@/lib/dbStoreHelper", () => ({
  isTestAccount: () => false,
  localGet: <T,>(_k: string, fallback: T) => fallback,
  localSet: () => {},
}));

vi.mock("@/lib/userSettingsCache", () => ({
  getUserSetting: <T,>(_k: string, fallback: T) => fallback,
  setUserSetting: () => {},
}));

vi.mock("@/lib/currentUser", () => ({ getCurrentUserId: () => "u1" }));
vi.mock("@/lib/loadAllUsers", () => ({ loadAllUsers: () => [] }));
vi.mock("sonner", () => ({ toast: { error: () => {}, success: () => {} } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } },
}));

import { erledigeAufgabe, getAufgabenFuerKunde, oeffneAufgabe } from "@/lib/aufgabenStore";
import { getAktivitaeten } from "@/lib/aktivitaetenStore";
import { baueKundenAufgabenListe } from "@/lib/kundenAufgabenListe";
import { baueGeplanteAktionen } from "@/lib/kundenNaechsteAktion";
import { sammelbareAufgaben } from "@/lib/aktionAbschluss";

/** Mittwoch, 16. September 2026, 16 Uhr. Die Aufgabe von 15:25 ist dann faellig. */
const JETZT = new Date(2026, 8, 16, 16, 0);
const TITEL = "Unterlagen nachfassen";

/** Was die Schnellaktion schreibt: die Aufgabe und ihre Kopie im Verlauf. */
function legeAufgabeAn(id: string, titel = TITEL) {
  state.tabellen.aufgaben.push({
    id,
    benutzer_id: "u1",
    kontakt_id: "k1",
    investment_id: "inv4",
    typ: "aufgabe",
    prioritaet: "mittel",
    status: "offen",
    titel,
    faellig_am: "2026-09-16T15:25:00",
    uhrzeit: "15:25",
    erledigt_am: null,
  });
  state.tabellen.aktivitaeten.push({
    id: `v-${id}`,
    kunde_id: "k1",
    art: "aufgabe",
    beschreibung: titel,
    von: "Berater",
    datum: "2026-09-16T09:00:00",
    faellig_am: "2026-09-16",
    uhrzeit: "15:25",
    erledigt_am: null,
  });
}

/** Der Kasten "Offene Aufgaben". */
function kastenTitel(): string[] {
  return baueKundenAufgabenListe(getAufgabenFuerKunde("k1"), [], JETZT).map((e) => e.titel);
}

/** Die Kachel "Naechste Aktion" samt aufgeklappter Liste. */
function aktionsSchluessel(): string[] {
  return baueGeplanteAktionen(
    { aufgaben: getAufgabenFuerKunde("k1"), aktivitaeten: getAktivitaeten("k1") },
    JETZT,
  ).map((a) => a.schluessel);
}

beforeEach(() => {
  state.tabellen = { aufgaben: [], aktivitaeten: [] };
});

describe("Ein Haken schliesst den Vorgang in beiden Anzeigen", () => {
  it("zeigt eine neue Aufgabe zuerst in beiden Anzeigen, als ein einziger Eintrag", () => {
    legeAufgabeAn("a1");
    expect(kastenTitel()).toEqual([TITEL]);
    // Ein Eintrag, nicht zwei: Aufgabe und Verlaufskopie sind zusammengefuehrt.
    expect(aktionsSchluessel()).toEqual(["aufgabe:a1"]);
  });

  it("Haken in der Aktionsliste: danach ist die Aufgabe aus beiden Listen weg", async () => {
    legeAufgabeAn("a1");
    // Genau das, was der Haken der Aktionsliste beim Schluessel "aufgabe:<id>" tut.
    await erledigeAufgabe("a1");
    expect(kastenTitel()).toEqual([]);
    // Vorher stand hier "aktivitaet:v-a1", und es brauchte einen zweiten Haken.
    expect(aktionsSchluessel()).toEqual([]);
  });

  it("Gegenrichtung, Haken im Kasten Offene Aufgaben: auch die Aktionsliste ist leer", async () => {
    legeAufgabeAn("a1");
    const eintrag = baueKundenAufgabenListe(getAufgabenFuerKunde("k1"), [], JETZT)[0];
    expect(eintrag.quelle).toBe("aufgabe");
    // Der Kasten hakt ueber dieselbe Funktion ab, mit der Kennung der Zeile.
    await erledigeAufgabe(eintrag.id);
    expect(aktionsSchluessel()).toEqual([]);
    expect(kastenTitel()).toEqual([]);
  });

  it("Sammelweg: alle ueberfaelligen Aufgaben verschwinden aus beiden Listen", async () => {
    legeAufgabeAn("a1", "Erste Aufgabe");
    legeAufgabeAn("a2", "Zweite Aufgabe");
    const betroffen = sammelbareAufgaben(
      baueGeplanteAktionen(
        { aufgaben: getAufgabenFuerKunde("k1"), aktivitaeten: getAktivitaeten("k1") },
        JETZT,
      ),
    );
    expect(betroffen.map((a) => a.schluessel).sort()).toEqual(["aufgabe:a1", "aufgabe:a2"]);
    for (const aktion of betroffen) {
      await erledigeAufgabe(aktion.schluessel.slice("aufgabe:".length));
    }
    expect(kastenTitel()).toEqual([]);
    expect(aktionsSchluessel()).toEqual([]);
  });

  it("Rueckgaengig holt den Vorgang in beiden Listen zurueck, wieder als ein Eintrag", async () => {
    legeAufgabeAn("a1");
    await erledigeAufgabe("a1");
    await oeffneAufgabe("a1");
    expect(kastenTitel()).toEqual([TITEL]);
    expect(aktionsSchluessel()).toEqual(["aufgabe:a1"]);
  });

  it("schreibt beim Abhaken keinen zweiten Verlaufseintrag, sondern schliesst den vorhandenen", async () => {
    legeAufgabeAn("a1");
    await erledigeAufgabe("a1");
    const eintraege = getAktivitaeten("k1");
    expect(eintraege).toHaveLength(1);
    expect(eintraege[0].erledigtAm).toBeTruthy();
  });

  it("laesst eine Aufgabe ohne Verlaufskopie unveraendert durchgehen", async () => {
    state.tabellen.aufgaben.push({
      id: "a9",
      benutzer_id: "u1",
      kontakt_id: "k1",
      typ: "aufgabe",
      prioritaet: "mittel",
      status: "offen",
      titel: "Nur Aufgabe",
      faellig_am: "2026-09-16T15:25:00",
      uhrzeit: "15:25",
      erledigt_am: null,
    });
    await erledigeAufgabe("a9");
    expect(kastenTitel()).toEqual([]);
    expect(aktionsSchluessel()).toEqual([]);
  });
});
