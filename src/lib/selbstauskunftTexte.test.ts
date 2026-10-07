import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Die englische Selbstauskunft (Plan Kundensprache, Etappe 4).
 *
 * Drei Dinge werden hier festgehalten:
 *   1. Der Wächter: Jeder deutsche Text, den Formular, Kundenseite und
 *      Handy-Unterschrift durch `t(…)` schicken oder als Beschriftung,
 *      Platzhalter, Erklärung oder Hinweis tragen, hat einen Eintrag im
 *      Wörterbuch. Sonst sähe ein englischer Kunde mitten im Formular Deutsch.
 *   2. Die Beträge: Englisch getippt, deutsch gespeichert. „2,500“ ist 2.500,
 *      nie 2,5.
 *   3. Die gespeicherten Auswahlwerte bleiben deutsch, nur die Anzeige wechselt.
 */

// Das Formular zieht beim Import Supabase und Stores nach; für die Texte
// reichen schmale Attrappen.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/kundenStore", () => ({ getKontaktById: () => null }));
vi.mock("@/lib/investmentsStore", () => ({
  getSaData: () => null,
  setSaData: async () => {},
  getSaDataZurVorbelegung: () => null,
  getInvestmentsByKontakt: () => [],
  setInvestmentMetaFields: async () => {},
  getSaKundeStandAm: () => null,
}));

import { SA_UI_EN, saText, enZuDeBetrag, deZuEnBetrag, saVorbelegungTextIn, saAbschnittTextIn, saFeldMarkeErklaerungIn, SA_EN_EINGABEHINWEIS } from "./selbstauskunftTexte";
import { saWertAnzeige, SA_WERTE_EN } from "./selbstauskunftSprache";
import { saVorbelegungText, saAbschnittText, saFeldMarkeErklaerung, SA_FELD_MARKE, SA_LEGENDE_UEBERNOMMEN, SA_VORBELEGUNG_TITEL, SA_ABSCHNITT_BESTAETIGEN } from "./saVorbelegung";
import { KREDIT_AUSWAHL } from "./finanzierbarkeitUtils";
import { ANLAGE_ZIELE } from "./anlageZiele";
import { SA_FORMULAR_TEXTE } from "@/components/selbstauskunft/SelbstauskunftForm";

const WURZEL = path.resolve(__dirname, "..");
const QUELLEN = [
  "components/selbstauskunft/SelbstauskunftForm.tsx",
  "pages/SelbstauskunftPublic.tsx",
  "pages/SaMobileSign.tsx",
].map((d) => ({ datei: d, text: fs.readFileSync(path.join(WURZEL, d), "utf8") }));

const STRING = String.raw`"(?:[^"\\]|\\.)*"`;

/** Alle Texte, die im Quelltext durch t(…)/saText(…) laufen oder als Attribut stehen. */
function texteAusQuelltext(src: string): string[] {
  const gefunden: string[] = [];
  // t("…"), auch zusammengesetzt: t("a " + "b")
  const reT = new RegExp(String.raw`\b(?:t|saText)\(\s*(${STRING}(?:\s*\+\s*${STRING})*)`, "g");
  for (const m of src.matchAll(reT)) {
    const teile = m[1].match(new RegExp(STRING, "g")) ?? [];
    gefunden.push(teile.map((x) => JSON.parse(x) as string).join(""));
  }
  // Beschriftung, Platzhalter, Erklärung, Hinweis, Info-Symbol
  for (const m of src.matchAll(/\b(?:label|placeholder|tooltip|hint|text)="([^"]*)"/g)) gefunden.push(m[1]);
  return gefunden;
}

/** Texte ohne Buchstaben („0“) brauchen keine Übersetzung. */
const hatBuchstaben = (s: string) => /[A-Za-zÄÖÜäöüß]/.test(s);

describe("Wächter: jeder Formulartext hat eine englische Fassung", () => {
  it("alle t()-Aufrufe und Feldattribute in Formular, Kundenseite und Handyseite", () => {
    const fehlend: string[] = [];
    for (const { datei, text } of QUELLEN) {
      for (const de of texteAusQuelltext(text)) {
        if (hatBuchstaben(de) && SA_UI_EN[de] === undefined) fehlend.push(`${datei}: ${de}`);
      }
    }
    expect(fehlend).toEqual([]);
  });

  it("findet überhaupt etwas (sonst prüfte der Wächter ins Leere)", () => {
    const anzahl = QUELLEN.reduce((n, q) => n + texteAusQuelltext(q.text).length, 0);
    expect(anzahl).toBeGreaterThan(300);
  });

  it("Schritte, Hinweisspalte und Feld-Hilfen", () => {
    const { schritte, schrittHinweise, feldHilfen } = SA_FORMULAR_TEXTE;
    const alle = [
      ...schritte,
      ...Object.values(schrittHinweise).flatMap((h) => [h.title, ...h.items]),
      ...Object.keys(feldHilfen),
      ...Object.values(feldHilfen),
    ];
    expect(alle.filter((de) => SA_UI_EN[de] === undefined)).toEqual([]);
  });

  it("die Vorbelegungstexte aus saVorbelegung.ts", () => {
    for (const de of [SA_VORBELEGUNG_TITEL, SA_FELD_MARKE, SA_LEGENDE_UEBERNOMMEN, SA_ABSCHNITT_BESTAETIGEN]) {
      expect(SA_UI_EN[de], de).toBeTruthy();
    }
    expect(saVorbelegungTextIn(4, "de")).toBe(saVorbelegungText(4));
    expect(saAbschnittTextIn(4, "de")).toBe(saAbschnittText(4));
    expect(saFeldMarkeErklaerungIn(4, "de")).toBe(saFeldMarkeErklaerung(4));
    expect(saVorbelegungTextIn(4, "en")).toContain("investment 4");
    expect(saAbschnittTextIn(4, "en")).toBe("Carried over from investment 4. Please check.");
  });

  it("Hinweise, die als Ausdruck statt als Attribut im Formular stehen", () => {
    expect(SA_UI_EN["Kurz benennen, sonst kann die Bank den Betrag nicht einordnen"]).toBeTruthy();
  });
});

describe("Stil der englischen Texte", () => {
  const englisch = [...Object.values(SA_UI_EN), SA_EN_EINGABEHINWEIS, saVorbelegungTextIn(2, "en")];

  it("keine Gedankenstriche", () => {
    expect(englisch.filter((e) => /[–—]/.test(e))).toEqual([]);
  });

  it("keine Kurzformen wie „you'll“ oder „don't“", () => {
    expect(englisch.filter((e) => /\w(?:n['’]t|['’](?:ll|re|ve|m|d))\b/i.test(e))).toEqual([]);
  });

  it("nie „advisor“ (Glossar, Entscheidung 16)", () => {
    expect(englisch.filter((e) => /advis/i.test(e))).toEqual([]);
  });
});

describe("saText", () => {
  it("Deutsch kommt unverändert zurück, auch ohne Eintrag", () => {
    expect(saText("Weiter", "de")).toBe("Weiter");
    expect(saText("Gibt es nicht", "de")).toBe("Gibt es nicht");
  });

  it("Englisch aus dem Wörterbuch, sonst Rückfall auf Deutsch", () => {
    expect(saText("Weiter", "en")).toBe("Next");
    expect(saText("Gibt es nicht", "en")).toBe("Gibt es nicht");
  });

  it("setzt Platzhalter nach der Übersetzung ein", () => {
    expect(saText("Klasse {k}", "de", { k: 3 })).toBe("Klasse 3");
    expect(saText("Klasse {k}", "en", { k: 3 })).toBe("Class 3");
    expect(saText("Bitte 1–{max} Ziele auswählen", "de", { max: 3 })).toBe("Bitte 1–3 Ziele auswählen");
  });

  it("ein Zusatz hinter „|“ trennt gleichlautende deutsche Texte", () => {
    expect(saText("Unterschrift übertragen|Knopf", "de")).toBe("Unterschrift übertragen");
    expect(saText("Unterschrift übertragen|Überschrift", "de")).toBe("Unterschrift übertragen");
    expect(saText("Unterschrift übertragen|Knopf", "en")).toBe("Transfer signature");
    expect(saText("Unterschrift übertragen|Überschrift", "en")).toBe("Signature transferred");
  });

  it("Platzhalter der Beträge und Daten", () => {
    expect(saText("0,00", "en")).toBe("0.00");
    expect(saText("TT.MM.JJJJ", "en")).toBe("DD.MM.YYYY");
    expect(saText("TT.MM.JJJJ", "de")).toBe("TT.MM.JJJJ");
  });
});

describe("Beträge: englisch getippt, deutsch gespeichert", () => {
  it("„2,500“ ergibt den Speicherwert „2.500“, nie 2,5", () => {
    expect(enZuDeBetrag("2,500")).toBe("2.500");
  });

  it("übliche englische Eingaben", () => {
    expect(enZuDeBetrag("1,234.56")).toBe("1.234,56");
    expect(enZuDeBetrag("2500")).toBe("2.500");
    expect(enZuDeBetrag("1234567.8")).toBe("1.234.567,8");
    expect(enZuDeBetrag("€ 1,200")).toBe("1.200");
    expect(enZuDeBetrag("0")).toBe("0");
    expect(enZuDeBetrag("")).toBe("");
    expect(enZuDeBetrag(null)).toBe("");
    expect(enZuDeBetrag("abc")).toBe("");
  });

  it("höchstens zwei Nachkommastellen, angefangener Dezimalpunkt bleibt", () => {
    expect(enZuDeBetrag("12.345")).toBe("12,34");
    expect(enZuDeBetrag("1.")).toBe("1,");
    expect(enZuDeBetrag("1.5")).toBe("1,5");
  });

  it("eine eingefügte deutsche Zahl bleibt deutsch", () => {
    expect(enZuDeBetrag("1.234,56")).toBe("1.234,56");
    expect(enZuDeBetrag("1.234,5")).toBe("1.234,5");
  });

  it("Anzeige: gespeichert deutsch, gezeigt englisch", () => {
    expect(deZuEnBetrag("1.234,56")).toBe("1,234.56");
    expect(deZuEnBetrag("2.500")).toBe("2,500");
    expect(deZuEnBetrag("1.234,")).toBe("1,234.");
    expect(deZuEnBetrag("")).toBe("");
    expect(deZuEnBetrag(undefined)).toBe("");
  });

  it("Tippen Zeichen für Zeichen: 2 → 2, → 2,5 → 2,50 → 2,500", () => {
    // So läuft es im Feld: Eingabe umrechnen, speichern, englisch wieder anzeigen.
    let anzeige = "";
    let gespeichert = "";
    for (const zeichen of "2,500") {
      gespeichert = enZuDeBetrag(anzeige + zeichen);
      anzeige = deZuEnBetrag(gespeichert);
    }
    expect(gespeichert).toBe("2.500");
    expect(anzeige).toBe("2,500");
  });

  it("Tippen mit Nachkommastellen: 1,234.56", () => {
    let anzeige = "";
    let gespeichert = "";
    for (const zeichen of "1234.56") {
      gespeichert = enZuDeBetrag(anzeige + zeichen);
      anzeige = deZuEnBetrag(gespeichert);
    }
    expect(gespeichert).toBe("1.234,56");
    expect(anzeige).toBe("1,234.56");
  });
});

describe("Auswahlwerte: gespeichert deutsch, angezeigt englisch", () => {
  const AUSWAHLLISTEN = [
    ["Herr", "Frau", "Divers"],
    ["Ledig", "Verheiratet", "Geschieden", "Verwitwet", "Eingetragene Lebenspartnerschaft"],
    ["Weniger als 1 Jahr", "1-3 Jahre", "3-5 Jahre", "Mehr als 5 Jahre"],
    ["Girokonto", "Sparkonto", "Tagesgeld", "Depot"],
    ["Zur Miete", "Eigentum", "Mietfrei"],
    ["Bank- & Sparguthaben", "Wertpapiere / Depot", "Bausparvertrag", "Lebensversicherung", "Immobilien", "Sonstige"],
    ["ja", "nein"],
    KREDIT_AUSWAHL.map((k) => k.label),
    ANLAGE_ZIELE.map((z) => z.label),
  ].flat();

  it("jede Auswahl im Formular hat eine englische Anzeige", () => {
    expect(AUSWAHLLISTEN.filter((w) => saWertAnzeige(w, "en") === w)).toEqual([]);
  });

  it("Deutsch zeigt den gespeicherten Wert selbst", () => {
    for (const w of AUSWAHLLISTEN) expect(saWertAnzeige(w, "de")).toBe(w);
  });

  it("Verheiratet wird als Married angezeigt", () => {
    expect(saWertAnzeige("Verheiratet", "en")).toBe("Married");
  });

  it("die Güterstände im Formular sagen dasselbe wie SA_WERTE_EN", () => {
    expect(saText("Zugewinngemeinschaft (gesetzlich)", "en")).toBe(SA_WERTE_EN.gesetzlich);
  });

  it("die Auswahllisten im Formular speichern weiter den deutschen Wert", () => {
    const form = QUELLEN[0].text;
    // value bleibt der Rohwert, nur der sichtbare Text geht über w(…)
    expect(form).toContain("<SelectItem key={f} value={f}>{w(f)}</SelectItem>");
    expect(form).toContain("<SelectItem key={a.wert} value={a.wert}>{w(a.label)}</SelectItem>");
    expect(form).not.toMatch(/value=\{w\(/);
    expect(form).not.toMatch(/value=\{t\(/);
  });
});
