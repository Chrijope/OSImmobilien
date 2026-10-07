import { describe, it, expect, vi } from "vitest";

/**
 * Die Pflichtangaben des Abschlussschritts und die IBAN-Eingabe, ohne das
 * Formular zu rendern.
 *
 * Seit dem 15.09.2026 reicht ein Haken nicht mehr: Der Kunde muss die
 * Vereinbarung akzeptieren und genau eine der beiden Wahlmöglichkeiten zum
 * Beginn der Reservierung ankreuzen. Die früheren Datenschutz-Haken und das
 * vorgeschlagene Notariat gibt es nicht mehr; alte Werte dürfen nichts sperren.
 */
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: async () => ({ data: null, error: null }) } } }));
vi.mock("@/lib/userSettingsCache", () => ({ getUserSetting: (_k: string, f: unknown) => f, setUserSetting: () => {} }));
vi.mock("@/lib/dbStoreHelper", () => ({ isTestAccount: () => false }));
vi.mock("@/lib/kundenStore", () => ({ getKontaktById: () => null, updateKontakt: () => {} }));
vi.mock("@/lib/objekteStore", () => ({ reserveWohnung: async () => {}, getObjektById: () => undefined }));
vi.mock("@/lib/investmentsStore", () => ({
  updateInvestment: () => {}, getInvestmentsByKontakt: () => [], setInvestmentMetaFields: () => {}, getInvestmentMetaField: (_i: string, _k: string, f: unknown) => f,
}));
vi.mock("@/lib/notificationStore", () => ({ addDocNotification: () => {} }));

const { abschlussVollstaendig, ibanEingabe, ibanLeerOderGueltig, validateRvStep } = await import("./ReservierungsForm");
type ReservierungData = import("./ReservierungsForm").ReservierungData;

const abschluss = (over: Partial<ReservierungData>): ReservierungData =>
  ({
    erklaerungAkzeptiert: true, widerrufWahl: "sofort",
    ...over,
  }) as ReservierungData;

describe("Der Abschlussschritt ist erst vollständig, wenn alles Pflichtige da ist", () => {
  it("ist mit Erklärung und einer Wahl vollständig", () => {
    expect(abschlussVollstaendig(abschluss({}))).toBe(true);
    expect(abschlussVollstaendig(abschluss({ widerrufWahl: "abwarten" }))).toBe(true);
  });

  it("verlangt genau eine Wahl zum Beginn der Reservierung", () => {
    expect(abschlussVollstaendig(abschluss({ widerrufWahl: "" }))).toBe(false);
    expect(abschlussVollstaendig(abschluss({ widerrufWahl: undefined }))).toBe(false);
  });

  it("verlangt die Annahme der Vereinbarung", () => {
    expect(abschlussVollstaendig(abschluss({ erklaerungAkzeptiert: false }))).toBe(false);
  });

  // Die Datenschutz-Haken und das eigene Notariat sind entfallen. Alte
  // Datensätze tragen die Felder noch; sie dürfen den Knopf nicht sperren.
  it("sperrt nicht an entfallenen Feldern älterer Datensätze", () => {
    expect(abschlussVollstaendig(abschluss({ datenschutzKenntnis: false, bankEinwilligung: false }))).toBe(true);
    expect(abschlussVollstaendig(abschluss({ eigenerNotar: true, notarName: "" }))).toBe(true);
  });
});

describe("Die IBAN-Eingabe", () => {
  it("schreibt groß und in Vierergruppen", () => {
    expect(ibanEingabe("de02120300000000202051")).toBe("DE02 1203 0000 0000 2020 51");
  });

  it("nimmt Leerzeichen und Sonderzeichen heraus, bevor sie neu gruppiert", () => {
    expect(ibanEingabe("DE02 1203-0000 0000.2020 51")).toBe("DE02 1203 0000 0000 2020 51");
  });

  it("begrenzt auf die 22 Zeichen einer deutschen IBAN", () => {
    expect(ibanEingabe("A".repeat(50)).replace(/ /g, "")).toHaveLength(22);
  });
});

/**
 * Die IBAN ist seit dem 22.09.2026 freiwillig.
 *
 * Die Falle dabei: `ibanGueltig("")` sagt nein, denn die Prüfziffer braucht
 * mindestens fünf Zeichen. Wer nur das Sternchen am Feld entfernt hätte,
 * hätte deshalb nichts gewonnen, das Formular wäre weiterhin hängen
 * geblieben.
 */
describe("Die freiwillige IBAN", () => {
  const GUELTIG = "DE02 1203 0000 0000 2020 51";

  it("lässt leer durch, in jeder Schreibweise von leer", () => {
    for (const leer of ["", "   ", undefined, null]) {
      expect(ibanLeerOderGueltig(leer), String(leer)).toBe(true);
    }
  });

  it("prüft eine getippte IBAN weiterhin", () => {
    expect(ibanLeerOderGueltig(GUELTIG)).toBe(true);
    // Eine geänderte Ziffer bricht die Prüfsumme.
    expect(ibanLeerOderGueltig("DE02 1203 0000 0000 2020 52")).toBe(false);
    expect(ibanLeerOderGueltig("DE02 1203")).toBe(false);
    expect(ibanLeerOderGueltig("Sparkasse")).toBe(false);
  });

  /** Ein Käuferschritt, bei dem alles außer der IBAN stimmt. */
  const kaeufer = (over: Partial<ReservierungData>): ReservierungData =>
    ({
      vorname: "Erika", nachname: "Muster", geburtsdatum: "1980-01-01",
      staatsangehoerigkeit: "Deutsch", strasse: "Roonstraße", hausnummer: "3",
      plz: "83022", ort: "Rosenheim", telefon: "0800 1", email: "e@example.de",
      hatPerson2: false,
      ...over,
    }) as ReservierungData;

  it("hält den Käuferschritt nicht mehr an einer leeren IBAN auf", () => {
    expect(validateRvStep(0, kaeufer({ iban: "" }), false).size).toBe(0);
    expect(validateRvStep(0, kaeufer({}), false).size).toBe(0);
  });

  it("markiert eine falsch getippte IBAN weiterhin", () => {
    expect(validateRvStep(0, kaeufer({ iban: "DE02 1203 0000 0000 2020 52" }), false)).toContain("iban");
  });

  it("prüft die IBAN des zweiten Käufers nach denselben Regeln", () => {
    const mitP2 = (iban: string) => kaeufer({
      hatPerson2: true, p2Vorname: "Max", p2Nachname: "Muster", p2Geburtsdatum: "1980-01-01",
      p2Staatsangehoerigkeit: "Deutsch", p2Strasse: "Roonstraße", p2Hausnummer: "3",
      p2Plz: "83022", p2Ort: "Rosenheim", p2Telefon: "0800 2", p2Email: "m@example.de",
      p2Iban: iban,
    });
    expect(validateRvStep(0, mitP2(""), false).size).toBe(0);
    expect(validateRvStep(0, mitP2(GUELTIG), false).size).toBe(0);
    expect(validateRvStep(0, mitP2("DE02 1203 0000 0000 2020 52"), false)).toContain("p2Iban");
  });
});

/**
 * Der Schieberegler „Kunde zahlt keine Reservierungsgebühr".
 *
 * Standard ist „zahlt". Bei umgelegtem Regler stehen weder die IBAN-Felder
 * noch die Widerrufswahl im Formular; sie dürfen dann auch nichts blockieren,
 * sonst hängt der Schritt an einer Pflicht, die niemand sehen kann.
 */
describe("Der Regler zur Reservierungsgebühr", () => {
  it("lässt den Abschluss ohne Widerrufswahl durch, wenn keine Gebühr erhoben wird", () => {
    expect(abschlussVollstaendig(abschluss({ gebuehrEntfaellt: true, widerrufWahl: "" }))).toBe(true);
    expect(abschlussVollstaendig(abschluss({ gebuehrEntfaellt: true, widerrufWahl: undefined }))).toBe(true);
  });

  it("verlangt die Annahme der Vereinbarung auch ohne Gebühr", () => {
    expect(abschlussVollstaendig(abschluss({ gebuehrEntfaellt: true, erklaerungAkzeptiert: false }))).toBe(false);
  });

  /*
   * Die wichtigste Regel: Ein fehlendes Feld heißt „zahlt eine Gebühr". Jede
   * Reservierung von vor dem 22.09.2026 kennt es nicht und muss sich
   * unverändert verhalten, also weiterhin eine Wahl verlangen.
   */
  it("behandelt ein fehlendes Feld als zahlende Reservierung, samt Pflichtwahl", () => {
    expect(abschlussVollstaendig(abschluss({ widerrufWahl: "" }))).toBe(false);
    expect(abschlussVollstaendig(abschluss({ gebuehrEntfaellt: false, widerrufWahl: "" }))).toBe(false);
    expect(abschlussVollstaendig(abschluss({ gebuehrEntfaellt: undefined, widerrufWahl: "" }))).toBe(false);
  });

  it("blockiert ohne Gebühr nicht an einer IBAN, die noch im Entwurf steht", () => {
    const daten = {
      vorname: "Erika", nachname: "Muster", geburtsdatum: "1980-01-01",
      staatsangehoerigkeit: "Deutsch", strasse: "Roonstraße", hausnummer: "3",
      plz: "83022", ort: "Rosenheim", telefon: "0800 1", email: "e@example.de",
      hatPerson2: false,
      gebuehrEntfaellt: true, iban: "DE02 1203 0000 0000 2020 52",
    } as unknown as ReservierungData;
    expect(validateRvStep(0, daten, false).size).toBe(0);
  });
});
