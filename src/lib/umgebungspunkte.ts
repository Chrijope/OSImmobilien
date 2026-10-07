import { istGemessen, HERKUNFT_HINWEIS_LEER, HERKUNFT_HINWEIS_MIKROLAGE, type StandortAnalyse } from "@/lib/standortanalyse";

/**
 * Die Punkte der Umgebung für Karte und Lagekasten (Christian, 24.09.2026).
 *
 * „Auf der Karte das Objekt als Pinnadel, dazu die Punkte der Umgebung,
 * farbig nach Kategorie. Rechts daneben nach Kategorien geordnet, je
 * Kategorie die nächsten fünf bis zehn Punkte mit Entfernung.“ Gezeigt auf
 * Objektseite, Einheitenseite, in der Kundenansicht und im Exposé, alles aus
 * derselben gemessenen Standortanalyse (`meta.standortanalyse`, schema 2).
 *
 * Diese Datei ist die eine Stelle, die aus den Listen der Messung die
 * Kategorien der Anzeige macht. Die Komponenten (`components/umgebung/*`)
 * zeichnen nur.
 *
 * DIE KATEGORIEN
 *
 *   Mikrolage, auf der Karte und in der Liste:
 *     Einkaufen, Freizeit, Parks und Grün, Bus und Bahn, Öffentliche
 *     Einrichtungen (Kitas, Schulen, Ärzte, Apotheken, Behörden). Ärzte
 *     nur im CRM, siehe `NUR_INTERN_LISTEN`.
 *   Makrolage, nur in der Liste:
 *     Hochschulen, Krankenhäuser. Orte in zehn Kilometern zögen den
 *     Kartenausschnitt so weit auf, dass von der Straße nichts mehr zu
 *     erkennen wäre.
 *
 * Gewerbeflächen kommen nie hinein: Benannte Flächen sind oft einzelne
 * Betriebe und läsen sich wie eine Arbeitgeberliste.
 *
 * ÄLTERE MESSUNGEN
 *
 * Bis zur Messfassung 3 standen Parks unter `freizeit` mit `typ: "Park"`,
 * und `parks` und `behoerden` gab es nicht. Ein Park aus `freizeit` landet
 * deshalb ebenfalls unter „Parks und Grün“. Fehlt eine Liste, fehlt die
 * Kategorie; erfunden wird nichts.
 */

export type UmgebungKategorieId = "einkaufen" | "freizeit" | "gruen" | "verkehr" | "einrichtungen" | "hochschulen" | "kliniken";

/** Die Listen der Messung (`meta.standortanalyse.mikrolage`), die hier gelesen werden. */
type Quelle = "einkaufen" | "freizeit" | "parks" | "oepnv" | "kindergaerten" | "schulen" | "aerzte" | "apotheken" | "behoerden" | "hochschulen" | "kliniken";

export interface UmgebungsPunkt {
  name: string;
  /** Etwa „Supermarkt“, „Bus“ oder „Grundschule“, aus der Messung. */
  art: string;
  /** Luftlinie in Metern, gemessen. */
  entfernungMeter: number;
  gehminuten: number;
  /** Lage des Orts. Ohne sie steht der Ort nur in der Liste, nicht auf der Karte. */
  lat?: number;
  lng?: number;
}

/** Eine Liste innerhalb einer Kategorie, etwa „Schulen“ unter „Öffentliche Einrichtungen“. */
export interface UmgebungsListe {
  id: string;
  titel: string;
  punkte: UmgebungsPunkt[];
}

export interface UmgebungsKategorie {
  id: UmgebungKategorieId;
  titel: string;
  /** Farbe der Punkte auf der Karte, in der Legende und in der Liste. */
  farbe: string;
  ebene: "mikro" | "makro";
  /** Nur Listen mit mindestens einem Ort. Eine Kategorie ohne Liste fällt ganz weg. */
  listen: UmgebungsListe[];
}

export interface Umgebung {
  /** Lage des Messpunkts, Mitte der Karte. */
  zentrum: { lat: number; lng: number };
  /** Ab wo gemessen wurde. Bei „plz“ und „ort“ ist die Nadel nicht das Haus. */
  genauigkeit: "adresse" | "strasse" | "plz" | "ort";
  /** Nur Kategorien mit mindestens einem Ort, in fester Reihenfolge. */
  kategorien: UmgebungsKategorie[];
  /** Kein einziger Ort in der ganzen Messung. */
  leer: boolean;
  /**
   * Wurden Hochschulen und Krankenhäuser gemessen? Messungen vor der
   * Fassung 2 kannten sie nicht; dann heißt eine leere Makrolage „nicht
   * gemessen“ und nicht „keine vorhanden“.
   */
  makroGemessen: boolean;
  /** Herkunftssatz mit der Angabe, ab wo gemessen wurde. */
  hinweis: string;
  gemessenAm?: string;
}

interface ListenVorgabe {
  id: string;
  titel: string;
  quellen: Quelle[];
  /** Höchstzahl in dieser Liste, die nächstgelegenen zuerst. */
  max: number;
  /** Ersatzbeschriftung, wenn die Messung keinen Typ mitliefert. */
  art: string;
}

interface KategorieVorgabe {
  id: UmgebungKategorieId;
  titel: string;
  farbe: string;
  ebene: "mikro" | "makro";
  listen: ListenVorgabe[];
}

/** Höchstens so viele Orte je Kategorie mit nur einer Liste. */
export const PUNKTE_JE_KATEGORIE = 10;

/** Höchstens so viele je Liste in „Öffentliche Einrichtungen“ und in der Makrolage. */
export const PUNKTE_JE_TEILLISTE = 5;

/*
 * Die Farben sind auf den hellen Kartenbildern von OpenStreetMap gut zu
 * unterscheiden und tragen je einen weißen Rand. Blau für Einkaufen und Grün
 * für Erholung wie bisher in der Mikrolage des Exposés, das Violett der
 * Makrolage wie im Lagekasten.
 */
export const UMGEBUNG_KATEGORIEN: KategorieVorgabe[] = [
  {
    id: "einkaufen", titel: "Einkaufen", farbe: "#15724F", ebene: "mikro",
    listen: [{ id: "einkaufen", titel: "Einkaufen", quellen: ["einkaufen"], max: PUNKTE_JE_KATEGORIE, art: "Einkaufen" }],
  },
  {
    id: "freizeit", titel: "Freizeit", farbe: "#d6336c", ebene: "mikro",
    listen: [{ id: "freizeit", titel: "Freizeit", quellen: ["freizeit"], max: PUNKTE_JE_KATEGORIE, art: "Freizeit" }],
  },
  {
    id: "gruen", titel: "Parks und Grün", farbe: "#2e9468", ebene: "mikro",
    listen: [{ id: "gruen", titel: "Parks und Grün", quellen: ["parks", "freizeit"], max: PUNKTE_JE_KATEGORIE, art: "Park" }],
  },
  {
    id: "verkehr", titel: "Bus und Bahn", farbe: "#5f3dc4", ebene: "mikro",
    listen: [{ id: "verkehr", titel: "Bus und Bahn", quellen: ["oepnv"], max: PUNKTE_JE_KATEGORIE, art: "Haltestelle" }],
  },
  {
    id: "einrichtungen", titel: "Öffentliche Einrichtungen", farbe: "#c77d12", ebene: "mikro",
    listen: [
      { id: "kitas", titel: "Kitas", quellen: ["kindergaerten"], max: PUNKTE_JE_TEILLISTE, art: "Kindergarten" },
      { id: "schulen", titel: "Schulen", quellen: ["schulen"], max: PUNKTE_JE_TEILLISTE, art: "Schule" },
      { id: "aerzte", titel: "Ärzte", quellen: ["aerzte"], max: PUNKTE_JE_TEILLISTE, art: "Arztpraxis" },
      { id: "apotheken", titel: "Apotheken", quellen: ["apotheken"], max: PUNKTE_JE_TEILLISTE, art: "Apotheke" },
      { id: "behoerden", titel: "Behörden und Ämter", quellen: ["behoerden"], max: PUNKTE_JE_TEILLISTE, art: "Behörde" },
    ],
  },
  {
    id: "hochschulen", titel: "Hochschulen", farbe: "#6d5fb3", ebene: "makro",
    listen: [{ id: "hochschulen", titel: "Hochschulen", quellen: ["hochschulen"], max: PUNKTE_JE_TEILLISTE, art: "Hochschule" }],
  },
  {
    id: "kliniken", titel: "Krankenhäuser", farbe: "#6d5fb3", ebene: "makro",
    listen: [{ id: "kliniken", titel: "Krankenhäuser", quellen: ["kliniken"], max: PUNKTE_JE_TEILLISTE, art: "Krankenhaus" }],
  },
];

/** Gehminuten bei etwa 80 Metern je Minute, mindestens eine. Dieselbe Rechnung wie in `exposeInhalt.ts`. */
function gehminuten(meter: number): number {
  if (!Number.isFinite(meter) || meter <= 0) return 1;
  return Math.max(1, Math.ceil(meter / 80));
}

const endlich = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const GENAUIGKEITEN = ["adresse", "strasse", "plz", "ort"] as const;

/** Ist dieser Ort aus `freizeit` ein Park? Nur ältere Messungen tragen Parks dort. */
const istPark = (typ: string) => typ.trim().toLowerCase() === "park";

/**
 * Die Punkte einer Liste, gelesen wie Fremddaten: Ohne Namen oder ohne
 * Entfernung fällt ein Ort heraus, eine Koordinate ohne Zahl wird keine
 * Pinnadel. Derselbe Ort in zwei Quellen (etwa ein Park in `parks` und in
 * einer älteren `freizeit`) steht nur einmal da.
 */
function punkteDerListe(mikro: Record<string, unknown>, liste: ListenVorgabe, kategorie: UmgebungKategorieId): UmgebungsPunkt[] {
  const punkte: UmgebungsPunkt[] = [];
  const gesehen = new Set<string>();
  for (const quelle of liste.quellen) {
    const orte = Array.isArray(mikro[quelle]) ? (mikro[quelle] as unknown[]) : [];
    for (const roh of orte) {
      const o = (roh && typeof roh === "object" ? roh : {}) as Record<string, unknown>;
      const name = typeof o.name === "string" ? o.name.trim() : "";
      if (!name || !endlich(o.entfernung_m) || o.entfernung_m < 0) continue;
      const typ = typeof o.typ === "string" && o.typ.trim() ? o.typ.trim() : "";
      // Parks aus älteren Messungen: unter Freizeit raus, unter Grün hinein.
      if (quelle === "freizeit" && kategorie === "freizeit" && istPark(typ)) continue;
      if (quelle === "freizeit" && kategorie === "gruen" && !istPark(typ)) continue;
      const schluessel = `${name.toLowerCase()}|${o.entfernung_m}`;
      if (gesehen.has(schluessel)) continue;
      gesehen.add(schluessel);
      punkte.push({
        name,
        art: typ || liste.art,
        entfernungMeter: o.entfernung_m,
        gehminuten: gehminuten(o.entfernung_m),
        ...(endlich(o.lat) && endlich(o.lng) ? { lat: o.lat, lng: o.lng } : {}),
      });
    }
  }
  punkte.sort((x, y) => x.entfernungMeter - y.entfernungMeter);
  return punkte.slice(0, liste.max);
}

/**
 * Die Umgebung aus der gespeicherten Analyse. Nur eine gemessene Analyse
 * (schema 2) mit Mittelpunkt zählt; ohne sie gibt es `undefined`, und die
 * Seite zeigt den ehrlichen Leerzustand statt erfundener Punkte.
 */
export function umgebungAusAnalyse(analyse: unknown): Umgebung | undefined {
  if (!istGemessen(analyse)) return undefined;
  const a = analyse as StandortAnalyse & { genauigkeit?: unknown; messfassung?: unknown };
  const zentrum = a.objekt_koordinaten;
  if (!zentrum || !endlich(zentrum.lat) || !endlich(zentrum.lng)) return undefined;
  const mikro = (a.mikrolage && typeof a.mikrolage === "object" ? a.mikrolage : {}) as Record<string, unknown>;

  const kategorien: UmgebungsKategorie[] = [];
  for (const vorgabe of UMGEBUNG_KATEGORIEN) {
    const listen = vorgabe.listen
      .map((l) => ({ id: l.id, titel: l.titel, punkte: punkteDerListe(mikro, l, vorgabe.id) }))
      .filter((l) => l.punkte.length > 0);
    if (listen.length > 0) kategorien.push({ id: vorgabe.id, titel: vorgabe.titel, farbe: vorgabe.farbe, ebene: vorgabe.ebene, listen });
  }

  const leer = kategorien.length === 0;
  const hatMakro = Array.isArray(mikro.hochschulen) && mikro.hochschulen.length > 0
    || Array.isArray(mikro.kliniken) && mikro.kliniken.length > 0;
  const genauigkeit = GENAUIGKEITEN.includes(a.genauigkeit as (typeof GENAUIGKEITEN)[number])
    ? (a.genauigkeit as Umgebung["genauigkeit"])
    : "adresse";
  return {
    zentrum: { lat: zentrum.lat, lng: zentrum.lng },
    genauigkeit,
    kategorien,
    leer,
    makroGemessen: hatMakro || (endlich(a.messfassung) && a.messfassung >= 2),
    /*
     * Der gespeicherte Satz der Messung sagt, ab wo gemessen wurde („ab der
     * Ortsmitte“). Er bleibt immer sichtbar, damit niemand eine Entfernung ab
     * der Ortsmitte für eine ab der Haustür hält.
     */
    hinweis: leer ? HERKUNFT_HINWEIS_LEER : (typeof a.mikrolage_hinweis === "string" && a.mikrolage_hinweis.trim()) || HERKUNFT_HINWEIS_MIKROLAGE,
    ...(typeof a.gemessen_am === "string" ? { gemessenAm: a.gemessen_am } : {}),
  };
}

/** Ein Punkt auf der Karte, mit der Farbe seiner Kategorie. */
export interface KartenPunkt {
  kategorie: UmgebungKategorieId;
  farbe: string;
  name: string;
  art: string;
  meter: number;
  minuten: number;
  lat: number;
  lng: number;
}

/** Die Punkte der Mikrolage mit Lage, fertig für die Karte. Die Makrolage bleibt draußen. */
export function kartenPunkte(umgebung: Umgebung | undefined): KartenPunkt[] {
  const punkte: KartenPunkt[] = [];
  for (const k of umgebung?.kategorien ?? []) {
    if (k.ebene !== "mikro") continue;
    for (const l of k.listen) {
      for (const p of l.punkte) {
        if (p.lat === undefined || p.lng === undefined) continue;
        punkte.push({ kategorie: k.id, farbe: k.farbe, name: p.name, art: p.art, meter: p.entfernungMeter, minuten: p.gehminuten, lat: p.lat, lng: p.lng });
      }
    }
  }
  return punkte;
}

/** Die Einträge der Legende: nur Kategorien, die auf der Karte mindestens einen Punkt haben. */
export function legende(punkte: KartenPunkt[]): Array<{ id: UmgebungKategorieId; titel: string; farbe: string }> {
  const da = new Set(punkte.map((p) => p.kategorie));
  return UMGEBUNG_KATEGORIEN.filter((k) => k.ebene === "mikro" && da.has(k.id)).map(({ id, titel, farbe }) => ({ id, titel, farbe }));
}

/** Bis zu dieser Luftlinie zählt ein Punkt zum ersten Kartenausschnitt. */
export const AUSSCHNITT_BIS_M = 1000;

/**
 * Die Punkte, auf die der erste Ausschnitt der Karte zielt.
 *
 * Mit zehn Orten je Kategorie liegt ein Bahnhof oft fünf Kilometer weit weg.
 * Passte die Karte auf alle Punkte, wäre vom Haus und seiner Straße nichts
 * mehr zu sehen. Deshalb nur die Punkte im Umkreis von `AUSSCHNITT_BIS_M`,
 * und wenn das weniger als vier sind, die sechs nächsten. Die übrigen
 * stehen trotzdem auf der Karte, sichtbar nach dem Herauszoomen.
 */
export function ausschnittPunkte(punkte: KartenPunkt[]): KartenPunkt[] {
  const nah = punkte.filter((p) => p.meter <= AUSSCHNITT_BIS_M);
  if (nah.length >= 4) return nah;
  return [...punkte].sort((a, b) => a.meter - b.meter).slice(0, 6);
}

/**
 * Listen, die nur im CRM stehen und nie an Kunden gehen (Christian,
 * 24.09.2026): Praxisnamen tragen oft Personennamen („Dr. med. …“). Die
 * öffentliche Positivliste (`_shared/expose-oeffentlich.ts`) lässt sie
 * deshalb gar nicht erst hinaus, und die PDFs, die an Kunden gehen, lassen
 * sie weg. Objektseite, Einheitenseite und das interne Exposé am Bildschirm
 * zeigen sie weiter.
 */
// Leer seit Christians Entscheidung vom 24.09.2026 (abends): Die Arztpraxen
// gehoeren zur Mikrolage und gehen auch an Kunden. Die Stelle bleibt, damit
// eine Liste bei Bedarf wieder mit einer Zeile nur intern gilt.
export const NUR_INTERN_LISTEN: readonly string[] = [];

/**
 * Die Umgebung ohne die Listen aus `NUR_INTERN_LISTEN`, für alles, was an
 * Kunden geht. Eine Kategorie ohne übrige Liste fällt ganz weg, damit keine
 * leere Überschrift stehen bleibt; ist danach nichts mehr übrig, gilt die
 * Umgebung als leer, mit dem ehrlichen Satz dazu.
 */
export function umgebungFuerKunden(umgebung: Umgebung | undefined): Umgebung | undefined {
  if (!umgebung) return undefined;
  const kategorien = umgebung.kategorien
    .map((k) => ({ ...k, listen: k.listen.filter((l) => !NUR_INTERN_LISTEN.includes(l.id)) }))
    .filter((k) => k.listen.length > 0);
  const leer = kategorien.length === 0;
  return { ...umgebung, kategorien, leer, hinweis: leer ? HERKUNFT_HINWEIS_LEER : umgebung.hinweis };
}

/** Farbe der Nadel des Objekts auf der Karte am Bildschirm und im PDF, dunkel und größer als die Punkte. */
export const OBJEKT_FARBE = "#182c3d";

/** Die Beschriftung der Nadel des Objekts: bei Messung ab Ortsmitte oder Postleitzahlgebiet ehrlich der Messpunkt. */
export function nadelBeschriftung(umgebung: Umgebung | undefined, titel: string): string {
  if (umgebung?.genauigkeit === "ort") return "Ortsmitte, ab hier gemessen";
  if (umgebung?.genauigkeit === "plz") return "Mitte des Postleitzahlgebiets, ab hier gemessen";
  return titel;
}

// ── Sätze für Leerzustand und Genauigkeit ────────────────────────────────

/** Der Satz, wenn noch keine Messung vorliegt. Beginnt wie seit jeher, damit er sich wiedererkennen lässt. */
export const UMGEBUNG_NICHT_GEMESSEN =
  "Die Auswertung der Umgebung liegt noch nicht vor. Sobald sie da ist, steht hier, was du in der Nähe findest: Einkaufen, Freizeit, Parks, Bus und Bahn, Kitas, Schulen, Apotheken und Behörden.";

/** Der Satz über der Liste, wenn nicht ab der Haustür gemessen wurde. */
export function genauigkeitHinweis(genauigkeit: Umgebung["genauigkeit"]): string {
  if (genauigkeit === "ort") return "Gemessen ab der Ortsmitte, nicht ab der Haustür. Die Entfernungen zeigen, was es im Ort gibt, nicht den Weg ab dem Haus.";
  if (genauigkeit === "plz") return "Gemessen ab der Mitte des Postleitzahlgebiets, nicht ab der Haustür. Die Entfernungen zeigen, was es in der Gegend gibt, nicht den Weg ab dem Haus.";
  if (genauigkeit === "strasse") return "Gemessen ab der Straße, die Hausnummer ist in OpenStreetMap nicht erfasst. Die Entfernungen stimmen deshalb nur ungefähr.";
  return "";
}

/** Der Vermerk am Objekt, wenn die Messung scheiterte (`FEHLER_META_SCHLUESSEL` in `standort-lauf.ts`). */
const FEHLER_SCHLUESSEL = "standortanalyseFehler";

/**
 * Ein Satz für den Leerzustand, wenn die letzte Messung an der Adresse
 * scheiterte. Nur im CRM: Dort kann jemand die Adresse am Objekt berichtigen,
 * danach misst das Nachholen von selbst neu.
 */
export function messFehlerHinweis(meta: unknown): string | undefined {
  const fehler = (meta && typeof meta === "object" ? (meta as Record<string, unknown>)[FEHLER_SCHLUESSEL] : undefined) as
    | { art?: unknown }
    | undefined;
  if (!fehler || typeof fehler !== "object") return undefined;
  if (fehler.art === "adresse") {
    return "Die Adresse ließ sich in OpenStreetMap nicht finden. Bitte die Adresse am Objekt prüfen, danach wird die Umgebung automatisch neu gemessen.";
  }
  if (fehler.art === "dienst") {
    return "Der letzte Messversuch scheiterte an einer Störung von OpenStreetMap. Er wird automatisch wiederholt.";
  }
  return undefined;
}
