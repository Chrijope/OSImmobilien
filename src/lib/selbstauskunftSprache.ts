/**
 * Die Selbstauskunft auf Englisch: Erklärungen, Einwilligung und die Anzeige
 * der gespeicherten Auswahlwerte.
 *
 * Plan Kundensprache vom 25.09.2026, Abschnitt 4.1 und Entscheidung 7. Von
 * hier lesen das Online-Formular, die Signaturseite, das PDF für die Bank und
 * das Skript für das ausfüllbare Formular, damit an allen Stellen derselbe
 * Wortlaut steht.
 *
 * Die wichtigste Regel steht bei `SA_WERTE_EN`: Gespeichert wird immer der
 * deutsche Wert. Übersetzt wird nur die Anzeige.
 */
import type { Sprache } from "./kundenSprache";
import { zweisprachigeBeschriftung } from "./zweisprachig";

/**
 * Die Fassung der englischen Rechtstexte der Selbstauskunft (Erklärung,
 * SCHUFA-Klausel, Einwilligung zur elektronischen Unterschrift). Die deutsche
 * Fassung bleibt maßgeblich; wer einen englischen Satz ändert, hebt die
 * Kennung an. Nach dem Vorbild der Expats-Einwilligung `2026-09-v1-en`.
 */
export const SA_RECHTSTEXT_FASSUNG_EN = "2026-09-25-en";

/**
 * Die Erklärung über den Unterschriften, wörtlich wie bisher im PDF. Das
 * Deutsch ist unverändert; Englisch ist die Übersetzung, deutsche
 * Rechtsbegriffe beim ersten Auftreten in Klammern.
 */
export const SA_ERKLAERUNG: Record<Sprache, string> = {
  de: "Ich/Wir bestätige/n hiermit die Richtigkeit der gemachten Angaben und versichere/n, dass über mein (unser) Vermögen bisher das Vergleichs- oder Konkursverfahren nicht beantragt oder eröffnet wurde, dass ich/wir keine eidesstattliche Versicherung abgegeben habe/n, dass kein Haftbefehl zur Erzwingung der eidesstattlichen Versicherung gegen mich (uns) erlassen wurde. Der/Die Unterzeichner ermächtigen die finanzierende Bank nach § 18 Kreditwesengesetz die zur Finanzierung erforderlichen Bankauskünfte einzuholen.",
  en: "I/We hereby confirm that the information provided is correct and declare that no composition or bankruptcy proceedings (Vergleichs- oder Konkursverfahren) have so far been applied for or opened in respect of my (our) assets, that I/we have not made a statutory declaration of assets (eidesstattliche Versicherung), and that no arrest warrant to enforce such a declaration has been issued against me (us). The signatory/signatories authorise the financing bank, in accordance with Section 18 of the German Banking Act (Kreditwesengesetz), to obtain the bank references required for the financing.",
};

/** Die SCHUFA-Klausel, zweiter Absatz der Erklärung. */
export const SA_SCHUFA_KLAUSEL: Record<Sprache, string> = {
  de: "Die Bank ist berechtigt, der Schutzgemeinschaft für allgemeine Kreditsicherung (SCHUFA) Daten des Kreditnehmers und etwaiger Mitschuldner oder Bürgen über die Aufnahme (Kreditbetrag, Laufzeit, Ratenbeginn) und Abwicklung eines Kredits zur Speicherung zu übermitteln sowie Auskünfte über mich (uns) einzuholen.",
  en: "The bank is entitled to transmit data of the borrower and of any co-debtors or guarantors concerning the taking out (loan amount, term, start of repayments) and the performance of a loan to SCHUFA (Schutzgemeinschaft für allgemeine Kreditsicherung, the German credit reference agency) for storage, and to obtain information about me (us) from SCHUFA.",
};

/**
 * Die Einwilligung am Kästchen vor der Unterschrift im Online-Formular.
 * Die deutsche Fassung ist der bisherige Wortlaut.
 */
export const SA_EINWILLIGUNG: Record<Sprache, string> = {
  de: "Ich bestätige die Richtigkeit und Vollständigkeit meiner Angaben in der Selbstauskunft. Ich bin damit einverstanden, dass meine Unterschrift elektronisch erfasst, gespeichert und zur Dokumentation der Selbstauskunft verwendet wird. (EES gemäß eIDAS-Verordnung)",
  en: "I confirm that the information I have provided in the self-disclosure (Selbstauskunft) is correct and complete. I agree that my signature is captured and stored electronically and used to document the self-disclosure. (Simple electronic signature under the eIDAS Regulation)",
};

/**
 * Die gespeicherten Auswahlwerte und ihre englische Anzeige.
 *
 * **Gespeichert wird immer der deutsche Wert** („Verheiratet“, „Zur Miete“,
 * „Girokonto“ …). Prüfungen im ganzen CRM schauen auf diese Werte, etwa
 * `hatGueterstand` in `familienstand.ts`, die Zuordnung der Kredite oder das
 * Auslesen des ausfüllbaren PDF. Ein englischer Wert in der Datenbank würde
 * sie still brechen. Deshalb übersetzt diese Liste nur die Anzeige.
 *
 * Kleingeschriebene Schlüssel („ja“, „gesetzlich“) sind technische Werte,
 * großgeschriebene die Klartexte aus den Auswahllisten.
 */
export const SA_WERTE_EN: Readonly<Record<string, string>> = {
  // Anrede
  Herr: "Mr",
  Frau: "Ms",
  Divers: "Mx",
  // Staatsangehörigkeit (Radio „deutsch“ / „andere“)
  deutsch: "German",
  andere: "Other",
  Deutsch: "German",
  Andere: "Other",
  // Familienstand
  Ledig: "Single",
  Verheiratet: "Married",
  Geschieden: "Divorced",
  Verwitwet: "Widowed",
  "Eingetragene Lebenspartnerschaft": "Registered civil partnership",
  // Wohnhaft seit
  "Weniger als 1 Jahr": "Less than 1 year",
  "1-3 Jahre": "1 to 3 years",
  "3-5 Jahre": "3 to 5 years",
  "Mehr als 5 Jahre": "More than 5 years",
  // Ja / Nein
  ja: "Yes",
  nein: "No",
  Ja: "Yes",
  Nein: "No",
  // Güterstand
  gesetzlich: "Community of accrued gains (statutory)",
  guetertrennung: "Separation of property",
  guetergemeinschaft: "Community of property",
  Zugewinngemeinschaft: "Community of accrued gains",
  Gütertrennung: "Separation of property",
  Gütergemeinschaft: "Community of property",
  // Beschäftigung
  angestellt: "Employed",
  selbstaendig: "Self-employed",
  hausfrau: "Homemaker",
  // Arbeitsvertrag
  unbefristet: "Permanent",
  probezeit: "On probation",
  befristet: "Fixed-term",
  // Kontoart
  Girokonto: "Current account",
  Sparkonto: "Savings account",
  Tagesgeld: "Instant-access savings",
  Depot: "Securities account",
  // Wohnsituation
  "Zur Miete": "Renting",
  Eigentum: "Owner-occupied",
  Mietfrei: "Rent-free",
  // Vermögensart
  "Bank- & Sparguthaben": "Bank and savings balances",
  "Wertpapiere / Depot": "Securities / portfolio",
  Bausparvertrag: "Building savings contract (Bausparvertrag)",
  Lebensversicherung: "Life insurance",
  Immobilien: "Real estate",
  Sonstige: "Other",
  Sonstiges: "Other",
  // Nutzung einer Immobilie
  eigen: "Owner-occupied",
  fremd: "Let to tenants",
  // Kreditauswahl (Werte aus `KREDIT_AUSWAHL`)
  immobilienkredit: "Property loan / mortgage",
  bauspardarlehen: "Building savings loan",
  kfz_finanzierung: "Vehicle financing",
  kfz_leasing: "Leasing (vehicle)",
  ratenkredit: "Instalment or consumer loan",
  dispo: "Overdraft facility",
  kreditkarte: "Credit card debt",
  privatdarlehen: "Private loan from family or friends",
  studienkredit: "Student loan or BAföG",
  sonstiges: "Other",
  keine: "None / general loan",
  // Die Beschriftungen derselben Kreditauswahl, wie sie im PDF stehen
  "Immobilienkredit / Baufinanzierung": "Property loan / mortgage",
  Bauspardarlehen: "Building savings loan",
  "KFZ-Finanzierung": "Vehicle financing",
  "Leasing (Fahrzeug)": "Leasing (vehicle)",
  "Raten- oder Konsumentenkredit": "Instalment or consumer loan",
  Dispositionskredit: "Overdraft facility",
  Kreditkartenkredit: "Credit card debt",
  "Privatdarlehen von Familie oder Freunden": "Private loan from family or friends",
  "Studienkredit oder BAföG": "Student loan or BAföG",
  // Anlageziele (gespeichert als Beschriftung aus `anlageZiele.ts`)
  "Vermögensaufbau und Werte schaffen": "Building wealth and creating value",
  "Steuervorteile sichern": "Securing tax advantages",
  "Geldanlage und Inflationsschutz": "Investment and protection against inflation",
  "Finanzielle Freiheit durch passives Einkommen": "Financial freedom through passive income",
  "Eigenes Immobilien-Portfolio auf- und ausbauen": "Building and expanding my own property portfolio",
  "Kapitalaufbau für das spätere Eigenheim": "Building capital for a future home of my own",
  "Sorgenfrei im Alter durch eine Immobilienrente": "A carefree retirement through property income",
  "Sichere finanzielle Zukunft für die Kinder": "A secure financial future for the children",
  "Fremdkapitalhebel mit wenig Eigenkapital": "Leverage with little equity",
};

/** Die englische Anzeige eines gespeicherten Werts, sonst der Wert selbst. */
export function saWertAnzeige(wert: string | null | undefined, sprache: Sprache): string {
  const w = typeof wert === "string" ? wert : "";
  if (sprache !== "en" || !w) return w;
  return SA_WERTE_EN[w] ?? SA_WERTE_EN[w.trim()] ?? w;
}

/**
 * Ein gespeicherter Wert im zweisprachigen PDF: „Verheiratet / Married“.
 * Unbekannte oder frei getippte Werte bleiben, wie sie sind.
 */
export function saWertZweisprachig(wert: string | null | undefined, sprache: Sprache): string {
  const w = typeof wert === "string" ? wert : "";
  if (sprache !== "en" || !w) return w;
  const en = SA_WERTE_EN[w] ?? SA_WERTE_EN[w.trim()];
  return en ? zweisprachigeBeschriftung(w, en) : w;
}
