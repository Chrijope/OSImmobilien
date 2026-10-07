/**
 * Beschäftigungsarten der Bewerbung.
 *
 * Die Liste steht bewusst hier und nicht in einer Seite, weil sie an zwei
 * Stellen gebraucht wird: im öffentlichen Bewerbungsformular und im
 * Erstgesprächsskript (Punkt 2, Deine Ausgangslage). Die `id` landet in
 * `bewerber.beschaeftigungsart`, deshalb dürfen die Werte nicht wandern.
 *
 * Am 27.08.2026 entfielen zwei Optionen: "Angestellt mit Fixum + Provision",
 * weil das Modell nicht angeboten wird, und "Freier Handelsvertreter
 * (§ 84 HGB)", weil jede Zusammenarbeit ohnehin als freier Handelsvertreter
 * läuft und die Frage nur neben- oder hauptberuflich meint. Alte Bewerbungen
 * mit diesen Werten zeigen das Feld leer, es wird im Gespräch neu gesetzt.
 */
export const BESCHAEFTIGUNGSARTEN = [
  { id: "nebenberuflich", label: "Nebenberuflich", beschreibung: "Neben Deinem aktuellen Job eine zweite Einkommensquelle aufbauen." },
  { id: "hauptberuflich", label: "Hauptberuflich", beschreibung: "Voll auf die Arbeit mit MOREImmo konzentrieren." },
];
