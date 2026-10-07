import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Der Nachtrag traegt Termine in einen echten Kalender ein. Ein Fehler hier
 * schickt einen Termin doppelt oder gar nicht. Deshalb wird die Auswahl
 * getrennt von der Uebertragung geprueft.
 */

const welt = vi.hoisted(() => ({
  kalender: "google" as "google" | "apple" | null,
  schalter: true,
  angelegt: [] as Array<{ titel: string; start: string; dauerMinuten?: number }>,
  antwort: { typ: "google" as const, eventId: "ev-neu" } as { typ: "google"; eventId: string } | null,
  aktualisierungen: [] as Array<{ id: string; felder: Record<string, unknown> }>,
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/userSettingsCache", () => ({ getUserSetting: (_s: string, standard: unknown) => standard }));
vi.mock("@/lib/currentUser", () => ({ getCurrentUserId: () => null }));

vi.mock("@/lib/dataCache", () => ({
  cacheGet: () => [],
  cacheFilter: () => [],
  cacheUpdate: async (_tabelle: string, id: string, felder: Record<string, unknown>) => {
    welt.aktualisierungen.push({ id, felder });
    return true;
  },
}));

// Die Umrechnungen bleiben echt, nur Netz und Schalter werden ersetzt.
vi.mock("@/lib/kalenderSync", async () => {
  const echt = await vi.importActual<typeof import("@/lib/kalenderSync")>("@/lib/kalenderSync");
  return {
    ...echt,
    verbundenerKalender: () => welt.kalender,
    terminAbgleichAktiv: () => welt.schalter,
    legeTerminAn: async (daten: { titel: string; start: string; dauerMinuten?: number }) => {
      welt.angelegt.push(daten);
      return welt.antwort;
    },
  };
});

import { waehleNachzutragende, trageOffeneTermineNach, merkeUebertragung } from "@/lib/kalenderNachtrag";
import type { KalenderAktivitaet } from "@/lib/kalenderTermine";

const ICH = "user-ich";
const KOLLEGE = "user-kollege";
const JETZT = new Date("2026-08-10T12:00:00").getTime();

function meeting(felder: Partial<KalenderAktivitaet> = {}): KalenderAktivitaet {
  return {
    id: "akt-1",
    kundeId: "kunde-1",
    art: "meeting",
    beschreibung: "Erstgespräch",
    faelligAm: "2026-08-14",
    uhrzeit: "14:00",
    benutzerId: ICH,
    ...felder,
  };
}

const BASIS = { benutzerId: ICH, erlaubteKundeIds: new Set(["kunde-1"]), jetzt: JETZT };

describe("waehleNachzutragende", () => {
  it("nimmt einen eigenen Termin der Zukunft ohne Verknuepfung", () => {
    const kandidaten = waehleNachzutragende({ aktivitaeten: [meeting()], ...BASIS });
    expect(kandidaten).toHaveLength(1);
    expect(kandidaten[0].id).toBe("akt-1");
    expect(kandidaten[0].titel).toBe("Erstgespräch");
  });

  it("laesst einen bereits verknuepften Termin liegen", () => {
    // Sonst entstuende bei jedem Oeffnen des Kalenders ein zweiter Eintrag.
    const kandidaten = waehleNachzutragende({
      aktivitaeten: [meeting({ kalenderEventId: "ev-1" })],
      ...BASIS,
    });
    expect(kandidaten).toHaveLength(0);
  });

  it("traegt nichts Vergangenes nach", () => {
    const kandidaten = waehleNachzutragende({
      aktivitaeten: [meeting({ faelligAm: "2026-08-01" })],
      ...BASIS,
    });
    expect(kandidaten).toHaveLength(0);
  });

  it("fasst den Termin eines Kollegen nicht an", () => {
    // Auch dann nicht, wenn der Kontakt mir gehoert. In meinen Kalender
    // gehoert nur, was meine eigene Zeit belegt.
    const kandidaten = waehleNachzutragende({
      aktivitaeten: [meeting({ benutzerId: KOLLEGE })],
      ...BASIS,
    });
    expect(kandidaten).toHaveLength(0);
  });

  it("beachtet nur Meetings", () => {
    expect(waehleNachzutragende({ aktivitaeten: [meeting({ art: "aufgabe" })], ...BASIS })).toHaveLength(0);
  });

  it("ueberspringt, was in dieser Sitzung schon versucht wurde", () => {
    const kandidaten = waehleNachzutragende({
      aktivitaeten: [meeting()],
      ...BASIS,
      bereitsVersucht: new Set(["akt-1"]),
    });
    expect(kandidaten).toHaveLength(0);
  });

  it("nimmt die naechsten Termine zuerst und begrenzt die Menge", () => {
    const viele = Array.from({ length: 5 }, (_, i) =>
      meeting({ id: `akt-${i}`, faelligAm: `2026-08-${String(20 - i).padStart(2, "0")}` }),
    );
    const kandidaten = waehleNachzutragende({ aktivitaeten: viele, ...BASIS, hoechstens: 2 });
    expect(kandidaten.map((k) => k.id)).toEqual(["akt-4", "akt-3"]);
  });

  it("setzt einen Termin ohne Uhrzeit auf neun Uhr", () => {
    const kandidaten = waehleNachzutragende({
      aktivitaeten: [meeting({ uhrzeit: undefined })],
      ...BASIS,
    });
    expect(new Date(kandidaten[0].start).getHours()).toBe(9);
  });

  it("rechnet die Dauer aus dem Freitextfeld", () => {
    expect(waehleNachzutragende({ aktivitaeten: [meeting({ dauer: "90" })], ...BASIS })[0].dauerMinuten).toBe(90);
    expect(waehleNachzutragende({ aktivitaeten: [meeting({ dauer: undefined })], ...BASIS })[0].dauerMinuten).toBe(60);
  });

  it("nimmt Details und Zugangslink in die Beschreibung", () => {
    const kandidaten = waehleNachzutragende({
      aktivitaeten: [meeting({ details: "Vom Kunden gebucht.", zoomLink: "/raum/abc" })],
      ...BASIS,
    });
    expect(kandidaten[0].beschreibung).toBe("Vom Kunden gebucht.\n\n/raum/abc");
  });
});

describe("trageOffeneTermineNach", () => {
  beforeEach(() => {
    welt.kalender = "google";
    welt.schalter = true;
    welt.angelegt = [];
    welt.antwort = { typ: "google", eventId: "ev-neu" };
    welt.aktualisierungen = [];
  });

  it("traegt nichts ein, solange kein Kalender verbunden ist", async () => {
    welt.kalender = null;
    const anzahl = await trageOffeneTermineNach({
      aktivitaeten: [meeting({ id: "ohne-kalender" })],
      ...BASIS,
    });
    expect(anzahl).toBe(0);
    expect(welt.angelegt).toHaveLength(0);
  });

  it("traegt nichts ein, solange der Schalter aus ist", async () => {
    welt.schalter = false;
    const anzahl = await trageOffeneTermineNach({
      aktivitaeten: [meeting({ id: "schalter-aus" })],
      ...BASIS,
    });
    expect(anzahl).toBe(0);
    expect(welt.angelegt).toHaveLength(0);
  });

  it("traegt einen offenen Termin ein und schreibt die Kennung zurueck", async () => {
    const anzahl = await trageOffeneTermineNach({
      aktivitaeten: [meeting({ id: "frisch-1" })],
      ...BASIS,
    });
    expect(anzahl).toBe(1);
    expect(welt.angelegt).toHaveLength(1);
    expect(welt.aktualisierungen).toEqual([
      { id: "frisch-1", felder: { kalender_typ: "google", kalender_event_id: "ev-neu" } },
    ]);
  });

  it("schickt denselben Termin kein zweites Mal", async () => {
    await trageOffeneTermineNach({ aktivitaeten: [meeting({ id: "frisch-2" })], ...BASIS });
    welt.angelegt = [];
    // Der Zwischenspeicher meldet die Kennung vielleicht noch nicht zurueck.
    // Trotzdem darf beim zweiten Durchgang nichts entstehen.
    await trageOffeneTermineNach({ aktivitaeten: [meeting({ id: "frisch-2" })], ...BASIS });
    expect(welt.angelegt).toHaveLength(0);
  });

  it("laesst aus, was der Anlegeweg schon uebertraegt", async () => {
    merkeUebertragung("frisch-3");
    const anzahl = await trageOffeneTermineNach({
      aktivitaeten: [meeting({ id: "frisch-3" })],
      ...BASIS,
    });
    expect(anzahl).toBe(0);
    expect(welt.angelegt).toHaveLength(0);
  });

  it("schreibt nichts zurueck, wenn der Kalenderdienst nichts liefert", async () => {
    welt.antwort = null;
    const anzahl = await trageOffeneTermineNach({
      aktivitaeten: [meeting({ id: "frisch-4" })],
      ...BASIS,
    });
    expect(anzahl).toBe(0);
    expect(welt.aktualisierungen).toHaveLength(0);
  });
});
