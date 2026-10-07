/**
 * Fremde Terminkalender in unseren eigenen Seiten.
 *
 * Beide Terminseiten, die des Vertriebspartners unter `/terminwahl/:token` und
 * die des Bewerbers unter `/kennenlerngespraech/:token`, zeigen den Kalender
 * einer anderen Person in einem eingebetteten Rahmen. Die drei Fragen sind
 * jedes Mal dieselben: Ist die Adresse überhaupt eine Adresse, lässt sich der
 * Dienst einbetten, und wie sieht die Adresse für den Rahmen aus.
 *
 * Hinweis: `src/pages/PartnerTermin.tsx` trägt bis auf Weiteres eine eigene,
 * gleichlautende Kopie dieser drei Helfer. An der Datei wird parallel
 * gearbeitet, sie durfte am 21.09.2026 nicht angefasst werden. Sobald sie frei
 * ist, sollte sie hierher wechseln, damit es nur eine Wahrheit gibt.
 */

/**
 * Kalenderdienste, die sich nicht einbetten lassen.
 *
 * Fantastical setzt in seiner Sicherheitsregel `frame-ancestors 'self'`, die
 * Seite darf also ausschliesslich von fantastical.app selbst eingebettet
 * werden. Am 21.09.2026 nachgemessen: Der Kopf der Antwort sagt das
 * ausdrücklich. Der Rahmen bliebe leer und zeigte nur den Satz
 * "hat die Verbindung abgelehnt".
 *
 * Umgehen lässt sich das nicht, es ist eine Entscheidung des Anbieters. Statt
 * eines toten Rahmens steht dort deshalb ein Knopf, der den Kalender in einem
 * eigenen Fenster öffnet. Der Ablauf bleibt derselbe: buchen, zurückkommen,
 * Zeit eintragen.
 *
 * Calendly steht bewusst nicht in dieser Liste, es erlaubt das Einbetten. Wer
 * einen weiteren Dienst ergänzt, misst vorher nach:
 * `curl -I <adresse>` und in `content-security-policy` nach `frame-ancestors`
 * sehen.
 */
export const NICHT_EINBETTBAR = ["fantastical.app"];

/** Der Rechnername einer Adresse, oder leer, wenn es keine Adresse ist. */
export function hostVon(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/**
 * Sieht das nach einer brauchbaren Kalenderadresse aus?
 *
 * Die Adresse kommt seit dem 21.09.2026 aus der Datenbank, aus dem Profil der
 * zuständigen Person, und nicht mehr als feste Zeile aus dem Quelltext. Damit
 * kann dort auch etwas anderes stehen als eine Kalenderadresse, ein Tippfehler
 * etwa. Was nicht mit `http` beginnt, gehört nicht in einen Rahmen: Ein
 * `javascript:`-Eintrag liefe sonst in unserer eigenen Seite.
 */
export function istKalenderAdresse(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

/** Lässt sich dieser Kalender in unsere Seite einbetten? */
export function einbettbar(url: string): boolean {
  const host = hostVon(url);
  if (!host) return false;
  return !NICHT_EINBETTBAR.some((d) => host === d || host.endsWith("." + d));
}

/** Der eingebettete Kalender, ohne den Zustimmungsbanner des Dienstes. */
export function kalenderAdresse(url: string): string {
  /*
    Die Zusätze versteht nur Calendly. Bei jedem anderen Dienst blieben sie
    wirkungslose Anhängsel in der Adresse, und manche Seite stolpert darüber.
    Deshalb hängen sie nur dort dran, wo sie etwas bewirken.
  */
  if (!/(^|\.)calendly\.com$/i.test(hostVon(url))) return url;
  const trenner = url.includes("?") ? "&" : "?";
  return `${url}${trenner}hide_gdpr_banner=1&hide_landing_page_details=1&primary_color=087AC7`;
}
