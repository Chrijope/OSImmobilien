import { describe, it, expect } from "vitest";
import { istSaHinterlegtAusMeta, istUnterlagenFreigeschaltetAusMeta } from "./unterlagenFreigabe";

/**
 * Die Freischalt-Regel des Kundenprofils, die jetzt auch das Portal nutzt:
 * eigenes Investment-Flag gewinnt, sonst Kontakt-Ebene inklusive
 * Portal-Aktivierung, und zwar fuer JEDES Investment. Vorher blieb im Portal
 * jedes Investment ab Nummer 2 dauerhaft gesperrt.
 */
describe("istUnterlagenFreigeschaltetAusMeta", () => {
  it("laesst das eigene Investment-Flag gewinnen, auch wenn es sperrt", () => {
    expect(istUnterlagenFreigeschaltetAusMeta({ unterlagenFreigeschaltet: true }, {})).toBe(true);
    expect(
      istUnterlagenFreigeschaltetAusMeta(
        { unterlagenFreigeschaltet: false },
        { unterlagenFreigeschaltet: true },
      ),
    ).toBe(false);
  });

  it("faellt ohne Investment-Flag auf die Kontakt-Ebene zurueck", () => {
    expect(istUnterlagenFreigeschaltetAusMeta({}, { unterlagenFreigeschaltet: true })).toBe(true);
    expect(istUnterlagenFreigeschaltetAusMeta({ nummer: 2 }, { unterlagenFreigeschaltet: true })).toBe(true);
    expect(istUnterlagenFreigeschaltetAusMeta({}, {})).toBe(false);
  });

  it("wertet ein aktiviertes Kundenportal als Freischaltung", () => {
    expect(istUnterlagenFreigeschaltetAusMeta({}, { portalFreigeschalten: true })).toBe(true);
    expect(istUnterlagenFreigeschaltetAusMeta({}, { portalAktiviert: true })).toBe(true);
  });

  it("schaltet ab hinterlegter Selbstauskunft frei, unabhaengig von allem", () => {
    // Entscheidung Christian (01.09.2026): unterschriebene oder als Papier
    // hochgeladene SA oeffnet alle Unterlagen, ohne Portal-Freischaltung und
    // auch ueber eine alte ausdrueckliche Sperre hinweg.
    expect(istUnterlagenFreigeschaltetAusMeta({ saSigned: true }, {})).toBe(true);
    expect(istUnterlagenFreigeschaltetAusMeta({ saPdf: "sa.pdf" }, {})).toBe(true);
    expect(istUnterlagenFreigeschaltetAusMeta({ docStatuses: { Selbstauskunft: "uploaded" } }, {})).toBe(true);
    expect(istUnterlagenFreigeschaltetAusMeta({ docStatuses: { Selbstauskunft: "approved" } }, {})).toBe(true);
    expect(
      istUnterlagenFreigeschaltetAusMeta({ saSigned: true, unterlagenFreigeschaltet: false }, {}),
    ).toBe(true);
  });

  it("laesst einen blossen Ausfuellstand ohne Unterschrift NICHT genuegen", () => {
    expect(istUnterlagenFreigeschaltetAusMeta({ saData: { name: "Max" } }, {})).toBe(false);
    expect(istSaHinterlegtAusMeta({ saData: { name: "Max" }, saSigned: false })).toBe(false);
    expect(istSaHinterlegtAusMeta({ saPdf: "" })).toBe(false);
    expect(istSaHinterlegtAusMeta({ docStatuses: { Selbstauskunft: "none" } })).toBe(false);
    expect(istSaHinterlegtAusMeta(undefined)).toBe(false);
  });

  it("uebersteht fehlende Metadaten", () => {
    expect(istUnterlagenFreigeschaltetAusMeta(undefined, undefined)).toBe(false);
    expect(istUnterlagenFreigeschaltetAusMeta(null, null)).toBe(false);
  });
});
