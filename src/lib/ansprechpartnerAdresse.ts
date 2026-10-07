/**
 * Welche Adresse ein Kunde vom Ansprechpartner zu sehen bekommt.
 *
 * Anmeldeadresse und Geschaeftsadresse sind zwei verschiedene Dinge. Angemeldet
 * wird oft mit einer privaten oder aelteren Adresse, gegenueber dem Kunden soll
 * aber die Adresse stehen, die in den Einstellungen unter Profil hinterlegt ist.
 * Beides lief bisher durcheinander: die Praesentation, die Landingpage und die
 * Mails zeigten teils die Anmeldeadresse.
 *
 * Ab jetzt gilt ueberall dieselbe Reihenfolge:
 *
 *   1. Einstellungen, Profil (profiles.email)
 *   2. Absenderadresse der Mailsignatur
 *   3. Anmeldeadresse, nur als letzte Rettung
 */

const CACHE_SCHLUESSEL = "mi_profile_email";

export interface AdressKandidaten {
  /** profiles.email, also die Adresse aus den Einstellungen. */
  einstellungen?: string | null;
  /** Absenderadresse aus der Mailsignatur. */
  signatur?: string | null;
  /** Adresse, mit der sich der Nutzer anmeldet. */
  anmeldung?: string | null;
}

function sauber(wert?: string | null): string {
  return (wert || "").trim();
}

/** Die erste belegte Adresse in der oben beschriebenen Reihenfolge. */
export function ansprechpartnerAdresse(kandidaten: AdressKandidaten): string {
  return (
    sauber(kandidaten.einstellungen) ||
    sauber(kandidaten.signatur) ||
    sauber(kandidaten.anmeldung) ||
    ""
  );
}

/**
 * Die Adresse des angemeldeten Nutzers ohne React-Kontext.
 *
 * Der UserContext legt profiles.email beim Laden des Profils in den
 * Browserspeicher, damit Stellen wie ladeBerater() sie synchron lesen koennen.
 */
export function eigeneAdresseAusCache(): string {
  try {
    return sauber(localStorage.getItem(CACHE_SCHLUESSEL));
  } catch {
    return "";
  }
}
