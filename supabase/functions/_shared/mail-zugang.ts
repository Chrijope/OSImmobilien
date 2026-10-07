/**
 * Wer darf ueber send-transactional-email Mails verschicken? (Befund HB-003)
 *
 * Bis zum 26.09.2026 verliess sich die Function auf die JWT-Pruefung am
 * Gateway. Die laesst aber auch den oeffentlichen anon-Schluessel durch, und
 * der steht in jedem Browser. Damit konnte jeder beliebige Vorlagen mit
 * eigenen Links an beliebige Adressen ueber notify.os-immobilien.com schicken, also
 * Phishing in unserem Namen.
 *
 * Seitdem gilt:
 *
 *   - Dienst (andere Edge Functions mit dem Service-Role-Schluessel): alles.
 *   - Angemeldet mit interner Rolle (`is_internal_role`, dazu zaehlt auch der
 *     Vertriebspartner): alles, mit Mengenbremse.
 *   - Angemeldet ohne interne Rolle (Kunde, Tippgeber, Bewerber): nur die
 *     Vorlagen aus `EXTERNE_VORLAGEN`, und nur an die eigene Adresse
 *     beziehungsweise an das Team. Enge Mengenbremse.
 *   - Nicht angemeldet (anon-Schluessel oder gar nichts): verboten. Kein
 *     Browser-Code ruft die Function ohne Anmeldung auf; oeffentliche Seiten
 *     verschicken ihre Mails ueber eigene Functions mit der Dienstrolle.
 *
 * Die Datei hat keine Deno-eigenen Importe, damit Vitest sie pruefen kann
 * (src/lib/mailZugang.test.ts).
 */

export type MailAufrufer =
  | { art: "dienst" }
  | { art: "intern"; nutzerId: string }
  | { art: "extern"; nutzerId: string; email: string }
  | { art: "anonym" };

/**
 * Die Vorlagen, die ein angemeldeter Nutzer ohne interne Rolle ausloesen darf,
 * und wohin.
 *
 *   eigene  nur an eine Adresse, die ihm selbst gehoert (Anmeldeadresse,
 *           sein Kontakt im Kundenportal, sein Tippgeber-Eintrag)
 *   team    nur an das Team (feste Postfaecher oder Profil mit interner Rolle)
 *
 * Aufrufer im Browser (Stand 26.09.2026):
 *   notartermin-bestaetigung-kunde  Kundenportal, NotarterminAuswahlCard
 *   notartermin-bestaetigt          Kundenportal, notarterminBestaetigungIntern
 *   tippgeber-pitch-toolkit         Tippgeber-Portal, Reiter Pitches
 *   bug-report                      Fehlermeldung nach einem Absturz, BugReportDialog
 */
export const EXTERNE_VORLAGEN: Readonly<Record<string, "eigene" | "team">> = {
  "notartermin-bestaetigung-kunde": "eigene",
  "tippgeber-pitch-toolkit": "eigene",
  "notartermin-bestaetigt": "team",
  "bug-report": "team",
};

/**
 * Feste Team-Postfaecher, die kein eigenes Profil haben muessen. office@ ist
 * das Buero (BUERO_EMAIL), c.peetz@imondu.de der Standard-Empfaenger der
 * Fehlermeldungen (BugReportDialog).
 */
export const TEAM_POSTFAECHER: readonly string[] = ["os@os-immobilien.com", "c.peetz@imondu.de"];

/** Mengenbremse je Nutzer und Stunde beziehungsweise Tag. */
export const MAIL_BREMSE = {
  intern: { perHour: 200, perDay: 1000 },
  extern: { perHour: 20, perDay: 60 },
} as const;

export function normalisiereAdresse(wert: unknown): string {
  return typeof wert === "string" ? wert.trim().toLowerCase() : "";
}

export function bearerToken(authorization: string | null | undefined): string {
  const treffer = /^bearer\s+(.+)$/i.exec((authorization || "").trim());
  return treffer ? treffer[1].trim() : "";
}

export interface AufruferQuellen {
  /** Ist der Kopf genau `Bearer <Service-Role-Schluessel>`? */
  istDienst: (authorization: string | null) => boolean;
  /**
   * Prueft ein Nutzer-Token beim Auth-Server. `null` fuer den anon-Schluessel,
   * abgelaufene oder erfundene Token.
   */
  nutzerAusToken: (token: string) => Promise<{ id: string; email: string } | null>;
  /** `is_internal_role`. Wirft, wenn die Pruefung nicht moeglich ist. */
  istIntern: (nutzerId: string) => Promise<boolean>;
}

/** Ordnet den Aufruf einer der vier Gruppen zu. */
export async function ermittleAufrufer(
  authorization: string | null,
  quellen: AufruferQuellen,
): Promise<MailAufrufer> {
  if (quellen.istDienst(authorization)) return { art: "dienst" };
  const token = bearerToken(authorization);
  if (!token) return { art: "anonym" };
  const nutzer = await quellen.nutzerAusToken(token);
  if (!nutzer?.id) return { art: "anonym" };
  if (await quellen.istIntern(nutzer.id)) return { art: "intern", nutzerId: nutzer.id };
  return { art: "extern", nutzerId: nutzer.id, email: normalisiereAdresse(nutzer.email) };
}

export type MailEntscheidung =
  | { erlaubt: true }
  | { erlaubt: false; status: 401 | 403; grund: string };

/**
 * Darf dieser Aufrufer diese Vorlage an diesen Empfaenger schicken?
 *
 * `empfaengerPasst` sagt, ob der Empfaenger zur Regel der Vorlage passt
 * (eigene Adresse beziehungsweise Team). Zaehlt nur fuer externe Aufrufer,
 * send-transactional-email sieht ihn deshalb nur fuer diese nach.
 */
export function pruefeMailZugang(
  aufrufer: MailAufrufer,
  vorlage: string,
  empfaengerPasst: boolean,
): MailEntscheidung {
  if (aufrufer.art === "dienst" || aufrufer.art === "intern") return { erlaubt: true };
  if (aufrufer.art === "anonym") {
    return { erlaubt: false, status: 401, grund: "Anmeldung erforderlich" };
  }
  if (!EXTERNE_VORLAGEN[vorlage]) {
    return { erlaubt: false, status: 403, grund: "Vorlage nicht freigegeben" };
  }
  if (!empfaengerPasst) {
    return { erlaubt: false, status: 403, grund: "Empfaenger nicht freigegeben" };
  }
  return { erlaubt: true };
}
