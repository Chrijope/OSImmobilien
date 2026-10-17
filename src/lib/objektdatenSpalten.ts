/*
 * Anzeigenamen und Erklärungen der Spalten in der Einheitenliste (17.10.2026).
 * Der Schlüssel ist der interne Spaltenname, an dem Sortierung und Export
 * hängen; `name` ist, was in Tabelle, Excel und PDF oben steht, `info` der
 * Text im Info-Kreis. Spalten ohne Eintrag sind selbsterklärend.
 */

export const SPALTEN: Record<string, { name?: string; info?: string }> = {
  "Fläche m²": { name: "Wohnfläche m²", info: "Wohnfläche der Einheit." },
  MEA: { info: "Miteigentumsanteil laut Teilungserklärung. Verteilt Hausgeld, Wirtschaftsplan und Einmalbeträge." },
  "VK €/m²": { name: "Kaufpreis €/m²", info: "Kaufpreis durch Wohnfläche." },
  "Miete Vertrieb": { name: "Kaltmiete Exposé", info: "Miete, mit der der Vertrieb rechnet. Bei Mietsubvention die Zielmiete, sonst die Ist-Kaltmiete." },
  "Brutto Ist": { name: "Rendite brutto Ist", info: "Ist-Kaltmiete × 12 ÷ Kaufpreis." },
  Brutto: { name: "Rendite brutto Exposé", info: "Kaltmiete Exposé × 12 ÷ Kaufpreis." },
  Netto: { name: "Rendite netto", info: "(Kaltmiete Exposé − nicht umlagefähiges Hausgeld − Rücklage) × 12 ÷ (Kaufpreis × (1 + Kaufnebenkosten))." },
  Mietsubvention: { info: "Mietsubvention laut Excel-Liste." },
  "Ist-Kaltmiete": { info: "Kaltmiete, die der Mieter heute zahlt." },
  "Ist €/m²": { name: "Ist-Miete €/m²", info: "Ist-Kaltmiete ÷ Wohnfläche." },
  Sollmiete: { info: "Miete, die die Wohnung erzielen soll, laut Liste." },
  "Soll €/m²": { name: "Sollmiete €/m²", info: "Sollmiete ÷ Wohnfläche." },
  "Letzte Erhöhung": { info: "Datum, ab dem die letzte Mieterhöhung galt. Startet die 15-Monats-Sperre." },
  "Miete vorher": { name: "Miete vor letzter Erhöhung", info: "Kaltmiete vor der letzten Erhöhung. Basis der Kappungsgrenze über drei Jahre." },
  "Erhöhung ab": { name: "Nächste Erhöhung ab", info: "Frühester Termin laut Mieterhöhungsplaner: 15 Monate nach der letzten Erhöhung, wirksam ab dem 3. Monat nach Zugang des Schreibens." },
  "neue Miete": { name: "Miete nach Erhöhung", info: "Höchstmögliche Kaltmiete zum Termin: die kleinere Zahl aus Vergleichsmiete und Kappungsgrenze." },
  "+ mtl.": { name: "Erhöhung mtl.", info: "Miete nach Erhöhung − Ist-Kaltmiete." },
  Grenze: { name: "Begrenzt durch", info: "Was die Erhöhung deckelt: Kappungsgrenze (20 %, in Berlin 15 % in drei Jahren) oder ortsübliche Vergleichsmiete." },
  "Nächste ab": { name: "Erhöhung laut Liste ab", info: "Termin der nächsten Erhöhung laut Excel-Liste, zum Abgleich mit dem Planer." },
  "Miete danach": { name: "Miete laut Liste", info: "Miete nach der nächsten Erhöhung laut Excel-Liste." },
  "in 3 Jahren": { name: "Miete in 3 Jahren", info: "Erreichbare Miete in drei Jahren laut Liste, mit Kappungsgrenze." },
  Zielmiete: { info: "Zielmiete €/m² laut Regel × Wohnfläche. Bis dahin gleichen wir die Miete aus." },
  "Garantie mtl.": { name: "Subvention mtl.", info: "Zielmiete − Ist-Kaltmiete − angerechnete Garagenmiete, je Monat." },
  "Garantie Laufzeit": { name: "Subvention Laufzeit", info: "Subvention mtl. × Laufzeit, dazu Garagen-Subvention × ihre Laufzeit (meist 12 Monate). Ohne Mieterhöhungen." },
  "Garagen-Subv. mtl.": { name: "Garagen-Subvention mtl.", info: "Angerechnete Garagenmiete laut Regel (z. B. 100 €) − gezahlte Garagenmiete, je Monat." },
  Einmalanteil: { name: "Anteil Einmalzahlung", info: "Anteil dieser Einheit am Einmalbetrag, verteilt nach Kaufpreis." },
  "laut Liste": { name: "Subvention laut Liste", info: "Subvention über die Laufzeit laut Excel-Liste, mit Mieterhöhungen. Zum Abgleich mit „Subvention Laufzeit“." },
  "Hausgeld gesamt": { name: "Hausgeld mtl.", info: "Hausgeld je Monat, das der Eigentümer an die WEG zahlt." },
  umlagefähig: { name: "davon umlagefähig", info: "Teil des Hausgelds, der über die Nebenkosten an den Mieter geht." },
  "nicht umlagefähig": { name: "davon nicht umlagefähig", info: "Teil des Hausgelds, den der Eigentümer selbst trägt, etwa Verwaltung und Instandhaltung." },
  Rücklage: { name: "Erhaltungsrücklage", info: "Zuführung zur Erhaltungsrücklage je Monat." },
  Eigentümerlast: { name: "Kosten Eigentümer mtl.", info: "Nicht umlagefähiges Hausgeld + Rücklage." },
  "Überschuss mtl.": { name: "Überschuss vor Finanzierung", info: "Kaltmiete Exposé − Kosten Eigentümer, je Monat, ohne Zins und Tilgung." },
  "laut Plan": { name: "Hausgeld laut Wirtschaftsplan", info: "Hausgeld aus dem Wirtschaftsplan, verteilt über den MEA der Einheit. Zum Abgleich mit „Hausgeld mtl.“." },
  "Garage/SP": { name: "Garage / Stellplatz", info: "Nummer und Art, dazu frei oder vermietet." },
  "KP Garage": { name: "Kaufpreis Garage", info: "Kaufpreis der Garage oder des Stellplatzes." },
  "Ist-Miete Garage": { info: "Was der Garagennutzer heute zahlt." },
  "Sollmiete Garage": { info: "Garagenmiete, die erzielt werden soll, laut Liste." },
  "gekündigt zum": { info: "Ende des Garagenmietvertrags, falls gekündigt." },
  Stufe: { name: "Abwicklungsstufe", info: "Stand im Verkauf. Kaufpreis eingegangen → Abrechnung, dazu Grundbuch eingetragen → Abgeschlossen." },
  Fälligkeit: { name: "Kaufpreis fällig", info: "Fälligkeit des Kaufpreises laut Notar." },
  "Kaufpreis da": { name: "Kaufpreis eingegangen", info: "Setzt das Backoffice, sobald der Kaufpreis auf dem Konto ist." },
  "Grundbuch am": { name: "Eingetragen am", info: "Datum der Eigentumsumschreibung im Grundbuch." },
  "Grundbuch erfolgt": { name: "Grundbuch eingetragen", info: "Haken, sobald der Käufer im Grundbuch steht." },
  Übergabe: { info: "Übergabe an den Käufer. Ab hier trägt er Miete und Kosten, wir zahlen die Subvention." },
  "Mehrertrag mtl.": { name: "Mehrertrag möglich mtl.", info: "Was sich je Monat mehr erzielen ließe: Miete bis zum Soll, Leerstand vermieten, nächste Mieterhöhung." },
  Hinweise: { info: "Was an der Einheit zu tun ist. Sortiert nach Anzahl der Hinweise." },
};

export const spaltenName = (schluessel: string): string => SPALTEN[schluessel]?.name ?? schluessel;
