/**
 * Die Formel fuer den Finanzierungsrahmen, genau einmal im Projekt.
 *
 * Sie stand bisher nur in `src/lib/finanzierbarkeitUtils.ts`. Seit dem
 * 26.09.2026 braucht sie auch der Server: `submit-lead` rechnet beim
 * Handbuch-Konfigurator den Ausgang und den Rahmen selbst nach, statt der
 * Zahl aus dem Browser zu glauben. Damit Browser, Server und Kundenprofil nie
 * auseinanderlaufen, liegt die Formel jetzt hier, und
 * `finanzierbarkeitUtils.ts` reicht sie unveraendert weiter.
 *
 * Reine Datei ohne Importe, damit Vitest und Deno sie lesen koennen.
 */

/**
 * Sicherheitspuffer auf den monatlichen Überschuss. Es wird bewusst nicht der
 * ganze Überschuss verplant, damit ein schlechtes Jahr nicht sofort weh tut.
 */
export const RAHMEN_PUFFER = 0.8;

/** Angenommene Annuität aus Zins und Tilgung zusammen. */
export const RAHMEN_ANNUITAET = 0.06;

/**
 * Aus einem monatlichen Überschuss und dem Eigenkapital wird ein
 * Finanzierungsrahmen.
 *
 * Steht hier, damit die Beratungspräsentation, die Karte im Kundenprofil und
 * das Handbuch garantiert dieselbe Zahl zeigen. Vorher lag dieselbe Formel an
 * fünf Stellen im Code, an zwei davon sogar mit vier statt sechs Prozent
 * Annuität. Wenn im Gespräch eine andere Zahl steht als später im Profil, ist
 * das Gespräch beschädigt.
 */
export function rahmenAusUeberschuss(ueberschuss: number, eigenkapital = 0) {
  const tragbareRate = ueberschuss * RAHMEN_PUFFER;
  const maxDarlehen = Math.round((tragbareRate * 12) / RAHMEN_ANNUITAET);
  return {
    ueberschuss,
    tragbareRate: Math.round(tragbareRate),
    maxDarlehen,
    eigenkapital,
    empfRahmen: Math.round(maxDarlehen + eigenkapital),
  };
}

/**
 * Die Spanne um den empfohlenen Rahmen: 80 bis 120 Prozent des tragbaren
 * Darlehens, jeweils plus Eigenkapital. Dieselbe Spanne zeigt das
 * Kundenprofil bei der Objektauswahl.
 */
export function rahmenSpanne(maxDarlehen: number, eigenkapital: number): { von: number; bis: number } {
  return {
    von: Math.round(maxDarlehen * 0.8 + eigenkapital),
    bis: Math.round(maxDarlehen * 1.2 + eigenkapital),
  };
}
