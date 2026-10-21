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

import { BEISPIEL } from "@/lib/beratungBeispielrechnung";
import { AFA_ANNAHME, eur } from "@/lib/beratungKonzeptDaten";

export type KonzeptOs = "zusatzrente" | "steuer";

const W = BEISPIEL.wohnung;


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
/**
 * Satz unter der Rentenlücke (PDF-Präsentation Folie 5), aus den Eingaben
 * gerechnet statt fest: Die PDF sagt im Beispiel 800 € / 3.000 € „gut ein
 * Viertel“ und „fast drei Viertel“, hier stehen die Prozente des Kunden.
 * Ohne Lücke (Rente deckt den Wunsch) kein Satz.
 */
export function lueckenSatz(wunschNetto: number, erwarteteRente: number): string | null {
  const l = rentenluecke(wunschNetto, erwarteteRente);
  if (!l || l.monat <= 0) return null;
  const deckt = Math.round((erwarteteRente / wunschNetto) * 100);
  return `Die gesetzliche Rente deckt rund ${deckt} % deines Wunschnettos. ${100 - deckt} % musst du selbst aufbauen. Je früher du beginnst, desto leichter.`;
}

export function rentenluecke(wunschNetto: number, erwarteteRente: number): { monat: number; gesamt: number } | null {
  if (!(wunschNetto > 0) || !(erwarteteRente >= 0)) return null;
  const monat = Math.max(0, wunschNetto - erwarteteRente);
  return { monat, gesamt: monat * 12 * RUHESTAND_JAHRE };
}

export const OS_TEXTE = {
  hero: {
    // Seit 21.10.2026 die Überschrift der PDF-Präsentation (Folie 1), in Du-Form.
    kicker: "OS Real Estate · Beratungsgespräch Kapitalanlage-Immobilien",
    titel: "Dein Weg zu einem Immobilienvermögen,",
    titelAkzent: "das für dich arbeitet.",
    willkommen: "Herzlich willkommen",
    unterzeile: "Steuern sparen. Zusatzrente aufbauen. Persönlich begleitet.",
    start: "Beratung starten",
    konzepte: "Konzepte ansehen",
  },

  heute: {
    // PDF-Präsentation Folie 2 „Konzeptpräsentation“ mit den zwei Fragen.
    kicker: "01 · Konzeptpräsentation",
    titel: "Was machen wir [[heute?]]",
    text: "In rund 60 Minuten: wie Vermögensaufbau mit vermieteten Immobilien funktioniert, was er kostet und wo die Risiken liegen. Heute unterschreibst du nichts.",
    punkte: [
      { titel: "Deine Ziele", text: "Was du erreichen willst." },
      { titel: "Das Prinzip", text: "Wie Mieter und Steuer für dich mitzahlen." },
      { titel: "Mehr Netto vom Brutto", text: "Dein Konzept Steuerersparnis." },
      { titel: "Deine Arbeitsleistung", text: "Dein Konzept Altersvorsorge." },
      { titel: "Sicherheit", text: "Chancen und Risiken, offen auf dem Tisch." },
      { titel: "Dein nächster Schritt", text: "Deine Kriterien und dein Weg." },
    ] as ReadonlyArray<{ titel: string; text: string }>,
    fragen: ["Was möchtest du im Leben [[erreichen?]]", "Wie stellst du dir deinen [[Rentenalltag]] vor?"],
    fuss: "Am Ende entscheidest du: Ja, Nein oder Ja unter einer Bedingung. Alles ist in Ordnung.",
  },

  ziele: {
    kicker: "02 · Deine Ziele",
    // Seit 21.10.2026 wie die PDF (Folie 4): die Wünsche der meisten Kunden, ohne Vorbelegung aus dem Erstgespräch.
    titel: "Das wünschen sich die meisten [[unserer Kunden.]]",
    zielKopf: "Deine wichtigsten Ziele",
    nachfrage: "Was davon ist dir am wichtigsten? Möchtest du etwas ergänzen?",
    rahmen: "Dein Rahmen",
    tragbar: "Monatlich gut tragbar (vor Steuern)",
    reserve: "Reserve, die unangetastet bleibt",
    eigenkapital: "Eigenkapital für Nebenkosten",
    mitentscheider: "Mitentscheider",
    zitatPlatzhalter: "Den wichtigsten Satz des Kunden wörtlich mitschreiben",
    einstieg: "Und du? Was möchtest du im Leben erreichen? Und wie stellst du dir deinen Rentenalltag vor?",
    /** PDF-Präsentation Folie 4; die Überschrift steht oben im Abschnitt. */
    wuensche: {
      karten: [
        { titel: "Vermögen aufbauen", text: "langfristig, über 20 bis 30 Jahre" },
        { titel: "Steuern sparen", text: "weniger Lohnsteuer, jeden Monat mehr Netto" },
        { titel: "Später frei wählen", text: "Mieteinnahmen, Verkauf oder beides" },
      ],
      satz: "Eine vermietete Wohnung baut Vermögen auf und spart gleichzeitig Steuern. [[Die Steuerersparnis trägt rund zwei Drittel der Zuzahlung.]]",
      fuss: `Gemeinsame Beispielrechnung: ${W.name}, ${eur(W.kaufpreis)}; Beispielperson ${eur(BEISPIEL.person.bruttoJahr)} brutto. Zuzahlung vor Steuern ${eur(W.vorSteuer)} im Monat, Steuerersparnis ${eur(W.ersparnis)} (${Math.round((W.ersparnis / W.vorSteuer) * 100)} %), es bleiben ${eur(W.anteil)} (erstes volles Jahr). ${AFA_ANNAHME} Mit sinkenden Zinsen sinkt die Steuerersparnis. Musterrechnung, keine Zusage; steuerliche Wirkung mit Steuerberatung prüfen.`,
    },
  },

  luecke: {
    kicker: "03 · Deine Ausgangslage",
    titel: "Deine Rentenlücke: [[größer, als viele denken.]]",
    gewuenscht: "Gewünscht im Ruhestand",
    gewuenschtText: "netto im Monat",
    rente: "Erwartete Rente",
    renteText: "laut Renteninformation",
    luecke: "Lücke",
    lueckeText: "jeden Monat",
    gesamt: `Über ${RUHESTAND_JAHRE} Jahre Ruhestand`,
    gesamtText: "die fehlen",
    // Als string, damit Fassung B (beratungOsDatenB.ts) hier siezen und duzen kann.
    frage: "Wie würde sich dein Ruhestand anfühlen, wenn diese Lücke geschlossen wäre?",
    fuss: `Werte aus dem Erstgespräch. Keine Prognose, ohne Inflation und Steuern: Lücke × 12 × ${RUHESTAND_JAHRE}. Deine eigene Lücke ermitteln wir aus deiner Renteninformation.`,
    /** Beispielwerte der PDF nur als Platzhalter in leeren Feldern, nicht fest. */
    platzhalter: { wunschNetto: "3.000", renteErwartet: "800" },
    ruhestandAb: "Ruhestand ab (Alter)",
  },

  nichtstun: {
    // PDF-Präsentation Folie 8: 100.000 €, 25 Jahre, Kurvengrafik.
    kicker: "04 · Der Preis des Nichtstuns",
    titel: "Geld auf dem Konto [[verliert real an Wert.]]",
    karten: [
      { kopf: "Heute auf dem Konto", wert: "100.000 €", text: "Tagesgeld zu 2 % Zinsen" },
      { kopf: "Auf dem Konto nach 25 Jahren", wert: "164.061 €", text: "sieht nach mehr aus" },
      { kopf: "Was es noch kauft", wert: "88.493 €", text: "rund 11.500 € weniger als heute", warnung: true },
    ],
    /** Die Grafik dazu, Jahr für Jahr. Dieselben Annahmen wie die Karten (geprüft im Test). */
    grafik: {
      titel: "Geld auf dem Konto, 25 Jahre lang",
      konto: "Kontostand mit 2 % Zinsen",
      kaufkraft: "was dieses Geld noch kauft, in heutigen Euro",
      ohneZinsen: "100.000 € ohne Zinsen",
      luecke: "Inflation frisst die Zinsen auf",
      startText: "100.000 € heute",
      start: 100_000,
      zins: 0.02,
      inflation: 0.025,
      jahre: 25,
      startjahr: 2026,
    },
    satz: "Liegen lassen ist keine Lösung: [[Die Zinsen holen die Inflation nicht ein.]]",
    frage: "Soll dein Erspartes für dich arbeiten, statt still an Wert zu verlieren?",
    fuss: "Rechenbeispiel, keine Prognose: 100.000 € Tagesgeld, 2 % Zinsen, 2,5 % Inflation pro Jahr, beides über 25 Jahre gleichbleibend angenommen. Kontostand 100.000 € × 1,02²⁵ = 164.061 €; Kaufkraft 164.061 € ÷ 1,025²⁵ = 88.493 € in heutigem Geld; ohne Zinsen 100.000 € ÷ 1,025²⁵ = 53.939 €. Steuern auf Zinsen nicht berücksichtigt (sie vergrößern die Lücke). Wenn deine Reserve oder Lebensplanung noch nicht passt, ist Warten die bessere Wahl. Das sagen wir dir dann offen.",
  },

  werWirSind: {
    kicker: "05 · Wer wir sind",
    titel: "OS Real Estate [[in einem Satz.]]",
    text: "Wir vermitteln geprüfte, vermietete Wohnimmobilien in Berlin und Brandenburg als Kapitalanlage und begleiten dich vom ersten Gespräch bis zur Kaufpreiszahlung.",
    karten: [
      { titel: "Geprüfte Objekte", text: "Lage, Miete, Zustand und Unterlagen prüfen wir, bevor wir ein Objekt anbieten." },
      { titel: "Deine Zahlen", text: "Jede Rechnung mit deinem Einkommen, vor und nach Steuern, mit Stresstest." },
      { titel: "Ein Ansprechpartner", text: "Von der Konzeptwahl über Bank und Notar bis zur Übergabe." },
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
      titel: "Persönlich an deiner Seite",
      satz: "Bei OS Real Estate hast du einen festen Ansprechpartner. Du sprichst immer mit derselben Person, von heute bis zum Notartermin und darüber hinaus.",
      punkte: [
        "Ein fester Ansprechpartner statt wechselnder Hotline",
        "Erreichbar per Telefon, E-Mail und WhatsApp",
        "Begleitung auch nach dem Kauf",
      ],
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
    // PDF-Präsentation Folien 9 und 10, Zahlen aus der gemeinsamen Beispielrechnung.
    kicker: "06 · Das Prinzip",
    titel: "Wie du mit uns [[dein Vermögen aufbaust.]]",
    bausteine: [
      { titel: "Miete", text: "Der Mieter zahlt den Großteil deines Kredits ab." },
      { titel: "Tilgung", text: "Mit jeder Rate sinkt die Restschuld." },
      { titel: "Steuerersparnis", text: "AfA: Durch Abschreibung und Werbungskosten kann deine Lohnsteuer sinken." },
      { titel: "Wertentwicklung", text: "Im langjährigen Durchschnitt sind Immobilien in Deutschland um rund 2 % pro Jahr im Wert gestiegen.¹" },
      { titel: "Fremdkapitalhebel", text: "Wenig bis kein Eigenkapital nötig.²", hervor: true },
    ] as ReadonlyArray<{ titel: string; text: string; hervor?: boolean }>,
    hebel: {
      satz: `Der Fremdkapitalhebel und seine große Wirkung: [[mit rund ${eur(W.anteil)} im Monat zu einer Immobilie im Wert von heute ${eur(W.kaufpreis)}, schuldenfrei nach rund ${Math.round(W.freiMonate / 12)} Jahren.*]]`,
      karten: [
        { kopf: "Bank finanziert", wert: eur(W.kaufpreis), text: "Kaufpreis inkl. Garage" },
        { kopf: "Eigenkapital", wert: eur(W.nebenkosten), text: "nur Kaufnebenkosten" },
        { kopf: "Dein Anteil, Jahr 1", wert: `≈ ${eur(W.anteil)}`, text: "im Monat nach Steuern" },
        { kopf: "Schuldenfrei", wert: String(W.freiJahr), text: `nach ${W.freiMonate} Monaten` },
      ],
    },
    // 115 €: Anteil nach der Exposé-Rechnung mit pauschal 42 % (Exposé WE 1, 19.10.2026), nicht aus der gemeinsamen Rechnung.
    fuss: `* Beispielrechnung, keine Zusage. Beispielperson: ${eur(BEISPIEL.person.bruttoJahr)} brutto, Steuerklasse I, kinderlos, ohne Kirchensteuer, Einkommensteuer-Grundtarif 2026 (das Exposé rechnet pauschal mit 42 %, daraus ergäben sich 115 €). Beispielwohnung ${W.name} (Exposé Stand 19.10.2026): Kaufpreis ${eur(W.kaufpreis)} inkl. Garage, voll finanziert; Sollzins 4,8 % fest, Tilgung 1,2 %, Rate ${eur(W.rate)} im Monat, schuldenfrei nach ${W.freiMonate} Monaten (${W.freiJahr}), Zins über die ganze Laufzeit gleich angenommen. Miete im ersten Jahr ${eur(W.miete)} (Wohnung ${eur(Math.round(W.mieteWohnung))} = 13 €/m², Mietdifferenz zahlt der Bauträger bis zur nächsten Mieterhöhung, längstens 36 Monate, laut Garantievereinbarung; Garage ${eur(W.garage)}), nicht umlagefähiges Hausgeld ${eur(W.hausgeld)}, ${AFA_ANNAHME} Grundlage ${eur(W.afaGrundlage)}. Erstes Jahr: vor Steuern ${eur(W.vorSteuer)}, Steuerersparnis ${eur(W.ersparnis)}, dein Anteil ${eur(W.anteil)} bei ${eur(W.tilgung)} Tilgung. Mit sinkenden Zinsen sinkt die Steuerersparnis: Dein Anteil bleibt bis zum 25. Jahr unter rund ${eur(W.bis49)}, danach (erhöhte AfA verbraucht) bis zu rund ${eur(W.max57)}; im Schnitt der ersten 30 Jahre rund ${eur(W.schnitt30)} (Miete im Szenario linear bis 20 €/m² im Jahr 2060, Kosten +2 % pro Jahr). Bei angenommen 2 % Wertentwicklung pro Jahr nach 30 Jahren rund ${eur(W.wert30)}. ¹ Eigentumswohnungen 1975–2002 rund +2,6 % pro Jahr, Reihenhäuser +2,1 % (ifo, Daten Bundesbank/BulwienGesa); 1975–2018 rund +2,3 % pro Jahr, nominal, also vor Inflation. Vergangene Entwicklung ist keine Zusage. ² Abhängig von Bonität und Bank; Kaufnebenkosten meist aus Eigenkapital.`,
    /** „Wer zahlt deine Finanzierung?“ (PDF-Präsentation Folie 10). */
    finanzierung: {
      titel: "Wer zahlt [[deine Finanzierung?]]",
      summe: eur(W.rate + W.hausgeld),
      summeText: "im Monat, Rate und Hausgeld",
      // Farben aus beratung-os.css: im hellen wie im dunklen CRM klar vom Grund und voneinander getrennt.
      teile: [
        { label: "Der Mieter", text: `Kaltmiete ${eur(Math.round(W.mieteWohnung))} und Garage ${eur(W.garage)}`, betrag: W.miete, farbe: "var(--bos-segment-mieter)" },
        { label: "Das Finanzamt", text: "laufende Steuerersparnis", betrag: W.ersparnis, farbe: "var(--bos-segment-amt)" },
        { label: "Du", text: "dein eigener Anteil im Monat", betrag: W.anteil, farbe: "var(--bos-segment-du)" },
      ],
      aufbauKopf: "Dein Vermögensaufbau",
      aufbauWert: eur(W.tilgung),
      aufbauText: "Tilgung im Monat",
      aufbauSatz: `Gleichzeitig tilgst du ${eur(W.tilgung)} im Monat, mehr als dein eigener Anteil. Dein ganzer Anteil wird so zu Vermögen: Mit jeder Rate gehört dir mehr von deiner Wohnung.`,
      frage: "Wenn Mieter und Finanzamt den größten Teil tragen: Wäre das für dich ein guter Weg zum eigenen Vermögen?",
      fuss: `Gleiche Beispielrechnung: ${W.name}, ${eur(W.kaufpreis)} inkl. Garage, voll finanziert, Sollzins 4,8 %, Tilgung 1,2 %, Rate ${eur(W.rate)} plus nicht umlagefähiges Hausgeld ${eur(W.hausgeld)} = ${eur(W.rate + W.hausgeld)} im Monat; erstes Jahr: Zinsen ${eur(W.zinsMonat)}, Tilgung ${eur(W.tilgung)}. Steuerersparnis für die Beispielperson (${eur(BEISPIEL.person.bruttoJahr)} brutto, Grundtarif 2026) mit ${AFA_ANNAHME.replace(/^AfA 4 % ist eine Annahme/, "AfA 4 % als Annahme")} Ohne Gutachten ${eur(W.ersparnisOhneGutachten)} statt ${eur(W.ersparnis)}. Dein Anteil nach Steuern; vor Steuern ${eur(W.vorSteuer)}. Musterrechnung, keine Steuer- oder Finanzierungsberatung, keine Zusage. Bitte mit Steuerberatung und Bank prüfen.`,
    },
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

  /** PDF-Präsentation Folie 26 „Chancen und Risiken“ (Kapitel Sicherheit). */
  risiken: {
    kicker: "10 · Sicherheit",
    titel: "Chancen und Risiken, [[offen auf dem Tisch.]]",
    vorteileKopf: "Mögliche Vorteile",
    vorteile: [
      "Aufbau von Immobilienvermögen",
      "Tilgung durch Mieteinnahmen",
      "Mögliche Steuerersparnis",
      "Langfristige Wertentwicklung",
      "Mit Rentenbeginn: Einmalsumme durch Verkauf oder monatliche Zusatzrente durch Mieteinnahmen",
      "Fremdkapitalhebel: Die Bank leiht dir mit geringem Eigenanteil Geld. Geringe Zuzahlung, monatlich vergleichbar mit einem ETF- oder Sparplan.",
    ],
    risikenKopf: "Mögliche Risiken",
    risiken: ["Mietausfall und Leerstand", "Reparaturen und Sonderumlagen", "Kapital nicht kurzfristig verfügbar"],
    satz: "Eine Immobilie ist kein Sparbuch, [[sondern eine langfristige Investition mit Verantwortung.]]",
    fuss: "Vergleich mit ETF- oder Sparplan nur nach der Höhe der monatlichen Zahlung; keine Aussage über Rendite oder Risiko dieser Anlagen und keine Anlageberatung. Steuerersparnis, Wertentwicklung und Mieteinnahmen sind nicht zugesagt; Finanzierung abhängig von Bonität und Bank.",
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
  },

  weg: {
    // PDF-Präsentation Folie 28. Die Selbstauskunft des CRM gehört zu Schritt 4 (heute).
    kicker: "11 · Dein Weg",
    titel: "Drei Schritte sind geschafft. [[Heute folgt Schritt vier.]]",
    lead: "Erst das Konzept, dann die Immobilie, erst danach die Finanzierung. Jeder Schritt endet mit deiner Entscheidung.",
    schritte: [
      { titel: "Kennenlernen", text: "Erstes Gespräch", stand: "erledigt" },
      { titel: "Deine Ziele", text: "Ziele und Rahmen", stand: "erledigt" },
      { titel: "Vorbereitung", text: "Unterlagen und Fragen", stand: "erledigt" },
      { titel: "Konzeptberatung", text: "Konzept und Objekte, danach gemeinsam die Selbstauskunft", marke: "Heute", stand: "heute" },
      { titel: "Objektberatung und Finanzierungsvorbereitung", text: "Exposé, Kalkulation und Finanzierungskonzept, Reservierung", marke: "Tag 7 bis 10" },
      { titel: "Kaufvertragsentwurf und Vorbereitung", text: "Entwurf vom Notar, Bankgutachter, Besichtigung", marke: "Tag 14 bis 20" },
      { titel: "Finanzierungszusage und Notartermin", text: "Die Bank sagt zu, Kaufvertrag beim Notar", marke: "Woche 3 bis 4" },
    ] as ReadonlyArray<{ titel: string; text: string; marke?: string; stand?: "erledigt" | "heute" }>,
    frage: "Passt dieser Ablauf zu deinem Zeitplan?",
    satz: "Nach jedem Schritt entscheidest du, ob es weitergeht. Die Reservierung ist kostenfrei.",
    fuss: "Die Tage sind Richtwerte für deine Entscheidung, keine Zusage für die Bank. Die Bearbeitung der Bank beginnt erst mit vollständigen Unterlagen und kann länger dauern.",
  },

  schritt: {
    kicker: "12 · Der nächste Schritt",
    // PDF-Präsentation Folie 29.
    satzKopf: "Das Konzept in einem Satz",
    satz: "Mieter, Finanzamt und Bank finanzieren mit, du baust über 20 bis 30 Jahre ein Vermögen auf, [[das dir im Ruhestand die Wahl lässt.]]",
    frageKopf: "Unsere Frage an dich",
    titel: "Wenn wir ein Objekt finden, das deine Kriterien erfüllt: [[Möchtest du den nächsten Schritt gehen?]]",
    terminKopf: "Dein nächster Schritt",
    terminTitel: "Objektberatung",
    terminText: "Wir stellen dir die Immobilie vor, die deine Kriterien am besten erfüllt.",
    vorschlag: "Terminvorschlag",
    felder: [
      { schluessel: "terminDatum", label: "Datum" },
      { schluessel: "terminUhrzeit", label: "Uhrzeit" },
      { schluessel: "terminOrt", label: "Ort / Video" },
      { schluessel: "terminUnterlagen", label: "Unterlagen" },
    ],
    hinweisRecht: "Kein verbindliches Angebot und keine Steuer-, Rechts- oder Finanzierungsberatung. Alle Zahlen sind Musterrechnungen und Szenarien auf Basis der Exposés und der gemeinsamen Beispielrechnung, Stand 21.10.2026; es werden keine Renditen oder Wertsteigerungen zugesagt. Steuerliche Wirkung mit Steuerberatung prüfen. Abbildungen mit dem Hinweis „Visualisierung“ sind unverbindlich. Maßgeblich sind allein die notariellen Verträge.",
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
 * Die drei Objekte mit Konzept-Merkmal. Der Abschnitt „Unsere Objekte“ der
 * Präsentation ist seit dem 21.10.2026 entfallen (Wunsch Christian); die
 * Daten nutzt weiter die Vorsorgeanalyse (analyseVorsorge.ts). Ein Objekt kann zu
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
