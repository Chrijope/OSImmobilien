/**
 * Hat der Versand einer Unterschriftsanfrage wirklich geklappt?
 *
 * Die Auswertung lag bis zum 16.09.2026 in
 * `src/components/reservierung/ReservierungsForm.tsx`. Sie wird inzwischen
 * auch beim erneuten Zusenden aus dem Kundenprofil gebraucht, und dafür das
 * ganze Reservierungsformular samt PDF-Erzeugung mitzuladen wäre zu viel.
 * Deshalb steht sie hier. Das Formular gibt sie unverändert weiter, damit
 * bestehende Aufrufe und Tests bleiben, wo sie sind.
 */

/**
 * Was der Versand der Unterschriftsanfrage zurückgemeldet hat.
 *
 * „teilweise“ heißt: mindestens einer hat die Mail bekommen, mindestens einer
 * nicht. Ein zweiter Versuch würde dem ersten einen zweiten Link schicken,
 * deshalb gilt der Vorgang als versendet, aber ausdrücklich nicht als sauber.
 */
export type VersandErgebnis =
  | { art: "ok" }
  | { art: "teilweise"; text: string }
  | { art: "fehler"; text: string };

/**
 * Ist der Versand wirklich gelungen?
 *
 * Ein Fehlschlag kommt auf drei Wegen zurück, und nur wer alle drei prüft,
 * meldet nicht Erfolg, obwohl der Kunde nie eine Mail bekommen hat:
 *
 * 1. `supabase.functions.invoke` wirft eine Ausnahme (Netz, Zeitüberschreitung).
 * 2. `invoke` gibt `{ data, error }` zurück und `error` ist gesetzt, etwa bei
 *    Status 400 oder 500 oder wenn das Stundenlimit greift.
 * 3. Die Funktion antwortet mit Status 200 und `success: true`, schreibt aber
 *    in `results`, dass eine Adresse nichts bekommen hat. Genau so verhält sie
 *    sich bei einer gesperrten Empfängeradresse. Für `invoke` ist das Erfolg.
 *
 * Fall 1 fängt der Aufrufer ab und reicht die Ausnahme als `error` herein.
 */
export function versandErgebnisLesen(data: any, error: unknown): VersandErgebnis {
  if (error) {
    const text = (error as Error)?.message?.trim();
    return { art: "fehler", text: text || "Der Versand ist fehlgeschlagen." };
  }
  if (data?.error) {
    return { art: "fehler", text: String(data.error) };
  }
  const ergebnisse: any[] = Array.isArray(data?.results) ? data.results : [];
  if (ergebnisse.length === 0) {
    return { art: "fehler", text: "Die Funktion hat keinen einzigen Empfänger bestätigt." };
  }
  const offen = ergebnisse.filter(r => !r?.sent);
  if (offen.length === 0) return { art: "ok" };

  const namen = offen.map(r => String(r?.email || r?.personType || "unbekannt")).join(", ");
  const gruende = Array.from(new Set(offen.map(r => String(r?.grund || "")).filter(Boolean)));
  const zusatz = gruende.length > 0 ? ` Grund: ${gruende.join(", ")}.` : "";
  if (offen.length === ergebnisse.length) {
    return { art: "fehler", text: `An ${namen} konnte keine Mail versendet werden.${zusatz}` };
  }
  return { art: "teilweise", text: `An ${namen} konnte keine Mail versendet werden.${zusatz}` };
}
