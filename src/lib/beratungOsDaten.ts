/**
 * Inhalte der neuen Beratungspräsentation (Entwurf vom 15.10.2026).
 *
 * Texte und Zahlen stehen hier, die Darstellung in
 * `src/pages/BeratungspraesentationHV.tsx`. Die Zahlen der Objekte sind für
 * die Vorschau fest aus den Exposés übernommen (Stand 14.10.2026,
 * Musterperson 80.000 € brutto, 42 % Grenzsteuersatz). Nach der Freigabe
 * kommen die Objekte aus „Objekte“ im CRM, gefiltert nach dem Merkmal
 * „Konzept“, und die Rechnung aus dem Investmentrechner.
 *
 * Alle Texte stehen in Du-Form (Hausregel: immer duzen, auch Kunden). Eine
 * Sie-Fassung gibt es nicht mehr; bewacht in `duAnrede.test.ts`.
 */

export type KonzeptOs = "zusatzrente" | "steuer";


/**
 * Der Schwerpunkt aus dem Erstgespräch belegt den Konzeptschalter vor.
 * „beides“ und ein fehlender Wert starten bei der Zusatzrente, weil der
 * Ablauf dort mit den meisten Objekten beginnt.
 */
export function konzeptAusSchwerpunkt(schwerpunkt: unknown): KonzeptOs {
  return schwerpunkt === "steuer" ? "steuer" : "zusatzrente";
}

/**
 * Vorname für die Begrüßung im Hero („Herzlich willkommen, Anna.“).
 *
 * Reihenfolge: Vorname am Kontakt, dann der Parameter `vorname`, dann das
 * erste Wort von `kunde` („Vorname Nachname“ aus dem Kundenprofil). Der
 * Kontakt kann beim ersten Bild noch nicht geladen sein, deshalb die
 * Parameter. Ohne brauchbaren Namen leer: Die Seite grüßt dann neutral.
 * Das Kundenprofil baut `kunde` aus Vor- und Nachname zusammen; fehlt einer,
 * steht dort „undefined“, und daraus darf kein Name werden.
 */
export function begruessungsName(kontaktVorname: unknown, vornameParam?: string | null, kundeParam?: string | null): string {
  const brauchbar = (v: unknown) => {
    const s = typeof v === "string" ? v.trim() : "";
    return s && s !== "undefined" && s !== "null" ? s : "";
  };
  return brauchbar(kontaktVorname) || brauchbar(vornameParam) || brauchbar(brauchbar(kundeParam).split(/\s+/)[0]);
}

/** Rentenlücke je Monat und über 25 Jahre Ruhestand, ohne Inflation. */
export const RUHESTAND_JAHRE = 25;
export function rentenluecke(wunschNetto: number, erwarteteRente: number): { monat: number; gesamt: number } | null {
  if (!(wunschNetto > 0) || !(erwarteteRente >= 0)) return null;
  const monat = Math.max(0, wunschNetto - erwarteteRente);
  return { monat, gesamt: monat * 12 * RUHESTAND_JAHRE };
}

/**
 * Vermögen nach 30 Jahren: Wert der Immobilie bei jährlicher Wertentwicklung
 * minus Restschuld. Die Restschuld ist je Objekt so gewählt, dass bei 2 %
 * genau die Exposé-Werte herauskommen (Hauffstraße 278.000 €, Barfusstraße
 * 572.000 €). ponytail: feste Restschuld aus dem Exposé; im Bau liefert sie
 * der Investmentrechner für das gewählte Objekt.
 */
export const PLAN_JAHRE = 30;
export function wertNach(kaufpreis: number, wertentwicklungProzent: number, jahre = PLAN_JAHRE): number {
  return kaufpreis * Math.pow(1 + wertentwicklungProzent / 100, jahre);
}
export function vermoegenNach(kaufpreis: number, restschuld: number, wertentwicklungProzent: number): number {
  return wertNach(kaufpreis, wertentwicklungProzent) - restschuld;
}
/** Auf volle Tausend, so wie die Exposés runden. */
export const aufTausend = (n: number) => Math.round(n / 1000) * 1000;

/** Rechengrundlage je Konzept für den Regler „Wertentwicklung“. */
export const PLAN_OBJEKT: Record<KonzeptOs, { name: string; kaufpreis: number; restschuld: number }> = {
  zusatzrente: { name: "Hauffstraße 38", kaufpreis: 176_000, restschuld: 40_470 },
  steuer: { name: "Barfusstraße 9", kaufpreis: 361_600, restschuld: 82_990 },
};

export const OS_TEXTE = {
  hero: {
    kicker: "OS Real Estate · Vermögensaufbau mit Immobilien",
    titel: "Strategischer Vermögensaufbau",
    titelAkzent: "mit vermieteten Immobilien",
    willkommen: "Herzlich willkommen",
    unterzeile: "Steuern sparen. Zusatzrente aufbauen. Persönlich begleitet.",
    start: "Beratung starten",
    konzepte: "Konzepte ansehen",
  },

  heute: {
    kicker: "01 · Unser Termin",
    titel: "Was machen wir [[heute?]]",
    text: "Heute geht es nicht ums Unterschreiben. Wir schauen gemeinsam, ob eine vermietete Immobilie zu deinen Zielen passt, gerechnet mit deinen Zahlen, vor und nach Steuern.",
    punkte: [
      { titel: "Deine Ziele", text: "Was du uns im Erstgespräch gesagt hast." },
      { titel: "Das Konzept", text: "Zusatzrente oder Steuerersparnis: Wie es funktioniert." },
      { titel: "Echte Objekte", text: "Mit den Zahlen aus unseren Exposés." },
      { titel: "Deine Entscheidung", text: "Passt das Konzept? Dann der nächste Schritt." },
    ] as ReadonlyArray<{ titel: string; text: string }>,
    fuss: "Am Ende entscheidest du: Ja, Nein oder Ja unter einer Bedingung. Alles ist in Ordnung.",
  },

  ziele: {
    kicker: "02 · Deine Ziele",
    titel: "Das hast du [[uns gesagt.]]",
    zielKopf: "Deine wichtigsten Ziele (aus dem Erstgespräch)",
    nachfrage: "Stimmt das noch so? Was würdest du heute ergänzen?",
    rahmen: "Dein Rahmen",
    tragbar: "Monatlich gut tragbar (vor Steuern)",
    reserve: "Reserve, die unangetastet bleibt",
    eigenkapital: "Eigenkapital für Nebenkosten",
    mitentscheider: "Mitentscheider",
    zitatPlatzhalter: "Den wichtigsten Satz des Kunden wörtlich mitschreiben",
    ersteFrage: "Deine erste Frage für heute",
  },

  luecke: {
    kicker: "03 · Deine Ausgangslage",
    titel: "Deine [[Rentenlücke]] in Zahlen.",
    gewuenscht: "Gewünscht im Ruhestand",
    gewuenschtText: "netto im Monat",
    rente: "Erwartete Rente",
    renteText: "laut Renteninformation",
    luecke: "Lücke",
    lueckeText: "jeden Monat",
    gesamt: `Über ${RUHESTAND_JAHRE} Jahre Ruhestand`,
    gesamtText: "die fehlen",
    // Als string, damit Fassung B (beratungOsDatenB.ts) hier siezen und duzen kann.
    frage: "Was passiert, wenn diese Lücke einfach bleibt?",
    fuss: "Werte aus dem Erstgespräch. Rechnung ohne Inflation, als Größenordnung.",
    ruhestandAb: "Ruhestand ab (Alter)",
  },

  nichtstun: {
    kicker: "04 · Der Preis des Nichtstuns",
    titel: "Geld auf dem Konto wird [[jedes Jahr weniger wert.]]",
    karten: [
      { kopf: "Heute auf dem Tagesgeld", wert: "50.000 €", text: "zu 2 % Zinsen" },
      { kopf: "Nach 10 Jahren auf dem Konto", wert: "60.950 €", text: "sieht nach mehr aus" },
      { kopf: "Kaufkraft bei 2,5 % Inflation", wert: "47.615 €", text: "tatsächlich weniger wert", warnung: true },
    ],
    satz: "Und wer ein Jahr wartet, verschenkt ein Jahr Tilgung, die sonst Mieter und Steuerwirkung mittragen.",
    fuss: "Wenn deine Reserve oder Lebensplanung noch nicht passt, ist Warten die bessere Wahl. Das sagen wir dir dann offen.",
  },

  werWirSind: {
    kicker: "05 · Wer wir sind",
    titel: "OS Real Estate [[in einem Satz.]]",
    text: "Wir vermitteln geprüfte, vermietete Wohnimmobilien in Berlin und Brandenburg als Kapitalanlage und begleiten dich vom ersten Gespräch bis zur Kaufpreiszahlung.",
    karten: [
      { titel: "Geprüfte Objekte", text: "Lage, Miete, Zustand und Unterlagen prüfen wir, bevor wir ein Objekt anbieten." },
      { titel: "Deine Zahlen", text: "Jede Rechnung mit deinem Einkommen, vor und nach Steuern, mit Stresstest." },
      { titel: "Ein Ansprechpartner", text: "Von der Konzeptwahl über Bank und Notar bis zur Übergabe." },
      { titel: "Offen gesagt", text: "Wir verdienen an der Vermittlung. Steuer-, Rechts- und Finanzierungsberatung leisten Steuerberater, Notare und Banken." },
    ] as ReadonlyArray<{ titel: string; text: string }>,
    fuss: "Teil der OS Immobilien Holding GmbH · Am Ostbahnhof 1 · 15749 Mittenwalde",
  },

  gruppe: {
    kicker: "05 · Die Unternehmensgruppe",
    titel: "Alles aus einer Hand, [[unter einem Dach.]]",
    dach: "OS Immobilien Holding GmbH",
    dachText: "Dach der Gruppe mit Sitz in Mittenwalde, Berlin-Brandenburg",
    marken: [
      {
        name: "Real Estate",
        zusatz: "GmbH",
        farbe: "#D8C7A0",
        text: "Auswahl und Vermittlung geprüfter Kapitalanlage-Immobilien. Dein Ansprechpartner von heute bis zum Notar.",
      },
      {
        name: "Verwaltung",
        zusatz: "GmbH",
        farbe: "#6F9A7E",
        text: "Verwaltung von Objekten und Einheiten. Vermietung und Betreuung, auch nach dem Kauf.",
      },
      {
        name: "Finanzierung",
        zusatz: "Marke der OS Immobilien Holding",
        farbe: "#4A8CA6",
        text: "Begleitung auf dem Weg zur Bank, von den Unterlagen bis zur Finanzierungszusage.",
      },
    ] as ReadonlyArray<{ name: string; zusatz: string; farbe: string; text: string }>,
    fuss: "Ein Haus, kurze Wege: Objekt, Verwaltung und Finanzierung sind aufeinander abgestimmt.",
    // Vorteile unter den Logos. `marke` ordnet eine Kachel farblich einer Marke oben zu.
    vorteile: [
      { titel: "Rundum-sorglos", text: "Wir begleiten dich von der Auswahl bis nach der Vermietung." },
      { titel: "Provisionsfrei", text: "Du kaufst direkt vom Bauträger, ohne Maklerprovision." },
      { titel: "Verwaltung", text: "Hausverwaltung und Mietsonderverwaltung auf Wunsch aus einer Hand.", marke: "Verwaltung" },
      { titel: "Finanzierung", text: "Finanzierung auch ohne Eigenkapital möglich.", marke: "Finanzierung" },
    ] as ReadonlyArray<{ titel: string; text: string; marke?: string }>,
  },

  prinzip: {
    kicker: "06 · Das Prinzip",
    titel: "Vier Bausteine, die [[zusammenarbeiten.]]",
    bausteine: [
      { titel: "Miete", text: "Dein Mieter trägt den größten Teil der Rate." },
      { titel: "Tilgung", text: "Jeden Monat gehört dir ein Stück mehr der Immobilie." },
      { titel: "Steuer", text: "Zinsen, Kosten und Abschreibung können deine Steuer senken." },
      { titel: "Wert", text: "Ein Sachwert, der langfristig mit der Inflation wachsen kann." },
    ] as ReadonlyArray<{ titel: string; text: string }>,
    // Die Prozente rechnet die Seite aus RATE_EINGANG.hauffstrasse (rateAnteile.ts).
    anteile: [
      { label: "Miete", teil: "mieter", farbe: "#6F9A7E" },
      { label: "Steuer", teil: "finanzamt", farbe: "#D8C7A0" },
      { label: "Du", teil: "kunde", farbe: "#CCAC05" },
    ] as ReadonlyArray<{ label: string; teil: "mieter" | "finanzamt" | "kunde"; farbe: string }>,
    frage: "Wer trägt deine Rate?",
    fuss: "Beispiel Hauffstraße 38: Rate 880 € + Hausgeld; Verhältnis gerundet. Die Steuerwirkung hängt von deinem persönlichen Steuersatz ab.",
  },

  konzept: {
    kicker: "07 · Dein Konzept",
    titel: "Welches Ziel steht für dich [[an erster Stelle?]]",
    karten: {
      zusatzrente: {
        nummer: "Konzept 1",
        titel1: "Heute kaufen.",
        titel2: "Später Zusatzrente.",
        text: "Mieter und Steuer zahlen deine Immobilie ab. Im Ruhestand gehört sie dir, und die Miete wird zu deiner zweiten Rente.",
        objekte: "Passende Objekte: Hauffstraße 38 bei Potsdam · Doppelhaushälften Zossen-Wünsdorf",
      },
      steuer: {
        nummer: "Konzept 2",
        titel1: "Steuern sparen.",
        titel2: "Mehr Netto vom Brutto.",
        text: "Ein Teil deiner Lohnsteuer fließt in dein eigenes Vermögen statt ans Finanzamt. Für Einkommen mit hohem Steuersatz.",
        objekte: "Passendes Objekt: Barfusstraße 9, Berlin-Wedding",
      },
    } as Record<KonzeptOs, { nummer: string; titel1: string; titel2: string; text: string; objekte: string }>,
    ausgewaehlt: "Ausgewählt",
    auswaehlen: "Auswählen",
    fuss: "Der Schalter ist vorbelegt mit dem Schwerpunkt aus dem Erstgespräch. Die folgenden Abschnitte zeigen das gewählte Konzept; ein Klick wechselt jederzeit.",
    schalter: { zusatzrente: "Konzept 1 · Zusatzrente", steuer: "Konzept 2 · Steuerersparnis" } as Record<KonzeptOs, string>,
  },

  funktion: {
    kicker: "08 · So funktioniert es",
    zusatzrente: {
      titel: "Heute kaufen. Abbezahlen lassen. [[Später Zusatzrente.]]",
      schritte: [
        { titel: "Heute", text: "Du kaufst eine vermietete Wohnung, finanziert durch die Bank. Eigenkapital nur für die Nebenkosten." },
        { titel: "30 Jahre", text: "Mieter und Steuerwirkung tragen den größten Teil der Rate. Dein Eigenanteil ist ein überschaubarer Monatsbetrag." },
        { titel: "Ruhestand", text: "Die Immobilie ist weitgehend abbezahlt. Die Miete fließt als Zusatzrente zu dir." },
        { titel: "Deine Wahl", text: "Behalten, verkaufen oder vererben. Du entscheidest dann." },
      ] as ReadonlyArray<{ titel: string; text: string }>,
      karteObjekt: "Hauffstraße 38, WE 01",
      zusatzrente: "920 €",
      zusatzrenteText: "Zusatzrente im Monat ab 2061, nach laufenden Kosten rund 590 €",
      eigenanteilKopf: "Dein Eigenanteil heute",
      eigenanteil: "151 €",
      eigenanteilText: "im Monat nach Steuern (391 € vor Steuern)",
      vermoegenKopf: `Vermögen nach ${PLAN_JAHRE} Jahren`,
      fuss: "Zahlen aus dem Exposé (Stand 14.10.2026), Musterperson 80.000 € brutto. Szenario, keine Zusage. Die Zusatzrente von 2061 entspricht heute weniger Kaufkraft.",
    },
    steuer: {
      titel: "Mehr Netto vom Brutto. [[Steuer wird zu Vermögen.]]",
      heute: "Heute",
      brutto: "Brutto im Monat",
      bruttoWert: "6.667 €",
      netto: "Netto im Monat",
      nettoWert: "3.980 €",
      mit: "Mit Barfusstraße 9, WE 03",
      steuerwirkung: "Steuerwirkung im Monat",
      steuerwirkungWert: "+ 940 €",
      nettoNeu: "4.920 €",
      karten: [
        { kopf: "Steuerersparnis 1. Jahr", wert: "11.278 €", text: "" },
        { kopf: "In 10 Jahren", wert: "106.477 €", text: "" },
        { kopf: "Ergebnis nach Steuern", wert: "−4 €", text: "im Monat, darin 362 € Tilgung" },
      ],
      fuss: "Exposé-Rechnung mit 42 % Grenzsteuersatz und 5,6 % AfA laut Ersteinschätzung (Gutachten nötig). Mit Regel-AfA 2,5 % rund −390 € im Monat. Dein Wert hängt von deinem Steuersatz ab. Keine Steuerberatung.",
    },
  },

  objekte: {
    kicker: { zusatzrente: "09 · Unsere Objekte für dein Konzept", steuer: "09 · Unser Objekt für dein Konzept" } as Record<KonzeptOs, string>,
    hauff: {
      titel: "Hauffstraße 38, Schwielowsee bei Potsdam",
      text: "Baujahr 2000 · 46 Wohnungen · 42 bis 80 m² · mit Garage · Aufzug · 350.000 € Instandhaltung 2020 bis 2026",
      preis: "ab 176.000 €",
      preisRest: "inkl. Garage · Eigenanteil ab 151 € nach Steuern",
    },
    zossen: {
      titel: "Doppelhaushälften Zossen-Wünsdorf",
      text: "Eigenes Grundstück 600 bis 800 m² · kein Hausgeld · Bahnhof 650 m · BER 22 km",
      preis: "ab 379.000 €",
      preisRest: "inkl. Sanierungspaket · Überschuss ab +349 € im Monat nach Steuern",
    },
    barfuss: {
      titel1: "Barfusstraße 9",
      titel2: "Berlin-Wedding",
      text: "Gründerzeit-Altbau um 1900, Bezirk Mitte, U6 vor der Tür, Volkspark Rehberge und Schillerpark nebenan.",
      zeilen: [
        ["Wohnungen", "28 verfügbar"],
        ["Größen", "37 bis 92 m²"],
        ["Kaufpreise", "186.850 bis 469.000 €"],
        ["Steuerersparnis 1. Jahr", "5.828 bis 14.348 €"],
        ["Ergebnis nach Steuern", "−23 bis +163 € im Monat"],
      ] as ReadonlyArray<readonly [string, string]>,
      fuss: "Laut Exposés mit 5,6 % AfA (Ersteinschätzung, Gutachten nötig) und 42 % Steuersatz.",
    },
    fuss: "Die Objekte kommen aus „Objekte“ im CRM, gefiltert nach dem Konzept-Merkmal am Objekt. Nur verfügbare Einheiten erscheinen.",
  },

  rechnung: {
    kicker: "10 · Die Rechnung, Zeile für Zeile",
    spalteZeile: "Im Monat, 1. Jahr",
    spalteBetrag: "Betrag",
    zusatzrente: {
      titel: "Hauffstraße 38, WE 01 · 42,53 m² · 176.000 €",
      zeilen: [
        { text: "Miete vom Mieter", betrag: "+ 553 €", ton: "plus" },
        { text: "Garagenmiete", betrag: "+ 100 €", ton: "plus" },
        { text: "Zins und Tilgung (4,8 % / 1,2 %)", betrag: "− 880 €", ton: "minus" },
        { text: "Hausgeld, nicht umlagefähig", betrag: "− 164 €", ton: "minus" },
        { text: "Ergebnis vor Steuern", betrag: "− 391 €", ton: "summe" },
        { text: "Steuerwirkung (3,1 % AfA, 42 %)", betrag: "+ 241 €", ton: "plus" },
        { text: "Dein Eigenanteil nach Steuern", betrag: "− 151 €", ton: "ergebnis" },
        { text: "mit Regel-AfA 2 % (ohne Gutachten)", betrag: "≈ − 210 €", ton: "klein" },
      ],
      karten: [
        { kopf: "Darin stecken", wert: "176 €", text: "Tilgung im Monat. Das ist Vermögen, das dir gehört." },
        { kopf: "Nach 10 Jahren getilgt", wert: "26.318 €", text: "" },
        { kopf: "Eigenkapital für Nebenkosten", wert: "14.960 €", text: "" },
      ],
      fuss: "Quelle: Exposé Hauffstraße 38 WE01, Musterrechnung S. 9. In der Präsentation wird die Rechnung mit dem Investmentrechner auf die Zahlen des Kunden umgestellt. „≈“-Wert von uns nachgerechnet.",
    },
    steuer: {
      titel: "Barfusstraße 9, WE 03 · 72,32 m² · 361.600 €",
      zeilen: [
        { text: "Miete vom Mieter", betrag: "+ 976 €", ton: "plus" },
        { text: "Zins und Tilgung (4,8 % / 1,2 %)", betrag: "− 1.808 €", ton: "minus" },
        { text: "Hausgeld, nicht umlagefähig, inkl. Rücklage", betrag: "− 112 €", ton: "minus" },
        { text: "Ergebnis vor Steuern", betrag: "− 943 €", ton: "summe" },
        { text: "Steuerwirkung (5,6 % AfA, 42 %)", betrag: "+ 940 €", ton: "plus" },
        { text: "Dein Ergebnis nach Steuern", betrag: "− 4 €", ton: "ergebnis" },
        { text: "mit Regel-AfA 2,5 % (ohne Gutachten)", betrag: "≈ − 390 €", ton: "klein" },
      ],
      karten: [
        { kopf: "Darin stecken", wert: "362 €", text: "Tilgung im Monat, die dein Vermögen aufbaut." },
        { kopf: "Nach 10 Jahren getilgt", wert: "54.071 €", text: "" },
        { kopf: "Eigenkapital für Nebenkosten", wert: "28.928 €", text: "" },
      ],
      fuss: "Quelle: Exposé Barfusstraße 9 WE03, Musterrechnung S. 10; Regel-AfA-Zeile laut Gesprächsleitfaden Konzeptgespräch.",
    },
  } as {
    kicker: string;
    spalteZeile: string;
    spalteBetrag: string;
  } & Record<KonzeptOs, {
    titel: string;
    zeilen: ReadonlyArray<{ text: string; betrag: string; ton: "plus" | "minus" | "summe" | "ergebnis" | "klein" }>;
    karten: ReadonlyArray<{ kopf: string; wert: string; text: string }>;
    fuss: string;
  }>,

  sicherheit: {
    kicker: "11 · Sicherheit",
    titel: "Was, wenn es [[nicht nach Plan läuft?]]",
    karten: [
      { kopf: "Zins steigt ab Jahr 11 um 1 Punkt", wert: "+ 72 €", text: "im Monat nach Steuern" },
      { kopf: "Drei Monate Leerstand", wert: "≈ 1.970 €", text: "einmalig, aus deiner Reserve" },
      { kopf: "Finanzamt erkennt Gutachten nicht an", wert: "+ 59 €", text: "im Monat nach Steuern" },
    ] as ReadonlyArray<{ kopf: string; wert: string; text: string }>,
    satz: "Eine Rechnung, die nur funktioniert, wenn alles glatt läuft, ist nichts wert. Wo liegt deine Grenze, auch im Stressfall?",
    fuss: "Beispiel Hauffstraße 38 WE01, von uns nachgerechnet. Im CRM rechnet der Investmentrechner den Stresstest für das gewählte Objekt.",
    sorge: "Deine Sorge aus dem Erstgespräch",
  },

  plan: {
    kicker: "12 · Dein Plan",
    titel: "Eine Wohnung ist der Anfang. [[Drei sind ein Plan.]]",
    eins: "1 Wohnung",
    drei: "3 Wohnungen",
    satz: "Wir starten mit einer Wohnung. Jede weitere entscheidest du neu.",
    regler: "Wertentwicklung pro Jahr",
    fuss: (prozent: string) => `Zahlen aus dem Exposé, Portfolio-Seite. Szenario mit ${prozent} Wertentwicklung, keine Zusage.`,
  },

  kriterien: {
    kicker: "13 · Deine Kriterien",
    titel: "Du entscheidest, [[was passen muss.]]",
    konzept: "Mein Konzept",
    hoechstens: "Höchstens im Monat vor Steuern",
    grenze: "Grenze im Stressfall",
    eigenkapital: "Eigenkapital höchstens",
    reserve: "Reserve bleibt unangetastet",
    wichtig: "Das ist mir am wichtigsten",
    worteKopf: "Deine Worte",
    worteFrage: "„Warum ist das für dich der richtige Zeitpunkt?“",
    worteText: "Der Kunde formuliert seine Gründe selbst. Wir halten sie wörtlich fest; sie stehen später in der Objektpräsentation wieder vorn.",
    rahmenKopf: "Finanzierungsrahmen, gerechnet",
  },

  weg: {
    kicker: "14 · Dein Weg",
    titel: "So geht es [[weiter.]]",
    schritte: [
      { titel: "Qualifizierungsgespräch", text: "Ziele und Rahmen", stand: "erledigt" },
      { titel: "Beratung", text: "Konzept und Objekte", marke: "Heute", stand: "heute" },
      { titel: "Selbstauskunft", text: "gleich im Anschluss gemeinsam", marke: "Heute", stand: "heute" },
      { titel: "Unterlagen", text: "Ausweis und letzte Gehaltsabrechnung", marke: "Bis Tag 7" },
      { titel: "Objektpräsentation", text: "Exposé, Kalkulation und Finanzierungskonzept, Reservierung", marke: "Tag 7" },
      { titel: "Finanzierung", text: "Die Bank prüft und sagt zu" },
      { titel: "Bankgutachter", text: "Bewertung für die Bank" },
      { titel: "Besichtigung", text: "Am Notartag oder am Vortag, auch online" },
      { titel: "Notar", text: "Kaufvertrag" },
      { titel: "Kaufpreis", text: "Fälligkeit und Übergabe" },
    ] as ReadonlyArray<{ titel: string; text: string; marke?: string; stand?: "erledigt" | "heute" }>,
    satz: "Nach jedem Schritt entscheidest du, ob es weitergeht. Die Reservierung ist kostenfrei.",
  },

  schritt: {
    kicker: "15 · Der nächste Schritt",
    titel: "Wenn wir eine Immobilie finden, die [[deine Kriterien erfüllt]]: Möchtest du den nächsten Schritt gehen?",
    text: "Dafür brauchen wir deine Selbstauskunft. Wir füllen sie jetzt gemeinsam aus, das dauert etwa 15 Minuten. Bis zur Objektpräsentation in einer Woche fehlen dann nur noch Ausweis und letzte Gehaltsabrechnung.",
    knopf: "Selbstauskunft jetzt gemeinsam ausfüllen",
    termin: "Objektvorstellung",
    hinweis: "Gesprächshinweis: Frage stellen, dann schweigen.",
    /** Öffnet den Buchungslink „Objektvorstellung“ aus den Einstellungen (profiles.objektlink). */
    knopfObjekt: "Objektvorstellung buchen",
    ohneObjektLink: "Kein Buchungslink für die Objektvorstellung in den Einstellungen hinterlegt",
  },

  termin: {
    kicker: "16 · Dein nächster Termin",
    titel: "Das bekommst du [[in der Objektvorstellung.]]",
    karten: [
      { titel: "Deine Immobilie", text: "Eine Empfehlung, höchstens eine Alternative, passend zu deinen Kriterien." },
      { titel: "Deine Kalkulation", text: "Gerechnet mit deiner Selbstauskunft: vor und nach Steuern, mit Stresstest." },
      { titel: "Das Exposé", text: "Lage, Grundriss, Unterlagen, Kosten. Alles zum Nachlesen." },
      { titel: "Deine Entscheidung", text: "Passt es, reservierst du direkt. Kostenfrei." },
    ] as ReadonlyArray<{ titel: string; text: string }>,
    portalSatz: "Nach der gemeinsam ausgefüllten und von dir unterschriebenen Selbstauskunft lädst du Personalausweis und letzte Gehaltsabrechnung im Kundenportal hoch.",
    portalKnopf: "Kundenportal freigeben",
    portalVorUnterschrift: "Erst nach der unterschriebenen Selbstauskunft",
    portalFreigegeben: "Kundenportal ist freigegeben",
  },

  fuss: "Szenarien, keine Zusagen. Wir vermitteln Immobilien; Steuer-, Rechts- und Finanzierungsberatung leisten Steuerberater, Notare und Banken.",
};

/**
 * Plan je Konzept (Abschnitt 12). Die Vermögenszeile rechnet der Regler,
 * alles andere steht fest im Exposé.
 *
 * Konzept 2 zeigt der Entwurf nicht eigens; die Zahlen stammen aus der
 * Portfolio-Seite des Exposés Barfusstraße 9 WE03.
 */
export const PLAN_ZEILEN: Record<KonzeptOs, ReadonlyArray<{ text: string; eins: string; drei: string; vermoegen?: true; fett?: true }>> = {
  zusatzrente: [
    { text: "Kaufpreise", eins: "176.000 €", drei: "528.000 €" },
    { text: "Dein Eigenanteil im Monat nach Steuern", eins: "151 €", drei: "452 €" },
    { text: `Vermögen nach ${PLAN_JAHRE} Jahren`, eins: "", drei: "", vermoegen: true, fett: true },
    { text: "Zusatzrente im Monat ab 2061", eins: "920 €", drei: "2.750 €", fett: true },
  ],
  steuer: [
    { text: "Kaufpreise", eins: "362.000 €", drei: "1.085.000 €" },
    { text: "Dein Ergebnis im Monat nach Steuern, 1. Jahr", eins: "−4 €", drei: "−11 €" },
    { text: "Steuerersparnis in 10 Jahren", eins: "106.500 €", drei: "319.400 €" },
    { text: `Vermögen nach ${PLAN_JAHRE} Jahren`, eins: "", drei: "", vermoegen: true, fett: true },
    { text: "Zusatzrente im Monat ab 2061", eins: "1.300 €", drei: "3.910 €", fett: true },
  ],
};

/**
 * Ziele des Erstgesprächs in die Ziele der Präsentation (ANLAGE_ZIELE, gleiche
 * Liste wie in der Selbstauskunft). Gespeichert wird im Erstgespräch der
 * Wert links; „Vererben“ ist mit dem neuen Skript dazugekommen.
 */
export const ZIEL_ZUORDNUNG: Record<string, string> = {
  "Altersvorsorge": "Sorgenfrei im Alter durch eine Immobilienrente",
  "Steuern sparen": "Steuervorteile sichern",
  "Vermögensaufbau": "Vermögensaufbau und Werte schaffen",
  "Passives Einkommen": "Finanzielle Freiheit durch passives Einkommen",
  "Inflationsschutz": "Geldanlage und Inflationsschutz",
  "Familie absichern": "Sichere finanzielle Zukunft für die Kinder",
  "Vererben": "Sichere finanzielle Zukunft für die Kinder",
  "Eigenkapitalaufbau": "Kapitalaufbau für das spätere Eigenheim",
  "Frühe Rente": "Sorgenfrei im Alter durch eine Immobilienrente",
  "Unabhängigkeit": "Finanzielle Freiheit durch passives Einkommen",
};

/**
 * Antworten aus dem gespeicherten Erstgesprächsskript, die die Präsentation
 * übernimmt: Schlüssel der Präsentation → Wert. Leere Werte fehlen.
 *
 * Reine Funktion, damit die Zuordnung ohne Seite testbar ist. `kontakt`
 * liefert die Qualifizierungsfelder (qualEinkommen, qualEigenkapital), die
 * das Skript dort und nicht im Skriptstand ablegt.
 */
export function uebernahmeAusSkript(
  skript: { antworten?: Record<string, unknown>; ziele?: unknown } | null | undefined,
  kontakt: { qualEinkommen?: unknown; qualEigenkapital?: unknown } | null | undefined,
): Record<string, string> {
  const antworten = (skript?.antworten ?? {}) as Record<string, unknown>;
  const ergebnis: Record<string, string> = {};
  const setze = (schluessel: string, wert: unknown) => {
    if (typeof wert !== "string" && typeof wert !== "number") return;
    // Angehängte Währungszeichen entfernen, die Felder führen ihr eigenes.
    const sauber = String(wert).replace(/€/g, "").trim();
    if (sauber) ergebnis[schluessel] = sauber;
  };

  setze("einnahmen", kontakt?.qualEinkommen);
  // Das Skript vom 15.10.2026 fragt, was für die Nebenkosten eingesetzt
  // werden kann. Das ist der greifbare Teil („davon liquide verfügbar“), mit
  // dem der Finanzierungsrahmen rechnet. Ins Gesamtfeld geht derselbe Wert
  // als Untergrenze, wie bisher; der Berater korrigiert ihn im Termin.
  setze("eigenkapitalGesamt", kontakt?.qualEigenkapital);
  setze("eigenkapital", kontakt?.qualEigenkapital);
  setze("beitrag", antworten.investitionMonat);
  setze("erfahrung", antworten.erfahrung);
  // Neu mit dem Skript vom 15.10.2026
  setze("motiv", antworten.motivWoertlich);
  setze("reserve", antworten.reserve);
  setze("grenzeStress", antworten.grenzeStress);
  setze("mitentscheider", antworten.mitentscheider);
  setze("wunschNetto", antworten.wunschNetto);
  setze("renteErwartet", antworten.renteErwartet);
  setze("ruhestandAb", antworten.ruhestandAb);
  setze("sorgen", antworten.sorgen);
  setze("ersteFrage", antworten.offeneFragen);
  setze("schwerpunkt", antworten.schwerpunkt);

  const ziele = Array.isArray(skript?.ziele) ? (skript!.ziele as unknown[]) : [];
  const zugeordnet = [
    ...new Set(ziele.map((z) => (typeof z === "string" ? ZIEL_ZUORDNUNG[z] : undefined)).filter(Boolean)),
  ].slice(0, 3);
  if (zugeordnet.length) ergebnis.ziel = zugeordnet.join("; ");

  return ergebnis;
}
