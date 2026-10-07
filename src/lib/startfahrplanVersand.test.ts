import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests der Fassungswahl des Startfahrplans: Nur Teil 1 des Erstgesprächs
 * ergibt den bestehenden kompakten Fahrplan, Teil 1 plus komplett
 * durchlaufener Teil 2 die erweiterte Fassung. Der Versand selbst wird mit
 * Attrappen geprüft: Es zählt, welcher PDF-Erzeuger aufgerufen wird und
 * welche Fassung zurückgemeldet wird.
 */
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: () => ({
        select: () => ({
          single: vi.fn().mockResolvedValue({ data: { token: "test-token" }, error: null }),
        }),
      }),
    }),
    functions: { invoke: vi.fn().mockResolvedValue({ error: null }) },
  },
}));

vi.mock("./bewerbungStore", () => ({
  updateBewerber: vi.fn(),
}));

vi.mock("./bewerberKontaktversuch", () => ({
  ladeHrAnsprechpartner: vi.fn().mockResolvedValue({
    name: "Sarah Kaiser-Thom",
    email: "s.kaiser-thom@more.immo",
    telefon: "+49 151 1234567",
  }),
}));

vi.mock("./paketUebersichtPdf", () => ({
  buildPaketUebersichtPdf: vi.fn().mockResolvedValue(new Blob(["standard"])),
  uploadPaketUebersichtPdf: vi.fn().mockResolvedValue("https://example.test/fahrplan.pdf"),
}));

vi.mock("./startfahrplanErweitertPdf", () => ({
  buildStartfahrplanErweitertPdf: vi.fn().mockResolvedValue(new Blob(["erweitert"])),
}));

import type { Bewerber, ErstgespraechSkript } from "./bewerbungStore";
import { buildPaketUebersichtPdf } from "./paketUebersichtPdf";
import { buildStartfahrplanErweitertPdf } from "./startfahrplanErweitertPdf";
import { CLOSING_DIREKT_ABSCHNITTE } from "./closingDirektSkript";
import {
  istKooperationsgespraechAbgeschlossen,
  istTeil1Abgeschlossen,
  waehleStartfahrplanFassung,
  sendeStartfahrplan,
} from "./startfahrplanVersand";

/** Leeres Skript, wie es jeder Bewerber als Vorgabe trägt. */
const leeresSkript = (): ErstgespraechSkript => ({
  ausgangslage: "", ziele: "", motivation: "", vorErfahrung: "",
  einwand: "", budget: "", naechsterSchritt: "",
  durchgefuehrtAm: "", durchgefuehrtVon: "",
});

const baueBewerber = (patch: Partial<Bewerber> = {}): Bewerber =>
  ({
    id: "bw-1",
    vorname: "Max",
    nachname: "Muster",
    email: "max@example.test",
    paketwahl: "",
    closingEntscheidung: "",
    erstgespraechSkript: leeresSkript(),
    ...patch,
  }) as unknown as Bewerber;

beforeEach(() => {
  vi.mocked(buildPaketUebersichtPdf).mockClear();
  vi.mocked(buildStartfahrplanErweitertPdf).mockClear();
});

describe("istTeil1Abgeschlossen (dieselbe Definition wie der Einstieg in erstgespraechStand.ts)", () => {
  it("ein leeres Vorgabe-Skript zählt nicht als abgeschlossen", () => {
    expect(istTeil1Abgeschlossen(undefined)).toBe(false);
    expect(istTeil1Abgeschlossen(null)).toBe(false);
    expect(istTeil1Abgeschlossen(leeresSkript())).toBe(false);
  });

  it("der Abschluss-Zeitstempel zählt", () => {
    expect(istTeil1Abgeschlossen({ ...leeresSkript(), durchgefuehrtAm: "2026-09-01T10:00:00Z" })).toBe(true);
  });

  it("gefüllte Assessment-Antworten oder Altfelder allein zählen nicht mehr", () => {
    expect(istTeil1Abgeschlossen({ ...leeresSkript(), assessment: { ersteindruck: "offen und klar" } })).toBe(false);
    expect(istTeil1Abgeschlossen({ ...leeresSkript(), assessment: { pfade: ["vertrieb"] } })).toBe(false);
    expect(istTeil1Abgeschlossen({ ...leeresSkript(), ziele: "Nebeneinkommen aufbauen" })).toBe(false);
  });
});

describe("waehleStartfahrplanFassung (Teil 2 komplett ergibt erweitert, unabhaengig vom Abschluss-Klick)", () => {
  const alleKeys = CLOSING_DIREKT_ABSCHNITTE.map((a) => a.key);

  it("nur Teil 1 ergibt die bestehende Fassung", () => {
    const b = baueBewerber({
      erstgespraechSkript: { ...leeresSkript(), durchgefuehrtAm: "2026-09-01T10:00:00Z" },
    });
    expect(waehleStartfahrplanFassung(b)).toBe("standard");
  });

  it("Teil 1 plus Entscheidung Ja mit Paket ergibt die erweiterte Fassung", () => {
    const b = baueBewerber({
      closingEntscheidung: "ja",
      paketwahl: "junior",
      erstgespraechSkript: {
        ...leeresSkript(),
        durchgefuehrtAm: "2026-09-01T10:00:00Z",
        closingDirekt: { aktiv: true },
      },
    });
    expect(waehleStartfahrplanFassung(b)).toBe("erweitert");
  });

  it("Teil 1 plus Unterlagen-Weiche ergibt die erweiterte Fassung, auch ohne Entscheidung", () => {
    const b = baueBewerber({
      erstgespraechSkript: {
        ...leeresSkript(),
        durchgefuehrtAm: "2026-09-01T10:00:00Z",
        closingDirekt: { aktiv: true, startWeiche: "unterlagen" },
      },
    });
    expect(waehleStartfahrplanFassung(b)).toBe("erweitert");
  });

  it("Teil 1 plus komplett abgehakter Teil 2 ergibt die erweiterte Fassung", () => {
    const b = baueBewerber({
      erstgespraechSkript: {
        ...leeresSkript(),
        durchgefuehrtAm: "2026-09-01T10:00:00Z",
        closingDirekt: { aktiv: true, abgehakt: alleKeys },
      },
    });
    expect(waehleStartfahrplanFassung(b)).toBe("erweitert");
  });

  it("Teil 2 komplett ergibt die erweiterte Fassung auch ohne Abschluss-Klick (die Weiche liegt mitten im Gespraech)", () => {
    const b = baueBewerber({
      closingEntscheidung: "ja",
      paketwahl: "junior",
      erstgespraechSkript: {
        ...leeresSkript(),
        assessment: { ersteindruck: "offen", pfade: ["vertrieb"] },
        closingDirekt: { aktiv: true, abgehakt: alleKeys },
      },
    });
    expect(waehleStartfahrplanFassung(b)).toBe("erweitert");
  });

  it("Teil 2 ohne eingeschalteten Direktweg bleibt bei der bestehenden Fassung, die Unterlagen-Weiche allein reicht fuer erweitert", () => {
    const ohneSchalter = baueBewerber({
      erstgespraechSkript: {
        ...leeresSkript(),
        durchgefuehrtAm: "2026-09-01T10:00:00Z",
        closingDirekt: { aktiv: false, abgehakt: alleKeys },
      },
    });
    expect(waehleStartfahrplanFassung(ohneSchalter)).toBe("standard");

    const weicheOhneAbschluss = baueBewerber({
      erstgespraechSkript: {
        ...leeresSkript(),
        closingDirekt: { aktiv: true, startWeiche: "unterlagen" },
      },
    });
    expect(waehleStartfahrplanFassung(weicheOhneAbschluss)).toBe("erweitert");
  });
});

/**
 * Der zweite Ablauf: das persönliche Gespräch. Es schreibt nie etwas in
 * `closingDirekt`, deshalb erkannte die Auswahlregel es bis zum 08.09.2026 gar
 * nicht. Jetzt erkennt sie es und entscheidet sich ausdrücklich für die
 * kompakte Fassung: Die erweiterte zeichnet die alte Closing-Präsentation
 * nach, die in diesem Gespräch niemand gezeigt hat.
 */
describe("istKooperationsgespraechAbgeschlossen (Abschluss plus Einschätzung)", () => {
  it("ein leeres Skript zählt nicht", () => {
    expect(istKooperationsgespraechAbgeschlossen(undefined)).toBe(false);
    expect(istKooperationsgespraechAbgeschlossen(null)).toBe(false);
    expect(istKooperationsgespraechAbgeschlossen(leeresSkript())).toBe(false);
  });

  it("verlangt beides, den Abschluss und die Einschätzung", () => {
    expect(
      istKooperationsgespraechAbgeschlossen({
        ...leeresSkript(),
        durchgefuehrtAm: "2026-09-08T10:00:00Z",
      }),
    ).toBe(false);
    expect(
      istKooperationsgespraechAbgeschlossen({
        ...leeresSkript(),
        bewerberVideocall: { entscheidung: "moeglich" },
      }),
    ).toBe(false);
    expect(
      istKooperationsgespraechAbgeschlossen({
        ...leeresSkript(),
        durchgefuehrtAm: "2026-09-08T10:00:00Z",
        bewerberVideocall: { entscheidung: "moeglich", wunsch: "unterlagen" },
      }),
    ).toBe(true);
  });

  it("ein reines Zwischenspeichern ohne Einschätzung zählt nicht", () => {
    expect(
      istKooperationsgespraechAbgeschlossen({
        ...leeresSkript(),
        durchgefuehrtAm: "2026-09-08T10:00:00Z",
        bewerberVideocall: { entscheidung: "", letzteFolie: "kern-weitergehen" },
      }),
    ).toBe(false);
  });
});

describe("waehleStartfahrplanFassung aus beiden Abläufen", () => {
  const alleKeys = CLOSING_DIREKT_ABSCHNITTE.map((a) => a.key);

  it("das vollständige persönliche Gespräch bekommt bewusst die kompakte Fassung", () => {
    const b = baueBewerber({
      erstgespraechSkript: {
        ...leeresSkript(),
        durchgefuehrtAm: "2026-09-08T10:00:00Z",
        durchgefuehrtVon: "Sarah Kaiser-Thom",
        bewerberVideocall: {
          entscheidung: "moeglich",
          wunsch: "unterlagen",
          letzteFolie: "kern-weitergehen",
          bestaetigt: ["rahmen", "akquise"],
        },
      },
    });
    expect(istKooperationsgespraechAbgeschlossen(b.erstgespraechSkript)).toBe(true);
    expect(waehleStartfahrplanFassung(b)).toBe("standard");
  });

  it("das alte Erstgespräch mit komplettem Teil 2 bekommt weiter die erweiterte Fassung", () => {
    const b = baueBewerber({
      erstgespraechSkript: {
        ...leeresSkript(),
        durchgefuehrtAm: "2026-09-01T10:00:00Z",
        closingDirekt: { aktiv: true, abgehakt: alleKeys },
      },
    });
    expect(istKooperationsgespraechAbgeschlossen(b.erstgespraechSkript)).toBe(false);
    expect(waehleStartfahrplanFassung(b)).toBe("erweitert");
  });
});

describe("sendeStartfahrplan (baut die gewählte Fassung und meldet sie zurück)", () => {
  it("versendet die bestehende Fassung, wenn nur Teil 1 lief", async () => {
    const b = baueBewerber({
      erstgespraechSkript: { ...leeresSkript(), durchgefuehrtAm: "2026-09-01T10:00:00Z" },
    });
    const ergebnis = await sendeStartfahrplan(b, { paketId: "junior" });
    expect(ergebnis.fassung).toBe("standard");
    expect(buildPaketUebersichtPdf).toHaveBeenCalledTimes(1);
    expect(buildStartfahrplanErweitertPdf).not.toHaveBeenCalled();
  });

  it("versendet die erweiterte Fassung mit dem Abschlusstempo aus Teil 2", async () => {
    const b = baueBewerber({
      closingEntscheidung: "ja",
      paketwahl: "junior",
      erstgespraechSkript: {
        ...leeresSkript(),
        durchgefuehrtAm: "2026-09-01T10:00:00Z",
        closingDirekt: { aktiv: true, notizen: { rechnerAbschluesse: "1 bis 2" } },
      },
    });
    const ergebnis = await sendeStartfahrplan(b, { paketId: "junior" });
    expect(ergebnis.fassung).toBe("erweitert");
    expect(buildStartfahrplanErweitertPdf).toHaveBeenCalledTimes(1);
    expect(buildPaketUebersichtPdf).not.toHaveBeenCalled();
    const aufruf = vi.mocked(buildStartfahrplanErweitertPdf).mock.calls[0][0];
    expect(aufruf?.abschluesseProMonat).toBe("1 bis 2");
    expect(aufruf?.paketId).toBe("junior");
    expect(aufruf?.empfaengerName).toBe("Max Muster");
  });

  it("versendet aus dem persönlichen Gespräch die kompakte Fassung", async () => {
    const b = baueBewerber({
      erstgespraechSkript: {
        ...leeresSkript(),
        durchgefuehrtAm: "2026-09-08T10:00:00Z",
        bewerberVideocall: { entscheidung: "moeglich", wunsch: "unterlagen" },
      },
    });
    const ergebnis = await sendeStartfahrplan(b, { paketId: "junior" });
    expect(ergebnis.fassung).toBe("standard");
    expect(buildPaketUebersichtPdf).toHaveBeenCalledTimes(1);
    expect(buildStartfahrplanErweitertPdf).not.toHaveBeenCalled();
  });

  it("wirft ohne E-Mail-Adresse einen verständlichen Fehler", async () => {
    const b = baueBewerber({ email: "" });
    await expect(sendeStartfahrplan(b)).rejects.toThrow("keine E-Mail-Adresse");
  });
});
