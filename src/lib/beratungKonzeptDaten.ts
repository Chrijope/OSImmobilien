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
 * PDF-Präsentation): 80.000 € brutto, Hauffstraße 38 a, Wohnung 1, 176.000 €,
 * 4,8 % Zins, 1,2 % Tilgung, Rate 880 €, AfA 4 % als Annahme.
 *
 * Alle Texte in Du-Form, bewacht in `duAnrede.test.ts`.
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
  "AfA 4 % ist eine Annahme (Ersteinschätzung, Restnutzungsdauer 25 Jahre) und setzt ein Restnutzungsdauer-Gutachten voraus, das das Finanzamt anerkennen muss; das Exposé nennt für Wohnung 1 eine Ersteinschätzung von 32 Jahren (rund 3,1 %); ohne Gutachten gilt 2 %.";

const ANNAHMEN = `Annahmen: ${eur(P.bruttoJahr)} brutto im Jahr (${eur(P.bruttoMonat)} im Monat), Steuerklasse I, kinderlos, ohne Kirchensteuer, Werte 2026. Beispielwohnung ${W.name} (Exposé 19.10.2026): Kaufpreis ${eur(W.kaufpreis)} inkl. Garage, ${W.qm.toLocaleString("de-DE")} m², Kaltmiete ${eur(Math.round(W.mieteWohnung))} (13 €/m², Mietdifferenz zahlt der Bauträger laut Garantievereinbarung) plus Garage ${eur(W.garage)}, nicht umlagefähiges Hausgeld ${eur(W.hausgeld)} (davon Rücklage ${eur(W.ruecklage)}), AfA-Grundlage ${eur(W.afaGrundlage)}, Darlehen ${eur(W.kaufpreis)} mit 4,8 % Zins und 1,2 % Tilgung (Rate ${eur(W.rate)}). Werte im ersten vollen Jahr, gerundet.`;

/** Pflichthinweis unter jeder Folie des Steuer-Dokuments, wie in der PDF. */
const STEUER_ANNAHMEN = `Musterrechnung, keine Zusage. ${AFA_ANNAHME} ${ANNAHMEN}`;

const plus = (n: number) => `+${eur(n)}`;

export const KONZEPT_STEUER = {
  dokument: "Steuerersparnis mit Immobilien – kompakt",
  titel: {
    kicker: "Musterrechnung",
    titel: "Mehr [[Netto]] vom Brutto.",
    brutto: eur(P.bruttoJahr),
    bruttoText: "brutto im Jahr",
    kopf: `Davon jeden Monat, von ${eur(P.bruttoMonat)} brutto`,
    teile: [
      { label: "Netto für dich", wert: eur(P.nettoMonat), betrag: P.nettoMonat, ton: "netto" },
      { label: "Lohnsteuer an das Finanzamt", wert: eur(P.lohnsteuerMonat), betrag: P.lohnsteuerMonat, ton: "steuer" },
      { label: "Sozialabgaben", wert: eur(P.sozialMonat), betrag: P.sozialMonat, ton: "sozial" },
    ] as ReadonlyArray<{ label: string; wert: string; betrag: number; ton: "netto" | "steuer" | "sozial" }>,
    heute: { wert: eur(-P.lohnsteuerMonat), text: "gehen jeden Monat an das Finanzamt. Für immer weg." },
    mitOs: { wert: plus(W.ersparnis), text: "holst du dir davon zurück. Jeden Monat." },
    fuss: STEUER_ANNAHMEN,
  },
  finanzamt: {
    kicker: "01 · Die Sicht des Finanzamts",
    titel: "Was das Finanzamt [[wirklich]] sieht.",
    heute: { etikett: "Heute", kopf: `Dein Gehalt: ${eur(P.bruttoJahr)} brutto`, label: "Lohnsteuer im Jahr", wert: eur(P.lohnsteuerJahr), text: "Geld, das weg ist. Ohne Gegenwert für dich." },
    mitOs: { etikett: "Mit OS Real Estate", kopf: "Gehalt und Wohnung", label: "Zurück im Jahr", wert: plus(W.ersparnisJahr), text: "Die Wohnung macht auf dem Papier Verlust. Deine Steuer sinkt." },
    ergebnis: { etikett: "Dein Ergebnis", satz1: "Das Geld wäre ohnehin weg.", satz2: "Wir holen einen Teil davon zurück.", wert: plus(W.ersparnis), text: "mehr Netto, jeden Monat" },
    rechnungKopf: "So rechnet das Finanzamt",
    rechnung: [
      { kopf: "Dein Gehalt", wert: eur(P.zuVersteuern), text: "zu versteuern nach Abzug der Sozialabgaben" },
      { kopf: "Minus Wohnung", wert: eur(W.ergebnisJahr), text: "Miete minus Zinsen, Abschreibung und Kosten", minus: true },
      { kopf: "Neu zu versteuern", wert: eur(W.neuZuVersteuern), text: "weniger Einkommen auf dem Papier, also weniger Steuer", ergebnis: true },
    ] as ReadonlyArray<{ kopf: string; wert: string; text: string; minus?: true; ergebnis?: true }>,
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
    fuss: STEUER_ANNAHMEN,
  },
  dreiWege: {
    kicker: "03 · Drei Wege im Vergleich",
    titel: "Mehr [[Netto]] im [[Monat]].",
    kopf: "So viel mehr Netto hast du jeden Monat",
    saeulen: [
      { label: "Ohne Immobilie", wert: "0 €", betrag: 0, zeilen: [`Lohnsteuer ${eur(P.lohnsteuerMonat)}`, `Netto ${eur(P.nettoMonat)}`], ton: "leer" },
      { label: "Normale AfA 2 %", wert: plus(W.ersparnisOhneGutachten), betrag: W.ersparnisOhneGutachten, zeilen: [`Lohnsteuer ${eur(W.lohnsteuerMonat2)}`, `Netto ${eur(W.nettoMonat2)}`], ton: "grau" },
      { label: "OS Real Estate · AfA 4 %", wert: plus(W.ersparnis), betrag: W.ersparnis, zeilen: [`Lohnsteuer ${eur(W.lohnsteuerMonatNeu)}`, `Netto ${eur(W.nettoMonatNeu)}`], ton: "gruen" },
    ] as ReadonlyArray<{ label: string; wert: string; betrag: number; zeilen: string[]; ton: "leer" | "grau" | "gruen" }>,
    heute: { wert: eur(-P.lohnsteuerMonat), text: "Lohnsteuer, jeden Monat, ohne Gegenwert." },
    mitOs: { wert: plus(W.ersparnis), text: `jeden Monat, ${eur(W.ersparnisJahr)} im Jahr. ${eur(W.ersparnis - W.ersparnisOhneGutachten)} mehr als mit normaler AfA.` },
    fuss: `Musterrechnung, keine Zusage. ${AFA_ANNAHME} Über einen Lohnsteuerermäßigungsantrag kommt der Effekt jeden Monat an, sonst einmal im Jahr über die Steuererklärung. Die Zinsen sinken jährlich, damit auch der Effekt. ${ANNAHMEN}`,
  },
  unterm: {
    kicker: "04 · Unterm Strich",
    titel: "Deine Steuerersparnis [[trägt die Wohnung mit.]]",
    saeulen: [
      { label: "Steuerersparnis", text: "mehr Netto im Monat", wert: plus(W.ersparnis), betrag: W.ersparnis, ton: "gruen" },
      { label: "Vermögensaufbau", text: "Tilgung im Monat", wert: eur(W.tilgung), betrag: W.tilgung, ton: "navy" },
    ] as ReadonlyArray<{ label: string; text: string; wert: string; betrag: number; ton: "gruen" | "navy" }>,
    aufbau: {
      etikett: "Vermögensaufbau",
      text: `Du zahlst nach Steuer ${eur(W.anteil)} im Monat zu. Die Tilgung baut ${eur(W.tilgung)} Vermögen auf. Was du einzahlst, landet komplett in deiner eigenen Wohnung.`,
      zahlen: eur(W.anteil),
      wird: eur(W.tilgung),
    },
    ersparnis: { kopf: "Deine Ersparnis", wert: plus(W.ersparnis), text: "jeden Monat" },
    zitat: "„Deine Steuerersparnis zahlt deine Wohnung mit. Was du selbst einzahlst, landet komplett in deinem eigenen Vermögen.“",
    fragen: [
      "Wenn du wüsstest, dass dieses Geld ohnehin weg ist: Wem würdest du es lieber geben, dem Finanzamt oder dir selbst?",
      `Was würdest du mit ${eur(W.ersparnis)} mehr im Monat zuerst tun?`,
      "Wann willst du anfangen, dir dein Geld zurückzuholen?",
    ],
    fuss: `Musterrechnung, keine Zusage. ${AFA_ANNAHME} Zuzahlung vor Steuer: Rate ${eur(W.rate)} + Hausgeld ${eur(W.hausgeld)} − Miete ${eur(W.miete)} = ${eur(W.vorSteuer)}. Nach Steuer: ${eur(W.vorSteuer)} − ${eur(W.ersparnis)} = ${eur(W.anteil)}. Zinsen und Kosten minus Miete kosten dich ${eur(W.laufend)} im Monat, die Steuerersparnis von ${eur(W.ersparnis)} deckt sie ganz. Ohne Leerstand und Wertentwicklung. ${ANNAHMEN}`,
  },
};

/** Jahreswerte einer Wohnung aus der gemeinsamen Rechnung: Alter, Restschuld und Wert (+2 % im Jahr). */
export const VERLAUF_WOHNUNG: ReadonlyArray<{ alter: number; rest: number; wert: number }> = BEISPIEL.verlauf.map(([alter, rest, wert]) => ({ alter, rest, wert }));

/** Monatswerte einer Wohnung je Alter aus der gemeinsamen Rechnung: vor und nach Steuer, negativ = du zahlst zu. */
export const MONATSVERLAUF: ReadonlyArray<{ alter: number; vor: number; nach: number }> = BEISPIEL.monate.map(([alter, vor, nach]) => ({ alter, vor, nach }));

const MIETSZENARIO = "Miete von 13 €/m² auf 20 €/m² im Jahr 2060 (Szenario laut Exposé), Garage 80 € auf 150 €, Kosten +2 % im Jahr.";

export const KONZEPT_ALTER = {
  dokument: "Arbeitsleistung und Immobilienvermögen",
  titel: {
    kicker: "Modellrechnung · 25 bis 65 Jahre",
    titel: "Wir zeigen dir, wie du [[Sozialabgaben in Vermögen umwandelst.]]",
    text: `Ein Arbeitsleben mit ${eur(P.bruttoJahr)} brutto im Jahr: In 40 Jahren fließen rund ${mio(P.lebenAbgaben)} Steuern und Sozialabgaben ab. Einen Teil davon, die Lohnsteuer, holen wir zurück: Mit einer vermieteten Wohnung tragen Mieter und Finanzamt den größten Teil der Rate. Du baust Schritt für Schritt schuldenfreies Vermögen auf.`,
    karten: [
      { kopf: "Heute im Monat", wert: `${eur(P.bruttoMonat)} brutto`, text: `${eur(P.abzuegeMonat)} Steuern und Beiträge` },
      { kopf: "Mit Immobilie", wert: `${plus(W.ersparnis)} netto`, text: "weniger Lohnsteuer, fließt in die Wohnung" },
      { kopf: "Kredit abgezahlt", wert: `mit ${W.freiAlter} Jahren`, text: "danach arbeitet die Wohnung für dich" },
    ],
  },
  heute: {
    kicker: "01 · Ein Monat · heute",
    titel: `${eur(P.bruttoMonat)} Arbeitsleistung, [[${eur(P.nettoMonat)} ausgezahltes Gehalt.]]`,
    lead: `So verteilt sich ein Bruttogehalt von ${eur(P.bruttoJahr)} im Jahr, also ${eur(P.bruttoMonat)} im Monat, im Jahr 2026.`,
    kopf: "Vom Brutto zum Netto, Monatsbeträge",
    zeilen: [
      { label: "Bruttogehalt", wert: eur(P.bruttoMonat), betrag: P.bruttoMonat, ton: "brutto" },
      { label: "Lohnsteuer", wert: eur(-P.lohnsteuerMonat), betrag: P.lohnsteuerMonat, ton: "steuer" },
      { label: "Rentenversicherung", wert: eur(-P.rv), betrag: P.rv, ton: "sozial" },
      { label: "Krankenversicherung", wert: eur(-P.kv), betrag: P.kv, ton: "sozial" },
      { label: "Pflegeversicherung", wert: eur(-P.pv), betrag: P.pv, ton: "sozial" },
      { label: "Arbeitslosenversicherung", wert: eur(-P.av), betrag: P.av, ton: "sozial" },
      { label: "Netto übrig", wert: eur(P.nettoMonat), betrag: P.nettoMonat, ton: "netto" },
    ] as ReadonlyArray<WasserfallZeile>,
    karten: [
      { kopf: "Brutto", wert: eur(P.bruttoMonat), text: "100 % Arbeitsleistung", ton: "grau" },
      { kopf: "Abzüge", wert: eur(-P.abzuegeMonat), text: "Lohnsteuer und Sozialbeiträge", ton: "rot" },
      { kopf: "Netto", wert: eur(P.nettoMonat), text: "ausgezahlt, für Leben und Vorsorge", ton: "gold" },
    ] as ReadonlyArray<KennKarte>,
    abzuegeKopf: `Deine Abzüge von ${eur(P.abzuegeMonat)} im Monat`,
    abzuege: [
      { label: "Lohnsteuer: lässt sich mit einer vermieteten Wohnung gestalten", wert: eur(P.lohnsteuerMonat), betrag: P.lohnsteuerMonat, farbe: "#C0564A" },
      { label: "Sozialbeiträge: schaffen Renten- und Versicherungsansprüche", wert: eur(P.sozialMonat), betrag: P.sozialMonat, farbe: "#7E8A84" },
    ] as ReadonlyArray<StapelTeil>,
    sprech: `Jeden Monat gehen ${eur(P.lohnsteuerMonat)} Lohnsteuer an das Finanzamt. Was wäre, wenn ein Teil davon künftig deine eigene Wohnung mitbezahlt?`,
    fuss: "Gerundete Modellwerte 2026, Krankenkasse mit 2,9 % Zusatzbeitrag, Kranken- und Pflegeversicherung bis zur Beitragsbemessungsgrenze, Lohnsteuer als Jahreswert nach Grundtarif. Einkommensteuer-Grundtarif 2026 (§ 32a EStG), Steuerklasse I, kinderlos, ohne Kirchensteuer, kein Solidaritätszuschlag (Freigrenze nicht erreicht), Vorsorgepauschale 2026. Deine Abrechnung kann abweichen.",
  },
  mitImmobilie: {
    kicker: "02 · Ein Monat · mit Immobilie",
    titel: "Mehr Netto vom Brutto. [[Und daraus wird die Wohnung bespart.]]",
    lead: "Wie bekommst du dein Geld zurück? Über die Steuererklärung einmal im Jahr oder über einen Lohnsteuerermäßigungsantrag jeden Monat. Werte im ersten Jahr.",
    kopf: "Vom Brutto zum Netto, Monatsbeträge",
    zeilen: [
      { label: "Bruttogehalt", wert: eur(P.bruttoMonat), betrag: P.bruttoMonat, ton: "brutto" },
      { label: "Lohnsteuer", wert: eur(-W.lohnsteuerMonatNeu), betrag: W.lohnsteuerMonatNeu, ton: "steuer", zusatz: `statt ${eur(-P.lohnsteuerMonat)}` },
      { label: "Rentenversicherung", wert: eur(-P.rv), betrag: P.rv, ton: "sozial" },
      { label: "Krankenversicherung", wert: eur(-P.kv), betrag: P.kv, ton: "sozial" },
      { label: "Pflegeversicherung", wert: eur(-P.pv), betrag: P.pv, ton: "sozial" },
      { label: "Arbeitslosenversicherung", wert: eur(-P.av), betrag: P.av, ton: "sozial" },
      { label: "Netto übrig", wert: eur(W.nettoMonatNeu), betrag: W.nettoMonatNeu, ton: "netto", plus: plus(W.ersparnis) },
    ] as ReadonlyArray<WasserfallZeile>,
    karten: [
      { kopf: "Brutto", wert: eur(P.bruttoMonat), text: "unverändert", ton: "grau" },
      { kopf: "Abzüge", wert: eur(-(P.abzuegeMonat - W.ersparnis)), text: `${eur(W.ersparnis)} weniger Lohnsteuer`, ton: "rot" },
      { kopf: "Netto", wert: eur(W.nettoMonatNeu), text: `${plus(W.ersparnis)} mehr im Monat`, ton: "gruen" },
    ] as ReadonlyArray<KennKarte>,
    rateKopf: `So wird die Wohnung bespart: Rate ${eur(W.rate)} plus Hausgeld ${eur(W.hausgeld)} im Monat`,
    rate: [
      { label: "Miete zahlt der Mieter", wert: eur(W.miete), betrag: W.miete, farbe: "#A7D7C5" },
      { label: "Steuerersparnis", wert: eur(W.ersparnis), betrag: W.ersparnis, farbe: "#198A5F" },
      { label: "Dein Anteil", wert: eur(W.anteil), betrag: W.anteil, farbe: "#CCAC05" },
    ] as ReadonlyArray<StapelTeil>,
    band: `Woher die Steuerersparnis kommt: Das Geld, das wir freisetzen, deckt den Anteil, den du für die Immobilie zahlen müsstest. Zinsen und Kosten, die die Miete nicht trägt, sind ${eur(W.laufend)} im Monat. Deine ${eur(W.ersparnis)} mehr Netto decken das ganz, dafür zahlst du also 0 € zu. Dein Anteil von ${eur(W.anteil)} fließt komplett in die Tilgung von ${eur(W.tilgung)} im Monat, also in dein eigenes Vermögen.`,
    rechnung: `Rechnung im ersten Jahr: Miete ${eur(W.mieteJahr)} minus Zinsen ${eur(W.zinsJahr)} minus Abschreibung ${eur(W.afa4)} minus abziehbare Kosten ${eur(W.kostenAbziehbarJahr)} = ${eur(W.ergebnisJahr)}. Das senkt deine Lohnsteuer um ${eur(W.ersparnisJahr)} im Jahr.`,
    fuss: `Beispielwohnung ${W.name} (Exposé 19.10.2026): Kaufpreis ${eur(W.kaufpreis)} inkl. Garage, ${W.qm.toLocaleString("de-DE")} m², voll finanziert, 4,8 % Sollzins, 1,2 % Anfangstilgung (Rate ${eur(W.rate)}), Kaltmiete ${eur(W.mieteWohnung, 2)} (13 €/m², Mietdifferenz zahlt der Bauträger bis zur nächsten Mieterhöhung, längstens 36 Monate, laut Garantievereinbarung) plus Garage ${eur(W.garage)}, nicht umlagefähiges Hausgeld ${eur(W.hausgeld)} (davon Rücklage ${eur(W.ruecklage)}, erst bei Verwendung absetzbar), AfA 4 % auf ${eur(W.afaGrundlage)} (Annahme: Restnutzungsdauer 25 Jahre, Ersteinschätzung; das Exposé nennt 32 Jahre, rund 3,1 %) nur mit anerkanntem Restnutzungsdauer-Gutachten (ohne Gutachten 2 %: ${eur(W.ersparnisOhneGutachten)} statt ${eur(W.ersparnis)}). Kaufnebenkosten ${eur(W.nebenkosten)} aus Eigenkapital.`,
  },
  arbeitsleben: {
    kicker: "03 · Ein Arbeitsleben",
    titel: `Rund ${mio(P.lebenAbgaben)} Abgaben [[in 40 Jahren.]]`,
    karten: [
      { kopf: "Arbeitsleistung brutto", wert: mio(P.lebenBrutto), text: `480 Monate × ${eur(P.bruttoMonat)}`, ton: "grau" },
      { kopf: "Steuern und Beiträge", wert: mio(P.lebenAbgaben), text: "an Staat und Sozialkassen", ton: "rot" },
      { kopf: "Ausgezahlt", wert: mio(P.lebenNetto), text: "daraus leben und vorsorgen", ton: "gold" },
    ] as ReadonlyArray<KennKarte>,
    rausKopf: `Was rausgeht: wohin ${mio(P.lebenBrutto)} Arbeitsleistung fließen`,
    raus: [
      { label: "Netto", wert: eur(P.lebenNetto), betrag: P.lebenNetto, farbe: "#D8C79F" },
      { label: "Lohnsteuer", wert: eur(P.lebenLohnsteuer), betrag: P.lebenLohnsteuer, farbe: "#C0564A" },
      { label: "Sozialbeiträge", wert: eur(P.lebenSozial), betrag: P.lebenSozial, farbe: "#7E8A84" },
    ] as ReadonlyArray<StapelTeil>,
    reinKopf: "Was reinkommt: mit drei Wohnungen bis 65",
    rein: [
      { label: "Mieteinnahmen", wert: mio(D.miete), betrag: D.miete, ton: "gruen" },
      { label: "Abschreibung (AfA)", wert: eur(D.afa), betrag: D.afa, ton: "gold" },
      { label: "Wertwachstum", wert: mio(D.wertzuwachs), betrag: D.wertzuwachs, ton: "navy" },
    ] as ReadonlyArray<{ label: string; wert: string; betrag: number; ton: "gruen" | "gold" | "navy" }>,
    ergebnis: [
      { kopf: "Rente im Monat möglich", wert: `≈ ${eur(D.rente65)}`, text: "ab 65, drei Wohnungen behalten, nach Steuer", ton: "gruen" },
      { kopf: "Aus der Steuer gerettet", wert: eur(D.gerettet), text: "Lohnsteuer, die in dein Vermögen fließt", ton: "gold" },
      { kopf: "Vermögen bei Verkauf", wert: `≈ ${mio(D.wert65)}`, text: "drei schuldenfreie Wohnungen mit 65", ton: "navy" },
    ] as ReadonlyArray<KennKarte>,
    schluss: "Einen Teil der Lohnsteuer zurückholen und mit der Immobilie [[Altersvorsorge und Vermögen aufbauen.]]",
    fuss: `Gehalt, Beitragssätze und Steuerrecht bleiben 40 Jahre wie 2026. Drei Wohnungen wie die Beispielwohnung, alle mit 25 gekauft. ${MIETSZENARIO} Wert +2 % im Jahr (Annahme). AfA 4 % für 25 Jahre (Annahme, Gutachten erforderlich). Rente: Miete minus Kosten, minus 25 % Steuer.`,
  },
  eineWohnung: {
    kicker: "04 · Eine Wohnung",
    titel: "Kreditschulden sinken [[und Immobilienwert wächst.]]",
    lead: "Kreditschulden, dein Vermögen in der Wohnung und der Immobilienwert über 40 Jahre.",
    kopf: "Aufbau deines Gesamtvermögens",
    legende: { schulden: "Kreditschulden", vermoegen: "Dein Vermögen (Wert minus Kreditschulden)", wert: "Immobilienwertzuwachs, Annahme 2 % im Jahr" },
    marke: { titel: `${W.freiJahr} · mit ${W.freiAlter} Jahren`, zeilen: ["Kreditschulden: 0 €", `Dein Vermögen: ${eur(W.wertFrei)}`, `Immobilienwert: ${eur(W.wertFrei)}`] },
    ende: { kopf: "Gesamtvermögen mit 65 Jahren", wert: eur(W.wert65) },
    unter: `Ab ${W.freiAlter} gehört dir der ganze Wert: Dein Vermögen und der Immobilienwert sind gleich. Alle Werte in €.`,
    karten: [
      { kopf: "Kreditrate", wert: eur(W.rate), text: "im Monat, Zins und Tilgung", ton: "grau" },
      { kopf: "Kredit zu 100 % abgezahlt", wert: `mit ${W.freiAlter} Jahren`, text: `nach ${W.freiMonate} Monaten, im Jahr ${W.freiJahr}`, ton: "gruen" },
      { kopf: "Deine Wohnung mit 65", wert: eur(W.wert65), text: "schuldenfrei, gehört komplett dir", ton: "navy" },
    ] as ReadonlyArray<KennKarte>,
    fuss: `Annahmen: Kaufpreis und Darlehen ${eur(W.kaufpreis)} (${W.name}), 4,8 % Sollzins und 1,2 % Anfangstilgung, Rate ${eur(W.rate)} im Monat, Zins bis zum Ende unverändert. Kaufnebenkosten aus Eigenkapital, im Diagramm nicht enthalten. Immobilienwert +2 % im Jahr (Annahme).`,
  },
  zuzahlung: {
    kicker: "05 · Deine monatliche Zuzahlung",
    titel: `Dein Anteil am Anfang: rund ${eur(W.anteil)} [[im Monat.]]`,
    lead: `Anfangs trägt die Steuerersparnis mehr als die Hälfte der Zuzahlung. Weil die Zinsen sinken, sinkt auch die Steuerersparnis: Dein Anteil bleibt bis ${W.afaEndeAlter - 1} unter rund ${eur(W.bis49)}. Ab ${W.afaEndeAlter} ist die erhöhte Abschreibung verbraucht, dann sind es bis ${W.freiAlter - 1} bis zu rund ${eur(W.max57)}. Ab ${W.freiAlter} zahlt die Wohnung an dich.`,
    karten: [
      { kopf: "Vor Steuer · Jahr 1", wert: eur(W.vorSteuer), text: "im Monat: Rate + Kosten − Miete", ton: "rot" },
      { kopf: "Nach Steuer · dein Anteil", wert: eur(W.anteil), text: "im Monat, im ersten Jahr", ton: "gold" },
      { kopf: `Ab ${W.freiAlter} · Überschuss`, wert: plus(W.ueberschuss58), text: "im Monat vor Steuer, die Rate entfällt", ton: "gruen" },
    ] as ReadonlyArray<KennKarte>,
    kopf: "Was du im Monat zahlst und was du bekommst, eine Wohnung",
    legende: { zahlst: "du zahlst zu (nach Steuer)", bekommst: "du bekommst (nach Steuer)", vor: "vor Steuer" },
    // Spannen nach Steuer je Phase, gerechnet aus MONATSVERLAUF (siehe `spanne` in KonzeptFolien.tsx).
    phasen: [
      { von: 25, bis: W.afaEndeAlter - 1, titel: `25 bis ${W.afaEndeAlter - 1} Jahre`, vorsatz: "du zahlst " },
      { von: W.afaEndeAlter, bis: W.freiAlter - 1, titel: `${W.afaEndeAlter} bis ${W.freiAlter - 1}`, vorsatz: "" },
      { von: W.freiAlter, bis: 64, titel: `ab ${W.freiAlter}: du bekommst`, vorsatz: "+" },
    ],
    tabelleKopf: "Die Zahlen dazu",
    tabelle: { alter: [25, 30, 40, 49, 50, 57, 60, 64] },
    fuss: `Je Wohnung. ${MIETSZENARIO} Steuer bis 64 mit deinem Tarif 2026, ab 65 vereinfacht 25 %. Mit ${W.freiAlter} laufen noch ${W.restRaten} Raten, deshalb liegt dieses Jahr niedriger. Nach Steuer zahlst du bis ${W.freiAlter - 1} insgesamt rund ${eur(MEHR[0].zu)} zu.`,
  },
  mehrWohnungen: {
    kicker: "06 · Eine, zwei, drei Wohnungen",
    titel: "Mit jeder Wohnung [[wächst dein Vermögen.]]",
    lead: "So rechnet es sich, wenn du nicht bei einer Wohnung bleibst. Die Steuerersparnis trägt jede weitere Wohnung mit, das Vermögen mit 65 verdreifacht sich.",
    kopf: "Dein Vermögen mit 65, schuldenfrei",
    saeulen: [1, 2, 3].map((n) => ({
      label: n === 1 ? "1 Wohnung" : `${n} Wohnungen`,
      text: `${n} × ${eur(W.wert65)}`,
      wert: mio(n * W.wert65),
      betrag: n,
    })),
    spalten: ["1 Wohnung", "2 Wohnungen", "3 Wohnungen"],
    zeilen: [
      { text: "Zuzahlung vor Steuer, Jahr 1", werte: MEHR.map((m) => eur(m.vor)) },
      { text: "Dein Anteil nach Steuer, Jahr 1", werte: MEHR.map((m) => eur(m.anfang)) },
      { text: `Dein Anteil nach Steuer, höchster Wert bis ${W.freiAlter - 1}`, werte: MEHR.map((m) => `bis ${eur(m.spaet)}`) },
      { text: `Überschuss ab ${W.freiAlter}, vor Steuer`, werte: MEHR.map((m) => plus(m.ab58)) },
      { text: "Vermögen mit 65", werte: [1, 2, 3].map((n) => mio(n * W.wert65)), summe: true },
    ] as ReadonlyArray<{ text: string; werte: string[]; summe?: true }>,
    schluss: `Mit der dritten Wohnung: [[3 × ${eur(W.wert65)}]]`,
    schlussWert: mio(D.wert65),
    fuss: `Alle Wohnungen gleich und mit 25 gekauft, Steuer gemeinsam gerechnet; mit mehr Wohnungen sinkt die Ersparnis je Wohnung, weil der Steuersatz fällt. Monatswerte. Wert +2 % im Jahr (Annahme). Bis ${W.freiAlter - 1} zahlst du nach Steuer insgesamt rund ${eur(MEHR[0].zu)} (eine), ${eur(MEHR[1].zu)} (zwei) und ${eur(MEHR[2].zu)} (drei Wohnungen) zu.`,
  },
  rente: {
    kicker: "07 · Nach der Abzahlung",
    titel: `Deine vorzeitige Rente [[mit ${W.freiAlter} Jahren.]]`,
    lead: `Ab ${W.freiAlter} ist der Kredit abgezahlt. Die Rate von 3 × ${eur(W.rate)} entfällt, die Mieten der drei Wohnungen bleiben bei dir. Mit 60 hast du zwei Wege.`,
    /*
     * Im Modell sind alle drei Wohnungen mit 25 gekauft. Ein gestaffelter Kauf
     * ergäbe andere Zahlen, darum zeigt der Zeitstrahl die drei Wohnungen
     * nacheinander, aber alle mit 25.
     */
    zeitstrahl: [
      { alter: "25 J.", titel: "Kauf", text: "Wohnung 1, 2 und 3", wohnungen: 3 },
      { alter: `${W.freiAlter} J.`, titel: String(W.freiJahr), text: "Kredit abgezahlt" },
      { alter: "60 J.", titel: "Renteneintritt", text: "zwei Wege" },
    ],
    wohnung: "Wohnung",
    zahlstZu: "du zahlst zu",
    wegeKopf: "Dein Renteneintritt mit 60: zwei Wege",
    wege: [
      { buchstabe: "A", titel: "Du verkaufst mit 60 alle drei Wohnungen.", wert: `≈ ${mio(D.verkauf60)}`, text: `einmalige Auszahlung, schuldenfrei. Oder als Rente: rund ${eur(D.renteAusVerkauf)} im Monat über 25 Jahre, bis 85.` },
      { buchstabe: "B", titel: "Du behältst die Wohnungen.", wert: `≈ ${eur(D.rente60)} im Monat`, text: `Zusatzrente nach Steuer (${eur(D.rente60Vor)} vor Steuer), und die drei Wohnungen bleiben dein Vermögen.` },
    ],
    fuss: `Je Wohnung wie die Beispielwohnung (${eur(W.kaufpreis)}). ${MIETSZENARIO} Rente vereinfacht mit 25 % Steuer auf Miete minus Kosten. Wert +2 % im Jahr (Annahme): ${eur(W.wert60)} je Wohnung mit 60, ${eur(W.wert65)} mit 65. Verkauf nach mehr als 10 Jahren steuerfrei. Rente aus dem Verkauf ohne Zinsen gerechnet. Instandhaltung nur pauschal mit den Kosten enthalten.`,
    grundlagen: `Grundlagen: Musterrechnung mit gerundeten Werten. ${eur(P.bruttoJahr)} brutto im Jahr (${eur(P.bruttoMonat)} im Monat), Steuerklasse I, gesetzlich versichert (Zusatzbeitrag 2,9 %), kinderlos, ohne Kirchensteuer, kein Solidaritätszuschlag (Freigrenze nicht erreicht). Einkommensteuer-Grundtarif 2026 (§ 32a EStG), Beitragssätze und Beitragsbemessungsgrenzen 2026, Vorsorgepauschale 2026. Beispielwohnung ${W.name}, ${eur(W.kaufpreis)} inkl. Garage, ${W.qm.toLocaleString("de-DE")} m², Miete 13 €/m² bis 20 €/m² im Jahr 2060, Hausgeld ${eur(W.hausgeld)} im Monat. Darlehen ${eur(W.kaufpreis)}, 4,8 % Zins, 1,2 % Tilgung, Rate ${eur(W.rate)}, monatlich gerechnet, Zins über die ganze Laufzeit gleich. ${AFA_ANNAHME} Steuerwirkung bis 64 mit dem Tarif, ab 65 vereinfacht 25 %. Wert +2 % im Jahr. Stand 21.10.2026.`,
  },
  /** Neue Folie nach „Nach der Abzahlung“ (PDF-Präsentation Folie 24). */
  aufbau: {
    kicker: "08 · Dein Weg zu drei Wohnungen",
    titel: "Mit einer Wohnung beginnen, [[mit uns drei aufbauen.]]",
    schritte: [
      { marke: "Heute", titel: "Erste Wohnung", text: `z. B. wie Wohnung 1, ${eur(W.kaufpreis)}` },
      { marke: "Bis Monat 24", titel: "Zweite und dritte", text: "soweit Bonität und Bank es zulassen" },
      { marke: `Bis ${W.freiJahr}`, titel: "Tilgen und halten", text: "Mieter und Steuerersparnis tragen den größten Teil" },
      { marke: `Mit ${W.freiAlter}`, titel: "Schuldenfrei", text: "die Raten entfallen" },
      { marke: "Ab 60", titel: "Wahlfreiheit", text: "Miete beziehen, verkaufen oder beides" },
    ],
    karten: [
      { kopf: "Dein Anteil, Jahr 1", wert: eur(MEHR[2].anfang), text: "im Monat für drei Wohnungen, nach Steuern", ton: "grau" },
      { kopf: "Vermögen mit 65", wert: mio(D.wert65), text: "drei schuldenfreie Wohnungen", ton: "grau" },
      { kopf: "Zusatzrente ab 60", wert: `≈ ${eur(D.rente60)}`, text: "im Monat nach Steuern, Wohnungen behalten", ton: "gruen" },
    ] as ReadonlyArray<KennKarte>,
    frage: "Wäre für dich eine Wohnung genug, oder interessiert dich der Aufbau eines Bestands?",
    fuss: `Vereinfacht wie „Eine, zwei, drei Wohnungen“: drei gleiche Wohnungen wie die Beispielwohnung (${W.name}, ${eur(W.kaufpreis)}), alle mit 25 gekauft; jede weitere Finanzierung entscheidet die Bank nach Bonität. Anteil im ersten Jahr: vor Steuern ${eur(MEHR[2].vor)}, Steuerersparnis ${eur(D.ersparnisJahr1)} (mit mehr Wohnungen sinkt die Ersparnis je Wohnung, weil der Steuersatz fällt). ${AFA_ANNAHME} Wert +2 % pro Jahr, Miete im Szenario bis 20 €/m² im Jahr 2060, Rente vereinfacht mit 25 % Steuer auf Miete minus Kosten. Szenario, keine Zusage.`,
  },
};

export interface WasserfallZeile {
  label: string;
  wert: string;
  betrag: number;
  ton: "brutto" | "steuer" | "sozial" | "netto";
  zusatz?: string;
  plus?: string;
}
export interface KennKarte {
  kopf: string;
  wert: string;
  text: string;
  ton: "grau" | "rot" | "gold" | "gruen" | "navy";
}
export interface StapelTeil {
  label: string;
  wert: string;
  betrag: number;
  farbe: string;
}
