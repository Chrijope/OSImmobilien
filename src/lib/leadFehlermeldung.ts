/**
 * Meldungen für fehlgeschlagene Lead-Formulare (Landingpage, Analysetool).
 *
 * Vorher bekam ein Interessent bei jedem Fehler denselben Satz. Ob der Server
 * gerade streikt, ob die Angaben nicht durchgehen oder ob eine Sperre wegen zu
 * vieler Anfragen greift, macht aber einen Unterschied: Nur im zweiten Fall
 * kann er selbst etwas ändern, und nur im dritten hilft Warten.
 *
 * Die Texte sind in der Du-Form, wie das ganze Projekt seit dem 15.09.2026, und
 * sie nennen immer den nächsten Schritt. Rohe Serverantworten kommen nie vor.
 *
 * ENGLISCHE FASSUNG, seit dem 17.09.2026: Der EXPATS Calculator ist eine
 * durchgehend englische Seite und seither öffentlich erreichbar. Vorher stand
 * dort im Fehlerfall ein deutscher Satz mitten in einer englischen Seite.
 * Deshalb tragen die drei Funktionen jetzt einen Sprachparameter. Er steht
 * hinten und hat den Standardwert `"de"`, damit jeder vorhandene Aufruf
 * unverändert weiterläuft und die deutschen Texte sich in keinem Zeichen
 * ändern. Die englischen Fassungen sind eine inhaltlich treue Übertragung,
 * anwaltlich geprüft ist keine der beiden Sprachen.
 *
 * SIE-FASSUNG, seit dem 27.09.2026: Die Handbuch-Strecke siezt (Entscheidung
 * Christian). Sie übergibt `anrede: "sie"`. Ohne Angabe bleibt alles im Du und
 * zeichengleich wie bisher, denn die übrigen Formulare duzen weiter.
 */

/** Sprache der Meldung. Ohne Angabe deutsch, wie bisher überall. */
export type LeadMeldungSprache = "de" | "en";

/** Anrede der deutschen Meldung. Ohne Angabe Du. */
export type LeadMeldungAnrede = "du" | "sie";

/** Wartezeit aus dem Retry-After-Header in einen lesbaren Text. */
export function wartezeitText(
  sekunden: number | null | undefined,
  sprache: LeadMeldungSprache = "de",
): string {
  const en = sprache === "en";
  if (!sekunden || !Number.isFinite(sekunden) || sekunden <= 0) {
    return en ? "a little while" : "etwas später";
  }
  if (sekunden < 120) return en ? "a minute" : "einer Minute";
  const minuten = Math.round(sekunden / 60);
  if (minuten < 60) return en ? `${minuten} minutes` : `${minuten} Minuten`;
  const stunden = Math.round(minuten / 60);
  if (en) return stunden === 1 ? "an hour" : `${stunden} hours`;
  return stunden === 1 ? "einer Stunde" : `${stunden} Stunden`;
}

/**
 * Liest den Retry-After-Header. Akzeptiert die Sekundenangabe, mit der die
 * Edge Function antwortet. Ein Datum als Wert ergibt null.
 */
export function retryAfterSekunden(headers: Headers | null | undefined): number | null {
  const roh = headers?.get?.("Retry-After");
  if (!roh) return null;
  const zahl = Number(roh);
  return Number.isFinite(zahl) && zahl > 0 ? zahl : null;
}

/** Passende Meldung zum HTTP-Status der Lead-Annahme. */
export function leadFehlermeldung(
  status: number | null | undefined,
  retryAfter?: number | null,
  sprache: LeadMeldungSprache = "de",
  anrede: LeadMeldungAnrede = "du",
): string {
  if (sprache === "en") {
    if (status === 429) {
      return (
        `A lot of requests have come in just now. Please try again in ${wartezeitText(retryAfter, "en")}. ` +
        "Your entries are kept until then."
      );
    }
    if (status === 400 || status === 422) {
      return (
        "Some of your details could not be processed. Please check your email address and " +
        "phone number and send again."
      );
    }
    if (status === 401 || status === 403) {
      return "The request was refused. Please reload the page and try again.";
    }
    return (
      "Saving did not work. Please try again in a few minutes. " +
      "Your entries are kept until then."
    );
  }
  if (anrede === "sie") {
    if (status === 429) {
      return (
        `Es sind gerade sehr viele Anfragen eingegangen. Bitte versuchen Sie es in ${wartezeitText(retryAfter)} ` +
        "noch einmal. Ihre Eingaben bleiben so lange gespeichert."
      );
    }
    if (status === 400 || status === 422) {
      return (
        "Einige Angaben konnten nicht verarbeitet werden. Bitte prüfen Sie E-Mail-Adresse und " +
        "Telefonnummer und senden Sie erneut."
      );
    }
    if (status === 401 || status === 403) {
      return "Die Anfrage wurde abgelehnt. Bitte laden Sie die Seite neu und versuchen Sie es noch einmal.";
    }
    return (
      "Das Speichern hat nicht geklappt. Bitte versuchen Sie es in ein paar Minuten noch einmal. " +
      "Ihre Eingaben bleiben so lange gespeichert."
    );
  }
  if (status === 429) {
    return (
      `Es sind gerade sehr viele Anfragen eingegangen. Bitte versuch es in ${wartezeitText(retryAfter)} ` +
      "noch einmal. Deine Eingaben bleiben so lange gespeichert."
    );
  }
  if (status === 400 || status === 422) {
    return (
      "Einige Angaben konnten nicht verarbeitet werden. Bitte prüfe E-Mail-Adresse und " +
      "Telefonnummer und sende erneut."
    );
  }
  if (status === 401 || status === 403) {
    return "Die Anfrage wurde abgelehnt. Bitte lade die Seite neu und versuch es noch einmal.";
  }
  return (
    "Das Speichern hat nicht geklappt. Bitte versuch es in ein paar Minuten noch einmal. " +
    "Deine Eingaben bleiben so lange gespeichert."
  );
}

/** Meldung, wenn der Server gar nicht erreichbar war. */
export function leadNetzfehlerMeldung(sprache: LeadMeldungSprache = "de", anrede: LeadMeldungAnrede = "du"): string {
  if (sprache === "en") {
    return (
      "We could not reach the server. Please check your internet connection and " +
      "try again. Your entries are kept until then."
    );
  }
  if (anrede === "sie") {
    return (
      "Wir konnten den Server nicht erreichen. Bitte prüfen Sie Ihre Internetverbindung und " +
      "versuchen Sie es erneut. Ihre Eingaben bleiben so lange gespeichert."
    );
  }
  return (
    "Wir konnten den Server nicht erreichen. Bitte prüfe deine Internetverbindung und " +
    "versuche es erneut. Deine Eingaben bleiben so lange gespeichert."
  );
}
