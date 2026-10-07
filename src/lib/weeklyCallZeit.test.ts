import { describe, it, expect } from "vitest";
import * as zeitModul from "./weeklyCallZeit";
import {
  CALL_RUNDEN,
  CALL_SCHNITT_MINUTE,
  CALL_SCHNITT_STUNDE,
  callRundenFuer,
  callZeitenText,
  rundeUhrzeitText,
} from "./weeklyCallZeit";
import { ROLLEN_VARIANTE_LEAD_BERATER } from "./rollenLabel";

/**
 * Seit 05.10.2026 zwei Calls am Montag: 19:00 Lead-Berater, 19:30
 * Vertriebspartner. Leitung sieht beide. Gleicher Zoom-Link, gemeinsamer
 * Wochenschnitt 20:30 (deckungsgleich mit weekly_call_woche()).
 */
describe("Weekly-Call: wer welchen Call sieht", () => {
  it("Lead-Berater sehen nur den 19:00-Call", () => {
    expect(callRundenFuer("vertriebspartner", ROLLEN_VARIANTE_LEAD_BERATER)).toEqual(["lead_berater"]);
  });

  it("Vertriebspartner ohne Variante sehen nur den 19:30-Call", () => {
    expect(callRundenFuer("vertriebspartner")).toEqual(["vertriebspartner"]);
    expect(callRundenFuer("vertriebspartner", null)).toEqual(["vertriebspartner"]);
  });

  it("Admin, Inhaber und Vertriebsleitung sehen beide, frueherer zuerst", () => {
    for (const rolle of ["admin", "inhaber", "vertriebsleiter"]) {
      expect(callRundenFuer(rolle)).toEqual(["lead_berater", "vertriebspartner"]);
      // Die Variante aendert an der Leitung nichts.
      expect(callRundenFuer(rolle, ROLLEN_VARIANTE_LEAD_BERATER)).toEqual(["lead_berater", "vertriebspartner"]);
    }
  });

  it("andere Rollen sehen keinen Call, auch mit Variante", () => {
    for (const rolle of ["backoffice", "kunde", "buchhaltung", "setterin", undefined]) {
      expect(callRundenFuer(rolle, ROLLEN_VARIANTE_LEAD_BERATER)).toEqual([]);
    }
  });
});

describe("Weekly-Call: Uhrzeiten und Zugang", () => {
  it("startet 19:00 fuer Lead-Berater und 19:30 fuer Vertriebspartner", () => {
    expect(rundeUhrzeitText("lead_berater")).toBe("19:00");
    expect(rundeUhrzeitText("vertriebspartner")).toBe("19:30");
  });

  it("nennt eine Zeit bei einem Call und beide beschriftet bei zwei", () => {
    expect(callZeitenText(["vertriebspartner"])).toBe("19:30 Uhr");
    expect(callZeitenText(["lead_berater", "vertriebspartner"])).toBe(
      "19:00 Uhr Lead-Berater, 19:30 Uhr Vertriebspartner",
    );
  });

  it("fuehrt genau einen Zoom-Link fuer beide Calls", () => {
    expect(zeitModul.ZOOM_URL).toMatch(/^https:\/\/[^/]*zoom\.us\//);
    // Kein zweiter Link je Call.
    for (const runde of Object.values(CALL_RUNDEN)) {
      expect(Object.keys(runde)).not.toContain("zoomUrl");
    }
  });

  it("der Wochenschnitt liegt fuer beide bei 20:30 wie in der Datenbank", () => {
    expect(CALL_SCHNITT_STUNDE).toBe(20);
    expect(CALL_SCHNITT_MINUTE).toBe(30);
  });
});
