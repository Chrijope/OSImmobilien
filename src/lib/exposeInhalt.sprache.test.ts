import { describe, it, expect } from "vitest";
import { gedankenstrichFrei, textdateiLuecken } from "@/lib/seitenSprache";
import { EXPOSE_INHALT_TEXTE, KATALOGWERTE_EN, RECHTLICHE_HINWEISE_VORRANG_EN, zahlenAufEnglisch } from "@/lib/exposeInhaltTexte";
import { EXPOSE_RECHNER_TEXTE, rechnerHinweis } from "@/lib/exposeRechnerTexte";
import { EXPOSE_SEITEN_TEXTE } from "@/components/expose/exposeTexte";
import { UMGEBUNG_TEXTE, umgebungInSprache } from "@/components/umgebung/umgebungTexte";
import {
  baueExposeInhalt, kaufnebenkostenKachelText, kennzahlSchluessel, marktQuelleHinweis, MARKT_QUELLE_HINWEIS,
  RECHTLICHE_HINWEISE_ENTWURF, ZEITPLAN_STANDARD, NAECHSTE_SCHRITTE, EXPOSE_ABSCHNITTE,
} from "@/lib/exposeInhalt";
import { baueObjektExposeInhalt } from "@/lib/exposePublicDaten";
import { investagonErgaenzung } from "@/components/expose/exposeInvestagon";
import { umgebungAusAnalyse } from "@/lib/umgebungspunkte";
import { MUSTER_OBJEKT, MUSTER_WE7 } from "@/test/musterobjektWe7";
import type { ObjektData } from "@/lib/objekteStore";

/**
 * Kundensprache, Etappe 3, S2 Exposé online: die Textdateien und die
 * Inhaltsbibliothek in Deutsch und Englisch.
 */

const heute = new Date(2026, 8, 25);

/**
 * Ruft jede Funktion einer Textdatei mit Beispielwerten auf und gibt alle
 * Ausgaben zurück. Der Beispielwert taugt als Text, als Zahl und als Objekt,
 * damit jede Funktion unabhängig von ihren Parametern einmal läuft.
 */
function funktionsausgaben(texte: unknown): string[] {
  const beispiel: unknown = new Proxy({}, {
    get: (_z, k) => (k === Symbol.toPrimitive ? () => 12 : k === "toString" ? () => "12" : "12"),
  });
  const aus: string[] = [];
  const lauf = (w: unknown) => {
    if (typeof w === "function") {
      const f = w as (...a: unknown[]) => unknown;
      aus.push(String(f(...Array(Math.max(1, f.length)).fill(beispiel))));
      aus.push(String(f(...Array(Math.max(1, f.length)).fill(1))));
    } else if (Array.isArray(w)) w.forEach(lauf);
    else if (w && typeof w === "object") Object.values(w).forEach(lauf);
  };
  lauf(texte);
  return aus;
}

describe("Textdateien sind vollständig", () => {
  const dateien = {
    EXPOSE_INHALT_TEXTE, EXPOSE_RECHNER_TEXTE, EXPOSE_SEITEN_TEXTE, UMGEBUNG_TEXTE,
  } as Record<string, { de: unknown; en: unknown }>;
  for (const [name, datei] of Object.entries(dateien)) {
    it(`${name}: Deutsch und Englisch typgleich, nichts leer, kein Gedankenstrich`, () => {
      expect(textdateiLuecken(datei.de, datei.en)).toEqual([]);
    });
    it(`${name}: Funktionstexte ohne Gedankenstrich, Englisch ohne „advisor“`, () => {
      for (const text of [...funktionsausgaben(datei.de), ...funktionsausgaben(datei.en)]) expect(gedankenstrichFrei(text), text).toBe(true);
      expect(JSON.stringify(datei.en)).not.toMatch(/advisor/i);
      for (const text of funktionsausgaben(datei.en)) expect(text).not.toMatch(/advisor/i);
    });
  }

  it("Vorrangsatz und Katalogwerte ohne Gedankenstrich", () => {
    expect(gedankenstrichFrei(RECHTLICHE_HINWEISE_VORRANG_EN.titel + RECHTLICHE_HINWEISE_VORRANG_EN.text)).toBe(true);
    for (const w of Object.values(KATALOGWERTE_EN)) expect(gedankenstrichFrei(w)).toBe(true);
  });
});

describe("Die deutschen Konstanten bleiben wortgleich", () => {
  it("die PDFs lesen weiter dieselben deutschen Texte", () => {
    expect(EXPOSE_ABSCHNITTE[6]).toEqual({ id: "verwaltung", nr: 7, titel: "Verwaltung vor Ort", kurz: "Verwaltung" });
    expect(ZEITPLAN_STANDARD[5]).toEqual({ nr: 6, titel: "Übergabe an die Verwaltung", frist: "", text: NAECHSTE_SCHRITTE[5].text });
    expect(ZEITPLAN_STANDARD[0]).toEqual({ nr: 1, titel: "Reservierung", frist: "Mit Anzahlung wirksam", zahlung: true, text: NAECHSTE_SCHRITTE[1].text });
    expect(NAECHSTE_SCHRITTE[0].titel).toBe("Beratung");
    expect(MARKT_QUELLE_HINWEIS).toBe("Aus der Marktanalyse, Quelle und Stand je Aussage.");
    expect(marktQuelleHinweis("de")).toBe(MARKT_QUELLE_HINWEIS);
  });
});

describe("baueExposeInhalt mit Sprache", () => {
  it("ohne Sprache genau wie mit Deutsch, und nie ein Vermerk", () => {
    const ohne = baueExposeInhalt({ objekt: MUSTER_OBJEKT, wohnung: MUSTER_WE7, heute });
    const de = baueExposeInhalt({ objekt: MUSTER_OBJEKT, wohnung: MUSTER_WE7, heute, sprache: "de" });
    expect(de).toEqual(ohne);
    expect(ohne.nurDeutsch).toEqual({ beschreibung: false, standortargumente: false, marktargumente: false });
    expect(ohne.start.kennzahlen[0].label).toBe("Kaufpreis");
    expect(ohne.start.kennzahlen.every((k) => k.schluessel === undefined)).toBe(true);
    expect(ohne.rechtliches.hinweise).toBe(RECHTLICHE_HINWEISE_ENTWURF);
  });

  it("auf Englisch: Beschriftungen, Zahlen, Schritte, Zeitplan und Vorrangsatz", () => {
    const en = baueExposeInhalt({ objekt: MUSTER_OBJEKT, wohnung: MUSTER_WE7, heute, sprache: "en" });
    const kaufpreis = en.start.kennzahlen.find((k) => kennzahlSchluessel(k) === "Kaufpreis");
    expect(kaufpreis?.label).toBe("Purchase price");
    expect(kaufpreis?.wert).toMatch(/^€\d{1,3}(,\d{3})+$/);
    expect(en.naechsteSchritte[1].titel).toBe("Reservation");
    expect(en.zeitplan[3].titel).toBe("Notary appointment (Notartermin)");
    expect(en.zeitplan[3].text).toBe("The contract is notarised at the notary’s office, in person or by power of attorney.");
    expect(en.chancenRisiken[0].titel).toBe("Rental income and loss of rent");
    expect(en.rechtliches.hinweise[0]).toEqual(RECHTLICHE_HINWEISE_VORRANG_EN);
    expect(en.rechtliches.hinweise).toHaveLength(RECHTLICHE_HINWEISE_ENTWURF.length + 1);
    expect(en.kopf.titel).toMatch(/^Apartment/);
    // Kein deutsches Füllwort mehr in Kennzahlen und Objektdaten.
    const alle = [...en.start.kennzahlen, ...en.objektdaten.zeilen, ...en.rechtliches.energieausweis];
    for (const k of alle) {
      // Deutsche Fachbegriffe stehen nach dem Glossar in Klammern dabei, sonst nichts Deutsches.
      expect(k.label.replace(/\([^)]*\)/g, "")).not.toMatch(/[äöüß]|Keine Angabe/);
      expect(k.wert).not.toMatch(/Keine Angabe|Keiner|Leerstand|Vermietet/);
    }
    // Die feste Kennung bleibt die deutsche Beschriftung.
    expect(en.objektdaten.zeilen.map(kennzahlSchluessel)).toContain("Baujahr");
  });

  it("Objekttexte: Englisch mit Vermerk, solange es keine englische Fassung gibt", () => {
    const objekt = { ...MUSTER_OBJEKT, meta: { ...MUSTER_OBJEKT.meta, kurzbeschreibung: "Ruhige Wohnung am Park.", standortargumente: ["Lage. Nah am Zentrum."], marktargumente: ["Markt. Nachfrage steigt."] } } as ObjektData;
    const en = baueExposeInhalt({ objekt, wohnung: MUSTER_WE7, heute, sprache: "en" });
    expect(en.beschreibung).toBe("Ruhige Wohnung am Park.");
    expect(en.nurDeutsch).toEqual({ beschreibung: true, standortargumente: true, marktargumente: true });
    expect(en.standort.argumente[0]).toEqual({ titel: "Lage", text: "Nah am Zentrum." });

    const mitEn = { ...objekt, meta: { ...objekt.meta, objekttexteKiEn: { kurzbeschreibung: "Quiet flat by the park.", standortargumente: ["Location. Close to the centre."], marktargumente: ["Market. Demand is rising."] } } } as ObjektData;
    const en2 = baueExposeInhalt({ objekt: mitEn, wohnung: MUSTER_WE7, heute, sprache: "en" });
    expect(en2.beschreibung).toBe("Quiet flat by the park.");
    expect(en2.standort.argumente[0]).toEqual({ titel: "Location", text: "Close to the centre." });
    expect(en2.standort.marktargumente[0].titel).toBe("Market");
    expect(en2.nurDeutsch).toEqual({ beschreibung: false, standortargumente: false, marktargumente: false });

    const de = baueExposeInhalt({ objekt: mitEn, wohnung: MUSTER_WE7, heute, sprache: "de" });
    expect(de.beschreibung).toBe("Ruhige Wohnung am Park.");
    expect(de.nurDeutsch).toEqual({ beschreibung: false, standortargumente: false, marktargumente: false });
  });

  it("baueObjektExposeInhalt: Beschriftungen und Objektdaten auch auf Englisch", () => {
    const en = baueObjektExposeInhalt({ objekt: MUSTER_OBJEKT, heute, sprache: "en" });
    const de = baueObjektExposeInhalt({ objekt: MUSTER_OBJEKT, heute });
    expect(en.kopf.untertitel).toMatch(/^(Whole property|Property with units)$/);
    // Dieselben Zeilen in derselben Reihenfolge, nur übersetzt.
    expect(en.objektdaten.zeilen.map(kennzahlSchluessel)).toEqual(de.objektdaten.zeilen.map((z) => z.label));
    expect(en.start.kennzahlen.map(kennzahlSchluessel)).toEqual(de.start.kennzahlen.map((z) => z.label));
  });

  it("kaufnebenkostenKachelText und marktQuelleHinweis auf Englisch", () => {
    expect(kaufnebenkostenKachelText(MUSTER_OBJEKT, MUSTER_WE7, heute, "en")).toMatch(/^plus incidental purchase costs of approx\. €[\d,]+$|incidental purchase costs/);
    expect(kaufnebenkostenKachelText(MUSTER_OBJEKT, MUSTER_WE7, heute)).toMatch(/Kaufnebenkosten/);
    expect(marktQuelleHinweis("en")).toBe(EXPOSE_INHALT_TEXTE.en.marktQuelle);
  });
});

describe("Investagon-Ergänzung", () => {
  const roh = { meta: { investagonRaw: { object_building_year: 1962, heating_type: "district_heating", object_floor: "2", transaction_tax_rate: 3.5 } } };
  it("Englisch: unsere Beschriftungen und Katalogwerte übersetzt, Baujahr wie im Exposé", () => {
    const en = investagonErgaenzung({ objekt: roh, einheit: null, ebene: "objekt", sprache: "en" });
    const labels = en.zeilen.map((z) => z.label);
    expect(labels).toContain(EXPOSE_INHALT_TEXTE.en.labels.baujahr);
    expect(en.zeilen.find((z) => z.label === "Heating")?.wert).toBe("District heating");
    expect(en.zeilen.find((z) => z.label.startsWith("Real estate transfer tax"))?.wert).toMatch(/^3\.50?%$/);
  });
  it("Deutsch unverändert", () => {
    const de = investagonErgaenzung({ objekt: roh, einheit: null, ebene: "objekt" });
    expect(de.zeilen.find((z) => z.label === "Heizung")?.wert).toBe("Fernwärme");
  });
});

describe("rechnerHinweis", () => {
  it("übersetzt feste und zahlenhaltige Hinweise, Deutsch und Unbekanntes bleiben", () => {
    expect(rechnerHinweis("Nebenkosten 5,5 % wie am Objekt gepflegt.", "en")).toBe("Incidental purchase costs of 5.5% as recorded for the property.");
    expect(rechnerHinweis("Nebenkosten 5.5 % wie am Objekt gepflegt.", "en")).toBe("Incidental purchase costs of 5.5% as recorded for the property.");
    expect(rechnerHinweis("Mieterhöhung ab 03/2027 berücksichtigt.", "en")).toBe("Rent increase from 03/2027 included.");
    expect(rechnerHinweis("Sonder-AfA § 7b EStG nicht angesetzt: Baukosten je m² über der Obergrenze von 5.200 Euro, die Förderung entfällt vollständig.", "en"))
      .toBe("Special depreciation (Section 7b EStG) not applied: construction costs per m² above the limit of €5,200, so the incentive is lost entirely.");
    expect(rechnerHinweis("Kein zu versteuerndes Einkommen angegeben, Steuerwirkung 0.", "en")).toBe("No taxable income entered, tax effect 0.");
    expect(rechnerHinweis("Mieterhöhung ab 03/2027 berücksichtigt.", "de")).toBe("Mieterhöhung ab 03/2027 berücksichtigt.");
    expect(rechnerHinweis("Ein ganz neuer Hinweis.", "en")).toBe("Ein ganz neuer Hinweis.");
  });
});

describe("Hilfen", () => {
  it("zahlenAufEnglisch stellt deutsche Zahlen um", () => {
    expect(zahlenAufEnglisch("3,50 %")).toBe("3.50%");
    expect(zahlenAufEnglisch("5.200 Euro")).toBe("5,200 Euro");
    expect(zahlenAufEnglisch("1962")).toBe("1962");
  });

  it("umgebungInSprache übersetzt Titel und Art, Deutsch bleibt dieselbe Umgebung", () => {
    const u = umgebungAusAnalyse({ schema: 2, objekt_koordinaten: { lat: 48.3, lng: 10.9 }, mikrolage: { einkaufen: [{ name: "REWE", typ: "Supermarkt", entfernung_m: 300, lat: 48.301, lng: 10.901 }] } });
    expect(umgebungInSprache(u, "de")).toBe(u);
    const en = umgebungInSprache(u, "en");
    expect(en?.kategorien[0].titel).toBe("Shopping");
    expect(en?.kategorien[0].listen[0].punkte[0].art).toBe("Supermarket");
    expect(en?.kategorien[0].listen[0].punkte[0].name).toBe("REWE");
    expect(en?.hinweis).toMatch(/^Distances as the crow flies/);
  });
});
