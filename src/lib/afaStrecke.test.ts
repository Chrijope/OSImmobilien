/**
 * Die Regeln der AfA-Strecke: welche Frage wann, welche entfaellt, und was
 * beim Rechenkern ankommt.
 *
 * Die Rechnung selbst ist hier nicht Gegenstand, die haengt an
 * `afaRechnung.test.ts`. Hier geht es um die Uebersetzung dorthin.
 */
import { describe, expect, it } from "vitest";
import {
  ALLE_SCHRITTE,
  ANGABE_IM_SCHRITT,
  RECHNUNG_AUS_ANGABE,
  fragtNachKernsanierung,
  modernisierungWirkt,
  nebenkosten,
  nebenkostensatz,
  quadratmeterpreis,
  schritte,
  schrittBeantwortet,
  standardAntworten,
  streckeVollstaendig,
  zuEingaben,
  type AfaAntworten,
} from "@/lib/afaStrecke";
import { MOD_ELEMENTE } from "@/lib/restnutzungsdauer";

const antworten = (teil: Partial<AfaAntworten> = {}): AfaAntworten => ({
  ...standardAntworten(),
  ...teil,
});

/** Ein Bestandsgebaeude, alt genug, dass die Modernisierung wirkt. */
const altbau = (teil: Partial<AfaAntworten> = {}): AfaAntworten =>
  antworten({ gebaeudeart: "bestand", baujahr: 1985, kaufpreis: 300000, ...teil });

describe("Reihenfolge der Fragen", () => {
  it("fuehrt beim Altbau durch alle sieben Schritte", () => {
    expect(schritte(altbau())).toEqual([
      "objekt",
      "preis",
      "lage",
      "grundstueck",
      "sanierung",
      "modernisierung",
      "gutachten",
    ]);
  });

  it("laesst beim Neubau Sanierung und Modernisierung weg", () => {
    const s = schritte(antworten({ gebaeudeart: "neubau", baujahr: new Date().getFullYear() }));
    expect(s).toEqual(["objekt", "preis", "lage", "grundstueck", "gutachten"]);
    expect(s).toHaveLength(5);
  });

  it("fragt nach der Modernisierung nur dort, wo sie die Restnutzungsdauer aendert", () => {
    const jetzt = new Date().getFullYear();
    // Kein Baujahr, kein Gebaeudealter, keine Schwelle.
    expect(modernisierungWirkt(antworten({ gebaeudeart: "bestand" }))).toBe(false);
    // Junges Gebaeude: unter zehn Prozent relativem Alter wirkt keine
    // Punktezeile der Tabelle 3, es gilt Gesamtnutzungsdauer minus Alter.
    expect(modernisierungWirkt(altbau({ baujahr: jetzt - 5 }))).toBe(false);
    expect(modernisierungWirkt(altbau({ baujahr: jetzt - 8 }))).toBe(true);
    // Frische Kernsanierung hebt die Punkte ohnehin auf das Hoechstmass.
    expect(modernisierungWirkt(altbau({ kernsaniert: true, kernsanierungJahr: jetzt - 1 }))).toBe(false);
    // Eine alte Kernsanierung tut das nicht, die Einzelangaben zaehlen wieder.
    expect(modernisierungWirkt(altbau({ kernsaniert: true, kernsanierungJahr: jetzt - 25 }))).toBe(true);
    expect(modernisierungWirkt(antworten({ gebaeudeart: "neubau", baujahr: 1985 }))).toBe(false);
  });

  it("fragt bei Bestand und Denkmal nach der Kernsanierung, beim Neubau nicht", () => {
    expect(fragtNachKernsanierung(antworten({ gebaeudeart: "bestand" }))).toBe(true);
    expect(fragtNachKernsanierung(antworten({ gebaeudeart: "denkmal" }))).toBe(true);
    expect(fragtNachKernsanierung(antworten({ gebaeudeart: "neubau" }))).toBe(false);
  });
});

describe("Wann darf es weitergehen", () => {
  it("verlangt im ersten Schritt Gebaeudeart und Baujahr", () => {
    expect(schrittBeantwortet("objekt", antworten())).toBe(false);
    expect(schrittBeantwortet("objekt", antworten({ gebaeudeart: "bestand" }))).toBe(false);
    expect(schrittBeantwortet("objekt", antworten({ gebaeudeart: "bestand", baujahr: 1985 }))).toBe(true);
  });

  it("verlangt einen Kaufpreis groesser null", () => {
    expect(schrittBeantwortet("preis", antworten())).toBe(false);
    expect(schrittBeantwortet("preis", antworten({ kaufpreis: 300000 }))).toBe(true);
  });

  it("laesst die Lage offen, denn unbekannt ist eine gueltige Antwort", () => {
    expect(schrittBeantwortet("lage", antworten({ bundesland: "andere" }))).toBe(true);
  });

  it("verlangt einen Grundstuecksanteil groesser null", () => {
    expect(schrittBeantwortet("grundstueck", antworten({ bodenAnteilPct: 0 }))).toBe(false);
    expect(schrittBeantwortet("grundstueck", antworten())).toBe(true);
  });

  it("laesst Nein zur Kernsanierung durch, Ja nur mit Jahr", () => {
    expect(schrittBeantwortet("sanierung", antworten({ kernsaniert: false }))).toBe(true);
    expect(schrittBeantwortet("sanierung", antworten({ kernsaniert: true }))).toBe(false);
    expect(schrittBeantwortet("sanierung", antworten({ kernsaniert: true, kernsanierungJahr: 2020 }))).toBe(true);
  });

  it("laesst Nein zum Gutachten durch, Ja nur mit einem der beiden Werte", () => {
    expect(schrittBeantwortet("gutachten", antworten({ gutachtenVorhanden: false }))).toBe(true);
    expect(schrittBeantwortet("gutachten", antworten({ gutachtenVorhanden: true }))).toBe(false);
    expect(schrittBeantwortet("gutachten", antworten({ gutachtenVorhanden: true, rndManuell: 17 }))).toBe(true);
    expect(schrittBeantwortet("gutachten", antworten({ gutachtenVorhanden: true, afaSatzManuell: 5.88 }))).toBe(true);
  });

  it("nennt die Strecke erst vollstaendig, wenn jeder Schritt beantwortet ist", () => {
    expect(streckeVollstaendig(antworten())).toBe(false);
    expect(
      streckeVollstaendig(antworten({ gebaeudeart: "bestand", baujahr: 1985, kaufpreis: 300000 })),
    ).toBe(true);
  });
});

describe("Nebenkosten", () => {
  it("nimmt den Satz des Bundeslands, solange kein eigener gesetzt ist", () => {
    const a = antworten({ bundesland: "nrw", kaufpreis: 300000 });
    expect(nebenkostensatz(a)).toBe(8.5);
    expect(nebenkosten(a)).toBe(25500);
  });

  it("laesst den eigenen Satz vorgehen", () => {
    const a = antworten({ bundesland: "nrw", kaufpreis: 300000, nebenkostenPct: 11.07 });
    expect(nebenkostensatz(a)).toBe(11.07);
    expect(nebenkosten(a)).toBe(33210);
  });

  it("laesst einen von Hand eingetragenen Betrag allem vorgehen", () => {
    const a = antworten({ bundesland: "nrw", kaufpreis: 300000, nebenkostenPct: 11.07, nebenkostenManuell: 30000 });
    expect(nebenkosten(a)).toBe(30000);
  });

  it("steht ohne Bundesland bei null, statt etwas zu erfinden", () => {
    const a = antworten({ bundesland: "andere", kaufpreis: 300000 });
    expect(nebenkostensatz(a)).toBe(0);
    expect(nebenkosten(a)).toBe(0);
  });
});

describe("Quadratmeterpreis", () => {
  it("rechnet ihn aus Kaufpreis und Wohnflaeche", () => {
    expect(quadratmeterpreis(antworten({ kaufpreis: 300000, wohnflaeche: 60 }))).toBe(5000);
  });

  it("bleibt ohne Wohnflaeche bei null, statt durch null zu teilen", () => {
    expect(quadratmeterpreis(antworten({ kaufpreis: 300000, wohnflaeche: 0 }))).toBe(0);
  });
});

describe("Uebersetzung in den Rechenkern", () => {
  it("reicht die Antworten unveraendert weiter", () => {
    const a = antworten({
      gebaeudeart: "bestand",
      objektart: "Mehrfamilienhaus",
      baujahr: 1985,
      kaufpreis: 300000,
      bundesland: "nrw",
      bodenAnteilPct: 25,
      erhaltungsaufwand: 20000,
      kernsaniert: true,
      kernsanierungJahr: 2018,
    });
    expect(zuEingaben(a)).toMatchObject({
      objektart: "Mehrfamilienhaus",
      kaufpreis: 300000,
      nebenkosten: 25500,
      bodenAnteilPct: 25,
      sanierungskosten: 20000,
      baujahr: 1985,
      kernsanierungAktiv: true,
      kernsanierungJahr: 2018,
      afaModus: "berechnen",
    });
  });

  it("schaltet auf den Gutachtenmodus um, sobald ein Gutachten vorliegt", () => {
    expect(zuEingaben(antworten({ gutachtenVorhanden: true, rndManuell: 17 })).afaModus).toBe("gutachten");
    expect(zuEingaben(antworten({ gutachtenVorhanden: false })).afaModus).toBe("berechnen");
  });

  it("uebersetzt eine alte Objektart-Bezeichnung mit", () => {
    expect(zuEingaben(antworten({ objektart: "Mietwohngrundstück" })).objektart).toBe("Mehrfamilienhaus");
  });
});

describe("Vorbelegung aus einem Objekt", () => {
  it("uebernimmt Kaufpreis, Baujahr, Wohnflaeche, Erhaltungsaufwand und Bundesland", () => {
    const a = standardAntworten({
      kaufpreis: 250000,
      baujahr: 1998,
      wohnflaeche: 62.456,
      erhaltungsaufwand: 12000,
      bundesland: "bayern",
    });
    expect(a.kaufpreis).toBe(250000);
    expect(a.baujahr).toBe(1998);
    // Auf zwei Nachkommastellen gerundet, wie in der bisherigen Maske.
    expect(a.wohnflaeche).toBe(62.46);
    expect(a.erhaltungsaufwand).toBe(12000);
    expect(a.bundesland).toBe("bayern");
    // Die erste Frage bleibt bewusst unbeantwortet, sie steuert den Weg.
    expect(a.gebaeudeart).toBeNull();
  });

  it("startet ohne Vorbelegung leer und mit 20 Prozent Grundstuecksanteil", () => {
    const a = standardAntworten();
    expect(a.kaufpreis).toBe(0);
    expect(a.baujahr).toBe(0);
    expect(a.bodenAnteilPct).toBe(20);
    expect(a.bundesland).toBe("andere");
    expect(a.miteigentumsanteil).toBe(1000);
    expect(a.modernisiert).toBe(false);
  });

  it("uebernimmt die Anschrift, wenn ein Objekt sie mitgibt", () => {
    const a = standardAntworten({ strasse: "Hauptstraße", hausnummer: "12a", plz: "90402", ort: "Nürnberg" });
    expect(a.strasse).toBe("Hauptstraße");
    expect(a.hausnummer).toBe("12a");
    expect(a.plz).toBe("90402");
    expect(a.ort).toBe("Nürnberg");
  });
});

/* ── Der Waechter gegen stillschweigend verschwundene Felder ────────────── */

/**
 * Vorgeschichte: Beim Umbau von der Maske auf die Strecke sind die acht
 * Modernisierungselemente aus den Fragen verschwunden und nur noch auf der
 * Ergebnisseite gelandet. Gerechnet wurde weiter mit ihnen, gefragt nicht mehr.
 * Wer nichts eintrug, bekam ohne Warnung das Ergebnis fuer ein unmodernisiertes
 * Gebaeude. Diese Tests sollen genau das kuenftig auffallen lassen.
 */
describe("Jede Angabe der Rechnung wird auch gefragt", () => {
  it("nennt zu jeder Antwort einen Schritt, den es wirklich gibt", () => {
    for (const [angabe, schritt] of Object.entries(ANGABE_IM_SCHRITT)) {
      const gueltig = schritt === "ergebnis" || ALLE_SCHRITTE.includes(schritt);
      expect(gueltig, `${angabe} verweist auf den unbekannten Schritt ${schritt}`).toBe(true);
    }
  });

  it("hat zu jeder Antwort einen Eintrag, auch zu einer neu hinzugekommenen", () => {
    // Der Uebersetzer erzwingt die Vollstaendigkeit schon ueber den
    // Record-Typ. Hier zaehlt die andere Richtung: kein Eintrag zu viel.
    const bekannt = Object.keys(standardAntworten()).sort();
    expect(Object.keys(ANGABE_IM_SCHRITT).sort()).toEqual(bekannt);
  });

  it("fragt jede Eingabe des Rechenkerns in einem Schritt der Strecke ab", () => {
    // Ein Bestandsgebaeude mit Gutachten: In dieser Lage ist jeder Schritt der
    // Strecke sichtbar, also muss auch jede Angabe erreichbar sein.
    const sichtbar = schritte(altbau({ gutachtenVorhanden: true, rndManuell: 17 }));
    for (const [eingabe, angaben] of Object.entries(RECHNUNG_AUS_ANGABE)) {
      for (const angabe of angaben) {
        const schritt = ANGABE_IM_SCHRITT[angabe];
        expect(
          schritt,
          `${eingabe} haengt an ${angabe}, und das steht nur auf der Ergebnisseite`,
        ).not.toBe("ergebnis");
        expect(sichtbar, `${eingabe} haengt an ${angabe} aus dem Schritt ${schritt}`).toContain(schritt);
      }
    }
  });

  it("erreicht die acht Modernisierungselemente ueber den Schritt zur Modernisierung", () => {
    expect(ANGABE_IM_SCHRITT.modZeitraeume).toBe("modernisierung");
    expect(ANGABE_IM_SCHRITT.modernisiert).toBe("modernisierung");
    expect(schritte(altbau())).toContain("modernisierung");
    // Alle acht Elemente sind in der Voreinstellung enthalten, es fehlt keines.
    expect(Object.keys(standardAntworten().modZeitraeume).sort()).toEqual(MOD_ELEMENTE.map((e) => e.key).sort());
  });

  it("rechnet ohne den Schalter genauso wie vor dem Einbau der Frage", () => {
    // Der Startwert bleibt der alte: Ohne Zutun aendert sich am Ergebnis
    // nichts, auch wenn im Hintergrund schon Zeitraeume eingetragen waren.
    const ohne = zuEingaben(altbau({ modernisiert: false, modZeitraeume: { dach: "unter5" } }));
    expect(ohne.modZeitraeume).toEqual(standardAntworten().modZeitraeume);
    const mit = zuEingaben(altbau({ modernisiert: true, modZeitraeume: { dach: "unter5" } }));
    expect(mit.modZeitraeume).toEqual({ dach: "unter5" });
  });
});
