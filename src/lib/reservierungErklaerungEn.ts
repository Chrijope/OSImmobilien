/**
 * Die englische Fassung der Reservierungsvereinbarung.
 *
 * Plan Kundensprache vom 25.09.2026, Etappe 4 und Entscheidung 6: Ein
 * englischer Kunde bekommt die Vereinbarung zweisprachig, der deutsche
 * Wortlaut in `reservierungErklaerung.ts` ist maßgeblich. Diese Datei ist
 * **nur die Übersetzung** der Fassungen `2026-09-22` (Einzelwohnung) und
 * `2026-09-23 Gesamtobjekt`. Inhaltlich darf hier nichts stehen, was dort
 * nicht steht. Christian hat erklärt, dass die Rechtstexte vom Anwalt
 * freigegeben sind.
 *
 * Aufbau: Jeder Punkt trägt dieselbe Kennung wie im deutschen Original, und
 * jede Fassung (Globalobjekt, Gesellschaft, ohne Gebühr) steht an derselben
 * Stelle. `reservierungErklaerungEn.test.ts` prüft, dass zu jeder deutschen
 * Fassung eine englische da ist und dass die Verweise (`{{abschnitt:…}}`,
 * `{{punkt:…}}`) übereinstimmen. Die Nummern entstehen wie im Deutschen erst
 * beim Zusammensetzen, siehe `vertragsAufbau`.
 *
 * Sprachregeln (Plan 4.4, Glossar `kundenspracheGlossar.ts`):
 *   - förmlich, ohne Kurzformen, britisches Englisch;
 *   - der Vertrag bleibt in der dritten Person („the prospective buyer“),
 *     die Erklärungen des Kunden in der ersten („I/We“);
 *   - deutsche Rechtsbegriffe beim ersten Auftreten mit dem deutschen Wort
 *     in Klammern, Paragrafen als „Section 448 (2) BGB“;
 *   - Beträge und Daten bleiben im deutschen Format (Entscheidung 9).
 *
 * Wer einen Satz hier ändert, hebt `TEXT_FASSUNG_EN` an.
 */
import type { AbschnittKennung, ZifferKennung } from "./reservierungErklaerung";
import { IMPRESSUM_EMAIL, IMPRESSUM_TELEFON } from "./impressumKontakt";

/**
 * Die Fassung der englischen Übersetzung für Einzelwohnungen, nach dem
 * Vorbild `2026-09-v1-en` der Expats-Einwilligung. Sie steht mit der
 * deutschen Fassung im Datensatz und in der Fußzeile des PDF.
 */
export const TEXT_FASSUNG_EN = "2026-09-25-en";

/** Die Fassung der englischen Übersetzung für das Globalobjekt. */
export const TEXT_FASSUNG_GESAMTOBJEKT_EN = "2026-09-25-en Gesamtobjekt";

/** Die Überschriften der Abschnitte. */
export const ABSCHNITT_TITEL_EN: Record<AbschnittKennung, string> = {
  kaeufer: "Buyer details",
  objekt: "Property details",
  notar: "Notary and completion",
  gebuehr: "Reservation fee and bank details",
  vereinbarung: "Reservation agreement",
  datenschutz: "Data protection",
  widerruf: "Information on the right of withdrawal",
  unterschriften: "Signatures",
};

export const OBJEKT_EINLEITUNG_EN =
  "I/We intend to acquire the property described below through MOREImmo.";

export const OBJEKT_EINLEITUNG_GESAMTOBJEKT_EN =
  "I/We intend to acquire the property described below as a whole through MOREImmo, that is, the plot of land with the building and all units contained in it. The acquisition of individual units is not the subject of this agreement.";

export const KAUFGEGENSTAND_GESAMTOBJEKT_EN = "Entire property (plot of land with building and all units)";

export const AUFTEILUNG_TEXT_EN = {
  aufgeteilt: "divided into residential and partial ownership (Wohnungs- und Teileigentum)",
  nicht_aufgeteilt: "not divided",
} as const;

export const NOTAR_HINWEIS_EN =
  "As a rule, the purchase contract is notarised at the notary's office that the seller has designated for this property and with which MOREImmo already works. Another notary's office may be instructed after prior consultation with MOREImmo and with the seller's consent. The costs of notarisation are borne by the prospective buyer (Section 448 (2) of the German Civil Code, BGB).";

export const GEBUEHR_EINLEITUNG_EN =
  "To confirm the reservation, the following reservation fee is to be transferred to the account below within seven days of signing:";

export const VEREINBARUNG_EINLEITUNG_EN =
  "MOREImmo and the prospective buyer agree as follows with regard to the property:";

/** Ein Punkt der Vereinbarung auf Englisch, mit denselben Fassungen wie im Deutschen. */
export interface ZifferTexteEn {
  text: string;
  textOhneGebuehr?: string | null;
  punkte?: string[];
  textGesamtobjekt?: string;
  punkteGesamtobjekt?: string[];
  textGesellschaft?: string;
}

const PUNKT_C_EN = "c) to work towards the prompt conclusion of a contract between the prospective buyer and the seller;";
const PUNKT_D_EN = "d) to carry out the preparations necessary for concluding the contract (reserving a notary appointment; where applicable, providing a draft contract) and to support the prospective buyer in preparing the purchase.";

const ZAHLUNG_ZWEITER_TEIL_EN =
  " Payment is due within seven days of signing this agreement. The fee covers the activities of MOREImmo set out in point {{punkt:pflichten}}, the reservation risk (possible loss caused by suspending other brokerage efforts) and the additional effort incurred by resuming the brokerage efforts.";

const VERFALL_EN =
  "The reservation fee will not be refunded if the purchase contract is not concluded for reasons for which the prospective buyer is solely or predominantly responsible. If the financing credit institution declines the financing, the fee will be refunded in full upon presentation of the written rejection, provided that the prospective buyer has submitted the documents required for the financing assessment completely and truthfully.";

const WIRKSAMKEIT_EN =
  "The reservation agreement becomes legally effective upon signature by the prospective buyer; countersignature by MOREImmo is not required. Signing takes place electronically.";

/** Die Punkte der Vereinbarung, je Kennung. */
export const ZIFFERN_EN: Record<ZifferKennung, ZifferTexteEn> = {
  zeitraum: {
    text: "In order to grant the prospective buyer a reasonable period for the purchase decision, for obtaining a loan and for other preparations, MOREImmo reserves the property from the day on which this agreement is signed until the agreed notary appointment.",
    textGesamtobjekt: "In order to grant the prospective buyer a reasonable period for the purchase decision, for reviewing the property and tenancy documents, for obtaining a loan and for other preparations, MOREImmo reserves the property from the day on which this agreement is signed until the agreed notary appointment.",
  },
  pflichten: {
    text: "During this period, MOREImmo undertakes",
    punkte: [
      "a) not to offer the property to other interested parties and not to negotiate with them about the property;",
      "b) to work towards ensuring that the seller does not sell the property to anyone else during the reservation period;",
      PUNKT_C_EN,
      PUNKT_D_EN,
    ],
    punkteGesamtobjekt: [
      "a) not to offer the property to other interested parties and not to negotiate with them about the property, neither as a whole nor with regard to individual units within it;",
      "b) to work towards ensuring that the seller does not sell the property to anyone else during the reservation period, neither as a whole nor in parts;",
      PUNKT_C_EN,
      PUNKT_D_EN,
    ],
  },
  pflichtbeginn: {
    text: "The obligations of MOREImmo commence upon payment of the reservation fee. If the prospective buyer has chosen under section {{abschnitt:widerruf}} to wait until the end of the withdrawal period, they commence at the earliest upon its expiry.",
    textGesellschaft: "The obligations of MOREImmo commence upon payment of the reservation fee.",
    textOhneGebuehr: "The obligations of MOREImmo commence upon signature of this agreement. No reservation fee is charged for this reservation.",
  },
  abschlussfreiheit: {
    text: "Neither the prospective buyer nor MOREImmo nor the seller is obliged to conclude the envisaged purchase contract. Both sides remain free in their decision until the notarial contract has been concluded. The prospective buyer shall inform MOREImmo without undue delay if they abandon their intention to purchase.",
  },
  bestand: {
    text: "The property is acquired subject to the existing tenancies and leases, unless the purchase contract provides otherwise. Information on units, areas, rents and tenancies originates from the seller; it is neither a warranty nor a statement of quality (Beschaffenheitsangabe) by MOREImmo. The notarial purchase contract alone is authoritative for the object of purchase, its condition and the purchase price.",
  },
  benennung: {
    text: "No later than ten days before the notary appointment, the prospective buyer may name to MOREImmo, in text form (Textform), a company in which they hold an interest and which is to conclude the purchase contract in their place. MOREImmo will work towards the seller concluding the contract with the named company. Upon being named, the company assumes the rights and obligations under this agreement; the prospective buyer remains liable for the obligations under this agreement alongside the company.",
  },
  zahlung: {
    text: `The prospective buyer shall pay the reservation fee determined by reference to the purchase price in section {{abschnitt:gebuehr}} into the account specified there.${ZAHLUNG_ZWEITER_TEIL_EN}`,
    textGesamtobjekt: `The prospective buyer shall pay the reservation fee determined for the entire property in section {{abschnitt:gebuehr}} into the account specified there.${ZAHLUNG_ZWEITER_TEIL_EN}`,
  },
  rueckzahlung: {
    text: "If the purchase contract is concluded, the reservation fee will be refunded in full on the day of notarisation, namely to the prospective buyer's account specified in section {{abschnitt:kaeufer}}. If no account is specified there, the prospective buyer shall inform MOREImmo of their bank details before notarisation; the refund will then be made without undue delay after receipt of this information.",
  },
  verfall: {
    text: VERFALL_EN,
    textGesamtobjekt: `${VERFALL_EN} If the purchase contract is not concluded for other reasons, in particular because the seller does not sell the property to the prospective buyer, the reservation fee will be refunded in full without undue delay, at the latest within fourteen days.`,
  },
  wirksamkeit: {
    text: WIRKSAMKEIT_EN,
    textGesellschaft: `${WIRKSAMKEIT_EN} Anyone signing this agreement on behalf of a company warrants that they are authorised to represent it and shall provide evidence of this on request by means of a current extract from the commercial register or a power of attorney.`,
  },
  dolmetscher: {
    text: "If an interpreter is required, a publicly appointed and sworn interpreter shall be engaged.",
  },
};

/* ─── Widerruf ─── */

export const WAHL_SOFORT_SATZ_EN =
  "I expressly request that MOREImmo begin the reservation and the services under point {{punkt:pflichten}} immediately, that is, before the withdrawal period has expired.";
export const WAHL_SOFORT_ERLAEUTERUNG_EN =
  "I am aware that, if I withdraw, I must pay a proportionate amount for the services provided up to that point, and that my right of withdrawal expires if the reservation has been fully performed before I withdraw (Section 356 (4) BGB).";
export const WAHL_ABWARTEN_SATZ_EN =
  "I wish MOREImmo to begin the reservation only after the withdrawal period has expired.";
export const WAHL_ABWARTEN_ERLAEUTERUNG_EN =
  "I am aware that the apartment is not reserved for me until the withdrawal period has expired and that, during this time, it may be offered to and reserved by other prospective buyers. If another reservation is concluded, this agreement lapses, and any reservation fee already paid will be refunded in full.";
export const WAHL_ABWARTEN_ERLAEUTERUNG_GESAMTOBJEKT_EN =
  "I am aware that the property is not reserved for me until the withdrawal period has expired and that, during this time, it may be offered to and reserved by other prospective buyers. If another reservation is concluded, this agreement lapses, and any reservation fee already paid will be refunded in full.";
export const AUFLOESENDE_BEDINGUNG_EN =
  "If the prospective buyer chooses to wait, the property is not reserved for them until the withdrawal period has expired; during this time, MOREImmo will continue to offer it to other prospective buyers as well. If, during this time, MOREImmo concludes a reservation agreement with another prospective buyer or a purchase contract for the property is concluded, this agreement ends without any further declaration (condition subsequent, auflösende Bedingung). In this case, any reservation fee already paid will be refunded in full without undue delay, at the latest within fourteen days. The withdrawal period begins on the day on which the contract is concluded; where there are several prospective buyers, on the day of the last signature (point {{punkt:wirksamkeit}}).";

export const WIDERRUF_WAHL_TITEL_EN = "Start of the reservation";
export const WIDERRUF_WAHL_EINLEITUNG_EN =
  "The prospective buyer may choose whether the reservation begins immediately or only after the withdrawal period has expired. Exactly one box must be ticked.";

/**
 * Der Unternehmer in der englischen Belehrung. Mit „Germany“, weil die
 * Anschrift sonst für einen Leser im Ausland unvollständig ist; sonst
 * dieselben Angaben wie im Deutschen.
 */
const BELEHRUNG_UNTERNEHMER_EN =
  `MOREImmo, owner Christian Kurz, Wendelsteinstraße 19, 83075 Bad Feilnbach, Germany${IMPRESSUM_TELEFON ? `, telephone ${IMPRESSUM_TELEFON}` : ""}, email ${IMPRESSUM_EMAIL}`;

/**
 * Die Widerrufsbelehrung auf Englisch.
 *
 * Wortlaut nach der amtlichen englischen Fassung des Musters aus Anhang I
 * Teil A der Richtlinie 2011/83/EU, deren deutsche Fassung die Musterbelehrung
 * der Anlage 1 zu Art. 246a EGBGB ist. So bleibt die Übersetzung so nah wie
 * möglich an einem amtlichen Text. Maßgeblich ist die deutsche Belehrung.
 */
export const WIDERRUFSBELEHRUNG_EN: { ueberschrift: string; absaetze: string[] }[] = [
  {
    ueberschrift: "Right of withdrawal",
    absaetze: [
      "You have the right to withdraw from this contract within fourteen days without giving any reason.",
      "The withdrawal period will expire after fourteen days from the day of the conclusion of the contract.",
      `To exercise the right of withdrawal, you must inform us (${BELEHRUNG_UNTERNEHMER_EN}) of your decision to withdraw from this contract by an unequivocal statement (e.g. a letter sent by post or email).`,
      "To meet the withdrawal deadline, it is sufficient for you to send your communication concerning your exercise of the right of withdrawal before the withdrawal period has expired.",
    ],
  },
  {
    ueberschrift: "Effects of withdrawal",
    absaetze: [
      "If you withdraw from this contract, we shall reimburse to you all payments received from you, including the costs of delivery (with the exception of the supplementary costs resulting from your choice of a type of delivery other than the least expensive type of standard delivery offered by us), without undue delay and in any event not later than fourteen days from the day on which we are informed about your decision to withdraw from this contract. We will carry out such reimbursement using the same means of payment as you used for the initial transaction, unless you have expressly agreed otherwise; in any event, you will not incur any fees as a result of such reimbursement.",
      "If you requested to begin the performance of services during the withdrawal period, you shall pay us an amount which is in proportion to what has been provided until you have communicated to us your withdrawal from this contract, in comparison with the full coverage of the contract.",
    ],
  },
];

/* ─── Datenschutz und Unterschriften ─── */

export const DATENSCHUTZ_EINVERSTAENDNIS_EN =
  "I/We agree that my/our data may be processed electronically, stored and used and, in connection with the handling of the transaction, passed on or transmitted to authorised third parties (for example the seller, the notary's office, the financing credit institution, the supervising sales partner, the property management), where it will likewise be processed, stored and used for these purposes. I/We have also been informed that the collection, processing and use of my/our data is voluntary. The MOREImmo privacy policy is available at portal.more.immo/datenschutz (English version: portal.more.immo/datenschutz?lang=en).";

export const UNTERSCHRIFT_BESTAETIGUNG_EN =
  "I/We confirm that I/we have read this agreement in full, including the information on the right of withdrawal, before signing and that I/we will receive a copy on a durable medium.";

export const UNTERSCHRIFT_BESTAETIGUNG_OHNE_WIDERRUF_EN =
  "I/We confirm that I/we have read this agreement in full before signing and that I/we will receive a copy on a durable medium.";

/* ─── Beschriftungen in Schirm und PDF ─── */

/**
 * Die englischen Beschriftungen der Zeilen, nach dem deutschen Wort.
 *
 * Über das deutsche Wort, weil die Zeilenbausteine (`objektZeilenGesamtobjekt`,
 * `kaeuferZeilenGesellschaft`, `gebuehrAbschnitt`) deutsche Beschriftungen
 * liefern und bleiben sollen. Fehlt ein Eintrag, bleibt die Zeile deutsch;
 * der Test prüft, dass das nicht passiert.
 */
export const BESCHRIFTUNG_EN: Readonly<Record<string, string>> = {
  "Käufer 1": "Buyer 1",
  "Käufer 2": "Buyer 2",
  Vorname: "First name",
  Nachname: "Surname",
  Geburtsname: "Name at birth",
  Geburtsdatum: "Date of birth",
  Geburtsort: "Place of birth",
  Staatsangehörigkeit: "Nationality",
  "Straße / Nr.": "Street / No.",
  "PLZ / Ort": "Postcode / Town",
  Telefon: "Telephone",
  "E-Mail": "Email",
  "IBAN für die Rückzahlung": "IBAN for the refund",
  Güterstand: "Matrimonial property regime",
  Wohneinheit: "Residential unit",
  "Stellplatz / Nr.": "Parking space / No.",
  "Garage / Nr.": "Garage / No.",
  Straße: "Street",
  Gesamtpreis: "Total price",
  "Kaufpreis gesamt": "Total purchase price",
  "Dolmetscher benötigt": "Interpreter required",
  "Hinweis zur Beurkundung:": "Note on notarisation:",
  "Sonstige Informationen:": "Other information:",
  "Für diesen Kaufpreis": "For this purchase price",
  "Reservierungsgebühr für ein Gesamtobjekt": "Reservation fee for an entire property",
  Kontoinhaber: "Account holder",
  IBAN: "IBAN",
  BIC: "BIC",
  Bank: "Bank",
  Verwendungszweck: "Payment reference",
  Kaufgegenstand: "Object of purchase",
  "Anzahl Einheiten": "Number of units",
  Grundbuch: "Land register",
  Aufteilung: "Division",
  "Stellplätze / Garagen": "Parking spaces / garages",
  Firma: "Company",
  Rechtsform: "Legal form",
  "Sitz / Anschrift": "Registered office / address",
  "Registergericht / Nummer": "Register court / number",
  "vertreten durch": "represented by",
  "Unterschrift Käufer 1": "Signature buyer 1",
  "Unterschrift Käufer 2": "Signature buyer 2",
};

/** Die Werte, die das Dokument selbst schreibt (nicht die Eingaben des Kunden). */
export const WERT_EN = {
  ja: "Yes",
  nein: "No",
  sprache: "language",
  keine: "none",
  einheiten: "units",
  /** Der Güterstand hinter dem deutschen Wort: „Zugewinngemeinschaft / Community of accrued gains“. */
  gueterstand: {
    Zugewinngemeinschaft: "Community of accrued gains",
    Gütertrennung: "Separation of property",
    Gütergemeinschaft: "Community of property",
  } as Record<string, string>,
  fuerDieKaeuferin: "For the buyer:",
  kaufpreisUnter: "Purchase price below",
  kaufpreisAb: "Purchase price from",
} as const;

/** Die Wörter am Unterschriftsblock des PDF. */
export const UNTERSCHRIFT_WOERTER_EN = {
  ort: "Place",
  bestaetigt: "Digitally confirmed on",
  ausstehend: "Signature pending",
  nichtDarstellbar: "Signature could not be displayed",
} as const;
