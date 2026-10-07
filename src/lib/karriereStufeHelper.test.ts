import { describe, it, expect, vi } from "vitest";

// karriereStufeHelper importiert cacheGet für die Override-Helfer. Die hier
// getesteten Auflösungsfunktionen brauchen den Cache nicht, ein leerer
// Platzhalter genügt.
vi.mock("@/lib/dataCache", () => ({
  cacheGet: () => [],
}));

import {
  KARRIERE_STUFEN,
  NEUVERGABE_KARRIERE_STUFEN,
  findKarriereStufe,
  getKarriereStufe,
  getKarriereStufeById,
} from "@/lib/karriereStufeHelper";

/**
 * Kern der Auflösung (historischer Fall Hermann Vogl): Kennungen laufen in
 * einem eigenen, kompletten Durchlauf VOR den Titeln. Seit dem
 * vereinheitlichten Modell heißt die 4-%-Stufe (id "vertriebspartner")
 * "Vertriebspartner", die alte 3-%-Stufe "Vertriebspartner (Alt)". Der nackte
 * Titel "Vertriebspartner" löst damit bewusst auf die 4-%-Stufe auf;
 * Alt-Bestand ist über festgeschriebene custom-Sätze abgesichert.
 */

describe("getKarriereStufe: Auflösung über die Kennung", () => {
  it("löst 'tippgeber' auf die erste Stufe (3 %)", () => {
    const stufe = getKarriereStufe(0, "tippgeber");
    expect(stufe.id).toBe("tippgeber");
    expect(stufe.rate).toBe(3);
  });

  it("löst 'vertriebspartner' auf die einheitliche 4-%-Stufe auf", () => {
    const stufe = getKarriereStufe(0, "vertriebspartner");
    expect(stufe.id).toBe("vertriebspartner");
    expect(stufe.titel).toBe("Vertriebspartner");
    expect(stufe.rate).toBe(4);
  });

  it("löst 'manager' auf Team Lead (4,5 %)", () => {
    const stufe = getKarriereStufe(0, "manager");
    expect(stufe.id).toBe("manager");
    expect(stufe.rate).toBe(4.5);
  });

  it("löst 'vertriebsfirma' auf Lizenzpartner (5 %)", () => {
    const stufe = getKarriereStufe(0, "vertriebsfirma");
    expect(stufe.id).toBe("vertriebsfirma");
    expect(stufe.rate).toBe(5);
  });
});

describe("getKarriereStufe: Auflösung über den Titel (Altbestand)", () => {
  it("löst den nackten Titel 'Vertriebspartner' auf die 4-%-Stufe", () => {
    const stufe = getKarriereStufe(0, "Vertriebspartner");
    expect(stufe.id).toBe("vertriebspartner");
    expect(stufe.rate).toBe(4);
  });

  it("löst 'Vertriebspartner (Alt)' auf die alte 3-%-Stufe", () => {
    const stufe = getKarriereStufe(0, "Vertriebspartner (Alt)");
    expect(stufe.id).toBe("tippgeber");
    expect(stufe.rate).toBe(3);
  });

  it("löst den Alt-Titel 'Lead Partner' als Legacy-Alias auf die 4-%-Stufe", () => {
    const stufe = getKarriereStufe(0, "Lead Partner");
    expect(stufe.id).toBe("vertriebspartner");
    expect(stufe.rate).toBe(4);
  });

  it("löst 'Team Lead' auf die dritte Stufe (4,5 %)", () => {
    const stufe = getKarriereStufe(0, "Team Lead");
    expect(stufe.id).toBe("manager");
    expect(stufe.rate).toBe(4.5);
  });

  it("löst 'Lizenzpartner' auf die vierte Stufe (5 %)", () => {
    const stufe = getKarriereStufe(0, "Lizenzpartner");
    expect(stufe.id).toBe("vertriebsfirma");
    expect(stufe.rate).toBe(5);
  });

  it("ignoriert Gross-/Kleinschreibung und Leerraum", () => {
    expect(getKarriereStufe(0, "  lead partner  ").rate).toBe(4);
    expect(getKarriereStufe(0, "LIZENZPARTNER").rate).toBe(5);
  });
});

describe("getKarriereStufe: Legacy-Aliase", () => {
  it.each([
    ["Junior Berater", "tippgeber", 3],
    ["Berater", "vertriebspartner", 4],
    ["Lead Berater", "vertriebspartner", 4],
    ["Lead Partner", "vertriebspartner", 4],
    ["Team Berater", "manager", 4.5],
    ["Senior Berater", "vertriebsfirma", 5],
  ] as const)("löst '%s' auf %s (%s %%)", (alias, erwarteteId, erwarteteRate) => {
    const stufe = getKarriereStufe(0, alias);
    expect(stufe.id).toBe(erwarteteId);
    expect(stufe.rate).toBe(erwarteteRate);
  });
});

describe("getKarriereStufe: ohne oder mit unbekanntem Override", () => {
  it("fällt ohne Override auf die Schwellen-Logik zurück", () => {
    expect(getKarriereStufe(0).id).toBe("tippgeber");
    expect(getKarriereStufe(9).id).toBe("tippgeber");
    expect(getKarriereStufe(10).id).toBe("vertriebspartner");
    expect(getKarriereStufe(30).id).toBe("manager");
    expect(getKarriereStufe(50).id).toBe("vertriebsfirma");
  });

  it("behandelt leeren oder unbekannten Override wie keinen Override", () => {
    expect(getKarriereStufe(0, "").id).toBe("tippgeber");
    expect(getKarriereStufe(0, null).id).toBe("tippgeber");
    expect(getKarriereStufe(0, "   ").id).toBe("tippgeber");
    expect(getKarriereStufe(30, "unbekannter wert").id).toBe("manager");
  });
});

describe("findKarriereStufe", () => {
  it("gibt für jede Kennung die passende Stufe zurück", () => {
    for (const stufe of KARRIERE_STUFEN) {
      expect(findKarriereStufe(stufe.id)).toBe(stufe);
    }
  });

  it("gibt für jeden Titel die passende Stufe zurück", () => {
    for (const stufe of KARRIERE_STUFEN) {
      expect(findKarriereStufe(stufe.titel)).toBe(stufe);
    }
  });

  it("löst Kennung und Titel 'Vertriebspartner' auf dieselbe 4-%-Stufe", () => {
    expect(findKarriereStufe("vertriebspartner")?.rate).toBe(4);
    expect(findKarriereStufe("Vertriebspartner")?.rate).toBe(4);
  });

  it("gibt für leere oder unbekannte Werte undefined zurück", () => {
    expect(findKarriereStufe(undefined)).toBeUndefined();
    expect(findKarriereStufe(null)).toBeUndefined();
    expect(findKarriereStufe("")).toBeUndefined();
    expect(findKarriereStufe("quatsch")).toBeUndefined();
  });
});

describe("getKarriereStufeById", () => {
  it("löst alle vier Kennungen korrekt auf", () => {
    expect(getKarriereStufeById("tippgeber").rate).toBe(3);
    expect(getKarriereStufeById("vertriebspartner").rate).toBe(4);
    expect(getKarriereStufeById("manager").rate).toBe(4.5);
    expect(getKarriereStufeById("vertriebsfirma").rate).toBe(5);
  });

  it("löst 'vertriebspartner' auf den Titel 'Vertriebspartner' auf", () => {
    expect(getKarriereStufeById("vertriebspartner").titel).toBe("Vertriebspartner");
  });

  it("fällt bei leerem oder unbekanntem Wert auf die erste Stufe zurück", () => {
    expect(getKarriereStufeById(undefined).id).toBe("tippgeber");
    expect(getKarriereStufeById(null).id).toBe("tippgeber");
    expect(getKarriereStufeById("Lead Partner").id).toBe("tippgeber");
  });
});

describe("Neuvergabe-Stufen", () => {
  it("bietet nur die einheitliche 4-%-Stufe zur Neuvergabe an", () => {
    expect(NEUVERGABE_KARRIERE_STUFEN.map((s) => s.id)).toEqual(["vertriebspartner"]);
    expect(NEUVERGABE_KARRIERE_STUFEN[0].rate).toBe(4);
    expect(NEUVERGABE_KARRIERE_STUFEN[0].titel).toBe("Vertriebspartner");
  });

  it("kennzeichnet die Bestandsstufen mit nurBestand", () => {
    const bestand = KARRIERE_STUFEN.filter((s) => s.nurBestand).map((s) => s.id);
    expect(bestand).toEqual(["tippgeber", "manager", "vertriebsfirma"]);
  });
});
