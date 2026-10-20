/**
 * Inhalte der neuen Beratungspräsentation (Entwurf vom 15.10.2026).
 *
 * Texte und Zahlen stehen hier, die Darstellung in
 * `src/pages/BeratungspraesentationHV.tsx`. Die Inhalte der beiden
 * Vertriebs-PDFs (Abschnitt 08) stehen in `beratungKonzeptDaten.ts`. Die
 * frühere Objektrechnung (Abschnitte Rechnung, Stresstest, Plan) ist am
 * 16.10.2026 entfallen; gerechnet wird mit den Kundenzahlen in der
 * Objektvorstellung.
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

export const OS_TEXTE = {
  hero: {
    kicker: "OS Real Estate · Vermögensaufbau mit Immobilien",
    // Seit 20.10.2026: alle drei Konzepte im ersten Satz (Vermögen, Altersvorsorge, Steuer).
    titel: "Vermögensaufbau und Altersvorsorge",
    titelAkzent: "mit mehr Netto vom Brutto",
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
      { titel: "Echte Objekte", text: "Unsere drei Standorte in Berlin und Brandenburg." },
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
    /** Die Grafik dazu, Jahr für Jahr. Dieselben Annahmen wie die Karten (geprüft im Test). */
    grafik: {
      titel: "So verliert Geld auf dem Konto Jahr für Jahr an Kaufkraft",
      konto: "Kontostand mit 2 % Zinsen",
      kaufkraft: "Kaufkraft bei 2,5 % Inflation",
      startText: "50.000 € heute",
      start: 50_000,
      zins: 0.02,
      inflation: 0.025,
      jahre: 10,
      startjahr: 2026,
    },
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
    /** Ohne Profil (eigenständige Fassung): Platzhalter statt Name und Kontaktdaten. */
    platzhalter: {
      titel: "Dein Ansprechpartner stellt sich vor",
      satz: "Ich begleite dich persönlich, von heute bis zum Notartermin und darüber hinaus.",
      hinweisKopf: "Für dich als Berater:",
      hinweis: "Stell dich hier kurz selbst vor: Name, deine Rolle und warum du mit OS Real Estate arbeitest. Zwei bis drei Sätze reichen.",
    },
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
        objekte: "Passendes Objekt: Hauffstraße 38 bei Potsdam",
      },
      steuer: {
        nummer: "Konzept 2",
        titel1: "Steuern sparen.",
        titel2: "Mehr Netto vom Brutto.",
        text: "Ein Teil deiner Lohnsteuer fließt in dein eigenes Vermögen statt ans Finanzamt. Für Einkommen mit hohem Steuersatz.",
        objekte: "Passende Objekte: Barfusstraße 9, Berlin-Wedding · Doppelhaushälften Zossen-Wünsdorf",
      },
    } as Record<KonzeptOs, { nummer: string; titel1: string; titel2: string; text: string; objekte: string }>,
    ausgewaehlt: "Ausgewählt",
    auswaehlen: "Auswählen",
    fuss: "Der Schalter ist vorbelegt mit dem Schwerpunkt aus dem Erstgespräch. Abschnitt 08 zeigt das gewählte Konzept; ein Klick wechselt jederzeit.",
    beide: "Beide Konzepte nacheinander zeigen",
    schalter: { zusatzrente: "Konzept 1 · Zusatzrente", steuer: "Konzept 2 · Steuerersparnis" } as Record<KonzeptOs, string>,
  },

  objekte: {
    kicker: "10 · Unsere Objekte",
    titel: "Drei Standorte, [[geprüft und vermietet.]]",
    intro: "Zu jedem Objekt gibt es Exposé, Musterrechnung und Unterlagen. In der Objektvorstellung rechnen wir die Wohnung, die zu deinen Kriterien passt, mit deinen Zahlen.",
    marke: { steuer: "Konzept Steuerersparnis", zusatzrente: "Konzept Altersvorsorge" } as Record<KonzeptOs, string>,
    passt: "passt zu deinem Konzept",
    fuss: "Angaben laut Exposé, Stand Oktober 2026. Verfügbarkeit und Preise können sich ändern.",
  },

  kriterien: {
    kicker: "09 · Deine Kriterien",
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
    sorge: "Deine Sorge aus dem Erstgespräch",
  },

  weg: {
    kicker: "11 · Dein Weg",
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
    kicker: "12 · Der nächste Schritt",
    titel: "Wenn wir eine Immobilie finden, die [[deine Kriterien erfüllt]]: Möchtest du den nächsten Schritt gehen?",
    text: "Dafür brauchen wir deine Selbstauskunft. Wir füllen sie jetzt gemeinsam aus, das dauert etwa 15 Minuten. Bis zur Objektpräsentation in einer Woche fehlen dann nur noch Ausweis und letzte Gehaltsabrechnung.",
    /** Ohne verbundenen Kunden (Aufruf über Sidebar oder Unterlagen): keine Selbstauskunft. */
    textOhneKunde: "Dann vereinbaren wir deine Objektvorstellung. Dort zeigen wir dir die Immobilie, die zu deinen Kriterien passt, und rechnen sie mit deinen Zahlen durch.",
    knopf: "Selbstauskunft jetzt gemeinsam ausfüllen",
    termin: "Objektvorstellung",
    hinweis: "Gesprächshinweis: Frage stellen, dann schweigen.",
    /** Öffnet den Buchungslink „Objektvorstellung“ aus den Einstellungen (profiles.objektlink). */
    knopfObjekt: "Objektvorstellung buchen",
    ohneObjektLink: "Kein Buchungslink für die Objektvorstellung in den Einstellungen hinterlegt",
  },

  termin: {
    kicker: "13 · Dein nächster Termin",
    titel: "Das bekommst du [[in der Objektvorstellung.]]",
    karten: [
      { titel: "Deine Immobilie", text: "Eine Empfehlung, höchstens eine Alternative, passend zu deinen Kriterien." },
      { titel: "Deine Kalkulation", text: "Gerechnet mit deiner Selbstauskunft: vor und nach Steuern, mit Stresstest." },
      { titel: "Das Exposé", text: "Lage, Grundriss, Unterlagen, Kosten. Alles zum Nachlesen." },
      { titel: "Deine Entscheidung", text: "Passt es, reservierst du direkt. Kostenfrei." },
    ] as ReadonlyArray<{ titel: string; text: string }>,
    /** Ersetzt die Kalkulations-Karte ohne verbundenen Kunden. */
    kalkulationOhneKunde: "Gerechnet mit deinen Zahlen: vor und nach Steuern, mit Stresstest.",
    portalSatz: "Nach der gemeinsam ausgefüllten und von dir unterschriebenen Selbstauskunft lädst du Personalausweis und letzte Gehaltsabrechnung im Kundenportal hoch.",
    antwortenKopf: "Deine Antworten als Kopie",
    antwortenText: "Alle Fragen von heute und deine Antworten, Abschnitt für Abschnitt, als PDF für deine Unterlagen.",
    antwortenKnopf: "Antworten als PDF",
    portalKnopf: "Kundenportal freigeben",
    portalVorUnterschrift: "Erst nach der unterschriebenen Selbstauskunft",
    portalFreigegeben: "Kundenportal ist freigegeben",
  },

  fuss: "Szenarien, keine Zusagen. Wir vermitteln Immobilien; Steuer-, Rechts- und Finanzierungsberatung leisten Steuerberater, Notare und Banken.",
};

/** Bilder der Objekte, dieselben wie auf der Mikroseite (public/images/mikroseite). */
const BILD = "/images/mikroseite";

/**
 * Alle Objekte für Abschnitt 10, mit dem Konzept-Merkmal. Ein Objekt kann zu
 * beiden Konzepten passen (dann zwei Einträge in `konzepte`). Zuordnung
 * laut Christian (17.10.2026), wie Analysetool und Handbuch: Barfusstraße
 * und Zossen Steuerersparnis, Hauffstraße Altersvorsorge. ponytail: fest wie
 * die Mikroseite; aus „Objekte“ im CRM, sobald dort Bilder und Merkmal
 * gepflegt sind.
 */
export const OBJEKTE: ReadonlyArray<{
  titel: string;
  ort: string;
  text: string;
  daten: ReadonlyArray<string>;
  preis: string;
  konzepte: ReadonlyArray<KonzeptOs>;
  bilder: ReadonlyArray<{ src: string; alt: string }>;
}> = [
  {
    titel: "Barfusstraße 9",
    ort: "Berlin-Wedding",
    text: "Gründerzeit-Altbau um 1900, Bezirk Mitte, U6 vor der Tür, Volkspark Rehberge und Schillerpark nebenan.",
    daten: ["28 Wohnungen", "37 bis 92 m²"],
    preis: "186.850 bis 469.000 €",
    konzepte: ["steuer"],
    bilder: [
      ["barfuss-fassade", "Fassade des Gründerzeit-Altbaus"],
      ["barfuss-luftbild", "Luftbild des Altbaus im Wedding"],
      ["barfuss-altbau-innen", "Altbauwohnung von innen"],
      ["barfuss-fassade-hell", "Helle Altbaufassade"],
      ["barfuss-innenhof", "Innenhof des Altbaus"],
      ["barfuss-zimmer", "Zimmer mit Dielenboden"],
      ["barfuss-wohnungstuer", "Historische Wohnungstür"],
    ].map(([datei, alt]) => ({ src: `${BILD}/${datei}.jpg`, alt })),
  },
  {
    titel: "Hauffstraße 38",
    ort: "Schwielowsee bei Potsdam",
    text: "Gepflegte Wohnanlage mit Garten, Aufzug und Garage. 350.000 € Instandhaltung von 2020 bis 2026.",
    daten: ["Baujahr 2000", "46 Wohnungen", "42 bis 80 m²"],
    preis: "ab 176.000 € inkl. Garage",
    konzepte: ["zusatzrente"],
    bilder: [
      ["hauff-fassade", "Fassade der Wohnanlage"],
      ["hauff-garten", "Wohnanlage mit Garten"],
      ["hauff-luftbild", "Luftbild der Wohnanlage am Schwielowsee"],
      ["hauff-aufzug", "Gläserner Aufzugsturm"],
      ["hauff-strassenseite", "Straßenseite der Wohnanlage"],
      ["hauff-wohnraum", "Wohnraum mit Balkontür"],
      ["hauff-zimmer", "Helles Zimmer"],
    ].map(([datei, alt]) => ({ src: `${BILD}/${datei}.jpg`, alt })),
  },
  {
    titel: "Doppelhaushälften",
    ort: "Zossen-Wünsdorf",
    text: "Eigenes Grundstück, kein Hausgeld. Bahnhof 650 m, Flughafen BER 22 km.",
    daten: ["600 bis 800 m² Grundstück", "kein Hausgeld"],
    preis: "ab 379.000 € inkl. Sanierungspaket",
    konzepte: ["steuer"],
    bilder: [
      ["zossen-haus-garten", "Doppelhaushälfte mit Garten"],
      ["zossen-luisenstrasse", "Haus an der Luisenstraße in Zossen"],
      ["zossen-strasse", "Hausansicht mit Garten in Zossen-Wünsdorf"],
      ["zossen-rasen", "Großer Garten"],
      ["zossen-treppe", "Flur mit Treppe"],
      ["zossen-kueche", "Neue Küche"],
      ["zossen-zimmer", "Helles Zimmer"],
    ].map(([datei, alt]) => ({ src: `${BILD}/${datei}.jpg`, alt })),
  },
];

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
