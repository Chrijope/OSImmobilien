import { describe, it, expect } from "vitest";
import { bewertePipelineKachel } from "@/lib/pipelineAmpel";

const JETZT = new Date(2026, 6, 28, 9, 0).getTime(); // 28. Juli 2026, 9 Uhr

describe("Regel 1: Termin in der Zukunft", () => {
  it("laesst die Kachel farblos, auch nach vierzig Tagen ohne Aktivitaet", () => {
    const r = bewertePipelineKachel({
      stufe: "beratungsgespraech",
      tageSeitAenderung: 40,
      naechsterKontakt: { zeitpunkt: "2026-08-01T17:00:00", ueberfaellig: false },
      hatZukuenftigenTermin: true,
      jetzt: JETZT,
    });
    expect(r.farbe).toBeNull();
    expect(r.text).toBe("Termin geplant");
  });

  it("gilt in jeder Stufe gleich", () => {
    for (const stufe of ["neuer_lead", "erstgespraech_geplant", "reservierung", "notar"] as const) {
      const r = bewertePipelineKachel({
        stufe,
        tageSeitAenderung: 99,
        naechsterKontakt: { zeitpunkt: "2026-08-01T10:00:00", ueberfaellig: false },
        hatZukuenftigenTermin: true,
        jetzt: JETZT,
      });
      expect(r.farbe, stufe).toBeNull();
    }
  });

  it("nennt die Quelle: eine Aufgabe heisst nicht Termin", () => {
    const r = bewertePipelineKachel({
      stufe: "selbstauskunft",
      tageSeitAenderung: 5,
      naechsterKontakt: { zeitpunkt: "2026-08-01T17:00:00", ueberfaellig: false, quelle: "aufgabe" },
      hatZukuenftigenTermin: true,
      jetzt: JETZT,
    });
    expect(r.text).toBe("Aufgabe geplant");
    expect(r.grund).toBe("eingeplant");
  });

  it("nennt die Quelle: ein Follow-Up heisst nicht Termin", () => {
    const r = bewertePipelineKachel({
      stufe: "follow_up",
      tageSeitAenderung: 2,
      naechsterKontakt: { zeitpunkt: "2026-08-02T09:00:00", ueberfaellig: false, quelle: "follow_up" },
      hatZukuenftigenTermin: true,
      jetzt: JETZT,
    });
    expect(r.text).toBe("Follow-Up geplant");
  });

  it("echte Termine heissen weiterhin Termin geplant", () => {
    const r = bewertePipelineKachel({
      stufe: "erstgespraech_geplant",
      tageSeitAenderung: 2,
      naechsterKontakt: { zeitpunkt: "2026-08-02T09:00:00", ueberfaellig: false, quelle: "termin" },
      hatZukuenftigenTermin: true,
      jetzt: JETZT,
    });
    expect(r.text).toBe("Termin geplant");
  });

  it("ein Termin mit Videoraum heisst Videomeeting geplant", () => {
    const r = bewertePipelineKachel({
      stufe: "beratungsgespraech",
      tageSeitAenderung: 2,
      naechsterKontakt: { zeitpunkt: "2026-08-02T09:00:00", ueberfaellig: false, quelle: "videotermin" },
      hatZukuenftigenTermin: true,
      jetzt: JETZT,
    });
    expect(r.text).toBe("Videomeeting geplant");
    expect(r.grund).toBe("eingeplant");
    expect(r.farbe).toBeNull();
  });
});

describe("Regel 2: Termin faellig und vorbei", () => {
  it("faerbt sofort rot, ohne Ruecksicht auf die Stufenschwelle", () => {
    // Beratungsgespräch wird sonst erst nach sieben Tagen rot. Ein versäumter
    // Termin ist aber ab dem ersten Tag ein versäumter Termin.
    const r = bewertePipelineKachel({
      stufe: "beratungsgespraech",
      tageSeitAenderung: 0,
      naechsterKontakt: { zeitpunkt: "2026-07-27T12:00:00", ueberfaellig: true },
      hatZukuenftigenTermin: false,
      jetzt: JETZT,
    });
    expect(r.farbe).toBe("red");
    expect(r.grund).toBe("termin_versaeumt");
  });

  it("faerbt Devis Rau rot", () => {
    const r = bewertePipelineKachel({
      stufe: "beratungsgespraech",
      tageSeitAenderung: 34,
      naechsterKontakt: { zeitpunkt: "2026-05-25T12:30:00", ueberfaellig: true },
      hatZukuenftigenTermin: false,
      jetzt: JETZT,
    });
    expect(r.farbe).toBe("red");
    expect(r.text).toBe("Termin 63d überfällig");
  });

  it("faerbt STEVE Test rot", () => {
    const r = bewertePipelineKachel({
      stufe: "erstgespraech_geplant",
      tageSeitAenderung: 9,
      naechsterKontakt: { zeitpunkt: "2026-07-10T18:42:00", ueberfaellig: true },
      hatZukuenftigenTermin: false,
      jetzt: JETZT,
    });
    expect(r.farbe).toBe("red");
    expect(r.text).toBe("Termin 17d überfällig");
  });

  it("gilt in jeder Stufe, auch wenn dort sonst hohe Schwellen gelten", () => {
    for (const stufe of ["reservierung", "finanzierung", "notar", "faelligkeit"] as const) {
      const r = bewertePipelineKachel({
        stufe,
        tageSeitAenderung: 0,
        naechsterKontakt: { zeitpunkt: "2026-07-26T10:00:00", ueberfaellig: true },
        hatZukuenftigenTermin: false,
        jetzt: JETZT,
      });
      expect(r.farbe, stufe).toBe("red");
    }
  });

  it("nennt Stunden, solange noch kein ganzer Tag vergangen ist", () => {
    const r = bewertePipelineKachel({
      stufe: "erstgespraech_geplant",
      tageSeitAenderung: 0,
      naechsterKontakt: { zeitpunkt: "2026-07-28T06:00:00", ueberfaellig: true },
      hatZukuenftigenTermin: false,
      jetzt: JETZT,
    });
    expect(r.text).toBe("Termin 3h überfällig");
  });
});

describe("Regel 3: gar kein Termin", () => {
  const ohneTermin = {
    naechsterKontakt: null,
    hatZukuenftigenTermin: false,
    jetzt: JETZT,
  };

  it("faellt auf die Tage seit der letzten Aktivitaet zurueck", () => {
    const basis = { ...ohneTermin, stufe: "beratungsgespraech" as const };
    expect(bewertePipelineKachel({ ...basis, tageSeitAenderung: 2 }).farbe).toBeNull();
    expect(bewertePipelineKachel({ ...basis, tageSeitAenderung: 3 }).farbe).toBe("orange");
    expect(bewertePipelineKachel({ ...basis, tageSeitAenderung: 7 }).farbe).toBe("red");
  });

  it("nennt im Text die Tage, nicht einen Termin", () => {
    const r = bewertePipelineKachel({
      ...ohneTermin,
      stufe: "erstgespraech_geplant",
      tageSeitAenderung: 12,
    });
    expect(r.text).toBe("12d inaktiv");
    expect(r.grund).toBe("inaktiv");
  });

  it("laesst Stufen ohne Regel farblos und sagt das auch", () => {
    const r = bewertePipelineKachel({
      ...ohneTermin,
      stufe: "abgeschlossen",
      tageSeitAenderung: 400,
    });
    expect(r.farbe).toBeNull();
    expect(r.grund).toBe("keine_regel");
  });
});

describe("Wartephase nach einem Kontaktversuch", () => {
  // Gemeldet von Julian Meyer: Er ruft einen Lead an, protokolliert "nicht
  // erreicht", und wenige Stunden spaeter stand auf der Kachel "Termin 4h
  // ueberfaellig" in Rot. Einen Termin gab es nie.

  it("laesst die Kachel farblos, solange die Sperrfrist laeuft", () => {
    const r = bewertePipelineKachel({
      stufe: "nicht_erreicht",
      tageSeitAenderung: 0,
      naechsterKontakt: {
        zeitpunkt: new Date(JETZT + 4 * 60 * 60 * 1000).toISOString(),
        ueberfaellig: false,
        quelle: "wartephase",
      },
      hatZukuenftigenTermin: false,
      jetzt: JETZT,
    });
    expect(r.farbe).toBeNull();
    expect(r.grund).toBe("wartephase");
    expect(r.text).toBe("Wiedervorlage in 4h");
  });

  it("meldet keinen versaeumten Termin, wenn die Sperrfrist abgelaufen ist", () => {
    const r = bewertePipelineKachel({
      stufe: "nicht_erreicht",
      tageSeitAenderung: 0,
      naechsterKontakt: {
        zeitpunkt: new Date(JETZT - 4 * 60 * 60 * 1000).toISOString(),
        ueberfaellig: true,
        quelle: "wartephase",
      },
      hatZukuenftigenTermin: false,
      jetzt: JETZT,
    });
    expect(r.grund).not.toBe("termin_versaeumt");
    expect(r.text ?? "").not.toContain("überfällig");
    // Am selben Tag ist noch nichts liegen geblieben.
    expect(r.farbe).toBeNull();
  });

  it("faellt auf den Inaktivitaetstracker durch: orange nach einem Tag", () => {
    const r = bewertePipelineKachel({
      stufe: "nicht_erreicht",
      tageSeitAenderung: 1,
      naechsterKontakt: {
        zeitpunkt: new Date(JETZT - 20 * 60 * 60 * 1000).toISOString(),
        ueberfaellig: true,
        quelle: "wartephase",
      },
      hatZukuenftigenTermin: false,
      jetzt: JETZT,
    });
    expect(r.farbe).toBe("orange");
    expect(r.grund).toBe("inaktiv");
  });

  it("faellt auf den Inaktivitaetstracker durch: rot nach drei Tagen", () => {
    const r = bewertePipelineKachel({
      stufe: "nicht_erreicht",
      tageSeitAenderung: 3,
      naechsterKontakt: {
        zeitpunkt: new Date(JETZT - 3 * 24 * 60 * 60 * 1000).toISOString(),
        ueberfaellig: true,
        quelle: "wartephase",
      },
      hatZukuenftigenTermin: false,
      jetzt: JETZT,
    });
    expect(r.farbe).toBe("red");
    expect(r.grund).toBe("inaktiv");
  });

  it("ein echter Termin bleibt weiterhin sofort rot", () => {
    const r = bewertePipelineKachel({
      stufe: "nicht_erreicht",
      tageSeitAenderung: 0,
      naechsterKontakt: {
        zeitpunkt: new Date(JETZT - 4 * 60 * 60 * 1000).toISOString(),
        ueberfaellig: true,
        quelle: "aufgabe",
      },
      hatZukuenftigenTermin: false,
      jetzt: JETZT,
    });
    expect(r.farbe).toBe("red");
    expect(r.grund).toBe("termin_versaeumt");
  });

  it("ein vereinbarter Termin schlaegt die laufende Sperrfrist", () => {
    const r = bewertePipelineKachel({
      stufe: "nicht_erreicht",
      tageSeitAenderung: 9,
      naechsterKontakt: {
        zeitpunkt: new Date(JETZT + 2 * 24 * 60 * 60 * 1000).toISOString(),
        ueberfaellig: false,
        quelle: "termin",
      },
      hatZukuenftigenTermin: true,
      jetzt: JETZT,
    });
    expect(r.farbe).toBeNull();
    expect(r.text).toBe("Termin geplant");
  });
});
