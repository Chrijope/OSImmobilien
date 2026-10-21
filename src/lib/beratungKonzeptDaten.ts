/**
 * Inhalte der beiden Vertriebsdokumente als Folien der Beratungspräsentation
 * (Abschnitt 08, seit dem 16.10.2026; Zahlen seit dem 21.10.2026 aus der
 * gemeinsamen Beispielrechnung).
 *
 * - „Steuerersparnis mit Immobilien – kompakt“ gehört zum Konzept Steuerersparnis
 *   (PDF-Präsentation „Mehr Netto vom Brutto“, Folien 11 bis 15).
 * - „Arbeitsleistung und Immobilienvermögen“ gehört zum Konzept Altersvorsorge
 *   (PDF-Präsentation „Ihre Arbeitsleistung“, Folien 16 bis 24).
 *
 * Alle Zahlen kommen aus `beratungBeispielrechnung.ts` (erzeugt aus
 * scripts/beratung-beispielrechnung/gemeinsam.py, derselben Rechnung wie die
 * PDF-Präsentation): 65.000 € brutto (seit 21.10.2026), Hauffstraße 38 a, Wohnung 1, 176.000 €,
 * 4,8 % Zins, 1,2 % Tilgung, Rate 880 €, AfA 4 % als Annahme.
 *
 * Alle Texte in Sie-Form (seit 21.10.2026), bewacht in `beratungSieAnrede.test.ts`.
 */
import { BEISPIEL } from "@/lib/beratungBeispielrechnung";

const P = BEISPIEL.person;
const W = BEISPIEL.wohnung;
const D = BEISPIEL.drei;
const MEHR = BEISPIEL.mehr;

/** 1273 → „1.273 €“, mit echtem Minuszeichen. */
export const eur = (n: number, stellen = 0) =>
  `${n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("de-DE", { minimumFractionDigits: stellen, maximumFractionDigits: stellen })} €`;
/** 1261525 → „1,26 Mio. €“. */
export const mio = (n: number) => `${(n / 1e6).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Mio. €`;

/** Die AfA-Annahme, wörtlich wie in der PDF. */
export const AFA_ANNAHME =
  "AfA 4 % ist eine Annahme (Ersteinschätzung, Restnutzungsdauer 25 Jahre) und setzt ein Restnutzungsdauer-Gutachten voraus, das das Finanzamt anerkennen muss; das Exposé nennt für die Beispielwohnung eine Ersteinschätzung von 32 Jahren (rund 3,1 %); ohne Gutachten gilt 2 %.";

const ANNAHMEN = `Annahmen: ${eur(P.bruttoJahr)} brutto im Jahr (${eur(P.bruttoMonat)} im Monat), Steuerklasse I, kinderlos, ohne Kirchensteuer, Werte 2026. Beispielwohnung ${W.name} (Exposé 19.10.2026): Kaufpreis ${eur(W.kaufpreis)} inkl. Garage, ${W.qm.toLocaleString("de-DE")} m², Kaltmiete ${eur(Math.round(W.mieteWohnung))} (13 €/m², Mietdifferenz zahlt der Bauträger laut Garantievereinbarung) plus Garage ${eur(W.garage)}, nicht umlagefähiges Hausgeld ${eur(W.hausgeld)} (davon Rücklage ${eur(W.ruecklage)}), AfA-Grundlage ${eur(W.afaGrundlage)}, Darlehen ${eur(W.kaufpreis)} mit 4,8 % Zins und 1,2 % Tilgung (Rate ${eur(W.rate)}). Werte im ersten vollen Jahr, gerundet.`;

/** Pflichthinweis unter jeder Folie des Steuer-Dokuments, wie in der PDF. */
const STEUER_ANNAHMEN = `Musterrechnung, keine Zusage. ${AFA_ANNAHME} ${ANNAHMEN}`;

const plus = (n: number) => `+${eur(n)}`;

/** Rechtsgrundlagen der AfA-Folie (geprüft am 21.10.2026, keine Steuerberatung). */
export const AFA_RECHT =
  "Die AfA ist Werbungskosten bei den Einkünften aus Vermietung und Verpachtung (§ 9 Abs. 1 Satz 3 Nr. 7 EStG in Verbindung mit § 7 Abs. 4 EStG; Einkünfte nach § 21 EStG). Monatlich wirkt sie über einen Freibetrag im Lohnsteuerabzug (§ 39a Abs. 1 Satz 1 Nr. 5 EStG), in der Regel ab dem Kalenderjahr nach dem Kauf; im Kaufjahr über die Einkommensteuererklärung.";

export const KONZEPT_STEUER = {
  dokument: "Steuerersparnis mit Immobilien, kompakt",
  titel: {
    kicker: "Musterrechnung",
    titel: "Mehr [[Netto]] vom Brutto.",
    /** Seit 21.10.2026: ein großes Tortendiagramm statt Ring und Kästen. */
    lead: "Was Sie verdienen und was davon jeden Monat abfließt.",
    mitte: "Ihr Gehalt",
    brutto: eur(P.bruttoMonat),
    bruttoText: `im Monat, ${eur(P.bruttoJahr)} im Jahr`,
    teile: [
      { label: "Netto für Sie", text: "kommt auf Ihrem Konto an", wert: eur(P.nettoMonat), betrag: P.nettoMonat, ton: "netto" },
      { label: "Lohnsteuer an das Finanzamt", text: "fließt ab, ohne Gegenwert für Sie", wert: eur(P.lohnsteuerMonat), betrag: P.lohnsteuerMonat, ton: "steuer" },
      { label: "Sozialabgaben", text: "Renten-, Kranken-, Pflege- und Arbeitslosenversicherung", wert: eur(P.sozialMonat), betrag: P.sozialMonat, ton: "sozial" },
    ] as ReadonlyArray<{ label: string; text: string; wert: string; betrag: number; ton: "netto" | "steuer" | "sozial" }>,
    fuss: STEUER_ANNAHMEN,
  },
  finanzamt: {
    kicker: "01 · Die Sicht des Finanzamts",
    titel: "Ihre Lohnsteuer [[fließt jeden Monat ab.]]",
    bild: "Finanzamt",
    label: "Lohnsteuer jeden Monat",
    wert: eur(P.lohnsteuerMonat),
    text: "fließen Monat für Monat in den Trichter des Finanzamts. Ohne Gegenwert für Sie.",
    jahr: `Das sind ${eur(P.lohnsteuerJahr)} im Jahr.`,
    satz: "Diesen Teil Ihres Geldes zahlen Sie ohnehin, er wäre verloren. [[Wir zeigen Ihnen, wie Sie diesen Teil in Vermögen umwandeln.]]",
    fuss: STEUER_ANNAHMEN,
  },
  hebel: {
    kicker: "02 · Der Hebel",
    titel: "[[AfA]]: Absetzung für Abnutzung.",
    unterzeile: "Steuer sparen, ohne dass Geld vom Konto fließt.",
    normal: { etikett: "Heute: normaler Satz", wert: "2 %", text: `im Jahr · ${eur(W.afa2)} Abschreibung` },
    os: { etikett: "Mit OS Real Estate", wert: "4 %", text: `im Jahr · ${eur(W.afa4)} Abschreibung, doppelt so viel` },
    balkenKopf: `Abschreibung pro Jahr auf ${eur(W.afaGrundlage)} AfA-Grundlage`,
    // Die frühere Zeile „bis 8 % möglich“ entfällt seit dem 21.10.2026 (wie in der PDF).
    balken: [
      { label: "Ohne Immobilie", wert: "0 €", betrag: 0, ton: "leer" },
      { label: "Normale AfA 2 %", wert: eur(W.afa2), betrag: W.afa2, ton: "grau" },
      { label: "OS Real Estate 4 %", wert: eur(W.afa4), betrag: W.afa4, ton: "gruen" },
    ] as ReadonlyArray<{ label: string; wert: string; betrag: number; ton: "leer" | "grau" | "gruen" }>,
    band: "Der Schlüssel: ein [[Restnutzungsdauer-Gutachten]]. Restnutzungsdauer 25 Jahre = 4 % AfA im Jahr (Ersteinschätzung, Gutachten erforderlich). Das Finanzamt muss es anerkennen.",
    /** Seit 21.10.2026 (Christian): zwei Wege zur AfA und die Rechtsgrundlage, hervorgehoben. */
    wege: {
      kopf: "Zwei Wege, wie Sie von der AfA profitieren",
      liste: [
        { titel: "Einkommensteuererklärung", text: "einmal im Jahr, als Erstattung" },
        { titel: "Lohnsteuerermäßigung", text: "jeden Monat mehr Netto, ab dem Jahr nach dem Kauf" },
      ],
      recht: "Die Abschreibung rechnen Sie als Werbungskosten ab. [[Das steht Ihnen gesetzlich zu]] (§ 9 Abs. 1 Satz 3 Nr. 7 EStG).",
    },
    fuss: `${STEUER_ANNAHMEN} ${AFA_RECHT}`,
  },
  dreiWege: {
    kicker: "03 · Drei Wege im Vergleich",
    titel: "Mehr [[Netto]] im [[Monat]].",
    kopf: "So viel mehr Netto haben Sie jeden Monat",
    saeulen: [
      { label: "Ohne Immobilie", wert: "0 €", betrag: 0, lohnsteuer: `Lohnsteuer ${eur(P.lohnsteuerMonat)}`, netto: eur(P.nettoMonat), ton: "leer" },
      { label: "Normale AfA 2 %", wert: plus(W.ersparnisOhneGutachten), betrag: W.ersparnisOhneGutachten, lohnsteuer: `Lohnsteuer ${eur(W.lohnsteuerMonat2)}`, netto: eur(W.nettoMonat2), ton: "grau" },
      { label: "OS Real Estate · AfA 4 %", wert: plus(W.ersparnis), betrag: W.ersparnis, lohnsteuer: `Lohnsteuer ${eur(W.lohnsteuerMonatNeu)}`, netto: eur(W.nettoMonatNeu), ton: "gruen" },
    ] as ReadonlyArray<{ label: string; wert: string; betrag: number; lohnsteuer: string; netto: string; ton: "leer" | "grau" | "gruen" }>,
    nettoKopf: "Ihr Netto im Monat",
    heute: { wert: eur(-P.lohnsteuerMonat), text: "Lohnsteuer, jeden Monat, ohne Gegenwert." },
    mitOs: { wert: plus(W.ersparnis), text: `mehr Netto, jeden Monat. ${eur(W.ersparnis - W.ersparnisOhneGutachten)} mehr als mit normaler AfA.` },
    fuss: `Musterrechnung, keine Zusage. ${AFA_ANNAHME} Die graue Säule ist zur Lesbarkeit halb so hoch wie die grüne gezeichnet, die Beträge stehen darüber. Über einen Freibetrag im Lohnsteuerabzug kommt der Effekt jeden Monat an (in der Regel ab dem Jahr nach dem Kauf), sonst einmal im Jahr über die Steuererklärung. Die Zinsen sinken jährlich, damit auch der Effekt. ${ANNAHMEN}`,
  },
  unterm: {
    kicker: "04 · Unterm Strich",
    titel: "Ihr Mehr-Netto [[zahlt Ihre Wohnung ab.]]",
    /** Gehaltsbalken: Netto heute plus Steuerersparnis, die Ersparnis hervorgehoben. */
    balken: {
      kopf: "Ihr Netto im Monat, mit Immobilie",
      netto: { label: "Ihr Netto heute", wert: eur(P.nettoMonat), betrag: P.nettoMonat },
      plus: { label: "Steuerersparnis", wert: plus(W.ersparnis), betrag: W.ersparnis },
      summe: eur(W.nettoMonatNeu),
    },
    haus: {
      titel: "Nicht verfeiern, sondern anlegen.",
      text: `Die ${eur(W.ersparnis)}, die wir Ihnen jeden Monat freisetzen, geben Sie nicht aus. Sie fließen in Ihre Wohnung und später in eine weitere Immobilie.`,
      bild: "Ihr Mehr-Netto zahlt Ihre Wohnung ab",
    },
    aufbau: {
      etikett: "Vermögensaufbau",
      text: `Sie zahlen nach Steuer ${eur(W.anteil)} im Monat zu. Die Tilgung baut ${eur(W.tilgung)} Vermögen auf. Was Sie einzahlen, landet komplett in Ihrer eigenen Wohnung.`,
      zahlen: eur(W.anteil),
      wird: eur(W.tilgung),
    },
    fuss: `Musterrechnung, keine Zusage. ${AFA_ANNAHME} Zuzahlung vor Steuer: Rate ${eur(W.rate)} + Hausgeld ${eur(W.hausgeld)} − Miete ${eur(W.miete)} = ${eur(W.vorSteuer)}. Nach Steuer: ${eur(W.vorSteuer)} − ${eur(W.ersparnis)} = ${eur(W.anteil)}. Zinsen und Kosten minus Miete kosten Sie ${eur(W.laufend)} im Monat, die Steuerersparnis von ${eur(W.ersparnis)} deckt sie ganz. Ohne Leerstand und Wertentwicklung. ${ANNAHMEN}`,
  },
};

/** Jahreswerte einer Wohnung aus der gemeinsamen Rechnung: Alter, Restschuld und Wert (+2 % im Jahr). */
export const VERLAUF_WOHNUNG: ReadonlyArray<{ alter: number; rest: number; wert: number }> = BEISPIEL.verlauf.map(([alter, rest, wert]) => ({ alter, rest, wert }));

/** Monatswerte einer Wohnung je Alter aus der gemeinsamen Rechnung: vor und nach Steuer, negativ = Zuzahlung. */
export const MONATSVERLAUF: ReadonlyArray<{ alter: number; vor: number; nach: number }> = BEISPIEL.monate.map(([alter, vor, nach]) => ({ alter, vor, nach }));

const MIETSZENARIO = "Miete von 13 €/m² auf 20 €/m² im Jahr 2060 (Szenario laut Exposé), Garage 80 € auf 150 €, Kosten +2 % im Jahr.";

/** Tausenderzahl statt Millionen, z. B. 388600 → „388.600 €“ (Christian, 21.10.2026: keine „0,39 Mio.“). */
const ganz = (n: number) => eur(n);

export const KONZEPT_ALTER = {
  dokument: "Arbeitsleistung und Immobilienvermögen",
  titel: {
    kicker: "Modellrechnung · 25 bis 65 Jahre",
    titel: "Wir zeigen Ihnen, wie Sie [[Sozialabgaben in Vermögen umwandeln.]]",
    text: `Ein Arbeitsleben mit ${eur(P.bruttoJahr)} brutto im Jahr: In 40 Jahren fließen rund ${mio(P.lebenAbgaben)} Steuern und Sozialabgaben ab. Einen Teil davon, die Lohnsteuer, holen wir zurück: Mit einer vermieteten Wohnung tragen Mieter und Finanzamt den größten Teil der Rate. Sie bauen Schritt für Schritt schuldenfreies Vermögen auf.`,
    karten: [
      { kopf: "Heute im Monat", wert: `${eur(P.bruttoMonat)} brutto`, text: `${eur(P.abzuegeMonat)} Steuern und Beiträge` },
      { kopf: "Mit Immobilie", wert: `${plus(W.ersparnis)} netto`, text: "weniger Lohnsteuer, fließt in die Wohnung" },
      { kopf: "Kredit abgezahlt", wert: `mit ${W.freiAlter} Jahren`, text: "danach arbeitet die Wohnung für Sie" },
    ],
  },
  // Die Folien „Ein Monat · heute“, „Ein Monat · mit Immobilie“ und „Ihre monatliche Zuzahlung“ entfallen seit dem 21.10.2026 (Christian).
  arbeitsleben: {
    kicker: "01 · Ein Arbeitsleben",
    titel: `Rund ${mio(P.lebenAbgaben)} Abgaben [[in 40 Jahren.]]`,
    // Seit 21.10.2026 groß über die ganze Breite: Brutto grün, Abgaben rot, Ausgezahlt gelb.
    karten: [
      { kopf: "Arbeitsleistung brutto", wert: mio(P.lebenBrutto), text: `480 Monate × ${eur(P.bruttoMonat)}`, ton: "gruen" },
      { kopf: "Steuern und Beiträge", wert: mio(P.lebenAbgaben), text: "an Staat und Sozialkassen", ton: "rot" },
      { kopf: "Ausgezahlt", wert: mio(P.lebenNetto), text: "daraus leben und vorsorgen", ton: "gold" },
    ] as ReadonlyArray<KennKarte>,
    reinKopf: "Einkünfte aus 3 Immobilien bis 65",
    // „Vermögen“: Christian hat am 21.10.2026 entschieden, die Mieteinnahmen bis 65 als umgewandeltes Vermögen zu zeigen.
    rein: [
      { label: "Vermögen", wert: mio(D.miete), text: "umgewandeltes Vermögen", betrag: D.miete, ton: "gruen", bezug: true },
      { label: "Abschreibung (AfA)", wert: eur(D.afa), betrag: D.afa, ton: "gold" },
      { label: "Wertwachstum", wert: mio(D.wertzuwachs), betrag: D.wertzuwachs, ton: "navy" },
    ] as ReadonlyArray<{ label: string; wert: string; text?: string; betrag: number; ton: "gruen" | "gold" | "navy"; bezug?: true }>,
    bezug: `Ihre Abgaben von ${mio(P.lebenAbgaben)} und ${mio(D.miete)} umgewandeltes Vermögen aus drei Wohnungen gehören zusammen: Was über 40 Jahre an Staat und Sozialkassen abfließt, holen Sie mit drei Wohnungen als Vermögen zurück.`,
    ergebnis: [
      { kopf: "Rente im Monat möglich", wert: `≈ ${eur(D.rente65)}`, text: "ab 65, drei Wohnungen behalten, nach Steuer", ton: "gruen" },
      { kopf: "Aus der Steuer gerettet", wert: eur(D.gerettet), text: "Lohnsteuer, die in Ihr Vermögen fließt", ton: "gold" },
      { kopf: "Vermögen bei Verkauf", wert: `≈ ${ganz(D.wert65)}`, text: "drei schuldenfreie Wohnungen mit 65", ton: "navy" },
    ] as ReadonlyArray<KennKarte>,
    schluss: "Wir holen einen Teil Ihrer Lohnsteuer zurück, [[und Ihre Immobilie wird damit direkt abbezahlt.]]",
    fuss: `Gehalt, Beitragssätze und Steuerrecht bleiben 40 Jahre wie 2026. Drei Wohnungen wie die Beispielwohnung, alle mit 25 gekauft. ${MIETSZENARIO} „Umgewandeltes Vermögen“: Summe der Mieteinnahmen der drei Wohnungen bis 65 (vor Kosten und Steuern). Wert +2 % im Jahr (Annahme). AfA 4 % für 25 Jahre (Annahme, Gutachten erforderlich). Rente: Miete minus Kosten, minus 25 % Steuer.`,
  },
  eineWohnung: {
    kicker: "02 · Eine Wohnung",
    titel: "Kreditschulden sinken [[und Immobilienwert wächst.]]",
    lead: "Kreditschulden, Ihr Vermögen in der Wohnung und der Immobilienwert über 40 Jahre.",
    kopf: "Aufbau Ihres Gesamtvermögens",
    legende: { schulden: "Kreditschulden", vermoegen: "Ihr Vermögen (Wert minus Kreditschulden)", wert: "Immobilienwertzuwachs, Annahme 2 % im Jahr" },
    marke: { titel: `${W.freiJahr} · mit ${W.freiAlter} Jahren`, zeilen: ["Kreditschulden: 0 €", `Ihr Vermögen: ${eur(W.wertFrei)}`, `Immobilienwert: ${eur(W.wertFrei)}`] },
    ende: { kopf: "Gesamtvermögen mit 65 Jahren", wert: eur(W.wert65) },
    unter: `Mit ${W.freiAlter} ist der Kredit abgezahlt, die Wohnung ist dann ${eur(W.wertFrei)} wert und gehört ganz Ihnen. Bis 65 wächst ihr Wert bei 2 % im Jahr weiter auf ${eur(W.wert65)}. Alle Werte in €.`,
    karten: [
      { kopf: "Kreditrate", wert: eur(W.rate), text: "im Monat, Zins und Tilgung", ton: "grau" },
      { kopf: "Kredit zu 100 % abgezahlt", wert: `mit ${W.freiAlter} Jahren`, text: `nach ${W.freiMonate} Monaten, im Jahr ${W.freiJahr}, Wert dann ${eur(W.wertFrei)}`, ton: "gruen" },
      { kopf: "Ihr Vermögen: Ihre Wohnung mit 65", wert: eur(W.wert65), text: `schuldenfrei, gehört komplett Ihnen. Mit ${W.freiAlter} (Kredit abgezahlt) ist sie ${eur(W.wertFrei)} wert; bis 65 wächst der Wert bei 2 % im Jahr weiter.`, ton: "navy" },
    ] as ReadonlyArray<KennKarte>,
    fuss: `Annahmen: Kaufpreis und Darlehen ${eur(W.kaufpreis)} (${W.name}), 4,8 % Sollzins und 1,2 % Anfangstilgung, Rate ${eur(W.rate)} im Monat, Zins bis zum Ende unverändert. Kaufnebenkosten aus Eigenkapital, im Diagramm nicht enthalten. Immobilienwert +2 % im Jahr (Annahme): ${eur(W.wertFrei)} mit ${W.freiAlter}, ${eur(W.wert65)} mit 65.`,
  },
  mehrWohnungen: {
    kicker: "03 · Eine, zwei, drei Wohnungen",
    titel: "Mit jeder Wohnung [[wächst Ihr Vermögen.]]",
    lead: "So rechnet es sich, wenn Sie nicht bei einer Wohnung bleiben. Die Steuerersparnis trägt jede weitere Wohnung mit, das Vermögen mit 65 verdreifacht sich.",
    kopf: "Ihr Vermögen mit 65, schuldenfrei",
    saeulen: [1, 2, 3].map((n) => ({
      label: n === 1 ? "1 Wohnung" : `${n} Wohnungen`,
      text: `${n} × ${eur(W.wert65)}`,
      wert: ganz(n * W.wert65),
      betrag: n,
    })),
    spalten: ["1 Wohnung", "2 Wohnungen", "3 Wohnungen"],
    zeilen: [
      { text: "Zuzahlung vor Steuer, Jahr 1", werte: MEHR.map((m) => eur(m.vor)) },
      { text: "Ihr Anteil nach Steuer, Jahr 1", werte: MEHR.map((m) => eur(m.anfang)) },
      { text: `Ihr Anteil nach Steuer, höchster Wert bis ${W.freiAlter - 1}`, werte: MEHR.map((m) => `bis ${eur(m.spaet)}`) },
      { text: `Überschuss nach der letzten Rate (mit ${W.freiAlter}), vor Steuer`, werte: MEHR.map((m) => plus(m.ab58)) },
      { text: "Vermögen mit 65", werte: [1, 2, 3].map((n) => ganz(n * W.wert65)), summe: true },
    ] as ReadonlyArray<{ text: string; werte: string[]; summe?: true }>,
    schluss: "Ihr Vermögen mit [[3 Wohnungen]]",
    schlussWert: ganz(D.wert65),
    fuss: `Alle Wohnungen gleich und mit 25 gekauft, Steuer gemeinsam gerechnet; mit mehr Wohnungen sinkt die Ersparnis je Wohnung, weil der Steuersatz fällt. Monatswerte. Wert +2 % im Jahr (Annahme). Bis ${W.freiAlter - 1} zahlen Sie nach Steuer insgesamt rund ${eur(MEHR[0].zu)} (eine), ${eur(MEHR[1].zu)} (zwei) und ${eur(MEHR[2].zu)} (drei Wohnungen) zu.`,
  },
  rente: {
    kicker: "04 · Nach der Abzahlung",
    titel: `Ihre vorzeitige Rente [[mit ${W.freiAlter} Jahren.]]`,
    lead: `Ab ${W.freiAlter} sind alle drei Kredite abgezahlt. Die Raten von 3 × ${eur(W.rate)} entfallen, die Mieten aller drei Wohnungen bleiben bei Ihnen. Mit 60 haben Sie zwei Wege.`,
    /*
     * Im Modell sind alle drei Wohnungen mit 25 gekauft. Ein gestaffelter Kauf
     * ergäbe andere Zahlen, darum zeigt der Zeitstrahl die drei Wohnungen
     * nacheinander, aber alle mit 25.
     */
    zeitstrahl: [
      { alter: "25 J.", titel: "Kauf", text: "Wohnung 1, 2 und 3", wohnungen: 3 },
      { alter: `${W.freiAlter} J.`, titel: String(W.freiJahr), text: "alle drei Kredite abgezahlt" },
      { alter: "60 J.", titel: "Renteneintritt", text: "zwei Wege" },
    ],
    wohnung: "Wohnung",
    zahlstZu: "Sie zahlen zu",
    wegeKopf: "Ihr Renteneintritt mit 60: zwei Wege, mit allen drei Wohnungen",
    wege: [
      { buchstabe: "A", titel: "Sie verkaufen mit 60 alle drei Wohnungen.", wert: `≈ ${ganz(Math.round(D.verkauf60 / 1000) * 1000)}`, text: `einmalige Auszahlung aus drei Wohnungen (je rund ${eur(W.wert60)}), schuldenfrei. Oder als Rente: rund ${eur(D.renteAusVerkauf)} im Monat über 25 Jahre, bis 85.` },
      // Seit 21.10.2026 wie die PDF: die Mieteinnahmen groß, die Zusatzrente nach Kosten und Steuer darunter.
      { buchstabe: "B", titel: "Sie behalten alle drei Wohnungen.", wert: `${eur(D.miete60)} Mieteinnahmen im Monat`, text: `aus allen drei Wohnungen. Davon bleiben nach Kosten und Steuer ≈ ${eur(D.rente60)} Zusatzrente im Monat (je Wohnung rund ${eur(Math.round(D.rente60 / 3 / 10) * 10)}; ${eur(D.rente60Vor)} vor Steuer), und die drei Wohnungen bleiben Ihr Vermögen.` },
    ],
    fuss: `Je Wohnung wie die Beispielwohnung (${eur(W.kaufpreis)}). ${MIETSZENARIO} Rente vereinfacht mit 25 % Steuer auf Miete minus Kosten. Wert +2 % im Jahr (Annahme): ${eur(W.wert60)} je Wohnung mit 60, ${eur(W.wert65)} mit 65. Verkauf nach mehr als 10 Jahren steuerfrei. Rente aus dem Verkauf ohne Zinsen gerechnet. Instandhaltung nur pauschal mit den Kosten enthalten.`,
    grundlagen: `Grundlagen: Musterrechnung mit gerundeten Werten. ${eur(P.bruttoJahr)} brutto im Jahr (${eur(P.bruttoMonat)} im Monat), Steuerklasse I, gesetzlich versichert (Zusatzbeitrag 2,9 %), kinderlos, ohne Kirchensteuer, kein Solidaritätszuschlag (Freigrenze nicht erreicht). Einkommensteuer-Grundtarif 2026 (§ 32a EStG), Beitragssätze und Beitragsbemessungsgrenzen 2026, Vorsorgepauschale 2026. Beispielwohnung ${W.name}, ${eur(W.kaufpreis)} inkl. Garage, ${W.qm.toLocaleString("de-DE")} m², Miete 13 €/m² bis 20 €/m² im Jahr 2060, Hausgeld ${eur(W.hausgeld)} im Monat. Darlehen ${eur(W.kaufpreis)}, 4,8 % Zins, 1,2 % Tilgung, Rate ${eur(W.rate)}, monatlich gerechnet, Zins über die ganze Laufzeit gleich. ${AFA_ANNAHME} Steuerwirkung während der Erwerbsphase mit dem Tarif; die Zusatzrente aus den Wohnungen (ab 60) ist vereinfacht mit 25 % Steuer gerechnet. Die letzte Rate fällt nach ${W.freiMonate} Monaten, also mit 58 Jahren und 8 Monaten. Wert +2 % im Jahr. Stand 21.10.2026.`,
  },
  /** Neue Folie nach „Nach der Abzahlung“ (PDF-Präsentation Folie 24). */
  aufbau: {
    kicker: "05 · Ihr Weg zu drei Wohnungen",
    titel: "Mit einer Wohnung beginnen, [[mit uns drei aufbauen.]]",
    schritte: [
      { marke: "Heute", titel: "Erste Wohnung", text: `z. B. wie Wohnung 1, ${eur(W.kaufpreis)}` },
      { marke: "Bis Monat 24", titel: "Zweite und dritte", text: "soweit Bonität und Bank es zulassen" },
      { marke: `Bis ${W.freiJahr}`, titel: "Tilgen und halten", text: "Mieter und Steuerersparnis tragen den größten Teil" },
      { marke: `Mit ${W.freiAlter}`, titel: "Schuldenfrei", text: "die Raten entfallen" },
      { marke: "Ab 60", titel: "Wahlfreiheit", text: "Miete beziehen, verkaufen oder beides" },
    ],
    karten: [
      { kopf: "Ihr Anteil, Jahr 1", wert: eur(MEHR[2].anfang), text: "im Monat für drei Wohnungen zusammen, nach Steuern", ton: "grau" },
      { kopf: "Vermögen mit 65", wert: ganz(D.wert65), text: "drei schuldenfreie Wohnungen", ton: "grau" },
      { kopf: "Ab 60, Wohnungen behalten", wert: eur(D.miete60), text: `Mieteinnahmen im Monat aus drei Wohnungen; davon ≈ ${eur(D.rente60)} Zusatzrente nach Kosten und Steuer`, ton: "gruen" },
    ] as ReadonlyArray<KennKarte>,
    frage: "Wäre für Sie eine Wohnung genug, oder interessiert Sie der Aufbau eines Bestands?",
    fuss: `Vereinfacht wie „Eine, zwei, drei Wohnungen“: drei gleiche Wohnungen wie die Beispielwohnung (${W.name}, ${eur(W.kaufpreis)}), alle mit 25 gekauft; jede weitere Finanzierung entscheidet die Bank nach Bonität. Anteil im ersten Jahr: vor Steuern ${eur(MEHR[2].vor)}, Steuerersparnis ${eur(D.ersparnisJahr1)} (mit mehr Wohnungen sinkt die Ersparnis je Wohnung, weil der Steuersatz fällt). ${AFA_ANNAHME} Wert +2 % pro Jahr, Miete im Szenario bis 20 €/m² im Jahr 2060, Rente vereinfacht mit 25 % Steuer auf Miete minus Kosten. Szenario, keine Zusage.`,
  },
};

export interface KennKarte {
  kopf: string;
  wert: string;
  text: string;
  ton: "grau" | "rot" | "gold" | "gruen" | "navy";
}
