/**
 * Einmalige Übernahme der Browser-Speicherschlüssel aus der Zeit vor der
 * Umbenennung (Präfix "moreimmo" → "osimmobilien").
 *
 * Läuft beim Import, deshalb steht der Import in `main.tsx` ganz oben: Die
 * Sprache (`i18n`) liest ihren Schlüssel schon beim Laden des Moduls. Die
 * Namen stehen hier ausgeschrieben statt importiert, damit kein anderes Modul
 * vor dem Umzug ausgewertet wird.
 *
 * Ein vorhandener neuer Wert gewinnt; der alte Schlüssel wird in jedem Fall
 * entfernt.
 */
export const SCHLUESSEL_UMZUG: ReadonlyArray<readonly [alt: string, neu: string]> = [
  ["moreimmo.design", "osimmobilien.design"],
  ["moreimmo.kampagne.v2", "osimmobilien.kampagne.v2"],
  ["moreimmo.cookie-einwilligung", "osimmobilien.cookie-einwilligung"],
  ["moreimmo-seiten-sprache", "osimmobilien-seiten-sprache"],
  ["moreimmo-crm-lang", "osimmobilien-crm-lang"],
  ["moreimmo-portal-profilsprache-anmeldung", "osimmobilien-portal-profilsprache-anmeldung"],
];

export function zieheSchluesselUm(speicher: Storage): void {
  for (const [alt, neu] of SCHLUESSEL_UMZUG) {
    try {
      const wert = speicher.getItem(alt);
      if (wert === null) continue;
      if (speicher.getItem(neu) === null) speicher.setItem(neu, wert);
      speicher.removeItem(alt);
    } catch {
      // Gesperrter Speicher (privates Fenster): dann gibt es auch nichts umzuziehen.
    }
  }
}

if (typeof window !== "undefined") {
  try {
    zieheSchluesselUm(window.localStorage);
    zieheSchluesselUm(window.sessionStorage);
  } catch {
    // Zugriff auf window.localStorage selbst kann werfen.
  }
}
