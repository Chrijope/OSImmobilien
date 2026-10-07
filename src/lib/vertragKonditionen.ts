// Die Konditionen eines Vertrags als ein Objekt, dazu die Fassungsweiche.
//
// Vorher las jede Klausel ihre Werte selbst aus Paket und Bewerber
// (paket.monatlich, bewerber.laufzeitOffen, provisionsSaetze, leadPaket,
// individuelleVertragsFassung). Jede Stelle konnte dabei eigene Fehler machen.
// Jetzt entsteht aus dem Bewerber genau ein Konditionen-Objekt
// (konditionenAus), und alle Renderer, das Konditionenblatt, die
// Zusammenfassung und der Konditionen-Stempel lesen nur noch daraus.
//
// Hier liegen außerdem die gemeinsamen Helfer, die vorher in
// vertragKlauseln.ts standen. Sie sind unverändert umgezogen, damit die
// Altfassung (vertragKlauselnAlt.ts) und die neue Fassung (vertragKlauseln.ts)
// dieselben Werte bekommen, ohne sich gegenseitig zu importieren.

import {
  ALT_CRM_LAUFZEIT_MONATE,
  ALT_CRM_MONATLICH_EUR,
  GESTELLT_ZUSATZ_KURZ,
  LEAD_EINZELPREIS,
  LEAD_PAKET_ANZAHL,
  LEAD_PAKET_PREIS,
  LEADPAKET_ZEILE_BIS_2026_09_28,
  PAKETE_MIT_VERTRAGSSCHALTERN,
  ZAHLUNGSWEISEN,
  berechneRaten,
  formatPreis,
  getLizenzPaket,
  type LizenzPaket,
  type LizenzPaketId,
  type Zahlungsweise,
} from "./lizenzPakete";
import type { Bewerber } from "./bewerbungStore";
import { fassungHatAnlage4 } from "../../supabase/functions/_shared/meta-pixel-freigabe.ts";

/* ── Fassungen ────────────────────────────────────────────────────────── */

/**
 * Kennzeichen der aktuellen, kompakten Vertragsfassung. Wird beim Erzeugen
 * eines Vertrags am Bewerber gespeichert (Feld vertragFassung), damit später
 * erkennbar bleibt, welche Textfassung ein Partner unterschrieben hat.
 *
 * 2026-09-07: Die Servicevereinbarung (bis dahin Anlage 3, 150 Euro brutto
 * im Monat) ist ersatzlos entfallen. Ihre sechs Leistungen stellt die
 * Gesellschaft seither unentgeltlich (§ 3 Absatz 1), die Leadpaket-Vereinbarung
 * ist von Anlage 4 auf Anlage 3 gerückt. Verträge mit dem Kennzeichen
 * 2026-09-04 enthalten die Vereinbarung noch; sie bleiben unverändert.
 *
 * 2026-09-10: § 12 hat den Tätigkeitsmaßstab als Absatz 1a bekommen,
 * mindestens eine notarielle Beurkundung in zwei aufeinanderfolgenden
 * Kalenderquartalen, und § 6 Absatz 1 verweist darauf. Verträge mit dem
 * Kennzeichen 2026-09-07 oder älter kennen ihn nicht; an dieser Kennung
 * bleibt ablesbar, wer mit und wer ohne Maßstab unterschrieben hat.
 *
 * 2026-09-26 (Entscheidung vom 26.09.2026): Anlage 4, die Vereinbarung nach
 * Art. 26 DSGVO für ein eigenes Meta Pixel auf den Partnerseiten
 * (vertragAnlage4.ts). Dazu ein Satz in § 9 Absatz 4 und Anlage 4 § 11
 * Absatz 3 in § 14 Absatz 3. Die Nummer bleibt 4, auch ohne Leadpaket
 * (Anlagen 1, 2, 4). Ältere Kennungen bekommen diese Teile nie, auch nicht
 * beim Neuaufbau zur Gegenzeichnung: Entscheidend ist die Kennung am
 * Dokument (hatMetaPixelAnlage), nicht diese Konstante. Die Kennung ist
 * der Tag der Entscheidung, nicht der Oktober, von dem der Hinweis im CRM
 * spricht: Ein Fassungsdatum in der Zukunft stünde auf jedem Deckblatt
 * neben dem heutigen Datum. Das Datumsformat hält den Textvergleich mit den
 * älteren Kennungen richtig. Die Pixel-Freigabe auf dem Server prüft
 * "Kennung ab VERTRAGSFASSUNG_MIT_ANLAGE_4", jede spätere Fassung enthält
 * Anlage 4 also weiterhin.
 *
 * 2026-09-29 (Freigabe vom 29.09.2026): Leadpaket mit Paketpreis. Der Betrag
 * heißt einheitlich Paketpreis und ist Entgelt für Gewinnung und
 * Vorqualifizierung der Leads (§ 5 Absatz 4), nicht mehr Nutzungsentgelt
 * oder Werbebudget. Anlage 3 regelt in § 1a den Einsatz binnen eines Monats,
 * die Zuteilung nach Eingang, die Nachlieferung und die Erstattung nicht
 * gelieferter Leads bei Vertragsende; § 12 Absatz 3 verweist darauf, § 5
 * Absatz 2 und § 3 Absatz 4 nennen den Anspruch aus dem Paket. Ältere
 * Kennungen behalten ihren Text (fassungHatPaketpreisRegel).
 */
export const VERTRAGSFASSUNG_PAKETPREIS = "2026-09-29";
export const VERTRAGS_FASSUNG = VERTRAGSFASSUNG_PAKETPREIS;

/**
 * Gilt für ein Dokument mit dieser Kennung die Paketpreis-Regel von
 * 2026-09-29? Wie bei Anlage 4 entscheidet die Kennung am Dokument, damit
 * ein älterer Vertrag beim Neuaufbau zur Gegenzeichnung seinen Text behält.
 */
export function fassungHatPaketpreisRegel(kennung: unknown): boolean {
  const k = typeof kennung === "string" ? kennung.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return false;
  return k >= VERTRAGSFASSUNG_PAKETPREIS;
}

/**
 * Die sechs Leistungen, die das Haus über das nach § 86a Absatz 1 HGB
 * Erforderliche hinaus stellt: unentgeltlich, ohne gesonderte Vereinbarung.
 *
 * Bis zum 06.09.2026 waren sie der Gegenstand eines eigenen Vertrags mit
 * Monatsentgelt. Seither zählt § 3 Absatz 1 sie neben CRM, Objektzugängen
 * und Pflichtschulungen auf. Die eine Quelle für Vertragstext,
 * Konditionenblatt, Kennenlernbogen und Videocall, damit alle dieselben
 * sechs nennen.
 */
export const GESTELLTE_ZUSATZLEISTUNGEN: { titel: string; beschreibung: string }[] = [
  {
    titel: "Training und Schulung über die Pflichtmodule hinaus",
    beschreibung: "Aufbaukurse der Academy, Verkaufstraining, Steuer- und Finanzierungswissen, Aufzeichnungen und laufend ergänzte Inhalte",
  },
  {
    titel: "Persönliche Landingpage und Marketingbaukasten",
    beschreibung: "Einrichtung, Hosting und Pflege einer auf den Vertriebspartner personalisierten Landingpage, Vorlagen für Social Media, Anzeigen und Empfehlungsansprache",
  },
  {
    titel: "Verkaufsunterlagen zur eigenen Akquisition",
    beschreibung: "Präsentations- und Beratungsunterlagen, Rechner und Argumentationshilfen für die eigene Akquisition des Vertriebspartners",
  },
  {
    titel: "Coaching und Vertriebsbegleitung",
    beschreibung: "Persönliche Begleitung über die Auskunftspflicht nach § 86a Absatz 2 HGB hinaus, Gesprächsvorbereitung, Feedback zu eigenen Abschlussprozessen",
  },
  {
    titel: "Partner-Community und Veranstaltungen",
    beschreibung: "Zugang zur Partner-Community und zu den Veranstaltungen der Gesellschaft, ohne Teilnahmepflicht",
  },
  {
    titel: "Erweiterter Support",
    beschreibung: "Support mit zugesagter Reaktionszeit über die allgemeine Erreichbarkeit hinaus",
  },
];

/**
 * Kennzeichen der langen Fassung mit sechs bis acht Anlagen, wie sie bis zum
 * 2. September 2026 erzeugt wurde. Bestandspartner behalten sie: Wer damit
 * unterschrieben hat oder wem sie zugeschickt wurde, bekommt bei "Vertrag neu
 * erstellen" weiterhin genau diesen Text (vertragKlauselnAlt.ts).
 */
export const VERTRAGS_FASSUNG_ALT = "2026-09-01-lang";

export type VertragsFassung = "neu" | "alt";

/**
 * Welche Textfassung gilt für diesen Bewerber?
 *
 * Reihenfolge der Regeln:
 * 1. Die vier Altpakete (Lead Partner, Team Lead, Lizenzpartner,
 *    Partner-Vertrag) werden nicht mehr neu vergeben; ihre Verträge bleiben
 *    in der langen Fassung, so wie sie Bestandspartner kennen.
 * 2. Ein gespeichertes Fassungskennzeichen entscheidet.
 * 3. Ohne Kennzeichen entscheidet das Anlagedatum: Ab dem Stichtag unten gilt
 *    immer die aktuelle Fassung.
 * 4. Davor gilt: Wer einen gesendeten, wartenden oder unterschriebenen Vertrag
 *    hat, ist Bestandspartner der Altfassung. Alle anderen bekommen die neue.
 */
/**
 * Ab wann jeder Bewerber die aktuelle Vertragsfassung bekommt.
 *
 * Entscheidung von Christian am 10.09.2026: "Bewerberprofil unter Closing,
 * egal ob Vertriebspartner oder Leadberater. Es muss immer der aktuelle
 * Vertrag mit dieser aktuellen Fassung sein, bei allen neuen zukuenftigen
 * Bewerbern ab jetzt."
 *
 * Der Statusweg weiter unten war fuer die Umstellungszeit gedacht: Wer schon
 * einen alten Vertrag verschickt bekommen hatte, sollte bei einer
 * Neuerstellung nicht ploetzlich einen anderen Text bekommen. Fuer alles, was
 * ab diesem Tag entsteht, ist das falsch, und es hat bereits einmal
 * zugeschlagen: Ein Bewerber mit gesetztem Vertragsstatus, aber ohne
 * gespeicherte Kennung, bekam die Altfassung ohne den Taetigkeitsmassstab.
 */
const FASSUNG_IMMER_AKTUELL_AB = "2026-09-10";

/** Wurde der Bewerber am Stichtag oder danach angelegt? */
function abStichtagAngelegt(erstelltAm?: string): boolean {
  const roh = (erstelltAm || "").trim();
  if (!roh) return false;
  // Nur der Tagesanteil zaehlt, die Uhrzeit spielt keine Rolle.
  return roh.slice(0, 10) >= FASSUNG_IMMER_AKTUELL_AB;
}

export function vertragsFassungVon(
  bewerber: Pick<Bewerber, "vertragFassung" | "vertragStatus" | "paketwahl"> & { erstelltAm?: string },
  paketId?: string,
): VertragsFassung {
  const paket = paketId ?? bewerber.paketwahl ?? "";
  if (paket && paket !== "tippgeber" && !(PAKETE_MIT_VERTRAGSSCHALTERN as string[]).includes(paket)) return "alt";
  const gespeichert = (bewerber.vertragFassung || "").trim();
  if (gespeichert === VERTRAGS_FASSUNG_ALT) return "alt";
  if (gespeichert) return "neu";
  // Ab dem Stichtag gilt immer die aktuelle Fassung, unabhaengig vom Status.
  // Ohne Erstelldatum bleibt es beim bisherigen Verhalten, das schuetzt die
  // Bestandsfaelle.
  if (abStichtagAngelegt(bewerber.erstelltAm)) return "neu";
  const status = bewerber.vertragStatus;
  if (status === "gesendet" || status === "wartet_auf_kurz" || status === "unterschrieben") return "alt";
  return "neu";
}

/**
 * Das Kennzeichen, das beim Erzeugen eines Vertrags gespeichert wird.
 *
 * Nimmt dieselben Angaben entgegen wie `vertragsFassungVon`, einschliesslich
 * des Anlagedatums. Fehlte es hier, entschieden beide verschieden: der Text
 * nach dem Stichtag, das gespeicherte Kennzeichen ohne ihn.
 */
export function vertragsFassungKennung(
  bewerber: Pick<Bewerber, "vertragFassung" | "vertragStatus" | "paketwahl"> & { erstelltAm?: string },
  paketId?: string,
): string {
  return vertragsFassungVon(bewerber, paketId) === "alt" ? VERTRAGS_FASSUNG_ALT : VERTRAGS_FASSUNG;
}

/**
 * Die Fassungskennung eines bestimmten Dokuments: die am Bewerber
 * gespeicherte, sonst die aktuelle. Anders als `vertragsFassungKennung`,
 * die beim Erzeugen immer auf die aktuelle Fassung hebt. Wer ein Dokument
 * neu erzeugt, setzt die neue Kennung vorher an den Bewerber (VertragsTab,
 * ClosingTab); wer ein verschicktes Dokument neu aufbaut (Signaturseite,
 * Gegenzeichnung), gibt die gespeicherte mit und bekommt denselben Text.
 */
export function vertragsDokumentKennung(
  bewerber: Pick<Bewerber, "vertragFassung" | "vertragStatus" | "paketwahl"> & { erstelltAm?: string },
  paketId?: string,
): string {
  if (vertragsFassungVon(bewerber, paketId) === "alt") return VERTRAGS_FASSUNG_ALT;
  return (bewerber.vertragFassung || "").trim() || VERTRAGS_FASSUNG;
}

/**
 * Die Fassung eines schon hinterlegten Vertrags-PDFs, beim Wiederversand und
 * beim Hochladen der unterschriebenen Fassung gleich bestimmt: die am
 * Bewerber gespeicherte Kennung, ohne Kennung die lange Altfassung. Niemals
 * die aktuelle Standardfassung, denn ein Entwurf ohne Kennung stammt aus der
 * Zeit vor der Fassungsweiche (Codex-Pruefung 27.09.2026, NB-05).
 */
export function fassungDesHinterlegtenVertrags(bewerber: Pick<Bewerber, "vertragFassung">): string {
  return (bewerber.vertragFassung || "").trim() || VERTRAGS_FASSUNG_ALT;
}

/**
 * Enthält der Vertrag Anlage 4 (Meta Pixel, Art. 26 DSGVO)? Nur in der
 * kompakten Fassung ab Kennung 2026-09-26, nie für Tippgeber.
 */
export function hatMetaPixelAnlage(
  bewerber: Pick<Bewerber, "vertragFassung" | "vertragStatus" | "paketwahl"> & { erstelltAm?: string },
  paketId?: string,
): boolean {
  if ((paketId ?? bewerber.paketwahl) === "tippgeber") return false;
  return fassungHatAnlage4(vertragsDokumentKennung(bewerber, paketId));
}

/**
 * Bewerberdaten aus einer Signaturanfrage um die Fassung ergänzen. Anfragen,
 * die vor der Fassungsweiche verschickt wurden, tragen kein Kennzeichen; sie
 * gehören sämtlich zur Altfassung, denn eine andere gab es damals nicht.
 */
export function bewerberMitFassungAusAnfrage<T extends { vertragFassung?: string }>(bewerberData: T): T {
  if ((bewerberData.vertragFassung || "").trim()) return bewerberData;
  return { ...bewerberData, vertragFassung: VERTRAGS_FASSUNG_ALT };
}

/**
 * Nummer der Leadpaket-Vereinbarung je Fassung: Anlage 3 in der kompakten
 * Fassung, Anlage 9 in der Altfassung.
 *
 * Vom 04.09. bis zum 06.09.2026 war sie Anlage 4, weil die 3 der
 * Servicevereinbarung gehörte. Alle Verweise laufen über diese Funktion,
 * deshalb genügt die Änderung an einer Stelle.
 */
export function leadpaketAnlageNummer(fassung: VertragsFassung): string {
  return fassung === "alt" ? "Anlage 9" : "Anlage 3";
}

/**
 * Der Paragraph, mit dem die Unterschrift auf dem Hauptvertrag zugleich die
 * Anlagen annimmt. In der kompakten Fassung sind das die Schlussbestimmungen
 * (§ 14), in der Altfassung § 18. Die Signaturseite nennt ihn im
 * Einwilligungstext, deshalb steht er hier und nicht als Zahl im Text.
 */
export function anlagenAkzeptanzParagraph(fassung: VertragsFassung): string {
  return fassung === "alt" ? "§ 18" : "§ 14";
}

/* ── Werkzeuge und Kontext der Renderer ───────────────────────────────── */

/** Die Zeichenwerkzeuge, die der Vertragstext braucht. */
export interface KlauselTools {
  h1: (text: string) => void;
  p: (text: string, opts?: { size?: number; gap?: number }) => void;
  bullet: (items: string[]) => void;
  spacer: (n?: number) => void;
  /** Sorgt dafür, dass die angegebene Höhe auf der Seite noch frei ist. */
  ensure: (needed: number) => void;
  /** Dezenter Kasten mit fetter Zeile und Zusatzzeile. */
  infoBox: (titel: string, untertitel: string) => void;
  /**
   * Eine Zeile des Konditionenblatts: Bezeichnung links, Wert rechts. Fehlt
   * das Werkzeug, druckt der Renderer "Bezeichnung: Wert" als Absatz.
   */
  zeile?: (label: string, wert: string) => void;
}

export interface KlauselKontext {
  bewerber: Bewerber;
  /** Bereits normalisiertes Paket, siehe paketMitVertragsSchaltern. */
  paket: LizenzPaket;
  /**
   * Läuft eine monatliche CRM-Systemgebühr? Nur in der Altfassung möglich;
   * die kompakte Fassung kennt kein laufendes Entgelt, dort ist der Wert
   * immer false.
   */
  hasCrmGebuehr: boolean;
  /** Wurden individuelle Provisionssätze vereinbart? */
  hasOverride: boolean;
  /** Die vereinbarten Sätze als fertiger Satzteil für die Klauseln. */
  effektiverSatzText: string;
  /**
   * Rangfolge der vereinbarten Sätze. Fehlt sie, wird sie aus dem Bewerber
   * abgeleitet (Aufrufer mit dem alten fünfteiligen Kontext bleiben gültig).
   */
  anwendungsregel?: string;
  /** Zahlungsweise für den Ratenplan der Altpakete mit Einmalbetrag. */
  zahlungsweise?: Zahlungsweise;
  /** Textfassung. Fehlt sie, wird sie aus dem Bewerber abgeleitet. */
  fassung?: VertragsFassung;
  /** Das Konditionen-Objekt. Fehlt es, wird es aus dem Bewerber abgeleitet. */
  konditionen?: VertragsKonditionen;
}

export interface VereinbarteSaetze {
  individuell?: number;
  lead?: number;
  eigen?: number;
  bestand?: number;
  neubau?: number;
}

export interface LeadPaketDaten {
  /** Paketpreis in EUR netto. */
  betrag: number;
  /** Anzahl der enthaltenen qualifizierten Leads. */
  anzahl: number;
}

/** Eine Anlage im Verzeichnis: Nummer und Titel. */
export interface VertragsAnlage {
  nummer: number;
  titel: string;
}

/* ── Feste Zahlen des Vertragswerks ───────────────────────────────────── */

/**
 * Ersatzlead-Regel. Hauptvertrag und Leadpaket-Vereinbarung lesen dieselben
 * Zahlen, damit beide dasselbe sagen.
 */
export const ERSATZLEAD_KONTAKTVERSUCHE = 10;
export const ERSATZLEAD_KANAELE = 2;
export const ERSATZLEAD_FRIST_TAGE = 14;

/** Ersatzlead-Regel für nicht erreichbare Leads, wortgleich an jeder Stelle. */
export const ERSATZLEAD_UNERREICHBAR = `Der Lead ist trotz mindestens ${ERSATZLEAD_KONTAKTVERSUCHE} dokumentierter Kontaktversuche über mindestens ${ERSATZLEAD_KANAELE} Kanäle innerhalb von ${ERSATZLEAD_FRIST_TAGE} Tagen nicht erreichbar.`;

/**
 * Obergrenzen der Vertragsstrafe. Es gibt im gesamten Vertragswerk nur dieses
 * eine Strafversprechen; die Anlagen verweisen darauf.
 */
export const VERTRAGSSTRAFE_MAX_EINZEL = 25000;
export const VERTRAGSSTRAFE_MAX_SYSTEMATISCH = 50000;

/**
 * Nachvertragliche Frist in Monaten, in der Daten der Gesellschaft
 * (Gesellschaftskontakte, Bauträger- und Geschäftspartnerdaten) nicht genutzt,
 * weitergegeben oder verwertet werden dürfen und die Geheimhaltung gilt.
 * Kein Wettbewerbsverbot: Sie schützt Daten und Geschäftsgeheimnisse.
 */
export const SCHUTZFRIST_MONATE = 24;
/** Partner-Vertrag (2 % Honorar, Altpaket): kürzere Frist wie bisher. */
export const SCHUTZFRIST_MONATE_PARTNER = 12;

/**
 * Hinweis, der am Anfang jeder Anlage steht. Er stand früher als Kasten am
 * Ende und rutschte regelmäßig allein auf eine leere Seite. Am Anfang der
 * Anlage ist immer Platz, und der Leser sieht sofort, wie die Anlage gilt.
 */
export const AKZEPTANZ_HINWEIS =
  "Diese Anlage ist verbindlicher Bestandteil des Handelsvertretervertrages. Eine gesonderte Unterschrift ist nicht erforderlich: Mit Unterzeichnung des Hauptvertrages bestätigt der Vertriebspartner, diese Anlage gelesen, verstanden und uneingeschränkt akzeptiert zu haben.";

/* ── Ableitungen aus Bewerber und Paket ───────────────────────────────── */

/**
 * Leitet die geltenden Provisionssätze ab.
 *
 * Vorrang haben ausdrücklich übergebene Sätze, etwa aus dem Closing-Formular.
 * Fehlen sie, werden die im Bewerberprofil gespeicherten Felder gelesen.
 *
 * Jeder eingetragene Satz wird gedruckt. Vorher fiel der Eigen-Satz
 * stillschweigend weg, sobald Bestand oder Neubau eingetragen waren, und
 * stand in keinem Dokument. Jetzt stehen alle Sätze im Vertrag, dazu eine
 * Rangfolge (anwendungsregel), und der Standardsatz gilt nur dort, wo nichts
 * Individuelles vereinbart ist.
 */
export function provisionsSaetze(
  paket: LizenzPaket,
  bewerber: Bewerber,
  saetze?: VereinbarteSaetze,
  fassung: VertragsFassung = vertragsFassungVon(bewerber, paket.id),
) {
  const unterstuetzt = [...PAKETE_MIT_VERTRAGSSCHALTERN, "lead", "team_builder", "enterprise"].includes(paket.id);
  const ausProfil = (feld: string): number | undefined => {
    const n = parseFloat(String((bewerber as Record<string, unknown>)[feld] ?? "").replace(",", "."));
    return isFinite(n) && n > 0 ? n : undefined;
  };
  const wert = (ausSaetzen: number | undefined, feld: string): number | null => {
    if (!unterstuetzt) return null;
    const v = typeof ausSaetzen === "number" && ausSaetzen > 0 ? ausSaetzen : ausProfil(feld);
    return typeof v === "number" && v > 0 ? v : null;
  };

  const iv = wert(saetze?.individuell, "satzIndividuell");
  const lv = wert(saetze?.lead, "satzLead");
  const ev = wert(saetze?.eigen, "satzEigen");
  const bv = wert(saetze?.bestand, "satzBestand");
  const nv = wert(saetze?.neubau, "satzNeubau");
  const hasObjektart = bv !== null || nv !== null;
  const hasSplit = lv !== null || ev !== null;
  const hasOverride = iv !== null || hasSplit || hasObjektart;

  // Gibt es Abschlüsse, für die gar kein individueller Satz greift?
  //
  // Die Sätze bilden zwei vollständige Dimensionen: Lead und Eigen decken
  // zusammen jeden Kontakt ab (§ 7 Absatz 2 und 3), Bestand und Neubau jedes
  // Objekt. Ist eine Dimension vollständig vereinbart, bleibt nichts übrig.
  // Ist sie nur halb vereinbart, etwa nur der Lead-Satz, gilt für den Rest
  // der Standardsatz des Pakets. Christians Entscheidung vom 04.09.2026:
  // Dieser Restfall muss ausdrücklich im Vertrag stehen, damit der Partner
  // nicht schließen muss, welcher Satz für seine Eigenkontakte gilt.
  const kontaktartVollstaendig = lv !== null && ev !== null;
  const objektartVollstaendig = bv !== null && nv !== null;
  // Der einheitliche Satz fängt den Rest selbst ab; dann darf der Paketsatz
  // nicht zusätzlich auftauchen, sonst stehen zwei Auffangregeln nebeneinander.
  const hatRestfall = hasOverride && iv === null && !kontaktartVollstaendig && !objektartVollstaendig;

  const saetzeListe: string[] = [];
  if (lv !== null) saetzeListe.push(`Lead-Satz ${lv}% (bei über MOREImmo zugewiesenen Leads)`);
  if (ev !== null) saetzeListe.push(`Eigen-Satz ${ev}% (bei eigenem Netzwerk / eigenen Kontakten)`);
  if (bv !== null) saetzeListe.push(`Bestandsobjekte ${bv}% (auf den notariellen Kaufpreis)`);
  if (nv !== null) saetzeListe.push(`Neubauobjekte ${nv}% (auf den notariellen Kaufpreis)`);
  if (iv !== null) {
    saetzeListe.push(
      saetzeListe.length === 0
        ? `Einheitlicher Satz ${iv}% (individuell vereinbart, gilt für Lead- und Eigenkontakte)`
        : `Einheitlicher Satz ${iv}% (individuell vereinbart, für alle Abschlüsse ohne spezielleren Satz)`,
    );
  } else if (hatRestfall) {
    saetzeListe.push(`Standardsatz des Pakets ${paket.provisionssatz}% (für alle Abschlüsse ohne eigenen Satz)`);
  }
  const effektiverSatzText = hasOverride ? saetzeListe.join(" · ") : `${paket.provisionssatz}%`;

  // Rangfolge in einem Satz je vereinbarter Art, damit bei mehreren Sätzen
  // eindeutig ist, welcher für welchen Abschluss gilt. Die Eigentumsregel
  // für Kontakte heißt je Fassung anders: § 9a in der Altfassung, § 7 in der
  // kompakten Fassung.
  const gesellschaftsRef = fassung === "alt" ? "§ 9a Abs. 2" : "§ 7 Absatz 2";
  const eigenRef = fassung === "alt" ? "§ 9a Abs. 3" : "§ 7 Absatz 3";
  const regel: string[] = [];
  if (lv !== null) regel.push(`Der Lead-Satz gilt für Abschlüsse mit Leads, die dem Vertriebspartner von der Gesellschaft zugewiesen wurden (Gesellschaftskontakte nach ${gesellschaftsRef}).`);
  if (ev !== null) regel.push(`Der Eigen-Satz gilt für Abschlüsse mit Eigenkontakten des Vertriebspartners (${eigenRef}).`);
  // Die Rangfolge steht als Kette im Text: erst Lead und Eigen, dann Bestand
  // und Neubau, dann ein einheitlicher Satz, zuletzt der Paketsatz. Nur das
  // letzte Glied der Kette darf einen unbestimmten Rest für sich beanspruchen
  // ("alle übrigen Abschlüsse"), alle davor beschreiben ihre Reichweite
  // ausdrücklich. Früher sagte die Objektart-Regel immer "für alle übrigen
  // Abschlüsse": Bei halb besetzter Objektart (etwa Lead-Satz plus nur
  // Bestand) stand sie damit neben dem Paketsatz, bei gesetztem einheitlichen
  // Satz neben diesem. Zwei Auffangregeln, die sich widersprechen.
  if (hasObjektart) {
    // Die Objektart-Regel beansprucht nie einen unbestimmten Rest: Sie nennt
    // ihre Reichweite immer ausdrücklich (welche Objektart, und dass Lead- und
    // Eigen-Satz vorgehen). Damit bleibt genau ein Auffang übrig, der
    // einheitliche Satz oder der Paketsatz, und die beiden schließen einander
    // aus. Früher sagte sie "für alle übrigen Abschlüsse" und stand damit als
    // zweite Auffangregel neben dem Paketsatz oder dem einheitlichen Satz.
    const namen = objektartVollstaendig ? "Bestand / Neubau" : bv !== null ? "Bestandsobjekte" : "Neubauobjekte";
    const nurWennKeinKontaktsatz = hasSplit ? ", für die weder ein Lead- noch ein Eigen-Satz vereinbart ist" : "";
    regel.push(
      objektartVollstaendig
        ? `Die objektartbezogenen Sätze (${namen}) gelten je nach vermittelter Objektart für Abschlüsse${nurWennKeinKontaktsatz || " des Vertriebspartners"}.`
        : `Der Satz für ${namen} gilt für Abschlüsse über ${namen}${nurWennKeinKontaktsatz}.`,
    );
  }
  if (iv !== null) {
    // Der einheitliche Satz ist das letzte Glied vor dem Paketsatz; steht er,
    // fängt er den Rest allein ab, und hatRestfall ist deshalb false.
    regel.push(
      saetzeListe.length > 1
        ? "Der einheitliche Satz gilt für alle Abschlüsse, für die keiner der vorstehenden Sätze greift."
        : "Der einheitliche Satz gilt für sämtliche Abschlüsse des Vertriebspartners.",
    );
  } else if (hatRestfall) {
    regel.push(`Für alle Abschlüsse, für die keiner der vorstehenden Sätze greift, gilt der Standardsatz des Pakets von ${paket.provisionssatz}%; er gilt neben den individuell vereinbarten Sätzen fort.`);
  }
  const anwendungsregel = regel.join(" ");

  return { iv, lv, ev, bv, nv, hasObjektart, hasSplit, hasOverride, hatRestfall, effektiverSatzText, anwendungsregel, saetzeListe };
}

/**
 * Gilt für diesen Vertrag keine Mindestlaufzeit?
 *
 * Wahr bei gesetztem Schalter "Ohne Mindestlaufzeit" und ebenso bei "Ohne
 * CRM-Gebühr": Wer nichts zahlt, wird auch nicht zwölf Monate gebunden.
 *
 * Beide Schalter gibt es seit dem 07.09.2026 nicht mehr in der Oberfläche:
 * Die kompakte Fassung kennt weder ein laufendes Entgelt noch eine
 * Mindestlaufzeit. Die Funktion bleibt, weil ältere Bewerber die Felder
 * gesetzt haben und der Konditionen-Stempel den Wert weiter führt; ohne sie
 * gälten bereits erzeugte Verträge plötzlich als veraltet. Bestandspakete
 * kennen die Schalter nicht.
 */
export function vertragLaufzeitOffen(paketId: string | null | undefined, bewerber: unknown): boolean {
  if (!paketId || !(PAKETE_MIT_VERTRAGSSCHALTERN as string[]).includes(paketId)) return false;
  const b = (bewerber ?? {}) as { laufzeitOffen?: boolean; ohneCrmGebuehr?: boolean };
  return !!b.laufzeitOffen || !!b.ohneCrmGebuehr;
}

/**
 * Nimmt einem Paket die monatliche CRM-Systemgebühr, wenn beim Bewerber
 * "ohne CRM-Gebühr" gesetzt ist.
 *
 * Das Paket wird dabei auf monatlich = 0 und Laufzeit = 0 reduziert und die
 * Leistungsliste bereinigt. Bei den aktuellen Paketen gibt es nichts mehr zu
 * nehmen, sie tragen keine Gebühr; ein gespeicherter Altwert des Schalters
 * lässt sie deshalb unverändert. Wichtig ist, dass jede Stelle, die
 * Vertragsdokumente erzeugt, dieselbe Normalisierung benutzt.
 */
export function paketOhneCrmGebuehr<T extends { id: string; monatlich: number; laufzeitMonate: number; features: string[] }>(
  rawPaket: T,
  bewerber: unknown,
): T {
  const ohne =
    rawPaket.monatlich > 0 &&
    (PAKETE_MIT_VERTRAGSSCHALTERN as string[]).includes(rawPaket.id) &&
    !!(bewerber as { ohneCrmGebuehr?: boolean })?.ohneCrmGebuehr;
  if (!ohne) return rawPaket;
  return {
    ...rawPaket,
    monatlich: 0,
    laufzeitMonate: 0,
    features: rawPaket.features
      // Die Gebührenzeile faellt weg, die Zeile zur unentgeltlichen
      // Grundleistung bleibt: Sie gilt unabhaengig davon.
      .filter((f) => !/CRM-Systemgeb|\/Monat/i.test(f))
      .concat(["Keine CRM-Systemgebühr und kein laufendes Entgelt (individuell vereinbart)"]),
  };
}

/**
 * Wendet die beiden früheren Closing-Schalter auf ein Paket an: "Ohne
 * CRM-Gebühr" (paketOhneCrmGebuehr) und "Ohne Mindestlaufzeit"
 * (vertragLaufzeitOffen). Bei offener Laufzeit wird laufzeitMonate auf 0
 * gesetzt und die Mindestlaufzeit-Angabe in der Leistungsliste ersetzt. Die
 * aktuellen Pakete tragen weder Gebühr noch Mindestlaufzeit, für sie ist die
 * Funktion ein Durchlauf.
 */
export function paketMitVertragsSchaltern<T extends { id: string; monatlich: number; laufzeitMonate: number; features: string[] }>(
  rawPaket: T,
  bewerber: unknown,
): T {
  let paket = paketOhneCrmGebuehr(rawPaket, bewerber);
  const offen = vertragLaufzeitOffen(rawPaket.id, bewerber);
  if (offen && paket.laufzeitMonate > 0) {
    paket = {
      ...paket,
      laufzeitMonate: 0,
      features: paket.features.map((f) =>
        f.replace(/\d+\s*Monate Mindestlaufzeit, danach monatlich kündbar/, "keine Mindestlaufzeit, monatlich kündbar"),
      ),
    };
  }
  return paket;
}

/**
 * Leistungsliste eines Pakets mit den tatsächlich geltenden Provisionssätzen.
 *
 * Sind individuelle Sätze vereinbart, ersetzt die Standardzeile
 * ("Einheitlich 4 % Provision auf Lead- und Eigenkontakte") den Text aus
 * provisionsSaetze(). Ohne individuelle Sätze kommt die Liste unverändert
 * zurück.
 */
export function featuresMitProvisionsSaetzen(
  paket: LizenzPaket,
  bewerber: Bewerber,
  saetze?: VereinbarteSaetze,
): string[] {
  const { hasOverride, effektiverSatzText } = provisionsSaetze(paket, bewerber, saetze);
  if (!hasOverride) return paket.features;
  const overrideZeile = `Individuell vereinbarte Provision: ${effektiverSatzText}`;
  // Nur die Zeile mit dem einheitlichen Standardsatz wird ersetzt. Zeilen wie
  // die Overhead-Provision (Strukturvergütung) bleiben unberührt.
  const standardZeile = /^Einheitlich\s.*Provision/i;
  const ersetzt = paket.features.map((f) => (standardZeile.test(f) ? overrideZeile : f));
  return ersetzt.includes(overrideZeile) ? ersetzt : [...ersetzt, overrideZeile];
}

/**
 * Anschrift des Vertriebspartners als Vertragspartei.
 *
 * Immer die Vertragsanschrift (Feld vertragsAdresse), ersatzweise die
 * Anschrift aus dem Profil (adresse und ort). Nie die Rechnungsadresse: Die
 * darf ein Firmensitz sein und gehört nur dorthin, wo es um Rechnungen geht.
 * Vorher setzte das Einzeldokument die Firma als Vertragspartei und das
 * Gesamt-PDF die Person; der Unterzeichner bekam zwei Parteienangaben.
 */
export function vertragsAnschriftZeilen(bewerber: Bewerber): string[] {
  const vAdr = ((bewerber as { vertragsAdresse?: string }).vertragsAdresse || "").trim();
  if (vAdr) return vAdr.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const profil = [bewerber.adresse, bewerber.ort].filter(Boolean).join(", ");
  return [profil || "[Anschrift]"];
}

/** Rechnungsanschrift als Zeilen, leer wenn keine hinterlegt ist. */
export function rechnungsAnschriftZeilen(bewerber: Bewerber): string[] {
  return (bewerber.rechnungsAdresse || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

/* ── Das Konditionen-Objekt ───────────────────────────────────────────── */

/**
 * Alle vertragsrelevanten Konditionen eines Bewerbers, einmal abgeleitet.
 *
 * Das Konditionenblatt (Anlage 1 der neuen Fassung) druckt dieses Objekt
 * eins zu eins ab; Hauptvertrag, Zusammenfassung und Stempel lesen daraus.
 */
export interface VertragsKonditionen {
  fassung: VertragsFassung;
  /** Kennung genau dieses Dokuments (vertragsDokumentKennung), etwa "2026-09-26". */
  fassungKennung: string;
  /** Enthält der Vertrag Anlage 4 (Meta Pixel)? Siehe hatMetaPixelAnlage. */
  metaPixelAnlage: boolean;
  /** Normalisiertes Paket: Schalter angewendet, Sätze in der Leistungsliste. */
  paket: LizenzPaket;
  paketId: LizenzPaketId;
  paketTitel: string;
  partnerHonorar: boolean;
  istTippgeber: boolean;
  /** Greifen die Closing-Schalter (Gebühr, Laufzeit, Sätze, Fassung) bei diesem Paket? */
  hatVertragsSchalter: boolean;

  partnerName: string;
  vertragsAnschrift: string[];
  /** Leer, wenn keine eigene Rechnungsanschrift hinterlegt ist. */
  rechnungsAnschrift: string[];
  email: string;
  telefon: string;

  /**
   * Monatliche CRM-Systemgebühr brutto inkl. USt.; 0 heißt: entfällt. Nur
   * die Altfassung kennt sie, in der kompakten Fassung ist sie immer 0.
   */
  crmGebuehrMonatlich: number;
  hasCrmGebuehr: boolean;
  /** Früherer Schalter "Ohne CRM-Gebühr" gesetzt (individuell vereinbart, Altwert). */
  crmGebuehrErlassen: boolean;
  /** Mindestlaufzeit in Monaten; 0 heißt: keine. Die kompakte Fassung hat nie eine. */
  mindestlaufzeitMonate: number;
  /** Keine Mindestlaufzeit (früherer Schalter oder Folge von "Ohne CRM-Gebühr"). */
  laufzeitOffen: boolean;

  /** Standardsatz des Pakets in Prozent. */
  standardSatz: number;
  saetze: { individuell: number | null; lead: number | null; eigen: number | null; bestand: number | null; neubau: number | null };
  /** Die fünf Satzfelder als getrimmte Rohwerte, in Stempel-Reihenfolge. */
  saetzeRoh: [string, string, string, string, string];
  hasOverride: boolean;
  /**
   * Bleibt nach allen individuellen Sätzen ein Abschluss offen, für den der
   * Standardsatz des Pakets gilt? Genau dann, und nur dann, nennt das
   * Vertragswerk ihn ausdrücklich, damit es nie zwei Auffangregeln gibt.
   */
  hatRestfall: boolean;
  effektiverSatzText: string;
  anwendungsregel: string;
  saetzeListe: string[];

  /** Leadmodell: käufliches Leadpaket (Vertriebspartner), gestellte Leads (Lead-Berater) oder Altpaket mit Start-Leads. */
  leadModell: "leadpaket" | "gestellt" | "altpaket" | "keins";
  leadPaket: LeadPaketDaten | null;
  /**
   * Einzelkauf einzelner Leads ausgewiesen (Closing-Schalter, Standard aus).
   * Greift nur beim käuflichen Leadmodell und nur, solange kein Leadpaket
   * gebucht ist: Beides zusammen widerspräche sich im Vertragstext.
   */
  leadEinzelkauf: boolean;

  wettbewerbsfassung: "standard" | "individuell";
  /** Erklärte Tätigkeiten für andere Vertriebe, eine je Zeile, nur bei Individualfassung. */
  andereVertriebe: string[];

  zahlungsweise: Zahlungsweise;
  zahlungsweiseLabel: string;
  /** Einmalbetrag der Altpakete in EUR netto; 0 bei den aktuellen Paketen. */
  einmalbetrag: number;
  raten: number[];

  schutzfristMonate: number;
  vertragsstrafeMaxEinzel: number;
  vertragsstrafeMaxSystematisch: number;
}

/**
 * Baut das Konditionen-Objekt aus dem Bewerber. Optional lassen sich Paket,
 * Zahlungsweise und Sätze ausdrücklich mitgeben (Closing-Formular); sonst
 * werden die gespeicherten Felder gelesen. Ohne bekanntes Paket gibt es
 * nichts abzuleiten, dann null.
 */
export function konditionenAus(
  bewerber: Bewerber,
  args: { paket?: LizenzPaket | null; zahlungsweise?: Zahlungsweise; saetze?: VereinbarteSaetze } = {},
): VertragsKonditionen | null {
  const gewaehlt = args.paket ?? getLizenzPaket(bewerber.paketwahl);
  if (!gewaehlt) return null;
  const fassung = vertragsFassungVon(bewerber, gewaehlt.id);
  const rohPaket = fassung === "alt" ? paketMitAltfassungsGebuehr(gewaehlt) : gewaehlt;
  const paketNorm = paketMitVertragsSchaltern(rohPaket, bewerber);
  const paket = { ...paketNorm, features: featuresMitProvisionsSaetzen(paketNorm, bewerber, args.saetze) };
  const s = provisionsSaetze(paket, bewerber, args.saetze, fassung);
  const hatVertragsSchalter = (PAKETE_MIT_VERTRAGSSCHALTERN as string[]).includes(rohPaket.id);
  // Ein laufendes Entgelt gibt es nur in der Altfassung. Die kompakte Fassung
  // sagt an jeder Stelle, dass alles gestellt wird; hier steht die eine
  // Sicherung dafür, unabhängig davon, was ein Paket in den Daten trägt.
  const hasCrmGebuehr = fassung === "alt" && !paket.partnerHonorar && paket.monatlich > 0;
  const laufzeitOffen = vertragLaufzeitOffen(rohPaket.id, bewerber);
  const zahlungsweise: Zahlungsweise =
    args.zahlungsweise ?? (ZAHLUNGSWEISEN.some((z) => z.id === bewerber.zahlungsweise) ? (bewerber.zahlungsweise as Zahlungsweise) : "einmal");
  const roh = (v: unknown) => String(v ?? "").trim();
  const wettbewerbsfassung = hatVertragsSchalter && bewerber.individuelleVertragsFassung ? "individuell" : "standard";
  const leadModell: VertragsKonditionen["leadModell"] = paket.istTippgeber || paket.partnerHonorar
    ? "keins"
    : paket.id === "lead_berater"
      ? "gestellt"
      : paket.preis > 0
        ? "altpaket"
        : "leadpaket";

  return {
    fassung,
    fassungKennung: vertragsDokumentKennung(bewerber, gewaehlt.id),
    metaPixelAnlage: hatMetaPixelAnlage(bewerber, gewaehlt.id),
    paket,
    paketId: paket.id,
    paketTitel: paket.titel,
    partnerHonorar: !!paket.partnerHonorar,
    istTippgeber: !!paket.istTippgeber,
    hatVertragsSchalter,

    partnerName: [bewerber.vorname, bewerber.nachname].filter(Boolean).join(" ") || "[Vertriebspartner]",
    vertragsAnschrift: vertragsAnschriftZeilen(bewerber),
    rechnungsAnschrift: rechnungsAnschriftZeilen(bewerber),
    email: bewerber.email || "",
    telefon: bewerber.telefon || "",

    crmGebuehrMonatlich: hasCrmGebuehr ? paket.monatlich : 0,
    hasCrmGebuehr,
    crmGebuehrErlassen: hatVertragsSchalter && !!bewerber.ohneCrmGebuehr,
    // Nur die Altfassung hat eine Mindestlaufzeit: ohne Schalter die des
    // Pakets, Pakete ohne Angabe (Partner-Vertrag) rechnen wie bisher mit
    // zwölf Monaten. Die kompakte Fassung läuft auf unbestimmte Zeit nach
    // § 89 HGB und hat nie eine.
    mindestlaufzeitMonate: fassung === "alt" && !laufzeitOffen ? (paket.laufzeitMonate > 0 ? paket.laufzeitMonate : 12) : 0,
    laufzeitOffen,

    standardSatz: paket.provisionssatz,
    saetze: { individuell: s.iv, lead: s.lv, eigen: s.ev, bestand: s.bv, neubau: s.nv },
    saetzeRoh: [roh(bewerber.satzIndividuell), roh(bewerber.satzLead), roh(bewerber.satzEigen), roh(bewerber.satzBestand), roh(bewerber.satzNeubau)],
    hasOverride: s.hasOverride,
    hatRestfall: s.hatRestfall,
    effektiverSatzText: s.effektiverSatzText,
    anwendungsregel: s.anwendungsregel,
    saetzeListe: s.saetzeListe,

    leadModell,
    leadPaket: leadModell === "leadpaket" && bewerber.leadPaket ? { betrag: bewerber.leadPaket.betrag, anzahl: bewerber.leadPaket.anzahl } : null,
    // Die Sperre gegen das Leadpaket sitzt hier, an einer Stelle: Ist ein
    // Paket gebucht, ist der Einzelkauf aus, egal was der Schalter sagt.
    // So kann kein Aufrufer die Kombination versehentlich erzeugen.
    leadEinzelkauf:
      hatVertragsSchalter
      && leadModell === "leadpaket"
      && !!bewerber.leadEinzelkauf
      && !(leadModell === "leadpaket" && bewerber.leadPaket),

    wettbewerbsfassung,
    andereVertriebe: wettbewerbsfassung === "individuell"
      ? String(bewerber.andereVertriebe || "").split(/\r?\n/).map((z) => z.trim()).filter(Boolean)
      : [],

    zahlungsweise,
    zahlungsweiseLabel: (ZAHLUNGSWEISEN.find((z) => z.id === zahlungsweise) ?? ZAHLUNGSWEISEN[0]).label,
    einmalbetrag: paket.partnerHonorar ? 0 : paket.preis,
    raten: !paket.partnerHonorar && paket.preis > 0 ? berechneRaten(paket.preis, zahlungsweise) : [],

    schutzfristMonate: paket.partnerHonorar ? SCHUTZFRIST_MONATE_PARTNER : SCHUTZFRIST_MONATE,
    vertragsstrafeMaxEinzel: VERTRAGSSTRAFE_MAX_EINZEL,
    vertragsstrafeMaxSystematisch: VERTRAGSSTRAFE_MAX_SYSTEMATISCH,
  };
}

/**
 * Gilt für diesen Bewerber im gewählten Paket eine Leadpaket-Vereinbarung?
 *
 * Die eine Quelle für das Anlagenverzeichnis, den gedruckten Anlagensatz und
 * jeden Renderer. Vorher lasen die Aufrufer teils das Rohfeld
 * `bewerber.leadPaket`, teils das normalisierte `konditionen.leadPaket`. Die
 * beiden liefen auseinander, sobald ein Paketwechsel den alten Leadpaket-Wert
 * stehen ließ: Beim Lead-Berater listete das Verzeichnis dann Anlage 3, der
 * Renderer fand aber kein Leadpaket und brach mit einer Fehlermeldung ab. Der
 * Vertrag ließ sich gar nicht mehr erzeugen.
 */
export function hatLeadpaketAnlage(
  bewerber: Pick<Bewerber, "leadPaket" | "paketwahl">,
  paketId?: string,
): boolean {
  if (!bewerber.leadPaket) return false;
  const paket = getLizenzPaket(paketId ?? bewerber.paketwahl);
  if (!paket) return false;
  const k = konditionenAus(bewerber as Bewerber, { paket });
  return !!k?.leadPaket;
}

/**
 * Gibt einem Paket der Altfassung die CRM-Systemgebühr zurück, die
 * Bestandspartner unterschrieben haben.
 *
 * Vertriebspartner und Lead-Berater tragen seit dem 07.09.2026 keine Gebühr
 * mehr in den Daten, weil jede Oberfläche für neue Bewerber daraus liest.
 * Wer aber die lange Fassung unterschrieben hat, zahlt sie weiter, und
 * seine Zusammenfassung, sein Stempel und sein neu erzeugter Vertragstext
 * müssen unverändert das sagen, was in seinem Vertrag steht. Die drei
 * Altpakete tragen die Gebühr ohnehin; Partner-Vertrag und Tippgeber hatten
 * nie eine.
 */
export function paketMitAltfassungsGebuehr<T extends LizenzPaket>(paket: T): T {
  if (paket.partnerHonorar || paket.istTippgeber || paket.monatlich > 0) return paket;
  const gebuehrZeile = `CRM-Systemgebühr ${ALT_CRM_MONATLICH_EUR} € brutto/Monat inkl. USt. · ${ALT_CRM_LAUFZEIT_MONATE} Monate Mindestlaufzeit, danach monatlich kündbar`;
  return {
    ...paket,
    monatlich: ALT_CRM_MONATLICH_EUR,
    laufzeitMonate: ALT_CRM_LAUFZEIT_MONATE,
    // Die Leistungsliste der Altfassung nennt die Gebühr an der Stelle, an
    // der die kompakte Fassung die gestellten Zusatzleistungen aufzählt.
    // Die Leadpaket-Zeile lautet in der Altfassung wie bis zum 28.09.2026.
    features: paket.features.map((f) =>
      f.startsWith(GESTELLT_ZUSATZ_KURZ) ? gebuehrZeile : f.startsWith("Optionales Leadpaket") ? LEADPAKET_ZEILE_BIS_2026_09_28 : f),
  };
}

/** Text der Leadpaket-Zeile für das Konditionenblatt und die Zusammenfassung. */
export function leadpaketKonditionText(
  k: Pick<VertragsKonditionen, "leadModell" | "leadPaket" | "fassung" | "leadEinzelkauf"> & { fassungKennung?: string },
): string {
  const anlage = leadpaketAnlageNummer(k.fassung);
  if (k.leadModell === "gestellt") {
    return "Leads werden zur Unterstützung gestellt, nach Verfügbarkeit, ohne definierte Stückzahl und ohne Anspruch auf eine bestimmte Menge; ein Leadpaket wird nicht geschlossen";
  }
  if (k.leadPaket) {
    // Ab Fassung 2026-09-29 mit Einsatz, Zuteilung und Nachlieferung (Anlage 3 § 1a).
    if (k.fassung === "neu" && fassungHatPaketpreisRegel(k.fassungKennung)) {
      return `${formatPreis(k.leadPaket.betrag)} netto Paketpreis für ${k.leadPaket.anzahl} qualifizierte Leads; die Gesellschaft setzt den Paketpreis innerhalb eines Monats ab Zahlungseingang, frühestens ab Freischaltung des CRM-Zugangs, für ihre Werbemaßnahmen ein, weist die Leads nach Eingang zu und liefert fehlende nach; nicht gelieferte Leads werden bei Vertragsende anteilig erstattet; Einzelheiten in ${anlage}.`;
    }
    return `${formatPreis(k.leadPaket.betrag)} netto für ${k.leadPaket.anzahl} qualifizierte Leads vereinbart, Einzelheiten in ${anlage}`;
  }
  // Nur mit gesetztem Schalter wird der Einzelkauf ausgewiesen. Ohne ihn steht
  // hier Wort für Wort derselbe Text wie vor dem 04.09.2026.
  if (k.leadEinzelkauf) {
    return `Kein Leadpaket vereinbart. Einzelne Leads jederzeit erwerbbar zu ${formatPreis(LEAD_EINZELPREIS)} netto je Lead zzgl. USt., ohne Abnahmepflicht und ohne Mindestmenge (individuell vereinbart, § 5 Absatz 2a); optional ein Leadpaket zu ${formatPreis(LEAD_PAKET_PREIS)} netto für ${LEAD_PAKET_ANZAHL} qualifizierte Leads`;
  }
  return `Kein Leadpaket vereinbart; optional jederzeit buchbar: ${formatPreis(LEAD_PAKET_PREIS)} netto für ${LEAD_PAKET_ANZAHL} qualifizierte Leads, Einzel-Leads zu ${formatPreis(LEAD_EINZELPREIS)} netto je Lead nach der ersten Paketbuchung`;
}

/**
 * Baut den vollständigen Klauselkontext, den Hauptvertrag und Anlagen lesen.
 * Gesamt-PDF und Einzeldokumente rufen genau diese Funktion, damit beide zu
 * denselben Werten kommen.
 */
export function erstelleVertragsKontext(args: {
  bewerber: Bewerber;
  paket: LizenzPaket;
  zahlungsweise?: Zahlungsweise;
  saetze?: VereinbarteSaetze;
}): KlauselKontext {
  const { bewerber, zahlungsweise, saetze } = args;
  const konditionen = konditionenAus(bewerber, { paket: args.paket, zahlungsweise, saetze });
  if (!konditionen) throw new Error("Ungültiges Paket");
  return {
    bewerber,
    paket: konditionen.paket,
    hasCrmGebuehr: konditionen.hasCrmGebuehr,
    hasOverride: konditionen.hasOverride,
    effektiverSatzText: konditionen.effektiverSatzText,
    anwendungsregel: konditionen.anwendungsregel,
    zahlungsweise,
    fassung: konditionen.fassung,
    konditionen,
  };
}

/** Anwendungsregel aus dem Kontext oder, bei altem Kontext, aus dem Bewerber. */
export function regelAus(ctx: KlauselKontext): string {
  if (typeof ctx.anwendungsregel === "string") return ctx.anwendungsregel;
  return provisionsSaetze(ctx.paket, ctx.bewerber, undefined, fassungAus(ctx)).anwendungsregel;
}

/**
 * Fasst Anlagennummern zu einem lesbaren Bereich zusammen: "1-6", "1-6 & 9",
 * "1-6, 8 & 9". Für den Hinweiskasten vor der Unterschrift, der früher im
 * Einzeldokument fest "Anlagen 1-7" behauptete.
 */
export function anlagenBereichText(nummern: number[]): string {
  if (nummern.length === 0) return "";
  const teile: string[] = [];
  let start = nummern[0];
  let prev = nummern[0];
  for (const n of nummern.slice(1).concat(NaN)) {
    if (n === prev + 1) { prev = n; continue; }
    teile.push(start === prev ? String(start) : `${start}-${prev}`);
    start = n; prev = n;
  }
  if (teile.length <= 1) return teile[0] ?? "";
  return `${teile.slice(0, -1).join(", ")} & ${teile[teile.length - 1]}`;
}

/** Fassung aus dem Kontext oder, bei altem Kontext, aus dem Bewerber. */
export function fassungAus(ctx: KlauselKontext): VertragsFassung {
  return ctx.fassung ?? vertragsFassungVon(ctx.bewerber, ctx.paket.id);
}

/** Konditionen aus dem Kontext oder, bei altem Kontext, frisch abgeleitet. */
export function konditionenAusKontext(ctx: KlauselKontext): VertragsKonditionen {
  if (ctx.konditionen) return ctx.konditionen;
  const k = konditionenAus(ctx.bewerber, { paket: ctx.paket, zahlungsweise: ctx.zahlungsweise });
  if (!k) throw new Error("Ungültiges Paket");
  return k;
}
