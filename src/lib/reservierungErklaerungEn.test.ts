import { describe, expect, it } from "vitest";
import {
  TEXT_FASSUNG,
  TEXT_FASSUNG_GESAMTOBJEKT,
  WIDERRUFSBELEHRUNG,
  beschriftungEn,
  fassungsVermerk,
  objektEinleitung,
  reservierungTexte,
  textFassungEn,
  unterschriftBestaetigung,
  vertragsAufbau,
  vertragsSpracheAus,
  type VertragsOptionen,
} from "./reservierungErklaerung";
import {
  BESCHRIFTUNG_EN,
  TEXT_FASSUNG_EN,
  TEXT_FASSUNG_GESAMTOBJEKT_EN,
  WIDERRUFSBELEHRUNG_EN,
  ZIFFERN_EN,
} from "./reservierungErklaerungEn";
import { VORRANGKLAUSEL, ZWEISPRACHIG_EINLEITUNG, zweisprachigeBeschriftung } from "./zweisprachig";

/** Alle Fälle, die das Dokument kennt. */
const FAELLE: [string, VertragsOptionen][] = [
  ["Einzelwohnung mit Gebühr", {}],
  ["Einzelwohnung ohne Gebühr", { gebuehrEntfaellt: true }],
  ["Globalobjekt privat", { gesamtobjekt: true }],
  ["Globalobjekt privat ohne Gebühr", { gesamtobjekt: true, gebuehrEntfaellt: true }],
  ["Globalobjekt Gesellschaft", { gesamtobjekt: true, gesellschaft: true }],
  ["Globalobjekt Gesellschaft ohne Gebühr", { gesamtobjekt: true, gesellschaft: true, gebuehrEntfaellt: true }],
];

const verweiseIn = (text: string): string[] => (text.match(/\{\{(abschnitt|punkt):[a-zA-Z]+\}\}/g) || []).sort();
const deutscheWoerter = /\b(und|der|die|das|nicht|wird|ist|mit|für|oder|Kaufinteressent)\b/;

describe("Fassungskennung je Sprache", () => {
  it("die deutsche Fassung bleibt unverändert, die englische trägt das Kürzel -en", () => {
    expect(TEXT_FASSUNG).toBe("2026-09-22");
    expect(TEXT_FASSUNG_GESAMTOBJEKT).toBe("2026-09-23 Gesamtobjekt");
    expect(TEXT_FASSUNG_EN).toMatch(/^\d{4}-\d{2}-\d{2}-en$/);
    expect(TEXT_FASSUNG_GESAMTOBJEKT_EN).toMatch(/-en Gesamtobjekt$/);
    expect(textFassungEn({})).toBe(TEXT_FASSUNG_EN);
    expect(textFassungEn({ gesamtobjekt: true })).toBe(TEXT_FASSUNG_GESAMTOBJEKT_EN);
  });

  it("der Aufbau speichert immer die deutsche, maßgebliche Fassung", () => {
    expect(vertragsAufbau({}, "en").textFassung).toBe(TEXT_FASSUNG);
    expect(vertragsAufbau({ gesamtobjekt: true }, "en").textFassung).toBe(TEXT_FASSUNG_GESAMTOBJEKT);
  });

  it("der Vermerk nennt bei Englisch beide Fassungen, Deutsch als maßgeblich", () => {
    expect(fassungsVermerk({ textFassung: "2026-09-22" })).toBe("2026-09-22");
    expect(fassungsVermerk({ vertragssprache: "en", textFassung: "2026-09-22", textFassungEn: TEXT_FASSUNG_EN }))
      .toBe(`2026-09-22 (DE, maßgeblich) / ${TEXT_FASSUNG_EN} (EN)`);
    // Ohne gespeicherte Übersetzungsfassung gilt die heutige.
    expect(fassungsVermerk({ vertragssprache: "en", gesamtobjekt: true }))
      .toBe(`${TEXT_FASSUNG_GESAMTOBJEKT} (DE, maßgeblich) / ${TEXT_FASSUNG_GESAMTOBJEKT_EN} (EN)`);
  });

  it("nur ein ausdrückliches en macht eine Reservierung zweisprachig", () => {
    expect(vertragsSpracheAus(undefined)).toBe("de");
    expect(vertragsSpracheAus({})).toBe("de");
    expect(vertragsSpracheAus({ vertragssprache: "fr" })).toBe("de");
    expect(vertragsSpracheAus({ vertragssprache: "en" })).toBe("en");
  });
});

describe("Vorrangklausel", () => {
  it("steht im Wortlaut der Freigabe in beiden Sprachen", () => {
    expect(VORRANGKLAUSEL.de).toBe("Im Falle von Abweichungen ist die deutsche Fassung maßgeblich.");
    expect(VORRANGKLAUSEL.en).toBe("In case of discrepancies, the German version shall prevail.");
    expect(ZWEISPRACHIG_EINLEITUNG.de).toContain(VORRANGKLAUSEL.de);
    expect(ZWEISPRACHIG_EINLEITUNG.en).toContain(VORRANGKLAUSEL.en);
  });

  it("zweisprachige Beschriftungen: Deutsch zuerst, gleiche Wörter nur einmal", () => {
    expect(zweisprachigeBeschriftung("Familienstand", "Marital status")).toBe("Familienstand / Marital status");
    expect(zweisprachigeBeschriftung("IBAN", "IBAN")).toBe("IBAN");
    expect(zweisprachigeBeschriftung("Firma", undefined)).toBe("Firma");
  });
});

describe("Englische Fassung der Reservierungsvereinbarung", () => {
  it.each(FAELLE)("%s: gleiche Abschnitte, Punkte und Nummern wie im Deutschen", (_name, opt) => {
    const de = vertragsAufbau(opt, "de");
    const en = vertragsAufbau(opt, "en");
    expect(en.sprache).toBe("en");
    expect(en.abschnitte.map((a) => [a.kennung, a.nummer])).toEqual(de.abschnitte.map((a) => [a.kennung, a.nummer]));
    expect(en.ziffern.map((z) => [z.kennung, z.nummer])).toEqual(de.ziffern.map((z) => [z.kennung, z.nummer]));
    expect(en.ziffern.map((z) => z.punkte?.length ?? 0)).toEqual(de.ziffern.map((z) => z.punkte?.length ?? 0));
    expect(en.widerrufWahlen.map((w) => w.wert)).toEqual(de.widerrufWahlen.map((w) => w.wert));
    expect(Boolean(en.aufloesendeBedingung)).toBe(Boolean(de.aufloesendeBedingung));
  });

  it.each(FAELLE)("%s: der englische Text ist wirklich englisch und hat keine offenen Verweise", (_name, opt) => {
    const en = vertragsAufbau(opt, "en");
    const alles = [
      ...en.abschnitte.map((a) => a.ueberschrift),
      ...en.ziffern.flatMap((z) => [z.text, ...(z.punkte ?? [])]),
      ...en.widerrufWahlen.flatMap((w) => [w.satz, w.erlaeuterung]),
      en.aufloesendeBedingung,
    ].filter(Boolean);
    for (const satz of alles) {
      expect(satz, satz).not.toMatch(/\{\{/);
      expect(satz, satz).not.toMatch(deutscheWoerter);
    }
  });

  it.each(FAELLE)("%s: die Verweise zeigen auf dieselben Nummern wie im Deutschen", (_name, opt) => {
    const de = vertragsAufbau(opt, "de");
    const en = vertragsAufbau(opt, "en");
    const zahlen = (t: string) => (t.match(/(?:Abschnitt|Punkt|section|point) (\d+)/g) || []).map((m) => m.replace(/\D/g, ""));
    en.ziffern.forEach((z, i) => expect(zahlen(z.text)).toEqual(zahlen(de.ziffern[i].text)));
    en.widerrufWahlen.forEach((w, i) => expect(zahlen(w.satz)).toEqual(zahlen(de.widerrufWahlen[i].satz)));
    expect(zahlen(en.aufloesendeBedingung)).toEqual(zahlen(de.aufloesendeBedingung));
  });

  it("jede deutsche Fassung eines Punktes hat eine englische, mit denselben Verweisen", () => {
    // Die deutschen Vorlagen sind nicht ausgegeben; über den Aufbau aller Fälle
    // wird jeder Wortlaut mindestens einmal erreicht.
    for (const [, opt] of FAELLE) {
      const de = vertragsAufbau(opt, "de");
      const en = vertragsAufbau(opt, "en");
      de.ziffern.forEach((z, i) => {
        expect(en.ziffern[i].text).not.toBe(z.text);
      });
    }
    for (const [kennung, texte] of Object.entries(ZIFFERN_EN)) {
      const alle = [texte.text, texte.textGesamtobjekt, texte.textGesellschaft, texte.textOhneGebuehr].filter(
        (t): t is string => typeof t === "string",
      );
      expect(alle.length, kennung).toBeGreaterThan(0);
      if (texte.punkteGesamtobjekt) expect(texte.punkte?.length).toBe(texte.punkteGesamtobjekt.length);
    }
    // Die Punkte mit Verweisen tragen sie in beiden Sprachen.
    expect(verweiseIn(ZIFFERN_EN.pflichtbeginn.text)).toEqual(["{{abschnitt:widerruf}}"]);
    expect(verweiseIn(ZIFFERN_EN.zahlung.text)).toEqual(["{{abschnitt:gebuehr}}", "{{punkt:pflichten}}"]);
    expect(verweiseIn(ZIFFERN_EN.zahlung.textGesamtobjekt || "")).toEqual(["{{abschnitt:gebuehr}}", "{{punkt:pflichten}}"]);
    expect(verweiseIn(ZIFFERN_EN.rueckzahlung.text)).toEqual(["{{abschnitt:kaeufer}}"]);
  });

  it("die Widerrufsbelehrung hat dieselben Blöcke und Absätze wie das Muster", () => {
    expect(WIDERRUFSBELEHRUNG_EN.map((b) => b.absaetze.length)).toEqual(WIDERRUFSBELEHRUNG.map((b) => b.absaetze.length));
    expect(WIDERRUFSBELEHRUNG_EN[0].absaetze[2]).toContain("os@os-immobilien.com");
    expect(reservierungTexte("en").widerrufsbelehrung).toBe(WIDERRUFSBELEHRUNG_EN);
    expect(reservierungTexte("de").widerrufsbelehrung).toBe(WIDERRUFSBELEHRUNG);
  });

  it("der deutsche Wortlaut bleibt ohne Sprachangabe unverändert", () => {
    expect(vertragsAufbau({})).toEqual(expect.objectContaining({ sprache: "de" }));
    expect(vertragsAufbau({}).ziffern.map((z) => z.text)).toEqual(vertragsAufbau({}, "de").ziffern.map((z) => z.text));
    expect(objektEinleitung({})).toContain("Ich/Wir beabsichtige/n");
    expect(objektEinleitung({}, "en")).toContain("I/We intend");
    expect(unterschriftBestaetigung({})).toContain("einschließlich der Widerrufsbelehrung");
    expect(unterschriftBestaetigung({ gebuehrEntfaellt: true }, "en")).not.toContain("withdrawal");
  });

  it("jede Beschriftung, die das Dokument braucht, hat eine englische", () => {
    const noetig = [
      "Vorname", "Nachname", "Geburtsname", "Geburtsdatum", "Geburtsort", "Staatsangehörigkeit", "Straße / Nr.",
      "PLZ / Ort", "Telefon", "E-Mail", "IBAN für die Rückzahlung", "Güterstand", "Wohneinheit", "Stellplatz / Nr.",
      "Garage / Nr.", "Straße", "Gesamtpreis", "Kaufpreis gesamt", "Dolmetscher benötigt", "Für diesen Kaufpreis",
      "Reservierungsgebühr für ein Gesamtobjekt", "Kontoinhaber", "Verwendungszweck", "Kaufgegenstand",
      "Anzahl Einheiten", "Grundbuch", "Aufteilung", "Stellplätze / Garagen", "Firma", "Rechtsform",
      "Sitz / Anschrift", "Registergericht / Nummer", "vertreten durch",
    ];
    for (const de of noetig) expect(BESCHRIFTUNG_EN[de], de).toBeTruthy();
    expect(beschriftungEn("Unbekannt")).toBe("Unbekannt");
  });

  it("kein Gedankenstrich in den englischen Texten", () => {
    const texte = [
      ...Object.values(ZIFFERN_EN).flatMap((z) => [z.text, z.textGesamtobjekt, z.textGesellschaft, z.textOhneGebuehr, ...(z.punkte ?? []), ...(z.punkteGesamtobjekt ?? [])]),
      ...WIDERRUFSBELEHRUNG_EN.flatMap((b) => [b.ueberschrift, ...b.absaetze]),
      ...Object.values(reservierungTexte("en")).flatMap((v) => (typeof v === "string" ? [v] : [])),
    ].filter((t): t is string => typeof t === "string");
    for (const t of texte) expect(t, t).not.toMatch(/[–—]/);
  });
});
