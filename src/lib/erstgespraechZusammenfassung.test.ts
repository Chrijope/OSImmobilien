import { describe, it, expect } from "vitest";
import {
  baueErstgespraechDetails,
  baueErstgespraechZusammenfassung,
  kuerzeFreitext,
  type DetailSchritt,
  type SkriptEingabe,
  type ZusammenfassungSchritt,
} from "@/lib/erstgespraechZusammenfassung";
import {
  ERSTGESPRAECH_SCHRITTE,
  ERSTGESPRAECH_SCHRITTE_DETAIL,
  FAMILIENSTAND_OPTIONEN,
  waehleMitentscheiderVariante,
} from "@/components/setter/SetterErstgespraechsSkript";

/** Kleine, unabhängige Schrittliste für die Fortschrittsprüfung. */
const SCHRITTE_TEST: ZusammenfassungSchritt[] = [
  { id: "einleitung", fragenSchluessel: [], hatNotiz: false },
  { id: "warmup", fragenSchluessel: [], hatNotiz: true },
  { id: "erfahrung", fragenSchluessel: ["erfahrung"], hatNotiz: false },
  { id: "sparformen", fragenSchluessel: ["sparformen"], hatNotiz: false },
  { id: "berufliche_situation", fragenSchluessel: ["beruf", "arbeitgeber"], hatNotiz: false },
  { id: "ziele", fragenSchluessel: [], hatNotiz: true },
  { id: "offene_fragen", fragenSchluessel: ["offeneFragen"], hatNotiz: false },
];

const VOLL: SkriptEingabe = {
  antworten: {
    beruf: "Angestellter Ingenieur",
    arbeitgeber: "Siemens AG, seit 2019",
    erfahrung: "Noch Neuland, erste Artikel gelesen",
    sparformen: "ETF-Sparplan und Tagesgeld",
    investitionMonat: "300 bis 500 Euro",
    zweiPunkte: "Sicherheit und Steuerersparnis",
    offeneFragen: "Was passiert bei Leerstand?",
    mitentscheider: "Ehefrau Anna, soll dabei sein",
  },
  notizen: {
    warmup: "Gehaltserhöhung im Januar, zweites Kind unterwegs",
    pattern_interrupt: "Will vorher mit der Ehefrau sprechen",
    netto: "3.800 Euro netto, keine laufenden Kredite",
  },
  ziele: ["Altersvorsorge", "Steuern sparen"],
};

describe("baueErstgespraechZusammenfassung", () => {
  it("fasst ein vollständig ausgefülltes Skript in höchstens vier Sätzen zusammen", () => {
    const z = baueErstgespraechZusammenfassung(VOLL, { schritte: SCHRITTE_TEST });

    expect(z.istLeer).toBe(false);
    expect(z.text).toBe(
      "Beruflich: Angestellter Ingenieur (Siemens AG, seit 2019). "
      + "Ziele: Altersvorsorge, Steuern sparen; am wichtigsten: Sicherheit und Steuerersparnis. "
      // Seit dem 27.08.2026 traegt der dritte Satz auch die Einkommens-Notiz.
      + "Monatlich möglich: 300 bis 500 Euro; Sparformen: ETF-Sparplan und Tagesgeld; "
      + "Notiz Einkommen: 3.800 Euro netto, keine laufenden Kredite. "
      + "Offen: Was passiert bei Leerstand?; Einwände: Will vorher mit der Ehefrau sprechen.",
    );
    // Vier Sätze, nicht mehr.
    expect(z.text.split(". ").length).toBeLessThanOrEqual(4);
  });

  it("zählt nur Schritte mit Eingabefeld als beantwortbar", () => {
    const z = baueErstgespraechZusammenfassung(VOLL, { schritte: SCHRITTE_TEST });
    // einleitung hat kein Feld und fällt aus dem Nenner.
    expect(z.schritteGesamt).toBe(6);
    expect(z.beantworteteSchritte).toBe(6);
    expect(z.fortschritt).toBe("6 von 6 Schritten beantwortet");
  });

  it("kommt mit einem halb ausgefüllten Skript zurecht und lässt Lücken weg", () => {
    const z = baueErstgespraechZusammenfassung(
      {
        antworten: { beruf: "Beamtin", investitionMonat: "400 Euro" },
        notizen: { warmup: "Erbe erhalten" },
        ziele: [],
      },
      { schritte: SCHRITTE_TEST },
    );

    expect(z.text).toBe("Beruflich: Beamtin. Monatlich möglich: 400 Euro. Auslöser: Erbe erhalten.");
    expect(z.text).not.toContain("undefined");
    expect(z.text).not.toContain("Ziele:");
    expect(z.text).not.toContain("Sparformen:");
    expect(z.fortschritt).toBe("2 von 6 Schritten beantwortet");
  });

  it("nimmt die nachrangigen Sätze nur auf, wenn vorne Platz bleibt", () => {
    const z = baueErstgespraechZusammenfassung(
      { antworten: { erfahrung: "Zwei Wohnungen im Bestand" } },
      { schritte: SCHRITTE_TEST },
    );
    expect(z.text).toBe("Immobilien-Erfahrung: Zwei Wohnungen im Bestand.");
    expect(z.beantworteteSchritte).toBe(1);
  });

  it("liefert bei leerem Skript nichts und meldet istLeer", () => {
    for (const leer of [undefined, null, {}, { antworten: {}, notizen: {}, ziele: [] }]) {
      const z = baueErstgespraechZusammenfassung(leer as SkriptEingabe, { schritte: SCHRITTE_TEST });
      expect(z.text).toBe("");
      expect(z.istLeer).toBe(true);
      expect(z.beantworteteSchritte).toBe(0);
      expect(z.fortschritt).toBe("0 von 6 Schritten beantwortet");
    }
  });

  it("behandelt Antworten aus reinen Leerzeichen wie fehlende Antworten", () => {
    const z = baueErstgespraechZusammenfassung(
      {
        antworten: { beruf: "   ", arbeitgeber: "\n\t ", offeneFragen: "  " },
        notizen: { warmup: " " },
        ziele: ["  ", ""],
      },
      { schritte: SCHRITTE_TEST },
    );
    expect(z.text).toBe("");
    expect(z.istLeer).toBe(true);
    expect(z.beantworteteSchritte).toBe(0);
  });

  it("kürzt lange Freitexte an einer Satzgrenze statt mitten im Wort", () => {
    const lang = "Er hat schon zwei Eigentumswohnungen gekauft und wieder verkauft. "
      + "Danach kam eine lange Pause, weil die Zinsen gestiegen sind und die Bank abgesagt hat, "
      + "und jetzt möchte er es noch einmal versuchen.";
    const z = baueErstgespraechZusammenfassung(
      { antworten: { erfahrung: lang } },
      { schritte: SCHRITTE_TEST },
    );
    expect(z.text).toBe("Immobilien-Erfahrung: Er hat schon zwei Eigentumswohnungen gekauft und wieder verkauft.");
  });

  it("trennt ohne Satzgrenze an der Wortgrenze und hängt Auslassungspunkte an", () => {
    const lang = "ETF-Sparplan, Tagesgeld, Bausparvertrag, Aktien, Festgeld, Gold, "
      + "Lebensversicherung, Riester, Rürup, Betriebsrente und noch ein Depot bei der Hausbank";
    const z = baueErstgespraechZusammenfassung(
      { antworten: { sparformen: lang } },
      { schritte: SCHRITTE_TEST },
    );
    expect(z.text.startsWith("Sparformen: ETF-Sparplan, Tagesgeld,")).toBe(true);
    expect(z.text.endsWith("….")).toBe(false);
    expect(z.text.endsWith("…")).toBe(true);
    // Kein abgeschnittenes Wort am Ende: der übernommene Teil endet im
    // Original an einer Wortgrenze.
    const kern = z.text.slice("Sparformen: ".length, -1);
    expect(lang.startsWith(kern)).toBe(true);
    // Direkt hinter dem Schnitt steht kein Buchstabe, das Wort ist also ganz.
    expect(lang.slice(kern.length, kern.length + 1)).not.toMatch(/\p{L}/u);
  });

  it("hält die Gesamtlänge ein und lässt dafür hintere Sätze weg", () => {
    const z = baueErstgespraechZusammenfassung(VOLL, {
      schritte: SCHRITTE_TEST,
      maxGesamtZeichen: 120,
    });
    expect(z.text.length).toBeLessThanOrEqual(160);
    expect(z.text.startsWith("Beruflich: Angestellter Ingenieur")).toBe(true);
    expect(z.text).not.toContain("Offen:");
  });

  it("gibt auch bei sehr kleiner Gesamtlänge mindestens den ersten Satz aus", () => {
    const z = baueErstgespraechZusammenfassung(VOLL, { maxGesamtZeichen: 5 });
    expect(z.text).toBe("Beruflich: Angestellter Ingenieur (Siemens AG, seit 2019).");
  });

  it("verträgt Sonderzeichen und Zeilenumbrüche im Freitext", () => {
    const z = baueErstgespraechZusammenfassung(
      {
        antworten: {
          beruf: "Selbstständig  <IT>\n& \"Berater\"",
          offeneFragen: "Wie viel kostet das?\n\nUnd was ist mit § 23 EStG?",
        },
        ziele: ["Steuern sparen "],
      },
      { schritte: SCHRITTE_TEST },
    );
    expect(z.text).toBe(
      "Beruflich: Selbstständig <IT> & \"Berater\". "
      + "Ziele: Steuern sparen. "
      + "Offen: Wie viel kostet das? Und was ist mit § 23 EStG?",
    );
    expect(z.text).not.toContain("\n");
  });

  it("ignoriert Werte, die keine Zeichenketten sind", () => {
    const kaputt = {
      antworten: { beruf: 42, arbeitgeber: null, offeneFragen: { a: 1 } },
      notizen: "keine Zuordnung",
      ziele: "Altersvorsorge",
    } as unknown as SkriptEingabe;
    const z = baueErstgespraechZusammenfassung(kaputt, { schritte: SCHRITTE_TEST });
    expect(z.text).toBe("");
    expect(z.istLeer).toBe(true);
  });

  it("lässt den Fortschritt weg, wenn keine Schrittliste übergeben wird", () => {
    const z = baueErstgespraechZusammenfassung(VOLL);
    expect(z.fortschritt).toBe("");
    expect(z.schritteGesamt).toBe(0);
    expect(z.text.length).toBeGreaterThan(0);
    expect(z.istLeer).toBe(false);
  });
});

describe("kuerzeFreitext", () => {
  it("lässt kurze Texte unverändert", () => {
    expect(kuerzeFreitext("Kurz und knapp", 100)).toBe("Kurz und knapp");
  });

  it("zieht Mehrfach-Leerzeichen und Umbrüche zusammen", () => {
    expect(kuerzeFreitext("  a \n\n b   c ", 100)).toBe("a b c");
  });

  it("trennt ein einzelnes sehr langes Wort hart, aber mit Auslassungspunkten", () => {
    const wort = "A".repeat(60);
    expect(kuerzeFreitext(wort, 10)).toBe("AAAAAAAAAA…");
  });

  it("liefert bei Länge null nichts", () => {
    expect(kuerzeFreitext("egal", 0)).toBe("");
  });
});

describe("ERSTGESPRAECH_SCHRITTE", () => {
  it("bildet die Schritte des echten Skripts ab", () => {
    expect(ERSTGESPRAECH_SCHRITTE.length).toBeGreaterThan(20);
    const ids = ERSTGESPRAECH_SCHRITTE.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("enthält alle Antwortschlüssel, die in die Kurzfassung einfließen", () => {
    const schluessel = new Set(ERSTGESPRAECH_SCHRITTE.flatMap(s => s.fragenSchluessel));
    for (const k of ["beruf", "arbeitgeber", "sparformen", "zweiPunkte", "investitionMonat", "offeneFragen", "erfahrung"]) {
      expect(schluessel.has(k)).toBe(true);
    }
  });

  it("kennt die Schritte, deren Notizen verwendet werden", () => {
    const mitNotiz = ERSTGESPRAECH_SCHRITTE.filter(s => s.hatNotiz).map(s => s.id);
    expect(mitNotiz).toContain("warmup");
    expect(mitNotiz).toContain("pattern_interrupt");
    expect(mitNotiz).toContain("ziele");
    // Brückenfrage 4a (Familiäre Situation) trägt ein eigenes Notizfeld.
    expect(mitNotiz).toContain("familiaere_situation");
  });

  it("führt den gestrichenen Vorabschluss nicht mehr als Schritt", () => {
    expect(ERSTGESPRAECH_SCHRITTE.map(s => s.id)).not.toContain("vorabschluss");
  });

  it("liefert mit dem echten Skript eine sinnvolle Fortschrittsangabe", () => {
    const z = baueErstgespraechZusammenfassung(VOLL, { schritte: ERSTGESPRAECH_SCHRITTE });
    // Weiterhin 17: Brückenfrage 4a kam hinzu, der Vorabschluss entfiel.
    expect(z.schritteGesamt).toBe(17);
    // beruf/arbeitgeber, erfahrung, sparformen, investitionMonat, zweiPunkte,
    // offeneFragen, mitentscheider, warmup, pattern_interrupt, netto, ziele
    expect(z.beantworteteSchritte).toBe(11);
    expect(z.fortschritt).toBe("11 von 17 Schritten beantwortet");
  });
});

/** Kleine Schrittliste für die ausführliche Fassung. */
const DETAIL_TEST: DetailSchritt[] = [
  { id: "einleitung", nr: 1, titel: "Einleitung", felder: [], hatNotiz: false },
  { id: "warmup", nr: 2, titel: "Warm-up", felder: [], hatNotiz: true },
  {
    id: "berufliche_situation", nr: 3, titel: "Berufliche Situation", hatNotiz: false,
    felder: [
      { key: "beruf", label: "Was machen Sie beruflich?" },
      { key: "arbeitgeber", label: "Arbeitgeber & seit wann?" },
    ],
  },
  { id: "ziele", nr: 4, titel: "Ziele", felder: [], hatNotiz: true },
  {
    id: "cashflow_erwartung", nr: 5, titel: "Erwartungsrahmen", hatNotiz: false,
    felder: [{
      key: "cashflowPraeferenz",
      label: "Erwartung",
      werte: { qualitaet: "Qualität — Top-Lage" },
    }],
  },
];

describe("baueErstgespraechDetails", () => {
  it("gibt Frage und Antwort in der Reihenfolge des Skripts aus", () => {
    const abschnitte = baueErstgespraechDetails(VOLL, DETAIL_TEST);
    expect(abschnitte.map(a => a.id)).toEqual(["warmup", "berufliche_situation", "ziele"]);

    const beruf = abschnitte.find(a => a.id === "berufliche_situation");
    expect(beruf?.eintraege).toEqual([
      { frage: "Was machen Sie beruflich?", antwort: "Angestellter Ingenieur" },
      { frage: "Arbeitgeber & seit wann?", antwort: "Siemens AG, seit 2019" },
    ]);
  });

  it("nimmt die Zielauswahl als eigene Zeile auf und hängt die Notiz hinten an", () => {
    const abschnitte = baueErstgespraechDetails(
      { ...VOLL, notizen: { ...VOLL.notizen, ziele: "Will in zehn Jahren mietfrei wohnen" } },
      DETAIL_TEST,
    );
    const ziele = abschnitte.find(a => a.id === "ziele");
    expect(ziele?.eintraege).toEqual([
      { frage: "Ziele", antwort: "Altersvorsorge, Steuern sparen" },
      { frage: "Notiz", antwort: "Will in zehn Jahren mietfrei wohnen" },
    ]);
  });

  it("übersetzt kodierte Werte in Klartext", () => {
    const abschnitte = baueErstgespraechDetails(
      { antworten: { cashflowPraeferenz: "qualitaet" } },
      DETAIL_TEST,
    );
    expect(abschnitte).toEqual([{
      id: "cashflow_erwartung", nr: 5, titel: "Erwartungsrahmen",
      eintraege: [{ frage: "Erwartung", antwort: "Qualität — Top-Lage" }],
    }]);
  });

  it("lässt leere Antworten und leere Schritte weg", () => {
    const abschnitte = baueErstgespraechDetails(
      { antworten: { beruf: "Beamtin", arbeitgeber: "   " }, notizen: { warmup: " " }, ziele: [] },
      DETAIL_TEST,
    );
    expect(abschnitte).toEqual([{
      id: "berufliche_situation", nr: 3, titel: "Berufliche Situation",
      eintraege: [{ frage: "Was machen Sie beruflich?", antwort: "Beamtin" }],
    }]);
  });

  it("liefert bei leerem oder kaputtem Stand nichts", () => {
    for (const leer of [undefined, null, {}, { antworten: 5, notizen: "x", ziele: 1 }]) {
      expect(baueErstgespraechDetails(leer as SkriptEingabe, DETAIL_TEST)).toEqual([]);
    }
  });
});

describe("ERSTGESPRAECH_SCHRITTE_DETAIL", () => {
  it("beschriftet jedes Feld des echten Skripts", () => {
    expect(ERSTGESPRAECH_SCHRITTE_DETAIL.length).toBe(ERSTGESPRAECH_SCHRITTE.length);
    for (const s of ERSTGESPRAECH_SCHRITTE_DETAIL) {
      expect(s.titel.length).toBeGreaterThan(0);
      for (const f of s.felder) expect(f.label.length).toBeGreaterThan(0);
    }
  });

  it("kennt auch die Felder aus den Sonderblöcken", () => {
    const schluessel = new Set(ERSTGESPRAECH_SCHRITTE_DETAIL.flatMap(s => s.felder.map(f => f.key)));
    expect(schluessel.has("verbindlichkeitSkala")).toBe(true);
    expect(schluessel.has("cashflowPraeferenz")).toBe(true);
    expect(schluessel.has("familienstand")).toBe(true);
  });

  it("führt die Brückenfrage als 4a und reicht die Anzeige-Nummer durch", () => {
    const schritt = ERSTGESPRAECH_SCHRITTE_DETAIL.find(s => s.id === "familiaere_situation");
    expect(schritt?.nrText).toBe("4a");

    const abschnitte = baueErstgespraechDetails(
      { antworten: { familienstand: "verheiratet" }, notizen: { familiaere_situation: "Frau arbeitet Teilzeit" } },
      ERSTGESPRAECH_SCHRITTE_DETAIL,
    );
    const abschnitt = abschnitte.find(a => a.id === "familiaere_situation");
    expect(abschnitt?.nrText).toBe("4a");
    expect(abschnitt?.eintraege).toEqual([
      { frage: "Familiäre Situation", antwort: "verheiratet" },
      { frage: "Notiz", antwort: "Frau arbeitet Teilzeit" },
    ]);
  });

  it("erzeugt mit dem echten Skript lesbare Abschnitte", () => {
    const abschnitte = baueErstgespraechDetails(VOLL, ERSTGESPRAECH_SCHRITTE_DETAIL);
    const ids = abschnitte.map(a => a.id);
    expect(ids).toContain("warmup");
    expect(ids).toContain("berufliche_situation");
    expect(ids).toContain("ziele");
    expect(ids).toContain("pattern_interrupt");
    // Nichts Leeres im Ergebnis.
    for (const a of abschnitte) {
      expect(a.eintraege.length).toBeGreaterThan(0);
      for (const e of a.eintraege) expect(e.antwort.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("waehleMitentscheiderVariante", () => {
  it("liefert bei verheiratet den Ehepartner-Text mit beiden Partnern", () => {
    const v = waehleMitentscheiderVariante("verheiratet");
    expect(v).toBeDefined();
    const du = typeof v?.text === "string" ? v.text : v?.text.du || "";
    expect(du).toContain("verheiratet");
    expect(du).toContain("beide Partner");
    expect(du).toContain("Beratungsgespräch");
  });

  it("liefert bei Partnerschaft den Partner-Text", () => {
    const v = waehleMitentscheiderVariante("in Partnerschaft");
    expect(v).toBeDefined();
    const du = typeof v?.text === "string" ? v.text : v?.text.du || "";
    expect(du).toContain("Partnerin");
    expect(du).toContain("Beratungsgespräch");
  });

  it("liefert bei ledig, geschieden und verwitwet den Allein-Text mit offener Rückfrage", () => {
    for (const stand of ["ledig", "geschieden", "verwitwet"]) {
      const v = waehleMitentscheiderVariante(stand);
      expect(v).toBeDefined();
      const du = typeof v?.text === "string" ? v.text : v?.text.du || "";
      expect(du).toContain("Eltern");
      expect(du).toContain("Steuerberater");
    }
  });

  it("liefert ohne Antwort oder bei unbekanntem Wert nichts, der neutrale Grundtext bleibt", () => {
    for (const stand of [undefined, "", "   ", "unbekannt"]) {
      expect(waehleMitentscheiderVariante(stand)).toBeUndefined();
    }
  });

  it("deckt jeden Auswahlwert der Brückenfrage mit einer Variante ab", () => {
    for (const stand of FAMILIENSTAND_OPTIONEN) {
      expect(waehleMitentscheiderVariante(stand)).toBeDefined();
    }
  });
});

/**
 * Der Vollständigkeits-Wächter über die ausführliche Zusammenfassung.
 *
 * Christian hat am 21.09.2026 beim Rückbau des Wizards ausdrücklich verlangt,
 * dass jedes Text- und Notizfeld des Skripts auch wirklich verarbeitet wird und
 * nichts still liegen bleibt. Die Tests darüber prüfen einzelne Fälle; dieser
 * hier baut ein Gespräch, in dem JEDE Eingabemöglichkeit gefüllt ist, und
 * verlangt, dass jede einzelne wieder auftaucht.
 *
 * Kommt ein Feld ins Skript, ohne dass es hier ankommt, fällt der Test mit dem
 * Namen des Feldes rot. Genau dieser Fall wäre sonst unsichtbar: Die
 * Oberfläche zeigt das Feld, der Setter füllt es aus, und im Beratungsgespräch
 * fehlt es.
 */
describe("Jede Eingabe des Skripts wird verarbeitet", () => {
  /** Ein Gespräch, in dem jedes Feld und jede Notiz einen erkennbaren Wert trägt. */
  function vollstaendigesGespraech() {
    const antworten: Record<string, string> = {};
    const notizen: Record<string, string> = {};
    for (const s of ERSTGESPRAECH_SCHRITTE_DETAIL) {
      for (const f of s.felder) {
        // Kodierte Felder brauchen einen gültigen Schlüssel, sonst käme der
        // Klartext nicht zustande und der Vergleich liefe ins Leere.
        antworten[f.key] = f.werte ? Object.keys(f.werte)[0] : `Wert-${f.key}`;
      }
      if (s.hatNotiz) notizen[s.id] = `Notiz-${s.id}`;
    }
    return {
      eingabe: {
        antworten,
        notizen,
        ziele: ["Altersvorsorge", "Steuern sparen"],
        qualEinkommen: "3.800 Euro",
        qualEigenkapital: "45.000 Euro",
      } as SkriptEingabe,
      antworten,
      notizen,
    };
  }

  it("bringt jedes Eingabefeld in die ausführliche Fassung", () => {
    const { eingabe, antworten } = vollstaendigesGespraech();
    const abschnitte = baueErstgespraechDetails(eingabe, ERSTGESPRAECH_SCHRITTE_DETAIL);
    const alleAntworten = abschnitte.flatMap((a) => a.eintraege.map((e) => e.antwort)).join(" | ");

    for (const s of ERSTGESPRAECH_SCHRITTE_DETAIL) {
      for (const f of s.felder) {
        const erwartet = f.werte ? f.werte[antworten[f.key]] : antworten[f.key];
        expect(alleAntworten, `Feld „${f.key}" aus Punkt ${s.nrText ?? s.nr}`).toContain(erwartet);
      }
    }
  });

  it("bringt jedes Notizfeld in die ausführliche Fassung", () => {
    const { eingabe, notizen } = vollstaendigesGespraech();
    const abschnitte = baueErstgespraechDetails(eingabe, ERSTGESPRAECH_SCHRITTE_DETAIL);
    const alleAntworten = abschnitte.flatMap((a) => a.eintraege.map((e) => e.antwort)).join(" | ");

    for (const [id, text] of Object.entries(notizen)) {
      expect(alleAntworten, `Notiz aus Punkt „${id}"`).toContain(text);
    }
  });

  it("bringt die drei Werte mit, die nicht in den Antworten stehen", () => {
    /*
      Ziele kommen aus der Kachelauswahl, Netto und Eigenkapital direkt aus den
      Qualifizierungsfeldern des Kontakts. Alle drei würden fehlen, wenn man nur
      über die Feldliste läuft.
    */
    const { eingabe } = vollstaendigesGespraech();
    const abschnitte = baueErstgespraechDetails(eingabe, ERSTGESPRAECH_SCHRITTE_DETAIL);
    const alles = abschnitte.flatMap((a) => a.eintraege.map((e) => `${e.frage}: ${e.antwort}`)).join(" | ");

    expect(alles).toContain("Altersvorsorge, Steuern sparen");
    expect(alles).toContain("3.800 Euro");
    expect(alles).toContain("45.000 Euro");
  });

  it("gibt jeden Punkt mit Eingabe als eigenen Abschnitt aus", () => {
    const { eingabe } = vollstaendigesGespraech();
    const abschnitte = baueErstgespraechDetails(eingabe, ERSTGESPRAECH_SCHRITTE_DETAIL);

    const mitEingabe = ERSTGESPRAECH_SCHRITTE_DETAIL.filter((s) => s.felder.length > 0 || s.hatNotiz);
    expect(abschnitte.map((a) => a.id).sort()).toEqual(mitEingabe.map((s) => s.id).sort());
  });
});
