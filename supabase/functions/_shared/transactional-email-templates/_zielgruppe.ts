/**
 * Wer eine Mailvorlage bekommt: ein Kunde oder jemand im Haus.
 *
 * Plan Kundensprache, Etappe 2. Die Kennzeichnung entscheidet, ob eine Mail
 * der Kundensprache folgt:
 *
 *   kunde   Geht an Kunden oder Interessenten. Muss Deutsch und Englisch
 *           können (`sprachen: DE_EN` in der Vorlage). send-transactional-email
 *           ermittelt die Sprache des Empfängers und legt sie als `sprache`
 *           in die Felder.
 *   intern  Bleibt deutsch. Mitarbeiter, Vertriebspartner, Finanzierer,
 *           Tippgeber, Bewerber und Dritte wie das Notariat. Der Bewerber ist
 *           hier „intern“, weil er kein Kunde ist und seine Strecke
 *           ausdrücklich deutsch bleibt.
 *
 * Jede Vorlage der Registry steht hier genau einmal. Das prüft der Wächter in
 * `src/lib/mailSpracheWaechter.test.ts`, zusammen mit der Regel „jede
 * Kundenvorlage hat Englisch“. Eine neue Vorlage ohne Eintrag lässt den Test
 * rot werden, damit niemand vergisst, sich zu entscheiden.
 *
 * Reine Datei ohne Importe, damit Vitest und Deno sie lesen können.
 */

export type Zielgruppe = 'kunde' | 'intern'

export const VORLAGEN_ZIELGRUPPE: Readonly<Record<string, Zielgruppe>> = {
  // ── Kunden und Interessenten ───────────────────────────────────────
  'lead-willkommen': 'kunde',
  'setter-lead-bestaetigung': 'kunde',
  'setter-daten-falsch': 'kunde',
  'setter-kein-interesse': 'kunde',
  'vp-daten-falsch': 'kunde',
  'vp-kein-interesse': 'kunde',
  'handbuch-zustellung': 'kunde',
  'selbstauskunft-liegt-vor': 'kunde',
  'nicht-erreicht-mail-1': 'kunde',
  'nicht-erreicht-mail-2': 'kunde',
  'nicht-erreicht-mail-3': 'kunde',
  'buchungslink-einladung': 'kunde',
  'buchung-bestaetigung': 'kunde',
  'buchung-absage': 'kunde',
  'buchung-verschoben': 'kunde',
  'termin-erinnerung': 'kunde',
  'erstgespraech-erinnerung': 'kunde',
  'erstgespraech-erinnerung-24h': 'kunde',
  'erstgespraech-erinnerung-6h': 'kunde',
  'erstgespraech-erinnerung-1h': 'kunde',
  'zoom-meeting-einladung': 'kunde',
  'meeting-aenderung': 'kunde',
  'sa-invitation': 'kunde',
  'selbstauskunft-signatur': 'kunde',
  'selbstauskunft-geaendert': 'kunde',
  'selbstauskunft-formular-pdf': 'kunde',
  'reservierung-signatur': 'kunde',
  'reservierung-kopie': 'kunde',
  'document-reminder': 'kunde',
  'unterlagen-pruefung-ergebnis': 'kunde',
  'aftersales-beratung-signatur': 'kunde',
  'notartermin-auswahl': 'kunde',
  'notartermin-bestaetigung-kunde': 'kunde',
  'notartermin-geplant': 'kunde',
  'kunden-expose': 'kunde',
  // Läuft in beide Richtungen. Schreibt der Kunde, geht sie mit
  // `anPartner` an den Partner und bleibt deutsch, das regelt die Vorlage.
  'chat-nachricht': 'kunde',
  // Gehen an jedes Konto, auch an Mitarbeiter. Die Sprache kommt über die
  // Adresse; wer kein Kunde ist, bekommt Deutsch.
  'account-lockout': 'kunde',
  'session-anomalie': 'kunde',
  'dsgvo-deletion-confirmation': 'kunde',
  'birthday-customer': 'kunde',
  'vp-bewertung-einladung': 'kunde',
  'google-bewertung-einladung': 'kunde',
  'google-bewertung-erinnerung-1': 'kunde',
  'google-bewertung-erinnerung-2': 'kunde',
  // Kundenmails, deren Englisch bewusst noch fehlt, siehe KUNDENVORLAGEN_OHNE_EN.
  'activation-invite': 'kunde',
  'steuer-auswertung': 'kunde',
  'anlage-v-aufstellung': 'kunde',
  'sa-reminder-1': 'kunde',
  'sa-reminder-2': 'kunde',
  'sa-reminder-3': 'kunde',
  'sa-abbrecher-reminder': 'kunde',
  'reservierung-erinnerung': 'kunde',
  'selbstauskunft-pdf': 'kunde',

  // ── Im Haus, Partner, Bewerber und Dritte: bleibt deutsch ─────────
  'birthday-greeting': 'intern',
  'weekly-ceo-summary': 'intern',
  'weekly-vp-summary': 'intern',
  'vermoegensaufbau-lead': 'intern',
  'kaufvertrag-hochgeladen': 'intern',
  'faelligkeit-hochgeladen': 'intern',
  // Seit dem 25.09.2026 nur noch an Vertriebspartner und Büro. Der Kunde
  // bekommt `notartermin-geplant`.
  'notartermin-benachrichtigung': 'intern',
  'notartermin-bestaetigt': 'intern',
  'bonitaet-freigabe': 'intern',
  'unterlagen-eingereicht': 'intern',
  'reservierung-unterschrieben': 'intern',
  'selbstauskunft-unterschrieben': 'intern',
  'pipeline-mahnreport': 'intern',
  'bug-report': 'intern',
  'system-health-alert': 'intern',
  'notar-aufnahmebogen-erstellt': 'intern',
  'vertrag-unterschrieben-rechnung': 'intern',
  'vertrag-hr-eskalation': 'intern',
  'vertrag-erinnerung-1': 'intern',
  'vertrag-erinnerung-2': 'intern',
  'vertrag-erinnerung-3': 'intern',
  'vertrag-signatur': 'intern',
  'vertrag-gegenzeichnung-kurz': 'intern',
  'vertrag-vollstaendig-unterschrieben': 'intern',
  'finanzierung-starten': 'intern',
  'rechnung-bezahlt-nutzer-anlegen': 'intern',
  'paket-uebersicht': 'intern',
  'muster-vertrag': 'intern',
  'tippgeber-pitch-toolkit': 'intern',
  // An Mieter, nicht an Käufer. Außerhalb dieses Vorhabens (Entscheidung 15).
  'mahnung': 'intern',
  'buchung-benachrichtigung': 'intern',
  'buchung-absage-partner': 'intern',
  'buchung-verschoben-partner': 'intern',
  'neuer-lead-partner': 'intern',
  'leads-zugewiesen-sammel': 'intern',
  'nachtpruefung-bericht': 'intern',
  'tagesbriefing': 'intern',
  'weekly-call-punkte': 'intern',
  'bewerber-closing-erinnerung': 'intern',
  'bewerber-nicht-erreicht': 'intern',
  'bewerber-erstgespraech-erinnerung': 'intern',
  'bewerber-formular-einladung': 'intern',
  'bewerber-formular-erinnerung': 'intern',
  'bewerber-kennenlernen-einladung': 'intern',
  'bewerber-termin-hr': 'intern',
  'bewerber-kennenlernen-erinnerung-1': 'intern',
  'bewerber-kennenlernen-erinnerung-3': 'intern',
  'bewerber-kennenlernen-zusammenfassung': 'intern',
  'bewerber-kennenlernen-buchung-erinnerung': 'intern',
  'bewerber-termin-bestaetigung': 'intern',
  'bewerber-kooperationsgespraech-einladung': 'intern',
  'bewerber-kennenlernen-absage': 'intern',
  'bewerber-videocall-erinnerung': 'intern',
  'bewerber-hr-anruf': 'intern',
  'bewerber-nachfass-kennenlernen': 'intern',
  'bewerber-zugangsdaten': 'intern',
  'bewerber-absage': 'intern',
  'bewerber-neu-intern': 'intern',
  'support-antwort': 'intern',
  'bewerber-vertrag-unterschrieben-intern': 'intern',
}

/**
 * Kundenvorlagen, die bewusst noch kein Englisch haben, mit Grund.
 *
 * Bis sie Englisch bekommen, gehen sie auch an englische Kunden deutsch
 * hinaus. send-transactional-email prüft das über `sprachen` der Vorlage,
 * nicht über diese Liste; die Liste ist die Begründung für den Wächter.
 */
export const KUNDENVORLAGEN_OHNE_EN: Readonly<Record<string, string>> = {
  'steuer-auswertung': 'Etappe 6 (anonymer Steuerrechner, M33)',
  'anlage-v-aufstellung': 'Geht an den Steuerberater und bleibt deutsch (Entscheidung 8, M34)',
  'sa-reminder-1': 'Abgeschaltet seit 15.09.2026, Englisch erst wenn sie wieder anläuft',
  'sa-reminder-2': 'Abgeschaltet seit 15.09.2026, Englisch erst wenn sie wieder anläuft',
  'sa-reminder-3': 'Abgeschaltet seit 15.09.2026, Englisch erst wenn sie wieder anläuft',
  'sa-abbrecher-reminder': 'Abgeschaltet seit 15.09.2026, Englisch erst wenn sie wieder anläuft',
  'selbstauskunft-pdf': 'Ohne Aufrufer (send-selbstauskunft wird nirgends aufgerufen)',
}

/** Unbekannte Vorlagen gelten als intern, also deutsch. */
export function zielgruppeVon(vorlage: string): Zielgruppe {
  return VORLAGEN_ZIELGRUPPE[vorlage] ?? 'intern'
}

/**
 * Folgt diese Vorlage der Kundensprache? Nur wenn sie an Kunden geht und
 * selbst Englisch kann. Alles andere geht deutsch hinaus, egal was der
 * Aufrufer mitschickt.
 */
export function folgtKundensprache(vorlage: string, sprachen: readonly string[] | undefined): boolean {
  return zielgruppeVon(vorlage) === 'kunde' && Array.isArray(sprachen) && sprachen.includes('en')
}
