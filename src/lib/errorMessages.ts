/**
 * Globaler Übersetzer für technische Fehler in verständliche, hilfreiche
 * Nachrichten für End-User.
 *
 * Verwendung:
 * ```ts
 * import { friendlyError } from "@/lib/errorMessages";
 * try { ... } catch (e) {
 *   toast({ title: "Fehler", description: friendlyError(e), variant: "destructive" });
 * }
 * ```
 *
 * Format: "Was ist passiert. Was kannst du tun." (Du-Form, das ganze Projekt
 * spricht per Du, für alle Rollen inkl. Kunden)
 *
 * Sprache: Standard ist Deutsch, das CRM ruft ohne Sprache auf und bleibt
 * deutsch. Das Kundenportal gibt die Anzeigesprache
 * mit: `friendlyError(e, undefined, portalSprache())`. Die Texte stehen hier
 * als Paar und nicht in den i18n-Dateien, damit die CRM-Aufrufer nicht von der
 * zuletzt im Browser gewählten Portalsprache abhängen.
 */

type AnyError = unknown;

export type FehlerSprache = "de" | "en";

interface FriendlyEntry {
  /** Regex oder Substring auf message/code matchen */
  match: RegExp | string;
  /** Verständliche Übersetzung (Du-Form, lösungsorientiert) */
  message: Record<FehlerSprache, string>;
}

/** Standardtext, wenn kein Muster greift. */
const FALLBACK: Record<FehlerSprache, string> = {
  de: "Es ist etwas schiefgelaufen. Bitte versuche es erneut. Falls das Problem bestehen bleibt, kontaktiere bitte den Support.",
  en: "Something went wrong. Please try again. If the problem persists, please contact support.",
};

/**
 * Grobe Erkennung deutscher Rohmeldungen, etwa aus unseren Edge Functions.
 * Ein englischer Kunde soll sie nicht zu sehen bekommen, dann lieber den
 * allgemeinen englischen Text.
 */
const DEUTSCH = /[äöüÄÖÜß]|\b(bitte|nicht|konnte|wurde|ungültig|erforderlich|und|oder|der|die|das)\b/i;

// Reihenfolge = Priorität. Spezifische Patterns zuerst.
const ERROR_MAP: FriendlyEntry[] = [
  // Netzwerk
  { match: /failed to fetch|network ?error|networkerror|err_network/i,
    message: {
      de: "Wir konnten den Server nicht erreichen. Bitte prüfe deine Internetverbindung und versuche es erneut.",
      en: "We couldn't reach the server. Please check your internet connection and try again." } },
  { match: /timeout|timed out/i,
    message: {
      de: "Die Anfrage hat zu lange gedauert. Bitte versuche es in einem Moment noch einmal.",
      en: "The request took too long. Please try again in a moment." } },
  { match: /aborted|abortError/i,
    message: {
      de: "Die Anfrage wurde abgebrochen. Bitte versuche es erneut.",
      en: "The request was cancelled. Please try again." } },

  // Auth / Session
  { match: /invalid login credentials|invalid_grant/i,
    message: {
      de: "E-Mail oder Passwort stimmen nicht. Bitte prüfe deine Eingaben oder setze dein Passwort zurück.",
      en: "The email address or password is incorrect. Please check what you entered or reset your password." } },
  { match: /email not confirmed/i,
    message: {
      de: "Deine E-Mail-Adresse ist noch nicht bestätigt. Bitte klicke auf den Link in der Bestätigungs-Mail.",
      en: "Your email address has not been confirmed yet. Please click the link in the confirmation email." } },
  { match: /user already registered/i,
    message: {
      de: "Für diese E-Mail-Adresse existiert bereits ein Konto. Bitte melde dich an oder setze dein Passwort zurück.",
      en: "An account already exists for this email address. Please sign in or reset your password." } },
  { match: /jwt expired|invalid jwt|jwt malformed|refresh.+expired/i,
    message: {
      de: "Deine Sitzung ist abgelaufen. Bitte melde dich neu an.",
      en: "Your session has expired. Please sign in again." } },
  { match: /not authorized|not authenticated|unauthorized|permission denied|access denied/i,
    message: {
      de: "Du hast keine Berechtigung für diese Aktion. Bitte wende dich an deinen Administrator, wenn du Zugriff benötigst.",
      en: "You don't have permission for this action. Please contact your administrator if you need access." } },
  { match: /password.+(short|weak|hibp|pwned|leaked)/i,
    message: {
      de: "Dieses Passwort ist nicht sicher genug. Bitte wähle ein längeres Passwort, das du noch nirgendwo anders verwendest.",
      en: "This password is not secure enough. Please choose a longer password that you don't use anywhere else." } },
  { match: /rate limit|too many requests|429/i,
    message: {
      de: "Zu viele Anfragen in kurzer Zeit. Bitte warte ein paar Minuten und versuche es dann erneut.",
      en: "Too many requests in a short time. Please wait a few minutes and then try again." } },
  { match: /mfa|2fa|otp.+invalid|invalid otp/i,
    message: {
      de: "Der eingegebene Code ist nicht korrekt oder bereits abgelaufen. Bitte fordere einen neuen Code an.",
      en: "The code you entered is incorrect or has already expired. Please request a new code." } },

  // Datenbank (Postgres)
  { match: /duplicate key|unique.+constraint|23505/i,
    message: {
      de: "Ein Eintrag mit diesen Daten existiert bereits. Bitte ändere die Eingabe oder bearbeite den vorhandenen Eintrag.",
      en: "An entry with these details already exists. Please change your input or edit the existing entry." } },
  { match: /foreign key.+constraint|23503/i,
    message: {
      de: "Dieser Eintrag ist mit anderen Datensätzen verknüpft und kann nicht in dieser Form geändert oder gelöscht werden.",
      en: "This entry is linked to other records and can't be changed or deleted in this way." } },
  { match: /not.null.+violation|null value.+violates|23502/i,
    message: {
      de: "Ein Pflichtfeld wurde nicht ausgefüllt. Bitte fülle alle markierten Felder aus.",
      en: "A required field is empty. Please fill in all marked fields." } },
  { match: /check.+constraint|23514/i,
    message: {
      de: "Mindestens ein Feld enthält einen ungültigen Wert. Bitte überprüfe deine Eingaben.",
      en: "At least one field contains an invalid value. Please check what you entered." } },
  { match: /row.level security|rls|new row violates row-level security/i,
    message: {
      de: "Du darfst auf diesen Datensatz nicht zugreifen. Bitte melde dich beim Administrator, falls das ein Fehler ist.",
      en: "You're not allowed to access this record. Please contact the administrator if you think this is a mistake." } },
  { match: /relation.+does not exist|undefined.+table/i,
    message: {
      de: "Die angefragten Daten sind aktuell nicht verfügbar. Bitte versuche es später erneut oder kontaktiere den Support.",
      en: "The requested data is not available at the moment. Please try again later or contact support." } },

  // Upload / Storage
  { match: /payload.+too large|file too large|413/i,
    message: {
      de: "Die Datei ist zu groß. Bitte verkleinere sie oder lade eine kleinere Version hoch.",
      en: "The file is too large. Please make it smaller or upload a smaller version." } },
  { match: /invalid.+mime|unsupported.+(type|format)/i,
    message: {
      de: "Dieser Dateityp wird nicht unterstützt. Erlaubt sind z.B. PDF, JPG, PNG.",
      en: "This file type is not supported. Allowed types include PDF, JPG and PNG." } },
  { match: /bucket.+not found|storage.+not found/i,
    message: {
      de: "Der Speicherort ist aktuell nicht erreichbar. Bitte versuche es in einem Moment erneut.",
      en: "The storage location can't be reached at the moment. Please try again in a moment." } },

  // HTTP Statuscodes (Fallback)
  { match: /\b400\b|bad request/i,
    message: {
      de: "Die Anfrage war ungültig. Bitte prüfe deine Eingaben und versuche es erneut.",
      en: "The request was invalid. Please check what you entered and try again." } },
  { match: /\b403\b|forbidden/i,
    message: {
      de: "Du hast keine Berechtigung für diese Aktion.",
      en: "You don't have permission for this action." } },
  { match: /\b404\b|not found/i,
    message: {
      de: "Der gesuchte Eintrag wurde nicht gefunden. Möglicherweise wurde er bereits gelöscht.",
      en: "The entry you were looking for could not be found. It may already have been deleted." } },
  { match: /\b409\b|conflict/i,
    message: {
      de: "Die Aktion konnte nicht ausgeführt werden, weil der Eintrag zwischenzeitlich geändert wurde. Bitte lade die Seite neu.",
      en: "The action could not be completed because the entry was changed in the meantime. Please reload the page." } },
  { match: /\b500\b|\b502\b|\b503\b|\b504\b|server error|internal error/i,
    message: {
      de: "Auf unserem Server ist ein Problem aufgetreten. Bitte versuche es in ein paar Minuten erneut. Wenn der Fehler bleibt, melde dich bitte beim Support.",
      en: "There's a problem on our server. Please try again in a few minutes. If the error persists, please contact support." } },
];

function extractRawMessage(err: AnyError): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (typeof err === "object") {
    const o = err as Record<string, unknown>;
    return (
      (typeof o.message === "string" && o.message) ||
      (typeof o.error_description === "string" && o.error_description) ||
      (typeof o.error === "string" && o.error) ||
      (typeof o.msg === "string" && o.msg) ||
      (typeof o.details === "string" && o.details) ||
      (typeof o.hint === "string" && o.hint) ||
      (typeof o.code === "string" && o.code) ||
      JSON.stringify(err)
    );
  }
  return String(err);
}

/**
 * Übersetzt einen technischen Fehler in eine verständliche Nachricht.
 *
 * @param err Beliebiger Fehler (Error, String, Supabase-Error-Objekt, ...)
 * @param fallback Optionale Standard-Nachricht, falls kein Pattern matched
 * @param sprache Anzeigesprache, Standard Deutsch
 */
export function friendlyError(
  err: AnyError,
  fallback?: string,
  sprache: FehlerSprache = "de",
): string {
  const lang: FehlerSprache = sprache === "en" ? "en" : "de";
  const ersatz = fallback ?? FALLBACK[lang];
  const raw = extractRawMessage(err);
  if (!raw) return ersatz;

  for (const entry of ERROR_MAP) {
    if (typeof entry.match === "string" ? raw.includes(entry.match) : entry.match.test(raw)) {
      return entry.message[lang];
    }
  }

  // Wenn die rohe Nachricht offensichtlich technisch wirkt → fallback.
  if (/^[A-Z0-9_]{3,}$/.test(raw) || raw.length > 240 || /\bat\s+\w+\s+\(/.test(raw)) {
    return ersatz;
  }

  // Deutsche Rohmeldung für einen englischen Leser → allgemeiner Text.
  if (lang === "en" && DEUTSCH.test(raw)) return ersatz;

  return raw;
}

/**
 * Kurz-Helfer für toast({ description }) – liefert immer einen verständlichen String.
 */
export function errorToDescription(err: AnyError, fallback?: string, sprache?: FehlerSprache): string {
  return friendlyError(err, fallback, sprache);
}
