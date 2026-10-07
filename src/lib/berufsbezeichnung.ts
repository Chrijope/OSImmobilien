/**
 * Die Berufsbezeichnung eines Ansprechpartners, an genau einer Stelle.
 *
 * Warum es diese Datei gibt: Im CRM stand ueberall dort, wo einem Kunden,
 * Bewerber oder Gast ein Ansprechpartner gezeigt wird, die technische
 * Nutzerrolle. Im Warteraum des Videoraums las ein Kunde unter "Christian
 * Peetz" das Wort "Admin". "Admin" ist aber eine Berechtigung im System und
 * kein Beruf. Nach aussen tritt dieselbe Person als Immobilienberater auf.
 *
 * Die Zuordnung Rolle zu Berufsbezeichnung steht deshalb nur hier. Waere sie
 * an mehreren Stellen entstanden, liefen die Bezeichnungen frueher oder
 * spaeter auseinander, und niemand faende die Stelle, die noch das alte Wort
 * benutzt.
 *
 * ZWEITE FASSUNG: `supabase/functions/_shared/berufsbezeichnung.ts`. Die Edge
 * Functions laufen in Deno und koennen `src` nicht erreichen. Beide Fassungen
 * werden von `src/lib/berufsbezeichnung.test.ts` ueber alle Rollen und
 * Kombinationen gegeneinander gerechnet.
 */

/** Was ein Kunde ueber jeden lesen soll, der ihn betreut. */
export const BERUF_IMMOBILIENBERATER = "Immobilienberater";

/**
 * Die Bezeichnung fuer die Personalrolle.
 *
 * NOCH NICHT BESTAETIGT: Bisher stand hier "Human Resources Managerin", der
 * einzige englische Begriff in einer sonst deutschen Oberflaeche. Vorlaeufig
 * eingesetzt ist "Personalleiterin", weil das eine Berufsbezeichnung ist und
 * auf derselben Stufe steht wie "Immobilienberater". Christian waegt noch
 * gegen "Personalverantwortliche" ab. Die Entscheidung kostet genau diese
 * eine Zeile.
 */
export const BERUF_HR = "Personalleiterin";

/**
 * Rolle zu Berufsbezeichnung.
 *
 * Wer hier fehlt, bekommt bewusst keine Bezeichnung. Siehe `berufsbezeichnung`.
 */
export const BERUFSBEZEICHNUNG_JE_ROLLE: Readonly<Record<string, string>> = {
  inhaber: BERUF_IMMOBILIENBERATER,
  admin: BERUF_IMMOBILIENBERATER,
  vertriebsleiter: BERUF_IMMOBILIENBERATER,
  vertriebspartner: BERUF_IMMOBILIENBERATER,
  hr: BERUF_HR,
};

/**
 * Welche Rolle entscheidet, wenn jemand mehrere traegt.
 *
 * Die Vertriebsrolle sticht die Verwaltungsrolle, und beide stechen die
 * Personalrolle. Christian ist Inhaber, Admin und Vertriebspartner zugleich
 * und tritt nach aussen als Berater auf. Wer dagegen nur die Personalrolle
 * traegt, behaelt seine eigene Bezeichnung.
 */
const VORRANG = ["vertriebspartner", "vertriebsleiter", "inhaber", "admin", "hr"];

/**
 * Alle bekannten Rollenkennungen und ihre Anzeigenamen, klein geschrieben.
 *
 * Gebraucht wird die Liste, um eine gespeicherte Bezeichnung zu erkennen, die
 * in Wahrheit nur eine Rolle ist. Das Positionsfeld in den Einstellungen wurde
 * jahrelang maschinell mit dem Rollennamen gefuellt, in den gespeicherten
 * Daten steht dort also weiterhin "Admin" oder "Vertriebspartner". So ein Wert
 * darf nicht als eigene Angabe durchgehen.
 *
 * Die Liste steht absichtlich als Text hier und nicht als Import aus
 * `src/types/user.ts`: Die Deno-Fassung kann `src` nicht lesen, und beide
 * Fassungen muessen Zeichen fuer Zeichen dasselbe kennen. Dass die Liste
 * vollstaendig ist, prueft der Test gegen `ROLES`.
 */
const ROLLENKENNUNGEN = new Set(
  [
    "inhaber",
    "admin",
    "vertriebsleiter",
    "vertriebspartner",
    "objektpartner",
    "finanzierungspartner",
    "hausverwaltung",
    "buchhaltung",
    "backoffice",
    "hr",
    "setterin",
    "setter",
    "versicherungsexperte",
    "kunde",
    "tippgeber",
    "individuell",
    "marketing",
    "bewerber",
    "testaccount",
    // Anzeige-Variante der Vertriebspartner, siehe rollenLabel.ts.
    "lead-berater",
    // Der alte englische Wortlaut. Steht noch in gespeicherten Einstellungen
    // und soll dort nicht als eigene Angabe ueberleben.
    "human resources managerin",
  ].map((wert) => wert.toLowerCase()),
);

function sauber(wert: unknown): string {
  return typeof wert === "string" ? wert.trim() : "";
}

/** Ist dieser Text in Wahrheit nur eine Rollenkennung? */
export function istRollenkennung(text: unknown): boolean {
  const wert = sauber(text).toLowerCase();
  return wert ? ROLLENKENNUNGEN.has(wert) : false;
}

/**
 * Die Berufsbezeichnung zu einer Rolle oder einer Liste von Rollen.
 *
 * `eigeneBezeichnung` ist das Positionsfeld aus den Einstellungen. Eine dort
 * wirklich selbst gepflegte Angabe ist genauer als jede Zuordnung und gewinnt
 * deshalb. Eine Angabe, die nur eine Rollenkennung wiederholt, gewinnt nicht:
 * genau sie ist das Problem, das hier behoben wird.
 *
 * Wer weder eine Vertriebs- noch die Personalrolle traegt, also etwa
 * Backoffice oder Buchhaltung, bekommt eine leere Bezeichnung. Ein erfundener
 * Titel waere geraten, und eine Rollenkennung darf dort gerade nicht stehen.
 * Die Vorlagen und Ansichten kommen ohne die Zeile aus, sie zeigen dann nur
 * Name, Telefon und Adresse. Wer doch eine Bezeichnung braucht, traegt sie in
 * `BERUFSBEZEICHNUNG_JE_ROLLE` ein, das ist eine Zeile.
 */
export function berufsbezeichnung(
  rollen: string | string[] | null | undefined,
  eigeneBezeichnung?: string | null,
): string {
  const eigene = sauber(eigeneBezeichnung);
  if (eigene && !istRollenkennung(eigene)) return eigene;

  const liste = (Array.isArray(rollen) ? rollen : [rollen])
    .map((rolle) => sauber(rolle).toLowerCase())
    .filter(Boolean);

  for (const rolle of VORRANG) {
    if (liste.includes(rolle)) return BERUFSBEZEICHNUNG_JE_ROLLE[rolle];
  }
  return "";
}

/**
 * Nur eine wirklich eigene Bezeichnung, sonst nichts.
 *
 * Fuer Anzeigestellen, die eine fertig gespeicherte Bezeichnung vor sich
 * haben und die Rolle dazu nicht kennen, etwa der Abzug des Gastgebers an
 * einem Videoraum. Steht dort nur eine Rollenkennung, bleibt die Zeile leer,
 * statt dem Gast "Admin" zu zeigen.
 */
export function nurEchteBezeichnung(text: unknown): string {
  return berufsbezeichnung(null, typeof text === "string" ? text : "");
}
