// Bewerbungsmanagement Store – DB-backed via dataCache
import { cacheGet, cacheInsert, cacheUpdate, cacheDelete } from "./dataCache";
import { isTestAccount, localGet, localSet } from "./dbStoreHelper";
import type { AssessmentAntworten } from "./assessmentSkript";
import type { ClosingDirektDaten } from "./closingDirektSkript";
// Nur der Typ, damit kein Ringschluss entsteht: `bewerberVideocall.ts` liest
// über `vertragKonditionen.ts` seinerseits aus dieser Datei.
import type { VideocallErfassung as BewerberVideocallErfassung } from "./bewerberVideocall";
import { jetztAlsIsoDatum } from "./datumsformate";

export type BewerberStatus =
  | "Eingang"
  | "Erstgespraech"
  | "Closing"
  | "FollowUp"
  | "Bedenkzeit"
  | "Paketwahl"
  | "Vertrag"
  | "Rechnung"
  | "Nutzer_anlegen"
  | "Aktiv"
  | "KeinInteresse"
  | "Abgelehnt";

export const PIPELINE_STUFEN: BewerberStatus[] = [
  "Eingang", "Erstgespraech", "Closing", "FollowUp", "Bedenkzeit", "Paketwahl",
  "Vertrag", "Rechnung", "Nutzer_anlegen", "Aktiv",
];

export const STATUS_LABELS: Record<BewerberStatus, string> = {
  "Eingang": "Eingang",
  "Erstgespraech": "Erstgespräch",
  "Closing": "Closing",
  "FollowUp": "Follow-Up",
  "Bedenkzeit": "Bedenkzeit",
  "Paketwahl": "Paketwahl",
  "Vertrag": "Vertrag",
  "Rechnung": "Rechnung",
  "Nutzer_anlegen": "Nutzer anlegen",
  "Aktiv": "Aktiv",
  "KeinInteresse": "Kein Interesse",
  "Abgelehnt": "Abgelehnt",
};

/** Status-Werte, die als „rejected" gelten (kein aktiver Prozess mehr). */
export const REJECTED_STATUSES: BewerberStatus[] = ["KeinInteresse", "Abgelehnt"];
export function isRejectedStatus(s: BewerberStatus | string | undefined | null): boolean {
  return s === "KeinInteresse" || s === "Abgelehnt";
}

// Migration: alte Status-Werte auf neuen Funnel mappen
const STATUS_MIGRATION: Record<string, BewerberStatus> = {
  "Screening": "Erstgespraech",
  "16P-Test": "Erstgespraech",
  "Interview": "Closing",
  "Entscheidung": "Paketwahl",
  "Kooperationsgespraech": "Closing",
  "Nutzeranlage": "Nutzer_anlegen",
  "Onboarding": "Nutzer_anlegen",
  "Academy": "Nutzer_anlegen",
  // Legacy „Zurückgezogen" → wird auf „Abgelehnt" gemappt
  "Zurueckgezogen": "Abgelehnt",
  "Zurückgezogen": "Abgelehnt",
};

/**
 * Bildet einen gespeicherten Statuswert auf den heutigen Funnel ab.
 *
 * Exportiert, weil nicht nur `bewerberFromDb` die Umschreibung braucht: Wer
 * roh aus dem Zwischenspeicher liest, etwa die Bewerberauswertung in der
 * Statistik, muss dieselbe Zuordnung benutzen. Sonst landet ein Altbestand
 * dort im Auffangwert "Eingang", während er im Bewerbermanagement in der
 * richtigen Stufe steht.
 */
export function migrateStatus(s: string): BewerberStatus {
  if (STATUS_MIGRATION[s]) return STATUS_MIGRATION[s];
  if (PIPELINE_STUFEN.includes(s as BewerberStatus) || s === "Abgelehnt" || s === "KeinInteresse") {
    return s as BewerberStatus;
  }
  return "Eingang";
}

export type BewerberDokument = {
  id: string; name: string; typ: string; status: "hochgeladen" | "in_pruefung" | "freigegeben" | "abgelehnt"; datum: string; url?: string;
};

export type BewerberNotiz = { id: string; text: string; datum: string; autor: string; autorId: string; };

/**
 * Ergebnis eines Telefon-Kontaktversuchs.
 *
 * „erreicht" ist seit dem 17.09.2026 dabei. Bis dahin liess sich nur
 * festhalten, dass jemand **nicht** ans Telefon ging, und ein geglücktes
 * Gespräch stand nirgends. Genau das hat in der Akte gefehlt: Wer die Liste
 * las, sah fünf erfolglose Versuche und wusste nicht, ob dazwischen einmal
 * jemand drangegangen war.
 */
export type KontaktversuchErgebnis = "nicht_erreicht" | "erreicht" | "kein_interesse" | "closing_gebucht";

/** Ein Eintrag pro Kontaktversuch (max. 5) */
export type Kontaktversuch = {
  id: string;
  versuch: number; // 1..5
  datum: string;   // ISO
  ergebnis: KontaktversuchErgebnis;
  von: string;     // Name des Beraters
  emailGesendet?: boolean;
};

export type VertragStatus = "nicht_gesendet" | "gesendet" | "wartet_auf_kurz" | "unterschrieben" | "abgelehnt";
export type StatusNotification = { id: string; typ: "status" | "termin" | "vertrag" | "dokument"; titel: string; nachricht: string; datum: string; gelesen: boolean; };

/**
 * Strukturierte Antworten aus dem Erstgesprächs-Skript. Wird im HR-Profil
 * Schritt für Schritt befüllt und dient Closing-Berater + Vertrieb als
 * Briefing.
 */
export type ErstgespraechSkript = {
  ausgangslage: string;       // aktuelle Situation
  ziele: string;              // konkrete Ziele 1-3 Jahre
  motivation: string;         // warum MOREImmo
  vorErfahrung: string;       // bisherige Vertriebs-/Immo-Erfahrung
  einwand: string;            // Bedenken / offene Fragen
  budget: string;             // verfügbares Investment für die Lizenz
  naechsterSchritt: string;   // vereinbarter nächster Schritt
  durchgefuehrtAm: string;    // Datum des Erstgesprächs (ISO oder dd.mm.yyyy)
  durchgefuehrtVon: string;   // Name des Beraters
  /** Freie Notizen zur Ausgangslage (Punkt 2) */
  ausgangslageNotiz?: string;
  /** Freie Notizen zum Vorstellungs-/Vorteilsblock (Punkt 7) */
  vorteileNotiz?: string;
  /** KI-generierte Kurz-Zusammenfassung nach Abschluss des Erstgesprächs */
  zusammenfassung?: string;
  /** Zeitstempel (ISO), wann die Zusammenfassung erzeugt wurde */
  zusammenfassungAm?: string;
  /** Pflicht-Grund, wenn der Bewerber im Erstgespräch direkt abgelehnt wird */
  absageGrund?: string;
  /** Zeitstempel (ISO), wann der Bewerber im Erstgespräch abgelehnt wurde */
  abgelehntAm?: string;
  /** Name des Beraters, der den Bewerber abgelehnt hat */
  abgelehntVon?: string;
  /**
   * Strukturierte Antworten des Assessment-Skripts (Stationen 0 bis 9,
   * siehe assessmentSkript.ts). Die alten Felder oben bleiben für
   * Bestandsbewerber erhalten und werden im neuen Skript als Vorbelegung
   * gelesen, wo die Bedeutung passt.
   */
  assessment?: AssessmentAntworten;
  /**
   * Teil 2 des Erstgesprächs: „Closing direkt anschließen" (Schalter,
   * Abhak-Stand und reine Gesprächsnotizen, siehe closingDirektSkript.ts).
   * Entscheidung, Paketwahl und Adressen liegen bewusst NICHT hier, sondern
   * in denselben Bewerber-Feldern wie beim ClosingTab.
   */
  closingDirekt?: ClosingDirektDaten;
  /**
   * Der Gesprächsstand des Videocalls aus dem neuen Bewerberprozess
   * (siehe `bewerberVideocall.ts`): zugeschaltete Module, geklärte und
   * nachzureichende Punkte, arbeitsbezogene Beobachtungen und Absprachen.
   *
   * Bewusst hier und nicht in einer eigenen Tabelle: Der neue Ablauf soll
   * ohne Migration laufen und am bestehenden Erstgespräch nichts verstellen.
   * Für Bewerber im bestehenden Ablauf bleibt das Feld leer.
   */
  bewerberVideocall?: BewerberVideocallErfassung;
};

/** Einzelner Eintrag in Onboarding-/Academy-Checkliste */
export type AktivierungsCheck = {
  id: string;
  label: string;
  done: boolean;
  doneAt: string; // ISO
  doneBy: string; // Name
};

export type Bewerber = {
  id: string; vorname: string; nachname: string; email: string; telefon: string; ort: string; quelle: string;
  beworben: string; stelleId: string; stelleTitel: string; status: BewerberStatus; bewertung: number;
  erstelltAm: string;
  typ: string; typLabel: string; typBeschreibung: string; typEignung: string; erfahrung: string;
  motivation: string; notizen: string; ziele: string; beschaeftigungsart: string; onboardingTerminId: string;
  lebenslaufUrl: string; dokumente: BewerberDokument[]; vertragStatus: VertragStatus; vertragDatum: string;
  benachrichtigungen: StatusNotification[]; chatVerknuepft: boolean;
  ausgangslage: string; zielBest: string; wieStarten: string;
  notizenLog: BewerberNotiz[];
  adresse: string;
  /** Zusätzliche Bewerbungsfragen aus Meta-Lead-Ads (über Zapier) */
  vertriebserfahrung?: string;
  vertriebsbereich?: string;
  immobilienErfahrung?: string;
  monatlichesEinkommen?: string;
  stundenProWoche?: string;
  aktuelleSituation?: string;
  alter?: string;
  /** Erstversand-Zeitstempel der Vertragsunterlagen (ISO) – wird beim ersten Versand gesetzt und NICHT überschrieben. */
  vertragErstVersandAt?: string;
  /** ISO-Zeitstempel aller späteren Erinnerungs-Versände (ohne Erstversand). */
  vertragErinnerungenAt?: string[];
  /**
   * Anschrift, die im Handelsvertretervertrag als Anschrift des
   * Vertriebspartners steht. Bewusst getrennt von der Rechnungsadresse:
   * Die darf ein Firmensitz sein, der Vertrag braucht aber die Anschrift
   * der Person, die ihn unterschreibt. Ist sie leer, faellt der
   * Vertragsgenerator auf die Rechnungsadresse zurueck.
   */
  vertragsAdresse?: string;
  /** Separate Rechnungsadresse (falls abweichend von Privatadresse) – im Closing erfragt */
  rechnungsAdresse: string;
  /** Closing-Termin Datum (TT.MM.JJJJ) – im Erstgespräch vereinbart */
  closingTerminDatum: string;
  /** Closing-Termin Uhrzeit (HH:MM) – im Erstgespräch vereinbart */
  closingTerminUhrzeit: string;
  /**
   * Der Bewerber hat sich den Closing-Termin selbst über den Buchungskalender
   * gebucht (Haken in der Übersichts-Karte). Nur dieser Weg löst dort den
   * automatischen Status-Sprung auf "Closing" aus; der normale Weg über
   * Punkt 10 des Erstgesprächsskripts bleibt davon unberührt.
   */
  closingTerminSelbstGebucht?: boolean;
  /** Name des Beraters, der das Closing hält – von `send-bewerber-closing-reminders` in die Erinnerungsmail übernommen */
  closingBeraterName?: string;
  /** E-Mail des Closing-Beraters – Absenderangabe in der Erinnerungsmail */
  closingBeraterEmail?: string;
  /** Telefonnummer des Closing-Beraters – optional in der Erinnerungsmail */
  closingBeraterTelefon?: string;
  /**
   * Welche Closing-Erinnerungen bereits versandt wurden ("48h" | "6h" | "1h").
   * Gepflegt wird die Liste von `send-bewerber-closing-reminders`. Die Oberfläche
   * setzt sie nur zurück, wenn ein Termin verschoben wurde, damit die Erinnerungen
   * für den neuen Termin erneut greifen.
   */
  closingRemindersSent?: string[];
  /** Telefonische Kontaktversuche (max. 5) */
  kontaktversuche?: Kontaktversuch[];
  /** ISO-Zeitstempel: Bewerber wird bis dahin aus der „Eingang"-Pipeline-Ansicht ausgeblendet (z. B. nach „Nicht erreicht" für 24h). */
  eingangHiddenUntil?: string;
  /** WhatsApp-Erstkontakt erfolgt? (manuell abgehakt im Bewerber-Detail) */
  whatsappAngeschrieben?: boolean;
  /** Erstgespräch Termin Datum (TT.MM.JJJJ) – manuell eingetragen */
  erstgespraechDatum?: string;
  /** Erstgespräch Termin Uhrzeit (HH:MM) */
  erstgespraechUhrzeit?: string;
  /** Name des Beraters, der das Erstgespräch hält */
  erstgespraechBerater?: string;
  /**
   * Woher Datum und Uhrzeit stammen. „bewerber", wenn der Bewerber sie nach
   * seiner Buchung auf `/kennenlerngespraech/:token` selbst bestätigt hat,
   * sonst leer, dann hat jemand im CRM sie von Hand eingetragen.
   *
   * Der Unterschied zählt: Eine vom Bewerber getippte Zeit ist nicht dasselbe
   * wie eine bestätigte Buchung, und bei einem Vertipper will man wissen,
   * woher die Zahl kam.
   */
  erstgespraechQuelle?: string;
  /** ISO-Zeitstempel der Selbstbestätigung, falls es eine gab. */
  erstgespraechBestaetigtAm?: string;
  /** Im Closing geäußerte Entscheidung: "ja" = will starten, "nein" = zurückgezogen */
  /**
   * Ergebnis des Closing-Gesprächs.
   *
   * "bedenkzeit" ist bewusst ein eigener Wert und nicht bloß eine fehlende
   * Entscheidung: Das häufigste reale Ergebnis eines Closings ist weder Ja noch
   * Nein. Ohne diesen Zustand blieb der Bewerber unsichtbar im Status Closing
   * liegen, bis ihn zufällig jemand wiederfand.
   */
  closingEntscheidung?: "" | "ja" | "nein" | "bedenkzeit";
  /** Vereinbarter Rückruftermin bei Bedenkzeit (TT.MM.JJJJ). Pflicht bei der Wahl. */
  bedenkzeitRueckrufAm?: string;
  /** Woran der Bewerber seine Entscheidung festmacht. */
  bedenkzeitGrund?: string;
  /**
   * Follow-up zum Rückruf bei Bedenkzeit (Karte Entscheidung im Reiter
   * Closing): Uhrzeit (HH:MM), Kanal, Vorlauf der Erinnerung in Tagen und
   * die Vorbereitung. Bedenkzeit und Follow-Up bleiben getrennte Status,
   * deshalb liegen diese Angaben nicht in den followUp-Feldern. Die
   * Erinnerung erscheint über bewerberErinnerungen.ts in der Inbox.
   */
  bedenkzeitRueckrufUhrzeit?: string;
  bedenkzeitKanal?: string;
  bedenkzeitErinnerungTage?: number;
  bedenkzeitVorbereitung?: string;
  /** Begründung, falls Interessent im Closing nicht starten möchte */
  closingAbgelehntGrund?: string;
  /** Strukturiertes Erstgesprächs-Skript */
  erstgespraechSkript: ErstgespraechSkript;
  /** Optionaler manueller Follow-Up-Termin (TT.MM.JJJJ) – wird in der Inbox am Fälligkeitstag angezeigt */
  followUpDatum?: string;
  /** Optionale Uhrzeit zum Follow-Up (HH:MM) */
  followUpUhrzeit?: string;
  /** Optionale Notiz zum Follow-Up – wird in der Inbox am Fälligkeitstag angezeigt */
  followUpNotiz?: string;
  /** Gewähltes Grundgebühr-Paket (junior | lead | team_builder | enterprise) */
  paketwahl: string;
  /** Zahlungsweise (einmal | raten_2) */
  zahlungsweise: string;
  /** Nur Paket "tippgeber": Provisionsmodell (Fest / Prozentual). */
  tippgeberProvisionsModell?: "euro" | "prozent";
  /** Nur Paket "tippgeber": Höhe der Provision als Freitext (z.B. "500" oder "1,5"). */
  tippgeberProvisionsBetrag?: string;
  /**
   * Individuell im Closing vereinbarte Provisionssätze für Pakete
   * Lead Partner / Team Lead / Lizenzpartner. Werden im Vertrag & in den
   * Anlagen berücksichtigt und bei Aktivierung als Custom-Sätze in die
   * Nutzerverwaltung übernommen (custom_provision_rate / _setter / _eigen).
   * Alle Werte optional als String, damit leere Felder unterschieden werden können.
   */
  satzIndividuell?: string;
  satzLead?: string;
  satzEigen?: string;
  /**
   * Optional differenzierte Sätze nach Objektart (z. B. für Karim & Fouzi Bendjamaa):
   * - satzBestand: bei Bestandsobjekten
   * - satzNeubau: bei Neubauprojekten
   * Werden nur berücksichtigt, wenn kein `satzIndividuell` gesetzt ist.
   * Ergänzen (nicht ersetzen) den optionalen `satzLead` (Leads über MOREImmo).
   */
  satzBestand?: string;
  satzNeubau?: string;
  /** Generierter Vertrag (PDF in Storage) */
  vertragPdfUrl: string;
  /** Manuell/extern erzeugter Individual-Vertrag (überspringt Standard-Generator) */
  vertragIndividuell?: boolean;
  /** Zeitstempel (ISO), wann im Closing „Paket bestätigen & Vertrag erstellen" geklickt wurde */
  paketBestaetigtAm?: string;
  /** Vom Bewerber unterschriebener Vertrag (PDF in Storage) */
  vertragSignedPdfUrl: string;
  /** Datum, an dem unterschriebene Version hochgeladen wurde */
  vertragSignedAt: string;
  /**
   * Wann der BEWERBER unterschrieben hat.
   *
   * Nicht zu verwechseln mit `vertragSignedAt`: Das steht erst, wenn auch
   * Christian Kurz gegengezeichnet hat. Dazwischen liegt der Zustand
   * `vertragStatus = "wartet_auf_kurz"`, und genau den zeigt die Liste in der
   * Stufe Vertrag an.
   *
   * Wird ausschliesslich serverseitig geschrieben (finalize-vertrag), deshalb
   * steht es hier nur beim Lesen und bewusst NICHT in `bewerberToDb`: Das baut
   * `meta` aus den bekannten Feldern neu auf, und ein leerer Wert wuerde den
   * echten ueberschreiben.
   */
  vertragBewerberSignedAt?: string;
  /** HR-Mitarbeiter, der den Vertrag erstellt hat */
  vertragHrName: string;
  /** Version des Vertrags (für Audit) */
  vertragVersion: number;
  /** Rechnungsnummer (z.B. LIZ-2026-0001) */
  rechnungNr: string;
  /** URL zur Rechnungs-PDF im Storage */
  rechnungPdfUrl: string;
  /** Datum der Rechnungserstellung (ISO) */
  rechnungErstelltAm: string;
  /** Bestätigungen "bezahlt" (Christian Peetz & Christian Kurz) */
  rechnungBezahltBestaetigungen: { name: string; userId: string; datum: string }[];
  /** Datum, an dem beide Bestätigungen vorlagen */
  rechnungBezahltAm: string;
  /** Lexoffice-Belegnummer (manuell eingetragen beim Versand) */
  rechnungLexBelegNr?: string;
  /** Tatsächliches Zahlungseingangsdatum (laut Lexoffice/Bank) */
  rechnungZahlungsdatum?: string;
  /** Fälligkeitsdatum (Erstellt + 14 Tage), wird beim Erstellen gesetzt */
  rechnungFaelligAm?: string;
  /** Zeitstempel, wann 14-Tage-Mahn-Erinnerung an HR ausgelöst wurde */
  rechnungMahnung14Am?: string;
  /** Zeitstempel, wann 21-Tage-Mahn-Erinnerung an HR ausgelöst wurde */
  rechnungMahnung21Am?: string;
  /** Bestätigt, dass die Rechnung im externen Buchhaltungsprogramm (Lexoffice) erstellt & versendet wurde */
  rechnungExternErstelltVersendet?: boolean;
  /** Zeitstempel der Bestätigung des externen Rechnungsversands */
  rechnungExternErstelltVersendetAm?: string;
  /** Rechnung wurde manuell übersprungen (kein interner Rechnungsversand nötig). */
  rechnungUebersprungen?: boolean;
  /** Zeitstempel des Skip-Klicks (ISO). */
  rechnungUebersprungenAm?: string;
  /** Optionaler Grund/Notiz für das Überspringen der Rechnung. */
  rechnungUebersprungenGrund?: string;
  /** Bereits abgehakte Erinnerungs-Meilensteine (Tage nach Skip: 3/7/14/28). */
  rechnungUebersprungenErinnerungenErledigt?: number[];
  /** Auth-User-ID des angelegten Nutzers (nach invite-user) */
  userAccountId: string;
  /** Datum der Invite-Versand (ISO) */
  userInviteSentAt: string;
  /** Zugeordnete Karrierestufe (abgeleitet aus Paketwahl, editierbar) */
  karriereStufe: string;
  /** Onboarding-Checkliste (manuelle Schritte) */
  onboardingChecklist: AktivierungsCheck[];
  /** Academy-Pflichtmodule pro Lizenz */
  academyPflichtModule: AktivierungsCheck[];
  /** Datum der finalen Aktiv-Schaltung (ISO) */
  aktivAm: string;
  /** Gebuchter Onboarding-Termin mit Christian Peetz (TT.MM.JJJJ) */
  onboardingTerminDatum?: string;
  /** Uhrzeit des gebuchten Onboarding-Termins (HH:MM) */
  onboardingTerminUhrzeit?: string;
  /**
   * Bestaetigung, dass der Termin ueber den Buchungskalender eingebucht
   * wurde und nicht nur hier eingetragen ist. Nur dann steht er auch in
   * Christian Peetz' Kalender.
   */
  onboardingTerminGebucht?: boolean;
  /** Persönliche @more.immo-Adresse des Partners (das Passwort wird bewusst NICHT gespeichert) */
  persoenlicheEmail?: string;
  /** ISO-Zeitstempel des letzten Zugangsdaten-Mailversands */
  zugangsdatenGesendetAm?: string;
  /** Private Zieladresse, an die die Zugangsdaten geschickt wurden */
  zugangsdatenGesendetAn?: string;
  /** Gewaehlte Nutzerrolle fuer den Community-Spickzettel (siehe communityGruppen.ts) */
  communityRolle?: string;
  /** Onboarding-Schritte nach bezahlter Rechnung (siehe aktivierungOnboardingSchritte.ts) */
  aktivierungOnboarding?: Record<
    string,
    { done: boolean; doneAt?: string; doneBy?: string; notiz?: string }
  >;
  /** Recruiter-Beziehung: User-ID des werbenden Team Leads / Lizenzpartner */
  geworbenVonUserId: string;
  /** Anzeigename des Recruiters (für UI ohne Lookup) */
  geworbenVonName: string;
  /** ISO-Zeitstempel des letzten Paketübersicht-Mailversands */
  paketUebersichtSentAt?: string;
  /** Versandhistorie der anonymisierten Musterverträge */
  musterVertraegeSentAt?: { paket: string; paketTitel: string; at: string }[];
  /**
   * Aktiviert die individuelle § 10-Fassung (kein allgemeines
   * Wettbewerbsverbot, dafür verschärfter Kunden- & Partnerschutz) und fügt
   * Anlage 8 mit den erklärten Tätigkeiten für andere Vertriebe hinzu.
   * Bei false / undefined bleibt der Standardvertrag wie bei allen anderen.
   */
  individuelleVertragsFassung?: boolean;
  /**
   * Frühere Positivliste (vor Vertragsbeginn selbst betreute Kontakte).
   * Seit 30.08.2026 ersatzlos entfallen: Die Ausnahme für Bestandskunden
   * steht jetzt abstrakt mit Beweislast beim Partner in § 10 (2). Das Feld
   * bleibt nur für Altbestände lesbar, wird aber nicht mehr erfasst oder
   * gedruckt.
   */
  mitgebrachteKontakte?: string;
  /**
   * Erklärte Tätigkeiten für andere Vertriebe bei Vertragsbeginn, eine je
   * Zeile. Wird bei individueller § 10-Fassung in Anlage 8 eingedruckt.
   * Leer bedeutet: der Vertrag druckt "keine".
   */
  andereVertriebe?: string;
  /**
   * Altwert. Bis zum 06.09.2026 der Closing-Schalter, mit dem ein
   * Vertriebspartner ohne die monatliche CRM-Systemgebühr beziehungsweise
   * ohne die Servicevereinbarung geführt wurde. Seit dem 07.09.2026 gibt es
   * kein laufendes Entgelt mehr, der Schalter ist aus der Oberfläche
   * verschwunden. Das Feld bleibt lesbar, weil der Konditionen-Stempel und
   * die Altfassung des Vertrags es weiter führen; für neue Verträge ist es
   * ohne Wirkung.
   */
  ohneCrmGebuehr?: boolean;
  /**
   * Einzelkauf von Leads freigeschaltet (Closing-Schalter, Standard aus).
   *
   * Regulär gibt es im Closing nur "kein Leadpaket" oder das Leadpaket zu
   * 2.500 Euro. Nur wo dieser Schalter gesetzt ist, weist der Vertrag
   * zusätzlich den Einzelkauf einzelner Leads aus. Er greift ausschließlich
   * ohne gebuchtes Leadpaket; beides zusammen ergäbe im Text einen
   * Widerspruch.
   *
   * Liegt wie alle Vertragsschalter in der JSON-Spalte `meta`, deshalb ist
   * dafür keine Datenbankmigration nötig.
   */
  leadEinzelkauf?: boolean;
  /**
   * Altwert. Individuell vereinbart (z. B. Phillip Pintat): Vertrag läuft auf
   * unbestimmte Zeit ohne Mindestlaufzeit, monatlich kündbar mit einem Monat
   * Frist zum Monatsende. Wirkt nur in der Altfassung (§ 14 des langen
   * Hauptvertrages); die kompakte Fassung hat seit dem 07.09.2026 nirgends
   * eine Mindestlaufzeit, der Schalter ist aus der Oberfläche verschwunden.
   */
  laufzeitOffen?: boolean;
  /**
   * Konditionen-Stempel der zuletzt erzeugten Vertragsfassung (JSON aus
   * vertragsKonditionenStempel). Weicht der aktuelle Stempel ab, warnt der
   * Vertrags-Tab, dass das hinterlegte PDF neu generiert werden muss.
   */
  vertragKonditionenStand?: string;
  /**
   * Kennzeichen der Textfassung des zuletzt erzeugten Vertrags (Wert von
   * VERTRAGS_FASSUNG in vertragKlauseln.ts). Bestandspartner ohne Wert haben
   * eine ältere Fassung unterschrieben; ihre PDFs bleiben unverändert.
   * Vorbereitet, wird noch von keiner Oberfläche geschrieben.
   */
  vertragFassung?: string;
  /**
   * Die tatsaechlich unterschriebene Fassung (seit 27.09.2026). Digital
   * schreibt sie `finalize-vertrag` bei der Gegenzeichnung aus der
   * unterschriebenen Anfrage, beim Hochladen eines unterschriebenen PDFs der
   * VertragsTab. Anders als `vertragFassung` (Entwurf) aendert sie sich nicht
   * mit einem neuen Entwurf; die Freigabe des Meta Pixels (Anlage 4) liest sie.
   */
  vertragUnterschrieben?: {
    fassung: string;
    quelle?: "digital" | "upload";
    requestId?: string;
    gegenzeichnungRequestId?: string;
    bewerberAm?: string;
    gegenzeichnungAm?: string;
  };
  /**
   * Optional gebuchtes Leadpaket (neues Leadmodell, Standard 2.500 € netto
   * für 20 Leads, siehe LEAD_PAKET_* in lizenzPakete.ts). Ist das Feld
   * gesetzt, erzeugt der Vertragsgenerator zusätzlich die
   * Leadpaket-Vereinbarung (Anlage 9). Die Pflege-UI folgt in Etappe 3.
   */
  leadPaket?: { betrag: number; anzahl: number };
  /**
   * Zeitpunkt (ISO), zu dem die einmalige Nachfass-Mail aus dem Eingang an
   * diesen Bewerber ging. Gesetzt von `send-bewerber-nachfass`; wer den Wert
   * trägt, wird bei einem weiteren Lauf übersprungen.
   *
   * Dieses und die beiden folgenden Felder schreibt nur der Server. Das CRM
   * liest sie aus meta, `bewerberToDb` lässt sie bewusst aus (siehe dort).
   */
  nachfassMailAm?: string;
  /**
   * Dasselbe für die Sammelmail zum Kennenlernen, die seit dem 12.09.2026
   * gilt. Sie führt zum Kennenlernbogen, die ältere führte zur
   * Terminbuchung. Beide Merker stehen bewusst nebeneinander: Wer die alte
   * Welle bekam, hat die neue deshalb noch nicht, und ohne zweiten Merker
   * bekäme fast niemand die neue Mail.
   */
  klNachfassMailAm?: string;
  /**
   * Der Bewerber hat sich über den Link „Kein Interesse mehr" aus der
   * Nachfass-Mail selbst abgemeldet (ISO-Zeitpunkt). Geschrieben von
   * `bewerber-kein-interesse`, zusammen mit dem Status KeinInteresse.
   */
  selbstAbgemeldetAm?: string;
  /** Das freiwillige Feld „Magst du uns kurz sagen, warum?" bei der Abmeldung. */
  selbstAbgemeldetGrund?: string;
  /**
   * Wann die Einladung zum Kennenlernen des neuen Bewerberprozesses hinausging
   * (ISO-Zeitpunkt). Geschrieben von `send-bewerber-kennenlernen`.
   *
   * Zwei Aufgaben. Erstens erkennt der Bereich `/bewerberprozess` daran, wer im
   * neuen Ablauf läuft, ohne dass eine Spalte dazukommen muss. Zweitens ist der
   * Versand damit belegbar: Das Versandprotokoll wird nach 14 Tagen gelöscht,
   * und wenn ein Bewerber nach drei Wochen sagt, er habe nie eine Mail
   * bekommen, gibt es sonst nichts vorzulegen.
   *
   * Wird wie die drei Felder darüber nur vom Server geschrieben.
   */
  kennenlernenGesendetAm?: string;
  /**
   * Ob die Eingangsmail wirklich hinausging. `undefined` heißt: unbekannt,
   * die Zeile stammt aus der Zeit vor dem Kennzeichen.
   *
   * Wichtig, weil `kennenlernenGesendetAm` allein nichts beweist: Der Server
   * setzt es auch nach einem gescheiterten Versand. Aus `meta.kennenlernen.
   * versandOk`, siehe `versandErgebnisAus`.
   */
  kennenlernenVersandOk?: boolean;
  /** Wer die Eingangsmail zuletzt von Hand verschickt hat. Aus `meta.kennenlernen.gesendetVon`. */
  kennenlernenGesendetVon?: string;
  /** Wie oft die Eingangsmail nach dem ersten Mal noch einmal hinausging. Aus `meta.kennenlernen.erneutGesendet`. */
  kennenlernenErneutGesendet?: number;
  /** Wann der Versandversuch war, ISO. Nötig, um einen alten Fehlschlag von einem neuen Erfolg zu trennen. */
  kennenlernenVersandAm?: string;
  /** Warum es schiefging, in einem Satz. Etwa „Adresse steht auf der Sperrliste". */
  kennenlernenVersandGrund?: string;
  /**
   * In welchem Ablauf dieser Bewerber läuft. Leer heißt: im bestehenden
   * Bewerbermanagement, und das gilt für jeden, der nichts anderes trägt.
   *
   * Beide Bereiche lesen dieselbe Tabelle. Ohne dieses Feld sähe der neue
   * Bereich alle heutigen Bewerber, und ein dort angelegter Übungsbewerber
   * stünde in der Liste der HR-Managerin. Erklärung und Umzug stehen in
   * `bewerberprozessZuordnung.ts`.
   */
  prozess?: string;
  /**
   * Angaben von der öffentlichen Seite „Partner werden“, geschrieben allein
   * von `submit-partner-werden` und hier nur gelesen. Darum fehlt das Feld in
   * `bewerberToDb` mit Absicht: Unbekannte Schlüssel bleiben beim Speichern
   * erhalten. Wer es trägt, bekommt keine Automatik (keine Nachfass-Mail).
   */
  partnerWerden?: PartnerWerdenAngaben;
  /**
   * Wie weit die Erinnerungskette des Kennenlernens gelaufen ist: 0 heißt
   * nichts verschickt, 3 heißt die Meldung an die Personalabteilung ist
   * heraus. Geschrieben allein vom Zeitplan, hier nur gelesen.
   *
   * Ohne dieses Feld zeigte der Bereich nach dem ersten automatischen Versand
   * weiter „Tag 3 fällig“, weil die Tage ja tatsächlich vergangen sind.
   */
  kennenlernenErinnerungStufe?: 0 | 1 | 2 | 3;
  /**
   * Der Bewerber hat gebeten, nicht angerufen zu werden. Aus
   * `meta.kennenlernen.anrufWidersprochen`, geschrieben von `bewerber-seite`.
   *
   * Heißt ausdrücklich „interessiert, aber bitte kein Anruf". Die dritte
   * Erinnerung bekommt er deshalb, den Stand „Kein Interesse" aber nicht: Das
   * wäre das Gegenteil dessen, was er gesagt hat. Sein Fall bleibt offen und
   * wird in der Liste als „wartet auf Entscheidung" ausgewiesen.
   */
  kennenlernenAnrufWidersprochen?: boolean;
  /** Wann der Bewerber selbst pausiert hat, ISO. Aus `meta.kennenlernen.pause.gesetztAm`. */
  kennenlernenPauseGesetztAm?: string;
  /**
   * Der Tag, an den er sich selbst erinnern lassen wollte, ISO. Leer heißt
   * „ich melde mich selbst", und eine solche Pause endet nicht von allein.
   */
  kennenlernenPauseErinnerungAm?: string;
};

export type StellenStatus = "Veröffentlicht" | "Entwurf" | "Besetzt" | "Geschlossen";
export type Stelle = { id: string; titel: string; abteilung: string; standort: string; art: string; status: StellenStatus; erstellt: string; beschreibung: string; anforderungen: string; benefits: string; };
export type OnboardingTermin = { id: string; datum: string; uhrzeit: string; standort: string; maxTeilnehmer: number; };

const LS_BEWERBER = "mi_bewerber";
const LS_STELLEN = "mi_stellen";
const LS_TERMINE = "mi_onboarding_termine";

// We store stellen and termine in the bewerbungen cache as special rows with a type marker in meta,
// or use separate localStorage keys. For simplicity, stellen/termine use a single cached "bewerbungen" table approach.
// Bewerber → bewerbungen table. Stellen/Termine → stored in meta of special bewerbungen rows.

function uid(): string { return crypto.randomUUID(); }
function now(): string { const d = new Date(); return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`; }

// ── Bewerber → bewerbungen table ──

function bewerberToDb(b: Bewerber): Record<string, any> {
  return {
    id: b.id, vorname: b.vorname, nachname: b.nachname, email: b.email, telefon: b.telefon,
    position: b.stelleTitel, status: b.status, nachricht: b.motivation, notizen: b.notizen,
    meta: {
      ort: b.ort, quelle: b.quelle, beworben: b.beworben, stelleId: b.stelleId,
      stelleTitel: b.stelleTitel, bewertung: b.bewertung, typ: b.typ, typLabel: b.typLabel,
      typBeschreibung: b.typBeschreibung, typEignung: b.typEignung, erfahrung: b.erfahrung,
      ziele: b.ziele, beschaeftigungsart: b.beschaeftigungsart, onboardingTerminId: b.onboardingTerminId,
      lebenslaufUrl: b.lebenslaufUrl, dokumente: b.dokumente, vertragStatus: b.vertragStatus,
      vertragDatum: b.vertragDatum, benachrichtigungen: b.benachrichtigungen,
      chatVerknuepft: b.chatVerknuepft, _type: "bewerber",
      ausgangslage: b.ausgangslage, zielBest: b.zielBest, wieStarten: b.wieStarten,
      notizenLog: b.notizenLog,
      adresse: b.adresse,
      vertragsAdresse: b.vertragsAdresse,
      rechnungsAdresse: b.rechnungsAdresse,
      closingTerminDatum: b.closingTerminDatum,
      closingTerminUhrzeit: b.closingTerminUhrzeit,
      closingTerminSelbstGebucht: b.closingTerminSelbstGebucht,
      closingBeraterName: b.closingBeraterName,
      closingBeraterEmail: b.closingBeraterEmail,
      closingBeraterTelefon: b.closingBeraterTelefon,
      closingRemindersSent: b.closingRemindersSent,
      vertragErstVersandAt: b.vertragErstVersandAt,
      vertragErinnerungenAt: b.vertragErinnerungenAt,
      kontaktversuche: b.kontaktversuche,
      whatsappAngeschrieben: b.whatsappAngeschrieben,
      erstgespraechDatum: b.erstgespraechDatum,
      erstgespraechUhrzeit: b.erstgespraechUhrzeit,
      erstgespraechBerater: b.erstgespraechBerater,
      erstgespraechQuelle: b.erstgespraechQuelle,
      erstgespraechBestaetigtAm: b.erstgespraechBestaetigtAm,
      closingEntscheidung: b.closingEntscheidung,
      bedenkzeitRueckrufAm: b.bedenkzeitRueckrufAm,
      bedenkzeitGrund: b.bedenkzeitGrund,
      bedenkzeitRueckrufUhrzeit: b.bedenkzeitRueckrufUhrzeit,
      bedenkzeitKanal: b.bedenkzeitKanal,
      bedenkzeitErinnerungTage: b.bedenkzeitErinnerungTage,
      bedenkzeitVorbereitung: b.bedenkzeitVorbereitung,
      closingAbgelehntGrund: b.closingAbgelehntGrund,
      erstgespraechSkript: b.erstgespraechSkript,
      followUpDatum: b.followUpDatum,
      followUpUhrzeit: b.followUpUhrzeit,
      followUpNotiz: b.followUpNotiz,
      paketwahl: b.paketwahl,
      zahlungsweise: b.zahlungsweise,
      tippgeberProvisionsModell: b.tippgeberProvisionsModell,
      tippgeberProvisionsBetrag: b.tippgeberProvisionsBetrag,
      satzIndividuell: b.satzIndividuell,
      satzLead: b.satzLead,
      satzEigen: b.satzEigen,
      satzBestand: b.satzBestand,
      satzNeubau: b.satzNeubau,
      vertragPdfUrl: b.vertragPdfUrl,
      vertragIndividuell: b.vertragIndividuell,
      vertragSignedPdfUrl: b.vertragSignedPdfUrl,
      vertragSignedAt: b.vertragSignedAt,
      vertragHrName: b.vertragHrName,
      vertragVersion: b.vertragVersion,
      rechnungNr: b.rechnungNr,
      rechnungPdfUrl: b.rechnungPdfUrl,
      rechnungErstelltAm: b.rechnungErstelltAm,
      rechnungBezahltBestaetigungen: b.rechnungBezahltBestaetigungen,
      rechnungBezahltAm: b.rechnungBezahltAm,
      rechnungLexBelegNr: b.rechnungLexBelegNr,
      rechnungZahlungsdatum: b.rechnungZahlungsdatum,
      rechnungFaelligAm: b.rechnungFaelligAm,
      rechnungMahnung14Am: b.rechnungMahnung14Am,
      rechnungMahnung21Am: b.rechnungMahnung21Am,
      rechnungExternErstelltVersendet: b.rechnungExternErstelltVersendet,
      rechnungExternErstelltVersendetAm: b.rechnungExternErstelltVersendetAm,
      rechnungUebersprungen: b.rechnungUebersprungen,
      rechnungUebersprungenAm: b.rechnungUebersprungenAm,
      rechnungUebersprungenGrund: b.rechnungUebersprungenGrund,
      rechnungUebersprungenErinnerungenErledigt: b.rechnungUebersprungenErinnerungenErledigt,
      userAccountId: b.userAccountId,
      userInviteSentAt: b.userInviteSentAt,
      karriereStufe: b.karriereStufe,
      onboardingChecklist: b.onboardingChecklist,
      academyPflichtModule: b.academyPflichtModule,
      aktivAm: b.aktivAm,
      onboardingTerminDatum: b.onboardingTerminDatum,
      onboardingTerminGebucht: b.onboardingTerminGebucht,
      onboardingTerminUhrzeit: b.onboardingTerminUhrzeit,
      persoenlicheEmail: b.persoenlicheEmail,
      zugangsdatenGesendetAm: b.zugangsdatenGesendetAm,
      zugangsdatenGesendetAn: b.zugangsdatenGesendetAn,
      aktivierungOnboarding: b.aktivierungOnboarding,
      communityRolle: b.communityRolle,
      geworbenVonUserId: b.geworbenVonUserId,
      geworbenVonName: b.geworbenVonName,
      paketBestaetigtAm: b.paketBestaetigtAm,
      paketUebersichtSentAt: b.paketUebersichtSentAt,
      musterVertraegeSentAt: b.musterVertraegeSentAt,
      vertriebserfahrung: b.vertriebserfahrung,
      vertriebsbereich: b.vertriebsbereich,
      immobilienErfahrung: b.immobilienErfahrung,
      monatlichesEinkommen: b.monatlichesEinkommen,
      stundenProWoche: b.stundenProWoche,
      aktuelleSituation: b.aktuelleSituation,
      alter: b.alter,
      individuelleVertragsFassung: b.individuelleVertragsFassung,
      mitgebrachteKontakte: b.mitgebrachteKontakte,
      andereVertriebe: b.andereVertriebe,
      ohneCrmGebuehr: b.ohneCrmGebuehr,
      leadEinzelkauf: b.leadEinzelkauf,
      laufzeitOffen: b.laufzeitOffen,
      vertragKonditionenStand: b.vertragKonditionenStand,
      vertragFassung: b.vertragFassung,
      // Nur mitschreiben, wenn vorhanden: Ein leerer Wert aus einer alten
      // Ansicht darf den vom Server geschriebenen nicht loeschen.
      ...(b.vertragUnterschrieben ? { vertragUnterschrieben: b.vertragUnterschrieben } : {}),
      leadPaket: b.leadPaket,
      // Steht hier mit Absicht, im Gegensatz zu den Vermerken darunter: Die
      // Zuordnung zum Ablauf wird aus dem CRM gesetzt, nicht vom Server.
      prozess: b.prozess,
      // nachfassMailAm, selbstAbgemeldetAm, selbstAbgemeldetGrund und der
      // Block `kennenlernen` fehlen hier mit Absicht: Sie werden nur von den Edge Functions geschrieben
      // und im CRM nur gelesen. Stünden sie hier, würde ein Speichern aus
      // einer veralteten Ansicht (Akte offen, Bewerber meldet sich derweil
      // ab) den Vermerk mit dem alten, leeren Wert überschreiben. Unbekannte
      // Schlüssel bleiben beim Speichern erhalten, siehe updateBewerber.
    },
  };
}

/**
 * Die Erinnerungsstufe aus dem Kennenlernen-Block, auf 0 bis 3 begrenzt.
 *
 * Der Zeitplan schreibt sie; ein unerwarteter Wert darf hier nicht zu einer
 * Stufe führen, die die Kette nicht kennt.
 */
function erinnerungStufeAus(block: unknown): 0 | 1 | 2 | 3 {
  if (!block || typeof block !== "object") return 0;
  const roh = Number((block as Record<string, unknown>).erinnerungStufe ?? 0);
  if (!Number.isFinite(roh)) return 0;
  return Math.min(3, Math.max(0, Math.trunc(roh))) as 0 | 1 | 2 | 3;
}

/** Die Angaben aus „Partner werden“, so wie die Bewerberakte sie zeigt. */
export interface PartnerWerdenAngaben {
  rolleText: string;
  wegText: string;
  firma: string;
  /** Kampagne aus der Adresse (utm_campaign, sonst utm_source), leer ohne Anzeige. */
  kampagne: string;
  lesbar: { frage: string; antwort: string }[];
}

/** Liest `meta.partnerWerden` vorsichtig: Fehlt etwas, bleibt es leer statt zu brechen. */
export function partnerWerdenAus(roh: unknown, kampagneRoh?: unknown): PartnerWerdenAngaben | undefined {
  if (!roh || typeof roh !== "object") return undefined;
  const o = roh as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  const lesbar = Array.isArray(o.lesbar)
    ? o.lesbar
        .filter((z): z is Record<string, unknown> => !!z && typeof z === "object")
        .map((z) => ({ frage: text(z.frage), antwort: text(z.antwort) }))
        .filter((z) => z.frage)
    : [];
  const k = kampagneRoh && typeof kampagneRoh === "object" ? (kampagneRoh as Record<string, unknown>) : {};
  const kampagne = text(k.utmCampaign) || text(k.utmSource);
  return { rolleText: text(o.rolleText), wegText: text(o.wegText), firma: text(o.firma), kampagne, lesbar };
}

function bewerberFromDb(r: any): Bewerber {
  const m = r.meta || {};
  return {
    id: r.id, vorname: r.vorname, nachname: r.nachname, email: r.email || "", telefon: r.telefon || "",
    ort: m.ort || "", quelle: m.quelle || "", beworben: m.beworben || "", stelleId: m.stelleId || "",
    stelleTitel: m.stelleTitel || r.position || "", status: migrateStatus(r.status || "Eingang"),
    bewertung: m.bewertung || 0, typ: m.typ || "", typLabel: m.typLabel || "", typBeschreibung: m.typBeschreibung || "",
    typEignung: m.typEignung || "", erfahrung: m.erfahrung || "", motivation: r.nachricht || "",
    notizen: r.notizen || "", ziele: m.ziele || "", beschaeftigungsart: m.beschaeftigungsart || "",
    onboardingTerminId: m.onboardingTerminId || "", lebenslaufUrl: m.lebenslaufUrl || "",
    dokumente: m.dokumente || [], vertragStatus: m.vertragStatus || "nicht_gesendet",
    vertragDatum: m.vertragDatum || "",
    vertragErstVersandAt: m.vertragErstVersandAt || "",
    vertragErinnerungenAt: Array.isArray(m.vertragErinnerungenAt) ? m.vertragErinnerungenAt : [],
    benachrichtigungen: m.benachrichtigungen || [], chatVerknuepft: m.chatVerknuepft || false,
    ausgangslage: m.ausgangslage || "", zielBest: m.zielBest || "", wieStarten: m.wieStarten || "",
    notizenLog: Array.isArray(m.notizenLog) ? m.notizenLog : [],
    adresse: m.adresse || "",
    vertragsAdresse: m.vertragsAdresse || "",
    rechnungsAdresse: m.rechnungsAdresse || "",
    closingTerminDatum: m.closingTerminDatum || "",
    closingTerminUhrzeit: m.closingTerminUhrzeit || "",
    closingTerminSelbstGebucht: !!m.closingTerminSelbstGebucht,
    closingBeraterName: m.closingBeraterName || "",
    closingBeraterEmail: m.closingBeraterEmail || "",
    closingBeraterTelefon: m.closingBeraterTelefon || "",
    closingRemindersSent: Array.isArray(m.closingRemindersSent) ? m.closingRemindersSent : [],
    kontaktversuche: Array.isArray(m.kontaktversuche) ? m.kontaktversuche : [],
    whatsappAngeschrieben: !!m.whatsappAngeschrieben,
    erstgespraechDatum: m.erstgespraechDatum || "",
    erstgespraechUhrzeit: m.erstgespraechUhrzeit || "",
    erstgespraechBerater: m.erstgespraechBerater || "",
    erstgespraechQuelle: m.erstgespraechQuelle || "",
    erstgespraechBestaetigtAm: m.erstgespraechBestaetigtAm || "",
    closingEntscheidung: m.closingEntscheidung || "",
    bedenkzeitRueckrufAm: m.bedenkzeitRueckrufAm || "",
    bedenkzeitGrund: m.bedenkzeitGrund || "",
    bedenkzeitRueckrufUhrzeit: m.bedenkzeitRueckrufUhrzeit || "",
    bedenkzeitKanal: m.bedenkzeitKanal || "",
    bedenkzeitErinnerungTage: typeof m.bedenkzeitErinnerungTage === "number" ? m.bedenkzeitErinnerungTage : undefined,
    bedenkzeitVorbereitung: m.bedenkzeitVorbereitung || "",
    closingAbgelehntGrund: m.closingAbgelehntGrund || "",
    erstgespraechSkript: m.erstgespraechSkript || {
      ausgangslage: "", ziele: "", motivation: "", vorErfahrung: "",
      einwand: "", budget: "", naechsterSchritt: "",
      durchgefuehrtAm: "", durchgefuehrtVon: "",
    },
    followUpDatum: m.followUpDatum || "",
    followUpUhrzeit: m.followUpUhrzeit || "",
    followUpNotiz: m.followUpNotiz || "",
    paketwahl: m.paketwahl || "",
    zahlungsweise: m.zahlungsweise || "",
    tippgeberProvisionsModell: m.tippgeberProvisionsModell || undefined,
    tippgeberProvisionsBetrag: m.tippgeberProvisionsBetrag || "",
    satzIndividuell: m.satzIndividuell != null && m.satzIndividuell !== "" ? String(m.satzIndividuell) : "",
    satzLead: m.satzLead != null && m.satzLead !== "" ? String(m.satzLead) : "",
    satzEigen: m.satzEigen != null && m.satzEigen !== "" ? String(m.satzEigen) : "",
    satzBestand: m.satzBestand != null && m.satzBestand !== "" ? String(m.satzBestand) : "",
    satzNeubau: m.satzNeubau != null && m.satzNeubau !== "" ? String(m.satzNeubau) : "",
    vertragPdfUrl: m.vertragPdfUrl || "",
    vertragIndividuell: !!m.vertragIndividuell,
    vertragSignedPdfUrl: m.vertragSignedPdfUrl || "",
    vertragSignedAt: m.vertragSignedAt || "",
    vertragBewerberSignedAt: m.vertragBewerberSignedAt || "",
    vertragHrName: m.vertragHrName || "",
    vertragVersion: m.vertragVersion || 0,
    rechnungNr: m.rechnungNr || "",
    rechnungPdfUrl: m.rechnungPdfUrl || "",
    rechnungErstelltAm: m.rechnungErstelltAm || "",
    rechnungBezahltBestaetigungen: Array.isArray(m.rechnungBezahltBestaetigungen) ? m.rechnungBezahltBestaetigungen : [],
    rechnungBezahltAm: m.rechnungBezahltAm || "",
    rechnungLexBelegNr: m.rechnungLexBelegNr || "",
    rechnungZahlungsdatum: m.rechnungZahlungsdatum || "",
    rechnungFaelligAm: m.rechnungFaelligAm || "",
    rechnungMahnung14Am: m.rechnungMahnung14Am || "",
    rechnungMahnung21Am: m.rechnungMahnung21Am || "",
    rechnungExternErstelltVersendet: !!m.rechnungExternErstelltVersendet,
    rechnungExternErstelltVersendetAm: m.rechnungExternErstelltVersendetAm || "",
    rechnungUebersprungen: !!m.rechnungUebersprungen,
    rechnungUebersprungenAm: m.rechnungUebersprungenAm || "",
    rechnungUebersprungenGrund: m.rechnungUebersprungenGrund || "",
    rechnungUebersprungenErinnerungenErledigt: Array.isArray(m.rechnungUebersprungenErinnerungenErledigt)
      ? m.rechnungUebersprungenErinnerungenErledigt
      : [],
    userAccountId: m.userAccountId || "",
    userInviteSentAt: m.userInviteSentAt || "",
    karriereStufe: m.karriereStufe || "",
    onboardingChecklist: Array.isArray(m.onboardingChecklist) ? m.onboardingChecklist : [],
    academyPflichtModule: Array.isArray(m.academyPflichtModule) ? m.academyPflichtModule : [],
    aktivAm: m.aktivAm || "",
    onboardingTerminDatum: m.onboardingTerminDatum || "",
    onboardingTerminGebucht: !!m.onboardingTerminGebucht,
    onboardingTerminUhrzeit: m.onboardingTerminUhrzeit || "",
    persoenlicheEmail: m.persoenlicheEmail || "",
    zugangsdatenGesendetAm: m.zugangsdatenGesendetAm || "",
    zugangsdatenGesendetAn: m.zugangsdatenGesendetAn || "",
    aktivierungOnboarding: m.aktivierungOnboarding && typeof m.aktivierungOnboarding === "object"
      ? m.aktivierungOnboarding
      : {},
    communityRolle: m.communityRolle || "",
    geworbenVonUserId: m.geworbenVonUserId || "",
    geworbenVonName: m.geworbenVonName || "",
    paketBestaetigtAm: m.paketBestaetigtAm || "",
    paketUebersichtSentAt: m.paketUebersichtSentAt || "",
    musterVertraegeSentAt: Array.isArray(m.musterVertraegeSentAt) ? m.musterVertraegeSentAt : [],
    erstelltAm: r.erstellt_am || "",
    vertriebserfahrung: m.vertriebserfahrung || "",
    vertriebsbereich: m.vertriebsbereich || "",
    immobilienErfahrung: m.immobilienErfahrung || m.immobilien_erfahrung || "",
    monatlichesEinkommen: m.monatlichesEinkommen || m.monatliches_einkommen || "",
    stundenProWoche: m.stundenProWoche || m.stunden_pro_woche || "",
    aktuelleSituation: m.aktuelleSituation || m.aktuelle_situation || "",
    alter: m.alter || "",
    individuelleVertragsFassung: !!m.individuelleVertragsFassung,
    mitgebrachteKontakte: m.mitgebrachteKontakte || "",
    andereVertriebe: m.andereVertriebe || "",
    ohneCrmGebuehr: !!m.ohneCrmGebuehr,
    leadEinzelkauf: !!m.leadEinzelkauf,
    laufzeitOffen: !!m.laufzeitOffen,
    vertragKonditionenStand: typeof m.vertragKonditionenStand === "string" ? m.vertragKonditionenStand : "",
    vertragFassung: typeof m.vertragFassung === "string" ? m.vertragFassung : "",
    vertragUnterschrieben:
      m.vertragUnterschrieben && typeof m.vertragUnterschrieben === "object"
        && typeof m.vertragUnterschrieben.fassung === "string"
        ? m.vertragUnterschrieben
        : undefined,
    // Nur ein vollständiges Leadpaket (beide Zahlen > 0) zählt als gebucht.
    leadPaket:
      m.leadPaket && typeof m.leadPaket === "object" &&
      typeof m.leadPaket.betrag === "number" && m.leadPaket.betrag > 0 &&
      typeof m.leadPaket.anzahl === "number" && m.leadPaket.anzahl > 0
        ? { betrag: m.leadPaket.betrag, anzahl: m.leadPaket.anzahl }
        : undefined,
    nachfassMailAm: typeof m.nachfassMailAm === "string" ? m.nachfassMailAm : "",
    klNachfassMailAm: typeof m.klNachfassMailAm === "string" ? m.klNachfassMailAm : "",
    selbstAbgemeldetAm: typeof m.selbstAbgemeldetAm === "string" ? m.selbstAbgemeldetAm : "",
    selbstAbgemeldetGrund: typeof m.selbstAbgemeldetGrund === "string" ? m.selbstAbgemeldetGrund : "",
    kennenlernenGesendetAm:
      m.kennenlernen && typeof m.kennenlernen === "object" && typeof m.kennenlernen.gesendetAm === "string"
        ? m.kennenlernen.gesendetAm
        : "",
    prozess: typeof m.prozess === "string" ? m.prozess : "",
    partnerWerden: partnerWerdenAus(m.partnerWerden, m.kampagne),
    kennenlernenErinnerungStufe: erinnerungStufeAus(m.kennenlernen),
    ...pauseUndWiderspruchAus(m.kennenlernen),
    ...versandErgebnisAus(m.kennenlernen),
  };
}

/**
 * Ob der Versand der Eingangsmail geklappt hat, aus `meta.kennenlernen`.
 *
 * Das Kennzeichen wird seit dem 08.06.2026 geschrieben, gelesen hat es bis zum
 * 14.09.2026 niemand. Das war kein Schönheitsfehler: `send-bewerber-kennenlernen`
 * schreibt `gesendetAm` auch dann, wenn die Mail NICHT hinausging, etwa weil
 * die Adresse auf der Sperrliste steht. Die Bewerberliste zeigte daraufhin das
 * Briefsymbol „ist hinausgegangen", und der Bewerber wartete auf eine Mail, die
 * es nie gab.
 *
 * Drei Stellen schreiben den Block, und nur zwei davon setzen ein Datum:
 * `send-bewerber-kennenlernen` schreibt `gesendetAm` plus `versandOk`,
 * `submit-bewerbung` und `zapier-bewerber-webhook` schreiben bei einem
 * Fehlschlag nur `versandVersuchAm` und `versandOk: false`. Deshalb zählen
 * hier beide Zeitangaben: Ohne die zweite bliebe ein Fehlschlag aus dem
 * automatischen Eingang in der Liste vollständig unsichtbar.
 */
function versandErgebnisAus(block: unknown): {
  kennenlernenVersandOk?: boolean;
  kennenlernenGesendetVon?: string;
  kennenlernenErneutGesendet?: number;
  kennenlernenVersandAm: string;
  kennenlernenVersandGrund: string;
} {
  if (!block || typeof block !== "object") {
    return { kennenlernenVersandAm: "", kennenlernenVersandGrund: "" };
  }
  const k = block as Record<string, unknown>;
  const am = typeof k.gesendetAm === "string" && k.gesendetAm
    ? k.gesendetAm
    : typeof k.versandVersuchAm === "string" ? k.versandVersuchAm : "";
  return {
    // Fehlt das Kennzeichen ganz, bleibt es `undefined`. Das ist nicht
    // dasselbe wie `false`: Alte Zeilen wissen es schlicht nicht, und aus
    // Unwissen darf keine rote Anzeige werden.
    ...(typeof k.versandOk === "boolean" ? { kennenlernenVersandOk: k.versandOk } : {}),
    ...(typeof k.gesendetVon === "string" && k.gesendetVon ? { kennenlernenGesendetVon: k.gesendetVon } : {}),
    ...(typeof k.erneutGesendet === "number" && Number.isFinite(k.erneutGesendet) && k.erneutGesendet > 0
      ? { kennenlernenErneutGesendet: k.erneutGesendet }
      : {}),
    kennenlernenVersandAm: am,
    kennenlernenVersandGrund: typeof k.versandGrund === "string" ? k.versandGrund : "",
  };
}

/**
 * Widerspruch gegen den Anruf und die selbst gewählte Pause, aus dem Block
 * `meta.kennenlernen`.
 *
 * Beides schreibt allein der Server (`bewerber-seite`), hier wird es nur
 * gelesen: `bewerberToDb` lässt den ganzen Block mit Absicht aus. Ohne diese
 * drei Felder kann die Liste nicht zeigen, warum bei einem Bewerber nichts
 * mehr geschieht, und genau das war das eigentliche Problem: Er lag im Eingang
 * wie jeder andere, nur passierte bei ihm nichts.
 */
function pauseUndWiderspruchAus(block: unknown): {
  kennenlernenAnrufWidersprochen: boolean;
  kennenlernenPauseGesetztAm: string;
  kennenlernenPauseErinnerungAm: string;
} {
  const leer = {
    kennenlernenAnrufWidersprochen: false,
    kennenlernenPauseGesetztAm: "",
    kennenlernenPauseErinnerungAm: "",
  };
  if (!block || typeof block !== "object") return leer;
  const k = block as Record<string, unknown>;
  const pause = k.pause && typeof k.pause === "object" && !Array.isArray(k.pause)
    ? (k.pause as Record<string, unknown>)
    : null;
  return {
    kennenlernenAnrufWidersprochen: k.anrufWidersprochen === true,
    kennenlernenPauseGesetztAm: typeof pause?.gesetztAm === "string" ? pause.gesetztAm : "",
    kennenlernenPauseErinnerungAm: typeof pause?.erinnerungAm === "string" ? pause.erinnerungAm : "",
  };
}

// Filter only bewerber rows (not stellen/termine stored in same table)
function isBewerberRow(r: any): boolean {
  return !r.meta?._type || r.meta._type === "bewerber";
}

export function getBewerber(): Bewerber[] {
  if (isTestAccount()) {
    const list = localGet<Bewerber[]>(LS_BEWERBER, []);
    return list.sort((a, b) => new Date(b.erstelltAm || 0).getTime() - new Date(a.erstelltAm || 0).getTime());
  }
  return cacheGet("bewerbungen")
    .filter(isBewerberRow)
    .map(bewerberFromDb)
    .sort((a, b) => new Date(b.erstelltAm || 0).getTime() - new Date(a.erstelltAm || 0).getTime());
}

export function getBewerberById(id: string): Bewerber | undefined {
  return getBewerber().find(b => b.id === id);
}

export async function createBewerber(data: Omit<Bewerber, "id" | "beworben" | "status" | "bewertung" | "typ" | "typLabel" | "typBeschreibung" | "typEignung" | "notizen" | "ziele" | "onboardingTerminId" | "lebenslaufUrl" | "dokumente" | "vertragStatus" | "vertragDatum" | "benachrichtigungen" | "chatVerknuepft" | "ausgangslage" | "zielBest" | "wieStarten" | "notizenLog" | "adresse" | "vertragsAdresse" | "rechnungsAdresse" | "closingTerminDatum" | "closingTerminUhrzeit" | "erstgespraechSkript" | "paketwahl" | "zahlungsweise" | "vertragPdfUrl" | "vertragSignedPdfUrl" | "vertragSignedAt" | "vertragHrName" | "vertragVersion" | "rechnungNr" | "rechnungPdfUrl" | "rechnungErstelltAm" | "rechnungBezahltBestaetigungen" | "rechnungBezahltAm" | "userAccountId" | "userInviteSentAt" | "karriereStufe" | "onboardingChecklist" | "academyPflichtModule" | "aktivAm" | "geworbenVonUserId" | "geworbenVonName" | "erstelltAm">): Promise<Bewerber> {
  const neu: Bewerber = {
    ...data, id: uid(), beworben: now(), status: "Eingang", bewertung: 0, erstelltAm: new Date().toISOString(),
    typ: "", typLabel: "", typBeschreibung: "", typEignung: "", notizen: "", ziele: "",
    onboardingTerminId: "", lebenslaufUrl: "", dokumente: [], vertragStatus: "nicht_gesendet",
    vertragDatum: "", benachrichtigungen: [], chatVerknuepft: false,
    ausgangslage: "", zielBest: "", wieStarten: "",
    notizenLog: [],
    adresse: "",
    vertragsAdresse: "",
    rechnungsAdresse: "",
    closingTerminDatum: "",
    closingTerminUhrzeit: "",
    erstgespraechSkript: {
      ausgangslage: "", ziele: "", motivation: "", vorErfahrung: "",
      einwand: "", budget: "", naechsterSchritt: "",
      durchgefuehrtAm: "", durchgefuehrtVon: "",
    },
    paketwahl: "",
    zahlungsweise: "",
    vertragPdfUrl: "",
    vertragSignedPdfUrl: "",
    vertragSignedAt: "",
    vertragHrName: "",
    vertragVersion: 0,
    rechnungNr: "",
    rechnungPdfUrl: "",
    rechnungErstelltAm: "",
    rechnungBezahltBestaetigungen: [],
    rechnungBezahltAm: "",
    userAccountId: "",
    userInviteSentAt: "",
    karriereStufe: "",
    onboardingChecklist: [],
    academyPflichtModule: [],
    aktivAm: "",
    geworbenVonUserId: "",
    geworbenVonName: "",
  };
  if (isTestAccount()) {
    const all = localGet<Bewerber[]>(LS_BEWERBER, []);
    all.push(neu);
    localSet(LS_BEWERBER, all);
  } else {
    /*
     * Abwarten, nicht nur anstossen.
     *
     * Bis zum 14.09.2026 stand hier `cacheInsert(...)` ohne `await`. Der
     * Aufrufer bekam den Bewerber sofort zurueck und rief im selben Atemzug
     * die Function, die ihm die Einladung schickt. Beide Anfragen liefen dann
     * gleichzeitig, und war die Function schneller als das Einfuegen, fand sie
     * den Bewerber nicht und brach ab. Von aussen sah das aus wie "mal geht
     * die Mail raus, mal nicht".
     *
     * `cacheInsert` hat eigene Wiederholungen mit Wartezeiten, es kann also
     * durchaus mehrere Sekunden dauern. Genau deshalb muss hier gewartet
     * werden. Schlaegt es fehl, faellt der Fehler jetzt beim Aufrufer an und
     * wird nicht mehr in einem unbeachteten Versprechen verschluckt.
     */
    await cacheInsert("bewerbungen", bewerberToDb(neu));
  }
  window.dispatchEvent(new Event("bewerbung-updated"));
  return neu;
}

export function updateBewerber(id: string, data: Partial<Bewerber>) {
  let pending: Promise<unknown> | undefined;
  if (isTestAccount()) {
    const all = localGet<Bewerber[]>(LS_BEWERBER, []).map(b => {
      if (b.id !== id) return b;
      const guarded = guardSignedVertrag(b, data);
      const ruecksprung = closingRuecksprungStatus(b, guarded);
      return { ...b, ...guarded, ...(ruecksprung ? { status: ruecksprung } : {}) };
    });
    localSet(LS_BEWERBER, all);
  } else {
    const existing = cacheGet("bewerbungen").find((r: any) => r.id === id);
    if (!existing) return;
    const existingB = bewerberFromDb(existing);
    const guarded = guardSignedVertrag(existingB, data);
    const ruecksprung = closingRuecksprungStatus(existingB, guarded);
    if (ruecksprung) guarded.status = ruecksprung;
    const merged = { ...existingB, ...guarded };
    const { id: _id, meta: neuesMeta, ...updates } = bewerberToDb(merged);
    // `bewerberToDb` setzt `meta` aus den bekannten Feldern komplett neu zusammen.
    // Schlüssel, die es nicht kennt, weil sie nur serverseitig entstehen (etwa die
    // Sendeprotokolle der Erinnerungs-Functions), fielen dabei stillschweigend weg.
    // Deshalb liegt der gespeicherte Bestand als Basis darunter.
    pending = cacheUpdate("bewerbungen", id, {
      ...updates,
      meta: { ...(existing.meta || {}), ...neuesMeta },
    });
  }
  window.dispatchEvent(new Event("bewerbung-updated"));
  return pending;
}

/**
 * Schließt die Follow-Up-Sackgasse: Steht der Bewerber im Status "FollowUp"
 * und bekommt einen NEUEN Closing-Termin (Datum und Uhrzeit gesetzt und
 * gegenüber dem Bestand verändert), springt der Status automatisch zurück
 * auf "Closing". Ein unverändert mitgeschriebener alter Termin (z. B. durch
 * das Autosave des Erstgesprächs-Skripts) löst den Rücksprung bewusst nicht
 * aus. Liefert den Zielstatus oder null, wenn nichts zu tun ist.
 */
export function closingRuecksprungStatus(
  existing: Pick<Bewerber, "status" | "closingTerminDatum" | "closingTerminUhrzeit">,
  patch: Partial<Bewerber>,
): BewerberStatus | null {
  if (existing.status !== "FollowUp") return null;
  // Ein ausdrücklich mitgegebener Status hat Vorrang vor der Automatik.
  if (patch.status !== undefined) return null;
  const datum = patch.closingTerminDatum;
  const uhrzeit = patch.closingTerminUhrzeit;
  if (!datum || !uhrzeit) return null;
  const unveraendert =
    datum === (existing.closingTerminDatum || "") &&
    uhrzeit === (existing.closingTerminUhrzeit || "");
  return unveraendert ? null : "Closing";
}

/**
 * Schützt einen bereits unterschriebenen Vertrag davor, durch nachfolgende
 * (oft cache-bedingte) Updates wieder auf "gesendet"/"nicht_gesendet" zurück-
 * gesetzt zu werden oder den signierten PDF-Verweis zu verlieren.
 * Greift nur, wenn der bestehende Bewerber schon als "unterschrieben" markiert
 * ist UND eine signierte PDF-URL vorliegt.
 */
function guardSignedVertrag(existing: Bewerber, data: Partial<Bewerber>): Partial<Bewerber> {
  if (existing.vertragStatus !== "unterschrieben" || !existing.vertragSignedPdfUrl) {
    return data;
  }
  const next: Partial<Bewerber> = { ...data };
  if (next.vertragStatus !== undefined && next.vertragStatus !== "unterschrieben") {
    delete next.vertragStatus;
  }
  if (next.vertragSignedPdfUrl !== undefined && !next.vertragSignedPdfUrl) {
    delete next.vertragSignedPdfUrl;
  }
  if (next.vertragSignedAt !== undefined && !next.vertragSignedAt) {
    delete next.vertragSignedAt;
  }
  return next;
}

export function deleteBewerber(id: string) {
  if (isTestAccount()) {
    localSet(LS_BEWERBER, localGet<Bewerber[]>(LS_BEWERBER, []).filter(b => b.id !== id));
  } else {
    cacheDelete("bewerbungen", id);
  }
  window.dispatchEvent(new Event("bewerbung-updated"));
}

// ── Dokumente ──
export function addDokument(bewerberId: string, dok: Omit<BewerberDokument, "id" | "datum" | "status">) {
  const b = getBewerberById(bewerberId);
  if (!b) return;
  const dokumente = [...(b.dokumente || []), { ...dok, id: uid(), datum: now(), status: "hochgeladen" as const }];
  updateBewerber(bewerberId, { dokumente });
  addNotification(bewerberId, { typ: "dokument", titel: "Dokument hochgeladen", nachricht: `Das Dokument "${dok.name}" wurde hochgeladen.` });
}

export function updateDokumentStatus(bewerberId: string, dokId: string, status: BewerberDokument["status"]) {
  const b = getBewerberById(bewerberId);
  if (!b) return;
  const dokumente = (b.dokumente || []).map(d => d.id === dokId ? { ...d, status } : d);
  updateBewerber(bewerberId, { dokumente });
}

// ── Vertrag ──
export function sendVertrag(bewerberId: string) {
  const b = getBewerberById(bewerberId);
  // ISO statt now(): now() liefert "31.8.2026" ohne Uhrzeit, und new Date()
  // darauf ergab in der Anzeige "Invalid Date". Altwerte im Bestand bleiben
  // stehen, das Lesen laeuft ueber formatDatumZeitFlexibel.
  const ts = jetztAlsIsoDatum();
  // Auto-Promotion: bei Erstversand Bewerber-Status auf "Vertrag" heben,
  // sofern er noch in einer früheren Pipeline-Stufe steht (z.B. FollowUp,
  // Closing, Paketwahl, Erstgespräch, Eingang).
  const STUFEN_VOR_VERTRAG: BewerberStatus[] = [
    "Eingang", "Erstgespraech", "Closing", "FollowUp", "Paketwahl",
  ];
  const shouldPromote = !!b && STUFEN_VOR_VERTRAG.includes(b.status);
  if (!b?.vertragErstVersandAt) {
    // Erstversand: vertragDatum + vertragErstVersandAt setzen
    updateBewerber(bewerberId, {
      vertragStatus: "gesendet",
      vertragDatum: ts,
      vertragErstVersandAt: ts,
      ...(shouldPromote ? { status: "Vertrag" as BewerberStatus } : {}),
    });
    addNotification(bewerberId, { typ: "vertrag", titel: "Vertrag gesendet", nachricht: "Bitte prüfen und Vertrag unterschreiben." });
  } else {
    // Erinnerung: vertragDatum NICHT überschreiben, nur Erinnerungs-Liste ergänzen
    const erinnerungen = [...(b.vertragErinnerungenAt || []), ts];
    updateBewerber(bewerberId, {
      vertragStatus: "gesendet",
      vertragErinnerungenAt: erinnerungen,
      ...(shouldPromote ? { status: "Vertrag" as BewerberStatus } : {}),
    });
    addNotification(bewerberId, { typ: "vertrag", titel: "Vertragserinnerung gesendet", nachricht: "Erinnerung zur Unterschrift wurde versendet." });
  }
}

export function signVertrag(bewerberId: string) {
  updateBewerber(bewerberId, { vertragStatus: "unterschrieben" });
  addNotification(bewerberId, { typ: "vertrag", titel: "Vertrag unterschrieben", nachricht: "Dein Vertrag wurde erfolgreich unterschrieben." });
}

// ── Notizen-Log (chronologisch) ──
/**
 * Schreibt eine Notiz in die Akte und **wartet auf den Schreibvorgang**.
 *
 * ## Warum das Warten hier steht
 *
 * Bis zum 17.09.2026 war das ein blinder Aufruf: Die Funktion gab nichts
 * zurück, `updateBewerber` reichte sein Versprechen zwar nach oben, aber
 * niemand nahm es entgegen. Die Notiz stand damit allein in der optimistischen
 * Zeile des Zwischenspeichers. `cacheUpdate` in `dataCache.ts` nimmt diese
 * Zeile bei **jedem** fehlgeschlagenen Schreibvorgang wieder zurück (Rollback
 * auf den vorherigen Stand) und wirft den Fehler in ein Versprechen, das
 * niemand liest. Genau das hat Christian gesehen: Die Notiz stand kurz da und
 * war eine Sekunde später wieder weg, ohne ein Wort.
 *
 * Jetzt gibt die Funktion den geschriebenen Eintrag zurück, wenn der
 * Schreibvorgang durch ist, und `null`, wenn er fehlgeschlagen ist. Der
 * Aufrufer kann das melden, statt es den Nutzer raten zu lassen.
 *
 * Der Bestand wird unmittelbar vor dem Schreiben erneut gelesen, damit die
 * neue Notiz nie auf einem veralteten Stand aufsetzt.
 */
export async function addNotizEntry(
  bewerberId: string,
  text: string,
  autor: string,
  autorId: string,
): Promise<BewerberNotiz | null> {
  const b = getBewerberById(bewerberId);
  if (!b) return null;
  const entry: BewerberNotiz = { id: uid(), text, datum: new Date().toISOString(), autor, autorId };
  const notizenLog = [entry, ...(b.notizenLog || [])];
  try {
    await updateBewerber(bewerberId, { notizenLog });
  } catch {
    // `cacheUpdate` hat die Zeile bereits zurückgenommen. Hier wird daraus ein
    // Ergebnis, das der Aufrufer sehen kann.
    return null;
  }
  return entry;
}

/** Löscht eine Notiz und wartet ebenfalls, siehe `addNotizEntry`. */
export async function deleteNotizEntry(bewerberId: string, notizId: string): Promise<boolean> {
  const b = getBewerberById(bewerberId);
  if (!b) return false;
  const notizenLog = (b.notizenLog || []).filter(n => n.id !== notizId);
  try {
    await updateBewerber(bewerberId, { notizenLog });
  } catch {
    return false;
  }
  return true;
}

// ── Benachrichtigungen ──
export function addNotification(bewerberId: string, data: Omit<StatusNotification, "id" | "datum" | "gelesen">) {
  const b = getBewerberById(bewerberId);
  if (!b) return;
  const benachrichtigungen = [...(b.benachrichtigungen || []), { ...data, id: uid(), datum: now(), gelesen: false }];
  updateBewerber(bewerberId, { benachrichtigungen });
}

export function markNotificationsRead(bewerberId: string) {
  const b = getBewerberById(bewerberId);
  if (!b) return;
  const benachrichtigungen = (b.benachrichtigungen || []).map(n => ({ ...n, gelesen: true }));
  updateBewerber(bewerberId, { benachrichtigungen });
}

// ── Chat ──
export function verknuepfeChat(bewerberId: string) {
  updateBewerber(bewerberId, { chatVerknuepft: true });
  addNotification(bewerberId, { typ: "status", titel: "Chat verknüpft", nachricht: "Dein HR-Ansprechpartner ist jetzt per Chat erreichbar." });
}

// ── Status change with notification ──
export function changeBewerberStatus(bewerberId: string, newStatus: BewerberStatus) {
  updateBewerber(bewerberId, { status: newStatus });
  addNotification(bewerberId, { typ: "status", titel: `Status: ${newStatus}`, nachricht: getStatusMessage(newStatus) });
}

/** Löscht alle Closing-Daten (Paketwahl, Vertrag, Rechnung, Dokumente) und
 *  setzt den Status zurück auf Erstgespräch, damit der Prozess neu startet. */
export function resetClosing(bewerberId: string) {
  const b = getBewerberById(bewerberId);
  if (!b) return;
  // Status nur zurücksetzen, wenn wir bereits im Closing oder später sind
  const closingOrLater: BewerberStatus[] = ["Closing", "Paketwahl", "Vertrag", "Rechnung", "Nutzer_anlegen", "Aktiv"];
  const newStatus: BewerberStatus = closingOrLater.includes(b.status) ? "Erstgespraech" : b.status;
  updateBewerber(bewerberId, {
    status: newStatus,
    closingTerminDatum: "",
    closingTerminUhrzeit: "",
    closingEntscheidung: "",
    closingAbgelehntGrund: "",
    paketwahl: "",
    zahlungsweise: "",
    vertragsAdresse: "",
    rechnungsAdresse: "",
    vertragPdfUrl: "",
    vertragSignedPdfUrl: "",
    vertragSignedAt: "",
    vertragHrName: "",
    vertragVersion: 0,
    vertragStatus: "nicht_gesendet",
    vertragDatum: "",
    paketBestaetigtAm: "",
    rechnungNr: "",
    rechnungPdfUrl: "",
    rechnungErstelltAm: "",
    rechnungBezahltBestaetigungen: [],
    rechnungBezahltAm: "",
    rechnungLexBelegNr: "",
    rechnungZahlungsdatum: "",
    rechnungFaelligAm: "",
    rechnungMahnung14Am: "",
    rechnungMahnung21Am: "",
    dokumente: [],
    userAccountId: "",
    userInviteSentAt: "",
    karriereStufe: "",
    onboardingChecklist: [],
    academyPflichtModule: [],
    aktivAm: "",
  });
  addNotification(bewerberId, {
    typ: "status",
    titel: "Closing zurückgesetzt",
    nachricht: "Alle Closing-Daten und Dokumente wurden gelöscht. Der Prozess kann neu gestartet werden.",
  });
}

function getStatusMessage(status: BewerberStatus): string {
  switch (status) {
    case "Eingang": return "Deine Bewerbung ist eingegangen und wird geprüft.";
    case "Erstgespraech": return "Wir laden Dich zum Erstgespräch ein – Du erhältst bald einen Terminvorschlag.";
    case "Closing": return "Closing-Termin geplant – wir freuen uns auf das Gespräch.";
    case "Paketwahl": return "Bitte wähle Dein passendes Grundgebühr-Paket aus.";
    case "Vertrag": return "Dein Vertrag wurde erstellt – bitte prüfen und unterschreiben.";
    case "Rechnung": return "Die Rechnung wird vorbereitet und versendet.";
    case "Nutzer_anlegen": return "Dein Onboarding-Termin steht. Wir legen jetzt deinen Zugang an und melden uns mit den Zugangsdaten.";
    case "Aktiv": return "Du bist als aktiver Partner freigeschaltet.";
    case "KeinInteresse": return "Vielen Dank für Deine Rückmeldung – wir merken Dich gerne für die Zukunft vor.";
    case "Abgelehnt": return "Leider können wir Deine Bewerbung derzeit nicht berücksichtigen.";
    default: return "Dein Status wurde aktualisiert.";
  }
}

// ── Stellen (stored in localStorage for now, will migrate in Batch 2) ──
// Note: stellen don't have a separate DB table yet

const defaultStellen: Stelle[] = [
  { id: "s1", titel: "Vertriebspartner (m/w/d) – Immobilien", abteilung: "Vertrieb", standort: "München / Remote", art: "Freier Handelsvertreter", status: "Veröffentlicht", erstellt: "15.1.2026", beschreibung: "Du baust Dir Dein eigenes Vertriebsgebiet auf, akquirierst Eigentümer und vermittelst Immobilien.", anforderungen: "Erfahrung im Immobilienbereich (Vertrieb, Maklertätigkeit oder vergleichbar) sollte mitgebracht werden. Kommunikationsstärke, Eigeninitiative und unternehmerisches Denken.", benefits: "Attraktives Provisionsmodell, eigene Microseite, Academy-Zugang." },
  { id: "s3", titel: "Marketing Manager (m/w/d)", abteilung: "Marketing", standort: "Berlin / Remote", art: "Angestellt", status: "Entwurf", erstellt: "18.2.2026", beschreibung: "Verantwortung für Online-Marketing-Kampagnen.", anforderungen: "Performance Marketing, Social Media.", benefits: "Flexibles Arbeiten, Weiterbildungsbudget." },
  { id: "s4", titel: "Backoffice Assistenz (m/w/d)", abteilung: "Backoffice", standort: "München", art: "Teilzeit / Vollzeit", status: "Besetzt", erstellt: "1.12.2025", beschreibung: "Unterstützung des Backoffice-Teams.", anforderungen: "Organisationstalent, MS Office.", benefits: "Flexible Arbeitszeiten." },
];

const STELLEN_MIGRATION_KEY = "mi_stellen_migration_v2";

export function getStellen(): Stelle[] {
  // Einmalige harte Bereinigung: Teamleiter-Stellen aus altem Cache entfernen
  if (typeof window !== "undefined" && !localStorage.getItem(STELLEN_MIGRATION_KEY)) {
    const raw = localGet(LS_STELLEN, defaultStellen);
    const cleaned = raw.filter(s => s.id !== "s2" && !s.titel.toLowerCase().includes("teamleiter"));
    localSet(LS_STELLEN, cleaned);
    localStorage.setItem(STELLEN_MIGRATION_KEY, "1");
  }
  const raw = localGet(LS_STELLEN, defaultStellen);
  // Schutzfilter bei jedem Read
  const cleaned = raw.filter(s => s.id !== "s2" && !s.titel.toLowerCase().includes("teamleiter"));
  if (cleaned.length !== raw.length) localSet(LS_STELLEN, cleaned);
  return cleaned;
}
export function getStelleById(id: string): Stelle | undefined { return getStellen().find(s => s.id === id); }
export function getPublishedStellen(): Stelle[] { return getStellen().filter(s => s.status === "Veröffentlicht"); }
export function createStelle(data: Omit<Stelle, "id" | "erstellt">): Stelle {
  const stellen = getStellen();
  const stelle: Stelle = { ...data, id: uid(), erstellt: now() };
  stellen.push(stelle);
  localSet(LS_STELLEN, stellen);
  window.dispatchEvent(new Event("bewerbung-updated"));
  return stelle;
}
export function updateStelle(id: string, data: Partial<Stelle>) {
  const stellen = getStellen().map(s => s.id === id ? { ...s, ...data } : s);
  localSet(LS_STELLEN, stellen);
  window.dispatchEvent(new Event("bewerbung-updated"));
}
export function deleteStelle(id: string) {
  localSet(LS_STELLEN, getStellen().filter(s => s.id !== id));
  window.dispatchEvent(new Event("bewerbung-updated"));
}

// ── Termine (localStorage for now) ──
const defaultTermine: OnboardingTermin[] = [
  { id: "t1", datum: "2026-03-03", uhrzeit: "10:00", standort: "München – Leopoldstraße 42", maxTeilnehmer: 8 },
  { id: "t2", datum: "2026-03-10", uhrzeit: "14:00", standort: "Berlin – Friedrichstraße 108", maxTeilnehmer: 6 },
  { id: "t3", datum: "2026-03-17", uhrzeit: "09:00", standort: "Hamburg – Jungfernstieg 22", maxTeilnehmer: 10 },
];

export function getTermine(): OnboardingTermin[] { return localGet(LS_TERMINE, defaultTermine); }
export function getTerminById(id: string): OnboardingTermin | undefined { return getTermine().find(t => t.id === id); }
export function createTermin(data: Omit<OnboardingTermin, "id">): OnboardingTermin {
  const termine = getTermine();
  const termin: OnboardingTermin = { ...data, id: uid() };
  termine.push(termin);
  localSet(LS_TERMINE, termine);
  window.dispatchEvent(new Event("bewerbung-updated"));
  return termin;
}
export function updateTermin(id: string, data: Partial<OnboardingTermin>) {
  const termine = getTermine().map(t => t.id === id ? { ...t, ...data } : t);
  localSet(LS_TERMINE, termine);
  window.dispatchEvent(new Event("bewerbung-updated"));
}
export function deleteTermin(id: string) {
  localSet(LS_TERMINE, getTermine().filter(t => t.id !== id));
  window.dispatchEvent(new Event("bewerbung-updated"));
}

export function getBewerberByStelle(stelleId: string): Bewerber[] {
  return getBewerber().filter(b => b.stelleId === stelleId);
}

// ── Helper functions / constants used by pages ──

export function getTerminTeilnehmerCount(terminId: string): number {
  return getBewerber().filter(b => b.onboardingTerminId === terminId).length;
}

export function formatTerminDatum(datum: string): string {
  try {
    const d = new Date(datum);
    return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { return datum; }
}

export function getStellenShareUrl(stelleId: string): string {
  return `${window.location.origin}/bewerben?stelle=${stelleId}`;
}

export const statusColor: Record<BewerberStatus, string> = {
  "Eingang": "bg-blue-500",
  "Erstgespraech": "bg-yellow-500",
  "Closing": "bg-orange-500",
  "FollowUp": "bg-blue-600",
  "Bedenkzeit": "bg-violet-500",
  "Paketwahl": "bg-amber-500",
  "Vertrag": "bg-indigo-500",
  "Rechnung": "bg-purple-500",
  "Nutzer_anlegen": "bg-pink-500",
  "Aktiv": "bg-green-600",
  "KeinInteresse": "bg-amber-600",
  "Abgelehnt": "bg-red-500",
};

export const PIPELINE_COLORS: Record<BewerberStatus, string> = statusColor;

export const DOK_STATUS_COLOR: Record<string, string> = {
  "hochgeladen": "bg-blue-100 text-blue-800",
  "in_pruefung": "bg-yellow-100 text-yellow-800",
  "freigegeben": "bg-green-100 text-green-800",
  "abgelehnt": "bg-red-100 text-red-800",
};

export const VERTRAG_STATUS_LABELS: Record<VertragStatus, string> = {
  "nicht_gesendet": "Nicht gesendet",
  "gesendet": "Gesendet",
  "wartet_auf_kurz": "Wartet auf Gegenzeichnung MOREImmo",
  "unterschrieben": "Unterschrieben",
  "abgelehnt": "Abgelehnt",
};
