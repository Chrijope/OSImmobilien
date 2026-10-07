/**
 * Familienstand aus der Selbstauskunft auswerten.
 *
 * Die Selbstauskunft speichert die Auswahl so, wie sie im Formular steht,
 * also „Verheiratet“ und „Eingetragene Lebenspartnerschaft“ mit großem
 * Anfangsbuchstaben. Andere Quellen (Setter-Skript, Analyse) schreiben klein.
 * Ein exakter Vergleich mit einer der beiden Schreibweisen hat deshalb schon
 * einmal das Güterstand-Feld verschluckt. Hier wird darum immer ohne Rücksicht
 * auf Groß- und Kleinschreibung verglichen.
 */

function normalisiert(familienstand: unknown): string {
  return typeof familienstand === "string" ? familienstand.trim().toLowerCase() : "";
}

/**
 * Hat diese Person einen Güterstand?
 *
 * Ja bei Ehe und bei eingetragener Lebenspartnerschaft: Nach § 6 LPartG leben
 * Lebenspartner wie Ehegatten im Güterstand der Zugewinngemeinschaft, sofern
 * sie nichts anderes vereinbaren (Gütertrennung, Gütergemeinschaft). Für die
 * Bank und den Notar ist die Angabe also gleich wichtig.
 * „Verheiratet, getrennt lebend“ bleibt verheiratet und behält den Güterstand.
 * „Geschieden“, „verwitwet“ und „in Partnerschaft“ (ohne Eintragung) haben
 * keinen.
 */
export function hatGueterstand(familienstand: unknown): boolean {
  const f = normalisiert(familienstand);
  if (!f) return false;
  return f.startsWith("verheiratet") || f.includes("lebenspartnerschaft");
}
