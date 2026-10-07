/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

import type { MailSprache } from './_sprache.ts'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
  /**
   * Die Sprachen, die die Vorlage kann. Fehlt die Angabe, nur Deutsch.
   * Kundenvorlagen melden `DE_EN` und lesen `sprache` aus ihren Feldern.
   * Ob eine Vorlage an Kunden geht, steht in `_zielgruppe.ts`.
   */
  sprachen?: readonly MailSprache[]
  /**
   * Wer als Absender erscheint. Fehlt die Angabe: "OS Immobilien".
   *
   * `zustaendiger-partner`: send-transactional-email liest
   * `kontakte.zustaendig_id` zum mitgegebenen Kontakt und setzt daraus
   * Absendername, Antwortadresse, Unterschrift und Buchungslink, egal wer den
   * Versand ausgeloest hat. Ist niemand zustaendig, das OS Immobilien Team mit
   * office@. Siehe _shared/zustaendiger-absender.ts.
   */
  absender?: 'zustaendiger-partner'
}

export { VORLAGEN_ZIELGRUPPE, folgtKundensprache } from './_zielgruppe.ts'

import { template as meetingAenderung } from './meeting-aenderung.tsx'
import { template as birthdayGreeting } from './birthday-greeting.tsx'
import { template as weeklyCeoSummary } from './weekly-ceo-summary.tsx'
import { template as weeklyVpSummary } from './weekly-vp-summary.tsx'
import { template as dsgvoDeletionConfirmation } from './dsgvo-deletion-confirmation.tsx'
import { template as erstgespraechErinnerung } from './erstgespraech-erinnerung.tsx'
import { template as erstgespraechErinnerung24h } from './erstgespraech-erinnerung-24h.tsx'
import { template as erstgespraechErinnerung6h } from './erstgespraech-erinnerung-6h.tsx'
import { template as erstgespraechErinnerung1h } from './erstgespraech-erinnerung-1h.tsx'
import { template as vermoegensaufbauLead } from './vermoegensaufbau-lead.tsx'
import { template as saInvitation } from './sa-invitation.tsx'
import { template as notarterminGeplant } from './notartermin-geplant.tsx'
import { template as kaufvertragHochgeladen } from './kaufvertrag-hochgeladen.tsx'
import { template as faelligkeitHochgeladen } from './faelligkeit-hochgeladen.tsx'
import { template as notarterminBenachrichtigung } from './notartermin-benachrichtigung.tsx'
import { template as chatNachricht } from './chat-nachricht.tsx'
import { template as birthdayCustomer } from './birthday-customer.tsx'
import { template as notarterminAuswahl } from './notartermin-auswahl.tsx'
import { template as unterlagenPruefungErgebnis } from './unterlagen-pruefung-ergebnis.tsx'
import { template as bonitaetFreigabe } from './bonitaet-freigabe.tsx'
import { template as selbstauskunftSignatur } from './selbstauskunft-signatur.tsx'
import { template as selbstauskunftGeaendert } from './selbstauskunft-geaendert.tsx'
import { template as reservierungSignatur } from './reservierung-signatur.tsx'
import { template as reservierungErinnerung } from './reservierung-erinnerung.tsx'
import { template as unterlagenEingereicht } from './unterlagen-eingereicht.tsx'
import { template as reservierungUnterschrieben } from './reservierung-unterschrieben.tsx'
import { template as reservierungKopie } from './reservierung-kopie.tsx'
import { template as selbstauskunftUnterschrieben } from './selbstauskunft-unterschrieben.tsx'
import { template as notarterminBestaetigt } from './notartermin-bestaetigt.tsx'
import { template as notarterminBestaetigungKunde } from './notartermin-bestaetigung-kunde.tsx'
import { template as pipelineMahnreport } from './pipeline-mahnreport.tsx'
import { template as bugReport } from './bug-report.tsx'
import { template as setterLeadBestaetigung } from './setter-lead-bestaetigung.tsx'
import { template as leadWillkommen } from './lead-willkommen.tsx'
import { template as setterDatenFalsch } from './setter-daten-falsch.tsx'
import { template as setterKeinInteresse } from './setter-kein-interesse.tsx'
import { template as vpDatenFalsch } from './vp-daten-falsch.tsx'
import { template as vpKeinInteresse } from './vp-kein-interesse.tsx'
import { template as systemHealthAlert } from './system-health-alert.tsx'
import { template as notarAufnahmebogenErstellt } from './notar-aufnahmebogen-erstellt.tsx'
import { template as vertragUnterschriebenRechnung } from './vertrag-unterschrieben-rechnung.tsx'
import { template as sessionAnomalie } from './session-anomalie.tsx'
import { template as accountLockout } from './account-lockout.tsx'
import { template as bewerberClosingErinnerung } from './bewerber-closing-erinnerung.tsx'
import { template as bewerberNichtErreicht } from './bewerber-nicht-erreicht.tsx'
import { template as bewerberErstgespraechErinnerung } from './bewerber-erstgespraech-erinnerung.tsx'
import { template as bewerberFormularEinladung } from './bewerber-formular-einladung.tsx'
import { template as vertragHrEskalation } from './vertrag-hr-eskalation.tsx'
import { template as vertragErinnerung1 } from './vertrag-erinnerung-1.tsx'
import { template as vertragErinnerung2 } from './vertrag-erinnerung-2.tsx'
import { template as vertragErinnerung3 } from './vertrag-erinnerung-3.tsx'
import { template as bewerberFormularErinnerung } from './bewerber-formular-erinnerung.tsx'
import { template as bewerberKennenlernenEinladung } from './bewerber-kennenlernen-einladung.tsx'
import { template as bewerberTerminHr } from './bewerber-termin-hr.tsx'
import { template as bewerberKennenlernenErinnerung1 } from './bewerber-kennenlernen-erinnerung-1.tsx'
import { template as bewerberKennenlernenErinnerung3 } from './bewerber-kennenlernen-erinnerung-3.tsx'
import { template as bewerberKennenlernenZusammenfassung } from './bewerber-kennenlernen-zusammenfassung.tsx'
import { template as bewerberKennenlernenBuchungErinnerung } from './bewerber-kennenlernen-buchung-erinnerung.tsx'
import { template as bewerberTerminBestaetigung } from './bewerber-termin-bestaetigung.tsx'
import { template as bewerberKooperationsgespraechEinladung } from './bewerber-kooperationsgespraech-einladung.tsx'
import { template as bewerberKennenlernenAbsage } from './bewerber-kennenlernen-absage.tsx'
import { template as bewerberVideocallErinnerung } from './bewerber-videocall-erinnerung.tsx'
import { template as bewerberHrAnruf } from './bewerber-hr-anruf.tsx'
import { template as bewerberNachfassKennenlernen } from './bewerber-nachfass-kennenlernen.tsx'
import { template as finanzierungStarten } from './finanzierung-starten.tsx'
import { template as vertragSignatur } from './vertrag-signatur.tsx'
import { template as rechnungBezahltNutzerAnlegen } from './rechnung-bezahlt-nutzer-anlegen.tsx'
import { template as tippgeberPitchToolkit } from './tippgeber-pitch-toolkit.tsx'
import { template as paketUebersicht } from './paket-uebersicht.tsx'
import { template as steuerAuswertung } from './steuer-auswertung.tsx'
import { template as musterVertrag } from './muster-vertrag.tsx'
import { template as aftersalesBeratungSignatur } from './aftersales-beratung-signatur.tsx'
import { template as vpBewertungEinladung } from './vp-bewertung-einladung.tsx'
import { template as googleBewertungEinladung } from './google-bewertung-einladung.tsx'
import { template as googleBewertungErinnerung1 } from './google-bewertung-erinnerung-1.tsx'
import { template as googleBewertungErinnerung2 } from './google-bewertung-erinnerung-2.tsx'
import { template as vertragGegenzeichnungKurz } from './vertrag-gegenzeichnung-kurz.tsx'
import { template as vertragVollstaendigUnterschrieben } from './vertrag-vollstaendig-unterschrieben.tsx'
import { template as zoomMeetingEinladung } from './zoom-meeting-einladung.tsx'
import { template as mahnung } from './mahnung.tsx'
import { template as saAbbrecherReminder } from './sa-abbrecher-reminder.tsx'
import { template as documentReminder } from './document-reminder.tsx'
import { template as selbstauskunftPdf } from './selbstauskunft-pdf.tsx'
import { template as selbstauskunftFormularPdf } from './selbstauskunft-formular-pdf.tsx'
import { template as activationInvite } from './activation-invite.tsx'
import { template as saReminder1 } from './sa-reminder-1.tsx'
import { template as saReminder2 } from './sa-reminder-2.tsx'
import { template as saReminder3 } from './sa-reminder-3.tsx'
import { template as terminErinnerung } from './termin-erinnerung.tsx'
import { template as buchungBestaetigung } from './buchung-bestaetigung.tsx'
import { template as buchungslinkEinladung } from './buchungslink-einladung.tsx'
import { template as buchungBenachrichtigung } from './buchung-benachrichtigung.tsx'
import { template as buchungAbsage } from './buchung-absage.tsx'
import { template as buchungAbsagePartner } from './buchung-absage-partner.tsx'
import { template as buchungVerschoben } from './buchung-verschoben.tsx'
import { template as buchungVerschobenPartner } from './buchung-verschoben-partner.tsx'
import { template as neuerLeadPartner } from './neuer-lead-partner.tsx'
import { template as nichtErreichtMail1 } from './nicht-erreicht-mail-1.tsx'
import { template as handbuchZustellung } from './handbuch-zustellung.tsx'
import { template as selbstauskunftLiegtVor } from './selbstauskunft-liegt-vor.tsx'
import { template as nichtErreichtMail2 } from './nicht-erreicht-mail-2.tsx'
import { template as nichtErreichtMail3 } from './nicht-erreicht-mail-3.tsx'
import { template as leadsZugewiesenSammel } from './leads-zugewiesen-sammel.tsx'
import { template as nachtpruefungBericht } from './nachtpruefung-bericht.tsx'
import { template as tagesbriefing } from './tagesbriefing.tsx'
import { template as weeklyCallPunkte } from './weekly-call-punkte.tsx'
import { template as anlageVAufstellung } from './anlage-v-aufstellung.tsx'
import { template as kundenExpose } from './kunden-expose.tsx'
import { template as bewerberZugangsdaten } from './bewerber-zugangsdaten.tsx'
import { template as bewerberAbsage } from './bewerber-absage.tsx'
import { template as bewerberNeuIntern } from './bewerber-neu-intern.tsx'
import { template as bewerberVertragUnterschriebenIntern } from './bewerber-vertrag-unterschrieben-intern.tsx'
import { template as supportAntwort } from './support-antwort.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'birthday-greeting': birthdayGreeting,
  'birthday-customer': birthdayCustomer,
  'weekly-ceo-summary': weeklyCeoSummary,
  'weekly-vp-summary': weeklyVpSummary,
  'dsgvo-deletion-confirmation': dsgvoDeletionConfirmation,
  'erstgespraech-erinnerung': erstgespraechErinnerung,
  'erstgespraech-erinnerung-24h': erstgespraechErinnerung24h,
  'erstgespraech-erinnerung-6h': erstgespraechErinnerung6h,
  'erstgespraech-erinnerung-1h': erstgespraechErinnerung1h,
  'vermoegensaufbau-lead': vermoegensaufbauLead,
  'sa-invitation': saInvitation,
  'notartermin-geplant': notarterminGeplant,
  'notartermin-auswahl': notarterminAuswahl,
  'kaufvertrag-hochgeladen': kaufvertragHochgeladen,
  'faelligkeit-hochgeladen': faelligkeitHochgeladen,
  'notartermin-benachrichtigung': notarterminBenachrichtigung,
  'chat-nachricht': chatNachricht,
  'unterlagen-pruefung-ergebnis': unterlagenPruefungErgebnis,
  'bonitaet-freigabe': bonitaetFreigabe,
  'selbstauskunft-signatur': selbstauskunftSignatur,
  'selbstauskunft-geaendert': selbstauskunftGeaendert,
  'reservierung-signatur': reservierungSignatur,
  // Nicht eingeplant, Kundenerinnerungen sind seit 15.09.2026 abgeschaltet. Bleibt fuer Historie und Vorschau.
  'reservierung-erinnerung': reservierungErinnerung,
  'unterlagen-eingereicht': unterlagenEingereicht,
  'reservierung-unterschrieben': reservierungUnterschrieben,
  // Die Vertragskopie mit PDF an jeden Kaeufer nach der letzten Unterschrift,
  // verschickt von finalize-reservierung. Seit 15.09.2026.
  'reservierung-kopie': reservierungKopie,
  'selbstauskunft-unterschrieben': selbstauskunftUnterschrieben,
  'notartermin-bestaetigt': notarterminBestaetigt,
  'notartermin-bestaetigung-kunde': notarterminBestaetigungKunde,
  'pipeline-mahnreport': pipelineMahnreport,
  'bug-report': bugReport,
  'setter-lead-bestaetigung': setterLeadBestaetigung,
  // Willkommensmail an den Lead nach der internen Zuweisung, seit 30.09.2026.
  'lead-willkommen': leadWillkommen,
  'setter-daten-falsch': setterDatenFalsch,
  'setter-kein-interesse': setterKeinInteresse,
  'vp-daten-falsch': vpDatenFalsch,
  'vp-kein-interesse': vpKeinInteresse,
  'system-health-alert': systemHealthAlert,
  'notar-aufnahmebogen-erstellt': notarAufnahmebogenErstellt,
  'vertrag-unterschrieben-rechnung': vertragUnterschriebenRechnung,
  'session-anomalie': sessionAnomalie,
  'account-lockout': accountLockout,
  'bewerber-closing-erinnerung': bewerberClosingErinnerung,
  'bewerber-nicht-erreicht': bewerberNichtErreicht,
  'bewerber-erstgespraech-erinnerung': bewerberErstgespraechErinnerung,
  // Die Eingangsmail nach jeder Bewerbung: Hauptknopf ist die Terminbuchung
  // über Calendly, der Fragebogen steht als Textlink darunter. Die
  // Terminbuchung erscheint zusätzlich auf der Bestätigungsseite des Formulars.
  'bewerber-formular-einladung': bewerberFormularEinladung,
  'bewerber-formular-erinnerung': bewerberFormularErinnerung,
  'bewerber-kennenlernen-einladung': bewerberKennenlernenEinladung,
  // Meldung an die HR-Managerin, sobald der Bewerber seinen Termin selbst
  // gebucht, verschoben oder abgesagt hat. Eine Vorlage fuer alle drei
  // Vorgaenge, der Unterschied steckt im Feld `vorgang`.
  'bewerber-termin-hr': bewerberTerminHr,
  // Die zwei Erinnerungen des neuen Bewerberprozesses, Tag 3 und Tag 11.
  // Verschickt von send-bewerber-kennenlernen-erinnerungen. Die letzte schliesst
  // das Verfahren: Sie geht an den Bewerber, und sein Stand wandert dabei auf
  // "Kein Interesse". Bis zum 14.09.2026 bekam an Tag 11 stattdessen HR eine
  // Glocke und eine Mail. Die Erinnerung an Tag 8 (Vorlage "-2") ist am
  // 26.09.2026 entfallen; die Nummern der beiden anderen bleiben.
  'bewerber-kennenlernen-erinnerung-1': bewerberKennenlernenErinnerung1,
  'bewerber-kennenlernen-erinnerung-3': bewerberKennenlernenErinnerung3,
  // Nachricht 3: geht beim Absenden des Kennenlernens hinaus und zeigt dem
  // Bewerber seine eigenen Angaben, geordnet. Verschickt von
  // submit-bewerber-formular. Die letzte Ansicht des Kennenlernens verspricht
  // sie ausdruecklich.
  'bewerber-kennenlernen-zusammenfassung': bewerberKennenlernenZusammenfassung,
  // Die eine Erinnerung an den Termin, etwa drei Tage nach dem Absenden.
  // Verschickt von send-bewerber-kennenlernen-erinnerungen. Sobald gebucht
  // ist, kommt sie nicht mehr, und eine zweite gibt es nicht.
  'bewerber-kennenlernen-buchung-erinnerung': bewerberKennenlernenBuchungErinnerung,
  // Die Bestaetigung an den Bewerber selbst, mit Kalenderdatei im Anhang. Eine
  // Vorlage fuer gebucht, verschoben und abgesagt, der Unterschied steckt im
  // Feld `vorgang`. Gegenstueck zu bewerber-termin-hr.
  'bewerber-termin-bestaetigung': bewerberTerminBestaetigung,
  // Die Einladung zum Kooperationsgespraech. Verschickt aus dem Bewerberprofil,
  // nachdem jemand den eingereichten Kennenlernbogen gelesen hat. Der eine
  // Knopf fuehrt auf die vorhandene Buchungsstrecke, mit dem Token des
  // Kennenlernens; einen zweiten Buchungsweg gibt es nicht.
  'bewerber-kooperationsgespraech-einladung': bewerberKooperationsgespraechEinladung,
  // Der andere Ausgang derselben Entscheidung: die Absage nach dem gelesenen
  // Bogen. Nicht zu verwechseln mit 'bewerber-absage' weiter unten, die von
  // einem gefuehrten Gespraech spricht, das es hier noch nicht gab.
  'bewerber-kennenlernen-absage': bewerberKennenlernenAbsage,
  // Die Erinnerung vor dem Videocall, 24 Stunden und 1 Stunde vorher, mit dem
  // Link zum Videoraum. Verschickt von send-bewerber-erstgespraech-reminders,
  // aber nur an Bewerber des neuen Ablaufs; die anderen bekommen weiterhin
  // bewerber-erstgespraech-erinnerung, die von einem Anruf spricht.
  'bewerber-videocall-erinnerung': bewerberVideocallErinnerung,

  // Die Bitte an die Rolle `hr`, einen Bewerber anzurufen. Verschickt von
  // send-bewerber-kennenlernen-erinnerungen, an Tag 10 (Bogen da, kein Termin)
  // und fuer die Sichtung des abgeschickten Bogens. Die Glocke allein reichte
  // nicht: Wer drei Tage nicht ins CRM sieht, findet sie nie wieder.
  // Fuer den nie geoeffneten Bogen an Tag 11 gilt sie seit dem 14.09.2026
  // nicht mehr, dort geht bewerber-kennenlernen-erinnerung-3 an den Bewerber.
  'bewerber-hr-anruf': bewerberHrAnruf,
  // Einmalige Nachfass-Mail an alle im Eingang, verschickt von
  // send-bewerber-nachfass. Traegt den Abmeldeweg mit Token je Bewerber.
  'bewerber-nachfass-kennenlernen': bewerberNachfassKennenlernen,
  'vertrag-hr-eskalation': vertragHrEskalation,
  'vertrag-erinnerung-1': vertragErinnerung1,
  'vertrag-erinnerung-2': vertragErinnerung2,
  'vertrag-erinnerung-3': vertragErinnerung3,
  'finanzierung-starten': finanzierungStarten,
  'vertrag-signatur': vertragSignatur,
  'rechnung-bezahlt-nutzer-anlegen': rechnungBezahltNutzerAnlegen,
  'paket-uebersicht': paketUebersicht,
  'steuer-auswertung': steuerAuswertung,
  'muster-vertrag': musterVertrag,
  'tippgeber-pitch-toolkit': tippgeberPitchToolkit,
  'aftersales-beratung-signatur': aftersalesBeratungSignatur,
  'vp-bewertung-einladung': vpBewertungEinladung,
  'google-bewertung-einladung': googleBewertungEinladung,
  'google-bewertung-erinnerung-1': googleBewertungErinnerung1,
  'google-bewertung-erinnerung-2': googleBewertungErinnerung2,
  'vertrag-gegenzeichnung-kurz': vertragGegenzeichnungKurz,
  'vertrag-vollstaendig-unterschrieben': vertragVollstaendigUnterschrieben,
  'meeting-aenderung': meetingAenderung,
  'zoom-meeting-einladung': zoomMeetingEinladung,
  'mahnung': mahnung,
  // Nicht eingeplant, Kundenerinnerungen sind seit 15.09.2026 abgeschaltet. Bleibt fuer Historie und Vorschau.
  'sa-abbrecher-reminder': saAbbrecherReminder,
  'document-reminder': documentReminder,
  'selbstauskunft-pdf': selbstauskunftPdf,
  'selbstauskunft-formular-pdf': selbstauskunftFormularPdf,
  'activation-invite': activationInvite,
  // Nicht eingeplant, Kundenerinnerungen sind seit 15.09.2026 abgeschaltet. Bleiben fuer Historie und Vorschau.
  'sa-reminder-1': saReminder1,
  'sa-reminder-2': saReminder2,
  'sa-reminder-3': saReminder3,
  'termin-erinnerung': terminErinnerung,
  'buchung-bestaetigung': buchungBestaetigung,
  'buchungslink-einladung': buchungslinkEinladung,
  'buchung-benachrichtigung': buchungBenachrichtigung,
  'buchung-absage': buchungAbsage,
  'buchung-absage-partner': buchungAbsagePartner,
  'buchung-verschoben': buchungVerschoben,
  'buchung-verschoben-partner': buchungVerschobenPartner,
  'neuer-lead-partner': neuerLeadPartner,
  // Die drei Mails an einen nicht erreichten Lead, nach dem 1., 4. und 10.
  // verpassten Anruf. Absender ist der zustaendige Partner. Seit 26.09.2026,
  // sie ersetzen die frueheren Einzelmails bei jedem Versuch.
  // Das persoenliche Immobilienhandbuch der Handbuch-Seite, seit dem
  // 26.09.2026. Die einzige automatische Mail an einen Lead, er hat sie
  // angefordert. Verschickt von _shared/handbuch-anlage.ts.
  'handbuch-zustellung': handbuchZustellung,
  // Offene Selbstauskunft der Handbuch-Seite, wenn die Selbstauskunft schon
  // unterschrieben vorliegt (HB-009). Verschickt von _shared/handbuch-anlage.ts.
  'selbstauskunft-liegt-vor': selbstauskunftLiegtVor,
  'nicht-erreicht-mail-1': nichtErreichtMail1,
  'nicht-erreicht-mail-2': nichtErreichtMail2,
  'nicht-erreicht-mail-3': nichtErreichtMail3,
  'leads-zugewiesen-sammel': leadsZugewiesenSammel,
  'nachtpruefung-bericht': nachtpruefungBericht,
  // Das Tagesbriefing der Geschaeftsleitung, werktags um 8 Uhr.
  'tagesbriefing': tagesbriefing,
  'weekly-call-punkte': weeklyCallPunkte,
  'anlage-v-aufstellung': anlageVAufstellung,
  // Das persoenliche Exposé an den Kunden, aus send-kunden-expose.
  'kunden-expose': kundenExpose,
  'bewerber-zugangsdaten': bewerberZugangsdaten,
  'bewerber-absage': bewerberAbsage,
  // Interne Meldungen an die HR-Rolle, nicht an den Bewerber.
  'bewerber-neu-intern': bewerberNeuIntern,
  'bewerber-vertrag-unterschrieben-intern': bewerberVertragUnterschriebenIntern,
  // Meldung an den Ersteller eines Support-Tickets, seit 28.09.2026. Verschickt
  // von support-antwort-mail, hoechstens einmal je Ticket in 15 Minuten.
  'support-antwort': supportAntwort,
}
