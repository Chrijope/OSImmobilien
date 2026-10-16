import { describe, it, expect, vi } from "vitest";

/**
 * Die Pflichtangaben des Abschlussschritts, ohne das Formular zu rendern.
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

const { abschlussVollstaendig, validateRvStep } = await import("./ReservierungsForm");
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

/** Seit dem 16.10.2026 fragt das Formular keine IBAN mehr ab und prüft keine. */
describe("Keine IBAN mehr im Käuferschritt", () => {
  it("hält den Käuferschritt auch an einer falsch getippten Alt-IBAN nicht auf", () => {
    const daten = {
      vorname: "Erika", nachname: "Muster", geburtsdatum: "1980-01-01",
      staatsangehoerigkeit: "Deutsch", strasse: "Roonstraße", hausnummer: "3",
      plz: "83022", ort: "Rosenheim", telefon: "0800 1", email: "e@example.de",
      hatPerson2: false, iban: "DE02 1203 0000 0000 2020 52",
    } as unknown as ReservierungData;
    expect(validateRvStep(0, daten, false).size).toBe(0);
  });
});

/**
 * Ohne Gebühr (seit dem 16.10.2026 jede neue Reservierung) steht keine
 * Widerrufswahl im Formular; sie darf dann auch nichts blockieren. Alte
 * Datensätze mit Gebühr verlangen sie weiter.
 */
describe("Ohne Reservierungsgebühr", () => {
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
