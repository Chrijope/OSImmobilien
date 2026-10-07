/**
 * Die Maße für Eingabefelder. Es gibt genau zwei, mehr sollen nicht entstehen.
 *
 * "standard" ist die Größe, die überall gilt. Sie ist keine Erfindung, sondern
 * das, was die Grundfassung von Input, Textarea und SelectTrigger schon immer
 * hatte und was im Projekt am häufigsten vorkommt: 44 Pixel hoch, runde Ecken
 * im Projektradius. Sie steht auf gleicher Höhe wie ein Knopf mit size="lg".
 *
 * "kompakt" ist die einzige erlaubte kleinere Ausführung. Sie ist für Felder
 * gedacht, die in einer Filterleiste über einer Tabelle oder in einer
 * Tabellenzeile stehen, wo 44 Pixel die Zeile auseinanderziehen würden. Ihre
 * Höhe von 36 Pixeln ist ebenfalls nicht neu: Sie ist die Höhe von
 * Button size="sm", dem mit Abstand meistgenutzten Knopf im Projekt. Damit
 * steht ein Suchfeld neben seinem Knopf nicht mehr versetzt.
 *
 * Nirgends sonst darf eine Höhe oder Schriftgröße an ein Feld geschrieben
 * werden. Wer ein kleineres Feld braucht, nimmt feldgroesse="kompakt".
 */
export type Feldgroesse = "standard" | "kompakt";

/** Für Input, SelectTrigger und alles, was eine feste Zeilenhöhe hat. */
export const FELD_GROESSE: Record<Feldgroesse, string> = {
  standard: "h-11 rounded-xl px-3.5 py-2 text-base md:text-sm",
  kompakt: "h-9 rounded-lg px-3 py-1.5 text-sm",
};

/** Für Textarea, die keine feste Höhe hat, sondern eine Mindesthöhe. */
export const TEXTFELD_GROESSE: Record<Feldgroesse, string> = {
  standard: "min-h-[88px] rounded-xl px-3.5 py-2.5 text-sm",
  kompakt: "min-h-[64px] rounded-lg px-3 py-2 text-sm",
};

/**
 * Der Rahmen samt Fokuszustand für native Felder, also für ein <select>,
 * <input> oder <textarea>, das nicht über die Komponenten läuft. Zusammen mit
 * FELD_GROESSE ergibt das genau das Aussehen der Komponenten. Damit muss kein
 * natives Feld umgebaut werden, nur damit es gleich aussieht.
 */
export const NATIVES_FELD =
  "flex w-full border border-input bg-card ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-shadow";

/** Beschriftung über dem Feld. */
export const FELD_BESCHRIFTUNG = "text-xs font-medium";

/** Abstand zwischen Beschriftung und Feld, als Klasse für die Hülle. */
export const FELD_BLOCK = "space-y-1.5";

/** Erklärender Hinweis unter dem Feld. */
export const FELD_HINWEIS = "text-xs text-muted-foreground";

/** Fehlermeldung unter dem Feld. */
export const FELD_FEHLER = "text-xs text-destructive";

/** Das Sternchen hinter der Beschriftung eines Pflichtfeldes. */
export const FELD_PFLICHT = "text-destructive";
