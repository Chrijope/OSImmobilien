import { describe, expect, it, vi } from "vitest";

/**
 * Die Pipeline-Kachel nennt ab der Stufe Finanzierung den Menschen, der die
 * Finanzierung betreut, nicht die Bank. Ermittelt wird er ueber die Rolle
 * `finanzierungspartner`, denselben Weg nimmt die Bonitaetsfreigabe fuer ihre
 * Meldung. Hier wird geprueft, dass die Rolle auch dann zaehlt, wenn sie
 * nicht die erste des Nutzers ist, und dass ohne hinterlegte Rolle nichts
 * erfunden wird.
 */

const usersMock = vi.fn();
vi.mock("@/lib/loadAllUsers", () => ({
  loadAllUsers: () => usersMock(),
}));

import {
  filterFinanzierungspartner,
  finanzierungspartnerAnzeige,
  finanzierungspartnerLabel,
} from "./finanzierungspartner";

describe("Finanzierungspartner finden", () => {
  it("findet den Nutzer mit der Rolle", () => {
    const gefunden = filterFinanzierungspartner([
      { id: "1", name: "Otto Hans", rolle: "vertriebspartner", rollen: ["vertriebspartner"] },
      { id: "2", name: "Erika Mustermann", rolle: "finanzierungspartner", rollen: ["finanzierungspartner"] },
    ]);
    expect(gefunden.map((u) => u.name)).toEqual(["Erika Mustermann"]);
  });

  it("zaehlt die Rolle auch, wenn sie nicht die erste ist", () => {
    // Genau daran scheiterte die alte Fusszeile: Sie verglich nur die erste Rolle.
    const gefunden = filterFinanzierungspartner([
      { id: "2", name: "Erika Mustermann", rolle: "admin", rollen: ["admin", "finanzierungspartner"] },
    ]);
    expect(gefunden.map((u) => u.name)).toEqual(["Erika Mustermann"]);
  });

  it("nimmt die einzelne Rolle, wenn keine Liste da ist", () => {
    const gefunden = filterFinanzierungspartner([
      { id: "2", name: "Erika Mustermann", rolle: "Finanzierungspartner" },
    ]);
    expect(gefunden.map((u) => u.name)).toEqual(["Erika Mustermann"]);
  });

  it("liefert niemanden, wenn niemand die Rolle traegt", () => {
    expect(filterFinanzierungspartner([{ id: "1", name: "Otto Hans", rolle: "kunde" }])).toEqual([]);
  });
});

describe("Anzeige auf der Kachel", () => {
  it("nennt einen Namen", () => {
    expect(finanzierungspartnerLabel(["Erika Mustermann"])).toBe("Erika Mustermann");
  });

  it("nennt zwei Namen ausgeschrieben", () => {
    expect(finanzierungspartnerLabel(["Erika Mustermann", "Otto Hans"])).toBe("Erika Mustermann, Otto Hans");
  });

  it("zaehlt ab dem dritten, damit die Kachel nicht ueberlaeuft", () => {
    expect(finanzierungspartnerLabel(["A", "B", "C", "D"])).toBe("A, B und 2 weitere");
  });

  it("gibt null zurueck, wenn kein Name da ist", () => {
    expect(finanzierungspartnerLabel([])).toBeNull();
    expect(finanzierungspartnerLabel(["", "   "])).toBeNull();
  });

  it("liest die Namen aus den Nutzern des Hauses", () => {
    usersMock.mockReturnValue([
      { id: "1", name: "Otto Hans", rolle: "vertriebspartner", rollen: ["vertriebspartner"] },
      { id: "2", name: "Erika Mustermann", rolle: "finanzierungspartner", rollen: ["finanzierungspartner"] },
    ]);
    expect(finanzierungspartnerAnzeige()).toBe("Erika Mustermann");
  });

  it("erfindet keinen Partner, wenn die Rolle unbesetzt ist", () => {
    usersMock.mockReturnValue([{ id: "1", name: "Otto Hans", rolle: "vertriebspartner" }]);
    expect(finanzierungspartnerAnzeige()).toBeNull();
  });
});
