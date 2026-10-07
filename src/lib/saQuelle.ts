/**
 * Gemeinsame Auswahl der maßgeblichen Selbstauskunft (SA).
 *
 * Kundenprofil (CRM) und Kundenportal brauchen dieselbe Antwort auf die Frage
 * "welche SA gilt gerade". Vorher lag die Auswahl dreimal im Code: das CRM
 * nahm für die Dokumentliste die SA des ERSTEN Investments, das Portal die des
 * aktiven Investments, und der Finanzierungsrahmen nahm wieder die erste.
 * Ein Kunde mit zwei Investments sah dadurch je nach Seite andere Listen.
 *
 * Kanonisch ist seit dem 10.09.2026 die strenge Regel: Jedes Investment steht
 * für sich und übernimmt nichts aus einem anderen. Maßgeblich ist also
 * ausschließlich die SA des betrachteten Investments, siehe
 * `eigeneSaDataFuerInvestmentRow` weiter unten. Steht kein einzelnes
 * Investment fest, wird gar nichts gezeigt.
 *
 * Für die Vorbelegung des Selbstauskunfts-Formulars gilt seit dem 10.09.2026
 * `saVomVorherigenInvestment` weiter unten: Investment 5 wird mit den Angaben
 * von Investment 4 vorbelegt, sichtbar markiert. Dort werden keine fremden
 * Zahlen angezeigt, sondern Tipparbeit abgenommen, und der Kunde bestätigt am
 * Ende selbst.
 *
 * `saDataFuerInvestmentRow` mit seinem Rückfall auf die neueste SA bleibt
 * unverändert bestehen, wird von der Vorbelegung aber nicht mehr benutzt.
 *
 * Es gibt bewusst nur diese Auswahlfunktionen. Wer eine weitere braucht, hat
 * vermutlich die Regel missverstanden.
 *
 * Bewusst ohne Importe gehalten, damit sowohl der investmentsStore als auch
 * Portal-Seiten das Modul nutzen können, ohne einen Importkreis zu riskieren
 * (siehe Kommentar in pipelineStufen.ts).
 */

/** Inhalt einer Selbstauskunft; die Felder sind historisch gewachsen und offen. */
export type SaDaten = Record<string, unknown> & { abgeschlossenAm?: string };

/** Der hier benötigte Ausschnitt einer rohen investments-Zeile. */
export interface InvestmentZeileMitSa {
  id?: string;
  erstellt_am?: string;
  meta?: {
    nummer?: number | string;
    saData?: SaDaten | null;
    saSnapshot?: SaDaten | null;
    /** Ist die Selbstauskunft unterschrieben? */
    saSigned?: boolean | null;
  } | null;
}

/**
 * Steht in diesen Angaben noch unbestätigt Übernommenes?
 *
 * Eine vorbelegte Selbstauskunft traegt einen Vermerk mit den Abschnitten, die
 * der Nutzer noch nicht geprueft hat. Solange dieser Vermerk offene Abschnitte
 * nennt, sind die Zahlen die des vorherigen Investments und nicht die dieses
 * Vorgangs. Sie duerfen dann nirgends als Zahl, Liste oder Dokument auftauchen.
 */
function nochUnbestaetigteUebernahme(saData: SaDaten | null | undefined): boolean {
  if (!saData) return false;
  if (saData.abgeschlossen === true) return false;
  const vermerk = saData.vorbelegung as { offeneAbschnitte?: unknown[] } | undefined;
  return Array.isArray(vermerk?.offeneAbschnitte) && vermerk.offeneAbschnitte.length > 0;
}

/** Sortier-Zeitstempel einer Investment-Zeile für die SA-Auswahl. */
export function getInvestmentSaSortTimestamp(investmentRow: InvestmentZeileMitSa | null | undefined): number {
  const raw = investmentRow?.meta?.saData?.abgeschlossenAm || investmentRow?.erstellt_am || "";
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Die Investment-Zeile mit der NEUESTEN Selbstauskunft.
 *
 * Stand vorher als lokale Funktion in KundenDetail.tsx und ist hierher
 * gezogen, damit CRM und Portal dieselbe Auswahl treffen.
 */
export function getCurrentSaInvestmentRow<T extends InvestmentZeileMitSa>(investmentRows: T[]): T | null {
  const withSa = (investmentRows || []).filter((investmentRow) => investmentRow?.meta?.saData);
  if (withSa.length === 0) return null;

  return [...withSa].sort((a, b) => {
    const timestampDiff = getInvestmentSaSortTimestamp(b) - getInvestmentSaSortTimestamp(a);
    if (timestampDiff !== 0) return timestampDiff;

    const nummerA = Number(a?.meta?.nummer || 0);
    const nummerB = Number(b?.meta?.nummer || 0);
    return nummerB - nummerA;
  })[0] || null;
}

/**
 * Die SA mit Rückfall. NUR für die Vorbelegung von Formularen.
 *
 * 1. Eigene SA des Investments (saData, sonst der Snapshot saSnapshot).
 * 2. Rückfall: die neueste SA über alle Investments des Kontakts.
 * 3. Rückfall: die am Kontakt gespeicherte SA (Altbestand), falls übergeben.
 *
 * Diese Funktion darf nichts speisen, was jemand als Zahl, Liste oder
 * Dokument zu sehen bekommt. Fremde Zahlen wären geraten, nicht gerechnet.
 * Für alles Sichtbare gilt `eigeneSaDataFuerInvestmentRow`.
 */
export function saDataFuerInvestmentRow(
  investmentRow: InvestmentZeileMitSa | null | undefined,
  alleInvestmentRows: InvestmentZeileMitSa[],
  kontaktSaData?: SaDaten | null,
): SaDaten | null {
  const eigene = eigeneSaDataFuerInvestmentRow(investmentRow);
  if (eigene) return eigene;
  const neueste = getCurrentSaInvestmentRow(alleInvestmentRows);
  if (neueste?.meta?.saData) return neueste.meta.saData;
  return kontaktSaData || null;
}

/**
 * NUR die eigene Selbstauskunft eines Investments, ohne jeden Rückfall.
 *
 * Das ist die Regel für alles Sichtbare (Entscheidung Christian,
 * 10.09.2026): Jedes Investment ist unabhängig und übernimmt nichts aus
 * einem anderen. Ohne eigene Selbstauskunft zeigt ein Investment keine
 * finanziellen Zahlen, keinen Finanzierungsrahmen, keine daraus abgeleitete
 * Unterlagenliste und erzeugt keine Selbstauskunfts-PDF. All das entsteht
 * erst aus der Selbstauskunft dieses einen Vorgangs. Fremde Zahlen wären
 * geraten, nicht gerechnet.
 *
 * `saSnapshot` zählt mit: Das ist dieselbe Selbstauskunft, nur an der
 * zweiten Stelle abgelegt, an der sie historisch landet.
 *
 * Seit der Vorbelegung gibt es einen Zwischenzustand: Der Entwurf des
 * Formulars wird laufend am Investment gesichert, damit nichts verlorengeht,
 * und er enthält am Anfang die übernommenen Angaben des vorherigen
 * Investments. Solange darin noch ungeprüfte Abschnitte vermerkt sind, ist das
 * NICHT die eigene Selbstauskunft dieses Vorgangs, sondern eine Abschrift, an
 * der noch gearbeitet wird. Sonst wäre über die Hintertür des Entwurfs genau
 * das zurück, was am 10.09.2026 abgeschafft wurde: fremde Zahlen an einem
 * Investment ohne eigene Selbstauskunft.
 *
 * Unterschrieben oder abgeschlossen zählt immer, unabhängig vom Vermerk.
 */
export function eigeneSaDataFuerInvestmentRow(
  investmentRow: InvestmentZeileMitSa | null | undefined,
): SaDaten | null {
  const saData = investmentRow?.meta?.saData || investmentRow?.meta?.saSnapshot || null;
  if (!saData) return null;
  if (investmentRow?.meta?.saSigned) return saData;
  if (nochUnbestaetigteUebernahme(saData)) return null;
  return saData;
}

/** Hat dieses Investment eine eigene Selbstauskunft? */
export function hatEigeneSa(investmentRow: InvestmentZeileMitSa | null | undefined): boolean {
  return !!eigeneSaDataFuerInvestmentRow(investmentRow);
}

// ── Vorbelegung: die Selbstauskunft des VORHERIGEN Investments ──────────────

/** Woher die Vorbelegung eines Formulars stammt. */
export interface VorherigeSaQuelle {
  /** Die Angaben, mit denen vorbelegt wird. */
  saData: SaDaten;
  /** Nummer des Investments, aus dem sie stammen. Steht so im Hinweistext. */
  nummer: number;
  /** id des Quell-Investments, sofern die Zeile eine trägt. */
  investmentId?: string;
}

/** Die Nummer eines Investments, sofern sie brauchbar ist. */
function nummerVon(investmentRow: InvestmentZeileMitSa | null | undefined): number | null {
  const roh = investmentRow?.meta?.nummer;
  if (roh === null || roh === undefined || roh === "") return null;
  const zahl = Number(roh);
  return Number.isFinite(zahl) && zahl > 0 ? zahl : null;
}

/**
 * Die Investments eines Kontakts in ihrer fachlichen Reihenfolge.
 *
 * Maßgeblich ist die Nummer, denn genau die sieht der Nutzer als
 * „Investment 4". Gewachsene Daten sind aber nicht sauber: Es gibt Zeilen
 * ohne Nummer und Zeilen mit derselben Nummer (das passiert, wenn zwei
 * Fenster gleichzeitig anlegen). Deshalb zwei Notbehelfe:
 *
 *  - Ohne Nummer geht eine Zeile ans Ende. Sie kann keine Position
 *    beanspruchen, und ans Ende gestellt nimmt sie keiner anderen etwas weg.
 *  - Bei gleicher Nummer entscheidet das ältere Anlagedatum, danach die id.
 *    So kommt immer dieselbe Reihenfolge heraus, auch bei zwei Aufrufen
 *    hintereinander.
 */
function inFachlicherReihenfolge<T extends InvestmentZeileMitSa>(investmentRows: T[]): T[] {
  return [...(investmentRows || [])].sort((a, b) => {
    const nummerA = nummerVon(a);
    const nummerB = nummerVon(b);
    if (nummerA !== nummerB) {
      if (nummerA === null) return 1;
      if (nummerB === null) return -1;
      return nummerA - nummerB;
    }
    const zeitA = Date.parse(a?.erstellt_am || "") || 0;
    const zeitB = Date.parse(b?.erstellt_am || "") || 0;
    if (zeitA !== zeitB) return zeitA - zeitB;
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  });
}

/**
 * Die Selbstauskunft des VORHERIGEN Investments, ausschließlich zur
 * Vorbelegung des Formulars.
 *
 * Vorgabe des Geschäftsführers vom 10.09.2026: Investment 5 wird mit den
 * Angaben von Investment 4 vorbelegt, nicht mit der zuletzt ausgefüllten
 * Selbstauskunft irgendeines Investments. Beides ist meistens dasselbe, aber
 * nicht immer: Wird die Selbstauskunft zu Investment 2 später nachgetragen
 * als die zu Investment 4, gewänne bei einer Sortierung nach Zeitstempel die
 * ältere Sachlage.
 *
 * Hat Investment 4 keine eigene Selbstauskunft, wird weiter zurückgegangen,
 * bis eine gefunden ist. Festlegung Christian: lieber die nächstliegende
 * vorhandene als gar keine. Findet sich keine, gibt es keine Vorbelegung und
 * das Formular bleibt leer.
 *
 * Ohne `zielInvestmentId` (Altweg des Formulars ohne Investmentbezug) gilt
 * das letzte Investment der Reihe als Quelle.
 *
 * Die Werte hieraus dürfen NUR ein Formular vorbelegen und müssen dort
 * sichtbar als übernommen markiert sein. Angezeigt, gerechnet oder in eine
 * Unterlage geschrieben werden sie nie, dafür gilt
 * `eigeneSaDataFuerInvestmentRow`.
 */
export function saVomVorherigenInvestment<T extends InvestmentZeileMitSa>(
  zielInvestmentId: string | null | undefined,
  alleInvestmentRows: T[],
): VorherigeSaQuelle | null {
  const sortiert = inFachlicherReihenfolge(alleInvestmentRows || []);

  let bis = sortiert.length;
  if (zielInvestmentId) {
    const position = sortiert.findIndex((row) => row?.id === zielInvestmentId);
    // Ist das Ziel gar nicht dabei, ist unbekannt, wo es in der Reihe steht.
    // Dann lieber nichts übernehmen als etwas Falsches.
    if (position < 0) return null;
    bis = position;
  }

  for (let i = bis - 1; i >= 0; i--) {
    const saData = eigeneSaDataFuerInvestmentRow(sortiert[i]);
    if (!saData) continue;
    return {
      saData,
      nummer: nummerVon(sortiert[i]) ?? i + 1,
      investmentId: sortiert[i]?.id,
    };
  }
  return null;
}
