/**
 * Kurzfassung des Erstgesprächs aus den gespeicherten Skript-Antworten.
 *
 * Bewusst ohne Netz und ohne fremden Dienst: Das Erstgesprächs-Skript ist ein
 * Formular mit festen Fragen. Aus festen Feldern lässt sich sofort und
 * verlässlich ein Satz bauen. Ein Sprachmodell könnte hier nur dazuerfinden,
 * was nicht dasteht, und müsste dafür erst geladen werden.
 *
 * Die Schnittstelle ist trotzdem so geschnitten, dass später ein lokal
 * laufendes Modell dieselbe Signatur bedienen kann (siehe
 * `ZusammenfassungErzeuger`), ohne dass die Aufrufstellen sich ändern.
 *
 * Die bestehende KI-Zusammenfassung (Edge Function
 * `erstgespraech-zusammenfassung`, gespeichert in
 * `investment.meta.gespraechsnotizenAI`) bleibt davon unberührt.
 */

/** Ein Schritt des Skripts, reduziert auf das, was die Zusammenfassung braucht. */
export interface ZusammenfassungSchritt {
  /** Schritt-ID, zugleich der Schlüssel im Notizen-Objekt. */
  id: string;
  /** Schlüssel der Antwortfelder dieses Schritts (`fragen[].key`). */
  fragenSchluessel: string[];
  /** Ob der Schritt ein Freitext-Notizfeld besitzt. */
  hatNotiz: boolean;
}

/** Der gespeicherte Stand aus `investment.meta.setterSkript`. */
export interface SkriptEingabe {
  antworten?: Record<string, unknown> | null;
  notizen?: Record<string, unknown> | null;
  ziele?: unknown;
  /**
   * Netto-Einkommen und Eigenkapital liegen nicht im Skript, sondern in den
   * Qualifizierungsfeldern des Kontakts (Sonderbloecke mit Synchronisierung).
   * Die Aufrufstellen reichen sie hier mit herein, sonst fehlen die beiden
   * wichtigsten Zahlen in jeder Zusammenfassung.
   */
  qualEinkommen?: unknown;
  qualEigenkapital?: unknown;
}

export interface ZusammenfassungOptionen {
  /**
   * Schrittliste für die Fortschrittsangabe. Ohne sie bleibt der Fortschritt
   * leer, der Text entsteht trotzdem. Die App reicht die aus `SCHRITTE`
   * abgeleitete Liste `ERSTGESPRAECH_SCHRITTE` herein, damit es für die
   * Fragenschlüssel nur eine Quelle gibt.
   */
  schritte?: ZusammenfassungSchritt[];
  /** Höchstlänge eines einzelnen Freitextwerts. */
  maxWertZeichen?: number;
  /** Höchstlänge der gesamten Zusammenfassung. */
  maxGesamtZeichen?: number;
}

export interface Gespraechszusammenfassung {
  /** Zwei bis vier Sätze, leer wenn nichts Aussagekräftiges gespeichert ist. */
  text: string;
  /** Zum Beispiel „7 von 17 Schritten beantwortet“, leer ohne Schrittliste. */
  fortschritt: string;
  beantworteteSchritte: number;
  schritteGesamt: number;
  /** True, wenn weder Text noch beantwortete Schritte vorliegen. */
  istLeer: boolean;
}

/** Ein Antwortfeld eines Schritts, mit lesbarer Beschriftung. */
export interface DetailFeld {
  /** Schlüssel in `antworten`. */
  key: string;
  /** Beschriftung, wie sie im Popup vor der Antwort steht. */
  label: string;
  /**
   * Klartext für kodierte Werte, etwa "qualitaet" → "Qualität". Fehlt ein
   * Eintrag, wird der Rohwert genommen.
   */
  werte?: Record<string, string>;
}

/** Ein Schritt des Skripts für die ausführliche Fassung. */
export interface DetailSchritt {
  id: string;
  nr: number;
  /** Anzeige-Nummer, wenn sie von `nr` abweicht (z.B. "4a" für Zwischenschritte). */
  nrText?: string;
  titel: string;
  felder: DetailFeld[];
  hatNotiz: boolean;
}

/** Eine Zeile im Popup: Frage links, Antwort darunter. */
export interface DetailEintrag {
  frage: string;
  antwort: string;
}

/** Ein Schritt mit mindestens einer beantworteten Frage. */
export interface DetailAbschnitt {
  id: string;
  nr: number;
  /** Anzeige-Nummer, wenn sie von `nr` abweicht (z.B. "4a" für Zwischenschritte). */
  nrText?: string;
  titel: string;
  eintraege: DetailEintrag[];
}

/**
 * Vertrag für Zusammenfassungs-Erzeuger. Ein späterer lokaler Erzeuger muss
 * nur diese Signatur erfüllen, dann bleiben die Aufrufstellen unverändert.
 */
export type ZusammenfassungErzeuger = (
  eingabe: SkriptEingabe | null | undefined,
  optionen?: ZusammenfassungOptionen,
) => Gespraechszusammenfassung;

// Schlüssel der Antwortfelder, die in die Kurzfassung einfließen.
// Entsprechen `fragen[].key` in SCHRITTE.
const A_BERUF = "beruf";
const A_ARBEITGEBER = "arbeitgeber";
const A_SPARFORMEN = "sparformen";
const A_ZWEI_PUNKTE = "zweiPunkte";
const A_INVESTITION_MONAT = "investitionMonat";
const A_OFFENE_FRAGEN = "offeneFragen";
const A_ERFAHRUNG = "erfahrung";

// Schritt-IDs, deren Freitext-Notiz in die Kurzfassung einfließt.
const N_WARMUP = "warmup";
const N_PATTERN_INTERRUPT = "pattern_interrupt";
const N_NETTO = "netto";

// Schritt-IDs der Sonderbloecke, deren Wert im Kontakt liegt (qual*-Felder).
const NETTO_SCHRITT_ID = "netto";
const SPARFORMEN_SCHRITT_ID = "sparformen";

/** Schritt-ID des Ziele-Blocks. Dort zählt zusätzlich die Zielauswahl. */
const ZIELE_SCHRITT_ID = "ziele";

const MAX_WERT_ZEICHEN = 100;
// Seit die Kurzfassung auch Netto, Eigenkapital und die Einkommens-Notiz
// traegt (27.08.2026), braucht sie etwas mehr Platz, sonst verdraengt die
// Notiz den Satz mit den Einwaenden.
const MAX_GESAMT_ZEICHEN = 420;
/** Höchstens vier Sätze, sonst ist es keine Kurzfassung mehr. */
const MAX_SAETZE = 4;

/** Zeilenumbrüche und Mehrfach-Leerzeichen zu einem Leerzeichen zusammenziehen. */
function normalisiere(roh: unknown): string {
  if (typeof roh !== "string") return "";
  return roh.replace(/\s+/gu, " ").trim();
}

/** Einen Wert aus Antworten oder Notizen holen, sauber normalisiert. */
function wert(quelle: Record<string, unknown> | null | undefined, schluessel: string): string {
  if (!quelle || typeof quelle !== "object") return "";
  return normalisiere((quelle as Record<string, unknown>)[schluessel]);
}

/**
 * Langen Freitext kürzen, bevorzugt an einer Satzgrenze. Nur wenn keine
 * brauchbare Satzgrenze im erlaubten Bereich liegt, wird an der letzten
 * Wortgrenze getrennt, niemals mitten im Wort.
 */
export function kuerzeFreitext(roh: string, maxZeichen: number = MAX_WERT_ZEICHEN): string {
  const text = normalisiere(roh);
  if (maxZeichen <= 0) return "";
  if (text.length <= maxZeichen) return text;

  // Satzgrenze suchen: Satzzeichen, gefolgt von Leerzeichen oder Textende.
  let satzGrenze = -1;
  for (let i = 0; i < maxZeichen && i < text.length; i++) {
    const z = text[i];
    if (z !== "." && z !== "!" && z !== "?") continue;
    const naechstes = text[i + 1];
    if (naechstes === undefined || naechstes === " ") satzGrenze = i;
  }
  // Eine Satzgrenze ganz am Anfang würde fast alles wegwerfen, dann lieber
  // an der Wortgrenze trennen.
  if (satzGrenze >= Math.floor(maxZeichen * 0.4)) {
    return text.slice(0, satzGrenze + 1);
  }

  const ausschnitt = text.slice(0, maxZeichen);
  const wortGrenze = ausschnitt.lastIndexOf(" ");
  const gekuerzt = wortGrenze > 0 ? ausschnitt.slice(0, wortGrenze) : ausschnitt;
  return `${gekuerzt.replace(/[.,;:!?]+$/u, "")}…`;
}

/** Satzzeichen am Ende entfernen, damit beim Zusammensetzen nichts doppelt steht. */
function ohneEndzeichen(text: string): string {
  return text.replace(/[.,;:]+$/u, "").trim();
}

/** Aus „Label: Wert“-Teilen einen abgeschlossenen Satz bauen. */
function baueSatz(teile: string[]): string {
  const gefuellt = teile.map(ohneEndzeichen).filter(Boolean);
  if (gefuellt.length === 0) return "";
  const roh = gefuellt.join("; ");
  return /[!?…]$/u.test(roh) ? roh : `${roh}.`;
}

/** Ziele robust einlesen, auch wenn im JSONB Unerwartetes steht. */
function leseZiele(roh: unknown): string[] {
  if (!Array.isArray(roh)) return [];
  return roh.map(normalisiere).filter(Boolean);
}

function zaehleFortschritt(
  eingabe: SkriptEingabe,
  schritte: ZusammenfassungSchritt[],
): { beantwortet: number; gesamt: number } {
  // Nur Schritte zählen, die überhaupt ein Eingabefeld haben. Reine
  // Vorlesetexte wie die Begrüßung könnten sonst nie „beantwortet“ sein.
  const beantwortbar = schritte.filter(s => s.fragenSchluessel.length > 0 || s.hatNotiz);
  const antworten = eingabe.antworten;
  const notizen = eingabe.notizen;
  const ziele = leseZiele(eingabe.ziele);

  const beantwortet = beantwortbar.filter(s => {
    if (s.fragenSchluessel.some(k => wert(antworten, k) !== "")) return true;
    if (s.hatNotiz && wert(notizen, s.id) !== "") return true;
    if (s.id === ZIELE_SCHRITT_ID && ziele.length > 0) return true;
    // Netto und Eigenkapital liegen im Kontakt, nicht in den Antworten.
    if (s.id === NETTO_SCHRITT_ID && normalisiere(eingabe.qualEinkommen) !== "") return true;
    if (s.id === SPARFORMEN_SCHRITT_ID && normalisiere(eingabe.qualEigenkapital) !== "") return true;
    return false;
  }).length;

  return { beantwortet, gesamt: beantwortbar.length };
}

/**
 * Baut die Kurzfassung aus den gespeicherten Antworten.
 *
 * Reihenfolge der Sätze ist zugleich ihre Wichtigkeit: Wer ist es, was will
 * er, was kann er, was ist offen. Weniger Wichtiges (Auslöser, Vorerfahrung)
 * rutscht nach hinten und entfällt, wenn das Gespräch vollständig ausgefüllt
 * ist. Es soll eine Kurzfassung bleiben, keine zweite Formularansicht.
 */
export const baueErstgespraechZusammenfassung: ZusammenfassungErzeuger = (eingabe, optionen = {}) => {
  const schritte = optionen.schritte ?? [];
  const maxWert = optionen.maxWertZeichen ?? MAX_WERT_ZEICHEN;
  const maxGesamt = optionen.maxGesamtZeichen ?? MAX_GESAMT_ZEICHEN;

  const daten: SkriptEingabe = eingabe && typeof eingabe === "object" ? eingabe : {};
  const antworten = daten.antworten;
  const notizen = daten.notizen;

  const kurz = (roh: string) => kuerzeFreitext(roh, maxWert);
  const a = (schluessel: string) => kurz(wert(antworten, schluessel));
  const n = (schrittId: string) => kurz(wert(notizen, schrittId));

  const beruf = a(A_BERUF);
  const arbeitgeber = a(A_ARBEITGEBER);
  const ziele = leseZiele(daten.ziele);
  const zweiPunkte = a(A_ZWEI_PUNKTE);
  const investitionMonat = a(A_INVESTITION_MONAT);
  const sparformen = a(A_SPARFORMEN);
  const offeneFragen = a(A_OFFENE_FRAGEN);
  const einwaende = n(N_PATTERN_INTERRUPT);
  const ausloeser = n(N_WARMUP);
  const erfahrung = a(A_ERFAHRUNG);
  const nettoEinkommen = kurz(normalisiere(daten.qualEinkommen));
  const eigenkapital = kurz(normalisiere(daten.qualEigenkapital));
  const nettoNotiz = n(N_NETTO);

  // Satz 1: Wer ist es. Arbeitgeber liest sich als Klammerzusatz besser.
  const satzBeruf = beruf && arbeitgeber
    ? baueSatz([`Beruflich: ${ohneEndzeichen(beruf)} (${ohneEndzeichen(arbeitgeber)})`])
    : baueSatz([
      beruf ? `Beruflich: ${beruf}` : "",
      arbeitgeber ? `Arbeitgeber: ${arbeitgeber}` : "",
    ]);

  const kandidaten = [
    satzBeruf,
    // Satz 2: Was will er.
    baueSatz([
      ziele.length > 0 ? `Ziele: ${ziele.join(", ")}` : "",
      zweiPunkte ? `am wichtigsten: ${zweiPunkte}` : "",
    ]),
    // Satz 3: Was kann er.
    baueSatz([
      nettoEinkommen ? `Netto/Monat: ${nettoEinkommen}` : "",
      eigenkapital ? `Eigenkapital: ${eigenkapital}` : "",
      investitionMonat ? `Monatlich möglich: ${investitionMonat}` : "",
      sparformen ? `Sparformen: ${sparformen}` : "",
      nettoNotiz ? `Notiz Einkommen: ${nettoNotiz}` : "",
    ]),
    // Satz 4: Was ist offen.
    baueSatz([
      offeneFragen ? `Offen: ${offeneFragen}` : "",
      einwaende ? `Einwände: ${einwaende}` : "",
    ]),
    // Nachrangig, greift nur bei dünn gefülltem Skript.
    baueSatz([ausloeser ? `Auslöser: ${ausloeser}` : ""]),
    baueSatz([erfahrung ? `Immobilien-Erfahrung: ${erfahrung}` : ""]),
  ].filter(Boolean);

  const saetze: string[] = [];
  let laenge = 0;
  for (const satz of kandidaten) {
    if (saetze.length >= MAX_SAETZE) break;
    const zusatz = saetze.length === 0 ? satz.length : satz.length + 1;
    // Der erste Satz kommt immer mit, sonst bliebe die Kurzfassung leer,
    // obwohl etwas gespeichert ist.
    if (saetze.length > 0 && laenge + zusatz > maxGesamt) break;
    saetze.push(satz);
    laenge += zusatz;
  }

  const { beantwortet, gesamt } = zaehleFortschritt(daten, schritte);
  const text = saetze.join(" ");

  return {
    text,
    fortschritt: gesamt > 0 ? `${beantwortet} von ${gesamt} Schritten beantwortet` : "",
    beantworteteSchritte: beantwortet,
    schritteGesamt: gesamt,
    istLeer: text === "" && beantwortet === 0,
  };
};

/**
 * Die ausführliche Fassung: jede beantwortete Frage mit ihrer Antwort, in der
 * Reihenfolge des Skripts. Anders als die Kurzfassung wird hier nichts gekürzt
 * und nichts weggelassen, außer dem, was leer geblieben ist. Gedacht für das
 * Zusammenfassungs-Popup, in dem man lesen und nicht überfliegen will.
 */
export function baueErstgespraechDetails(
  eingabe: SkriptEingabe | null | undefined,
  schritte: DetailSchritt[],
): DetailAbschnitt[] {
  const daten: SkriptEingabe = eingabe && typeof eingabe === "object" ? eingabe : {};
  const antworten = daten.antworten;
  const notizen = daten.notizen;
  const ziele = leseZiele(daten.ziele);

  const abschnitte: DetailAbschnitt[] = [];
  for (const schritt of schritte) {
    const eintraege: DetailEintrag[] = [];

    // Der Ziele-Block ist ein Kachel-Picker, seine Auswahl steht nicht in den
    // Antworten und braucht deshalb eine eigene Zeile.
    if (schritt.id === ZIELE_SCHRITT_ID && ziele.length > 0) {
      eintraege.push({ frage: "Ziele", antwort: ziele.join(", ") });
    }

    // Netto und Eigenkapital kommen aus den Qualifizierungsfeldern des
    // Kontakts, siehe SkriptEingabe. Ohne diese Zeilen fehlten die beiden
    // Sonderwerte in der ausfuehrlichen Fassung.
    if (schritt.id === NETTO_SCHRITT_ID) {
      const netto = normalisiere(daten.qualEinkommen);
      if (netto) eintraege.push({ frage: "Netto-Einkommen / Monat", antwort: netto });
    }
    if (schritt.id === SPARFORMEN_SCHRITT_ID) {
      const ek = normalisiere(daten.qualEigenkapital);
      if (ek) eintraege.push({ frage: "Verfügbares Eigenkapital", antwort: ek });
    }

    for (const feld of schritt.felder) {
      const roh = wert(antworten, feld.key);
      if (!roh) continue;
      eintraege.push({ frage: feld.label, antwort: feld.werte?.[roh] ?? roh });
    }

    if (schritt.hatNotiz) {
      const notiz = wert(notizen, schritt.id);
      if (notiz) eintraege.push({ frage: "Notiz", antwort: notiz });
    }

    if (eintraege.length > 0) {
      abschnitte.push({
        id: schritt.id,
        nr: schritt.nr,
        ...(schritt.nrText ? { nrText: schritt.nrText } : {}),
        titel: schritt.titel,
        eintraege,
      });
    }
  }
  return abschnitte;
}
