import { describe, it, expect } from "vitest";
import {
  ASSESSMENT_STATIONEN,
  ASSESSMENT_PFADE,
  ASSESSMENT_EINWAENDE,
  ASSESSMENT_KURZUEBERBLICK,
  CLOSING_BUCHUNGSLINK,
  EMPFEHLUNG_HANDLUNG,
  LEISTUNGSTABELLE,
  LEISTUNGSTABELLE_SPALTEN,
  PROVISION_PROZENT,
  BEISPIEL_KAUFPREIS_EUR,
  BEISPIEL_PROVISION_EUR,
  berechneAssessmentScore,
  ermittleKoRot,
  fuellePlatzhalter,
  getStation,
  hatAssessmentDaten,
  staerksterPfad,
  SCORE_SCHWELLE_A,
  SCORE_SCHWELLE_B,
  type AssessmentAntworten,
} from "./assessmentSkript";

const fmt = (n: number) => n.toLocaleString("de-DE");

/** Alle Sprechtexte eines Punktes, egal ob einzeln, mehrfach oder in Blöcken. */
function alleTexte(nummer: number): string {
  const s = getStation(nummer);
  return [
    s.sprechtext ?? "",
    ...(s.sprechtexte ?? []),
    ...(s.bloecke ?? []).flatMap((b) => [...b.sprechtexte, ...(b.felder ?? []).map((f) => f.frage ?? "")]),
    ...(s.felder ?? []).map((f) => f.frage ?? ""),
  ].join(" ");
}

/** Antworten eines Top-Kandidaten (Profil A, alles grün, volle Klarheit). */
const topKandidat: AssessmentAntworten = {
  pfade: ["immo"],
  zeitProWoche: "vollzeit",
  bereitschaft34c: "vorhanden",
  zielklarheit: 5,
  gesamteindruck: 5,
};

describe("assessmentSkript: Struktur", () => {
  it("enthält genau die zehn Punkte 1 bis 10 in der neuen Reihenfolge", () => {
    expect(ASSESSMENT_STATIONEN).toHaveLength(10);
    expect(ASSESSMENT_STATIONEN.map((s) => s.nummer)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(ASSESSMENT_STATIONEN.map((s) => s.titel)).toEqual([
      "Einstieg und Rahmen",
      "Deine Ausgangslage",
      "Profil-Einordnung und Vertiefung",
      "Ziele",
      "Motivation",
      "Wer wir sind und wie eine Zusammenarbeit aussieht",
      "Konditionen und Machbarkeit",
      "Einwandbehandlung",
      "Einschätzung und Empfehlung",
      "Nächster Schritt und Verabschiedung",
    ]);
  });

  it("Kurzüberblick nennt alle Punkte in Reihenfolge", () => {
    expect(ASSESSMENT_KURZUEBERBLICK).toBe(
      "1 Einstieg und Rahmen · 2 Deine Ausgangslage · 3 Profil-Einordnung und Vertiefung · " +
      "4 Ziele · 5 Motivation · 6 Wer wir sind und wie die Zusammenarbeit aussieht · " +
      "7 Konditionen und Machbarkeit · 8 Einwandbehandlung · 9 Einschätzung und Empfehlung · " +
      "10 Nächster Schritt und Verabschiedung",
    );
  });

  it("die Profil-Weiche steht als Punkt 3 nach dem freien Erzählen", () => {
    expect(getStation(3).key).toBe("profil");
    // Punkt 2 ist das freie Erzählen und geht der Einordnung voraus.
    expect(getStation(2).sprechtext).toContain("Was machst du aktuell beruflich");
    expect(getStation(3).sprechtext).toBeUndefined();
  });

  it("hat vier Profile mit A als stärkstem und D als schwächstem", () => {
    expect(ASSESSMENT_PFADE.map((p) => p.id)).toEqual(["immo", "findi", "vertrieb", "quereinsteiger"]);
    const punkte = ASSESSMENT_PFADE.map((p) => p.punkte);
    expect([...punkte].sort((a, b) => b - a)).toEqual(punkte);
  });

  it("jedes Profil hat Sprechtext und Felder", () => {
    for (const p of ASSESSMENT_PFADE) {
      expect(p.sprechtext.length).toBeGreaterThan(20);
      expect(p.felder.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("Finanzdienstleister bekommt den Produktausblick als Regie-Hinweis, nicht als Sprechtext", () => {
    const findi = ASSESSMENT_PFADE.find((p) => p.id === "findi")!;
    expect(findi.sprechtext).not.toContain("stornofrei");
    expect(findi.hinweis).toBeTruthy();
    expect(findi.hinweisWortlaut).toContain("stornofrei, geringe Gebühr, hohe Provision");
  });

  it("Punkt 6 hat drei Sprechblöcke und die Leistungstabelle mit sechs Zeilen", () => {
    expect(getStation(6).sprechtexte).toHaveLength(3);
    expect(LEISTUNGSTABELLE_SPALTEN).toEqual(["Was du von uns bekommst", "Was es dir spart"]);
    expect(LEISTUNGSTABELLE).toHaveLength(6);
    expect(LEISTUNGSTABELLE[0].leistung).toContain("CRM");
    expect(LEISTUNGSTABELLE.every((z) => z.ersparnis.startsWith("spart"))).toBe(true);
  });

  it("Punkt 7 hat nur noch die Unterblöcke Verdienst und Formales", () => {
    expect((getStation(7).bloecke ?? []).map((b) => b.key)).toEqual(["verdienst", "formales"]);
  });

  it("Punkt 7 spricht Systemgebühr und Leadpreise nicht mehr an", () => {
    const text = alleTexte(7);
    expect(text).not.toContain("Systemgebühr");
    expect(text).not.toContain("Lead-Paket");
    expect(text).not.toContain("Das Paket kostet");
    const p7Keys = (getStation(7).bloecke ?? []).flatMap((b) => (b.felder ?? []).map((f) => f.key));
    expect(p7Keys).not.toContain("systemgebuehrOk");
    expect(p7Keys).not.toContain("leadKaufInteresse");
  });

  it("die harten Kriterien stehen unauffällig in Punkt 5 und Punkt 7", () => {
    const p5Keys = (getStation(5).felder ?? []).map((f) => f.key);
    expect(p5Keys).toContain("zeitProWoche");
    const p7Keys = (getStation(7).bloecke ?? []).flatMap((b) => (b.felder ?? []).map((f) => f.key));
    expect(p7Keys).toContain("bereitschaft34c");
  });

  it("Punkt 10 bucht das Kooperationsgespraech fest ueber den Calendly-Link der HR Managerin", () => {
    expect(CLOSING_BUCHUNGSLINK).toBe("https://calendly.com/sarah-kaiser-thom-more/gespraechstermin");
  });

  it("Punkt 9 fordert nicht mehr zum Buchen auf, das passiert erst in Punkt 10", () => {
    expect(EMPFEHLUNG_HANDLUNG.A).not.toContain("buchen");
    expect(EMPFEHLUNG_HANDLUNG.A).toContain("Punkt 10");
    expect(EMPFEHLUNG_HANDLUNG.B).toContain("Follow-Up");
    expect(EMPFEHLUNG_HANDLUNG.C).toContain("Absage");
  });

  it("Punkt 10 nennt das persönliche Gespräch und nicht mehr das Livezeigen des Systems", () => {
    const text = alleTexte(10);
    expect(text).toContain("persönliches Gespräch");
    expect(text).not.toContain("System live");
    expect(text).toContain("Der Vertrag wird erst nach diesem Folgetermin ausgestellt");
    expect(getStation(10).sprechtexte).toHaveLength(3);
  });
});

describe("assessmentSkript: Beträge kommen aus den Konstanten", () => {
  it("Punkt 7 nennt nur noch Provision und Formales, keine Preise mehr", () => {
    const text = alleTexte(7);
    expect(text).toContain(`${PROVISION_PROZENT} Prozent Provision vom Kaufpreis`);
    // Beispielrechnung ist abgeleitet: 300.000 Euro Kaufpreis, 4 Prozent = 12.000 Euro
    expect(BEISPIEL_PROVISION_EUR).toBe(Math.round((BEISPIEL_KAUFPREIS_EUR * PROVISION_PROZENT) / 100));
    expect(text).toContain(`Bei einem Kaufpreis von ${fmt(BEISPIEL_KAUFPREIS_EUR)} Euro sind das ${fmt(BEISPIEL_PROVISION_EUR)} Euro`);
    expect(text).toContain("Paragraf 34c");
    expect(text).not.toContain("Euro im Monat");
    expect(text).not.toContain("Laufzeit");
  });

  it("Einwandbehandlung hat acht Einträge und verweist bei Konditionen aufs persönliche Gespräch", () => {
    expect(ASSESSMENT_EINWAENDE).toHaveLength(8);
    expect(ASSESSMENT_EINWAENDE.map((e) => e.einwand)).toEqual([
      // "Zu teuer" und "nichts investieren" entfielen am 27.08.2026: Im
      // Erstgespräch wird kein Preis genannt, die Kostenfrage deckt der
      // erste Eintrag ab.
      "Was kostet mich die Zusammenarbeit mit euch?",
      "Was kosten die Leads?",
      "Ich habe keine Erfahrung in dem Bereich.",
      "Ich brauche ein sicheres Gehalt.",
      "Ich muss das erst überlegen.",
      // Die drei Fragen, die vorher nirgends im Gespräch beantwortet wurden,
      // obwohl der Vertrag sie regelt.
      "Was ist mit den Kunden, die ich selbst mitbringe?",
      "Bekomme ich ein festes Gebiet?",
      "Kann ich das auch nebenberuflich machen?",
    ]);
    // Die Konditionen-Einwände nennen keine Beträge, sondern verweisen weiter.
    for (const id of ["kosten", "leadpaket"]) {
      const e = ASSESSMENT_EINWAENDE.find((x) => x.id === id)!;
      expect(e.antwort).toMatch(/persönliche[nms]? Gespräch/);
      expect(e.antwort).not.toMatch(/\d[\d.]*\s*Euro/);
    }
    // Die Eignungs-Einwände bleiben inhaltlich beantwortet.
    expect(ASSESSMENT_EINWAENDE.find((e) => e.id === "eigeneKunden")!.antwort).toContain("Eigenkontakt");
  });
});

describe("assessmentSkript: stärkstes Profil", () => {
  it("wählt bei Mehrfachwahl das stärkste Profil", () => {
    expect(staerksterPfad(["quereinsteiger", "immo"])?.id).toBe("immo");
    expect(staerksterPfad(["vertrieb", "findi"])?.id).toBe("findi");
    expect(staerksterPfad(["quereinsteiger"])?.id).toBe("quereinsteiger");
    expect(staerksterPfad([])).toBeNull();
    expect(staerksterPfad(undefined)).toBeNull();
  });
});

describe("assessmentSkript: Scoring", () => {
  it("Top-Kandidat Profil A erreicht die Empfehlung A", () => {
    const s = berechneAssessmentScore(topKandidat);
    expect(s.punkte).toBe(100);
    expect(s.koRot).toEqual([]);
    expect(s.empfehlung).toBe("A");
    expect(s.uebersteuert).toBe(false);
  });

  it("zwei oder mehr gerissene harte Kriterien erzwingen C, auch bei sonst starkem Profil", () => {
    const s = berechneAssessmentScore({
      ...topKandidat,
      zeitProWoche: "unter_10",
      bereitschaft34c: "lehnt_ab",
    });
    expect(s.koRot).toHaveLength(2);
    expect(s.empfehlungAuto).toBe("C");
    expect(s.empfehlung).toBe("C");
  });

  it("ein einzelnes gerissenes Kriterium erzwingt kein C", () => {
    const s = berechneAssessmentScore({ ...topKandidat, bereitschaft34c: "lehnt_ab" });
    expect(s.koRot).toHaveLength(1);
    expect(s.empfehlungAuto).not.toBe("C");
  });

  it("ermittleKoRot erkennt beide harten Kriterien, die Systemgebühr nicht mehr", () => {
    expect(ermittleKoRot({
      zeitProWoche: "unter_10",
      bereitschaft34c: "lehnt_ab",
    })).toHaveLength(2);
    expect(ermittleKoRot(topKandidat)).toEqual([]);
    // Alte Antworten zur Systemgebühr bleiben gespeichert, zählen aber nicht mehr.
    expect(ermittleKoRot({ ...topKandidat, systemgebuehrOk: "nein" })).toEqual([]);
  });

  it("34c beantragt zählt wie vorhanden, würde beantragen etwas weniger", () => {
    const vorhanden = berechneAssessmentScore(topKandidat).punkte;
    const beantragt = berechneAssessmentScore({ ...topKandidat, bereitschaft34c: "beantragt" }).punkte;
    const wuerde = berechneAssessmentScore({ ...topKandidat, bereitschaft34c: "wuerde_beantragen" }).punkte;
    expect(beantragt).toBe(vorhanden);
    expect(wuerde).toBeLessThan(vorhanden);
    expect(ermittleKoRot({ bereitschaft34c: "wuerde_beantragen" })).toEqual([]);
  });

  it("alte Systemgebühr-Antworten verändern die Punktzahl nicht mehr", () => {
    const ohne = berechneAssessmentScore(topKandidat).punkte;
    expect(berechneAssessmentScore({ ...topKandidat, systemgebuehrOk: "nein" }).punkte).toBe(ohne);
  });

  it("Profilgewichtung: gleicher Rest, schwächeres Profil ergibt weniger Punkte", () => {
    const a = berechneAssessmentScore({ ...topKandidat, pfade: ["immo"] });
    const d = berechneAssessmentScore({ ...topKandidat, pfade: ["quereinsteiger"] });
    expect(a.punkte).toBeGreaterThan(d.punkte);
  });

  it("mittleres Profil landet bei B", () => {
    const s = berechneAssessmentScore({
      pfade: ["vertrieb"],
      zeitProWoche: "10_bis_20",
      bereitschaft34c: "vorhanden",
      zielklarheit: 3,
      gesamteindruck: 3,
    });
    expect(s.punkte).toBeGreaterThanOrEqual(SCORE_SCHWELLE_B);
    expect(s.punkte).toBeLessThan(SCORE_SCHWELLE_A);
    expect(s.empfehlungAuto).toBe("B");
  });

  it("HR kann die Empfehlung übersteuern, auch bei der harten Regel", () => {
    const s = berechneAssessmentScore({
      ...topKandidat,
      zeitProWoche: "unter_10",
      bereitschaft34c: "lehnt_ab",
      empfehlungOverride: "B",
    });
    expect(s.empfehlungAuto).toBe("C");
    expect(s.empfehlung).toBe("B");
    expect(s.uebersteuert).toBe(true);
    expect(s.begruendung).toContain("von HR auf B gesetzt");
  });
});

describe("assessmentSkript: Helfer", () => {
  it("fuellePlatzhalter ersetzt bekannte Platzhalter und zeigt sonst den Fallback", () => {
    expect(fuellePlatzhalter("Hallo {vorname}, hier ist {beraterName}.", { vorname: "Max", beraterName: "Christian" }))
      .toBe("Hallo Max, hier ist Christian.");
    expect(fuellePlatzhalter("{vorschlagA} oder {vorschlagB} am {datum}", {}))
      .toBe("[Vorschlag A] oder [Vorschlag B] am [Datum]");
  });

  it("hatAssessmentDaten erkennt leere und gefüllte Antworten", () => {
    expect(hatAssessmentDaten(undefined)).toBe(false);
    expect(hatAssessmentDaten({})).toBe(false);
    expect(hatAssessmentDaten({ pfade: [], ersteindruck: "  " })).toBe(false);
    expect(hatAssessmentDaten({ pfade: ["immo"] })).toBe(true);
    expect(hatAssessmentDaten({ gesamteindruck: 3 })).toBe(true);
  });

  it("Sprechtexte enthalten keine Gedankenstriche", () => {
    const texte = [
      ...ASSESSMENT_STATIONEN.flatMap((s) => [alleTexte(s.nummer)]),
      ...ASSESSMENT_PFADE.flatMap((p) => [p.sprechtext, p.hinweis ?? "", p.hinweisWortlaut ?? ""]),
      ...ASSESSMENT_EINWAENDE.flatMap((e) => [e.einwand, e.antwort]),
      ...LEISTUNGSTABELLE.flatMap((z) => [z.leistung, z.ersparnis]),
      ASSESSMENT_KURZUEBERBLICK,
    ];
    for (const t of texte) {
      expect(t).not.toMatch(/[–—]/);
    }
  });
});
