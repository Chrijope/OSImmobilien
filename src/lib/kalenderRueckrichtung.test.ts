import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Die Gegenrichtung fasst echte Kundentermine an. Ein Fehler hier verschiebt
 * einen Termin, den niemand verschoben hat, oder er uebersieht eine
 * Verschiebung, und der Berater sitzt zur falschen Zeit im Warteraum.
 */

const welt = vi.hoisted(() => ({
  schalter: null as unknown,
  zeilen: [] as Array<Record<string, unknown>>,
  aktualisierungen: [] as Array<{ id: string; felder: Record<string, unknown> }>,
}));

vi.mock("@/lib/userSettingsCache", () => ({
  getUserSetting: (schluessel: string, standard: unknown) =>
    schluessel === "kalender" && welt.schalter !== null ? welt.schalter : standard,
}));

vi.mock("@/lib/dataCache", () => ({
  cacheFilter: (_tabelle: string, pruefe: (r: Record<string, unknown>) => boolean) =>
    welt.zeilen.filter(pruefe),
  cacheUpdate: async (_tabelle: string, id: string, felder: Record<string, unknown>) => {
    welt.aktualisierungen.push({ id, felder });
    return true;
  },
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { fremdZeitZuIso, rueckrichtungAktiv, gleicheKalenderAb } from "@/lib/kalenderRueckrichtung";

const ZEITRAUM = { vonISO: "2026-08-01T00:00:00.000Z", bisISO: "2026-09-30T00:00:00.000Z" };

function crmTermin(felder: Partial<Record<string, unknown>> = {}) {
  return {
    id: "akt-1",
    art: "meeting",
    beschreibung: "Beratung Familie Brandl",
    faellig_am: "2026-08-14",
    uhrzeit: "14:00",
    kalender_event_id: "ev-1",
    ...felder,
  };
}

describe("fremdZeitZuIso", () => {
  it("schreibt CalDAV-Zeitstempel nach ISO um", () => {
    // Ohne diese Umschrift stand im Kalender bei jedem Apple-Termin
    // "Invalid Date".
    expect(fremdZeitZuIso("20260803T140000Z")).toBe("2026-08-03T14:00:00Z");
    expect(fremdZeitZuIso("20260803T140000")).toBe("2026-08-03T14:00:00");
    expect(new Date(fremdZeitZuIso("20260803T140000Z")).getTime()).not.toBeNaN();
  });

  it("verträgt ganztägige Einträge", () => {
    expect(fremdZeitZuIso("20260803")).toBe("2026-08-03");
  });

  it("lässt ISO unangetastet", () => {
    expect(fremdZeitZuIso("2026-08-03T14:00:00Z")).toBe("2026-08-03T14:00:00Z");
  });

  it("verträgt Leeres und Unbekanntes", () => {
    expect(fremdZeitZuIso(null)).toBe("");
    expect(fremdZeitZuIso("")).toBe("");
    expect(fremdZeitZuIso("morgen")).toBe("morgen");
  });
});

describe("gleicheKalenderAb", () => {
  beforeEach(() => {
    welt.schalter = { syncOptionen: { rueckrichtung: true } };
    welt.zeilen = [];
    welt.aktualisierungen = [];
  });

  it("rührt nichts an, solange der Schalter aus ist", async () => {
    welt.schalter = { syncOptionen: { rueckrichtung: false } };
    welt.zeilen = [crmTermin()];
    const ergebnis = await gleicheKalenderAb([{ id: "ev-1", start: "2026-08-15T10:00:00" }], ZEITRAUM);
    expect(ergebnis.verschoben).toHaveLength(0);
    expect(welt.aktualisierungen).toHaveLength(0);
  });

  it("ist standardmäßig aus", () => {
    welt.schalter = null;
    expect(rueckrichtungAktiv()).toBe(false);
  });

  it("übernimmt eine Verschiebung aus dem Kalender", async () => {
    welt.zeilen = [crmTermin()];
    const ergebnis = await gleicheKalenderAb([{ id: "ev-1", start: "2026-08-15T10:30:00" }], ZEITRAUM);
    expect(ergebnis.verschoben).toHaveLength(1);
    expect(welt.aktualisierungen).toEqual([
      { id: "akt-1", felder: { faellig_am: "2026-08-15", uhrzeit: "10:30" } },
    ]);
  });

  it("übernimmt auch eine Verschiebung aus iCloud", async () => {
    welt.zeilen = [crmTermin()];
    await gleicheKalenderAb([{ id: "ev-1", start: "20260815T103000" }], ZEITRAUM);
    expect(welt.aktualisierungen).toEqual([
      { id: "akt-1", felder: { faellig_am: "2026-08-15", uhrzeit: "10:30" } },
    ]);
  });

  it("lässt eine unveränderte Zeit in Ruhe", async () => {
    welt.zeilen = [crmTermin()];
    const ergebnis = await gleicheKalenderAb([{ id: "ev-1", start: "2026-08-14T14:00:00" }], ZEITRAUM);
    expect(ergebnis.verschoben).toHaveLength(0);
    expect(welt.aktualisierungen).toHaveLength(0);
  });

  it("ignoriert Abweichungen von Sekunden", async () => {
    // Sekunden und Rundungen dürfen keine Verschiebung auslösen, sonst
    // wandert derselbe Termin bei jedem Öffnen des Kalenders.
    welt.zeilen = [crmTermin()];
    await gleicheKalenderAb([{ id: "ev-1", start: "2026-08-14T14:00:30" }], ZEITRAUM);
    expect(welt.aktualisierungen).toHaveLength(0);
  });

  it("fasst fremde Termine nicht an", async () => {
    // Ein Eintrag ohne Verknüpfung stammt aus dem Privatkalender. Er darf
    // niemals zu einem CRM-Termin werden.
    welt.zeilen = [crmTermin({ kalender_event_id: null })];
    const ergebnis = await gleicheKalenderAb([{ id: "fremd-9", start: "2026-08-15T10:00:00" }], ZEITRAUM);
    expect(ergebnis.verschoben).toHaveLength(0);
    expect(ergebnis.verschwunden).toHaveLength(0);
    expect(welt.aktualisierungen).toHaveLength(0);
  });

  it("meldet einen fehlenden Termin, löscht ihn aber nicht", async () => {
    welt.zeilen = [crmTermin()];
    const ergebnis = await gleicheKalenderAb([], ZEITRAUM);
    expect(ergebnis.verschwunden).toEqual([
      { id: "akt-1", titel: "Beratung Familie Brandl", zeitpunkt: expect.any(String) },
    ]);
    expect(welt.aktualisierungen).toHaveLength(0);
  });

  it("beurteilt nichts außerhalb des geholten Zeitraums", async () => {
    // Sonst sähe jeder Termin außerhalb des Fensters wie gelöscht aus.
    welt.zeilen = [crmTermin({ faellig_am: "2026-12-24" })];
    const ergebnis = await gleicheKalenderAb([], ZEITRAUM);
    expect(ergebnis.verschwunden).toHaveLength(0);
  });

  it("beachtet nur Meetings, keine Notizen oder Anrufe", async () => {
    welt.zeilen = [crmTermin({ art: "notiz" })];
    const ergebnis = await gleicheKalenderAb([{ id: "ev-1", start: "2026-08-15T10:00:00" }], ZEITRAUM);
    expect(ergebnis.verschoben).toHaveLength(0);
  });

  it("überspringt einen unlesbaren Zeitstempel", async () => {
    welt.zeilen = [crmTermin()];
    await gleicheKalenderAb([{ id: "ev-1", start: "irgendwann" }], ZEITRAUM);
    expect(welt.aktualisierungen).toHaveLength(0);
  });
});
