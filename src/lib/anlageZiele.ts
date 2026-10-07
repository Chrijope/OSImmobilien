/**
 * Die Anlageziele, aus denen der Kunde wählt.
 *
 * Eine einzige Liste für zwei Stellen: die Selbstauskunft und Abschnitt 04
 * der Beratungspräsentation. Vorher standen in beiden andere Ziele, mit dem
 * unangenehmen Ergebnis, dass der Kunde im Gespräch "Starker Steuereffekt"
 * wählte und zwanzig Minuten später in der Selbstauskunft eine Liste vor sich
 * hatte, in der dieser Punkt gar nicht vorkam. Jetzt ist es dieselbe Auswahl,
 * und das im Gespräch gewählte Ziel wandert beim Sprung in die Selbstauskunft
 * als eines der drei mit.
 *
 * Die Zuordnung zum Konzept steuert, welche Musterberechnung in Abschnitt 13
 * bis 15 vorbelegt ist. Sie ist eine Empfehlung, kein Automatismus: Umschalten
 * kann man im Gespräch jederzeit.
 */

export type AnlageKonzept = "bestand" | "wg" | "kfw";

export interface AnlageZiel {
  id: string;
  label: string;
  /** Kurzform für enge Stellen wie die Zuordnungstabelle in Abschnitt 12. */
  kurz: string;
  konzept: AnlageKonzept;
  /** Warum dieses Ziel zu diesem Konzept führt. Steht in Abschnitt 12. */
  begruendung: string;
}

export const ANLAGE_ZIELE: AnlageZiel[] = [
  {
    id: "vermoegen",
    label: "Vermögensaufbau und Werte schaffen",
    kurz: "Vermögensaufbau",
    konzept: "bestand",
    begruendung: "Etablierte Lage und hohe Tilgung, der ruhigste Weg zum Sachwert.",
  },
  {
    id: "steuer",
    label: "Steuervorteile sichern",
    kurz: "Steuervorteile",
    konzept: "bestand",
    begruendung: "Abschreibung und abzugsfähige Kosten wirken hier am unmittelbarsten.",
  },
  {
    id: "inflation",
    label: "Geldanlage und Inflationsschutz",
    kurz: "Inflationsschutz",
    konzept: "bestand",
    begruendung: "Bestehende Substanz in gefragter Lage, unabhängig von Bauzeiten.",
  },
  {
    id: "freiheit",
    label: "Finanzielle Freiheit durch passives Einkommen",
    kurz: "Passives Einkommen",
    konzept: "wg",
    begruendung: "Höhere Mieteinnahmen je Quadratmeter, dafür mehr Verwaltung.",
  },
  {
    id: "portfolio",
    label: "Eigenes Immobilien-Portfolio auf- und ausbauen",
    kurz: "Portfolioaufbau",
    konzept: "wg",
    begruendung: "Renditestärke schafft schneller Spielraum für das zweite Objekt.",
  },
  {
    id: "eigenheim",
    label: "Kapitalaufbau für das spätere Eigenheim",
    kurz: "Kapital fürs Eigenheim",
    konzept: "wg",
    begruendung: "Auf einen absehbaren Zeitraum zählt der Ertrag mehr als die Ruhe.",
  },
  {
    id: "rente",
    label: "Sorgenfrei im Alter durch eine Immobilienrente",
    kurz: "Immobilienrente",
    konzept: "kfw",
    begruendung: "Neubau bedeutet über Jahrzehnte wenig Sanierungsbedarf und planbare Kosten.",
  },
  {
    id: "kinder",
    label: "Sichere finanzielle Zukunft für die Kinder",
    kurz: "Zukunft der Kinder",
    konzept: "kfw",
    begruendung: "Langer Horizont, moderne Substanz, geringes Instandhaltungsrisiko.",
  },
  {
    id: "fremdkapital",
    label: "Fremdkapitalhebel mit wenig Eigenkapital",
    kurz: "Fremdkapitalhebel",
    konzept: "kfw",
    begruendung: "Förderdarlehen der KfW ergänzen die Bankfinanzierung.",
  },
];

/** Höchstzahl an Zielen, die ein Kunde in der Selbstauskunft wählen darf. */
export const MAX_ZIELE = 3;

export function zielNachId(id?: string | null): AnlageZiel | undefined {
  if (!id) return undefined;
  return ANLAGE_ZIELE.find((z) => z.id === id);
}

/** Sucht ein Ziel anhand seiner Beschriftung, etwa aus einem Auswahlfeld. */
export function zielNachLabel(label?: string | null): AnlageZiel | undefined {
  if (!label) return undefined;
  const gesucht = label.trim().toLowerCase();
  return ANLAGE_ZIELE.find((z) => z.label.toLowerCase() === gesucht);
}
