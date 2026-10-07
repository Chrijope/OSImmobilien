import { describe, expect, it } from "vitest";

import { darfUnterlagenImCrmHochladen, unterlagenZeileGesperrt } from "./unterlagenSperre";

const ohneFreigabe = { unterlagenFreigeschaltet: false, istBasisdokument: false, nurLesend: false };

describe("Unterlagensperre im Kundenprofil", () => {
  it("Vertriebspartner lädt bei seinem Kunden auch ohne Vollfreigabe hoch", () => {
    expect(unterlagenZeileGesperrt({ role: "vertriebspartner", ...ohneFreigabe })).toBe(false);
  });

  it("Leitung und Backoffice werden ebenfalls nicht gesperrt", () => {
    for (const role of ["admin", "inhaber", "vertriebsleiter", "backoffice"]) {
      expect(unterlagenZeileGesperrt({ role, ...ohneFreigabe })).toBe(false);
      expect(darfUnterlagenImCrmHochladen(role)).toBe(true);
    }
  });

  it("eine Rolle ohne Hochladerecht sieht weiterhin den Sperrvermerk", () => {
    expect(unterlagenZeileGesperrt({ role: "marketing", ...ohneFreigabe })).toBe(true);
    expect(darfUnterlagenImCrmHochladen("marketing")).toBe(false);
  });

  it("Grunddokumente sind nie gesperrt", () => {
    expect(unterlagenZeileGesperrt({ role: "marketing", ...ohneFreigabe, istBasisdokument: true })).toBe(false);
  });

  it("nach der Vollfreigabe ist nichts mehr gesperrt", () => {
    expect(unterlagenZeileGesperrt({ role: "marketing", ...ohneFreigabe, unterlagenFreigeschaltet: true })).toBe(false);
  });

  it("die Nur-Lese-Ansicht kennt keine Sperre, sie zeigt ohnehin keine Knöpfe", () => {
    expect(unterlagenZeileGesperrt({ role: "finanzierungspartner", ...ohneFreigabe, nurLesend: true })).toBe(false);
  });
});
