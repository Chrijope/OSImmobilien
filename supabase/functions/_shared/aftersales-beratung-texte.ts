/**
 * Die Texte des Aftersales-Beratungsdokuments, eine Quelle für beide PDFs.
 *
 * Bis zum 25.09.2026 standen sie doppelt: im Browser
 * (`src/lib/aftersalesBeratungPdf.ts`, Vorschau und Unterschrift auf der
 * Signaturseite) und in `finalize-aftersales-beratung` (das endgültige PDF im
 * Kundenordner). Die beiden Fassungen widersprachen sich schon: Der Browser
 * duzte in einem Punkt, der Server siezte, und nur der Server hatte den
 * Kontakt-Rhythmus. Plan Kundensprache, Etappe 5 (D17): vor der Übersetzung
 * zusammenführen, sonst werden zwei Fassungen falsch gepflegt.
 *
 * Entschieden beim Zusammenführen:
 *   - Sie-Form. Das Dokument wird von beiden Seiten unterschrieben und gehört
 *     damit zur Gruppe F (Plan 4.4: „Aftersales-Unterschrift“), wie Verträge.
 *   - Beide PDFs zeigen denselben Inhalt: Einleitung, Vertragspartner,
 *     Leistungen, Kontakt-Rhythmus, Bemerkungen, Ort und Datum, Unterschriften.
 *   - Keine Gedankenstriche mehr in den Leistungen.
 *
 * Englisch förmlich, ohne Kurzformen, Begriffe nach
 * `src/lib/kundenspracheGlossar.ts`. Die Schlüssel der Leistungen sind die
 * gespeicherten Werte aus dem Dialog und werden nie übersetzt.
 *
 * Diese Datei läuft im Browser und in Deno, deshalb nichts, was nur eines
 * von beiden kennt.
 */

import { datumText, datumUhrzeitText } from "./sprach-format.ts";

export type AftersalesSprache = "de" | "en";

export const AFTERSALES_LEISTUNG_SCHLUESSEL = [
  "mieterwechsel",
  "mieterhoehung",
  "hausverwaltung",
  "verkauf10jahre",
  "ehegattenschaukel",
  "empfehlungsprogramm",
] as const;
export type AftersalesLeistung = (typeof AFTERSALES_LEISTUNG_SCHLUESSEL)[number];

export interface AftersalesTexte {
  titel: string;
  erstelltAm: (datum: string) => string;
  einleitung: string;
  abschnittPartner: string;
  kunde: string;
  kaeufer2: string;
  anschrift: string;
  vertriebspartner: string;
  emailVp: string;
  objektAdresse: string;
  kaufdatum: string;
  abschnittLeistungen: string;
  leistungen: Record<AftersalesLeistung, string>;
  abschnittRhythmus: string;
  rhythmus: string[];
  abschnittBemerkungen: string;
  abschnittOrt: string;
  beratungsort: string;
  beratungsdatum: string;
  abschnittUnterschriften: string;
  unterschriebenAm: (zeitpunkt: string) => string;
  ees: string;
  ausstehend: string;
  leer: string;
  dateiname: (name: string, datum: string) => string;
}

export const AFTERSALES_TEXTE: Record<AftersalesSprache, AftersalesTexte> = {
  de: {
    titel: "Aftersales-Beratungsdokument",
    erstelltAm: (datum) => `Erstellt am: ${datum}`,
    einleitung:
      "Dieses Dokument hält die im Anschluss an den Notartermin vereinbarten Aftersales-Leistungen zwischen Vertriebspartner und Kunde fest. Mit den beidseitigen Unterschriften bestätigen die Parteien Inhalt und Umfang der besprochenen Betreuung.",
    abschnittPartner: "1. Vertragspartner",
    kunde: "Kunde",
    kaeufer2: "Käufer 2",
    anschrift: "Anschrift",
    vertriebspartner: "Vertriebspartner",
    emailVp: "E-Mail VP",
    objektAdresse: "Objekt-Adresse",
    kaufdatum: "Kaufdatum / Notartermin",
    abschnittLeistungen: "2. Vereinbarte Aftersales-Leistungen",
    leistungen: {
      mieterwechsel:
        "Begleitung beim ersten Mieterwechsel; die objekteigene Hausverwaltung (sofern beauftragt) unterstützt zusätzlich beim Übergabeprotokoll",
      mieterhoehung:
        "Beratung zu Mieterhöhungen nach §§ 558, 559 BGB; sie wird von der Hausverwaltung übernommen, die Sie hierzu laufend betreut",
      hausverwaltung: "Unterstützung bei Hausverwaltungs-Anfragen",
      verkauf10jahre: "Vorbereitung auf den steuerfreien Verkauf nach 10 Jahren",
      ehegattenschaukel: "Beratung zur Ehegattenschaukel oder Übertragung an Kinder",
      empfehlungsprogramm: "Aufnahme ins Empfehlungsprogramm (Provision bei Weiterempfehlung)",
    },
    abschnittRhythmus: "3. Kontakt-Rhythmus",
    rhythmus: [
      "• 1. Quartal nach Kauf: Statusgespräch (Vermietung, Mietzahlung, Banküberweisungen)",
      "• Halbjährlich: Performance-Review (Cashflow, Mietsteigerung, Marktwert-Entwicklung)",
      "• Jährlich: Steuer-Update und Strategie-Anpassung",
      "• Ad hoc: Bei jeder Frage erreichbar per E-Mail, Telefon und Portal-Chat",
      "Hinweis: Bitte gehen Sie auf Ihren Ansprechpartner zu, sobald Sie eine dieser Unterstützungen wünschen. Ansonsten melden wir uns zu den oben genannten Terminen.",
    ],
    abschnittBemerkungen: "4. Bemerkungen",
    abschnittOrt: "5. Ort & Datum der Beratung",
    beratungsort: "Beratungsort",
    beratungsdatum: "Beratungsdatum",
    abschnittUnterschriften: "6. Unterschriften",
    unterschriebenAm: (zeitpunkt) => `Unterschrieben am: ${zeitpunkt}`,
    ees: "Einfache elektronische Signatur (EES)",
    ausstehend: "Ausstehend",
    leer: "-",
    dateiname: (name, datum) => `Aftersales-Beratung_${name}_${datum}.pdf`,
  },
  en: {
    titel: "After-sales consultation document",
    erstelltAm: (datum) => `Prepared on: ${datum}`,
    einleitung:
      "This document records the after-sales services agreed between the sales partner and the customer following the notary appointment. By signing, both parties confirm the content and scope of the support discussed.",
    abschnittPartner: "1. Contracting parties",
    kunde: "Customer",
    kaeufer2: "Buyer 2",
    anschrift: "Address",
    vertriebspartner: "Sales partner",
    emailVp: "Sales partner email",
    objektAdresse: "Property address",
    kaufdatum: "Purchase date / notary appointment",
    abschnittLeistungen: "2. Agreed after-sales services",
    leistungen: {
      mieterwechsel:
        "Support with the first change of tenant; the property's own management company (if appointed) also assists with the handover report",
      mieterhoehung:
        "Advice on rent increases under Sections 558 and 559 BGB; this is handled by the management company, which supports you on an ongoing basis",
      hausverwaltung: "Support with enquiries to the management company",
      verkauf10jahre: "Preparation for the tax-free sale after 10 years",
      ehegattenschaukel: "Advice on transfers between spouses (Ehegattenschaukel) or transfer to children",
      empfehlungsprogramm: "Admission to the referral programme (commission for referrals)",
    },
    abschnittRhythmus: "3. Contact schedule",
    rhythmus: [
      "• First quarter after purchase: status meeting (letting, rent payments, bank transfers)",
      "• Every six months: performance review (cash flow, rent increases, market value development)",
      "• Annually: tax update and strategy adjustment",
      "• As needed: available for any question by email, telephone and portal chat",
      "Note: Please contact your contact person as soon as you would like any of this support. Otherwise, we will contact you at the times stated above.",
    ],
    abschnittBemerkungen: "4. Remarks",
    abschnittOrt: "5. Place & date of the consultation",
    beratungsort: "Place of consultation",
    beratungsdatum: "Date of consultation",
    abschnittUnterschriften: "6. Signatures",
    unterschriebenAm: (zeitpunkt) => `Signed on: ${zeitpunkt}`,
    ees: "Simple electronic signature (EES)",
    ausstehend: "Pending",
    leer: "-",
    dateiname: (name, datum) => `After-sales-consultation_${name}_${datum}.pdf`,
  },
};

export function aftersalesTexte(sprache: string | null | undefined): AftersalesTexte {
  return sprache === "en" ? AFTERSALES_TEXTE.en : AFTERSALES_TEXTE.de;
}

/**
 * Datum im Dokument. Deutsch wie bisher über `toLocaleDateString`, Englisch
 * über `sprach-format.ts` („25 Sep 2026“), damit Browser und Server gleich
 * schreiben.
 */
export function aftersalesDatum(wert: Date, sprache: AftersalesSprache): string {
  return sprache === "en" ? datumText(wert, "en") : wert.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });
}

/** Zeitpunkt der Unterschrift, wie `aftersalesDatum`. */
export function aftersalesZeitpunkt(wert: Date, sprache: AftersalesSprache): string {
  return sprache === "en" ? datumUhrzeitText(wert, "en") : wert.toLocaleString("de-DE", { timeZone: "Europe/Berlin" });
}

