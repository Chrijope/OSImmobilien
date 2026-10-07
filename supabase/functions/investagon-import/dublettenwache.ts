/**
 * Die Wache ueber den Bestand.
 *
 * `dubletten.ts` verhindert, dass NEUE Doppelgaenger entstehen: Findet der
 * Import zu einer Investagon-Kennung kein Objekt, sieht er zusaetzlich unter
 * Adresse, Postleitzahl und Titel nach und uebernimmt das vorhandene Objekt.
 *
 * Was dort fehlt, ist der Blick auf das, was schon liegt. Am 16.09.2026 kam
 * der eigene Investagon-Zugang von More Immo dazu, und weil dessen Kopien
 * derselben Haeuser fremde Kennungen tragen, lagen danach 35 Objekte doppelt
 * im CRM. Diese Datei sieht nach jedem Lauf den gesamten Bestand durch,
 * meldet jeden Fund und entfernt, wenn der Schalter es erlaubt, unter engen
 * Bedingungen den aelteren der beiden Doppelgaenger.
 *
 * Die Schluesselbildung kommt unveraendert aus `dubletten.ts`. Zwei
 * Schluessel nebeneinander waeren die schlimmste aller Loesungen: Der Schutz
 * vor neuen Dubletten und die Wache ueber die alten wuerden dasselbe Haus
 * verschieden beurteilen.
 *
 * ── Warum der Titel ueber alles entscheidet ────────────────────────────────
 *
 * Neun Paare im Bestand teilen sich die Adresse und sind trotzdem zwei echte
 * Angebote: dasselbe Haus in zwei Vermarktungsmodellen, etwa
 * "01. Hof, Ossecker Strasse 42 (Standard-Modell)" neben
 * "(All-inclusive-Modell)", dazu Co-Living und Bestandswohnungen in Wuerzburg.
 * Eine Regel, die nur die Adresse vergleicht, wuerde die Haelfte dieses
 * Angebots loeschen. Der Schluessel aus `dubletten.ts` enthaelt deshalb den
 * Titel, und die Normalisierung glaettet am Titel nur Schreibweise und
 * Umlaute, sie entfernt niemals den Zusatz in Klammern.
 */

import { hausSchluessel, slugsVon } from "./dubletten.ts";

/**
 * Hoechstens so viele Objekte verschwinden in einem Lauf.
 *
 * Der Import laeuft alle 15 Minuten. Bei drei Objekten je Lauf ist der
 * bekannte Rueckstand von 35 Paaren in knapp drei Stunden abgetragen, und
 * eine Regel, die sich irrt, hat bis zum ersten Bericht hoechstens drei
 * Objekte erwischt statt den halben Bestand. Der Rest wird gemeldet und im
 * naechsten Lauf erneut betrachtet, dann mit frischen Daten.
 */
export const HOECHSTENS_JE_LAUF = 3;

/**
 * Die Notbremse.
 *
 * Findet ein Lauf mehr als so viele entfernbare Objekte, wird nichts
 * entfernt, sondern nur gemeldet. Die Bereinigung nebenan bremst erst bei der
 * Haelfte des Bestands; das ist hier zu spaet, weil dort ein Ausfall der
 * Gegenseite die Ursache waere, hier aber ein Denkfehler in der Regel.
 * Bekannt sind 35 Paare. 60 laesst diesen Rueckstand durch und faengt alles
 * ab, was deutlich darueber liegt, denn dann stimmt die Regel nicht mehr.
 */
export const NOTBREMSE_KANDIDATEN = 60;

/** Ein Objekt mit allem, was die Wache zur Beurteilung braucht. */
export interface WacheObjekt {
  id: string;
  titel: string;
  adresse?: string | null;
  plz?: string | null;
  /** ISO-Datum. Fehlt es, wird nie entfernt: dann ist unklar, was aelter ist. */
  erstellt_am?: string | null;
  meta?: Record<string, unknown> | null;
  /** Einheiten insgesamt. */
  einheiten: number;
  /**
   * Einheiten, an denen ein Kunde haengt: `kunde_id`, `kunde_name`,
   * `reserviert_am` oder der Status reserviert beziehungsweise verkauft.
   */
  gebundeneEinheiten: number;
  /** Zeilen in `objekt_bilder`. */
  bilder: number;
  /** Zeilen in `objekt_dokumente`. */
  dokumente: number;
  beschreibung?: string | null;
  exklusivPartner?: string[] | null;
  highlights?: string[] | null;
  videoUrl?: string | null;
}

export interface Befund {
  /** Adresse, PLZ und Titel in Grundform. */
  schluessel: string;
  objekte: WacheObjekt[];
  /** Das Objekt, das gehen darf. `null`, solange eine Bedingung fehlt. */
  entfernen: WacheObjekt | null;
  /** Das Objekt, das an seiner Stelle bleibt. */
  behalten: WacheObjekt | null;
  /** Was gegen ein Entfernen spricht. Leer heisst: alle Bedingungen erfuellt. */
  hindernisse: string[];
}

/** Die Investagon-Hauptkennung, leer bei einem von Hand angelegten Objekt. */
function kennungVon(o: WacheObjekt): string {
  return slugsVon(o.meta)[0] || "";
}

/** Das Anlagedatum als Zahl. `null`, wenn es fehlt oder unlesbar ist. */
function angelegtAm(o: WacheObjekt): number | null {
  if (!o.erstellt_am) return null;
  const zeit = Date.parse(o.erstellt_am);
  return Number.isFinite(zeit) ? zeit : null;
}

/**
 * Was am aelteren Objekt haengt und am neueren fehlen wuerde.
 *
 * Zwischen einem Bild aus dem Import und einem von Hand hochgeladenen
 * unterscheidet die Datenbank nicht: beide sind eine Zeile in `objekt_bilder`
 * mit einer Adresse im selben Speicher. Statt zu raten, vergleicht die Wache
 * schlicht die Mengen. Hat das aeltere Objekt mehr, wird nicht entfernt,
 * sondern gemeldet. Das ist im Zweifel zu vorsichtig, und genau so soll es
 * sein: Ein Fund zu viel im Bericht kostet einen Blick, ein geloeschter
 * Handeintrag ist weg.
 */
function verlust(aelter: WacheObjekt, neuer: WacheObjekt): string[] {
  const verloren: string[] = [];
  if (aelter.bilder > neuer.bilder) {
    verloren.push(`${aelter.bilder} statt ${neuer.bilder} Bilder`);
  }
  if (aelter.dokumente > neuer.dokumente) {
    verloren.push(`${aelter.dokumente} statt ${neuer.dokumente} Dokumente`);
  }
  const partner = (aelter.exklusivPartner || []).filter(
    (p) => !(neuer.exklusivPartner || []).includes(p),
  );
  if (partner.length) verloren.push(`Exklusivpartner ${partner.join(", ")}`);
  const punkte = (aelter.highlights || []).filter(
    (h) => !(neuer.highlights || []).includes(h),
  );
  if (punkte.length) verloren.push(`${punkte.length} eigene Highlights`);
  if ((aelter.beschreibung || "").trim() && !(neuer.beschreibung || "").trim()) {
    verloren.push("Beschreibungstext");
  }
  if ((aelter.videoUrl || "").trim() && !(neuer.videoUrl || "").trim()) {
    verloren.push("Video");
  }
  return verloren;
}

/**
 * Eine Gruppe gleicher Schluessel beurteilen.
 *
 * Entfernt werden darf nur, wenn alle Bedingungen zugleich zutreffen. Fehlt
 * eine einzige, bleibt es beim Melden. Die Bedingungen stehen einzeln im
 * Code, damit im Bericht steht, welche gefehlt hat.
 */
export function beurteile(gruppe: WacheObjekt[]): Befund {
  const schluessel = hausSchluessel(gruppe[0]);
  const hindernisse: string[] = [];

  // (a) Genau zwei. Bei dreien ist unklar, welches das richtige Gegenstueck
  // ist, und ein falsches Paar wuerde das dritte Objekt zum Waisen machen.
  if (gruppe.length !== 2) {
    return {
      schluessel,
      objekte: gruppe,
      entfernen: null,
      behalten: null,
      hindernisse: [`${gruppe.length} Objekte mit demselben Schluessel`],
    };
  }

  // (f) Das aeltere geht. Begruendung aus den Daten: Bei sieben der 35 Paare
  // hat die neuere Fassung mehr Einheiten, bei keinem einzigen weniger.
  const zeiten = gruppe.map(angelegtAm);
  if (zeiten[0] === null || zeiten[1] === null) {
    hindernisse.push("Anlagedatum fehlt, Reihenfolge nicht bestimmbar");
  } else if (zeiten[0] === zeiten[1]) {
    hindernisse.push("gleiches Anlagedatum, kein aelteres Objekt bestimmbar");
  }
  const sortiert = zeiten[0] !== null && zeiten[1] !== null && zeiten[0] > zeiten[1]
    ? [gruppe[1], gruppe[0]]
    : [gruppe[0], gruppe[1]];
  const aelter = sortiert[0];
  const neuer = sortiert[1];

  // (b) Adresse, Postleitzahl und Titel. Der Schluessel aus `dubletten.ts`
  // ist leer, sobald eines der drei Felder fehlt, und ohne Schluessel kommt
  // eine Gruppe hier gar nicht erst an. Trotzdem ausdruecklich geprueft,
  // damit ein spaeterer Umbau des Schluessels nicht stillschweigend die
  // Bedingung aushebelt, an der die neun Modellvarianten haengen.
  if (!schluessel || gruppe.some((o) => hausSchluessel(o) !== schluessel)) {
    hindernisse.push("Adresse, PLZ oder Titel unvollstaendig");
  }

  // (c) Beide aus dem Import. Ein von Hand angelegtes Objekt wird nie
  // entfernt, auch dann nicht, wenn es wie eine Kopie aussieht.
  const ohneKennung = gruppe.filter((o) => !kennungVon(o));
  if (ohneKennung.length) {
    hindernisse.push(
      `${ohneKennung.length} Objekt(e) ohne Investagon-Kennung, von Hand angelegt`,
    );
  }

  // (d) Kein Kunde am Objekt, das gehen soll.
  if (aelter.gebundeneEinheiten > 0) {
    hindernisse.push(
      `${aelter.gebundeneEinheiten} Einheit(en) mit Kunde am aelteren Objekt`,
    );
  }

  // (e) Keine Handpflege, die im anderen fehlen wuerde.
  const verloren = verlust(aelter, neuer);
  if (verloren.length) {
    hindernisse.push(`ginge verloren: ${verloren.join("; ")}`);
  }

  // (f, zweiter Teil) Die Begruendung aus den Daten gilt fuer jeden Einzelfall
  // nachgeprueft: Hat ausgerechnet das aeltere Objekt mehr Einheiten, stimmt
  // die Annahme hier nicht, und dann wird nur gemeldet.
  if (aelter.einheiten > neuer.einheiten) {
    hindernisse.push(
      `das aeltere Objekt hat mehr Einheiten (${aelter.einheiten} zu ${neuer.einheiten})`,
    );
  }

  return {
    schluessel,
    objekte: sortiert,
    entfernen: hindernisse.length ? null : aelter,
    behalten: hindernisse.length ? null : neuer,
    hindernisse,
  };
}

/** Alle Gruppen mit mehr als einem Objekt je Schluessel. */
export function findeGruppen(objekte: WacheObjekt[]): WacheObjekt[][] {
  const nachSchluessel = new Map<string, WacheObjekt[]>();
  for (const o of objekte) {
    const schluessel = hausSchluessel(o);
    // Ohne vollstaendige Angaben kein Schluessel und damit kein Vergleich.
    // Lieber ein Fund weniger als ein falscher.
    if (!schluessel) continue;
    const bisher = nachSchluessel.get(schluessel) || [];
    bisher.push(o);
    nachSchluessel.set(schluessel, bisher);
  }
  return [...nachSchluessel.values()].filter((g) => g.length > 1);
}

export interface Plan {
  befunde: Befund[];
  /** Was in diesem Lauf tatsaechlich entfernt wuerde, nach allen Bremsen. */
  entfernen: Befund[];
  /** Gesetzt, wenn eine Bremse gegriffen hat. Dann ist `entfernen` leer. */
  notbremse: string | null;
  /** Kandidaten, die wegen der Obergrenze auf den naechsten Lauf warten. */
  vertagt: number;
}

/**
 * Aus dem Bestand einen Plan machen.
 *
 * Gemeldet wird immer alles. Was davon entfernt werden darf, entscheiden die
 * Bedingungen in `beurteile`, danach die Notbremse, danach die Obergrenze je
 * Lauf. Ob der Plan auch ausgefuehrt wird, entscheidet der Aufrufer.
 */
export function planeWache(objekte: WacheObjekt[]): Plan {
  const befunde = findeGruppen(objekte).map(beurteile);
  const kandidaten = befunde.filter((b) => b.entfernen !== null);
  if (kandidaten.length > NOTBREMSE_KANDIDATEN) {
    return {
      befunde,
      entfernen: [],
      notbremse:
        `${kandidaten.length} Objekte waeren entfernbar, erlaubt sind hoechstens ` +
        `${NOTBREMSE_KANDIDATEN}. Das sieht nach einem Fehler in der Regel aus. ` +
        "Nichts entfernt, alles gemeldet.",
      vertagt: kandidaten.length,
    };
  }
  return {
    befunde,
    entfernen: kandidaten.slice(0, HOECHSTENS_JE_LAUF),
    notbremse: null,
    vertagt: Math.max(0, kandidaten.length - HOECHSTENS_JE_LAUF),
  };
}

/** Ein Objekt in einer Zeile, wie es im Bericht steht. */
export function beschreibeObjekt(o: WacheObjekt): string {
  const teile = [
    `"${o.titel}"`,
    `${o.adresse || "ohne Adresse"}, ${o.plz || "ohne PLZ"}`,
    `angelegt ${o.erstellt_am ? o.erstellt_am.slice(0, 10) : "unbekannt"}`,
    `${o.einheiten} Einheiten`,
    `Kennung ${kennungVon(o) || "keine (Handarbeit)"}`,
    o.gebundeneEinheiten > 0
      ? `${o.gebundeneEinheiten} Einheiten mit Kunde`
      : "kein Kunde",
  ];
  return teile.join(" | ");
}

/**
 * Ein Fund im Bericht: beide Objekte und das Ergebnis der Pruefung.
 *
 * `istGeplant` sagt, ob dieser Fund in diesem Lauf an der Reihe ist. Ein
 * Objekt kann alle Bedingungen erfuellen und trotzdem warten, weil die
 * Obergrenze je Lauf schon erreicht ist.
 */
export function beschreibeBefund(befund: Befund, istGeplant: boolean): string {
  const zeilen = befund.objekte.map((o, i) =>
    `  ${i + 1}. ${beschreibeObjekt(o)}`
  );
  const ergebnis = befund.hindernisse.length
    ? `  -> nur gemeldet: ${befund.hindernisse.join("; ")}`
    : istGeplant
    ? `  -> entfernt wird "${befund.entfernen!.titel}" (${befund.entfernen!.id}), ` +
      `es bleibt "${befund.behalten!.titel}" (${befund.behalten!.id})`
    : `  -> entfernbar, wartet auf einen der naechsten Laeufe`;
  return [`Dublette ${befund.schluessel}`, ...zeilen, ergebnis].join("\n");
}
