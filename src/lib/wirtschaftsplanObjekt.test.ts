import { describe, expect, it } from "vitest";
import { hausgeldAusPlan, wirtschaftsplanAusBlatt } from "./wirtschaftsplanObjekt";
import type { Blatt } from "./excelLesen";

// Blatt „Wirtschaftsplan“ aus „Kaufpreisliste_Marktstrasse6.xlsx“ (Brück, WP 2027), Werte 1:1.
const BRUECK: Blatt = { name: "Wirtschaftsplan", zeilen: [
  ["Wirtschaftsplan (Gesamtansätze pro Jahr)"],
  ["Gesamt-MEA (Gesamtverteiler)", 1000],
  ["Anzahl Einheiten (Verteiler WE)", 11],
  ["Gesamtfläche lt. Plan (m²)", 618.53],
  ["Plan gültig ab", "2027"],
  ["Position", "Kategorie", "Ansatz €/Jahr", "Verteiler", "Hinweis"],
  ...([["Be-/Entwässerung", 3500], ["Abfallentsorgung", 1600], ["Schneebeseitigung", 2000], ["Hausreinigung", 5000],
    ["Gebäudebetreuung/Hauswart", 2160], ["Gartenpflege", 2800], ["Hausbeleuchtung", 200], ["Gebäudeversicherung", 8000],
    ["Haftpflichtversicherung", 500], ["Rauchwarnmelder Wartung", 250]] as const).map(([p, a]) => [p, "umlagefähig", a, "MEA"]),
  ["Heizkosten", "Heizkosten", 17000, "MEA"],
  ["Instandhaltung Haus", "nicht umlagefähig", 1000, "MEA"],
  ["Instandhaltung Heizung", "nicht umlagefähig", 500, "MEA"],
  ["Rauchwarnmelder Miete", "nicht umlagefähig", 250, "MEA"],
  ["Verwaltergebühren", "nicht umlagefähig", 4712.4, "WE", "je Einheit (Verteiler WE)"],
  ["Kontoführung/Porto/Ausl.", "nicht umlagefähig", 30, "MEA"],
  ["Erhaltungsrücklage", "Erhaltungsrücklage", 3711.18, "MEA"],
  ["Summen je Kategorie"],
  ["umlagefähig"],
] };

describe("Wirtschaftsplan am Objekt", () => {
  it("liest das Blatt der Kaufpreisliste unverändert", () => {
    const wp = wirtschaftsplanAusBlatt(BRUECK)!;
    expect(wp.gesamtMea).toBe(1000);
    expect(wp.anzahlEinheiten).toBe(11);
    expect(wp.gueltigAb).toBe("2027");
    expect(wp.positionen).toHaveLength(17);
    expect(wp.positionen.find((p) => p.position === "Verwaltergebühren")).toMatchObject({ verteiler: "WE", ansatzJahr: 4712.4 });
  });

  it("ergibt für 39 MEA genau den Einzelwirtschaftsplan E/006: 193,33 €", () => {
    const hg = hausgeldAusPlan(wirtschaftsplanAusBlatt(BRUECK)!, 39)!;
    expect(hg).toEqual({ gesamt: 193.33, umlagefaehig: 139.78, nichtUmlagefaehig: 41.49, ruecklage: 12.06 });
  });

  it("rechnet ohne MEA nichts und erkennt Blätter ohne Positionen", () => {
    expect(hausgeldAusPlan(wirtschaftsplanAusBlatt(BRUECK)!, null)).toBeNull();
    expect(wirtschaftsplanAusBlatt({ name: "x", zeilen: [["WE", "Fläche"]] })).toBeNull();
  });
});
