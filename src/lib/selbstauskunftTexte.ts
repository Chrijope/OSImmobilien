/**
 * Die Oberflächentexte der Selbstauskunft auf Englisch.
 *
 * Plan Kundensprache vom 25.09.2026, Etappe 4. Ein Kunde mit Englisch im
 * Profil füllt das Online-Formular (`/sa/:token`), die Handy-Unterschrift
 * (`/sa-mobile-sign`) und die Korrektur vor der Unterschrift auf Englisch aus.
 *
 * So funktioniert es:
 *   - Das Formular schreibt seine Texte weiter auf Deutsch in den Quelltext
 *     und reicht sie durch `saText` („t“ im Formular). Auf Deutsch kommt der
 *     Text unverändert zurück, auf Englisch die Übersetzung aus `SA_UI_EN`.
 *     Fehlt ein Eintrag, bleibt es beim Deutschen; ein Test
 *     (`selbstauskunftTexte.test.ts`) meldet jeden fehlenden Eintrag.
 *   - Platzhalter in geschweiften Klammern („{anzahl}“) werden nach der
 *     Übersetzung eingesetzt.
 *   - Heißt ein deutscher Text an zwei Stellen dasselbe, meint aber
 *     Verschiedenes, trägt der Schlüssel hinter „|“ einen Zusatz
 *     („Unterschrift übertragen|Überschrift“). Deutsch zeigt nur den Teil
 *     davor.
 *
 * Was hier nicht steht:
 *   - Die gespeicherten Auswahlwerte („Verheiratet“, „Zur Miete“): Die
 *     übersetzt `saWertAnzeige` aus `selbstauskunftSprache.ts`. Gespeichert
 *     wird immer der deutsche Wert.
 *   - Die Rechtstexte (Erklärung, SCHUFA-Klausel, Einwilligung): ebenfalls
 *     `selbstauskunftSprache.ts`, zweisprachig mit deutschem Vorrang.
 *
 * Stil: Die deutsche Selbstauskunft siezt (Gruppe F). Das Englisch ist
 * förmlich, britisch und ohne Kurzformen („you will“, nicht „you'll“),
 * Fachbegriffe nach `kundenspracheGlossar.ts`. Keine Gedankenstriche.
 */
import type { Sprache } from "./kundenSprache";
import { SA_WERTE_EN } from "./selbstauskunftSprache";
import {
  SA_ABSCHNITT_BESTAETIGEN,
  SA_FELD_MARKE,
  SA_LEGENDE_UEBERNOMMEN,
  SA_VORBELEGUNG_TITEL,
  saAbschnittText,
  saFeldMarkeErklaerung,
  saVorbelegungText,
} from "./saVorbelegung";

/** Werte für die Platzhalter in geschweiften Klammern. */
export type SaTextWerte = Readonly<Record<string, string | number>>;

/**
 * Deutscher Oberflächentext → Englisch.
 *
 * Geordnet wie das Formular. Schlüssel sind die deutschen Texte, genau wie sie
 * im Quelltext stehen (auch Emojis und Anführungszeichen).
 */
export const SA_UI_EN: Readonly<Record<string, string>> = {
  /* ── Rahmen, Schritte, Knöpfe ─────────────────────────────── */
  Selbstauskunft: "Self-disclosure",
  "Wünsche & Ziele": "Goals and objectives",
  "Persönliche Angaben": "Personal details",
  Einnahmen: "Income",
  Ausgaben: "Expenses",
  Vermögenswerte: "Assets",
  Verbindlichkeiten: "Liabilities",
  "Sonstige Angaben": "Other information",
  Abschluss: "Completion",
  Weiter: "Next",
  Zurück: "Back",
  Zwischenspeichern: "Save progress",
  Speichern: "Save",
  "An Kunde senden": "Send to customer",
  "Wird gesendet ...": "Sending...",
  Senden: "Send",
  Pflicht: "Required",
  Pflichtfeld: "required field",
  "Leere Pflichtfelder sind": "Empty required fields have an",
  "orange umrandet": "orange border",
  Fehler: "Error",
  rot: "red",
  Für: "For",
  "sind die persönlichen Angaben (Vor-, Nachname, Geburtsdatum) Pflicht, dazu die Angaben zu eingetragenen Krediten.":
    "the personal details (first name, surname, date of birth) are required, as well as the details of any loans entered.",
  "Erklärung anzeigen": "Show explanation",
  "TT.MM.JJJJ": "DD.MM.YYYY",
  "0,00": "0.00",
  "Zwischenstand vom {datum} geladen": "Saved progress from {datum} loaded",
  "Gespeichert: {datum}": "Saved: {datum}",
  "Noch zu prüfen: {abschnitte}": "Still to be checked: {abschnitte}",
  "Pflichtfelder ausfüllen": "Please complete the required fields",
  "Bitte alle markierten Felder ausfüllen.": "Please complete all highlighted fields.",
  "Zwischenstand gespeichert ✓": "Progress saved ✓",
  "Die bisherigen Eingaben wurden gesichert. Du kannst die Seite jetzt verlassen und später fortfahren.":
    "Your entries so far have been saved. You may now leave this page and continue later.",
  "Deine Eingaben sind auf diesem Gerät gesichert. Die Synchronisierung mit dem Server erfolgt automatisch, sobald sie wieder möglich ist.":
    "Your entries have been saved on this device. They will be synchronised with the server automatically as soon as this is possible again.",

  /* ── Vorbelegung aus dem vorherigen Investment (saVorbelegung.ts) ── */
  [SA_VORBELEGUNG_TITEL]: "We have carried over information for you",
  [SA_FELD_MARKE]: "Carried over",
  [SA_LEGENDE_UEBERNOMMEN]: "comes from the previous investment, has a dashed border, please check.",
  [SA_ABSCHNITT_BESTAETIGEN]: "Information checked",

  /* ── Schritt 0: Wünsche und Ziele ─────────────────────────── */
  "Bitte 1–{max} Ziele auswählen": "Please select 1 to {max} goals",
  "{anzahl} / {max} ausgewählt": "{anzahl} of {max} selected",

  /* ── Schritt 1: Persönliche Angaben ───────────────────────── */
  "Persönliche Angaben: Angaben Person 1": "Personal details: Person 1",
  "Persönliche Angaben: Angaben Person 2": "Personal details: Person 2",
  "Person 1": "Person 1",
  "Person 2": "Person 2",
  "Person 2 anlegen": "Add Person 2",
  "Person 2 dauerhaft entfernen": "Permanently remove Person 2",
  "Zweite Person aufnehmen, wenn die Finanzierung gemeinsam laufen soll, zum Beispiel Ehe- oder Lebenspartner. Beide Personen unterschreiben am Ende.":
    "Add a second person if the financing is to be taken out jointly, for example with a spouse or partner. Both persons sign at the end.",
  "– Bitte wählen –": "Please select",
  "Bitte wählen": "Please select",
  "– wählen –": "Select",
  "– keine –": "None",
  Anrede: "Title (Mr/Ms)",
  Titel: "Academic title",
  Vorname: "First name",
  Nachname: "Surname",
  Geburtsname: "Name at birth",
  Geburtsdatum: "Date of birth",
  "Steuer-ID": "Tax ID (Steuer-ID)",
  "XXX/XXX/XXXXX": "XXX/XXX/XXXXX",
  Staatsangehörigkeit: "Nationality",
  "Bei anderer Staatsangehörigkeit bitte das Land eintragen. Die Bank fragt das für die Finanzierungsprüfung ab.":
    "If you have another nationality, please enter the country. The bank asks for this as part of the financing assessment.",
  Deutsch: "German",
  Andere: "Other",
  Straße: "Street",
  "Straße eingeben...": "Enter street...",
  Hausnummer: "House number",
  PLZ: "Postcode",
  Ort: "Town or city",
  Telefon: "Telephone",
  Mobilfunk: "Mobile",
  "E-Mailadresse": "Email address",
  Familienstand: "Marital status",
  "Seit wann wohnhaft an obiger Anschrift?": "How long have you lived at the above address?",
  Kinder: "Children",
  "Kind hinzufügen": "Add child",
  "Kind entfernen": "Remove child",
  Name: "Name",
  "lebt im Haushalt": "lives in the household",
  "Haken gesetzt, wenn das Kind im eigenen Haushalt lebt. Das braucht die Bank für die Haushaltsrechnung. Für Kinder außerhalb des Haushalts gibt es gegebenenfalls Unterhaltszahlungen bei den Ausgaben.":
    "Tick this box if the child lives in your household. The bank needs this for the household budget calculation. For children outside the household, any maintenance payments are entered under expenses.",
  "Optional – falls leer, wird die E-Mail von Person 1 für den Unterschrifts-Link verwendet.":
    "Optional: if left empty, the email address of Person 1 will be used for the signature link.",
  "Steuerliche & familiäre Angaben": "Tax and family details",
  "Von den Banken für die Bonitätsprüfung benötigt.": "Required by the banks for the credit check.",
  Steuerklasse: "Tax class (Steuerklasse)",
  "Steuerklasse Person 2": "Tax class (Steuerklasse) Person 2",
  "Klasse {k}": "Class {k}",
  Kirchensteuerpflicht: "Liable for church tax",
  "Kirchensteuerpflicht Person 2": "Liable for church tax, Person 2",
  Güterstand: "Matrimonial property regime",
  "Zugewinngemeinschaft (gesetzlich)": SA_WERTE_EN.gesetzlich,
  Gütertrennung: SA_WERTE_EN.guetertrennung,
  Gütergemeinschaft: SA_WERTE_EN.guetergemeinschaft,
  Ja: "Yes",
  Nein: "No",

  /* ── Schritt 2: Einnahmen ─────────────────────────────────── */
  Beschäftigungsart: "Type of employment",
  "Die Haupttätigkeit auswählen. Danach richten sich die folgenden Felder.":
    "Select your main occupation. The following fields depend on this choice.",
  Angestellt: "Employed",
  Selbstständig: "Self-employed",
  "Hausfrau / Hausmann": "Homemaker",
  Anstellung: "Employment",
  Selbstständigkeit: "Self-employment",
  Branche: "Industry",
  Firma: "Company",
  Berufsbezeichnung: "Job title",
  "Angestellt seit": "Employed since",
  "Selbständig seit": "Self-employed since",
  "Anzahl Mitarbeiter": "Number of employees",
  Probezeit: "Probationary period",
  "Ja, wenn die Probezeit im aktuellen Arbeitsverhältnis noch läuft.":
    "Yes, if the probationary period in your current employment is still running.",
  Bankkonten: "Bank accounts",
  "Bankkonten Person 2": "Bank accounts Person 2",
  "Angabe optional – nur ausfüllen wenn vorhanden": "Optional: only complete if applicable",
  Konto: "Account",
  Institut: "Bank",
  IBAN: "IBAN",
  "DE89 3704 0044 0532 0130 00": "DE89 3704 0044 0532 0130 00",
  "Konto hinzufügen": "Add account",
  // Die X-Knöpfe tragen auf Deutsch fälschlich „Hinzufügen“, sie entfernen
  // einen Eintrag. Das deutsche Vorleseetikett bleibt (Vorgabe: Deutsch
  // unverändert), das englische sagt, was der Knopf tut.
  "Hinzufügen|entfernt einen Eintrag": "Remove entry",
  "Einkommen: Angaben Person 1": "Income: Person 1",
  "Einkommen Person 2": "Income Person 2",
  "Alle Angaben monatlich": "All figures per month",
  "Netto-Gehalt": "Net salary",
  "Einkünfte aus Gewerbebetrieb (netto)": "Income from business operations (net)",
  "Miet- & Pachteinnahmen (kalt)": "Rental and lease income (net cold rent)",
  Zinserträge: "Interest income",
  "Rente / Pension": "State or company pension",
  Kindergeld: "Child benefit (Kindergeld)",
  "{anzahl} Kind(er) hinterlegt – Kindergeld ist Pflicht":
    "{anzahl} child(ren) entered: child benefit is required",
  "Sonstige Einkünfte (z.B. Nebenjob)": "Other income (e.g. second job)",
  "Sonstige Einkünfte": "Other income",
  "Jahresbrutto (gesamt)": "Annual gross income (total)",
  "Jahreswert, nicht monatlich: das gesamte Bruttojahresgehalt vor Steuern, einschließlich Sonderzahlungen wie dem 13. und 14. Gehalt. Wie viele Monatsgehälter gezahlt werden, wird weiter unten getrennt abgefragt. Wir brauchen die Zahl für die Steuerberechnung im Investmentrechner.":
    "Annual figure, not monthly: your total gross annual salary before tax, including special payments such as a 13th and 14th salary. The number of monthly salaries paid is asked separately further below. We need this figure for the tax calculation in the investment calculator.",
  "Jahreswert, nicht monatlich: das gesamte Bruttojahresgehalt vor Steuern, einschließlich Sonderzahlungen wie dem 13. und 14. Gehalt.":
    "Annual figure, not monthly: the total gross annual salary before tax, including special payments such as a 13th and 14th salary.",
  "Zu versteuerndes Jahreseinkommen": "Taxable annual income",
  "Freiwillige Angabe. Sie finden den Wert in Ihrem letzten Einkommensteuerbescheid in der Zeile „zu versteuerndes Einkommen“.":
    "Optional. You will find this figure in your most recent income tax assessment notice, in the line “zu versteuerndes Einkommen” (taxable income).",
  "Bei Zusammenveranlagung tragen Sie bitte das gemeinsame zu versteuernde Einkommen laut Steuerbescheid ein.":
    "If you are assessed jointly, please enter the joint taxable income as stated in your tax assessment notice.",
  "Zu versteuerndes Jahreseinkommen: gemeinsam mit Person 1 angegeben.":
    "Taxable annual income: stated jointly with Person 1.",
  "Beschäftigungsart & Einkommen: Person 2": "Type of employment and income: Person 2",
  "Bitte wählen Sie die Beschäftigungsart für Person 2 aus.": "Please select the type of employment for Person 2.",
  "Bank-Ergänzung: Gehaltszahlung & Vertrag": "Additional bank details: salary payments and contract",
  "Diese Felder werden von den meisten Banken zusätzlich zum Netto abgefragt.":
    "Most banks ask for these fields in addition to the net salary.",
  Monatsgehälter: "Monthly salaries per year",
  Arbeitsverhältnis: "Employment contract",
  Unbefristet: "Permanent",
  "In Probezeit": "On probation",
  Befristet: "Fixed-term",
  "Befristet bis": "Fixed-term until",

  /* ── Schritt 3: Ausgaben ──────────────────────────────────── */
  "Ausgaben: Angaben Person 1": "Expenses: Person 1",
  "Ausgaben: Angaben Person 2": "Expenses: Person 2",
  Wohnsituation: "Living situation",
  Kaltmiete: "Net cold rent (Kaltmiete)",
  Lebenshaltungskosten: "Living expenses",
  "Private Krankenversicherung": "Private health insurance",
  "Sonstige Ausgaben": "Other expenses",
  "Wofür?": "What for?",
  "z. B. Kita, Vereinsbeiträge": "e.g. nursery, club memberships",
  "Kurz benennen, sonst kann die Bank den Betrag nicht einordnen":
    "Please describe briefly, otherwise the bank cannot classify the amount",
  "Kredite / Verbindlichkeiten": "Loans and liabilities",
  "Kredite / Verbindlichkeiten Person 2": "Loans and liabilities Person 2",
  "Keine Kredite hinterlegt. Falls vorhanden, bitte hinzufügen.": "No loans entered. If you have any, please add them.",
  "Keine Kredite hinterlegt.": "No loans entered.",
  "Art des Kredits": "Type of loan",
  Bezeichnung: "Description",
  "z. B. VW Bank": "e.g. VW Bank",
  "Monatliche Rate": "Monthly instalment",
  Restschuld: "Remaining debt",
  Laufzeitende: "End of term",
  "Kredit hinzufügen": "Add loan",
  "Bank-Ergänzung: Detaillierte Ausgaben": "Additional bank details: detailed expenses",
  "Feinere Aufschlüsselung für die Bonitätsprüfung. Alle Angaben monatlich. Bitte hier alle Versicherungsbeiträge detailliert erfassen.":
    "A more detailed breakdown for the credit check. All figures per month. Please enter all insurance premiums here in detail.",
  "Wohnnebenkosten (Strom, Heizung usw.)": "Household running costs (electricity, heating, etc.)",
  Unterhaltszahlungen: "Maintenance payments",
  "Anzahl KFZ": "Number of vehicles",
  "KFZ-Kosten (Versicherung + Sprit)": "Vehicle costs (insurance and fuel)",
  "KFZ-Kosten": "Vehicle costs",
  "Gesamtkosten für alle {anzahl} Fahrzeuge zusammen, nicht je Fahrzeug":
    "Total costs for all {anzahl} vehicles together, not per vehicle",
  Berufsunfähigkeitsversicherung: "Occupational disability insurance",
  "Berufsunfähigkeitsvers.": "Occupational disability insurance",
  "Riester-Vertrag": "Riester pension contract",
  Riester: "Riester pension",
  "Sonstige Altersvorsorge": "Other retirement provision",
  "Sonstige AV": "Other retirement provision",
  "Weitere Versicherungen": "Other insurance",
  "Bank-Ergänzung: Kredit-Details": "Additional bank details: loan details",
  "Zusätzliche Angaben pro Kredit für die Bonitätsprüfung.": "Additional details per loan for the credit check.",
  "Kredit {nr}": "Loan {nr}",
  Kredit: "Loan",
  "Bank / Darlehensgeber": "Bank or lender",
  Ursprungskredit: "Original loan amount",
  "Zinssatz (%)": "Interest rate (%)",
  Vertragsbeginn: "Start of contract",
  "Zinsbindung bis": "Fixed-interest period until",
  Verwendungszweck: "Purpose of the loan",
  "Gehört zu Immobilie": "Belongs to property",
  "Nur bei Immobiliendarlehen: die zugehörige Immobilie aus dem Block Immobilienvermögen auswählen. Im Dokument steht das Darlehen dann direkt bei dieser Immobilie.":
    "For property loans only: select the related property from the real estate section. In the document, the loan will then be shown directly with this property.",
  "Keine / allgemeiner Kredit": SA_WERTE_EN.keine,
  "Immobilie {nr}": "Property {nr}",
  /* ── Kreditdetails: Pflicht je Kreditart, Person 2 (28.09.2026) ── */
  "Bank-Ergänzung: Kredit-Details Person 2": "Additional bank details: loan details Person 2",
  "Restschuld per": "Remaining debt as of",
  "Zins fest oder variabel": "Fixed or variable interest",
  Fest: "Fixed",
  Variabel: "Variable",
  Sondertilgungsrecht: "Right to make special repayments",
  Unbekannt: "Unknown",
  Kreditnehmer: "Borrower",
  "Beide gemeinsam": "Both jointly",
  "Die Immobilie aus dem Block Immobilienvermögen, auf die sich dieses Darlehen bezieht. Im Dokument steht das Darlehen dann direkt bei dieser Immobilie.":
    "The property from the real estate section to which this loan relates. In the document, the loan will then be shown directly with this property.",
  "Dieser Immobilienkredit muss einer Immobilie zugeordnet werden. Bitte legen Sie die belastete Immobilie unter Vermögenswerte im Block „Immobilienvermögen (Details)\" an.":
    "This property loan must be assigned to a property. Please add the encumbered property under Assets in the section \"Real estate (details)\".",
  "Zu den Vermögenswerten": "Go to assets",
  "Immobilienvermögen Person 2 (Details)": "Real estate Person 2 (details)",
  "Bitte im Block „Immobilienvermögen Person 2 (Details)\" vollständig eintragen.":
    "Please complete the details in the section \"Real estate Person 2 (details)\".",
  "Für einen Immobilienkredit fehlt die belastete Immobilie. Bitte legen Sie sie unter „Immobilienvermögen (Details)\" an.":
    "The encumbered property is missing for a property loan. Please add it under \"Real estate (details)\".",
  "Für einen Immobilienkredit fehlt die belastete Immobilie. Bitte legen Sie sie hier an.":
    "The encumbered property is missing for a property loan. Please add it here.",
  "Bei Kredit {nr} fehlen noch: {felder}": "The following details are still missing for loan {nr}: {felder}",
  "Bei Kredit {nr} von Person 2 fehlen noch: {felder}": "The following details are still missing for loan {nr} of Person 2: {felder}",
  "Wird die Immobilie noch abbezahlt?": "Is the property still being paid off?",
  "Sie haben eine Immobilie im Bestand angegeben, bei den Ausgaben aber keinen Immobilienkredit eingetragen. Läuft für die Immobilie noch ein Kredit, tragen Sie ihn bitte bei den Ausgaben unter „Kredite / Verbindlichkeiten\" samt Kreditdetails ein.":
    "You have stated that you own a property, but you have not entered a property loan under expenses. If a loan is still outstanding on the property, please enter it under expenses in \"Loans and liabilities\" together with the loan details.",
  "Für {name} ist eine Immobilie im Bestand angegeben, bei den Ausgaben aber kein Immobilienkredit eingetragen. Läuft für die Immobilie noch ein Kredit, tragen Sie ihn bitte bei den Ausgaben unter „Kredite / Verbindlichkeiten\" samt Kreditdetails ein.":
    "A property is stated for {name}, but no property loan has been entered under expenses. If a loan is still outstanding on the property, please enter it under expenses in \"Loans and liabilities\" together with the loan details.",
  "Nein, schuldenfrei": "No, free of debt",
  "Ja, Kredit eintragen": "Yes, enter the loan",
  "Immobilienkredit angelegt": "Property loan added",
  "Bitte ergänzen Sie bei den Ausgaben die Kreditdetails. Alle markierten Felder sind Pflicht.":
    "Please complete the loan details under expenses. All marked fields are mandatory.",
  "Der Tag, zu dem die angegebene Restschuld gilt, zum Beispiel das Datum des letzten Kontoauszugs oder der Jahresbescheinigung.":
    "The date on which the stated remaining debt applies, for example the date of the latest account statement or annual statement.",
  "Ob der Zinssatz für die Zinsbindung fest vereinbart ist oder sich laufend ändern kann.":
    "Whether the interest rate is fixed for the fixed-interest period or may change over time.",
  "Ob der Vertrag zusätzliche Tilgungen außerhalb der Rate erlaubt, zum Beispiel fünf Prozent im Jahr.":
    "Whether the contract allows additional repayments on top of the instalment, for example five per cent a year.",
  "Wer den Kredit laut Vertrag schuldet: Person 1, Person 2 oder beide gemeinsam.":
    "Who owes the loan under the contract: Person 1, Person 2 or both jointly.",
  "Ausgaben übersteigen Einnahmen": "Expenses exceed income",
  "Die monatlichen Ausgaben ({ausgaben}) übersteigen die Einnahmen ({einnahmen}) um {differenz}. Bitte prüfen Sie die Angaben – eine Finanzierung ist so nicht darstellbar.":
    "Your monthly expenses ({ausgaben}) exceed your income ({einnahmen}) by {differenz}. Please check the figures. Financing is not possible on this basis.",

  /* ── Schritt 4: Vermögenswerte ────────────────────────────── */
  "Vermögenswerte: Angaben Person 1 (Gesamtbetrag)": "Assets: Person 1 (total amount)",
  "Vermögenswerte: Angaben Person 2 (Gesamtbetrag)": "Assets: Person 2 (total amount)",
  Art: "Type",
  "Art des Vermögenswerts auswählen. Immobilien bitte unten im Block Immobilienvermögen im Detail erfassen.":
    "Select the type of asset. Please enter properties in detail further below in the real estate section.",
  'Bitte tragen Sie die Immobilie unten im Block „Immobilienvermögen (Details)" vollständig ein.':
    "Please enter the property in full further below in the section “Real estate (details)”.",
  'Bitte im Block „Immobilienvermögen (Details)" vollständig eintragen.':
    "Please enter in full in the section “Real estate (details)”.",
  "Institut / Beschreibung": "Institution or description",
  "z.B. Sparkasse...": "e.g. Sparkasse...",
  Betrag: "Amount",
  "Vermögenswert hinzufügen": "Add asset",
  "Immobilienvermögen (Details)": "Real estate (details)",
  "Für jede bestehende Immobilie: Bank-relevante Angaben.": "For each property you own: the details relevant to the bank.",
  "Immobilie entfernen": "Remove property",
  Eigentümer: "Owner",
  "Art (EFH/ETW/MFH...)": "Type (house, flat, apartment building...)",
  Adresse: "Address",
  Baujahr: "Year of construction",
  "Grundstück (m²)": "Plot (m²)",
  "Wohnfläche (m²)": "Living space (m²)",
  Nutzung: "Use",
  Eigennutzung: "Owner-occupied",
  Fremdvermietet: "Let to tenants",
  "Marktwert (€)": "Market value (€)",
  "Kaltmiete Ist (€/Monat)": "Current net cold rent (€ per month)",
  "Kaltmiete zukünftig (€/Monat, optional)": "Future net cold rent (€ per month, optional)",
  "Vermietungsdetails (optional)": "Letting details (optional)",
  "z. B. teilvermietet: welche Einheit, wie groß, für wie viel": "e.g. partly let: which unit, what size, for how much",
  "Immobilie hinzufügen": "Add property",

  /* ── Schritt 5: Verbindlichkeiten ─────────────────────────── */
  "Verbindlichkeiten: Angaben Person 1 (Gesamtbetrag)": "Liabilities: Person 1 (total amount)",
  "Verbindlichkeiten: Angaben Person 2 (Gesamtbetrag)": "Liabilities: Person 2 (total amount)",
  "Laufende Kredite / Darlehen": "Current loans",
  "Laufende Kredite / Darlehen Person 2": "Current loans Person 2",
  "Rate: {betrag}": "Instalment: {betrag}",
  "Restschuld: {betrag}": "Remaining debt: {betrag}",
  "bis {datum}": "until {datum}",
  'Diese Kredite wurden unter „Ausgaben" erfasst. Änderungen dort vornehmen.':
    "These loans were entered under “Expenses”. Please make any changes there.",
  'Keine laufenden Kredite unter „Ausgaben" hinterlegt.': "No current loans entered under “Expenses”.",
  'Diese Kredite wurden unter „Ausgaben Person 2" erfasst.': "These loans were entered under “Expenses Person 2”.",
  'Keine laufenden Kredite unter „Ausgaben Person 2" hinterlegt.': "No current loans entered under “Expenses Person 2”.",
  Bürgschaften: "Guarantees",
  "Bürgschaften Person 2": "Guarantees Person 2",
  "Keine Bürgschaften hinterlegt. Falls vorhanden, bitte hinzufügen.": "No guarantees entered. If you have any, please add them.",
  "Keine Bürgschaften hinterlegt.": "No guarantees entered.",
  "Bürgschaft hinzufügen": "Add guarantee",
  "Wofür die Bürgschaft übernommen wurde, zum Beispiel Mietbürgschaft oder Kreditbürgschaft für ein Familienmitglied.":
    "What the guarantee was given for, for example a rent guarantee or a loan guarantee for a family member.",
  "Höhe der verbürgten Summe in Euro.": "The guaranteed amount in euros.",

  /* ── Schritt 6: Sonstige Angaben ──────────────────────────── */
  "Sonstige Angaben: Angaben Person 1": "Other information: Person 1",
  "Sonstige Angaben: Angaben Person 2": "Other information: Person 2",
  "Bestehen oder bestanden in den letzten zehn Jahren Mahnverfahren oder Zahlungsklagen, Zwangsvollstreckungen, Verfahren zur Abgabe der eidesstattlichen Versicherung, Insolvenzverfahren?":
    "Are there, or have there been within the last ten years, any court dunning proceedings (Mahnverfahren) or actions for payment, enforcement measures, proceedings for a statutory declaration of assets (eidesstattliche Versicherung) or insolvency proceedings?",
  "Gemeint sind offizielle Verfahren wegen unbezahlter Forderungen. Eine einzelne Mahnung eines Händlers zählt nicht. Im Zweifel Ja wählen und die Situation im Hinweisfeld kurz erklären.":
    "This means official proceedings concerning unpaid claims. A single payment reminder from a retailer does not count. If in doubt, select Yes and briefly explain the situation in the notes field.",
  "Ist Ihnen Ihr aktuell Schufa Score bekannt?": "Do you know your current SCHUFA score?",
  "Ist Ihnen Ihr aktueller Schufa Score bekannt?": "Do you know your current SCHUFA score?",
  "Den eigenen Score zeigt zum Beispiel die kostenlose Datenkopie der Schufa. Wer ihn nicht kennt, wählt einfach Nein.":
    "You can find your own score, for example, in the free copy of your data from SCHUFA (the German credit reference agency). If you do not know it, simply select No.",
  "Schufa Score": "SCHUFA score",
  "Hinweise / Erklärungen / Angaben": "Notes, explanations and further information",

  /* ── Schritt 7: Abschluss und Unterschrift ────────────────── */
  "Abschluss & Unterschrift": "Completion and signature",
  "Abschluss & Unterschrift anfordern": "Completion and signature request",
  "Selbstauskunft vollständig ausgefüllt": "Self-disclosure fully completed",
  "Alle Angaben wurden erfasst. Bitte unterschreiben Sie unten und bestätigen Sie Ihre Angaben.":
    "All information has been entered. Please sign below and confirm your information.",
  "Beide Personen müssen unterschreiben, damit das PDF erstellt wird.":
    "Both persons must sign before the PDF can be created.",
  "Unterschrift Person 1": "Signature Person 1",
  "Unterschrift Person 2": "Signature Person 2",
  "Scannen Sie den QR-Code, um bequem mit dem Finger am Handy zu unterschreiben.":
    "Scan the QR code to sign comfortably with your finger on your mobile phone.",
  "✍️ Jetzt hier unterschreiben": "✍️ Sign here now",
  "📧 Per E-Mail senden": "📧 Send by email",
  "Person 2 erhält nach Ihrer Unterschrift eine E-Mail mit einem Link zur digitalen Unterschrift an":
    "After you have signed, Person 2 will receive an email with a link for the digital signature at",
  // Der Knopf leert das Unterschriftsfeld, er löscht keine Daten.
  Löschen: "Clear",
  "Bitte unterschreiben Sie im Feld oben (Maus oder Finger)": "Please sign in the field above (mouse or finger)",
  "Wird gespeichert…": "Saving…",
  "Unterschreiben & einreichen": "Sign and submit",
  "Ihre Daten werden verschlüsselt übertragen und DSGVO-konform gespeichert.":
    "Your data is transmitted in encrypted form and stored in compliance with the GDPR.",
  "Korrekturen übernehmen": "Apply corrections",
  "Bitte prüfen Sie Ihre Änderungen. Mit dem Klick auf „Korrekturen übernehmen“ wird die Selbstauskunft aktualisiert. Anschließend sehen Sie die neue Fassung als PDF und können sie unterschreiben.":
    "Please check your changes. Clicking “Apply corrections” updates the self-disclosure. You will then see the new version as a PDF and can sign it.",
  "Hinweis: Hat die zweite Person bereits unterschrieben, wird diese Unterschrift zurückgesetzt und die Person automatisch erneut zur Unterschrift eingeladen.":
    "Please note: if the second person has already signed, this signature will be reset and the person will automatically be invited to sign again.",
  "Unterschrift fehlt": "Signature missing",
  "Bitte unterschreiben Sie im Feld für Person 1.": "Please sign in the field for Person 1.",
  "Bitte unterschreiben Sie im Feld für Person 2.": "Please sign in the field for Person 2.",
  "Unterschrift konnte nicht gespeichert werden.": "The signature could not be saved.",
  "Die E-Mail an Person 2 ging nicht hinaus": "The email to Person 2 could not be sent",
  "Ihre Unterschrift ist gespeichert, daran geht nichts verloren. Nur die E-Mail mit dem Unterschriftslink an {name} konnte nicht versendet werden.\n\nBitte melden Sie sich kurz bei Ihrem Berater und geben Sie diesen Grund weiter: {grund}\n\nEr kann die Anfrage dann von Hand erneut verschicken.":
    "Your signature has been saved and nothing has been lost. Only the email with the signature link to {name} could not be sent.\n\nPlease contact your contact person at OS Immobilien and pass on the following reason: {grund}\n\nYour contact can then send the request again manually.",
  "kein Grund vom Server erhalten": "no reason received from the server",
  "die zweite Person": "the second person",
  Verstanden: "Understood",
  "Selbstauskunft abgeschlossen ✓": "Self-disclosure completed ✓",
  "Alle Unterschriften sind eingegangen. Das PDF wird erstellt.": "All signatures have been received. The PDF is being created.",
  "Unterschrift Person 1 gespeichert ✓": "Signature of Person 1 saved ✓",
  "Person 2 erhält eine E-Mail mit dem Link zur Unterschrift.": "Person 2 will receive an email with the link to sign.",
  "Unterschrift Person 1 empfangen ✓": "Signature of Person 1 received ✓",
  "Unterschrift Person 2 empfangen ✓": "Signature of Person 2 received ✓",
  "Die Unterschrift vom Handy wurde übernommen.": "The signature from your mobile phone has been applied.",

  /* ── Beraterweg (im CRM, auf Englisch nur beim gemeinsamen Ausfüllen) ── */
  "Alle Angaben wurden erfasst. Mit der Bestätigung wird eine Signaturanfrage per E-Mail an alle beteiligten Personen versendet. Nach Eingang aller Unterschriften wird das PDF automatisch erstellt und unter Bonitätsunterlagen gespeichert.":
    "All information has been entered. On confirmation, a signature request is sent by email to all persons involved. Once all signatures have been received, the PDF is created automatically and stored with the credit documents.",
  "keine E-Mail": "no email",
  "⚠ Person 1 hat keine E-Mail-Adresse. Bitte zuerst ergänzen.": "⚠ Person 1 has no email address. Please add one first.",
  "Person 2 hat keine eigene E-Mail – der Unterschrifts-Link geht an die E-Mail von Person 1 ({email}).":
    "Person 2 has no email address of their own. The signature link will be sent to the email address of Person 1 ({email}).",
  "⚠ Weder Person 1 noch Person 2 haben eine E-Mail-Adresse. Bitte zuerst ergänzen.":
    "⚠ Neither Person 1 nor Person 2 has an email address. Please add one first.",
  "Ich bestätige die Richtigkeit aller Angaben und möchte die Unterschrift anfordern.":
    "I confirm that all information is correct and would like to request the signature.",
  "Bereits versendet": "Already sent",
  "Erneut Unterschrift anfordern": "Request signature again",
  "Unterschrift anfordern": "Request signature",
  "Keine E-Mail-Adresse hinterlegt.": "No email address on file.",
  "Signaturanfrage konnte nicht gesendet werden.": "The signature request could not be sent.",
  "Keine E-Mail versendet": "No email sent",
  "Die Anfrage wurde angelegt, aber nicht zugestellt: {gruende}. Der Unterschriftslink lässt sich über die Kundenakte erneut senden.":
    "The request was created but not delivered: {gruende}. The signature link can be sent again from the customer file.",
  "Die Anfrage wurde angelegt, aber es ging keine E-Mail hinaus. Bitte die Adresse prüfen.":
    "The request was created, but no email was sent. Please check the address.",
  "Unterschrift angefordert": "Signature requested",
  "{versendet} von {gesamt} Signaturanfragen versendet. Bei den übrigen ist der Versand fehlgeschlagen.":
    "{versendet} of {gesamt} signature requests sent. Sending failed for the others.",
  "{versendet}/{gesamt} Signaturanfragen per E-Mail versendet.": "{versendet}/{gesamt} signature requests sent by email.",
  "{versendet}/{gesamt} Signaturanfrage per E-Mail versendet.": "{versendet}/{gesamt} signature request sent by email.",
  "Der Kunde füllt gerade selbst aus.": "The customer is currently completing the form.",
  "Seine Angaben gelten. Ihre Änderungen ab jetzt werden nicht mehr übernommen, damit sie seine Eingaben nicht überschreiben.":
    "The customer’s information takes precedence. Your changes from now on will not be applied, so that they do not overwrite the customer’s entries.",
  "Stand des Kunden laden": "Load the customer’s version",
  "Person 2 entfernt ✓": "Person 2 removed ✓",
  "Person 2 wurde aus SA und Stammdaten gelöscht. Die SA muss neu unterschrieben werden.":
    "Person 2 has been deleted from the self-disclosure and the master data. The self-disclosure must be signed again.",
  "Person 2 konnte nicht entfernt werden und steht weiter in den Stammdaten. Bitte versuche es noch einmal.":
    "Person 2 could not be removed and is still in the master data. Please try again.",
  "Person 2 dauerhaft entfernen?": "Permanently remove Person 2?",
  // Der Satz ist im Formular um zwei fett gesetzte Wörter herum gestückelt,
  // deshalb stehen die Teile einzeln da.
  "Damit wird Person 2 aus": "Person 2 will be removed from the",
  "Selbstauskunft|im Satz": "self-disclosure",
  und: "and",
  Stammdaten: "master data",
  "gelöscht. Alle bisherigen SA-Unterschriften (Person 1 und Person 2) werden gelöscht, weil die SA sich inhaltlich ändert.":
    "as a result. All previous self-disclosure signatures (Person 1 and Person 2) are deleted because the content of the self-disclosure changes.",
  "Die Selbstauskunft muss anschließend von Person 1": "The self-disclosure must then be",
  "neu unterschrieben": "signed again",
  "werden.": "by Person 1.",
  "Diese Aktion kann nicht rückgängig gemacht werden.": "This action cannot be undone.",
  Abbrechen: "Cancel",
  "Ja, Person 2 entfernen": "Yes, remove Person 2",

  /* ── Feld-Hilfen (FELD_HILFEN im Formular) ────────────────── */
  "Bitte auswählen, wie wir Sie ansprechen dürfen.": "Please select how we should address you.",
  "Akademischer Titel wie Dr. oder Prof., falls vorhanden. Sonst leer lassen.":
    "Academic title such as Dr or Prof, if applicable. Otherwise leave empty.",
  "Alle Vornamen so, wie sie im Ausweis stehen.": "All first names as shown on your identity document.",
  "Nachname so, wie er im Ausweis steht.": "Surname as shown on your identity document.",
  "Nur ausfüllen, wenn er vom heutigen Nachnamen abweicht, zum Beispiel nach einer Heirat.":
    "Only complete if it differs from your current surname, for example after marriage.",
  "Tag, Monat und Jahr wie im Ausweis.": "Day, month and year as shown on your identity document.",
  "Die elfstellige persönliche Steuer-Identifikationsnummer. Sie steht auf der Lohnabrechnung und auf dem Schreiben vom Bundeszentralamt für Steuern. Kann auch nachgereicht werden.":
    "Your eleven-digit personal German tax identification number (Steuer-Identifikationsnummer). It appears on your payslip and on the letter from the Federal Central Tax Office (Bundeszentralamt für Steuern). It can also be provided later.",
  "Straße der aktuellen Meldeadresse.": "Street of your current registered address.",
  "Hausnummer der aktuellen Meldeadresse.": "House number of your current registered address.",
  "Postleitzahl der aktuellen Meldeadresse.": "Postcode of your current registered address.",
  "Wohnort der aktuellen Meldeadresse.": "Town or city of your current registered address.",
  "Festnetznummer. Wenn keine vorhanden ist, reicht die Mobilnummer im Feld daneben.":
    "Landline number. If you do not have one, the mobile number in the next field is sufficient.",
  "Mobilnummer für Rückfragen.": "Mobile number for any queries.",
  "An diese Adresse gehen Rückfragen und am Ende der Link zur Unterschrift.":
    "Any queries and, at the end, the link for your signature will be sent to this address.",
  "Der aktuelle Familienstand. Bei Verheirateten fragt die Bank zusätzlich den Güterstand ab.":
    "Your current marital status. If you are married, the bank will also ask for your matrimonial property regime.",
  "Wie lange Sie schon an der oben angegebenen Adresse wohnen.": "How long you have lived at the address given above.",
  "Vor- und Nachname des Kindes.": "The child’s first name and surname.",
  "Lohnsteuerklasse 1 bis 6. Sie steht auf der Gehaltsabrechnung.": "Wage tax class 1 to 6. It appears on your payslip.",
  "Lohnsteuerklasse 1 bis 6 von Person 2. Sie steht auf der Gehaltsabrechnung.":
    "Wage tax class 1 to 6 of Person 2. It appears on the payslip.",
  "Ja, wenn auf der Gehaltsabrechnung Kirchensteuer abgezogen wird.": "Yes, if church tax is deducted on your payslip.",
  "Ja, wenn bei Person 2 auf der Gehaltsabrechnung Kirchensteuer abgezogen wird.":
    "Yes, if church tax is deducted on the payslip of Person 2.",
  "Nur bei Verheirateten und eingetragenen Lebenspartnern. Ohne Ehe- oder Lebenspartnerschaftsvertrag gilt automatisch die Zugewinngemeinschaft, das ist der gesetzliche Normalfall.":
    "Only for married persons and registered civil partners. Without a marriage or civil partnership contract, the community of accrued gains (Zugewinngemeinschaft) applies automatically; this is the statutory default.",
  "Wirtschaftszweig des Arbeitgebers beziehungsweise der eigenen Firma, zum Beispiel Handwerk, IT oder Gesundheitswesen.":
    "The industry of your employer or of your own company, for example skilled trades, IT or healthcare.",
  "Vollständiger Name des Arbeitgebers beziehungsweise des eigenen Unternehmens.":
    "Full name of your employer or of your own company.",
  "Die ausgeübte Tätigkeit laut Arbeitsvertrag.": "Your occupation according to your employment contract.",
  "Beginn des aktuellen Arbeitsverhältnisses laut Arbeitsvertrag.":
    "Start of your current employment according to your employment contract.",
  "Seit wann die selbstständige Tätigkeit besteht, zum Beispiel laut Gewerbeanmeldung.":
    "Since when you have been self-employed, for example according to your business registration.",
  "Wie viele Mitarbeiter beschäftigt sind. Ohne Mitarbeiter 0 eintragen.":
    "How many employees you have. If you have no employees, enter 0.",
  "Art des Kontos auswählen, zum Beispiel Girokonto oder Depot.": "Select the type of account, for example current account or securities account.",
  "Name der Bank, zum Beispiel Sparkasse Regensburg.": "Name of the bank, for example Sparkasse Regensburg.",
  "Die IBAN steht auf der Bankkarte oder im Online-Banking.": "The IBAN is shown on your bank card or in your online banking.",
  "Monatliches Nettogehalt laut Gehaltsabrechnung, also das, was auf dem Konto ankommt. Ohne Kindergeld und ohne Nebeneinkünfte, dafür gibt es eigene Felder.":
    "Monthly net salary according to your payslip, i.e. the amount paid into your account. Excluding child benefit and additional income, which have their own fields.",
  "Das gesamte Bruttojahresgehalt vor Steuern und Sozialabgaben, einschließlich Sonderzahlungen wie dem 13. und 14. Gehalt, Urlaubsgeld und Boni. Es steht auf der Dezemberabrechnung oder auf der Lohnsteuerbescheinigung. Bei Selbstständigen der Jahresgewinn vor Steuern laut letztem Steuerbescheid.":
    "Your total gross annual salary before tax and social security contributions, including special payments such as a 13th and 14th salary, holiday pay and bonuses. It appears on your December payslip or on your annual wage tax certificate (Lohnsteuerbescheinigung). For self-employed persons, the annual profit before tax according to the last tax assessment.",
  "Das zu versteuernde Einkommen eines Jahres, also nach Abzug von Werbungskosten, Sonderausgaben und Freibeträgen. Es ist die Grundlage, auf die die Einkommensteuer berechnet wird.":
    "The taxable income for one year, i.e. after deducting income-related expenses, special expenses and allowances. It is the basis on which income tax is calculated.",
  "Durchschnittlicher monatlicher Gewinn nach Steuern aus der Selbstständigkeit, im Zweifel laut letztem Steuerbescheid.":
    "Average monthly profit after tax from self-employment, if in doubt according to the last tax assessment.",
  "Monatliche Kaltmiete aus vermieteten Immobilien, ohne die Nebenkostenvorauszahlungen der Mieter.":
    "Monthly net cold rent from let properties, excluding the tenants’ advance payments for service charges.",
  "Monatliche Erträge aus Zinsen oder Dividenden. Jahreswerte bitte durch 12 teilen.":
    "Monthly income from interest or dividends. Please divide annual figures by 12.",
  "Monatliche Renten- oder Pensionszahlung.": "Monthly pension payment.",
  "Monatliches Kindergeld für alle Kinder zusammen.": "Monthly child benefit for all children together.",
  "Alle weiteren regelmäßigen monatlichen Einkünfte, zum Beispiel Nebenjob, Elterngeld oder erhaltener Unterhalt.":
    "All other regular monthly income, for example from a second job, parental allowance or maintenance received.",
  "Wie viele Gehälter pro Jahr gezahlt werden: 13 bei Weihnachtsgeld, 14 bei zusätzlichem Urlaubsgeld.":
    "How many salaries are paid per year: 13 with a Christmas bonus, 14 with an additional holiday bonus.",
  "Ob der Arbeitsvertrag unbefristet, befristet oder noch in der Probezeit ist.":
    "Whether your employment contract is permanent, fixed-term or still in the probationary period.",
  "Enddatum der Befristung laut Arbeitsvertrag.": "End date of the fixed term according to your employment contract.",
  "Zur Miete, im Eigentum oder mietfrei, zum Beispiel bei den Eltern wohnend.":
    "Renting, owner-occupied or rent-free, for example living with your parents.",
  "Monatliche Kaltmiete ohne alle Nebenkosten. Die Nebenkosten gehören ins Feld Wohnnebenkosten weiter unten, so wird nichts doppelt gezählt.":
    "Monthly net cold rent excluding all additional costs. The additional costs belong in the household running costs field further below, so that nothing is counted twice.",
  "Monatliche Ausgaben für Lebensmittel, Kleidung, Freizeit und Alltag. Ohne Miete, ohne Wohnnebenkosten wie Strom und Heizung und ohne Versicherungen oder Kreditraten, dafür gibt es eigene Felder. Bitte nichts doppelt eintragen.":
    "Monthly expenses for food, clothing, leisure and everyday life. Excluding rent, household running costs such as electricity and heating, and insurance or loan instalments, which have their own fields. Please do not enter anything twice.",
  "Monatsbeitrag nur bei privat Krankenversicherten. Gesetzlich Versicherte lassen 0 stehen, ihr Beitrag steckt schon im Nettogehalt.":
    "Monthly premium only if you have private health insurance. If you have statutory health insurance, leave 0, as your contribution is already deducted from your net salary.",
  "Regelmäßige monatliche Ausgaben, die in kein anderes Feld passen, zum Beispiel Kita oder Vereinsbeiträge. Bitte im Feld daneben kurz benennen.":
    "Regular monthly expenses that do not fit into any other field, for example nursery fees or club memberships. Please describe them briefly in the next field.",
  "Kurz benennen, wofür die sonstigen Ausgaben anfallen, damit die Bank den Betrag einordnen kann.":
    "Briefly state what the other expenses are for, so that the bank can classify the amount.",
  "Die Auswahl bestimmt, wie die Bank den Kredit einordnet, zum Beispiel Autokredit oder Immobiliendarlehen.":
    "Your selection determines how the bank classifies the loan, for example as a car loan or a property loan.",
  "Freitext zum Wiedererkennen des Kredits, zum Beispiel VW Bank oder Möbelfinanzierung.":
    "Free text to identify the loan, for example VW Bank or furniture financing.",
  "Die monatlich zu zahlende Rate laut Kreditvertrag.": "The monthly instalment payable according to the loan agreement.",
  "Der aktuell noch offene Betrag dieses Kredits.": "The amount of this loan currently still outstanding.",
  "Wann der Kredit voraussichtlich vollständig zurückgezahlt ist.": "When the loan is expected to be repaid in full.",
  "Alle monatlichen Wohnnebenkosten zusammen: Betriebskosten- und Heizkostenvorauszahlung, Strom, Wasser, Müll, Internet und Rundfunkbeitrag. Oben zählt nur die Kaltmiete, und bei den Lebenshaltungskosten bitte nichts davon noch einmal mitrechnen.":
    "All monthly household running costs together: advance payments for operating and heating costs, electricity, water, waste, internet and the broadcasting licence fee. Only the net cold rent counts above, and please do not include any of these again in your living expenses.",
  "Monatlicher Unterhalt, den Sie an andere zahlen, zum Beispiel Kindesunterhalt. Erhaltener Unterhalt gehört zu den sonstigen Einkünften.":
    "Monthly maintenance that you pay to others, for example child maintenance. Maintenance received belongs under other income.",
  "Wie viele Fahrzeuge im Haushalt vorhanden sind.": "How many vehicles there are in the household.",
  "Monatliche Gesamtkosten aller Fahrzeuge zusammen: Versicherung, Steuer, Kraftstoff und Wartung. Bei mehreren Fahrzeugen die Summe, nicht der Betrag je Fahrzeug.":
    "Total monthly costs of all vehicles together: insurance, tax, fuel and maintenance. For several vehicles, the total, not the amount per vehicle.",
  "Monatliche Gesamtkosten aller Fahrzeuge zusammen: Versicherung, Steuer, Kraftstoff und Wartung.":
    "Total monthly costs of all vehicles together: insurance, tax, fuel and maintenance.",
  "Monatsbeitrag zur Berufsunfähigkeitsversicherung, falls vorhanden.":
    "Monthly premium for occupational disability insurance, if applicable.",
  "Monatsbeitrag zum Riester-Vertrag, falls vorhanden.": "Monthly contribution to a Riester pension contract, if applicable.",
  "Monatsbeiträge zu weiterer privater Altersvorsorge, zum Beispiel Rürup oder private Rentenversicherung.":
    "Monthly contributions to other private retirement provision, for example a Rürup pension or private pension insurance.",
  "Monatsbeiträge aller übrigen Versicherungen zusammen, zum Beispiel Haftpflicht, Hausrat oder Rechtsschutz. Ohne KFZ, die stecken schon in den KFZ-Kosten.":
    "Monthly premiums for all other insurance together, for example liability, household contents or legal expenses insurance. Excluding vehicle insurance, which is already included in the vehicle costs.",
  "Vollständiger Name der Bank oder des Darlehensgebers, zum Beispiel Deutsche Kreditbank AG. Der Name erscheint genau so im Dokument.":
    "Full name of the bank or lender, for example Deutsche Kreditbank AG. The name will appear exactly like this in the document.",
  "Die ursprüngliche Kreditsumme bei Vertragsabschluss.": "The original loan amount when the contract was concluded.",
  "Der vereinbarte Sollzins laut Kreditvertrag.": "The agreed borrowing rate according to the loan agreement.",
  "Datum des Kreditvertragsabschlusses.": "Date on which the loan agreement was concluded.",
  "Bis wann der Zinssatz laut Vertrag festgeschrieben ist.": "Until when the interest rate is fixed according to the contract.",
  "Wofür der Kredit aufgenommen wurde, zum Beispiel Autokauf oder Modernisierung.":
    "What the loan was taken out for, for example buying a car or modernisation.",
  "Wo der Vermögenswert liegt, zum Beispiel Name der Bank oder der Versicherung.":
    "Where the asset is held, for example the name of the bank or insurance company.",
  "Aktueller Wert beziehungsweise Guthabenstand in Euro.": "Current value or balance in euros.",
  "Wem die Immobilie gehört. Bei gemeinsamem Eigentum beide Namen eintragen.":
    "Who owns the property. In the case of joint ownership, enter both names.",
  "Objektart, zum Beispiel Einfamilienhaus (EFH), Eigentumswohnung (ETW) oder Mehrfamilienhaus (MFH).":
    "Type of property, for example detached house (EFH), owner-occupied flat (ETW) or apartment building (MFH).",
  "Straße, Hausnummer, Postleitzahl und Ort der Immobilie.": "Street, house number, postcode and town or city of the property.",
  "Baujahr des Gebäudes.": "Year in which the building was constructed.",
  "Grundstücksfläche in Quadratmetern laut Grundbuch oder Kaufvertrag.":
    "Plot area in square metres according to the land register or purchase contract.",
  "Wohnfläche in Quadratmetern laut Kaufvertrag oder Exposé.":
    "Living space in square metres according to the purchase contract or property brochure.",
  "Eigennutzung heißt selbst bewohnt, fremdvermietet heißt an Mieter vermietet.":
    "Owner-occupied means you live there yourself; let to tenants means it is rented out.",
  "Geschätzter aktueller Verkaufswert der Immobilie.": "Estimated current sale value of the property.",
  "Aktuelle monatliche Kaltmiete. Bei Eigennutzung 0 eintragen.": "Current monthly net cold rent. If owner-occupied, enter 0.",
  "Nur ausfüllen, wenn sich die Miete absehbar ändert, zum Beispiel nach einer Neuvermietung.":
    "Only complete if the rent is expected to change, for example after a new letting.",
  "Besonderheiten der Vermietung, zum Beispiel teilvermietet: welche Einheit, wie groß und für wie viel.":
    "Special features of the letting, for example partly let: which unit, what size and for how much.",
  "Der Basisscore in Prozent aus der eigenen Schufa-Auskunft, zum Beispiel 97,5.":
    "The base score as a percentage from your own SCHUFA report, for example 97.5.",
  "Platz für alles, was die Bank zusätzlich wissen sollte, zum Beispiel ein geplanter Jobwechsel oder Besonderheiten bei einzelnen Zahlen.":
    "Space for anything else the bank should know, for example a planned change of job or special circumstances regarding individual figures.",

  /* ── Hinweisspalte (STEP_HINTS im Formular) ───────────────── */
  "💡 Hinweis": "💡 Note",
  "Wählen Sie bis zu 3 Ziele aus, die Ihnen am wichtigsten sind.": "Select up to 3 goals that are most important to you.",
  "Diese Auswahl hilft uns, die passende Anlagestrategie für Sie zu finden.":
    "This selection helps us to find the right investment strategy for you.",
  'Es gibt kein "richtig" oder "falsch" – wählen Sie, was zu Ihrer Lebenssituation passt.':
    "There is no right or wrong answer. Choose what suits your circumstances.",
  "📋 Persönliche Angaben": "📋 Personal details",
  "Bitte tragen Sie Ihre Daten genau wie im Personalausweis ein.":
    "Please enter your details exactly as shown on your identity card or passport.",
  "Das Geburtsdatum wird für die Bonitätsprüfung benötigt.": "Your date of birth is required for the credit check.",
  "Ihre aktuelle Wohnadresse wird für die Finanzierungsprüfung verwendet.":
    "Your current home address is used for the financing assessment.",
  "Mindestens Telefon oder Mobilfunk muss angegeben werden.": "At least a telephone or mobile number must be provided.",
  'Falls Sie gemeinsam finanzieren, aktivieren Sie "Person 2 anlegen".':
    "If you are financing jointly, please select “Add Person 2”.",
  "💰 Einnahmen": "💰 Income",
  "Bitte geben Sie Ihr monatliches Netto-Einkommen an (was auf Ihrem Konto ankommt).":
    "Please state your monthly net income (the amount paid into your account).",
  "Überstunden und Boni nur angeben, wenn diese regelmäßig und vertraglich gesichert sind.":
    "Only include overtime and bonuses if they are paid regularly and are contractually guaranteed.",
  "Selbständige: Bitte den durchschnittlichen monatlichen Gewinn der letzten 3 Jahre angeben.":
    "Self-employed persons: please state the average monthly profit over the last 3 years.",
  "Bankverbindung: IBAN und Institut werden für die spätere Finanzierung benötigt.":
    "Bank details: the IBAN and bank are required for the financing at a later stage.",
  "Arbeitgeber bitte genau wie auf der Gehaltsabrechnung angeben.": "Please state your employer exactly as shown on your payslip.",
  "📊 Ausgaben": "📊 Expenses",
  "Kaltmiete ohne Nebenkosten angeben. Strom, Heizung und übrige Nebenkosten kommen unten in das Feld Wohnnebenkosten.":
    "State the net cold rent (Kaltmiete) without additional costs. Electricity, heating and other additional costs go further below in the household running costs field.",
  "Lebenshaltungskosten: Lebensmittel, Kleidung, Freizeit, etc.": "Living expenses: food, clothing, leisure, etc.",
  'Falls Sie in einer Eigentumswohnung wohnen, wählen Sie "Eigentum".':
    "If you live in a flat that you own, please select “Owner-occupied”.",
  "Versicherungsbeiträge: Haftpflicht, Berufsunfähigkeit, etc. – ohne Krankenversicherung.":
    "Insurance premiums: liability, occupational disability, etc., excluding health insurance.",
  "Tipp: Schauen Sie auf Ihre Kontoauszüge der letzten 3 Monate für realistische Werte.":
    "Tip: look at your bank statements for the last 3 months to find realistic figures.",
  "🏦 Vermögenswerte": "🏦 Assets",
  "Eigenkapital umfasst: Sparguthaben, Tagesgeld, Festgeld, Bausparverträge.":
    "Equity includes: savings, instant-access savings, fixed-term deposits and building savings contracts (Bausparverträge).",
  "Wertpapiere: Aktien, ETFs, Fonds – zum aktuellen Kurswert.": "Securities: shares, ETFs and funds at their current market value.",
  "Immobilien: Geben Sie den geschätzten Verkehrswert an.": "Real estate: please state the estimated market value.",
  "Lebensversicherungen: Bitte den aktuellen Rückkaufswert angeben.": "Life insurance: please state the current surrender value.",
  "Je genauer Ihre Angaben, desto besser können wir Ihren Finanzierungsrahmen berechnen.":
    "The more precise your information, the better we can calculate your financing scope.",
  "📝 Verbindlichkeiten": "📝 Liabilities",
  "Alle bestehenden Kredite angeben – auch Leasingraten für Autos.": "Please state all existing loans, including leasing instalments for cars.",
  "Kreditkarten mit Ratenzahlung zählen ebenfalls als Verbindlichkeit.":
    "Credit cards with instalment payments also count as liabilities.",
  "Bürgschaften: Auch wenn Sie noch nicht in Anspruch genommen wurden.":
    "Guarantees: please include them even if they have not yet been called upon.",
  "Dispokredite nur angeben, wenn sie regelmäßig genutzt werden.": "Only include overdrafts if they are used regularly.",
  "⚖️ Sonstige Angaben": "⚖️ Other information",
  "Schufa-Einträge: Seien Sie ehrlich – bekannte Negativeinträge verhindern keine Beratung.":
    "SCHUFA entries: please be honest. Known negative entries do not prevent a consultation.",
  "Mahnverfahren: Auch abgeschlossene Verfahren der letzten 3 Jahre angeben.":
    "Court dunning proceedings: please also include proceedings concluded within the last 3 years.",
  "Schufa-Score: Falls bekannt, hilft er bei der Einschätzung. Wenn nicht, lassen Sie das Feld leer.":
    "SCHUFA score: if known, it helps with the assessment. If not, please leave the field empty.",
  "Hinweise: Hier können Sie alles eintragen, was für die Beratung relevant sein könnte.":
    "Notes: here you can enter anything that could be relevant for the consultation.",
  "✅ Abschluss": "✅ Completion",
  "Bitte prüfen Sie alle Angaben nochmals sorgfältig.": "Please check all information carefully once more.",
  "Nach dem Absenden erhalten Sie einen Link zur digitalen Unterschrift per E-Mail.":
    "After submitting, you will receive a link for the digital signature by email.",
  "Wenn Person 2 angelegt ist, erhält auch diese Person einen Unterschrifts-Link.":
    "If Person 2 has been added, this person will also receive a signature link.",
  "Nach Eingang aller Unterschriften wird das PDF automatisch erstellt.":
    "Once all signatures have been received, the PDF is created automatically.",

  /* ── Kundenseite /sa/:token (SelbstauskunftPublic.tsx) ────── */
  "Willkommen, {name}": "Welcome, {name}",
  "Bitte füllen Sie die nachfolgende Selbstauskunft sorgfältig aus. Alle mit":
    "Please complete the following self-disclosure (Selbstauskunft) carefully. All fields marked with",
  "markierten Felder sind Pflichtfelder. Am Ende können Sie Ihre Eingaben prüfen und digital unterschreiben.":
    "are required. At the end, you can review your entries and sign digitally.",
  "⏱ Dauer: ca. 10–15 Min.": "⏱ Duration: approx. 10 to 15 minutes",
  "🔒 DSGVO-konform": "🔒 GDPR-compliant",
  "💾 Zwischenspeichern möglich": "💾 Progress can be saved",
  "Ihre Angaben werden vertraulich behandelt und ausschließlich zur Prüfung Ihrer Finanzierungsmöglichkeiten verwendet.":
    "Your information will be treated confidentially and used exclusively to assess your financing options.",
  Datenschutzerklärung: "Privacy policy",
  "Wird geladen…": "Loading…",
  "Link abgelaufen": "Link expired",
  // Alte Links aus Handbuch-Mails (/handbuch/selbstauskunft/:token), seit dem 26.09.2026.
  "Dieser Link ist nicht mehr gültig. Sie können die Selbstauskunft trotzdem ausfüllen, auch ohne persönlichen Link.":
    "This link is no longer valid. You can still complete the self-disclosure, even without a personal link.",
  "Selbstauskunft ausfüllen|Knopf offene Selbstauskunft": "Complete the self-disclosure",
  "Selbstauskunft ohne persönlichen Link ausfüllen": "Complete the self-disclosure without a personal link",
  // Fester Link je Investment und Person, seit dem 07.10.2026.
  "Dieser Link ist nicht mehr gültig. Ihr Berater kann Ihnen einen neuen Link senden, Ihre bisherigen Angaben bleiben erhalten.":
    "This link is no longer valid. Your contact person at OS Immobilien can send you a new link, and the information you have entered so far will be kept.",
  "Neuen Link anfordern": "Request a new link",
  "Ihr Berater ist benachrichtigt und sendet Ihnen einen neuen Link.":
    "Your contact person at OS Immobilien has been notified and will send you a new link.",
  "Sie haben bereits einen neuen Link angefordert. Ihr Berater meldet sich bei Ihnen.":
    "You have already requested a new link. Your contact person at OS Immobilien will be in touch with you.",
  "Die Anfrage konnte gerade nicht gesendet werden. Bitte wenden Sie sich direkt an Ihren Berater.":
    "The request could not be sent just now. Please contact your contact person at OS Immobilien directly.",
  "Sie werden zu Ihrem aktuellen Link weitergeleitet…": "You are being redirected to your current link…",
  "Bereits ausgefüllt": "Already completed",
  "Diese Selbstauskunft wurde bereits ausgefüllt und eingereicht. Bei Fragen wenden Sie sich bitte an Ihren Berater.":
    "This self-disclosure has already been completed and submitted. If you have any questions, please contact your contact person at OS Immobilien.",
  "Gemeinsame Selbstauskunft": "Joint self-disclosure",
  "Bitte füllen Sie die Selbstauskunft gemeinsam über den Link von Person 1 aus.":
    "Please complete the self-disclosure together using the link sent to Person 1.",
  "Link nicht mehr gültig": "Link no longer valid",
  "Dieser Link wurde durch einen neueren ersetzt. Bitte nutzen Sie den Link aus Ihrer neuesten E-Mail von OS Immobilien oder wenden Sie sich an Ihren Berater.":
    "This link has been replaced by a newer one. Please use the link from your most recent email from OS Immobilien or contact your contact person at OS Immobilien.",
  "Link nicht bekannt": "Link not recognised",
  "Dieser Link ist nicht bekannt. Bitte nutzen Sie den Link aus Ihrer neuesten E-Mail von OS Immobilien oder wenden Sie sich an Ihren Berater.":
    "This link is not recognised. Please use the link from your most recent email from OS Immobilien or contact your contact person at OS Immobilien.",
  "Kurze Störung": "Temporary problem",
  "Die Seite konnte gerade nicht geladen werden. Bitte versuchen Sie es in einem Moment erneut.":
    "The page could not be loaded just now. Please try again in a moment.",
  "Erneut versuchen": "Try again",
  "Vielen Dank!": "Thank you very much!",
  "Ihre Selbstauskunft wurde erfolgreich eingereicht und digital unterschrieben. Ihr persönlicher Berater meldet sich zeitnah bei Ihnen mit den weiteren Schritten und schaltet im Anschluss Ihr persönliches Kundenportal frei.":
    "Your self-disclosure has been submitted successfully and signed digitally. Your contact person at OS Immobilien will be in touch with you shortly regarding the next steps and will then activate your personal customer portal.",
  "Sie können dieses Fenster jetzt schließen.": "You may now close this window.",

  /* ── Handy-Unterschrift /sa-mobile-sign (SaMobileSign.tsx) ── */
  Unterschrift: "Signature",
  "Unterschrift – OS Immobilien": "Signature | OS Immobilien",
  "Ungültiger Link.": "Invalid link.",
  "Unterschrift übertragen|Überschrift": "Signature transferred",
  "Unterschrift übertragen|Knopf": "Transfer signature",
  "Ihre Unterschrift wurde an das Gerät übertragen, auf dem Sie den QR-Code gescannt haben. Sie können dieses Fenster jetzt schließen.":
    "Your signature has been transferred to the device that displayed the QR code. You may now close this window.",
  "Unterschreiben Sie unten mit dem Finger. Ihre Unterschrift wird sofort an Ihren Computer übertragen.":
    "Please sign below with your finger. Your signature will be transferred to your computer immediately.",
  "Wird übertragen…": "Transferring…",
};

/**
 * Der Hinweis in der Legende, nur auf Englisch: Datum und Betrag folgen dem
 * Speicherformat beziehungsweise der englischen Schreibweise.
 */
export const SA_EN_EINGABEHINWEIS = "Please enter dates as DD.MM.YYYY and amounts in the format 1,234.56.";

/** Setzt Werte in die Platzhalter „{name}“ ein. Unbekannte Platzhalter bleiben stehen. */
function einsetzen(vorlage: string, werte: SaTextWerte): string {
  return vorlage.replace(/\{(\w+)\}/g, (roh, name: string) =>
    Object.prototype.hasOwnProperty.call(werte, name) ? String(werte[name]) : roh,
  );
}

/**
 * Ein Oberflächentext der Selbstauskunft in der Kundensprache.
 *
 * Auf Deutsch kommt der Text zurück, wie er ist (ohne einen Zusatz hinter
 * „|“). Auf Englisch die Übersetzung aus `SA_UI_EN`, und wenn keine da ist,
 * wieder das Deutsche: lieber ein deutscher Satz als ein leeres Feld.
 */
export function saText(de: string, sprache: Sprache, werte?: SaTextWerte): string {
  const trenner = de.indexOf("|");
  const deutsch = trenner >= 0 ? de.slice(0, trenner) : de;
  const vorlage = sprache === "en" ? SA_UI_EN[de] ?? deutsch : deutsch;
  return werte ? einsetzen(vorlage, werte) : vorlage;
}

/* ── Vorbelegung aus dem vorherigen Investment ───────────────── */

/** Der erklärende Satz oben im Formular, Deutsch aus `saVorbelegung.ts`. */
export function saVorbelegungTextIn(ausInvestment: number, sprache: Sprache): string {
  if (sprache !== "en") return saVorbelegungText(ausInvestment);
  return (
    `So that you do not have to enter everything again, we have carried over information from your ` +
    `self-disclosure (Selbstauskunft) for investment ${ausInvestment}. Each item carried over is marked ` +
    `“${SA_UI_EN[SA_FELD_MARKE]}” and has a dashed border. Please go through these items and change ` +
    `anything that is no longer correct. Only your confirmation at the end makes this information ` +
    `your self-disclosure for this purchase.`
  );
}

/** Was am übernommenen Feld vorgelesen wird. */
export function saFeldMarkeErklaerungIn(ausInvestment: number, sprache: Sprache): string {
  if (sprache !== "en") return saFeldMarkeErklaerung(ausInvestment);
  return `Carried over from investment ${ausInvestment}, please check.`;
}

/** Der Streifen über einem Abschnitt mit übernommenen Angaben. */
export function saAbschnittTextIn(ausInvestment: number, sprache: Sprache): string {
  if (sprache !== "en") return saAbschnittText(ausInvestment);
  return `Carried over from investment ${ausInvestment}. Please check.`;
}

/* ── Beträge ─────────────────────────────────────────────────── */

/**
 * Tausenderpunkte in einen Ganzzahlteil setzen: „1234567“ → „1.234.567“.
 * Dieselbe Regel wie `formatCurrency` im Formular.
 */
function tausenderpunkte(ziffern: string): string {
  return ziffern.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Ein gespeicherter deutscher Betrag in englischer Schreibweise, für die
 * Anzeige im Eingabefeld: „1.234,56“ → „1,234.56“, „2.500“ → „2,500“.
 *
 * Ein angefangenes Komma bleibt als Punkt stehen („1.234,“ → „1,234.“), damit
 * der Kunde beim Tippen der Nachkommastellen nicht aus dem Takt kommt.
 */
export function deZuEnBetrag(de: string | null | undefined): string {
  const text = typeof de === "string" ? de : "";
  if (!text) return "";
  const [ganz, ...rest] = text.split(",");
  const ganzEn = ganz.replace(/\./g, ",");
  return rest.length > 0 ? `${ganzEn}.${rest.join("")}` : ganzEn;
}

/**
 * Eine englisch getippte Eingabe als deutscher Speicherwert:
 * „1,234.56“ → „1.234,56“, „2,500“ → „2.500“, „2500“ → „2.500“.
 *
 * Das Komma ist auf Englisch immer Tausendertrenner, der Punkt das
 * Dezimalzeichen. Deshalb wird „2,500“ nie zu 2,5.
 *
 * Eine Ausnahme: Steht nach dem letzten Punkt ein Komma mit ein oder zwei
 * Ziffern („1.234,56“), hat jemand eine deutsche Zahl eingefügt. Die bleibt
 * deutsch, statt als 1,23 zu enden.
 *
 * Höchstens zwei Nachkommastellen, wie im deutschen Formular.
 */
export function enZuDeBetrag(en: string | null | undefined): string {
  const sauber = (typeof en === "string" ? en : "").replace(/[^\d.,]/g, "");
  if (!sauber) return "";
  const letzterPunkt = sauber.lastIndexOf(".");
  const letztesKomma = sauber.lastIndexOf(",");

  if (letzterPunkt >= 0 && letztesKomma > letzterPunkt && /^\d{1,2}$/.test(sauber.slice(letztesKomma + 1))) {
    const ganz = sauber.slice(0, letztesKomma).replace(/[.,]/g, "");
    return `${tausenderpunkte(ganz)},${sauber.slice(letztesKomma + 1)}`;
  }

  if (letzterPunkt < 0) return tausenderpunkte(sauber.replace(/,/g, ""));

  const ganz = sauber.slice(0, letzterPunkt).replace(/[.,]/g, "");
  const nachkomma = sauber.slice(letzterPunkt + 1).replace(/[.,]/g, "").slice(0, 2);
  return `${tausenderpunkte(ganz)},${nachkomma}`;
}
