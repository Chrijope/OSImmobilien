import type { Sprache, ZweiSprachen } from "@/lib/seitenSprache";

/**
 * Texte des Handy-Scans, `/mobile-scan/:token`, in Deutsch und Englisch
 * (Kundensprache, Etappe 3, S7).
 *
 * Platzhalter wie `{zahl}` setzt `mitText` ein. Englisch nach dem Glossar
 * (`kundenspracheGlossar.ts`): Bonitätsprüfung heißt „credit check“, der
 * Vertriebspartner als Ansprechpartner des Kunden „your contact“.
 *
 * Zwei deutsche Sätze haben dabei ihren Gedankenstrich verloren (Projektregel:
 * keine Gedankenstriche in Texten, die Nutzer sehen): „Halte deine Dokumente
 * bereit: …“ und „Nur PDF-Dateien erlaubt. Bilder bitte …“.
 */
export interface MobileScanTexte {
  laedt: string;
  fehlerNichtGefunden: string;
  fehlerAbgelaufen: string;
  fehlerLaden: string;
  nichtVerfuegbar: string;
  kameraFehler: string;
  nurPdf: string;
  pdfHochgeladen: string;
  /** `{fehler}` ist die technische Meldung, sie bleibt, wie sie kommt. */
  uploadFehler: string;
  zusammengefuehrt: string;
  zusammenfuehrenFehler: string;
  dokumentHochgeladen: string;
  sitzungAbgeschlossen: string;
  abschliessenFehler: string;
  titel: string;
  introText: string;
  introPunkte: string[];
  scanStarten: string;
  sicher: string;
  /** Satz mit hervorgehobenem Status: Vor, Status, Nach. */
  fertigVor: string;
  inPruefung: string;
  fertigNach: string;
  hochgeladenZahl: string;
  nochOffen: string;
  fehlenHinweis: string;
  schliessenHinweis: string;
  listeHinweis: string;
  pflichtHinweis: string;
  pflicht: string;
  hochgeladen: string;
  abschliessen: string;
  zurueck: string;
  naechsteAufnahme: string;
  vorderseite: string;
  rueckseite: string;
  seiteN: string;
  seitenEins: string;
  seitenMehr: string;
  ausweisVorderseite: string;
  ausweisRueckseite: string;
  ausweisRahmen: string;
  ersteSeite: string;
  seiteEntfernen: string;
  farbe: string;
  schwarzWeiss: string;
  vorschauBearbeiten: string;
  pdfWaehlen: string;
  fotoAufnehmen: string;
  ladeHoch: string;
  fertigPdf: string;
  pdfHinweisVor: string;
  pdfHinweisNach: string;
  vorschau: string;
  bearbeiten: string;
  entfernen: string;
  weitereSeite: string;
  hochladen: string;
  editorTitel: string;
  editorUntertitel: string;
  editorBild: string;
  schliessen: string;
  links: string;
  rechts: string;
  zuruecksetzen: string;
  abbrechen: string;
  uebernehmen: string;
  /** Die Liste „Hochgeladen“ (`MobileScanHochgeladen`). */
  liste: {
    titel: string;
    zahlEins: string;
    zahlMehr: string;
    fertig: string;
    laedt: string;
    laedtText: string;
    fehler: string;
    fehlerText: string;
  };
}

export const MOBILE_SCAN_TEXTE: ZweiSprachen<MobileScanTexte> = {
  de: {
    laedt: "Wird geladen",
    fehlerNichtGefunden: "Sitzung nicht gefunden",
    fehlerAbgelaufen: "Diese Scan-Sitzung ist abgelaufen. Bitte am Computer einen neuen QR-Code erzeugen.",
    fehlerLaden: "Fehler beim Laden der Sitzung",
    nichtVerfuegbar: "Sitzung nicht verfügbar",
    kameraFehler: "Kamera nicht verfügbar. Bitte Berechtigungen prüfen.",
    nurPdf: "Nur PDF-Dateien erlaubt. Bilder bitte über die Kamera scannen.",
    pdfHochgeladen: "PDF hochgeladen ✓",
    uploadFehler: "Upload fehlgeschlagen: {fehler}",
    zusammengefuehrt: "{zahl} PDFs zusammengeführt & hochgeladen ✓",
    zusammenfuehrenFehler: "Zusammenführen fehlgeschlagen: {fehler}",
    dokumentHochgeladen: "Dokument hochgeladen ✓",
    sitzungAbgeschlossen: "Sitzung abgeschlossen",
    abschliessenFehler: "Sitzung konnte nicht abgeschlossen werden",
    titel: "Bonitätsunterlagen scannen",
    introText:
      "Willkommen! Wir führen dich Schritt für Schritt durch das Hochladen deiner Pflichtunterlagen. Halte deine Dokumente bereit: Personalausweis, Gehaltsnachweise, Schufa und weitere.",
    introPunkte: [
      "Fotografiere jedes Dokument direkt mit deiner Handykamera",
      "Mehrseitige Unterlagen werden automatisch zu einer PDF zusammengeführt",
      "Alles wird in Echtzeit sicher an dein Vertriebspartner-Team übertragen",
    ],
    scanStarten: "Scan starten",
    sicher: "Sichere Verbindung · Sitzung gültig für 1 Stunde",
    fertigVor: "Deine Uploads wurden in Echtzeit ins System übertragen und stehen dort unter „",
    inPruefung: "In Prüfung",
    fertigNach: "\" zur Sichtung bereit.",
    hochgeladenZahl: "hochgeladen",
    nochOffen: "noch offen",
    fehlenHinweis:
      "Hinweis: Es fehlen noch Pflichtunterlagen. Du kannst diese später am Computer oder erneut per QR-Code nachreichen.",
    schliessenHinweis: "Du kannst dieses Fenster jetzt schließen. Der QR-Code ist aus Sicherheitsgründen nicht mehr aktiv.",
    listeHinweis: "Tippe auf ein Dokument, um es zu fotografieren oder hochzuladen.",
    pflichtHinweis: "Alle aufgeführten Unterlagen sind Pflichtunterlagen für deine Bonitätsprüfung.",
    pflicht: "Pflicht",
    hochgeladen: "Hochgeladen",
    abschliessen: "Sitzung abschließen ({zahl} Dokumente)",
    zurueck: "Zurück",
    naechsteAufnahme: "Nächste Aufnahme: {seite}",
    vorderseite: "Vorderseite",
    rueckseite: "Rückseite",
    seiteN: "Seite {zahl}",
    seitenEins: "{zahl} Seite",
    seitenMehr: "{zahl} Seiten",
    ausweisVorderseite: "Ausweis Vorderseite",
    ausweisRueckseite: "Ausweis Rückseite",
    ausweisRahmen: "Ausweis im Rahmen platzieren und Foto auslösen",
    ersteSeite: "Tippe auf den weißen Knopf, um die erste Seite zu fotografieren",
    seiteEntfernen: "Seite entfernen",
    farbe: "Farbe",
    schwarzWeiss: "S/W",
    vorschauBearbeiten: "Vorschau & Bearbeiten",
    pdfWaehlen: "PDF wählen",
    fotoAufnehmen: "Foto aufnehmen",
    ladeHoch: "Lade hoch…",
    fertigPdf: "Fertig & PDF",
    pdfHinweisVor: "Mit „Fertig & PDF\" wird sofort ein PDF erstellt und im System unter „",
    pdfHinweisNach: "\" abgelegt.",
    vorschau: "Vorschau",
    bearbeiten: "Bearbeiten",
    entfernen: "Entfernen",
    weitereSeite: "Weitere Seite",
    hochladen: "Hochladen",
    editorTitel: "Seite bearbeiten",
    editorUntertitel: "Drehen & Zuschneiden",
    editorBild: "bearbeiten",
    schliessen: "Schließen",
    links: "Links",
    rechts: "Rechts",
    zuruecksetzen: "Reset",
    abbrechen: "Abbrechen",
    uebernehmen: "Übernehmen",
    liste: {
      titel: "Hochgeladen",
      zahlEins: "{zahl} Dokument in dieser Sitzung",
      zahlMehr: "{zahl} Dokumente in dieser Sitzung",
      fertig: "Hochgeladen",
      laedt: "Wird hochgeladen",
      laedtText: "Wird hochgeladen …",
      fehler: "Fehlgeschlagen",
      fehlerText: "Hochladen fehlgeschlagen. Tippe oben auf das Dokument und versuche es erneut.",
    },
  },
  en: {
    laedt: "Loading",
    fehlerNichtGefunden: "Session not found",
    fehlerAbgelaufen: "This scan session has expired. Please create a new QR code on your computer.",
    fehlerLaden: "The session couldn't be loaded",
    nichtVerfuegbar: "Session not available",
    kameraFehler: "Camera not available. Please check your permissions.",
    nurPdf: "Only PDF files are allowed. Please scan images with the camera.",
    pdfHochgeladen: "PDF uploaded ✓",
    uploadFehler: "Upload failed: {fehler}",
    zusammengefuehrt: "{zahl} PDFs merged & uploaded ✓",
    zusammenfuehrenFehler: "Merging failed: {fehler}",
    dokumentHochgeladen: "Document uploaded ✓",
    sitzungAbgeschlossen: "Session completed",
    abschliessenFehler: "The session couldn't be completed",
    titel: "Scan your credit check documents",
    introText:
      "Welcome! We'll guide you step by step through uploading your required documents. Have your documents ready: ID card, pay slips, Schufa report and more.",
    introPunkte: [
      "Photograph each document directly with your phone camera",
      "Documents with several pages are automatically merged into one PDF",
      "Everything is sent securely and in real time to your contact at MOREImmo",
    ],
    scanStarten: "Start scan",
    sicher: "Secure connection · Session valid for 1 hour",
    fertigVor: "Your uploads have been sent to the system in real time and are waiting there under “",
    inPruefung: "In review",
    fertigNach: "” to be checked.",
    hochgeladenZahl: "uploaded",
    nochOffen: "still open",
    fehlenHinweis:
      "Note: some required documents are still missing. You can hand them in later on your computer or with a new QR code.",
    schliessenHinweis: "You can close this window now. For security reasons, the QR code is no longer active.",
    listeHinweis: "Tap a document to photograph or upload it.",
    pflichtHinweis: "All documents listed are required for your credit check.",
    pflicht: "Required",
    hochgeladen: "Uploaded",
    abschliessen: "Complete session ({zahl} documents)",
    zurueck: "Back",
    naechsteAufnahme: "Next shot: {seite}",
    vorderseite: "front",
    rueckseite: "back",
    seiteN: "Page {zahl}",
    seitenEins: "{zahl} page",
    seitenMehr: "{zahl} pages",
    ausweisVorderseite: "ID card front",
    ausweisRueckseite: "ID card back",
    ausweisRahmen: "Place your ID card inside the frame and take the photo",
    ersteSeite: "Tap the white button to photograph the first page",
    seiteEntfernen: "Remove page",
    farbe: "Colour",
    schwarzWeiss: "B/W",
    vorschauBearbeiten: "Preview & edit",
    pdfWaehlen: "Choose PDF",
    fotoAufnehmen: "Take photo",
    ladeHoch: "Uploading…",
    fertigPdf: "Done & PDF",
    pdfHinweisVor: "“Done & PDF” creates a PDF straight away and files it in the system under “",
    pdfHinweisNach: "”.",
    vorschau: "Preview",
    bearbeiten: "Edit",
    entfernen: "Remove",
    weitereSeite: "Add page",
    hochladen: "Upload",
    editorTitel: "Edit page",
    editorUntertitel: "Rotate & crop",
    editorBild: "Page being edited",
    schliessen: "Close",
    links: "Left",
    rechts: "Right",
    zuruecksetzen: "Reset",
    abbrechen: "Cancel",
    uebernehmen: "Apply",
    liste: {
      titel: "Uploaded",
      zahlEins: "{zahl} document in this session",
      zahlMehr: "{zahl} documents in this session",
      fertig: "Uploaded",
      laedt: "Uploading",
      laedtText: "Uploading …",
      fehler: "Failed",
      fehlerText: "Upload failed. Tap the document above and try again.",
    },
  },
};

/** Setzt Platzhalter wie `{zahl}` ein. */
export function mitText(vorlage: string, werte: Record<string, string | number>): string {
  return Object.entries(werte).reduce(
    (text, [schluessel, wert]) => text.split(`{${schluessel}}`).join(String(wert)),
    vorlage,
  );
}

/* ── Dokumentnamen ──────────────────────────────────────────── */

/**
 * Die Standardlisten, wenn die Sitzung keine eigene Liste mitbringt.
 * Unverändert aus `MobileScan.tsx` hierher verlegt, damit der Test sie gegen
 * das Wörterbuch prüfen kann.
 */
export const STANDARD_DOKUMENTE_P1 = [
  "Personalausweis",
  "Letzter Gehaltsnachweis",
  "Vorletzter Gehaltsnachweis",
  "Vorvorletzter Gehaltsnachweis",
  "Gehaltsnachweis Dezember Vorjahr",
  "Schufa-Bonitätsauskunft",
  "Lohnsteuerbescheinigung des Vorjahrs",
  'Letzter Steuerbescheid / „Negativ-Erklärung"',
  'Eigener Mietvertrag / „Mietfrei-Bestätigung"',
  "Arbeitsvertrag",
  "Aktuelle Renteninformation",
  "Eigenkapitalnachweis",
];

export const STANDARD_DOKUMENTE_P2 = [
  "Personalausweis Person 2",
  "Letzter Gehaltsnachweis Person 2",
  "Vorletzter Gehaltsnachweis Person 2",
  "Vorvorletzter Gehaltsnachweis Person 2",
  "Gehaltsnachweis Dezember Vorjahr Person 2",
  "Schufa-Bonitätsauskunft Person 2",
  "Lohnsteuerbescheinigung Vorjahr Person 2",
  'Steuerbescheid / „Negativ-Erklärung" Person 2',
  "Arbeitsvertrag Person 2",
  "Eigenkapitalnachweis Person 2",
];

/**
 * Deutscher Dokumentname → englischer Anzeigename.
 *
 * Die Namen sind zugleich der Unterlagentyp im CRM (`docTyp`, Schlüssel in
 * `docStatuses`) und werden deutsch gespeichert. Übersetzt wird deshalb nur
 * die Anzeige, gespeichert und hochgeladen wird immer der deutsche Name.
 *
 * Hier stehen die Grundnamen. Die Fassung für die zweite Person („… Person 2“)
 * und die Nachweise je Vermögenswert oder Konto („Nachweis: …“) setzt
 * `dokumentnameAnzeige` zusammen. Deutsche Fachbegriffe stehen nach dem
 * Glossar mit dem deutschen Wort in Klammern, damit der Kunde das Dokument in
 * seinen Unterlagen wiederfindet.
 */
export const DOKUMENTNAMEN_EN: Readonly<Record<string, string>> = {
  // Bonität (Standardliste, `bonitaetDocs.ts`, `portalUnterlagenListe.ts`)
  "Selbstauskunft": "Self-disclosure (Selbstauskunft)",
  "Personalausweis": "ID card",
  "Letzter Gehaltsnachweis": "Most recent pay slip",
  "Vorletzter Gehaltsnachweis": "Second most recent pay slip",
  "Vorvorletzter Gehaltsnachweis": "Third most recent pay slip",
  "Gehaltsnachweis Dezember Vorjahr": "Pay slip for December of last year",
  "Schufa-Bonitätsauskunft": "Schufa credit report",
  // Bankprüfung (`bankpruefungDocs.ts`, `bankpruefungListe.ts`)
  "Lohnsteuerbescheinigung des Vorjahrs": "Annual wage tax statement for last year (Lohnsteuerbescheinigung)",
  "Lohnsteuerbescheinigung Vorjahr": "Annual wage tax statement for last year (Lohnsteuerbescheinigung)",
  'Letzter Steuerbescheid / „Negativ-Erklärung"': 'Most recent tax assessment (Steuerbescheid) / "no tax return" declaration',
  'Steuerbescheid / „Negativ-Erklärung"': 'Tax assessment (Steuerbescheid) / "no tax return" declaration',
  'Eigener Mietvertrag / „Mietfrei-Bestätigung"': 'Your own tenancy agreement / "rent-free" confirmation',
  "Arbeitsvertrag": "Employment contract",
  "Aktuelle Renteninformation": "Current pension statement (Renteninformation)",
  "Eigenkapitalnachweis": "Proof of equity",
  "Steuerbescheide der letzten 3 Jahre": "Tax assessments (Steuerbescheide) for the last 3 years",
  "Steuererklärungen der letzten 3 Jahre": "Tax returns for the last 3 years",
  "Bilanz / BWA der letzten 3 Jahre": "Balance sheet / management accounts (BWA) for the last 3 years",
  "Handelsregisterauszug": "Extract from the commercial register (Handelsregister)",
  "Ernennungsurkunde": "Certificate of appointment as a civil servant",
  "Aktuelle Besoldungsbescheide (letzte 3 Monate)": "Current civil service pay statements (last 3 months)",
  "Kontoauszüge der letzten 3 Monate": "Bank statements for the last 3 months",
  "Geschäftskontoauszüge der letzten 3 Monate": "Business account statements for the last 3 months",
  "PKV Nachweis": "Proof of private health insurance (PKV)",
  "Mietvertrag": "Tenancy agreement",
  "Mietfreibestätigung": "Rent-free confirmation",
  "Kreditvertrag Autokredit": "Car loan agreement",
  "Kreditvertrag Privatkredit": "Personal loan agreement",
  "Kreditvertrag Sonstige": "Other loan agreement",
  "Darlehensvertrag Hypothek": "Mortgage loan agreement",
  "Mietvertrag Vermietungsobjekt": "Tenancy agreement for your let property",
};

const PERSON_2 = " Person 2";
const NACHWEIS = "Nachweis: ";

function grundnameEnglisch(grundname: string): string | null {
  const direkt = DOKUMENTNAMEN_EN[grundname];
  if (direkt) return direkt;
  // „Nachweis: Tagesgeld, Sparkasse“: Art und Institut kommen aus der
  // Selbstauskunft und bleiben, wie sie dort stehen.
  if (grundname.startsWith(NACHWEIS)) return `Proof: ${grundname.slice(NACHWEIS.length)}`;
  return null;
}

/**
 * Der Name eines Dokuments zur Anzeige. Deutsch unverändert. Englisch aus
 * dem Wörterbuch; fehlt ein Eintrag (etwa eine von Hand ergänzte Unterlage),
 * bleibt der deutsche Name stehen.
 */
export function dokumentnameAnzeige(name: string, sprache: Sprache): string {
  if (sprache !== "en") return name;
  const zweite = name.endsWith(PERSON_2);
  const grundname = zweite ? name.slice(0, -PERSON_2.length) : name;
  const englisch = grundnameEnglisch(grundname);
  if (!englisch) return name;
  return zweite ? `${englisch} (person 2)` : englisch;
}
