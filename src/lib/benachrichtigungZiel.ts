/**
 * Wohin ein Klick auf eine Benachrichtigung fuehrt.
 *
 * Die Glocke ruft `navigate(link)`. Das erwartet einen Pfad wie
 * `/bewerberprozess?openBewerber=abc`. Steht in der Tabelle aber eine volle
 * Adresse wie `https://portal.more.immo/bewerberprozess?...`, haengt der
 * Router sie als relativen Pfad an die aktuelle Seite: Daraus wird
 * `/https:/portal.more.immo/...`, dafuer gibt es keine Route, und der Nutzer
 * landet auf der 404-Seite. Genau das ist Christian am 14.09.2026 beim Klick
 * auf "Neuer Bewerber: Eric Schoof" passiert.
 *
 * Der Erzeuger auf der Serverseite ist inzwischen auf den Pfad umgestellt.
 * Diese Funktion faengt trotzdem beides ab: die Meldungen, die schon mit
 * voller Adresse in der Tabelle stehen, und jeden kuenftigen Erzeuger, der
 * denselben Fehler macht. Ein Klick, der ins Leere geht, ist schlimmer als
 * eine Meldung, die nie kam.
 */

/** Die Hosts, die zum Haus gehoeren. Ein Pfad darauf wird intern geoeffnet. */
const EIGENE_HOSTS = ["portal.more.immo", "more.immo"];

export type BenachrichtigungZiel =
  /** Im Router oeffnen, mit diesem Pfad. */
  | { art: "intern"; pfad: string }
  /** Fremde Adresse, in einem neuen Fenster oeffnen. */
  | { art: "extern"; url: string }
  /** Kein Sprung: Das Ziel ist fuer die aktive Rolle gesperrt. */
  | { art: "keins" };

function istEigenerHost(host: string, eigenerHost: string): boolean {
  const h = host.toLowerCase();
  if (h === eigenerHost.toLowerCase()) return true;
  return EIGENE_HOSTS.some((e) => h === e || h.endsWith("." + e));
}

/**
 * @param link       Der Link aus der Benachrichtigung, Pfad oder volle Adresse.
 * @param eigenerHost Der Host der laufenden Seite, in der Regel `window.location.host`.
 *                   Wird uebergeben statt gelesen, damit die Funktion ohne
 *                   Browser testbar bleibt.
 * @param gesperrt   Optional: Ist dieser interne Pfad fuer die aktive Rolle zu?
 *                   Dann fuehrt die Meldung nirgendwohin. So verlinken auch
 *                   alte Glocken nicht mehr in den Objektbereich, wenn der
 *                   Empfaenger ihn nicht sehen darf (Christian, 29.09.2026).
 */
export function benachrichtigungZiel(
  link: string | null | undefined,
  eigenerHost: string,
  gesperrt?: (pfad: string) => boolean,
): BenachrichtigungZiel {
  const ziel = rohesZiel(link, eigenerHost);
  if (ziel.art === "intern" && gesperrt?.(ziel.pfad)) return { art: "keins" };
  return ziel;
}

function rohesZiel(link: string | null | undefined, eigenerHost: string): BenachrichtigungZiel {
  const roh = (link || "").trim();
  if (!roh) return { art: "intern", pfad: "/inbox" };
  if (roh.startsWith("/") && !roh.startsWith("//")) return { art: "intern", pfad: roh };

  let url: URL;
  try {
    url = new URL(roh);
  } catch {
    /* Weder Pfad noch Adresse, etwa "bewerberprozess" ohne Schraegstrich.
       Ein fuehrender Schraegstrich macht daraus einen Pfad. */
    return { art: "intern", pfad: "/" + roh.replace(/^\/+/, "") };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { art: "intern", pfad: "/inbox" };
  }
  if (istEigenerHost(url.host, eigenerHost)) {
    return { art: "intern", pfad: url.pathname + url.search + url.hash };
  }
  return { art: "extern", url: roh };
}
