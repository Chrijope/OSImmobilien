/**
 * Wohin die Erinnerung „Deine Unterlagen fehlen noch" führt.
 *
 * Vorher zeigte sie auf /kunde/profil. Dort stand eine eigene, kürzere
 * Unterlagenliste, und bei mehreren Käufen musste der Kunde selbst suchen,
 * welcher gemeint ist. Jetzt führt sie direkt zur Bonität genau des
 * Investments, zu dem die Erinnerung gehört, und hebt den Abschnitt hervor,
 * wie der Knopf „Jetzt fortfahren" im Portal (useAbschnittHervorheben,
 * Sprungziel `section-bonitaetsunterlagen`). Entscheidung Christian,
 * 25.09.2026.
 *
 * Liegt hier und nicht in der Function selbst, weil Vitest nur unterhalb von
 * `src` sucht. Getestet wird in src/lib/unterlagenErinnerungLink.test.ts.
 */

export const PORTAL_BASIS_URL = 'https://osimmobilien.netlify.app'

/** Der Abschnitt auf /kunde/investments, gleicher Schlüssel wie in portalNaechsteSchritte.ts. */
export const BONITAET_ABSCHNITT = 'bonitaetsunterlagen'

/** Pfad innerhalb des Portals, etwa für die Benachrichtigung in der Glocke. */
export function bonitaetPfadFuerInvestment(investmentId: string): string {
  const params = new URLSearchParams({ tab: 'moreimmo', inv: investmentId, highlight: BONITAET_ABSCHNITT })
  return `/kunde/investments?${params.toString()}`
}

/** Vollständige Adresse für die Mail. */
export function bonitaetUrlFuerInvestment(investmentId: string, basis: string = PORTAL_BASIS_URL): string {
  return `${basis.replace(/\/+$/, '')}${bonitaetPfadFuerInvestment(investmentId)}`
}
