import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Der Datenzugriff der Partner-Terminseite.
 *
 * Geprüft wird vor allem das, was still falsch laufen kann: eine Antwort ohne
 * Termin, die als Erfolg durchginge, und eine Fehlermeldung, die als
 * "Migration fehlt noch" beschwichtigt würde, obwohl etwas anderes kaputt ist.
 */

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { bestaetigePartnertermin, ladePartnertermin, ladePartnerterminMitGrund, partnerterminPfad } from "./partnerterminStore";
import { PARTNERTERMIN_FEHLER_TEXTE } from "./partnerterminFehlerTexte";

beforeEach(() => {
  rpc.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

/** Lässt die Pausen der Wiederholung sofort verstreichen. */
async function mitUhr<T>(lauf: () => Promise<T>): Promise<T> {
  vi.useFakeTimers();
  try {
    const versprechen = lauf();
    await vi.runAllTimersAsync();
    return await versprechen;
  } finally {
    vi.useRealTimers();
  }
}

describe("Den Zugang lesen", () => {
  it("liest Berater, Anlässe und den bereits bestätigten Termin", async () => {
    rpc.mockResolvedValue({
      data: {
        berater: { name: "Hermann Vogl", email: "h@example.de" },
        zeitzone: "Europe/Berlin",
        vorname: "Max",
        anlaesse: [
          { anlass: "beratung", bezeichnung: "Beratungsgespraech", beschreibung: "Text", dauer_minuten: 60, url: "https://calendly.com/x" },
        ],
        termin: { datum: "2030-04-02", uhrzeit: "10:00", anlass: "beratung", bezeichnung: "Beratungsgespraech", dauer_minuten: 60 },
      },
      error: null,
    });

    const z = await ladePartnertermin("tok");
    expect(z?.berater.name).toBe("Hermann Vogl");
    expect(z?.investments).toEqual([]);
    expect(z?.investmentId).toBeNull();
    expect(z?.berater.telefon).toBeNull();
    expect(z?.anlaesse).toHaveLength(1);
    expect(z?.anlaesse[0].dauerMinuten).toBe(60);
    expect(z?.termin?.uhrzeit).toBe("10:00");
  });

  /*
    Ein Anlass ohne Adresse waere ein Knopf, der ins Leere fuehrt. Die
    Datenbank laesst ihn gar nicht erst durch, hier wird es ein zweites Mal
    geprueft: Die Seite baut aus dieser Liste einen eingebetteten Rahmen.
  */
  it("wirft einen Anlass ohne Kalenderadresse weg", async () => {
    rpc.mockResolvedValue({
      data: {
        berater: { name: "Hermann Vogl" },
        anlaesse: [
          { anlass: "beratung", bezeichnung: "Beratung", url: "" },
          { anlass: "erstgespraech", bezeichnung: "Erstgespraech", url: "https://calendly.com/x" },
        ],
      },
      error: null,
    });

    const z = await ladePartnertermin("tok");
    expect(z?.anlaesse.map((a) => a.anlass)).toEqual(["erstgespraech"]);
  });

  /*
    `kunde` ist zugleich das Zeichen „der Aufrufer besitzt den Link“. Für den
    Besitzer schickt die Datenbank immer ein Objekt, auch ein leeres; nur so
    weist die Seite ihn bei einem Kunden ohne Namen nicht fälschlich ab.
  */
  it.each([
    ["ein leeres Objekt als Kunden ohne Angaben", {}, { name: "", email: "", telefon: "" }],
    ["null als fehlenden Kunden", null, null],
  ])("liest %s", async (_name, kunde, erwartet) => {
    rpc.mockResolvedValue({ data: { berater: { name: "X" }, anlaesse: [], kunde }, error: null });
    expect((await ladePartnertermin("tok"))?.kunde).toEqual(erwartet);
  });

  /*
    Seit Migration 20260929130000 je Gesprächsart ein Termin. Vorher schickt
    die Datenbank nur `termin`; dann steht er allein in `termine` und gilt als
    korrigierbar, wie bisher.
  */
  it("liest die Termine je Gesprächsart samt Korrigierbarkeit und Investment", async () => {
    rpc.mockResolvedValue({
      data: {
        berater: { name: "X" }, anlaesse: [],
        termine: [
          { datum: "2026-09-01", uhrzeit: "09:00", anlass: "erstgespraech", korrigierbar: false, investment_id: "inv-a" },
          { datum: "2030-04-02", uhrzeit: "10:00", anlass: "beratung", korrigierbar: true },
        ],
      },
      error: null,
    });
    const z = await ladePartnertermin("tok");
    expect(z?.termine.map((t) => [t.anlass, t.korrigierbar, t.investmentId])).toEqual([
      ["erstgespraech", false, "inv-a"],
      ["beratung", true, null],
    ]);
  });

  it("nimmt ohne `termine` den einen Termin, korrigierbar", async () => {
    rpc.mockResolvedValue({
      data: { berater: { name: "X" }, anlaesse: [], termin: { datum: "2030-04-02", uhrzeit: "10:00", anlass: "beratung" } },
      error: null,
    });
    const z = await ladePartnertermin("tok");
    expect(z?.termine).toHaveLength(1);
    expect(z?.termine[0].korrigierbar).toBe(true);
  });

  it("gibt null zurück, wenn die Migration noch nicht gelaufen ist", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    expect(await ladePartnertermin("tok")).toBeNull();
  });

  it("fragt ohne Token gar nicht erst nach", async () => {
    expect(await ladePartnertermin("")).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("Den Termin bestätigen", () => {
  it("reicht Token, Anlass, Datum und Uhrzeit durch", async () => {
    rpc.mockResolvedValue({
      data: { datum: "2030-04-02", uhrzeit: "10:00", anlass: "beratung", bezeichnung: "Beratung", dauer_minuten: 60 },
      error: null,
    });

    const ergebnis = await bestaetigePartnertermin("tok", "beratung", "2030-04-02", "10:00");
    expect(ergebnis.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("partnertermin_bestaetigen", {
      _token: "tok", _anlass: "beratung", _datum: "2030-04-02", _uhrzeit: "10:00",
      _investment_id: null,
    });
  });

  /*
    Das Investment entscheidet, an welchem Vorgang der Termin haengt. Ohne
    Weitergabe stuende er in der Kundenakte, aber im Investment blieben die
    Kaesten "Naechste Aktion" und "Naechster Schritt" leer.
  */
  it("reicht das gewählte Investment mit durch", async () => {
    rpc.mockResolvedValue({
      data: { datum: "2030-04-02", uhrzeit: "10:00", anlass: "beratung", bezeichnung: "Beratung", dauer_minuten: 60 },
      error: null,
    });
    await bestaetigePartnertermin("tok", "beratung", "2030-04-02", "10:00", "inv-1");
    expect(rpc).toHaveBeenCalledWith("partnertermin_bestaetigen", expect.objectContaining({
      _investment_id: "inv-1",
    }));
  });

  /*
    Kein Fehler, aber auch kein Termin zurueck. Das darf nicht als Erfolg
    durchgehen: Die Seite zeigte dem Kunden sonst eine Bestaetigung ohne Zeit.
  */
  it("wertet eine Antwort ohne Termin nicht als Erfolg", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const ergebnis = await bestaetigePartnertermin("tok", "beratung", "2030-04-02", "10:00");
    expect(ergebnis.ok).toBe(false);
  });

  /*
    Eine fehlende Spalte ist nie ein Grund zurueckzufallen: Die Funktion ist da,
    sie passt nur nicht zur Tabelle. Genau so blieb am 21.09.2026 unsichtbar,
    dass eine Schreibfunktion auf ein nicht vorhandenes Feld schrieb.
  */
  it("beschwichtigt eine fehlende Spalte nicht als fehlende Migration", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42703", message: 'column "x" does not exist' } });
    const ergebnis = await bestaetigePartnertermin("tok", "beratung", "2030-04-02", "10:00");
    expect(ergebnis.ok).toBe(false);
    if (ergebnis.ok === false) expect(ergebnis.grund).not.toMatch(/notieren/);
  });

  it.each([
    ["Der Termin liegt in der Vergangenheit", /Vergangenheit/],
    ["Der Termin liegt zu weit in der Zukunft", /Jahreszahl/],
    ["Ueber diesen Link steht bereits ein Termin", /schon ein Termin/],
    ["Diese Gespraechsart steht nicht zur Verfuegung", /Gesprächsart/],
    ["Zu viele Buchungen, bitte spaeter erneut versuchen", /20 Buchungen/],
    // Seit 20260929110000 mit echten Umlauten; beide Fassungen müssen greifen.
    ["Über diesen Link steht bereits ein Termin", /schon ein Termin/],
    ["Diese Gesprächsart steht nicht zur Verfügung", /Gesprächsart/],
    ["Zu viele Buchungen, bitte später erneut versuchen", /20 Buchungen/],
    ["Kein Zugang", /abgelaufen, deaktiviert, gehört zu einem anderen Konto/],
  ])("übersetzt %s in einen lesbaren Satz", async (meldung, erwartet) => {
    rpc.mockResolvedValue({ data: null, error: { message: meldung } });
    const ergebnis = await bestaetigePartnertermin("tok", "beratung", "2030-04-02", "10:00");
    expect(ergebnis.ok).toBe(false);
    if (ergebnis.ok === false) expect(ergebnis.grund).toMatch(erwartet);
  });

  /*
    Bis zum 29.09.2026 versprach der Text bei einer fehlenden Funktion, der
    Termin sei trotzdem sicher und wir notierten ihn selbst. Gespeichert und
    gemeldet wurde aber nichts.
  */
  it("verspricht bei einer fehlenden Funktion nichts, was nicht passiert", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function" }, status: 404 });
    const ergebnis = await bestaetigePartnertermin("tok", "beratung", "2030-04-02", "10:00");
    expect(ergebnis.ok).toBe(false);
    if (ergebnis.ok === false) {
      expect(ergebnis.code).toBe("funktionFehlt");
      expect(ergebnis.technik).toBe("PGRST202, HTTP 404");
    }
    for (const texte of [PARTNERTERMIN_FEHLER_TEXTE.de, PARTNERTERMIN_FEHLER_TEXTE.en]) {
      expect(JSON.stringify(texte)).not.toMatch(/notieren|trotzdem sicher|make a note|safe anyway/i);
    }
  });

  it.each([
    ["PGRST002 mit HTTP 503", { code: "PGRST002", message: "Could not query the database for the schema cache. Retrying." }, 503, "PGRST002, HTTP 503"],
    ["HTTP 503 ohne Code", { code: "", message: "Service Unavailable" }, 503, "HTTP 503"],
    ["einen Netzwerkfehler", { code: "", message: "TypeError: Failed to fetch" }, 0, "HTTP 0"],
    ["HTTP 502 vom Gateway", { code: "", message: "Bad Gateway" }, 502, "HTTP 502"],
    ["HTTP 504 vom Gateway", { code: "", message: "Gateway Timeout" }, 504, "HTTP 504"],
  ])("meldet %s nach drei Versuchen als kurz gestörte Verbindung", async (_name, error, status, technik) => {
    rpc.mockResolvedValue({ data: null, error, status });
    const ergebnis = await mitUhr(() => bestaetigePartnertermin("tok", "beratung", "2030-04-02", "10:00"));
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(ergebnis.ok).toBe(false);
    if (ergebnis.ok === false) {
      expect(ergebnis.code).toBe("verbindung");
      expect(ergebnis.grund).toBe(PARTNERTERMIN_FEHLER_TEXTE.de.verbindung);
      expect(ergebnis.technik).toBe(technik);
    }
  });

  // 42883 heißt auch „Operator fehlt“: ein Fehler in der Funktion, keine fehlende Migration.
  it("hält einen fehlenden Operator für einen allgemeinen Fehler", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42883", message: "operator does not exist: text = uuid" }, status: 404 });
    const ergebnis = await bestaetigePartnertermin("tok", "beratung", "2030-04-02", "10:00");
    expect(ergebnis.ok).toBe(false);
    if (ergebnis.ok === false) {
      expect(ergebnis.code).toBe("allgemein");
      expect(ergebnis.technik).toBe("42883, HTTP 404");
    }
  });

  it("hängt an eine lesbare Ablehnung der Datenbank keine technische Kennung", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "Der Termin liegt in der Vergangenheit" }, status: 400 });
    const ergebnis = await bestaetigePartnertermin("tok", "beratung", "2030-04-02", "10:00");
    if (ergebnis.ok === false) expect(ergebnis.technik).toBeUndefined();
  });

  /*
    Christian am 29.09.2026: „Im besten Fall kommt keine Fehlermeldung.“ Eine
    kurze Störung wird still wiederholt, erst die dritte zählt.
  */
  describe("Stille Wiederholung", () => {
    const TERMIN = { datum: "2030-04-02", uhrzeit: "10:00", anlass: "beratung", bezeichnung: "Beratung", dauer_minuten: 60 };
    const STOERUNG = { data: null, error: { code: "PGRST001", message: "Database client error. Retrying the connection." }, status: 503 };

    it("versucht es nach einer Störung still noch einmal und meldet Erfolg", async () => {
      rpc.mockResolvedValueOnce(STOERUNG).mockResolvedValueOnce({ data: TERMIN, error: null, status: 200 });
      const ergebnis = await mitUhr(() => bestaetigePartnertermin("tok", "beratung", "2030-04-02", "10:00", "inv-1"));
      expect(ergebnis.ok).toBe(true);
      expect(rpc).toHaveBeenCalledTimes(2);
      // Beide Versuche mit denselben Angaben, samt Investment.
      expect(rpc.mock.calls[1]).toEqual(rpc.mock.calls[0]);
    });

    it("wartet vor dem zweiten Versuch 0,8 und vor dem dritten 2 Sekunden", async () => {
      vi.useFakeTimers();
      try {
        rpc.mockResolvedValue(STOERUNG);
        const lauf = bestaetigePartnertermin("tok", "beratung", "2030-04-02", "10:00");
        await vi.advanceTimersByTimeAsync(799);
        expect(rpc).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(rpc).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(1999);
        expect(rpc).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(1);
        expect(rpc).toHaveBeenCalledTimes(3);
        await lauf;
      } finally {
        vi.useRealTimers();
      }
    });

    it("zählt auch einen geworfenen Netzabbruch als Störung", async () => {
      rpc.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce({ data: TERMIN, error: null });
      const ergebnis = await mitUhr(() => bestaetigePartnertermin("tok", "beratung", "2030-04-02", "10:00"));
      expect(ergebnis.ok).toBe(true);
    });

    it("wiederholt eine lesbare Ablehnung nicht", async () => {
      rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "Der Termin liegt in der Vergangenheit" }, status: 400 });
      await bestaetigePartnertermin("tok", "beratung", "2030-04-02", "10:00");
      expect(rpc).toHaveBeenCalledTimes(1);
    });

    /*
      Der erste Aufruf kam an, nur die Antwort nicht. Bei einem einmaligen Link
      lehnt die Datenbank den zweiten ab. Steht dort genau dieser Termin, ist
      das der eigene, und die Seite meldet Erfolg statt eines Fehlers.
    */
    it("wertet „bereits ein Termin“ als Erfolg, wenn es genau dieser Termin ist", async () => {
      rpc
        .mockResolvedValueOnce(STOERUNG)
        .mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "Über diesen Link steht bereits ein Termin" }, status: 400 })
        .mockResolvedValueOnce({ data: { berater: { name: "X" }, anlaesse: [], termin: TERMIN }, error: null });
      const ergebnis = await mitUhr(() => bestaetigePartnertermin("tok", "beratung", "2030-04-02", "10:00"));
      expect(ergebnis).toMatchObject({ ok: true, termin: { datum: "2030-04-02", uhrzeit: "10:00", anlass: "beratung" } });
      expect(rpc.mock.calls[2][0]).toBe("partnertermin_zugang");
    });

    it("findet den eigenen Termin auch unter mehreren Gesprächsarten", async () => {
      rpc
        .mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "Über diesen Link steht bereits ein Termin" }, status: 400 })
        .mockResolvedValueOnce({
          data: {
            berater: { name: "X" }, anlaesse: [],
            termin: { ...TERMIN, anlass: "erstgespraech", datum: "2030-04-01" },
            termine: [{ ...TERMIN, anlass: "erstgespraech", datum: "2030-04-01" }, TERMIN],
          },
          error: null,
        });
      const ergebnis = await bestaetigePartnertermin("tok", "beratung", "2030-04-02", "10:00");
      expect(ergebnis).toMatchObject({ ok: true, termin: { anlass: "beratung" } });
    });

    it.each([
      ["eine andere Uhrzeit", { uhrzeit: "11:00" }],
      ["ein anderes Datum", { datum: "2030-04-03" }],
      ["einen anderen Anlass", { anlass: "erstgespraech" }],
    ])("meldet „bereits ein Termin“ bei %s", async (_name, abweichung) => {
      rpc
        .mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "Über diesen Link steht bereits ein Termin" }, status: 400 })
        .mockResolvedValueOnce({ data: { berater: { name: "X" }, anlaesse: [], termin: { ...TERMIN, ...abweichung } }, error: null });
      const ergebnis = await bestaetigePartnertermin("tok", "beratung", "2030-04-02", "10:00");
      expect(ergebnis).toMatchObject({ ok: false, code: "bereitsTermin" });
    });

    it("wiederholt auch das Laden der Seite still", async () => {
      rpc.mockResolvedValueOnce(STOERUNG).mockResolvedValueOnce({ data: { berater: { name: "X" }, anlaesse: [] }, error: null });
      const z = await mitUhr(() => ladePartnerterminMitGrund("tok"));
      expect(z.zugang).not.toBeNull();
    });

    it("nennt beim Laden nach drei Störungen den Grund „verbindung“ samt Code", async () => {
      rpc.mockResolvedValue(STOERUNG);
      const z = await mitUhr(() => ladePartnerterminMitGrund("tok"));
      expect(rpc).toHaveBeenCalledTimes(3);
      expect(z).toEqual({ zugang: null, grund: "verbindung", technik: "PGRST001, HTTP 503" });
    });
  });

  it("fragt ohne Datum oder Uhrzeit gar nicht erst nach", async () => {
    const ergebnis = await bestaetigePartnertermin("tok", "beratung", "", "10:00");
    expect(ergebnis.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("Die Fehlertexte für den Partner", () => {
  it("gibt es für jeden Fall, in beiden Sprachen, ohne Gedankenstrich und per Du", () => {
    const faelle = Object.keys(PARTNERTERMIN_FEHLER_TEXTE.de).sort();
    for (const spr of ["de", "en"] as const) {
      expect(Object.keys(PARTNERTERMIN_FEHLER_TEXTE[spr]).sort()).toEqual(faelle);
      for (const satz of Object.values(PARTNERTERMIN_FEHLER_TEXTE[spr]) as string[]) {
        expect(satz, satz).not.toMatch(/[–—]| - /);
        expect(satz.length).toBeGreaterThan(40);
      }
    }
    expect(Object.values(PARTNERTERMIN_FEHLER_TEXTE.de).join(" ")).not.toMatch(/\b(Sie|Ihr|Ihnen)\b/);
  });

  it("sagt je Fall, wo der Fehler liegt und was zu tun ist", () => {
    const p = PARTNERTERMIN_FEHLER_TEXTE.de;
    expect(p.verbindung).toMatch(/Verbindung.*noch einmal/);
    expect(p.linkUngueltig).toMatch(/abgelaufen.*deaktiviert.*„Meeting“/);
    expect(p.gespraechsart).toMatch(/kein Kalenderlink mit https.*Buchungskalender-Links/);
    expect(p.funktionFehlt).toMatch(/Funktion.*Support/);
    expect(p.allgemein).toMatch(/Support.*Fehlercode/);
    expect(p.zuSchnell).toMatch(/20 Buchungen/);
    expect(p.bereitsTermin).toMatch(/schon ein Termin/);
    expect(p.vergangenheit).toMatch(/Vergangenheit/);
    expect(p.zukunft).toMatch(/Jahr/);
  });
});

describe("Die Adresse der Seite", () => {
  it("zeigt auf /terminwahl mit dem Buchungstoken", () => {
    expect(partnerterminPfad("abc123")).toBe("/terminwahl/abc123");
  });
});
