import {
  GEBUEHR_BANK,
  GEBUEHR_BIC,
  GEBUEHR_GESAMTOBJEKT,
  GEBUEHR_GESAMTOBJEKT_LABEL,
  GEBUEHR_IBAN,
  GEBUEHR_KONTOINHABER,
  euroText,
  gebuehrAusText,
  staffelZeilen,
  verwendungszweck,
  verwendungszweckGesamtobjekt,
} from "./reservierungsgebuehr";
import { IMPRESSUM_TELEFON, IMPRESSUM_EMAIL } from "./impressumKontakt";
import { normalisiereSprache, type Sprache } from "../../supabase/functions/_shared/kunden-sprache.ts";
import {
  ABSCHNITT_TITEL_EN,
  AUFLOESENDE_BEDINGUNG_EN,
  BESCHRIFTUNG_EN,
  DATENSCHUTZ_EINVERSTAENDNIS_EN,
  GEBUEHR_EINLEITUNG_EN,
  KAUFGEGENSTAND_GESAMTOBJEKT_EN,
  NOTAR_HINWEIS_EN,
  OBJEKT_EINLEITUNG_EN,
  OBJEKT_EINLEITUNG_GESAMTOBJEKT_EN,
  TEXT_FASSUNG_EN,
  TEXT_FASSUNG_GESAMTOBJEKT_EN,
  UNTERSCHRIFT_BESTAETIGUNG_EN,
  UNTERSCHRIFT_BESTAETIGUNG_OHNE_WIDERRUF_EN,
  VEREINBARUNG_EINLEITUNG_EN,
  WAHL_ABWARTEN_ERLAEUTERUNG_EN,
  WAHL_ABWARTEN_ERLAEUTERUNG_GESAMTOBJEKT_EN,
  WAHL_ABWARTEN_SATZ_EN,
  WAHL_SOFORT_ERLAEUTERUNG_EN,
  WAHL_SOFORT_SATZ_EN,
  WIDERRUFSBELEHRUNG_EN,
  WIDERRUF_WAHL_EINLEITUNG_EN,
  WIDERRUF_WAHL_TITEL_EN,
  ZIFFERN_EN,
} from "./reservierungErklaerungEn";

/**
 * Die Texte der Reservierungsvereinbarung.
 *
 * Sie standen zuvor an zwei Stellen, im Formular auf dem Schirm und im PDF,
 * und waren dabei auseinandergelaufen: verschieden viele Absätze, verschiedene
 * Formulierungen. Unterschrieben wird das PDF, angezeigt der Schirm; was der
 * Kunde liest, war also nicht ganz das, was er unterschreibt. Deshalb liegen
 * die Texte hier und werden an beiden Stellen von hier gelesen.
 *
 * **Nichts hier ist frei formuliert.** Am 14.09.2026 hat Christian entschieden,
 * dass ausschließlich der Wortlaut der Vorlage gilt. Am 15.09.2026 kam der
 * Rechtsentwurf von Dr. Moritz Hellwig, und noch am selben Tag hat Christian
 * ihn deutlich gekürzt: Abschnitt 5 hat seither neun kompakte Punkte nach dem
 * Vorbild eines Branchenmusters, Abschnitt 6 einen Absatz ohne Ankreuzfelder,
 * das Muster-Widerrufsformular ist entfallen. Wer einen Satz ändern will,
 * hebt danach `TEXT_FASSUNG` an.
 *
 * Bewusste Abweichungen vom Branchenmuster: MOREImmo ist Vermittler, nicht
 * Verkäufer, deshalb „hinwirken" statt „veräußern" und ein dritter Beteiligter
 * in Punkt 4. Keine Frist in Wochen, die Reservierung läuft bis zum
 * vereinbarten Notartermin. Die Finanzierungsabsage ist in Punkt 7 geregelt,
 * Rückzahlung gegen die schriftliche Absage der Bank. Und bei der Wahl
 * „Widerrufsfrist abwarten" sagt der Text ausdrücklich, dass die Wohnung bis
 * zum Fristablauf nicht reserviert ist.
 *
 * ## Warum die Nummern hier nicht mehr im Satz stehen (22.09.2026)
 *
 * Seit dem 22.09.2026 kann eine Reservierung ohne Reservierungsgebühr
 * geschlossen werden. Dann fallen ganze Abschnitte und Punkte weg, und alles,
 * was danach kommt, rückt auf. Die Nummern standen vorher als fester Text in
 * den Sätzen („in Abschnitt 4", „in Punkt 2"), und genau daran wäre der
 * Wegfall gescheitert: Der Verweis hätte auf die falsche Stelle gezeigt.
 *
 * Deshalb trägt jeder Abschnitt und jeder Punkt eine sprechende Kennung, die
 * Nummer entsteht aus der Position, und jeder Verweis im Text ist ein
 * Platzhalter auf eine Kennung. `vertragsAufbau` setzt beides zusammen und
 * bricht laut ab, sobald ein Verweis auf etwas zeigt, das im Dokument gar
 * nicht steht. Der Wortlaut selbst hat sich dabei nicht geändert: Im
 * Regelfall mit Gebühr erzeugt der Platzhalter dieselbe Zahl, die vorher da
 * stand.
 */

/**
 * Die Fassung des Vertragstextes, wie sie mit `rvData` gespeichert wird.
 *
 * Ohne sie ändert, wer morgen einen Satz hier ändert, rückwirkend den Text,
 * den jeder frühere Kunde „unterschrieben" hat. Mit ihr steht im Datensatz
 * und in der Fußzeile des PDF, welcher Wortlaut galt. Bei jeder Änderung an
 * den Texten dieser Datei wird das Datum angehoben. Ein Buchstabe dahinter
 * unterscheidet mehrere Fassungen an einem Tag.
 */
export const TEXT_FASSUNG = "2026-09-22";

/**
 * Die Fassung für ein Globalobjekt, also die Reservierung des ganzen Hauses.
 *
 * Eine eigene Fassung, weil der Wortlaut an vielen Stellen abweicht (Entwurf
 * `Reservierung_Globalobjekt_Entwurf_2026-09-23.md`, Tabellen A bis C, von
 * Christian freigegeben am 23.09.2026). Die Fassung für Einzelwohnungen
 * behält `TEXT_FASSUNG`; wer nur die Globalfassung ändert, hebt nur diese an.
 * Der Zusatz „Gesamtobjekt“ steht in der Fußzeile des PDF, damit jedes
 * Exemplar auch ohne Datensatz zuzuordnen ist.
 */
export const TEXT_FASSUNG_GESAMTOBJEKT = "2026-09-23 Gesamtobjekt";

/** Die Fassung, die zu diesem Fall gehört. */
export function textFassung(opt: VertragsOptionen = {}): string {
  return opt.gesamtobjekt === true ? TEXT_FASSUNG_GESAMTOBJEKT : TEXT_FASSUNG;
}

/*
 * ─── Vertragssprache (seit dem 25.09.2026) ───
 *
 * Plan Kundensprache, Etappe 4 und Entscheidung 6: Ein englischer Kunde
 * bekommt die Vereinbarung zweisprachig. Der deutsche Wortlaut dieser Datei
 * bleibt maßgeblich, die Übersetzung steht in `reservierungErklaerungEn.ts`.
 *
 * Gespeichert wird mit dem Datensatz (`rvData`), in welcher Sprache die
 * Vereinbarung hinausging:
 *   vertragssprache  "de" oder "en"; fehlt bei allem vor dem 25.09.2026
 *                    und heißt dann Deutsch
 *   textFassung      wie bisher die deutsche, maßgebliche Fassung
 *   textFassungEn    nur bei Englisch: die Fassung der Übersetzung
 */
export type VertragsSprache = Sprache;

export { TEXT_FASSUNG_EN, TEXT_FASSUNG_GESAMTOBJEKT_EN };

/** Die Fassung der englischen Übersetzung zu diesem Fall. */
export function textFassungEn(opt: VertragsOptionen = {}): string {
  return opt.gesamtobjekt === true ? TEXT_FASSUNG_GESAMTOBJEKT_EN : TEXT_FASSUNG_EN;
}

/**
 * Die Vertragssprache eines Datensatzes. Nur ein ausdrückliches „en“ macht
 * die Vereinbarung zweisprachig; jede ältere Reservierung bleibt deutsch,
 * auch wenn der Kunde heute Englisch als Sprache hat. So sieht der Kunde beim
 * Unterschreiben genau das Dokument, das hinausging.
 */
export function vertragsSpracheAus(d: { vertragssprache?: unknown } | null | undefined): VertragsSprache {
  return normalisiereSprache(d?.vertragssprache) === "en" ? "en" : "de";
}

/**
 * Die Fassungsangabe für Fußzeile und Protokoll.
 *
 * Deutsch: „2026-09-22“, wie bisher. Zweisprachig: beide Fassungen, die
 * deutsche zuerst und als maßgeblich gekennzeichnet, etwa
 * „2026-09-22 (DE, maßgeblich) / 2026-09-25-en (EN)“.
 */
export function fassungsVermerk(
  d: { vertragssprache?: unknown; textFassung?: string; textFassungEn?: string; gesamtobjekt?: boolean } | null | undefined,
): string {
  const opt: VertragsOptionen = { gesamtobjekt: d?.gesamtobjekt === true };
  const de = d?.textFassung || textFassung(opt);
  if (vertragsSpracheAus(d) !== "en") return de;
  const en = d?.textFassungEn || textFassungEn(opt);
  return `${de} (DE, maßgeblich) / ${en} (EN)`;
}

/**
 * Die englische Beschriftung zu einem deutschen Zeilenetikett, für Schirm und
 * PDF. Ohne Eintrag bleibt das deutsche Wort stehen.
 */
export function beschriftungEn(de: string): string {
  return BESCHRIFTUNG_EN[de] ?? de;
}

/** Der Unternehmer, wie er in der Widerrufsbelehrung genannt wird. */
export const UNTERNEHMER = "MOREImmo, Inhaber Christian Kurz, Wendelsteinstraße 19, 83075 Bad Feilnbach";
export const UNTERNEHMER_EMAIL = IMPRESSUM_EMAIL;

/**
 * Fällt mit der Reservierungsgebühr auch die Widerrufsthematik weg?
 *
 * Entscheidung Christians vom 22.09.2026: Die Belehrung darf nicht nur
 * entfallen, sie muss es. Der Grund, damit er nicht verloren geht: Das
 * gesetzliche Widerrufsrecht im Fernabsatz knüpft an einen Vertrag über eine
 * entgeltliche Leistung an. Ohne Gebühr fehlt das Entgelt, das Widerrufsrecht
 * entsteht damit gar nicht erst, und eine Belehrung über ein nicht bestehendes
 * Recht würde den Kunden nur verwirren.
 *
 * Die anwaltliche Prüfung dieser Frage steht noch aus. Damit die Antwort
 * nicht zehn Dateien kostet, hängt der gesamte Wegfall an diesem einen
 * Schalter: Steht er auf `false`, bleiben Belehrung, Wahl und auflösende
 * Bedingung auch ohne Gebühr im Dokument, und Abschnitt 7 wird wieder
 * mitgezählt.
 */
export const WIDERRUF_ENTFAELLT_OHNE_GEBUEHR = true;

/**
 * Der Einleitungssatz über den Objektdaten, wörtlich aus dem Papierformular.
 *
 * Er sagt, was die darunter stehenden Felder überhaupt sind: die Absicht, genau
 * dieses Objekt zu erwerben. Ohne ihn ist Abschnitt 2 eine Liste von Angaben
 * ohne Aussage.
 *
 * Geschrieben steht dort „MOREImmo", wie im übrigen Dokument. Das Papier
 * schreibt „MORE Immo" mit Leerzeichen; zwei Schreibweisen des eigenen Namens
 * in einem Vertrag sehen nach Unachtsamkeit aus.
 */
export const OBJEKT_EINLEITUNG =
  "Ich/Wir beabsichtige/n, das nachfolgend bezeichnete Objekt über MOREImmo zu erwerben.";

/**
 * Derselbe Satz beim Globalobjekt (Tabelle A).
 *
 * Ohne Wohneinheit fehlte sonst die Abgrenzung. Der zweite Satz verhindert,
 * dass jemand aus der Reservierung eines Hauses eine einzelne Wohnung ableitet.
 */
export const OBJEKT_EINLEITUNG_GESAMTOBJEKT =
  "Ich/Wir beabsichtige/n, das nachfolgend bezeichnete Objekt als Ganzes über MOREImmo zu erwerben, also das Grundstück mit dem Gebäude und sämtlichen darin befindlichen Einheiten. Der Erwerb einzelner Einheiten ist nicht Gegenstand dieser Vereinbarung.";

/** Die Einleitung über den Objektdaten, die zu diesem Fall gehört. */
export function objektEinleitung(opt: VertragsOptionen = {}, sprache: VertragsSprache = "de"): string {
  if (sprache === "en") return opt.gesamtobjekt === true ? OBJEKT_EINLEITUNG_GESAMTOBJEKT_EN : OBJEKT_EINLEITUNG_EN;
  return opt.gesamtobjekt === true ? OBJEKT_EINLEITUNG_GESAMTOBJEKT : OBJEKT_EINLEITUNG;
}

/** Die Zeile „Kaufgegenstand“ beim Globalobjekt, an Stelle der Wohneinheit. Fest, nicht änderbar. */
export const KAUFGEGENSTAND_GESAMTOBJEKT = "Gesamtobjekt (Grundstück mit Gebäude und sämtlichen Einheiten)";

/** Aufteilung nach WEG beim Globalobjekt. „offen“ wird erfasst, aber nicht gedruckt. */
export type AufteilungWert = "aufgeteilt" | "nicht_aufgeteilt" | "offen";

/** Was im Dokument steht. „offen“ fehlt hier absichtlich, siehe `objektZeilenGesamtobjekt`. */
export const AUFTEILUNG_TEXT: Record<Exclude<AufteilungWert, "offen">, string> = {
  aufgeteilt: "in Wohnungs- und Teileigentum aufgeteilt",
  nicht_aufgeteilt: "nicht aufgeteilt",
};

/** Die Beschriftungen der Wahl im Formular. */
export const AUFTEILUNG_AUSWAHL: { wert: AufteilungWert; label: string }[] = [
  { wert: "aufgeteilt", label: "In Wohnungs- und Teileigentum aufgeteilt" },
  { wert: "nicht_aufgeteilt", label: "Nicht aufgeteilt" },
  { wert: "offen", label: "Noch offen" },
];

/* ─── Abschnitte und Verweise ─── */

/**
 * Die Kennung eines Abschnitts des Dokuments.
 *
 * Sie ist die einzige Art, wie ein Text auf einen Abschnitt zeigen darf. Die
 * Zahl davor entsteht erst beim Zusammensetzen, siehe `vertragsAufbau`.
 */
export type AbschnittKennung =
  | "kaeufer"
  | "objekt"
  | "notar"
  | "gebuehr"
  | "vereinbarung"
  | "datenschutz"
  | "widerruf"
  | "unterschriften";

/** Die Kennung eines Punktes in der Reservierungsvereinbarung. */
export type ZifferKennung =
  | "zeitraum"
  | "pflichten"
  | "pflichtbeginn"
  | "abschlussfreiheit"
  | "bestand"
  | "benennung"
  | "zahlung"
  | "rueckzahlung"
  | "verfall"
  | "wirksamkeit"
  | "dolmetscher";

interface AbschnittVorlage {
  kennung: AbschnittKennung;
  titel: string;
  /** Steht nur im Dokument, wenn eine Reservierungsgebühr vereinbart ist. */
  nurMitGebuehr?: boolean;
  /**
   * Steht nur im Dokument, wenn es eine Widerrufsbelehrung gibt. Das hängt an
   * der Gebühr (`WIDERRUF_ENTFAELLT_OHNE_GEBUEHR`) und daran, ob die Käuferin
   * eine Gesellschaft ist, siehe `vertragsAufbau`.
   */
  nurMitWiderruf?: boolean;
}

/**
 * Die Abschnitte in der Reihenfolge des Dokuments.
 *
 * Die Nummer steht hier ausdrücklich nicht dabei. Sie ergibt sich aus der
 * Position unter den Abschnitten, die im jeweiligen Fall überhaupt gedruckt
 * werden.
 */
const ABSCHNITTE_VORLAGE: AbschnittVorlage[] = [
  { kennung: "kaeufer", titel: "Käuferdaten" },
  { kennung: "objekt", titel: "Objektdaten" },
  { kennung: "notar", titel: "Notar und Abwicklung" },
  { kennung: "gebuehr", titel: "Reservierungsgebühr und Kontoverbindung", nurMitGebuehr: true },
  { kennung: "vereinbarung", titel: "Reservierungsvereinbarung" },
  { kennung: "datenschutz", titel: "Datenschutzerklärung" },
  { kennung: "widerruf", titel: "Widerrufsbelehrung", nurMitWiderruf: true },
  { kennung: "unterschriften", titel: "Unterschriften" },
];

/* ─── 3. Notar und Abwicklung ─── */

/**
 * Der Hinweis zur Beurkundung, der einzige Text in Abschnitt 3.
 *
 * Darunter steht nur noch das Freitextfeld „Sonstige Informationen". Die
 * Felder für ein vorgeschlagenes Notariat und der Satz zur eigenen
 * Gebührenrechnung des Notariats sind am 15.09.2026 entfallen.
 */
export const NOTAR_HINWEIS =
  "Die Beurkundung des Kaufvertrags erfolgt in der Regel bei dem Notariat, das der Verkäufer für dieses Objekt vorgesehen hat und mit dem MOREImmo bereits zusammenarbeitet. Ein anderes Notariat kann nach vorheriger Absprache mit MOREImmo und Zustimmung des Verkäufers beauftragt werden. Die Kosten der Beurkundung trägt der Kaufinteressent (§ 448 Abs. 2 BGB).";

/* ─── 4. Reservierungsgebühr ─── */

/**
 * Der Einleitungssatz des Gebührenabschnitts, wörtlich aus dem Papierformular.
 */
export const GEBUEHR_EINLEITUNG =
  "Zur Bestätigung der Reservierung ist innerhalb von sieben Tagen nach Unterzeichnung folgende "
  + "Reservierungsgebühr auf das nachfolgende Konto zu überweisen:";

/* ─── 5. Reservierungsvereinbarung ─── */

/** Der Satz über den Punkten, der die Parteien benennt. */
export const VEREINBARUNG_EINLEITUNG =
  "MOREImmo und der Kaufinteressent vereinbaren hinsichtlich des Kaufobjekts:";

/** Ein Punkt der Vereinbarung. `punkte` trägt die Aufzählung a) bis d) in Punkt 2. */
export interface VereinbarungZiffer {
  /** Die Kennung, an der Verweise hängen. Unabhängig von der Nummer. */
  kennung: ZifferKennung;
  nummer: string;
  text: string;
  punkte?: string[];
}

interface ZifferVorlage {
  kennung: ZifferKennung;
  text: string;
  /**
   * Der Wortlaut für den Fall ohne Reservierungsgebühr.
   *
   * Fehlt das Feld, gilt derselbe Text wie sonst. `null` heißt ausdrücklich:
   * Für diesen Fall ist noch kein Wortlaut entschieden, der Punkt bleibt bis
   * dahin weg.
   */
  textOhneGebuehr?: string | null;
  punkte?: string[];
  /** Steht nur im Dokument, wenn eine Reservierungsgebühr vereinbart ist. */
  nurMitGebuehr?: boolean;
  /*
   * Die Fassung für ein Globalobjekt (Tabellen A bis C des Entwurfs vom
   * 23.09.2026). Fehlt ein Feld, gilt dort derselbe Wortlaut wie bei einer
   * Einzelwohnung. Welches Feld in welchem Fall gewinnt, steht in
   * `zifferTextFuer`.
   */
  /** Wortlaut beim Globalobjekt. */
  textGesamtobjekt?: string;
  /** Die Aufzählung a) bis d) beim Globalobjekt. */
  punkteGesamtobjekt?: string[];
  /** Wortlaut beim Globalobjekt, wenn die Käuferin eine Gesellschaft ist (Tabelle B). */
  textGesellschaft?: string;
  /** Steht nur beim Globalobjekt im Dokument. */
  nurGesamtobjekt?: boolean;
}

/**
 * Die Punkte des Abschnitts „Reservierungsvereinbarung", seit dem 15.09.2026
 * nach dem Vorbild eines Branchenmusters, aber mit MOREImmo als Vermittler
 * statt Verkäufer.
 *
 * Kennung und Text sind getrennt von der Nummer, damit Schirm und PDF die
 * Nummer fett setzen können und damit ein Wegfall die Zählung nicht zerreißt.
 */
const ZIFFERN_VORLAGE: ZifferVorlage[] = [
  {
    kennung: "zeitraum",
    // Keine Frist in Wochen, Entscheidung Christians vom 15.09.2026.
    text: "Um dem Kaufinteressenten einen angemessenen Zeitraum für die Kaufentscheidung, die Kreditbeschaffung und andere Vorbereitungen zu gewähren, reserviert MOREImmo das Objekt ab dem Tag der Unterzeichnung dieser Vereinbarung bis zum vereinbarten Notartermin.",
    // Tabelle C: beschreibt, wofür ein Hauskäufer die Zeit braucht. MOREImmo
    // muss dadurch keine Unterlagen liefern.
    textGesamtobjekt: "Um dem Kaufinteressenten einen angemessenen Zeitraum für die Kaufentscheidung, die Prüfung der Objekt- und Mietunterlagen, die Kreditbeschaffung und andere Vorbereitungen zu gewähren, reserviert MOREImmo das Objekt ab dem Tag der Unterzeichnung dieser Vereinbarung bis zum vereinbarten Notartermin.",
  },
  {
    kennung: "pflichten",
    text: "Während dieses Zeitraums verpflichtet sich MOREImmo,",
    punkte: [
      "a) das Objekt nicht anderen Interessenten anzubieten und mit ihnen nicht über das Objekt zu verhandeln;",
      // Nur hinwirken, nicht versprechen: MOREImmo ist nicht Eigentümer.
      "b) darauf hinzuwirken, dass der Verkäufer das Objekt während der Reservierungsdauer nicht anderweitig veräußert;",
      "c) auf einen baldigen Vertragsabschluss zwischen Kaufinteressent und Verkäufer hinzuwirken;",
      "d) die notwendigen Vorbereitungen für den Vertragsabschluss (Reservierung eines Notartermins; gegebenenfalls Vorlage eines Vertragsentwurfs) durchzuführen und den Kaufinteressenten bei der Vorbereitung des Kaufs zu unterstützen.",
    ],
    /*
     * Tabelle A: Beim aufgeteilten Haus wäre sonst offen, ob der Verkauf einer
     * einzelnen Wohnung gegen die Reservierung verstößt. „Hinwirken“ bleibt,
     * weil MOREImmo nicht Eigentümer ist.
     */
    punkteGesamtobjekt: [
      "a) das Objekt nicht anderen Interessenten anzubieten und mit ihnen nicht über das Objekt zu verhandeln, weder als Ganzes noch über einzelne Einheiten daraus;",
      "b) darauf hinzuwirken, dass der Verkäufer das Objekt während der Reservierungsdauer weder als Ganzes noch in Teilen anderweitig veräußert;",
      "c) auf einen baldigen Vertragsabschluss zwischen Kaufinteressent und Verkäufer hinzuwirken;",
      "d) die notwendigen Vorbereitungen für den Vertragsabschluss (Reservierung eines Notartermins; gegebenenfalls Vorlage eines Vertragsentwurfs) durchzuführen und den Kaufinteressenten bei der Vorbereitung des Kaufs zu unterstützen.",
    ],
  },
  {
    kennung: "pflichtbeginn",
    text: "Die Pflichten von MOREImmo beginnen mit Zahlung der Reservierungsgebühr. Hat der Kaufinteressent nach Abschnitt {{abschnitt:widerruf}} gewählt, das Ende der Widerrufsfrist abzuwarten, beginnen sie frühestens mit deren Ablauf.",
    // Tabelle B: Ohne Widerrufsbelehrung zeigte der zweite Satz ins Leere,
    // und `vertragsAufbau` bräche absichtlich ab.
    textGesellschaft: "Die Pflichten von MOREImmo beginnen mit Zahlung der Reservierungsgebühr.",
    /*
     * Der Beginn der Pflichten ohne Reservierungsgebühr, im Wortlaut von
     * Christians Entscheidung vom 22.09.2026.
     *
     * Beide Sätze der Regelfassung hängen an der Gebühr und an der
     * Widerrufsfrist; ohne beides stünde der Punkt ohne Inhalt da. Der zweite
     * Satz sagt ausdrücklich, dass keine Gebühr erhoben wird. Er wirkt
     * überflüssig, ist es aber nicht: Ein Vertrag, in dem über eine Gebühr
     * schlicht nichts steht, lässt den Leser fragen, ob etwas vergessen
     * wurde. Bitte nicht kürzen.
     */
    textOhneGebuehr: "Die Pflichten von MOREImmo beginnen mit Unterzeichnung dieser Vereinbarung. Für diese Reservierung wird keine Reservierungsgebühr erhoben.",
  },
  {
    kennung: "abschlussfreiheit",
    text: "Weder der Kaufinteressent noch MOREImmo noch der Verkäufer sind verpflichtet, den in Aussicht gestellten Kaufvertrag abzuschließen. Die Entscheidung bleibt bis zum Abschluss des notariellen Vertrags beiderseits frei. Der Kaufinteressent informiert MOREImmo unverzüglich von einer eventuellen Aufgabe der Kaufabsicht.",
  },
  {
    kennung: "bestand",
    nurGesamtobjekt: true,
    /*
     * Tabelle A, neuer Punkt nach dem vorigen. Wer ein ganzes Haus kauft,
     * kauft vor allem Mieteinnahmen. Die Reservierung ist das einzige
     * Dokument, das MOREImmo selbst mit ihm schließt, und darf sich nicht wie
     * eine Ertragszusage lesen (Frage 5 an den Anwalt).
     */
    text: "Das Objekt wird mit den bestehenden Miet- und Pachtverhältnissen erworben, soweit der Kaufvertrag nichts anderes bestimmt. Angaben zu Einheiten, Flächen, Mieten und Mietverhältnissen stammen vom Verkäufer; sie sind keine Zusicherung und keine Beschaffenheitsangabe von MOREImmo. Maßgeblich für Kaufgegenstand, Beschaffenheit und Kaufpreis ist allein der notarielle Kaufvertrag.",
  },
  {
    kennung: "benennung",
    nurGesamtobjekt: true,
    /*
     * Tabelle C, die Benennungsklausel. Beim Hauskauf häufig: privat
     * reservieren, dann über eine Gesellschaft kaufen, die oft erst noch
     * gegründet wird (Frage 3 an den Anwalt). Sie steht hinter dem Bestand,
     * weil beide den späteren Kaufvertrag betreffen.
     */
    text: "Der Kaufinteressent kann MOREImmo bis spätestens zehn Tage vor dem Notartermin in Textform eine Gesellschaft benennen, an der er beteiligt ist und die an seiner Stelle den Kaufvertrag schließen soll. MOREImmo wirkt darauf hin, dass der Verkäufer mit der benannten Gesellschaft abschließt. Die Rechte und Pflichten aus dieser Vereinbarung gehen mit der Benennung auf die Gesellschaft über; der Kaufinteressent haftet für die Pflichten aus dieser Vereinbarung neben ihr fort.",
  },
  {
    kennung: "zahlung",
    nurMitGebuehr: true,
    text: "Der Kaufinteressent bezahlt die in Abschnitt {{abschnitt:gebuehr}} nach dem Kaufpreis bestimmte Reservierungsgebühr an das dort angegebene Konto. Die Zahlung ist innerhalb von sieben Tagen nach Unterzeichnung dieser Vereinbarung fällig. Die Gebühr umfasst die in Punkt {{punkt:pflichten}} genannten Tätigkeiten von MOREImmo, das Reservierungsrisiko (eventueller Verlust durch Stillstand anderweitiger Vermittlungsbemühungen) und deckt den Mehraufwand ab, der durch die Neuaufnahme der Vermittlungsbemühungen entsteht.",
    // Variante A: ein fester Betrag für das Gesamtobjekt, keine Staffel.
    textGesamtobjekt: "Der Kaufinteressent bezahlt die in Abschnitt {{abschnitt:gebuehr}} für das Gesamtobjekt bestimmte Reservierungsgebühr an das dort angegebene Konto. Die Zahlung ist innerhalb von sieben Tagen nach Unterzeichnung dieser Vereinbarung fällig. Die Gebühr umfasst die in Punkt {{punkt:pflichten}} genannten Tätigkeiten von MOREImmo, das Reservierungsrisiko (eventueller Verlust durch Stillstand anderweitiger Vermittlungsbemühungen) und deckt den Mehraufwand ab, der durch die Neuaufnahme der Vermittlungsbemühungen entsteht.",
  },
  {
    kennung: "rueckzahlung",
    nurMitGebuehr: true,
    /*
     * Der zweite Satz ist neu, freigegeben von Christian am 22.09.2026. Seit
     * demselben Tag ist die IBAN freiwillig; der Vertrag regelt den Fall der
     * fehlenden Bankverbindung deshalb selbst, statt sich auf ein Pflichtfeld
     * zu verlassen, das es nicht mehr gibt.
     */
    text: "Kommt der Kaufvertrag zustande, wird die Reservierungsgebühr am Tag der notariellen Beurkundung vollständig zurücküberwiesen, und zwar auf das in Abschnitt {{abschnitt:kaeufer}} angegebene Konto des Kaufinteressenten. Ist dort kein Konto angegeben, teilt der Kaufinteressent MOREImmo die Bankverbindung vor der Beurkundung mit; die Rückzahlung erfolgt dann unverzüglich nach Eingang dieser Mitteilung.",
  },
  {
    kennung: "verfall",
    nurMitGebuehr: true,
    // Finanzierungsabsage mit Nachweis, Entscheidung Christians vom 15.09.2026.
    text: "Die Reservierungsgebühr wird nicht erstattet, wenn der Kaufvertrag aus Gründen, die der Kaufinteressent allein oder überwiegend zu vertreten hat, nicht zustande kommt. Lehnt das finanzierende Kreditinstitut die Finanzierung ab, wird die Gebühr gegen Vorlage der schriftlichen Absage vollständig zurückgezahlt, sofern der Kaufinteressent die für die Finanzierungsprüfung erforderlichen Unterlagen vollständig und wahrheitsgemäß vorgelegt hat.",
    /*
     * Tabelle A, dritter Satz neu, nur beim Globalobjekt. Heute ergibt sich
     * die Rückzahlung nur im Umkehrschluss; bei einem höheren Betrag muss sie
     * dastehen. Für Einzelwohnungen entscheidet Christian getrennt
     * (Frage 7 an den Anwalt).
     */
    textGesamtobjekt: "Die Reservierungsgebühr wird nicht erstattet, wenn der Kaufvertrag aus Gründen, die der Kaufinteressent allein oder überwiegend zu vertreten hat, nicht zustande kommt. Lehnt das finanzierende Kreditinstitut die Finanzierung ab, wird die Gebühr gegen Vorlage der schriftlichen Absage vollständig zurückgezahlt, sofern der Kaufinteressent die für die Finanzierungsprüfung erforderlichen Unterlagen vollständig und wahrheitsgemäß vorgelegt hat. Kommt der Kaufvertrag aus anderen Gründen nicht zustande, insbesondere weil der Verkäufer das Objekt nicht an den Kaufinteressenten verkauft, wird die Reservierungsgebühr unverzüglich, spätestens binnen vierzehn Tagen, vollständig zurückgezahlt.",
  },
  {
    kennung: "wirksamkeit",
    text: "Die Reservierungsvereinbarung wird mit Unterzeichnung durch den Kaufinteressenten rechtswirksam; eine Gegenzeichnung durch MOREImmo ist nicht erforderlich. Die Unterzeichnung erfolgt elektronisch.",
    // Tabelle B: Es wird elektronisch unterschrieben, niemand prüft die
    // Vertretungsbefugnis (Frage 8 an den Anwalt).
    textGesellschaft: "Die Reservierungsvereinbarung wird mit Unterzeichnung durch den Kaufinteressenten rechtswirksam; eine Gegenzeichnung durch MOREImmo ist nicht erforderlich. Die Unterzeichnung erfolgt elektronisch. Wer diese Vereinbarung für eine Gesellschaft unterzeichnet, versichert, zu ihrer Vertretung berechtigt zu sein, und weist dies auf Verlangen durch einen aktuellen Registerauszug oder eine Vollmacht nach.",
  },
  {
    kennung: "dolmetscher",
    text: "Sofern ein Dolmetscher benötigt wird, ist ein öffentlich bestellter und vereidigter Dolmetscher hinzuzuziehen.",
  },
];

/* ─── Der Aufbau des Dokuments ─── */

/** Was den Aufbau des Dokuments bestimmt. */
export interface VertragsOptionen {
  /**
   * Zahlt der Kunde ausnahmsweise keine Reservierungsgebühr?
   *
   * Ausdrücklich `true` und nichts anderes. Ein fehlendes Feld, wie es jede
   * Reservierung von vor dem 22.09.2026 hat, bedeutet „zahlt eine Gebühr".
   */
  gebuehrEntfaellt?: boolean;
  /**
   * Reservierung eines Globalobjekts, also des ganzen Hauses (seit dem
   * 23.09.2026). Nur ein ausdrückliches `true` zählt; jede ältere
   * Reservierung ist die einer Einzelwohnung und bleibt es.
   */
  gesamtobjekt?: boolean;
  /**
   * Die Käuferin ist eine Gesellschaft (Tabelle B des Entwurfs). Gilt nur
   * beim Globalobjekt; bei einer Einzelwohnung gibt es diese Wahl nicht, das
   * Feld wird dort nicht beachtet.
   */
  gesellschaft?: boolean;
}

/** Zahlt dieser Kunde keine Gebühr? Nur ein ausdrückliches Ja zählt. */
export function ohneGebuehr(opt: VertragsOptionen | null | undefined): boolean {
  return opt?.gebuehrEntfaellt === true;
}

/**
 * Die Optionen aus einem Datensatz der Reservierung (`rvData`).
 *
 * An einer Stelle, damit Formular, PDF, Signaturseite und Edge Function
 * denselben Fall erkennen. Die Gesellschaft zählt nur beim Globalobjekt.
 */
export function vertragsOptionenAus(
  d: { gebuehrEntfaellt?: boolean; gesamtobjekt?: boolean; kaeuferArt?: string } | null | undefined,
): VertragsOptionen {
  const gesamtobjekt = d?.gesamtobjekt === true;
  return {
    gebuehrEntfaellt: d?.gebuehrEntfaellt,
    gesamtobjekt,
    gesellschaft: gesamtobjekt && d?.kaeuferArt === "gesellschaft",
  };
}

/** Ein Abschnitt, wie er im Dokument steht. */
export interface Abschnitt {
  kennung: AbschnittKennung;
  /** Die Nummer ohne Punkt, etwa „4". */
  nummer: string;
  titel: string;
  /** „4. Reservierungsgebühr und Kontoverbindung", die Überschrift im Dokument. */
  ueberschrift: string;
}

/** Das fertig zusammengesetzte Dokument, mit aufgelösten Nummern und Verweisen. */
export interface VertragsAufbau {
  /** Gibt es in diesem Fall eine Reservierungsgebühr? */
  mitGebuehr: boolean;
  /** Steht die Widerrufsthematik in diesem Fall im Dokument? */
  mitWiderruf: boolean;
  /** Reservierung eines Globalobjekts, also des ganzen Hauses? */
  gesamtobjekt: boolean;
  /** Ist die Käuferin eine Gesellschaft (nur beim Globalobjekt)? */
  gesellschaft: boolean;
  /**
   * Die Fassung des Vertragstextes für diesen Fall. Immer die deutsche,
   * maßgebliche, auch im englischen Aufbau: Sie wird mit `rvData` gespeichert.
   */
  textFassung: string;
  /** Die Sprache dieses Aufbaus. Englisch ist nur die Übersetzung. */
  sprache: VertragsSprache;
  /** Die Abschnitte in der Reihenfolge des Dokuments, schon durchnummeriert. */
  abschnitte: Abschnitt[];
  /** Die Punkte der Reservierungsvereinbarung, schon durchnummeriert. */
  ziffern: VereinbarungZiffer[];
  /**
   * Punkte, deren Wortlaut für diesen Fall noch nicht entschieden ist und die
   * deshalb fehlen. Leer heißt: das Dokument ist vollständig.
   */
  offeneZiffern: ZifferKennung[];
  /**
   * Die beiden Wahlmöglichkeiten zum Beginn, mit den Nummern dieses Falls.
   * Leer, wenn es keine Widerrufsbelehrung gibt.
   */
  widerrufWahlen: WiderrufWahl[];
  /** Die auflösende Bedingung beim Abwarten, mit der Nummer dieses Falls. Leer ohne Widerruf. */
  aufloesendeBedingung: string;
  /** Den Abschnitt zu einer Kennung, oder `undefined`, wenn er hier fehlt. */
  abschnitt: (kennung: AbschnittKennung) => Abschnitt | undefined;
  /** Die Überschrift eines Abschnitts. Leer, wenn er in diesem Fall fehlt. */
  ueberschrift: (kennung: AbschnittKennung) => string;
  /** Verweise in einem freien Text auflösen, etwa in den Widerrufstexten. */
  verweise: (text: string) => string;
}

/** Ein Verweis im Text: `{{abschnitt:widerruf}}` oder `{{punkt:pflichten}}`. */
const VERWEIS_MUSTER = /\{\{(abschnitt|punkt):([a-zA-Z]+)\}\}/g;

/** Welcher Fall gerade gebaut wird. */
interface Fall {
  mitGebuehr: boolean;
  gesamtobjekt: boolean;
  gesellschaft: boolean;
}

/**
 * Der Wortlaut eines Punktes für diesen Fall.
 *
 * Die Reihenfolge ist Absicht: Erst die Fassung für das Globalobjekt, dann die
 * für die Gesellschaft, zuletzt der Fall ohne Gebühr. Der Fall ohne Gebühr
 * gewinnt, weil er am meisten wegnimmt; sein Wortlaut ist in allen Fassungen
 * derselbe (Entwurf vom 23.09.2026: „der ganze Fall ‚keine Gebühr'“ bleibt).
 */
function zifferTextFuer(z: ZifferVorlage, fall: Fall): string | null {
  let text: string | null = z.text;
  if (fall.gesamtobjekt && z.textGesamtobjekt !== undefined) text = z.textGesamtobjekt;
  if (fall.gesellschaft && z.textGesellschaft !== undefined) text = z.textGesellschaft;
  if (!fall.mitGebuehr && z.textOhneGebuehr !== undefined) text = z.textOhneGebuehr;
  return text;
}

/**
 * Derselbe Punkt mit den englischen Texten.
 *
 * Bewusst ausschließlich die englischen Felder, ohne die deutschen darunter:
 * Fehlte eine englische Fassung, stünde sonst still ein deutscher Satz im
 * englischen Text. So fällt der Punkt höchstens auf den englischen Grundtext
 * zurück, und `reservierungErklaerungEn.test.ts` meldet die Lücke.
 */
function zifferVorlageEn(z: ZifferVorlage): ZifferVorlage {
  const en = ZIFFERN_EN[z.kennung];
  return {
    kennung: z.kennung,
    nurMitGebuehr: z.nurMitGebuehr,
    nurGesamtobjekt: z.nurGesamtobjekt,
    text: en.text,
    textOhneGebuehr: en.textOhneGebuehr,
    punkte: en.punkte,
    textGesamtobjekt: en.textGesamtobjekt,
    punkteGesamtobjekt: en.punkteGesamtobjekt,
    textGesellschaft: en.textGesellschaft,
  };
}

/*
 * Die Vorlagen der Widerrufstexte. Sie stehen hier oben, weil `vertragsAufbau`
 * sie je Fall auflöst und schon beim Laden dieser Datei einmal läuft (siehe
 * `MIT_GEBUEHR`). Die ausgegebenen Konstanten weiter unten sind unverändert
 * dieselben Sätze.
 */
const WAHL_SOFORT_SATZ =
  "Ich verlange ausdrücklich, dass MOREImmo mit der Reservierung und den Leistungen nach Punkt {{punkt:pflichten}} sofort, also vor Ablauf der Widerrufsfrist, beginnt.";
const WAHL_SOFORT_ERLAEUTERUNG =
  "Mir ist bekannt, dass ich bei einem Widerruf für die bis dahin erbrachten Leistungen einen anteiligen Betrag zu zahlen habe und dass mein Widerrufsrecht erlischt, wenn die Reservierung vollständig erbracht ist, bevor ich widerrufe (§ 356 Abs. 4 BGB).";
const WAHL_ABWARTEN_SATZ =
  "Ich wünsche, dass MOREImmo mit der Reservierung erst nach Ablauf der Widerrufsfrist beginnt.";
const WAHL_ABWARTEN_ERLAEUTERUNG =
  "Mir ist bekannt, dass die Wohnung bis zum Ablauf der Widerrufsfrist nicht für mich reserviert ist und in dieser Zeit anderen Kaufinteressenten angeboten und von diesen reserviert werden kann. Kommt eine anderweitige Reservierung zustande, entfällt diese Vereinbarung, und eine bereits gezahlte Reservierungsgebühr wird vollständig zurückgezahlt.";
/*
 * Tabelle A: beim Globalobjekt „das Objekt“ statt „die Wohnung“. Die einzige
 * Stelle im Vertragstext, die „Wohnung“ sagt. Die Fassung für Einzelwohnungen
 * bleibt unverändert.
 */
const WAHL_ABWARTEN_ERLAEUTERUNG_GESAMTOBJEKT =
  "Mir ist bekannt, dass das Objekt bis zum Ablauf der Widerrufsfrist nicht für mich reserviert ist und in dieser Zeit anderen Kaufinteressenten angeboten und von diesen reserviert werden kann. Kommt eine anderweitige Reservierung zustande, entfällt diese Vereinbarung, und eine bereits gezahlte Reservierungsgebühr wird vollständig zurückgezahlt.";
const AUFLOESENDE_BEDINGUNG_VORLAGE =
  "Wählt der Kaufinteressent das Abwarten, ist das Objekt bis zum Ablauf der Widerrufsfrist nicht für ihn reserviert; MOREImmo bietet es in dieser Zeit weiterhin auch anderen Kaufinteressenten an. Schließt MOREImmo in dieser Zeit mit einem anderen Kaufinteressenten eine Reservierungsvereinbarung ab oder kommt ein Kaufvertrag über das Objekt zustande, endet diese Vereinbarung ohne weitere Erklärung (auflösende Bedingung). Eine bereits gezahlte Reservierungsgebühr wird in diesem Fall unverzüglich, spätestens binnen vierzehn Tagen, vollständig zurückgezahlt. Die Widerrufsfrist beginnt mit dem Tag des Vertragsabschlusses, bei mehreren Kaufinteressenten mit dem Tag der letzten Unterschrift (Punkt {{punkt:wirksamkeit}}).";

/**
 * Das Dokument für einen Fall zusammensetzen.
 *
 * Nummern entstehen hier aus der Position, Verweise werden hier aufgelöst.
 * Zeigt ein Verweis auf etwas, das in diesem Fall gar nicht im Dokument steht,
 * bricht die Funktion ab. Das ist Absicht: Ein Vertrag, der auf einen nicht
 * vorhandenen Abschnitt verweist, ist schlimmer als ein Fehler beim Bauen,
 * und die möglichen Fälle sind durch Tests abgedeckt.
 *
 * Seit dem 23.09.2026 gibt es dazu die Fassung für ein Globalobjekt, mit
 * Privatpersonen oder einer Gesellschaft als Käuferin. Eine Gesellschaft ist
 * kein Verbraucher: Die Widerrufsthematik entfällt dann ganz (Tabelle B,
 * vorbehaltlich Frage 2 an den Anwalt).
 *
 * Seit dem 25.09.2026 auch auf Englisch (`sprache = "en"`). Welche Abschnitte
 * und Punkte im Dokument stehen und welche Nummer sie tragen, entscheidet
 * dabei immer der deutsche Text; das Englische übernimmt nur den Wortlaut.
 * So tragen beide Fassungen eines zweisprachigen Dokuments dieselben Nummern.
 */
export function vertragsAufbau(opt: VertragsOptionen = {}, sprache: VertragsSprache = "de"): VertragsAufbau {
  const mitGebuehr = !ohneGebuehr(opt);
  const gesamtobjekt = opt.gesamtobjekt === true;
  const gesellschaft = gesamtobjekt && opt.gesellschaft === true;
  const mitWiderruf = (mitGebuehr || !WIDERRUF_ENTFAELLT_OHNE_GEBUEHR) && !gesellschaft;
  const fall: Fall = { mitGebuehr, gesamtobjekt, gesellschaft };
  const englisch = sprache === "en";

  const abschnitte: Abschnitt[] = ABSCHNITTE_VORLAGE
    .filter((a) => (mitGebuehr || !a.nurMitGebuehr) && (mitWiderruf || !a.nurMitWiderruf))
    .map((a, i) => {
      const titel = englisch ? ABSCHNITT_TITEL_EN[a.kennung] : a.titel;
      return {
        kennung: a.kennung,
        nummer: String(i + 1),
        titel,
        ueberschrift: `${i + 1}. ${titel}`,
      };
    });

  /**
   * Die Punkte, die in diesem Fall überhaupt im Dokument stehen. Ob einer
   * fehlt, sagt der deutsche Text; der Wortlaut kommt aus der Sprache.
   */
  const vorlagen = ZIFFERN_VORLAGE
    .filter((z) => (mitGebuehr || !z.nurMitGebuehr) && (gesamtobjekt || !z.nurGesamtobjekt))
    .map((z) => {
      const deutsch = zifferTextFuer(z, fall);
      if (!englisch || deutsch === null) return { vorlage: z, text: deutsch };
      const vorlageEn = zifferVorlageEn(z);
      return { vorlage: vorlageEn, text: zifferTextFuer(vorlageEn, fall) ?? vorlageEn.text };
    });

  const offeneZiffern = vorlagen.filter((v) => v.text === null).map((v) => v.vorlage.kennung);
  const vorhandene = vorlagen.filter((v) => v.text !== null);

  const abschnittNummer = new Map(abschnitte.map((a) => [a.kennung, a.nummer]));
  const zifferNummer = new Map(vorhandene.map((v, i) => [v.vorlage.kennung, String(i + 1)]));

  const verweise = (text: string): string =>
    text.replace(VERWEIS_MUSTER, (_treffer, art: string, kennung: string) => {
      const nummer = art === "abschnitt"
        ? abschnittNummer.get(kennung as AbschnittKennung)
        : zifferNummer.get(kennung as ZifferKennung);
      if (!nummer) {
        throw new Error(
          `Reservierungsvereinbarung: Der Verweis auf ${art} „${kennung}" zeigt ins Leere. `
          + "Der Text nennt eine Stelle, die in dieser Fassung des Dokuments nicht vorkommt.",
        );
      }
      return nummer;
    });

  const ziffern: VereinbarungZiffer[] = vorhandene.map((v) => {
    const punkte = gesamtobjekt && v.vorlage.punkteGesamtobjekt ? v.vorlage.punkteGesamtobjekt : v.vorlage.punkte;
    return {
      kennung: v.vorlage.kennung,
      nummer: `${zifferNummer.get(v.vorlage.kennung)}.`,
      text: verweise(v.text as string),
      ...(punkte ? { punkte } : {}),
    };
  });

  const widerrufWahlen: WiderrufWahl[] = !mitWiderruf
    ? []
    : englisch
    ? [
      { wert: "sofort", satz: verweise(WAHL_SOFORT_SATZ_EN), erlaeuterung: WAHL_SOFORT_ERLAEUTERUNG_EN },
      {
        wert: "abwarten",
        satz: WAHL_ABWARTEN_SATZ_EN,
        erlaeuterung: gesamtobjekt ? WAHL_ABWARTEN_ERLAEUTERUNG_GESAMTOBJEKT_EN : WAHL_ABWARTEN_ERLAEUTERUNG_EN,
      },
    ]
    : [
      { wert: "sofort", satz: verweise(WAHL_SOFORT_SATZ), erlaeuterung: WAHL_SOFORT_ERLAEUTERUNG },
      {
        wert: "abwarten",
        satz: WAHL_ABWARTEN_SATZ,
        erlaeuterung: gesamtobjekt ? WAHL_ABWARTEN_ERLAEUTERUNG_GESAMTOBJEKT : WAHL_ABWARTEN_ERLAEUTERUNG,
      },
    ];

  const abschnitt = (kennung: AbschnittKennung) => abschnitte.find((a) => a.kennung === kennung);

  return {
    mitGebuehr,
    mitWiderruf,
    gesamtobjekt,
    gesellschaft,
    textFassung: textFassung({ gesamtobjekt }),
    sprache: englisch ? "en" : "de",
    abschnitte,
    ziffern,
    offeneZiffern,
    widerrufWahlen,
    aufloesendeBedingung: mitWiderruf ? verweise(englisch ? AUFLOESENDE_BEDINGUNG_EN : AUFLOESENDE_BEDINGUNG_VORLAGE) : "",
    abschnitt,
    ueberschrift: (kennung) => abschnitt(kennung)?.ueberschrift || "",
    verweise,
  };
}

/**
 * Der Regelfall mit Reservierungsgebühr.
 *
 * Er ist zugleich der Stand, den jede Reservierung von vor dem 22.09.2026
 * hat, und die Grundlage der unveränderten Ausgaben weiter unten.
 */
const MIT_GEBUEHR = vertragsAufbau({ gebuehrEntfaellt: false });

/**
 * Die neun Punkte im Regelfall, durchnummeriert und mit aufgelösten Verweisen.
 *
 * Bleibt als Ausgabe erhalten, damit Aufrufer, die nur den Regelfall brauchen,
 * unverändert weiterlaufen. Wer den Fall ohne Gebühr abbilden muss, nimmt
 * `vertragsAufbau`.
 */
export const VEREINBARUNG_ZIFFERN: VereinbarungZiffer[] = MIT_GEBUEHR.ziffern;

/**
 * Die Rückzahlungsregel, das sind die Punkte zur Rückzahlung und zum Verfall.
 *
 * Sie gehört zu jeder Nennung des Betrags, siehe `reservierungsgebuehr.ts`:
 * Genau daran ist die Klausel im BGH-Urteil vom 20.04.2023 gescheitert. Es
 * gibt sie nur im Fall mit Gebühr, denn ohne Gebühr gibt es nichts
 * zurückzuzahlen.
 */
export const GEBUEHR_RUECKZAHLUNG: string[] = MIT_GEBUEHR.ziffern
  .filter((z) => z.kennung === "rueckzahlung" || z.kennung === "verfall")
  .map((z) => `${z.nummer} ${z.text}`);

/* ─── 6. Datenschutzerklärung ─── */

/**
 * Das Einverständnis zur Datenverarbeitung, ein Absatz ohne Ankreuzfeld.
 *
 * Es gilt mit der Unterschrift. Bis zum 15.09.2026 standen hier zwei Haken,
 * eine Kenntnisnahme und eine gesonderte Einwilligung für die Bank; Christian
 * hat beide durch diesen einen Absatz nach dem Branchenmuster ersetzt.
 */
export const DATENSCHUTZ_EINVERSTAENDNIS =
  "Ich/Wir bin/sind damit einverstanden, dass meine/unsere Daten elektronisch verarbeitet, gespeichert, genutzt und im Zusammenhang mit der Geschäftsabwicklung an berechtigte Dritte (zum Beispiel Verkäufer, Notariat, finanzierendes Kreditinstitut, betreuender Vertriebspartner, Hausverwaltung) weitergegeben beziehungsweise übermittelt und dort ebenfalls zu diesen Zwecken verarbeitet, gespeichert und genutzt werden. Ich/Wir bin/sind zudem darauf hingewiesen worden, dass die Erhebung, Verarbeitung und Nutzung meiner/unserer Daten auf freiwilliger Basis erfolgt. Die Datenschutzerklärung von MOREImmo ist unter portal.more.immo/datenschutz abrufbar.";

/* ─── 7. Widerrufsbelehrung ─── */

/**
 * Der Unternehmer in der Belehrung, mit Telefon nur, wenn es eine gibt.
 *
 * Die Telefonnummer ist seit dem 28.05.2022 Pflichtbestandteil der Belehrung.
 * Sie kommt aus `impressumKontakt.ts`; wäre sie dort leer, fehlte die Zeile,
 * und die Belehrung wäre in diesem Punkt unvollständig. Erfunden wird nichts.
 */
const BELEHRUNG_UNTERNEHMER =
  `${UNTERNEHMER}${IMPRESSUM_TELEFON ? `, Telefon ${IMPRESSUM_TELEFON}` : ""}, E-Mail ${UNTERNEHMER_EMAIL}`;

/** Ein Block der Belehrung: Überschrift und Absätze. */
export interface BelehrungBlock {
  ueberschrift: string;
  absaetze: string[];
}

/**
 * Wortlaut der gesetzlichen Musterbelehrung (Anlage 1 zu Art. 246a § 1 Abs. 2
 * Satz 2 EGBGB) mit den Gestaltungshinweisen für Dienstleistungen.
 *
 * **Bitte nicht umformulieren**, die Schutzwirkung hängt am Wortlaut. Die
 * Lieferkosten-Passage steht im Muster fest und darf trotz Dienstleistung
 * stehen bleiben. Die Belehrung bleibt in der Sie-Form, das ist gesetzlicher
 * Wortlaut.
 */
export const WIDERRUFSBELEHRUNG: BelehrungBlock[] = [
  {
    ueberschrift: "Widerrufsrecht",
    absaetze: [
      "Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen.",
      "Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsabschlusses.",
      // Ohne den Satz zum Muster-Widerrufsformular: Die Anlage ist am
      // 15.09.2026 entfallen, und ein Verweis auf ein Formular, das nicht
      // beiliegt, wäre irreführend.
      `Um Ihr Widerrufsrecht auszuüben, müssen Sie uns (${BELEHRUNG_UNTERNEHMER}) mittels einer eindeutigen Erklärung (z. B. ein mit der Post versandter Brief oder E-Mail) über Ihren Entschluss, diesen Vertrag zu widerrufen, informieren.`,
      "Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.",
    ],
  },
  {
    ueberschrift: "Folgen des Widerrufs",
    absaetze: [
      "Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben, einschließlich der Lieferkosten (mit Ausnahme der zusätzlichen Kosten, die sich daraus ergeben, dass Sie eine andere Art der Lieferung als die von uns angebotene, günstigste Standardlieferung gewählt haben), unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über Ihren Widerruf dieses Vertrags bei uns eingegangen ist. Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der ursprünglichen Transaktion eingesetzt haben, es sei denn, mit Ihnen wurde ausdrücklich etwas anderes vereinbart; in keinem Fall werden Ihnen wegen dieser Rückzahlung Entgelte berechnet.",
      "Haben Sie verlangt, dass die Dienstleistungen während der Widerrufsfrist beginnen sollen, so haben Sie uns einen angemessenen Betrag zu zahlen, der dem Anteil der bis zu dem Zeitpunkt, zu dem Sie uns von der Ausübung des Widerrufsrechts hinsichtlich dieses Vertrags unterrichten, bereits erbrachten Dienstleistungen im Vergleich zum Gesamtumfang der im Vertrag vorgesehenen Dienstleistungen entspricht.",
    ],
  },
];

/** Überschrift und Einleitung der Wahl, außerhalb des Belehrungskastens. */
export const WIDERRUF_WAHL_TITEL = "Beginn der Reservierung";
export const WIDERRUF_WAHL_EINLEITUNG =
  "Der Kaufinteressent kann wählen, ob die Reservierung sofort oder erst nach Ablauf der Widerrufsfrist beginnt. Genau ein Feld ist anzukreuzen.";

/** Eine der beiden Wahlmöglichkeiten: der fette Satz und seine Erläuterung. */
export interface WiderrufWahl {
  wert: "sofort" | "abwarten";
  satz: string;
  erlaeuterung: string;
}

/*
 * Die Widerrufstexte der Einzelwohnung im Regelfall mit Gebühr.
 *
 * Sie stehen nur im Dokument, wenn es auch eine Gebühr gibt, und ihre
 * Verweise sind deshalb fest gegen den Regelfall aufgelöst. Beim Globalobjekt
 * stehen mehr Punkte davor und die Nummern verschieben sich; Formular und PDF
 * lesen die Texte deshalb aus `vertragsAufbau(...).widerrufWahlen` und
 * `.aufloesendeBedingung`. Für die Einzelwohnung ergibt das Wort für Wort
 * dieselben Sätze wie hier.
 */
export const WIDERRUF_WAHL_SOFORT: WiderrufWahl = {
  wert: "sofort",
  satz: MIT_GEBUEHR.verweise(WAHL_SOFORT_SATZ),
  erlaeuterung: WAHL_SOFORT_ERLAEUTERUNG,
};

/**
 * Die zweite Wahl, im Wortlaut von Christians Entscheidung vom 15.09.2026:
 * Bis zum Fristablauf ist die Wohnung ausdrücklich nicht reserviert. Das
 * System setzt sie in diesem Fall erst nach vierzehn Tagen auf „reserviert",
 * siehe `finalize-reservierung` und `send-reservierung-eskalation`.
 */
export const WIDERRUF_WAHL_ABWARTEN: WiderrufWahl = {
  wert: "abwarten",
  satz: WAHL_ABWARTEN_SATZ,
  erlaeuterung: WAHL_ABWARTEN_ERLAEUTERUNG,
};

/** Beide Wahlmöglichkeiten in der Reihenfolge des Dokuments. */
export const WIDERRUF_WAHLEN: WiderrufWahl[] = [WIDERRUF_WAHL_SOFORT, WIDERRUF_WAHL_ABWARTEN];

/**
 * Was beim Abwarten gilt: MOREImmo bleibt bis zum Fristablauf frei, und die
 * Frist läuft ab der letzten Unterschrift, denn erst damit ist der Vertrag
 * geschlossen (Punkt 8).
 */
export const WIDERRUF_AUFLOESENDE_BEDINGUNG = MIT_GEBUEHR.verweise(AUFLOESENDE_BEDINGUNG_VORLAGE);

/* ─── 8. Unterschriften ─── */

/**
 * Der Satz über den Unterschriften. Seit dem 15.09.2026 ohne das
 * Muster-Widerrufsformular, denn das liegt nicht mehr bei.
 */
export const UNTERSCHRIFT_BESTAETIGUNG =
  "Ich/Wir bestätige/n, diese Vereinbarung einschließlich der Widerrufsbelehrung vor der Unterzeichnung vollständig gelesen zu haben und eine Kopie auf einem dauerhaften Datenträger zu erhalten.";

/**
 * Derselbe Satz ohne die Widerrufsbelehrung, für eine Reservierung ohne
 * Gebühr. Die Belehrung liegt dann nicht bei, und ein Kunde soll nichts
 * bestätigen, was er gar nicht bekommen hat.
 */
export const UNTERSCHRIFT_BESTAETIGUNG_OHNE_WIDERRUF =
  "Ich/Wir bestätige/n, diese Vereinbarung vor der Unterzeichnung vollständig gelesen zu haben und eine Kopie auf einem dauerhaften Datenträger zu erhalten.";

/** Der Bestätigungssatz, der zu diesem Fall gehört. */
export function unterschriftBestaetigung(opt: VertragsOptionen = {}, sprache: VertragsSprache = "de"): string {
  const mitWiderruf = vertragsAufbau(opt).mitWiderruf;
  if (sprache === "en") {
    return mitWiderruf ? UNTERSCHRIFT_BESTAETIGUNG_EN : UNTERSCHRIFT_BESTAETIGUNG_OHNE_WIDERRUF_EN;
  }
  return mitWiderruf
    ? UNTERSCHRIFT_BESTAETIGUNG
    : UNTERSCHRIFT_BESTAETIGUNG_OHNE_WIDERRUF;
}

/**
 * Die festen Texte der Vereinbarung in einer Sprache, für Schirm und PDF.
 *
 * Die deutschen Einträge sind genau die Konstanten dieser Datei, damit ein
 * zweisprachiges Dokument nie einen anderen deutschen Wortlaut zeigt als ein
 * rein deutsches.
 */
export interface ReservierungTexte {
  notarHinweis: string;
  gebuehrEinleitung: string;
  vereinbarungEinleitung: string;
  datenschutz: string;
  widerrufsbelehrung: BelehrungBlock[];
  widerrufWahlTitel: string;
  widerrufWahlEinleitung: string;
  kaufgegenstandGesamtobjekt: string;
}

export function reservierungTexte(sprache: VertragsSprache): ReservierungTexte {
  if (sprache === "en") {
    return {
      notarHinweis: NOTAR_HINWEIS_EN,
      gebuehrEinleitung: GEBUEHR_EINLEITUNG_EN,
      vereinbarungEinleitung: VEREINBARUNG_EINLEITUNG_EN,
      datenschutz: DATENSCHUTZ_EINVERSTAENDNIS_EN,
      widerrufsbelehrung: WIDERRUFSBELEHRUNG_EN,
      widerrufWahlTitel: WIDERRUF_WAHL_TITEL_EN,
      widerrufWahlEinleitung: WIDERRUF_WAHL_EINLEITUNG_EN,
      kaufgegenstandGesamtobjekt: KAUFGEGENSTAND_GESAMTOBJEKT_EN,
    };
  }
  return {
    notarHinweis: NOTAR_HINWEIS,
    gebuehrEinleitung: GEBUEHR_EINLEITUNG,
    vereinbarungEinleitung: VEREINBARUNG_EINLEITUNG,
    datenschutz: DATENSCHUTZ_EINVERSTAENDNIS,
    widerrufsbelehrung: WIDERRUFSBELEHRUNG,
    widerrufWahlTitel: WIDERRUF_WAHL_TITEL,
    widerrufWahlEinleitung: WIDERRUF_WAHL_EINLEITUNG,
    kaufgegenstandGesamtobjekt: KAUFGEGENSTAND_GESAMTOBJEKT,
  };
}

/* ─── Gebührenabschnitt ─── */

/** Eine Zeile des Gebührenabschnitts: Beschriftung und Wert. */
export interface GebuehrZeile {
  label: string;
  wert: string;
  /**
   * Fett setzen, auf dem Schirm wie im PDF.
   *
   * Trägt genau eine Zeile: der Betrag, der für diesen Kaufpreis gilt. Er ist
   * die eine Zahl, die der Käufer aus dem Abschnitt mitnimmt, und stand
   * vorher in derselben Stärke wie Kontoinhaber und IBAN. Die Markierung
   * steht hier und nicht in den beiden Ansichten, damit sie nicht
   * auseinanderlaufen.
   */
  betont?: boolean;
}

/**
 * Der Gebührenabschnitt zu einem Kaufpreis.
 *
 * Die Staffel steht immer da, so wie im Papierformular: Sie ist der
 * Vertragstext und gilt unabhängig davon, was in diesem Fall zutrifft.
 * Zusätzlich wird der Betrag dieses Falls ausgewiesen, sobald der Kaufpreis
 * feststeht. Steht er nicht fest, bleibt die Zeile weg, statt einen Betrag zu
 * behaupten, der auf einer Annahme beruht.
 *
 * Der Verwendungszweck wird seit dem 15.09.2026 aus Objektstraße,
 * Wohneinheit und dem Nachnamen des ersten Käufers gebildet, siehe
 * `verwendungszweck`.
 *
 * Beim Globalobjekt (`fall.gesamtobjekt`, seit dem 23.09.2026) entfällt die
 * Staffel vollständig. An ihre Stelle tritt eine einzige Zeile mit dem festen
 * Betrag (`GEBUEHR_GESAMTOBJEKT`), unabhängig vom Kaufpreis. Der vierte
 * Parameter ist dann der Nachname oder die Firma, der dritte wird nicht
 * gebraucht.
 */
export function gebuehrAbschnitt(
  kaufpreisText: string | null | undefined,
  objStrasse: string,
  weNr: string,
  nachname1: string,
  fall: { gesamtobjekt?: boolean } = {},
): {
  betrag: string | null;
  einleitung: string;
  zeilen: GebuehrZeile[];
  staffel: { bereich: string; betrag: string }[];
  rueckzahlung: string[];
} {
  const gesamtobjekt = fall.gesamtobjekt === true;
  const betragZahl = gesamtobjekt ? GEBUEHR_GESAMTOBJEKT : gebuehrAusText(kaufpreisText);
  const betrag = betragZahl === null ? null : euroText(betragZahl);
  const zweck = gesamtobjekt
    ? verwendungszweckGesamtobjekt(objStrasse, nachname1)
    : verwendungszweck(objStrasse, weNr, nachname1);

  const zeilen: GebuehrZeile[] = [];
  /*
   * Das Etikett sagt ausdrücklich „für diesen Kaufpreis". Direkt unter der
   * Staffel stünde sonst zweimal „Reservierungsgebühr" mit verschiedenen
   * Beträgen, und es wäre nicht zu erkennen, welcher nun gilt. Beim
   * Globalobjekt gibt es keine Staffel, die eine Zeile ist dort die Regel
   * selbst.
   */
  if (gesamtobjekt && betrag) zeilen.push({ label: GEBUEHR_GESAMTOBJEKT_LABEL, wert: betrag, betont: true });
  else if (betrag) zeilen.push({ label: "Für diesen Kaufpreis", wert: betrag, betont: true });
  zeilen.push({ label: "Kontoinhaber", wert: GEBUEHR_KONTOINHABER });
  zeilen.push({ label: "IBAN", wert: GEBUEHR_IBAN });
  // BIC und Bank erst, wenn sie eingetragen sind. Eine Zeile „BIC: –" sähe
  // aus wie ein Fehler im Dokument.
  if (GEBUEHR_BIC) zeilen.push({ label: "BIC", wert: GEBUEHR_BIC });
  if (GEBUEHR_BANK) zeilen.push({ label: "Bank", wert: GEBUEHR_BANK });
  if (zweck) zeilen.push({ label: "Verwendungszweck", wert: zweck });

  return {
    betrag,
    einleitung: GEBUEHR_EINLEITUNG,
    zeilen,
    staffel: gesamtobjekt ? [] : staffelZeilen(),
    rueckzahlung: gesamtobjekt ? GEBUEHR_RUECKZAHLUNG_GESAMTOBJEKT : GEBUEHR_RUECKZAHLUNG,
  };
}

/**
 * Die Rückzahlungsregel beim Globalobjekt: dieselben zwei Punkte, der zum
 * Verfall mit dem dritten Satz aus Tabelle A, und mit den Nummern dieser
 * Fassung.
 */
const GEBUEHR_RUECKZAHLUNG_GESAMTOBJEKT: string[] = vertragsAufbau({ gesamtobjekt: true }).ziffern
  .filter((z) => z.kennung === "rueckzahlung" || z.kennung === "verfall")
  .map((z) => `${z.nummer} ${z.text}`);

/* ─── Zeilen der Abschnitte 1 und 2 beim Globalobjekt ─── */

/** Eine Zeile mit Beschriftung und Wert, für Schirm und PDF. */
export interface DokumentZeile {
  label: string;
  wert: string;
}

/** Was die Zeilenbausteine unten aus dem Formular lesen. `ReservierungData` erfüllt es. */
export interface GesamtobjektAngaben {
  anzahlEinheiten?: string;
  aufteilung?: AufteilungWert | "";
  grundbuchAmtsgericht?: string;
  grundbuchGemarkung?: string;
  grundbuchFlurstueck?: string;
  stellplaetzeGaragen?: string;
}

const leer = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * „Amtsgericht München, Gemarkung Bogenhausen, Flurstück(e) 123/4“.
 *
 * Wer „Amtsgericht München“ oder „AG München“ ins Feld tippt, bekommt das
 * Wort nicht doppelt. Fehlende Teile fallen weg; steht gar nichts da, ist die
 * Zeile leer und erscheint nicht (Tabelle A: „nur wenn eingetragen“).
 */
export function grundbuchZeile(a: Pick<GesamtobjektAngaben, "grundbuchAmtsgericht" | "grundbuchGemarkung" | "grundbuchFlurstueck">): string {
  const gericht = leer(a.grundbuchAmtsgericht).replace(/^(amtsgericht|ag)\s+/i, "");
  const gemarkung = leer(a.grundbuchGemarkung).replace(/^gemarkung\s+/i, "");
  const flurstueck = leer(a.grundbuchFlurstueck).replace(/^flurst(ü|ue)ck(\(e\)|e)?\s+/i, "");
  return [
    gericht ? `Amtsgericht ${gericht}` : "",
    gemarkung ? `Gemarkung ${gemarkung}` : "",
    flurstueck ? `Flurstück(e) ${flurstueck}` : "",
  ].filter(Boolean).join(", ");
}

/**
 * Abschnitt 2 beim Globalobjekt, die Zeilen vor Straße und Ort (Tabelle A).
 *
 * „Kaufgegenstand“ ersetzt die Wohneinheit. Grundbuch, Aufteilung und
 * Stellplätze erscheinen nur, wenn sie eingetragen sind; „noch offen“ bei der
 * Aufteilung wird nicht gedruckt. Die Wohn- und Nutzfläche wird bewusst nicht
 * gedruckt, auch wenn sie im Formular steht: Abweichende Flächen sind ein
 * häufiger Streitpunkt, und das Flurstück bezeichnet das Haus schon
 * eindeutig (Empfehlung des Entwurfs vom 23.09.2026).
 */
export function objektZeilenGesamtobjekt(a: GesamtobjektAngaben): DokumentZeile[] {
  const zeilen: DokumentZeile[] = [{ label: "Kaufgegenstand", wert: KAUFGEGENSTAND_GESAMTOBJEKT }];
  const anzahl = leer(a.anzahlEinheiten);
  zeilen.push({ label: "Anzahl Einheiten", wert: anzahl ? `${anzahl} Einheiten` : "" });
  const grundbuch = grundbuchZeile(a);
  if (grundbuch) zeilen.push({ label: "Grundbuch", wert: grundbuch });
  if (a.aufteilung === "aufgeteilt" || a.aufteilung === "nicht_aufgeteilt") {
    zeilen.push({ label: "Aufteilung", wert: AUFTEILUNG_TEXT[a.aufteilung] });
  }
  const stellplaetze = leer(a.stellplaetzeGaragen);
  if (stellplaetze) zeilen.push({ label: "Stellplätze / Garagen", wert: stellplaetze });
  return zeilen;
}

/** Die Beschriftung des Preises: beim Globalobjekt „Kaufpreis gesamt“ (Tabelle A). */
export function preisBeschriftung(opt: VertragsOptionen = {}): string {
  return opt.gesamtobjekt === true ? "Kaufpreis gesamt" : "Gesamtpreis";
}

/** Was die Käuferzeilen einer Gesellschaft brauchen. `ReservierungData` erfüllt es. */
export interface GesellschaftAngaben {
  firma?: string;
  rechtsform?: string;
  firmaStrasse?: string;
  firmaHausnummer?: string;
  firmaPlz?: string;
  firmaOrt?: string;
  registergericht?: string;
  registernummer?: string;
  vorname?: string;
  nachname?: string;
  vertreterFunktion?: string;
  telefon?: string;
  email?: string;
  iban?: string;
}

/** „Max Muster, Geschäftsführer“. */
export function vertreterText(a: Pick<GesellschaftAngaben, "vorname" | "nachname" | "vertreterFunktion">): string {
  const name = [leer(a.vorname), leer(a.nachname)].filter(Boolean).join(" ");
  return [name, leer(a.vertreterFunktion)].filter(Boolean).join(", ");
}

/**
 * Abschnitt 1, wenn die Käuferin eine Gesellschaft ist (Tabelle B).
 *
 * Eine Gesellschaft hat weder Geburtsdatum noch Güterstand; ohne
 * Registerangaben wäre sie nicht eindeutig bezeichnet. Die IBAN steht nur,
 * wenn es eine Gebühr gibt, denn nur dann gibt es etwas zurückzuzahlen.
 */
export function kaeuferZeilenGesellschaft(a: GesellschaftAngaben, mitGebuehr: boolean): DokumentZeile[] {
  const anschrift = [
    [leer(a.firmaStrasse), leer(a.firmaHausnummer)].filter(Boolean).join(" "),
    [leer(a.firmaPlz), leer(a.firmaOrt)].filter(Boolean).join(" "),
  ].filter(Boolean).join(", ");
  const zeilen: DokumentZeile[] = [
    { label: "Firma", wert: leer(a.firma) },
    { label: "Rechtsform", wert: leer(a.rechtsform) },
    { label: "Sitz / Anschrift", wert: anschrift },
    { label: "Registergericht / Nummer", wert: [leer(a.registergericht), leer(a.registernummer)].filter(Boolean).join(", ") },
    { label: "vertreten durch", wert: vertreterText(a) },
    { label: "Telefon", wert: leer(a.telefon) },
    { label: "E-Mail", wert: leer(a.email) },
  ];
  if (mitGebuehr) zeilen.push({ label: "IBAN für die Rückzahlung", wert: leer(a.iban) });
  return zeilen;
}

/** Die Unterschriftszeile einer Gesellschaft: „Für die Käuferin: [Firma], [Name], [Funktion]“. */
export function unterschriftZeileGesellschaft(a: GesellschaftAngaben): string {
  return `Für die Käuferin: ${[leer(a.firma), vertreterText(a)].filter(Boolean).join(", ")}`;
}
