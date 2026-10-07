/**
 * Eine deutsch geschriebene Zahl aus einem Eingabefeld lesen.
 *
 * Die Formulare zeigen Beträge mit Tausenderpunkten und Komma als
 * Dezimaltrennzeichen, also „189.000“ oder „1.250.000,50“. Gespeichert wird
 * genau dieser Text. Wer ihn mit `Number` liest, bekommt etwas anderes
 * zurück, als dort steht: `Number("189.000")` ist 189, weil der Punkt als
 * Dezimaltrennzeichen gilt, und `Number("1.250.000")` ist gar keine Zahl.
 *
 * Genau daran hing der Kaufpreis im gedruckten Reservierungs-PDF: Aus
 * 189.000 Euro wurden im unterschriebenen Dokument 189 Euro, bei
 * siebenstelligen Preisen stand dort „NaN €“. Der Wert im CRM war richtig,
 * nur das Papier war falsch.
 *
 * Deshalb steht die Umwandlung an einer Stelle und nicht als Sonderfall in
 * jedem Formular.
 */

/**
 * Wandelt einen Eingabetext in eine Zahl.
 *
 * Die Regel, in dieser Reihenfolge:
 *
 *   1. Ein Komma ist immer das Dezimaltrennzeichen. Punkte davor trennen
 *      Tausender. „189.000,50“ ist 189000,5.
 *   2. Ohne Komma sind Punkte Tausendertrennzeichen, sobald sie sauber in
 *      Dreiergruppen stehen. „1.250.000“ ist 1250000.
 *   3. Ein einzelner Punkt mit ein oder zwei Stellen dahinter bleibt ein
 *      Dezimalpunkt. „3.94“ bleibt 3,94, sonst würde aus einer Rendite eine
 *      dreistellige Zahl.
 *
 * Nichts Lesbares ergibt 0, nie NaN. Eine Zahl geht unverändert durch, damit
 * die Aufrufstellen nicht vorher prüfen müssen, was sie in der Hand haben.
 */
export function zahlAusText(wert: unknown): number {
  if (typeof wert === "number") return Number.isFinite(wert) ? wert : 0;
  if (wert == null) return 0;

  // Währungszeichen, Leerzeichen und alles andere Beiwerk entfernen. Übrig
  // bleiben Ziffern, Trennzeichen und ein mögliches Minus.
  const roh = String(wert).replace(/[^\d.,-]/g, "").trim();
  if (!roh) return 0;

  const negativ = roh.startsWith("-");
  const ohneVorzeichen = roh.replace(/-/g, "");
  if (!ohneVorzeichen) return 0;

  let normiert: string;
  if (ohneVorzeichen.includes(",")) {
    // Komma entscheidet: Punkte sind Tausender, das letzte Komma ist der Punkt.
    const teile = ohneVorzeichen.split(",");
    const nachkomma = teile.pop() || "";
    normiert = `${teile.join("").replace(/\./g, "")}.${nachkomma}`;
  } else if (/^\d{1,3}(\.\d{3})+$/.test(ohneVorzeichen)) {
    // Saubere Dreiergruppen: reine Tausendertrennung.
    normiert = ohneVorzeichen.replace(/\./g, "");
  } else if ((ohneVorzeichen.match(/\./g) || []).length > 1) {
    // Mehrere Punkte können nichts anderes sein als Tausendertrennung.
    normiert = ohneVorzeichen.replace(/\./g, "");
  } else {
    // Ein einzelner Punkt bleibt ein Dezimalpunkt.
    normiert = ohneVorzeichen;
  }

  const zahl = Number.parseFloat(normiert);
  if (!Number.isFinite(zahl)) return 0;
  return negativ ? -zahl : zahl;
}

/**
 * Der Rückweg: eine Zahl so schreiben, wie die Formulare sie zeigen.
 *
 * Gebraucht wird er überall dort, wo ein gespeicherter Betrag in ein
 * Eingabefeld zurückwandert. Bisher stand dort `String(zahl)`, und das ist
 * für ganze Beträge richtig, für krumme aber falsch: Aus 650000.5 wird
 * "650000.5", und die anschließende Tausenderformatierung liest den Punkt als
 * Trennzeichen und macht daraus 6.500.005, also das Zehnfache. Derselbe
 * Fehlertyp wie beim Lesen, nur in die andere Richtung.
 *
 * Null ergibt einen leeren Text und nicht "0". Eine getippte Null gilt in den
 * Formularen als ausgefüllt und schaltet damit jede weitere Quelle ab.
 */
export function textAusZahl(wert: unknown): string {
  const zahl = zahlAusText(wert);
  if (!zahl) return "";
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(zahl);
}
