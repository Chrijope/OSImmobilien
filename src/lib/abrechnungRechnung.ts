import { istNotarDurchlaufen, istProvisionsrelevant, istStorniert } from "@/lib/abschlussDefinition";

/**
 * Was ein Partner wann in Rechnung stellen darf.
 *
 * Die Rechnung stand bis zum 14.09.2026 mitten in `Abrechnungen.tsx`, einer
 * Datei mit über 1600 Zeilen. Geldrechnung gehört dorthin nicht: Sie ist die
 * Stelle, an der ein Fehler bares Geld kostet, und sie war weder einzeln
 * prüfbar noch von der Oberfläche zu trennen.
 *
 * ── Die drei Zahlen, die nicht dasselbe sind ────────────────────────────
 *
 * Der alte Aufbau kannte nur eine Summe und nannte sie je nach Ort
 * "Provision", "Rechnungsbetrag" oder "aktueller Monat". Tatsächlich sind es
 * drei verschiedene Dinge, und Christian hat sie am 14.09.2026 getrennt:
 *
 *   erwartet    Alles ab Reservierung. Was kommen könnte, die Prognose.
 *   faellig     Nur, wo die Kaufpreisfälligkeit erreicht ist. Das darf der
 *               Partner heute in Rechnung stellen.
 *   erhalten    Was tatsächlich schon ausgezahlt wurde. Kommt nicht von hier,
 *               sondern aus `provisionsabrechnungen`.
 *
 * ── Warum die Kaufpreisfälligkeit und nicht der Notartermin ─────────────
 *
 * Vorher schätzte die Seite: Notartermin plus 42 Tage, angezeigt als "ca.".
 * Das Datum steht aber längst am Investment, sobald es jemand im Kundenprofil
 * unter Abwicklung einträgt. Eine Schätzung neben einer vorhandenen Tatsache
 * ist keine Bequemlichkeit, sondern eine zweite Wahrheit.
 */

/** Ein Geschäft, wie es die Abrechnung braucht. */
export interface AbrechnungsPosten {
  /** Der Kaufpreis. Kommt vom Investment, nicht vom Kontakt. */
  kaufpreis: number;
  /** Die Pipelinestufe des Investments. */
  stufe: string | null | undefined;
  /** Der Prozentsatz dieses Geschäfts, etwa 4 für vier Prozent. */
  satz: number;
  /** Das am Investment hinterlegte Datum der Kaufpreisfälligkeit, JJJJ-MM-TT. */
  kaufpreisfaelligAm?: string | null;
}

export interface AbrechnungsSummen {
  /** Alles ab Reservierung, also die Erwartung. */
  erwartet: number;
  /** Nur, was heute in Rechnung gestellt werden darf. */
  faellig: number;
  /** Wie viele Geschäfte den Notartermin hinter sich haben. */
  abschluesse: number;
}

/** Die Provision eines einzelnen Geschäfts. */
export function postenProvision(posten: AbrechnungsPosten): number {
  const kp = Number(posten.kaufpreis) || 0;
  const satz = Number(posten.satz) || 0;
  if (kp <= 0 || satz <= 0) return 0;
  return kp * (satz / 100);
}

/**
 * Ist die Kaufpreisfälligkeit erreicht?
 *
 * Ohne Datum ist die Antwort nein. Das ist der wichtigste Punkt an dieser
 * Funktion: Solange niemand die Fälligkeit eingetragen hat, darf nichts in
 * Rechnung gestellt werden, auch wenn der Notartermin lange her ist. Der
 * Eintrag ist die Bestätigung, dass das Geld geflossen ist.
 *
 * Der Tag selbst zählt mit. Wer die Fälligkeit auf heute setzt, soll heute
 * abrechnen können und nicht bis morgen warten.
 */
export function istKaufpreisFaellig(datum?: string | null, heute = new Date()): boolean {
  const roh = (datum || "").trim();
  if (!roh) return false;
  const faellig = new Date(roh);
  if (Number.isNaN(faellig.getTime())) return false;
  // Beide auf Tagesbeginn, sonst entscheidet die Uhrzeit über den Tag.
  const a = new Date(faellig.getFullYear(), faellig.getMonth(), faellig.getDate());
  const b = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate());
  return a.getTime() <= b.getTime();
}

/**
 * Darf dieses Geschäft heute abgerechnet werden?
 *
 * Zwei Bedingungen, beide nötig: Der Notartermin muss durchlaufen sein, UND
 * die Kaufpreisfälligkeit muss erreicht sein. Die erste allein genügt nicht,
 * denn zwischen Beurkundung und Zahlung liegen Wochen; die zweite allein
 * ebenso wenig, denn ein Datum ohne vollzogenen Kauf wäre ein Tippfehler.
 */
export function istAbrechenbar(posten: AbrechnungsPosten, heute = new Date()): boolean {
  if (!istNotarDurchlaufen(posten.stufe)) return false;
  return istKaufpreisFaellig(posten.kaufpreisfaelligAm, heute);
}

/**
 * Die drei Summen eines Partners über alle seine Geschäfte.
 *
 * `erhalten` fehlt hier bewusst: Diese Zahl steht in `provisionsabrechnungen`
 * und ist keine Rechnung, sondern eine Auskunft der Datenbank.
 */
export function abrechnungsSummen(
  posten: AbrechnungsPosten[],
  heute = new Date(),
): AbrechnungsSummen {
  let erwartet = 0;
  let faellig = 0;
  let abschluesse = 0;

  for (const p of posten) {
    if (istNotarDurchlaufen(p.stufe)) abschluesse += 1;
    if (!istProvisionsrelevant(p.stufe)) continue;
    const betrag = postenProvision(p);
    erwartet += betrag;
    if (istAbrechenbar(p, heute)) faellig += betrag;
  }

  return {
    erwartet: Math.round(erwartet),
    faellig: Math.round(faellig),
    abschluesse,
  };
}

/**
 * Der Satz, der unter dem Rechnungsbetrag steht.
 *
 * Er muss erklären, warum dort null steht, sonst hält man es für einen
 * Fehler. Genau das war der Zustand vorher: Die Seite schrieb "Diesen Betrag
 * kannst du diesen Monat in Rechnung stellen" über eine Summe, die weder
 * einen Monat kannte noch die Fälligkeit.
 */
export function rechnungsHinweis(summen: AbrechnungsSummen, offeneErwartung: number): string {
  if (summen.faellig > 0) {
    return "Für diese Abschlüsse ist die Kaufpreisfälligkeit erreicht. Der Betrag kann in Rechnung gestellt werden.";
  }
  if (offeneErwartung > 0) {
    return "Noch nichts abrechenbar. Sobald bei einem Abschluss die Kaufpreisfälligkeit eingetragen ist, erscheint der Betrag hier.";
  }
  return "Noch keine Abschlüsse mit durchlaufenem Notartermin.";
}

// ═══════════════════════════════════════════════════════════════════════════
// Die Abrechnungshistorie
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Eine Zeile der Abrechnungshistorie.
 *
 * Die Tabelle darunter stand bis zum 14.09.2026 auf einem fest leeren Array
 * und hat nie eine Zeile gezeigt. Sie war also nicht kaputt, sondern nie
 * gebaut worden.
 */
export interface HistorieZeile {
  /** "September 2026". */
  monat: string;
  /** "2026-09", zum Sortieren und zum Nachschlagen der Abrechnung. */
  monatKey: string;
  abschluesse: number;
  provision: number;
  /** Woher der Monat kommt: die Kaufpreisfälligkeit. */
  kaufpreisfaellig: string;
}

const MONATE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

/** Aus "2026-09-14" wird "2026-09". */
function monatsSchluessel(datum: string): string {
  return datum.slice(0, 7);
}

/**
 * Die Historie eines Partners, ein Eintrag je Monat, neueste zuerst.
 *
 * **Der Monat ist der der Kaufpreisfälligkeit, nicht der des Notartermins.**
 * Das ist der Monat, in dem der Partner abrechnen darf, und danach fragt
 * diese Tabelle. Zwischen Beurkundung und Zahlung liegen Wochen, die beiden
 * fallen also regelmäßig auseinander.
 *
 * Geschäfte ohne eingetragene Fälligkeit erscheinen gar nicht. Sie haben
 * keinen Monat, in den sie gehören, und eine Zeile "unbekannt" wäre in einer
 * Abrechnungshistorie schlimmer als keine.
 */
export function abrechnungsHistorie(posten: AbrechnungsPosten[]): HistorieZeile[] {
  const nachMonat = new Map<string, { abschluesse: number; provisionCent: number }>();

  for (const p of posten) {
    if (!istNotarDurchlaufen(p.stufe)) continue;
    const datum = (p.kaufpreisfaelligAm || "").trim();
    if (!datum) continue;
    const d = new Date(datum);
    if (Number.isNaN(d.getTime())) continue;

    const key = monatsSchluessel(datum);
    const bisher = nachMonat.get(key) || { abschluesse: 0, provisionCent: 0 };
    bisher.abschluesse += 1;
    // In Cent summiert, gerundet wird erst in der Anzeige.
    bisher.provisionCent += provisionCent(p.kaufpreis, p.satz);
    nachMonat.set(key, bisher);
  }

  return [...nachMonat.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, werte]) => {
      const [jahr, monat] = key.split("-");
      const name = `${MONATE[Number(monat) - 1] || monat} ${jahr}`;
      return {
        monat: name,
        monatKey: key,
        abschluesse: werte.abschluesse,
        provision: werte.provisionCent / 100,
        kaufpreisfaellig: name,
      };
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// Cent, bezahlte Geschäfte, fehlender Kaufpreis (seit 04.10.2026)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Die Provision eines Geschäfts in ganzen Cent.
 *
 * Gerechnet wird in Cent, gerundet erst in der Anzeige. Vorher rundete die
 * Übersicht jede Summe auf ganze Euro und der Bescheid jeden Posten auf
 * Cent, die beiden Seiten wichen also voneinander ab. Kaufpreis in Euro mal
 * Satz in Prozent ergibt genau die Cent.
 */
export function provisionCent(kaufpreis: number, satz: number): number {
  const kp = Number(kaufpreis) || 0;
  const s = Number(satz) || 0;
  if (kp <= 0 || s <= 0) return 0;
  return Math.round(kp * s);
}

/** Was aus einem Bescheid für die Frage „schon abgerechnet?“ gebraucht wird. */
export interface BescheidAuszug {
  status: string;
  /** JJJJ-MM des Bescheids. */
  monat?: string;
  eigeneDeals?: { investmentId?: string; kontaktId?: string }[];
}

export interface AbgerechneteGeschaefte {
  investments: Set<string>;
  /**
   * Ältere Bescheide rechneten je Kontakt und tragen keine Investment-Kennung.
   * Je Kontakt die Monate dieser Bescheide.
   */
  altJeKontakt: Map<string, Set<string>>;
}

/**
 * Welche Geschäfte stehen bereits in einem Bescheid mit einem dieser Status?
 * Für „Fällig“ zählt nur `ausgezahlt`, für das Neuberechnen auch
 * `freigegeben`: Ein Geschäft darf nie in zwei Monaten abgerechnet werden.
 */
export function abgerechneteGeschaefte(
  bescheide: BescheidAuszug[],
  status: readonly string[] = ["ausgezahlt"],
): AbgerechneteGeschaefte {
  const investments = new Set<string>();
  const altJeKontakt = new Map<string, Set<string>>();
  for (const b of bescheide) {
    if (!status.includes(b.status)) continue;
    for (const d of b.eigeneDeals ?? []) {
      if (d.investmentId) investments.add(d.investmentId);
      else if (d.kontaktId) {
        const monate = altJeKontakt.get(d.kontaktId) ?? new Set<string>();
        if (b.monat) monate.add(b.monat);
        altJeKontakt.set(d.kontaktId, monate);
      }
    }
  }
  return { investments, altJeKontakt };
}

/** Früherer Name, nur `ausgezahlt`. */
export const ausgezahlteGeschaefte = (bescheide: BescheidAuszug[]) => abgerechneteGeschaefte(bescheide);

/**
 * Das Datum, nach dem ein Geschäft einem Abrechnungsmonat zufällt: der
 * Notartermin am Investment, bei Altbestand am Kontakt, sonst die letzte
 * Änderung. Dieselbe Regel für Bescheid und Zuordnung zu Altbescheiden.
 */
export function abschlussDatumFuer(
  inv: { notarTermin?: string | null },
  k?: { notarTermin?: string | null; aktualisiert_am?: string | null; erstellt_am?: string | null } | null,
): string {
  return inv.notarTermin || k?.notarTermin || k?.aktualisiert_am || k?.erstellt_am || "";
}

/**
 * Nur der Notartermin, ohne Rückfall auf Änderungs- oder Anlagedatum. Für
 * die Zuordnung zu Altbescheiden: Ohne belastbaren Termin heißt es „bitte
 * klären“, nicht „passt schon“.
 */
export function notarDatumFuer(
  inv: { notarTermin?: string | null },
  k?: { notarTermin?: string | null } | null,
): string {
  return inv.notarTermin || k?.notarTermin || "";
}

/** Ein Investment mit dem Monat seines Notartermins, für die Zuordnung zu Altbescheiden. */
export interface GeschaeftZuordnung {
  investmentId: string;
  kontaktId: string;
  /** JJJJ-MM des Notartermins in deutscher Zeit, leer wenn unbekannt. */
  notarMonat: string;
}

/**
 * Steht dieses Geschäft schon in einem Bescheid?
 *
 *   "ja"       mit seiner Investment-Kennung, oder als einziges Investment
 *              des Kontakts mit Notartermin im Monat eines Altbescheids
 *   "nein"     in keinem Bescheid
 *   "klaeren"  zum Kontakt gibt es einen Altbescheid ohne Investment-Kennung,
 *              der sich diesem Geschäft nicht eindeutig zuordnen lässt
 *
 * Grundsatz Geld: lieber „bitte klären“ als still falsch zählen. Bis zum
 * 04.10.2026 galt ein Altbescheid für jedes Investment des Kontakts.
 */
export function abrechnungsstand(
  abgerechnet: AbgerechneteGeschaefte,
  geschaeft: GeschaeftZuordnung,
  geschaefteDesKontakts: GeschaeftZuordnung[],
): "ja" | "nein" | "klaeren" {
  if (abgerechnet.investments.has(geschaeft.investmentId)) return "ja";
  const monate = abgerechnet.altJeKontakt.get(geschaeft.kontaktId);
  if (!monate) return "nein";
  if (!geschaeft.notarMonat || !monate.has(geschaeft.notarMonat)) return "klaeren";
  const imSelbenMonat = geschaefteDesKontakts.filter((g) => g.notarMonat === geschaeft.notarMonat);
  return imSelbenMonat.length === 1 ? "ja" : "klaeren";
}

/**
 * Der Kaufpreis eines Investments mit Rückfall auf den Kontakt.
 *
 * Der Kontaktwert gilt nur, wenn der Kontakt genau ein Investment hat. Bei
 * mehreren weiß niemand, zu welchem er gehört; dann bleibt es bei null, und
 * das Investment erscheint als „Kaufpreis fehlt“. Bis zum 04.10.2026 bekam
 * jedes Investment ohne eigenen Preis den Kontaktwert, zwei also doppelt.
 */
export function kaufpreisMitRueckfall(
  investmentPreis: number,
  kontaktPreis: number | null | undefined,
  investmentsDesKontakts: number,
): number {
  const eigen = Number(investmentPreis) || 0;
  if (eigen > 0) return eigen;
  return investmentsDesKontakts === 1 ? Number(kontaktPreis) || 0 : 0;
}

/** Wie viele Investments je Kontakt, für `kaufpreisMitRueckfall`. */
export function investmentsJeKontakt(investments: { kontaktId: string }[]): Map<string, number> {
  const anzahl = new Map<string, number>();
  for (const inv of investments) anzahl.set(inv.kontaktId, (anzahl.get(inv.kontaktId) ?? 0) + 1);
  return anzahl;
}

/** Ein Investment ab Reservierung, für das kein Kaufpreis hinterlegt ist. */
export interface KaufpreisFehlt {
  investmentId: string;
  kontaktId: string;
  stufe: string;
}

/**
 * Investments ab Reservierung ohne Kaufpreis.
 *
 * Einen Kaufpreis gibt es erst ab der Objektauswahl. Fehlt er ab der
 * Reservierung noch, ließen Abrechnung und Provisionskurve das Geschäft bis
 * zum 04.10.2026 wortlos aus. Jetzt erscheint es als „Kaufpreis fehlt“.
 * Stornierte und verlorene zählen nicht, ebenso wenig archivierte oder
 * gelöschte Kontakte. `investments` muss alle Investments enthalten, damit
 * die Zahl je Kontakt stimmt.
 */
export function investmentsOhneKaufpreis(
  investments: { id: string; kontaktId: string; pipelineStufe?: string | null }[],
  kontakteById: Map<string, { archiviert?: boolean; geloescht?: boolean; kaufpreis?: number | null; pipelineStufe?: string | null; status?: string | null }>,
  kaufpreisVon: (investmentId: string) => number,
): KaufpreisFehlt[] {
  const jeKontakt = investmentsJeKontakt(investments);
  const fehlt: KaufpreisFehlt[] = [];
  for (const inv of investments) {
    if (!istProvisionsrelevant(inv.pipelineStufe)) continue;
    if (istStorniert(inv)) continue;
    const k = kontakteById.get(inv.kontaktId);
    if (!k || k.archiviert || k.geloescht || istStorniert(k)) continue;
    if (kaufpreisMitRueckfall(kaufpreisVon(inv.id), k.kaufpreis, jeKontakt.get(inv.kontaktId) ?? 0) > 0) continue;
    fehlt.push({ investmentId: inv.id, kontaktId: inv.kontaktId, stufe: String(inv.pipelineStufe || "") });
  }
  return fehlt;
}
