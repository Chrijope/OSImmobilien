import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Kundensprache Etappe 4: Reservierung, Selbstauskunft, Notar.
 *
 * Geprüft wird, was in den Dokumenten wirklich steht. jsPDF wird durch eine
 * Attrappe ersetzt, die jeden Textaufruf mitschreibt (Bauweise wie
 * `selbstauskunftPdf.test.ts`).
 *
 *   1. Die Reservierung eines englischen Kunden ist zweisprachig, trägt die
 *      Vorrangklausel und beide Fassungskennungen; die deutsche bleibt, wie
 *      sie war.
 *   2. Das Selbstauskunft-PDF ist bei Englisch zweisprachig beschriftet
 *      („Familienstand“ und „Marital status“), die Werte bleiben deutsch
 *      gespeichert und bekommen nur ihre Übersetzung daneben.
 *   3. Der Notar-Aufnahmebogen trägt bei Englisch das Kennzeichen
 *      „Dolmetscher nötig“.
 *   4. Das Protokoll der Einwilligung nennt Sprache und Fassung.
 *   5. Das ausfüllbare Formular gibt es auf Englisch mit denselben Feldern.
 */
const mitschnitt = vi.hoisted(() => ({ texte: [] as string[] }));

vi.mock("jspdf", () => {
  class GState { constructor(_: unknown) {} }
  class JsPdfAttrappe {
    private seiten = 1;
    addFileToVFS() {}
    addFont() {}
    setFont() {}
    setFontSize() {}
    setTextColor() {}
    setFillColor() {}
    setDrawColor() {}
    setLineWidth() {}
    setGState() {}
    rect() { return this; }
    roundedRect() {}
    ellipse() {}
    circle() {}
    triangle() {}
    line() {}
    clip() { return this; }
    discardPath() { return this; }
    saveGraphicsState() { return this; }
    restoreGraphicsState() { return this; }
    text(t: string | string[]) {
      for (const z of Array.isArray(t) ? t : [t]) mitschnitt.texte.push(String(z));
    }
    addImage() {}
    getImageProperties() { return { width: 3, height: 2 }; }
    addPage() { this.seiten += 1; }
    setPage() {}
    getNumberOfPages() { return this.seiten; }
    getTextWidth(s: string) { return String(s).length * 0.3; }
    splitTextToSize(s: string) { return [String(s)]; }
    save() {}
    output() { return new Blob(["pdf"]); }
  }
  return { default: JsPdfAttrappe, jsPDF: JsPdfAttrappe, GState };
});

vi.stubGlobal("fetch", () => Promise.reject(new Error("kein Netz im Test")));

import { generateReservierungPDF } from "./reservierungPdf";
import { generateSelbstauskunftPDF } from "./selbstauskunftPdf";
import { generateKaufvertragPDF } from "./kaufvertragPdf";
import { TEXT_FASSUNG, TEXT_FASSUNG_EN } from "./reservierungErklaerung";
import { VORRANGKLAUSEL } from "./zweisprachig";
import { dolmetscherKennzeichen, NOTAR_SPRACHHINWEIS } from "./notarSprache";
import { einwilligungsProtokoll, einwilligungText, EINWILLIGUNG_FASSUNG_EN } from "./signaturSeiteTexte";
import { SA_ERKLAERUNG, SA_WERTE_EN, saWertAnzeige, saWertZweisprachig } from "./selbstauskunftSprache";
import { hatGueterstand } from "./familienstand";
import { saFormularDatei, SA_FORMULAR_PFAD, SA_FORMULAR_PFAD_EN } from "./saPdfFormular";
import { EMPTY_DATA, EMPTY_PERSON, type SelbstauskunftData } from "@/components/selbstauskunft/SelbstauskunftForm";
import type { ReservierungData } from "@/components/reservierung/ReservierungsForm";
import type { KaufvertragData } from "./investmentsStore";

const alles = () => mitschnitt.texte.join("\n");

/** Eine Reservierung mit erfundenen Daten. */
function reservierung(extra: Partial<ReservierungData> = {}): ReservierungData {
  return {
    vorname: "Emily", nachname: "Carter", geburtsdatum: "12.03.1988", staatsangehoerigkeit: "Britisch",
    strasse: "Musterweg", hausnummer: "7", plz: "80331", ort: "München", telefon: "+49 170 0000000",
    email: "emily.carter@example.org", gueterstand: "", iban: "",
    hatPerson2: false, p2Vorname: "", p2Nachname: "", p2Geburtsdatum: "", p2Staatsangehoerigkeit: "",
    p2Strasse: "", p2Hausnummer: "", p2Plz: "", p2Ort: "", p2Telefon: "", p2Email: "",
    wohneinheit: "6", objStrasse: "Beispielstraße 1", objPlz: "83075", objOrt: "Mittenwalde", gesamtpreis: "289.000",
    vkName: "Muster GmbH", vkStrasse: "", vkPlz: "", vkOrt: "",
    erklaerungAkzeptiert: true, widerrufWahl: "sofort", textFassung: TEXT_FASSUNG, abgeschlossen: true,
    ...extra,
  } as ReservierungData;
}

beforeEach(() => { mitschnitt.texte.length = 0; });

describe("Reservierungs-PDF", () => {
  it("bei Englisch: zweisprachig, mit Vorrangklausel und beiden Fassungen", async () => {
    await generateReservierungPDF(reservierung({ vertragssprache: "en", textFassungEn: TEXT_FASSUNG_EN }));
    const t = alles();
    expect(t).toContain(VORRANGKLAUSEL.de);
    expect(t).toContain(VORRANGKLAUSEL.en);
    // Beschriftung in beiden Sprachen, Deutsch zuerst.
    expect(t).toContain("Vorname");
    expect(t).toContain("First name");
    expect(t).toContain("1. Käuferdaten");
    expect(t).toContain("Buyer details");
    // Die Widerrufsbelehrung in beiden Sprachen.
    expect(t).toContain("Widerrufsrecht");
    expect(t).toContain("Right of withdrawal");
    // Die Fußzeile nennt beide Fassungen, Deutsch als maßgeblich.
    expect(t).toContain(`${TEXT_FASSUNG} (DE, maßgeblich) / ${TEXT_FASSUNG_EN} (EN)`);
  });

  it("ohne Vertragssprache bleibt das Dokument rein deutsch", async () => {
    await generateReservierungPDF(reservierung());
    const t = alles();
    expect(t).toContain(`Fassung ${TEXT_FASSUNG}`);
    expect(t).not.toContain("First name");
    expect(t).not.toContain(VORRANGKLAUSEL.en);
    expect(t).not.toContain("Right of withdrawal");
  });
});

describe("Selbstauskunft-PDF für die Bank", () => {
  const daten = (): SelbstauskunftData => ({
    ...EMPTY_DATA,
    vorname: "Emily",
    nachname: "Carter",
    familienstand: "Verheiratet",
    mietart: "Zur Miete",
    person2Data: { ...EMPTY_PERSON },
  });

  it("bei Englisch zweisprachig beschriftet, Werte deutsch mit Übersetzung", async () => {
    await generateSelbstauskunftPDF(daten(), { vorname: "Emily", nachname: "Carter", moreId: "" }, undefined, { sprache: "en" });
    const t = alles();
    expect(t).toContain("Familienstand");
    expect(t).toContain("Marital status");
    expect(t).toContain("Verheiratet / Married");
    expect(t).toContain("Zur Miete / Renting");
    expect(t).toContain(SA_ERKLAERUNG.de);
    expect(t).toContain(SA_ERKLAERUNG.en);
    expect(t).toContain(VORRANGKLAUSEL.en);
  });

  it("ohne Sprache wie bisher deutsch", async () => {
    await generateSelbstauskunftPDF(daten(), { vorname: "Emily", nachname: "Carter", moreId: "" });
    const t = alles();
    expect(t).toContain("Verheiratet");
    expect(t).not.toContain("Marital status");
    expect(t).not.toContain("Married");
    expect(t).not.toContain(SA_ERKLAERUNG.en);
  });
});

describe("Gespeicherte Werte bleiben deutsch", () => {
  it("die Anzeige übersetzt, der Wert bleibt, und Prüfungen auf ihn greifen weiter", () => {
    expect(saWertAnzeige("Verheiratet", "en")).toBe("Married");
    expect(saWertAnzeige("Verheiratet", "de")).toBe("Verheiratet");
    expect(saWertZweisprachig("Eingetragene Lebenspartnerschaft", "en")).toBe("Eingetragene Lebenspartnerschaft / Registered civil partnership");
    // Frei getippte Werte bekommen keine Übersetzung.
    expect(saWertAnzeige("Sparkasse Rosenheim", "en")).toBe("Sparkasse Rosenheim");
    // Die Prüfung auf den gespeicherten deutschen Wert bleibt richtig.
    expect(hatGueterstand("Verheiratet")).toBe(true);
    // Kein englischer Wert ist zugleich ein deutscher Schlüssel, sonst
    // könnte eine Anzeige versehentlich wieder als Wert gelesen werden.
    const deutsch = new Set(Object.keys(SA_WERTE_EN));
    for (const en of Object.values(SA_WERTE_EN)) {
      if (["IBAN", "Bank", "Depot"].includes(en)) continue;
      expect(deutsch.has(en), en).toBe(false);
    }
  });
});

describe("Dolmetscher-Kennzeichen im Notar-Aufnahmebogen", () => {
  it("kommt automatisch bei Englisch und nennt eine erfasste Sprache", () => {
    expect(dolmetscherKennzeichen("de")).toBeNull();
    const k = dolmetscherKennzeichen("en");
    expect(k?.titel).toBe("Dolmetscher nötig");
    expect(k?.text).toContain("Käufer spricht Englisch");
    expect(dolmetscherKennzeichen("en", "Englisch")?.text).toContain("Dolmetscher für Englisch");
  });

  it("steht im gedruckten Bogen nur bei Englisch", async () => {
    const leer = {} as KaufvertragData;
    await generateKaufvertragPDF(leer, { kundenSprache: "en" });
    expect(alles()).toContain("Dolmetscher nötig");
    mitschnitt.texte.length = 0;
    await generateKaufvertragPDF(leer, { kundenSprache: "de" });
    expect(alles()).not.toContain("Dolmetscher nötig");
    mitschnitt.texte.length = 0;
    await generateKaufvertragPDF(leer);
    expect(alles()).not.toContain("Dolmetscher nötig");
  });

  it("der Hinweis für den Kunden sagt, dass die Urkunde deutsch ist", () => {
    expect(NOTAR_SPRACHHINWEIS.en.text).toContain("drawn up in German");
    expect(NOTAR_SPRACHHINWEIS.en.text).toContain("interpreter");
  });
});

describe("Protokoll der Einwilligung", () => {
  const jetzt = new Date("2026-09-25T12:30:00Z");

  it("Deutsch genau im bisherigen Wortlaut", () => {
    const text = einwilligungsProtokoll({ dok: "selbstauskunft", sprache: "de", name: "Emily Carter", jetzt });
    expect(text).toBe(
      `Ich, Emily Carter, bestätige hiermit die Richtigkeit und Vollständigkeit meiner Angaben in der Selbstauskunft. Ich bin damit einverstanden, dass meine Unterschrift elektronisch erfasst und gespeichert wird. Datum: ${jetzt.toLocaleString("de-DE")}`,
    );
  });

  it("Englisch mit Sprache, Fassung und dem deutschen, maßgeblichen Wortlaut", () => {
    const text = einwilligungsProtokoll({
      dok: "reservierung",
      sprache: "en",
      name: "Emily Carter",
      bestaetigung: { de: "Ich/Wir bestätige/n …", en: "I/We confirm …" },
      wahl: { de: "Ich verlange ausdrücklich …", en: "I expressly request …" },
      ort: "London",
      fassung: `${TEXT_FASSUNG} (DE, maßgeblich) / ${TEXT_FASSUNG_EN} (EN)`,
      jetzt,
    });
    expect(text.startsWith(`[Sprache: en; Einwilligung ${EINWILLIGUNG_FASSUNG_EN}; Fassung ${TEXT_FASSUNG} (DE, maßgeblich)`)).toBe(true);
    expect(text).toContain("I, Emily Carter, hereby confirm");
    expect(text).toContain("Chosen start of the reservation: I expressly request …");
    expect(text).toContain("| DE: Ich, Emily Carter, bestätige hiermit");
    expect(text).toContain("Ort: London.");
  });

  it("der deutsche Einwilligungstext am Kästchen ist unverändert", () => {
    expect(einwilligungText("selbstauskunft", "de")).toBe(
      "Ich bestätige die Richtigkeit und Vollständigkeit meiner Angaben in der Selbstauskunft. Ich bin damit einverstanden, dass meine Unterschrift elektronisch erfasst, gespeichert und zur Dokumentation der Selbstauskunft verwendet wird. Mir ist bewusst, dass diese elektronische Unterschrift eine einfache elektronische Signatur (EES) gemäß eIDAS-Verordnung darstellt.",
    );
    expect(einwilligungText("reservierung", "en", "X")).toContain("simple electronic signature");
  });

  it("kein Gedankenstrich in den englischen Texten", () => {
    for (const dok of ["reservierung", "selbstauskunft", "aftersales"] as const) {
      expect(einwilligungText(dok, "en", "")).not.toMatch(/[–—]/);
    }
    expect(NOTAR_SPRACHHINWEIS.en.text).not.toMatch(/[–—]/);
  });
});

describe("Ausfüllbares Formular auf Englisch", () => {
  it("die englische Datei hat dieselben Felder wie die deutsche", async () => {
    expect(saFormularDatei("en").pfad).toBe(SA_FORMULAR_PFAD_EN);
    expect(saFormularDatei("de").pfad).toBe(SA_FORMULAR_PFAD);
    expect(saFormularDatei(undefined).pfad).toBe(SA_FORMULAR_PFAD);
    const { PDFDocument } = await import("pdf-lib");
    const felder = async (pfad: string) => {
      const bytes = readFileSync(resolve(process.cwd(), "public", pfad.replace(/^\//, "")));
      // Als eigenes Uint8Array, sonst hält pdf-lib den Node-Puffer unter jsdom für keinen.
      const doc = await PDFDocument.load(Uint8Array.from(bytes));
      return doc.getForm().getFields().map((f) => f.getName()).sort();
    };
    const de = await felder(SA_FORMULAR_PFAD);
    const en = await felder(SA_FORMULAR_PFAD_EN);
    expect(en.length).toBeGreaterThan(300);
    expect(en).toEqual(de);
  });
});
