/**
 * Wann ist etwas überfällig? Genau eine Antwort für das ganze Projekt.
 *
 * Vorher gab es zwei Rechnungen. Die Inbox verglich nur das Datum und nahm
 * eine Uhrzeit nur aus dem eigenen Feld. Das Dashboard las zusätzlich die
 * Uhrzeit aus einem vollen Zeitstempel. Ein Termin heute um neun war damit auf
 * der einen Seite überfällig und auf der anderen nicht, und niemand konnte
 * erklären, warum zwei Zahlen für dieselbe Liste herauskamen.
 *
 * Es gilt die Regel der Inbox, weil dort gearbeitet wird:
 *
 *   - Ohne lesbares Datum ist nichts überfällig.
 *   - Liegt das Datum vor heute, ist es überfällig.
 *   - Liegt es nach heute, ist es nicht überfällig.
 *   - Ist es heute, entscheidet die Uhrzeit. Ohne Uhrzeit hat man den ganzen
 *     Tag Zeit.
 */

/** Extrahiert JJJJ-MM-TT aus ISO, TT.MM.JJJJ oder einem reinen Datum. */
export function alsDatumsString(faellig?: string | null): string {
  if (!faellig) return "";
  const s = String(faellig).trim();

  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];

  const de = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (de) {
    const [, dd, mm, yyyy] = de;
    return `${yyyy}-${String(+mm).padStart(2, "0")}-${String(+dd).padStart(2, "0")}`;
  }
  return "";
}

/** Heutiges Datum als JJJJ-MM-TT, in der lokalen Zeitzone. */
export function heuteAlsString(jetzt: Date = new Date()): string {
  const y = jetzt.getFullYear();
  const m = String(jetzt.getMonth() + 1).padStart(2, "0");
  const d = String(jetzt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * @param faellig  Datum, ISO oder deutsch.
 * @param uhrzeit  Optionale Uhrzeit als HH:MM. Nur sie zählt, nicht die
 *                 Uhrzeit, die zufällig in einem Zeitstempel steckt.
 */
export function istUeberfaellig(
  faellig?: string | null,
  uhrzeit?: string | null,
  jetzt: Date = new Date(),
): boolean {
  const datum = alsDatumsString(faellig);
  if (!datum) return false;

  const heute = heuteAlsString(jetzt);
  if (datum < heute) return true;
  if (datum > heute) return false;

  const m = String(uhrzeit || "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return false;

  const faelligZeit = new Date(jetzt);
  faelligZeit.setHours(+m[1], +m[2], 0, 0);
  return jetzt.getTime() > faelligZeit.getTime();
}

/** True, wenn das Datum vom Vortag oder früher ist. */
export function istVomVortag(faellig?: string | null, jetzt: Date = new Date()): boolean {
  const datum = alsDatumsString(faellig);
  if (!datum) return false;
  return datum < heuteAlsString(jetzt);
}

/**
 * True, wenn das Datum nach heute liegt. Ohne lesbares Datum ist nichts in
 * der Zukunft, denn ein Eintrag ohne Termin ist sofort abzuarbeiten.
 */
export function liegtInZukunft(faellig?: string | null, jetzt: Date = new Date()): boolean {
  const datum = alsDatumsString(faellig);
  if (!datum) return false;
  return datum > heuteAlsString(jetzt);
}
