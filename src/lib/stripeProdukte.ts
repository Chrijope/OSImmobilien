/**
 * Zentrale Ablage für Stripe-Produkte, die im CRM nur angezeigt werden.
 * Bewusst Konstanten und keine Einstellungsfelder: die Werte ändern sich
 * praktisch nie, und ein Feld liefe Gefahr, versehentlich geleert zu werden.
 *
 * Die monatliche Partnergebühr, die hier bis zum 06.09.2026 als Produkt lag,
 * ist entfallen: Neue Vertriebspartner zahlen kein laufendes Entgelt mehr.
 * Die Anzeigekarte (StripeProduktKarte) bleibt für künftige Produkte, etwa
 * ein Leadpaket, bestehen.
 */

export interface StripeProdukt {
  /** Anzeigename des Produkts, z. B. "Leadpaket". */
  name: string;
  /** Betrag als fertiger Anzeigetext, z. B. "2.500 € netto einmalig". */
  betragLabel: string;
  /** Abrechnungsart als Anzeigetext, z. B. "Abbuchung über Stripe". */
  abrechnungLabel: string;
  /**
   * Stripe-Zahlungslink (Payment Link, Format https://buy.stripe.com/...).
   * HIER EINTRAGEN, sobald Christian den Link in Stripe angelegt hat.
   * Solange der Link leer ist, zeigt die Anzeige einen Hinweis statt der Knöpfe.
   */
  zahlungslink: string;
}
