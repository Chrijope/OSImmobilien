/**
 * Inhalte der beiden Vertriebs-PDFs als Folien der Beratungspräsentation
 * (Abschnitt 08, seit dem 16.10.2026).
 *
 * - „Steuerersparnis mit Immobilien – kompakt“ gehört zum Konzept Steuerersparnis.
 * - „Arbeitsleistung und Immobilienvermögen“ gehört zum Konzept Altersvorsorge.
 *
 * Texte und Zahlen stehen wörtlich wie in den PDFs
 * (public/vertriebsunterlagen/). Die Zahlen kommen aus dem
 * „Rechenprotokoll Überarbeitung.md“ (Desktop, Vertrieb Überarbeitung
 * 2026-10, Rechenskript Quellen/rechnung3.py): 80.000 € brutto, Wohnung
 * 240.000 €, 4,8 % Zins, 1,2 % Tilgung, Rate 1.200 €. Nichts hier ist neu
 * gerechnet; die Reihen für die Diagramme sind die Jahreswerte des Skripts.
 *
 * Alle Texte in Du-Form, bewacht in `duAnrede.test.ts`.
 */

/** Pflichthinweis unter jeder Folie des Steuer-Dokuments, gekürzt wie im PDF. */
const STEUER_ANNAHMEN =
  "Musterrechnung. Der AfA-Satz von 4 % setzt ein Restnutzungsdauer-Gutachten voraus, das das Finanzamt anerkennt; sonst gilt der normale Satz von 2 %. Annahmen: 80.000 € brutto im Jahr (6.667 € im Monat), Steuerklasse I, kinderlos, ohne Kirchensteuer, Werte 2026. Wohnung 240.000 €, 75 m², Gebäudeanteil 192.000 €, Kaltmiete 975 € (13 €/m²), Kosten 100 € im Monat, Darlehen 240.000 € mit 4,8 % Zins und 1,2 % Tilgung (Rate 1.200 €). Werte im ersten vollen Jahr, gerundet.";

export const KONZEPT_STEUER = {
  dokument: "Steuerersparnis mit Immobilien – kompakt",
  titel: {
    kicker: "Musterrechnung",
    titel: "Mehr [[Netto]] vom Brutto.",
    brutto: "80.000 €",
    bruttoText: "brutto im Jahr",
    kopf: "Davon jeden Monat, von 6.667 € brutto",
    teile: [
      { label: "Netto für dich", wert: "4.038 €", betrag: 4038, ton: "netto" },
      { label: "Lohnsteuer an das Finanzamt", wert: "1.273 €", betrag: 1273, ton: "steuer" },
      { label: "Sozialabgaben", wert: "1.355 €", betrag: 1355, ton: "sozial" },
    ] as ReadonlyArray<{ label: string; wert: string; betrag: number; ton: "netto" | "steuer" | "sozial" }>,
    heute: { wert: "−1.273 €", text: "gehen jeden Monat an das Finanzamt. Für immer weg." },
    mitOs: { wert: "+274 €", text: "holst du dir davon zurück. Jeden Monat." },
    fuss: STEUER_ANNAHMEN,
  },
  finanzamt: {
    kicker: "01 · Die Sicht des Finanzamts",
    titel: "Was das Finanzamt [[wirklich]] sieht.",
    heute: { etikett: "Heute", kopf: "Dein Gehalt: 80.000 € brutto", label: "Lohnsteuer im Jahr", wert: "15.281 €", text: "Geld, das weg ist. Ohne Gegenwert für dich." },
    mitOs: { etikett: "Mit OS Real Estate", kopf: "Gehalt und Wohnung", label: "Zurück im Jahr", wert: "+3.282 €", text: "Die Wohnung macht auf dem Papier Verlust. Deine Steuer sinkt." },
    ergebnis: { etikett: "Dein Ergebnis", satz1: "Das Geld wäre ohnehin weg.", satz2: "Wir holen einen Teil davon zurück.", wert: "+274 €", text: "mehr Netto, jeden Monat" },
    rechnungKopf: "So rechnet das Finanzamt",
    rechnung: [
      { kopf: "Dein Gehalt", wert: "62.686 €", text: "zu versteuern nach Abzug der Sozialabgaben" },
      { kopf: "Minus Wohnung", wert: "−8.636 €", text: "Miete minus Zinsen, Abschreibung und Kosten", minus: true },
      { kopf: "Neu zu versteuern", wert: "54.050 €", text: "weniger Einkommen auf dem Papier, also weniger Steuer", ergebnis: true },
    ] as ReadonlyArray<{ kopf: string; wert: string; text: string; minus?: true; ergebnis?: true }>,
    fuss: STEUER_ANNAHMEN,
  },
  hebel: {
    kicker: "02 · Der Hebel",
    titel: "[[AfA]]: Absetzung für Abnutzung.",
    unterzeile: "Steuer sparen, ohne dass Geld vom Konto fließt.",
    normal: { etikett: "Heute: normaler Satz", wert: "2 %", text: "im Jahr · 3.840 € Abschreibung" },
    os: { etikett: "Mit OS Real Estate", wert: "4 %", text: "im Jahr · 7.680 € Abschreibung, doppelt so viel" },
    balkenKopf: "Abschreibung pro Jahr auf 192.000 € Gebäudeanteil",
    balken: [
      { label: "Ohne Immobilie", wert: "0 €", betrag: 0, ton: "leer" },
      { label: "Normale AfA 2 %", wert: "3.840 €", betrag: 3840, ton: "grau" },
      { label: "OS Real Estate 4 %", wert: "7.680 €", betrag: 7680, ton: "gruen" },
      { label: "bis 8 % möglich", wert: "15.360 €", betrag: 15360, ton: "gestrichelt" },
    ] as ReadonlyArray<{ label: string; wert: string; betrag: number; ton: "leer" | "grau" | "gruen" | "gestrichelt" }>,
    band: "Der Schlüssel: ein [[Restnutzungsdauer-Gutachten]]. Restnutzung 25 Jahre = 4 % AfA im Jahr. Das Finanzamt muss es anerkennen.",
    fuss: STEUER_ANNAHMEN,
  },
  dreiWege: {
    kicker: "03 · Drei Wege im Vergleich",
    titel: "Mehr [[Netto]] im [[Monat]].",
    kopf: "So viel mehr Netto hast du jeden Monat",
    saeulen: [
      { label: "Ohne Immobilie", wert: "0 €", betrag: 0, zeilen: ["Lohnsteuer 1.273 €", "Netto 4.038 €"], ton: "leer" },
      { label: "Normale AfA 2 %", wert: "+155 €", betrag: 155, zeilen: ["Lohnsteuer 1.119 €", "Netto 4.193 €"], ton: "grau" },
      { label: "OS Real Estate · AfA 4 %", wert: "+274 €", betrag: 274, zeilen: ["Lohnsteuer 1.000 €", "Netto 4.312 €"], ton: "gruen" },
    ] as ReadonlyArray<{ label: string; wert: string; betrag: number; zeilen: string[]; ton: "leer" | "grau" | "gruen" }>,
    heute: { wert: "−1.273 €", text: "Lohnsteuer, jeden Monat, ohne Gegenwert." },
    mitOs: { wert: "+274 €", text: "jeden Monat, 3.282 € im Jahr. 119 € mehr als mit normaler AfA." },
    fuss: `${STEUER_ANNAHMEN} Über einen Lohnsteuerermäßigungsantrag kommt der Effekt jeden Monat an, sonst einmal im Jahr über die Steuererklärung. Die Zinsen sinken jährlich, damit auch der Effekt.`,
  },
  unterm: {
    kicker: "04 · Unterm Strich",
    titel: "Deine Steuerersparnis [[trägt die Wohnung.]]",
    saeulen: [
      { label: "Steuerersparnis", text: "mehr Netto im Monat", wert: "+274 €", betrag: 274, ton: "gruen" },
      { label: "Vermögensaufbau", text: "Tilgung im Monat", wert: "245 €", betrag: 245, ton: "navy" },
    ] as ReadonlyArray<{ label: string; text: string; wert: string; betrag: number; ton: "gruen" | "navy" }>,
    aufbau: {
      etikett: "Vermögensaufbau",
      text: "Du zahlst nach Steuer 52 € im Monat zu. Die Tilgung baut 245 € Vermögen auf. Was du einzahlst, landet komplett in deiner eigenen Wohnung.",
      zahlen: "52 €",
      wird: "245 €",
    },
    ersparnis: { kopf: "Deine Ersparnis", wert: "+274 €", text: "jeden Monat" },
    zitat: "„Deine Steuerersparnis zahlt deine Wohnung mit. Was du selbst einzahlst, landet komplett in deinem eigenen Vermögen.“",
    fragen: [
      "Wenn du wüsstest, dass dieses Geld ohnehin weg ist: Wem würdest du es lieber geben, dem Finanzamt oder dir selbst?",
      "Was würdest du mit 274 € mehr im Monat zuerst tun?",
      "Wann willst du anfangen, dir dein Geld zurückzuholen?",
    ],
    fuss: `Zuzahlung vor Steuer: Rate 1.200 € + Kosten 100 € − Miete 975 € = 325 €. Nach Steuer: 325 € − 274 € = 52 €. Zinsen und Kosten minus Miete kosten dich 80 € im Monat, die Steuerersparnis von 274 € deckt sie ganz. Ohne Instandhaltungsrücklage, Leerstand und Wertentwicklung. ${STEUER_ANNAHMEN}`,
  },
};

/** Jahreswerte einer Wohnung aus rechnung3.py: Alter am Jahresende, Restschuld und Wert (+2 % im Jahr). */
export const VERLAUF_WOHNUNG: ReadonlyArray<{ alter: number; rest: number; wert: number }> = [
  [25, 240000, 240000], [26, 237056, 244800], [27, 233967, 249696], [28, 230727, 254690], [29, 227328, 259784],
  [30, 223762, 264979], [31, 220021, 270279], [32, 216096, 275685], [33, 211979, 281198], [34, 207659, 286822],
  [35, 203128, 292559], [36, 198375, 298410], [37, 193388, 304378], [38, 188157, 310466], [39, 182668, 316675],
  [40, 176911, 323008], [41, 170871, 329469], [42, 164535, 336058], [43, 157887, 342779], [44, 150914, 349635],
  [45, 143598, 356627], [46, 135923, 363760], [47, 127872, 371035], [48, 119426, 378456], [49, 110565, 386025],
  [50, 101269, 393745], [51, 91517, 401620], [52, 81287, 409653], [53, 70555, 417846], [54, 59296, 426203],
  [55, 47485, 434727], [56, 35094, 443421], [57, 22095, 452290], [58, 8458, 461336], [59, 0, 470562],
  [60, 0, 479973], [61, 0, 489573], [62, 0, 499364], [63, 0, 509352], [64, 0, 519539], [65, 0, 529930],
].map(([alter, rest, wert]) => ({ alter, rest, wert }));

/** Monatswerte einer Wohnung je Alter aus rechnung3.py: vor und nach Steuer, negativ = du zahlst zu. */
export const MONATSVERLAUF: ReadonlyArray<{ alter: number; vor: number; nach: number }> = [
  [25, -325, -52], [26, -315, -50], [27, -305, -48], [28, -295, -46], [29, -285, -45], [30, -275, -44],
  [31, -264, -43], [32, -254, -43], [33, -243, -42], [34, -233, -42], [35, -222, -42], [36, -211, -43],
  [37, -200, -44], [38, -188, -45], [39, -177, -46], [40, -166, -48], [41, -154, -50], [42, -142, -53],
  [43, -130, -56], [44, -118, -60], [45, -106, -64], [46, -94, -69], [47, -81, -75], [48, -69, -81],
  [49, -56, -87], [50, -43, -359], [51, -30, -368], [52, -17, -378], [53, -4, -389], [54, 9, -400],
  [55, 23, -413], [56, 37, -426], [57, 51, -440], [58, 548, 29], [59, 1279, 749], [60, 1293, 757],
  [61, 1308, 766], [62, 1322, 774], [63, 1337, 783], [64, 1352, 792],
].map(([alter, vor, nach]) => ({ alter, vor, nach }));

export const KONZEPT_ALTER = {
  dokument: "Arbeitsleistung und Immobilienvermögen",
  titel: {
    kicker: "Modellrechnung · 25 bis 65 Jahre",
    titel: "Wir zeigen dir, wie du [[Sozialabgaben in Vermögen umwandelst.]]",
    text: "Ein Arbeitsleben mit 80.000 € brutto im Jahr: In 40 Jahren fließen rund 1,26 Mio. € Steuern und Sozialabgaben ab. Einen Teil davon, die Lohnsteuer, holen wir zurück: Mit einer vermieteten Wohnung tragen Mieter und Finanzamt den größten Teil der Rate. Du baust Schritt für Schritt schuldenfreies Vermögen auf.",
    karten: [
      { kopf: "Heute im Monat", wert: "6.667 € brutto", text: "2.628 € Steuern und Beiträge" },
      { kopf: "Mit Immobilie", wert: "+274 € netto", text: "weniger Lohnsteuer, fließt in die Wohnung" },
      { kopf: "Kredit abgezahlt", wert: "mit 58 Jahren", text: "danach arbeitet die Wohnung für dich" },
    ],
  },
  heute: {
    kicker: "01 · Ein Monat · heute",
    titel: "6.667 € Arbeitsleistung, [[4.038 € ausgezahltes Gehalt.]]",
    lead: "So verteilt sich ein Bruttogehalt von 80.000 € im Jahr, also 6.667 € im Monat, im Jahr 2026.",
    kopf: "Vom Brutto zum Netto, Monatsbeträge",
    zeilen: [
      { label: "Bruttogehalt", wert: "6.667 €", betrag: 6667, ton: "brutto" },
      { label: "Lohnsteuer", wert: "−1.273 €", betrag: 1273, ton: "steuer" },
      { label: "Rentenversicherung", wert: "−620 €", betrag: 620, ton: "sozial" },
      { label: "Krankenversicherung", wert: "−509 €", betrag: 509, ton: "sozial" },
      { label: "Pflegeversicherung", wert: "−140 €", betrag: 140, ton: "sozial" },
      { label: "Arbeitslosenversicherung", wert: "−87 €", betrag: 87, ton: "sozial" },
      { label: "Netto übrig", wert: "4.038 €", betrag: 4038, ton: "netto" },
    ] as ReadonlyArray<WasserfallZeile>,
    karten: [
      { kopf: "Brutto", wert: "6.667 €", text: "100 % Arbeitsleistung", ton: "grau" },
      { kopf: "Abzüge", wert: "−2.628 €", text: "Lohnsteuer und Sozialbeiträge", ton: "rot" },
      { kopf: "Netto", wert: "4.038 €", text: "ausgezahlt, für Leben und Vorsorge", ton: "gold" },
    ] as ReadonlyArray<KennKarte>,
    abzuegeKopf: "Deine Abzüge von 2.628 € im Monat",
    abzuege: [
      { label: "Lohnsteuer: lässt sich mit einer vermieteten Wohnung gestalten", wert: "1.273 €", betrag: 1273, farbe: "#C0564A" },
      { label: "Sozialbeiträge: schaffen Renten- und Versicherungsansprüche", wert: "1.355 €", betrag: 1355, farbe: "#7E8A84" },
    ] as ReadonlyArray<StapelTeil>,
    sprech: "Jeden Monat gehen 1.273 € Lohnsteuer an das Finanzamt. Was wäre, wenn ein Teil davon künftig deine eigene Wohnung mitbezahlt?",
    fuss: "Gerundete Modellwerte 2026, Krankenkasse mit 2,9 % Zusatzbeitrag, Kranken- und Pflegeversicherung bis zur Beitragsbemessungsgrenze, Lohnsteuer als Jahreswert nach Grundtarif. Deine Abrechnung kann abweichen.",
  },
  mitImmobilie: {
    kicker: "02 · Ein Monat · mit Immobilie",
    titel: "Mehr Netto vom Brutto. [[Und daraus wird die Wohnung bespart.]]",
    lead: "Wie bekommst du dein Geld zurück? Über die Steuererklärung einmal im Jahr oder über einen Lohnsteuerermäßigungsantrag jeden Monat. Werte im ersten Jahr.",
    kopf: "Vom Brutto zum Netto, Monatsbeträge",
    zeilen: [
      { label: "Bruttogehalt", wert: "6.667 €", betrag: 6667, ton: "brutto" },
      { label: "Lohnsteuer", wert: "−1.000 €", betrag: 1000, ton: "steuer", zusatz: "statt −1.273 €" },
      { label: "Rentenversicherung", wert: "−620 €", betrag: 620, ton: "sozial" },
      { label: "Krankenversicherung", wert: "−509 €", betrag: 509, ton: "sozial" },
      { label: "Pflegeversicherung", wert: "−140 €", betrag: 140, ton: "sozial" },
      { label: "Arbeitslosenversicherung", wert: "−87 €", betrag: 87, ton: "sozial" },
      { label: "Netto übrig", wert: "4.312 €", betrag: 4312, ton: "netto", plus: "+274 €" },
    ] as ReadonlyArray<WasserfallZeile>,
    karten: [
      { kopf: "Brutto", wert: "6.667 €", text: "unverändert", ton: "grau" },
      { kopf: "Abzüge", wert: "−2.355 €", text: "274 € weniger Lohnsteuer", ton: "rot" },
      { kopf: "Netto", wert: "4.312 €", text: "+274 € mehr im Monat", ton: "gruen" },
    ] as ReadonlyArray<KennKarte>,
    rateKopf: "So wird die Wohnung bespart: Rate 1.200 € plus Kosten 100 € im Monat",
    rate: [
      { label: "Miete zahlt der Mieter", wert: "975 €", betrag: 975, farbe: "#A7D7C5" },
      { label: "Steuerersparnis", wert: "274 €", betrag: 274, farbe: "#198A5F" },
      { label: "Dein Anteil", wert: "52 €", betrag: 52, farbe: "#CCAC05" },
    ] as ReadonlyArray<StapelTeil>,
    band: "Woher die Steuerersparnis kommt: Das Geld, das wir freisetzen, deckt den Anteil, den du für die Immobilie zahlen müsstest. Zinsen und Kosten, die die Miete nicht trägt, sind 80 € im Monat. Deine 274 € mehr Netto decken das ganz, dafür zahlst du also 0 € zu. Deine 52 € fließen komplett in die Tilgung von 245 € im Monat, also in dein eigenes Vermögen.",
    rechnung: "Rechnung im ersten Jahr: Miete 11.700 € minus Zinsen 11.456 € minus Abschreibung 7.680 € minus Kosten 1.200 € = −8.636 €. Das senkt deine Lohnsteuer um 3.282 € im Jahr.",
    fuss: "Wohnung im Beispiel: Kaufpreis 240.000 €, 75 m², voll finanziert, 4,8 % Sollzins, 1,2 % Anfangstilgung, Kaltmiete 975 € (13 €/m²), nicht umlagefähige Kosten 100 € im Monat, AfA 4 % auf 192.000 € Gebäudeanteil mit Restnutzungsdauer-Gutachten (ohne Gutachten 2 %: 155 € statt 274 €). Kaufnebenkosten aus Eigenkapital.",
  },
  arbeitsleben: {
    kicker: "03 · Ein Arbeitsleben",
    titel: "Rund 1,26 Mio. € Abgaben [[in 40 Jahren.]]",
    karten: [
      { kopf: "Arbeitsleistung brutto", wert: "3,20 Mio. €", text: "480 Monate × 6.667 €", ton: "grau" },
      { kopf: "Steuern und Beiträge", wert: "1,26 Mio. €", text: "an Staat und Sozialkassen", ton: "rot" },
      { kopf: "Ausgezahlt", wert: "1,94 Mio. €", text: "daraus leben und vorsorgen", ton: "gold" },
    ] as ReadonlyArray<KennKarte>,
    rausKopf: "Was rausgeht: wohin 3,20 Mio. € Arbeitsleistung fließen",
    raus: [
      { label: "Netto", wert: "1.938.475 €", betrag: 1938475, farbe: "#D8C79F" },
      { label: "Lohnsteuer", wert: "611.240 €", betrag: 611240, farbe: "#C0564A" },
      { label: "Sozialbeiträge", wert: "650.285 €", betrag: 650285, farbe: "#7E8A84" },
    ] as ReadonlyArray<StapelTeil>,
    reinKopf: "Was reinkommt: mit drei Wohnungen bis 65",
    rein: [
      { label: "Mieteinnahmen", wert: "1,76 Mio. €", betrag: 1_760_000, ton: "gruen" },
      { label: "Abschreibung (AfA)", wert: "576.000 €", betrag: 576_000, ton: "gold" },
      { label: "Wertwachstum", wert: "0,87 Mio. €", betrag: 870_000, ton: "navy" },
    ] as ReadonlyArray<{ label: string; wert: string; betrag: number; ton: "gruen" | "gold" | "navy" }>,
    ergebnis: [
      { kopf: "Rente im Monat möglich", wert: "≈ 3.080 €", text: "ab 65, drei Wohnungen behalten, nach Steuer", ton: "gruen" },
      { kopf: "Aus der Steuer gerettet", wert: "123.500 €", text: "Lohnsteuer, die in dein Vermögen fließt", ton: "gold" },
      { kopf: "Vermögen bei Verkauf", wert: "≈ 1,59 Mio. €", text: "drei schuldenfreie Wohnungen mit 65", ton: "navy" },
    ] as ReadonlyArray<KennKarte>,
    schluss: "Einen Teil der Lohnsteuer zurückholen und mit der Immobilie [[Altersvorsorge und Vermögen aufbauen.]]",
    fuss: "Gehalt, Beitragssätze und Steuerrecht bleiben 40 Jahre wie 2026. Drei Wohnungen wie im Beispiel, alle mit 25 gekauft. Miete von 13 €/m² auf 19 €/m² im Jahr 2060, Wert +2 % im Jahr (Annahme). AfA 4 % für 25 Jahre. Rente: Miete minus Kosten, minus 25 % Steuer.",
  },
  eineWohnung: {
    kicker: "04 · Eine Wohnung",
    titel: "Kreditschulden sinken [[und Immobilienwert wächst.]]",
    lead: "Kreditschulden, dein Vermögen in der Wohnung und der Immobilienwert über 40 Jahre.",
    kopf: "Aufbau deines Gesamtvermögens",
    legende: { schulden: "Kreditschulden", vermoegen: "Dein Vermögen (Wert minus Kreditschulden)", wert: "Immobilienwertzuwachs, Annahme 2 % im Jahr" },
    marke: { titel: "2059 · mit 58 Jahren", zeilen: ["Kreditschulden: 0 €", "Dein Vermögen: 467.500 €", "Immobilienwert: 467.500 €"] },
    ende: { kopf: "Gesamtvermögen mit 65 Jahren", wert: "529.900 €" },
    unter: "Ab 58 gehört dir der ganze Wert: Dein Vermögen und der Immobilienwert sind gleich. Alle Werte in €.",
    karten: [
      { kopf: "Kreditrate", wert: "1.200 €", text: "im Monat, Zins und Tilgung", ton: "grau" },
      { kopf: "Kredit zu 100 % abgezahlt", wert: "mit 58 Jahren", text: "nach 404 Monaten, im Jahr 2059", ton: "gruen" },
      { kopf: "Deine Wohnung mit 65", wert: "529.900 €", text: "schuldenfrei, gehört komplett dir", ton: "navy" },
    ] as ReadonlyArray<KennKarte>,
    fuss: "Annahmen: Kaufpreis und Darlehen 240.000 €, 4,8 % Sollzins und 1,2 % Anfangstilgung, Rate 1.200 € im Monat, Zins bis zum Ende unverändert. Kaufnebenkosten aus Eigenkapital, im Diagramm nicht enthalten. Immobilienwert +2 % im Jahr (Annahme).",
  },
  zuzahlung: {
    kicker: "05 · Deine monatliche Zuzahlung",
    titel: "Dein Anteil am Anfang: rund 50 € [[im Monat.]]",
    lead: "Anfangs trägt die Steuerersparnis fast alles, bis 49 bleibt dein Anteil unter 90 €. Ab 50 ist die erhöhte Abschreibung verbraucht, dann sind es bis 57 rund 440 €. Ab 58 zahlt die Wohnung an dich.",
    karten: [
      { kopf: "Vor Steuer · Jahr 1", wert: "325 €", text: "im Monat: Rate + Kosten − Miete", ton: "rot" },
      { kopf: "Nach Steuer · dein Anteil", wert: "52 €", text: "im Monat, im ersten Jahr", ton: "gold" },
      { kopf: "Ab 58 · Überschuss", wert: "+1.260 €", text: "im Monat vor Steuer, die Rate entfällt", ton: "gruen" },
    ] as ReadonlyArray<KennKarte>,
    kopf: "Was du im Monat zahlst und was du bekommst, eine Wohnung",
    legende: { zahlst: "du zahlst zu (nach Steuer)", bekommst: "du bekommst (nach Steuer)", vor: "vor Steuer" },
    phasen: [
      { von: 25, bis: 49, titel: "25 bis 49 Jahre", text: "du zahlst 40 bis 90 €" },
      { von: 50, bis: 57, titel: "50 bis 57", text: "360 bis 440 €" },
      { von: 58, bis: 64, titel: "ab 58: du bekommst", text: "+750 bis 790 €" },
    ],
    tabelleKopf: "Die Zahlen dazu",
    tabelle: { alter: [25, 30, 40, 49, 50, 57, 60, 64] },
    fuss: "Je Wohnung. Miete von 13 €/m² auf 19 €/m² im Jahr 2060, Kosten steigen mit. Steuer bis 64 mit deinem Tarif 2026, ab 65 vereinfacht 25 %. Mit 58 laufen noch 8 Raten, deshalb liegt dieses Jahr niedriger. Nach Steuer zahlst du bis 57 insgesamt rund 53.900 € zu.",
  },
  mehrWohnungen: {
    kicker: "06 · Eine, zwei, drei Wohnungen",
    titel: "Mit jeder Wohnung [[wächst dein Vermögen.]]",
    lead: "So rechnet es sich, wenn du nicht bei einer Wohnung bleibst. Die Steuerersparnis trägt jede weitere Wohnung mit, das Vermögen mit 65 verdreifacht sich.",
    kopf: "Dein Vermögen mit 65, schuldenfrei",
    saeulen: [
      { label: "1 Wohnung", text: "1 × 529.900 €", wert: "0,53 Mio. €", betrag: 1 },
      { label: "2 Wohnungen", text: "2 × 529.900 €", wert: "1,06 Mio. €", betrag: 2 },
      { label: "3 Wohnungen", text: "3 × 529.900 €", wert: "1,59 Mio. €", betrag: 3 },
    ],
    spalten: ["1 Wohnung", "2 Wohnungen", "3 Wohnungen"],
    zeilen: [
      { text: "Zuzahlung vor Steuer, Jahr 1", werte: ["325 €", "650 €", "975 €"] },
      { text: "Dein Anteil nach Steuer, Jahr 1", werte: ["52 €", "124 €", "219 €"] },
      { text: "Dein Anteil nach Steuer, 50 bis 57", werte: ["bis 440 €", "bis 890 €", "bis 1.340 €"] },
      { text: "Überschuss ab 58, vor Steuer", werte: ["+1.260 €", "+2.530 €", "+3.790 €"] },
      { text: "Vermögen mit 65", werte: ["0,53 Mio. €", "1,06 Mio. €", "1,59 Mio. €"], summe: true },
    ] as ReadonlyArray<{ text: string; werte: string[]; summe?: true }>,
    schluss: "Mit der dritten Wohnung: [[3 × 529.900 €]]",
    schlussWert: "1,59 Mio. €",
    fuss: "Alle Wohnungen gleich und mit 25 gekauft, Steuer gemeinsam gerechnet; mit mehr Wohnungen sinkt die Ersparnis je Wohnung, weil der Steuersatz fällt. Monatswerte. Wert +2 % im Jahr (Annahme). Bis 57 zahlst du nach Steuer insgesamt rund 53.900 € (eine), 111.000 € (zwei) und 170.500 € (drei Wohnungen) zu.",
  },
  rente: {
    kicker: "07 · Nach der Abzahlung",
    titel: "Drei Wohnungen: deine vorzeitige Rente [[mit 58 Jahren.]]",
    lead: "Gerechnet mit drei Wohnungen wie im Beispiel. Mit 58 sind alle drei Kredite abgezahlt. Die Rate von 3 × 1.200 € entfällt, die Mieten der drei Wohnungen bleiben bei dir. Mit 60 hast du zwei Wege.",
    /*
     * Im Modell (Rechenprotokoll, rechnung3.py) sind alle drei Wohnungen mit
     * 25 gekauft. Ein gestaffelter Kauf ergäbe andere Zahlen, darum zeigt
     * der Zeitstrahl die drei Wohnungen nacheinander, aber alle mit 25.
     */
    zeitstrahl: [
      { alter: "25 J.", titel: "Heute", text: "Wohnung 1, 2 und 3", wohnungen: 3 },
      { alter: "58 J.", titel: "2059", text: "alle drei abbezahlt" },
      { alter: "60 J.", titel: "Renteneintritt", text: "zwei Wege" },
    ],
    wohnung: "Wohnung",
    zahlstZu: "du zahlst zu",
    wegeKopf: "Dein Renteneintritt mit 60: zwei Wege",
    wege: [
      { buchstabe: "A", titel: "Du verkaufst mit 60 alle drei Wohnungen.", wert: "≈ 1,44 Mio. €", text: "einmalige Auszahlung, schuldenfrei (3 × 480.000 €). Oder als Rente: rund 4.800 € im Monat über 25 Jahre, bis 85." },
      { buchstabe: "B", titel: "Du behältst die drei Wohnungen.", wert: "≈ 2.910 € im Monat", text: "Zusatzrente nach Steuer (3.880 € vor Steuer), und die drei Wohnungen bleiben dein Vermögen." },
    ],
    fuss: "Miete von 13 €/m² auf 19 €/m² im Jahr 2060, Kosten steigen mit. Rente vereinfacht mit 25 % Steuer auf Miete minus Kosten. Wert +2 % im Jahr (Annahme): 480.000 € je Wohnung mit 60, 529.900 € mit 65. Verkauf nach mehr als 10 Jahren steuerfrei. Rente aus dem Verkauf ohne Zinsen gerechnet. Instandhaltung nur pauschal mit den Kosten enthalten.",
    /*
     * Die frühere Folie 08 „Die nächsten Schritte mit uns“ entfällt seit dem
     * 20.10.2026: Das kommt in Abschnitt 11 „So geht es weiter“. Ihre
     * Grundlagen stehen jetzt unter Folie 07.
     */
    grundlagen: "Grundlagen: Musterrechnung mit gerundeten Werten. 80.000 € brutto im Jahr (6.667 € im Monat), Steuerklasse I, gesetzlich versichert (Zusatzbeitrag 2,9 %), kinderlos, ohne Kirchensteuer, kein Solidaritätszuschlag (Freigrenze nicht erreicht). Einkommensteuer-Grundtarif 2026 (§ 32a EStG), Beitragssätze und Beitragsbemessungsgrenzen 2026, Vorsorgepauschale 2026. Wohnung 240.000 €, 75 m², Gebäudeanteil 192.000 €, Miete 13 €/m² bis 19 €/m² im Jahr 2060, Kosten 100 € im Monat. Darlehen 240.000 €, 4,8 % Zins, 1,2 % Tilgung, Rate 1.200 €, monatlich gerechnet, Zins über die ganze Laufzeit gleich. AfA 4 % für 25 Jahre mit anerkanntem Restnutzungsdauer-Gutachten, sonst 2 %. Steuerwirkung bis 64 mit dem Tarif, ab 65 vereinfacht 25 %. Wert +2 % im Jahr. Stand 16.10.2026.",
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

/**
 * „Was, wenn …?“ in Abschnitt 09 (Kriterien), seit der Stresstest entfallen
 * ist. Nur Zahlen aus dem Rechenprotokoll; was dort nicht steht (Zins nach
 * der Zinsbindung, Leerstand), rechnet die Objektvorstellung mit den Zahlen
 * des Kunden.
 */
export const WAS_WENN = {
  kopf: "Ehrlich gerechnet: Was, wenn …?",
  karten: [
    { kopf: "… das Finanzamt das Gutachten nicht anerkennt?", wert: "+155 € statt +274 €", text: "Dann gilt die normale AfA von 2 %, und deine Zuzahlung nach Steuer steigt um diese 119 €." },
    { kopf: "… die erhöhte Abschreibung ausläuft?", wert: "bis 440 € im Monat", text: "Von 50 bis 57 zahlst du mehr zu. Ab 58 ist der Kredit weg, dann zahlt die Wohnung an dich." },
    { kopf: "… ein Mieter auszieht oder die Zinsen steigen?", wert: "Deine Reserve", text: "Leerstand und Reparaturen trägt deine Reserve. Den Zins nach der Zinsbindung rechnen wir in der Objektvorstellung mit deinen Zahlen." },
  ],
  fuss: "Werte aus der Musterrechnung (80.000 € brutto, Wohnung 240.000 €). Deine Zahlen rechnen wir in der Objektvorstellung.",
};
