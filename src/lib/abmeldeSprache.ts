/**
 * Texte und Sprachwahl der Abmeldeseite `src/pages/Unsubscribe.tsx`.
 * Eigene Datei, damit die Seite nur die Komponente exportiert.
 */
/**
 * Die Abmeldeseite, zweisprachig (Plan Kundensprache, Etappe 2, S10).
 *
 * Die Sprache kommt in dieser Reihenfolge:
 *   1. `lang=en` im Link. Englische Mails hängen es an den Abmeldelink.
 *   2. Die Antwort von `handle-email-unsubscribe`, die über die Adresse
 *      hinter dem Token den Kontakt und seine Sprache findet.
 *   3. Deutsch.
 * Die Browsersprache zählt bewusst nicht: Das Kundenprofil führt.
 */
export const ABMELDE_TEXTE = {
  de: {
    pruefen: "Wird überprüft...",
    titel: "E-Mail-Benachrichtigungen abbestellen",
    frage: "Möchtest du wirklich keine E-Mails mehr von OS Immobilien erhalten?",
    knopf: "Abbestellen bestätigen",
    fertigTitel: "Erfolgreich abbestellt",
    fertigText: "Du erhältst ab sofort keine E-Mails mehr von uns.",
    schonTitel: "Bereits abbestellt",
    schonText: "Du hast die E-Mail-Benachrichtigungen bereits abbestellt.",
    ungueltigTitel: "Ungültiger Link",
    ungueltigText: "Dieser Abmelde-Link ist ungültig oder abgelaufen.",
  },
  en: {
    pruefen: "Checking...",
    titel: "Unsubscribe from email notifications",
    frage: "Do you really no longer want to receive emails from OS Immobilien?",
    knopf: "Confirm unsubscribe",
    fertigTitel: "Successfully unsubscribed",
    fertigText: "You will no longer receive any emails from us.",
    schonTitel: "Already unsubscribed",
    schonText: "You have already unsubscribed from email notifications.",
    ungueltigTitel: "Invalid link",
    ungueltigText: "This unsubscribe link is invalid or has expired.",
  },
} as const;

export type AbmeldeSprache = keyof typeof ABMELDE_TEXTE;

/** Aus dem Link-Parameter und der Antwort des Servers die Sprache der Seite. */
export function abmeldeSprache(ausLink: string | null, vomServer: unknown): AbmeldeSprache {
  const link = (ausLink || "").trim().toLowerCase();
  if (link === "en" || link === "de") return link;
  return vomServer === "en" ? "en" : "de";
}

