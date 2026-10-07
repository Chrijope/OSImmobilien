/**
 * Die Marktargumente der Objekttexte: erhobene Kennzahlen aus der
 * Standortdatenbank der Marktanalyse als Tatsachenzeilen.
 *
 * WARUM ES SIE GIBT
 *
 * Christian am 23.09.2026: Zusätzlich zu den fünf Standortargumenten aus der
 * gemessenen Umgebung sollen drei Marktargumente entstehen, die den Standort
 * aus Sicht der Marktanalyse beschreiben. Die Daten liegen in `standorte`,
 * `standort_kennzahlen` und `standort_arbeitgeber` (Migration 20260707132858),
 * geschrieben von `sync-destatis`, `sync-boris` und `enrich-arbeitgeber`.
 *
 * WIE EIN OBJEKT SEINEN STANDORT FINDET
 *
 * Am Objekt gibt es keinen Gemeindeschlüssel, nur Ort und Postleitzahl, und
 * `standorte` kennt keine Postleitzahl. Zugeordnet wird deshalb wie in
 * `src/lib/marktdatenStore.ts` über den Namen: erst genau, dann über den Kern
 * („Frankfurt“ zu „Frankfurt am Main“), aber nur, wenn der Kern eindeutig
 * ist. Sonst über die gemessene Lage des Objekts: der nächste Standort bis
 * `MARKT_NAEHE_KM`. Dann heißt die Zeile ausdrücklich „nächstgelegener
 * Standort“, samt Entfernung, damit der Text nicht so tut, als liege das
 * Objekt in dieser Stadt.
 *
 * NUR ERHOBENES
 *
 * Die Marktanalyse mischt Erhobenes mit Gerechnetem
 * (`src/lib/marktdatenHerkunft.ts`). Hierher kommt nur, was eine amtliche oder
 * gemessene Quelle hat: keine Schätzung (`bbsr_heuristik`, `ai`), kein
 * Bodenrichtwert „kaufpreis_x_0.35“, und die von einem Sprachmodell
 * zusammengestellte Arbeitgeberliste (`quelle: "ai"`) bleibt draußen, wie
 * schon bei den Standortargumenten (`HERKUNFT_HINWEIS_ARBEITGEBER`).
 *
 * Kaufpreis- und Mietniveau kommen bewusst nicht in die Liste: Ein Mietniveau
 * im Auftrag lädt das Modell zu einer Aussage über Mieteinnahmen ein, und
 * genau die ist verboten. Die Zahlen zeigt die Marktanalyse selbst.
 *
 * Reine Rechnung ohne Deno-Eigenheiten, getestet in
 * `src/lib/objektTexteMarkt.test.ts`.
 */

import { entfernungMeter, type Koordinate } from "./standort-messung.ts";

/** Bis zu dieser Luftlinie gilt ein Standort als „nächstgelegen“. */
export const MARKT_NAEHE_KM = 25;

/** Eine Zeile aus `standorte`, so weit sie hier gebraucht wird. */
export interface MarktStandort {
  id: string;
  name: string;
  bundesland?: string | null;
  lat?: unknown;
  lng?: unknown;
}

/** Eine Zeile aus `standort_kennzahlen`. */
export interface MarktKennzahl {
  standort_id?: string;
  kennzahl: string;
  wert: unknown;
  stand?: string | null;
  quelle_id?: string | null;
  meta?: unknown;
}

/** Eine Zeile aus `standort_arbeitgeber`. */
export interface MarktArbeitgeber {
  standort_id?: string;
  name: string;
  branche?: string | null;
  mitarbeiter?: number | null;
  quelle?: string | null;
  quelle_id?: string | null;
  rang?: number | null;
}

/** Wie ein Objekt seinem Standort zugeordnet wurde. */
export type MarktZuordnung =
  /** Derselbe Ort. Mehrere Kandidaten nur bei doppelt geführtem Namen. */
  | { art: "ort"; kandidaten: MarktStandort[] }
  /** Der nächste Standort in der Nähe, mit Luftlinie in Kilometern. */
  | { art: "naehe"; kandidaten: MarktStandort[]; entfernungKm: number };

/** Quellen, die selbst nur schätzen. Dieselbe Liste wie `SCHAETZENDE_QUELLEN` im Browser. */
const SCHAETZENDE_QUELLEN = new Set(["bbsr_heuristik", "ai", "schaetzung"]);

/** Anzeigenamen der Quellen, sonst die Kennung in Großbuchstaben. */
const QUELLEN_NAMEN: Readonly<Record<string, string>> = {
  destatis: "Destatis",
  boris: "BORIS-D",
  ba: "Bundesagentur für Arbeit",
  bbsr: "BBSR",
  osm: "OpenStreetMap",
  ihk: "Unternehmensregister",
  bmdv: "BMDV",
};

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Ein Ortsname in vergleichbarer Form: klein, Umlaute ausgeschrieben, Satzzeichen
 * weg. Der Zusatz in Klammern bleibt als Wort stehen, sonst wäre „Frankfurt
 * (Oder)“ dasselbe wie „Frankfurt“. Den Zusatz lässt erst `ortKern` fallen.
 */
export function normalisiereOrt(name: unknown): string {
  return text(name)
    .normalize("NFC")
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/\bst\.\s*/g, "sankt ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Der Kern eines Ortsnamens: vor Klammer, Bindestrich oder Komma und vor
 * Zusätzen wie „am Main“ oder „an der Oder“. „Augsburg-Göggingen“ wird zu
 * „augsburg“, „Frankfurt am Main“ zu „frankfurt“.
 */
export function ortKern(name: unknown): string {
  const vorTrenner = text(name).split(/[(,/]|\s-\s|-/)[0];
  return normalisiereOrt(vorTrenner).split(/ (?:am|an der|an|im|in der|in|ob der|ob|bei|a|i|v d) /)[0].trim();
}

function koordinateVon(s: MarktStandort): Koordinate | undefined {
  const lat = Number(s.lat);
  const lng = Number(s.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0) ? { lat, lng } : undefined;
}

/**
 * Den Standort der Marktanalyse zu einem Objekt finden.
 *
 * `koordinate` ist die gemessene Lage des Objekts, falls es eine gibt. Ohne
 * sie bleibt es beim Namen.
 */
export function findeMarktStandorte(
  standorte: MarktStandort[] | null | undefined,
  objekt: { ort?: unknown },
  koordinate?: Koordinate | null,
): MarktZuordnung | undefined {
  const liste = (standorte || []).filter((s) => s && typeof s.id === "string" && text(s.name));
  const ort = normalisiereOrt(objekt.ort);

  if (ort) {
    const genau = liste.filter((s) => normalisiereOrt(s.name) === ort);
    if (genau.length > 0) return { art: "ort", kandidaten: genau };

    const kern = ortKern(objekt.ort);
    if (kern) {
      const ueberKern = liste.filter((s) => ortKern(s.name) === kern);
      const namen = new Set(ueberKern.map((s) => normalisiereOrt(s.name)));
      // Nur eindeutig: „Frankfurt“ passt auf zwei Städte, dann entscheidet die Lage.
      if (ueberKern.length > 0 && namen.size === 1) return { art: "ort", kandidaten: ueberKern };
    }
  }

  if (!koordinate) return undefined;
  let naechster: { s: MarktStandort; km: number } | undefined;
  for (const s of liste) {
    const k = koordinateVon(s);
    if (!k) continue;
    const km = entfernungMeter(koordinate, k) / 1000;
    if (!naechster || km < naechster.km) naechster = { s, km };
  }
  if (!naechster || naechster.km > MARKT_NAEHE_KM) return undefined;
  return { art: "naehe", kandidaten: [naechster.s], entfernungKm: Math.max(1, Math.round(naechster.km)) };
}

/** Ist diese Kennzahl erhoben, nicht geschätzt? Dieselbe Regel wie `kennzahlHerkunft` im Browser. */
export function istErhobeneKennzahl(k: Pick<MarktKennzahl, "quelle_id" | "meta" | "wert">): boolean {
  const quelle = text(k.quelle_id);
  if (!quelle || SCHAETZENDE_QUELLEN.has(quelle)) return false;
  if (!Number.isFinite(Number(k.wert)) || k.wert === null || k.wert === "") return false;
  const meta = k.meta && typeof k.meta === "object" && !Array.isArray(k.meta) ? (k.meta as Record<string, unknown>) : {};
  if ("methode" in meta) {
    const methode = text(meta.methode);
    if (methode && methode !== "wfs" && methode !== "api") return false;
  }
  return true;
}

/** Ist dieser Arbeitgeber aus einer echten Quelle? Die KI-Liste nicht. */
export function istErhobenerArbeitgeber(a: MarktArbeitgeber): boolean {
  const quelle = text(a.quelle) || text(a.quelle_id);
  return !!text(a.name) && !!quelle && !SCHAETZENDE_QUELLEN.has(quelle) && !SCHAETZENDE_QUELLEN.has(text(a.quelle_id));
}

/**
 * Bei doppelt geführtem Namen den Kandidaten mit den meisten erhobenen
 * Kennzahlen nehmen. Der Seed führt etwa Bonn zweimal.
 */
export function waehleMarktStandort(zuordnung: MarktZuordnung, kennzahlen: MarktKennzahl[] | null | undefined): MarktStandort {
  if (zuordnung.kandidaten.length === 1) return zuordnung.kandidaten[0];
  const zahl = new Map<string, number>();
  for (const k of kennzahlen || []) {
    if (!k?.standort_id || !istErhobeneKennzahl(k)) continue;
    zahl.set(k.standort_id, (zahl.get(k.standort_id) || 0) + 1);
  }
  return [...zuordnung.kandidaten].sort((a, b) => (zahl.get(b.id) || 0) - (zahl.get(a.id) || 0))[0];
}

const zahlFormat = (wert: number, nachkomma = 0) =>
  new Intl.NumberFormat("de-DE", { maximumFractionDigits: nachkomma, minimumFractionDigits: 0 }).format(wert);

/** „07/2026“ aus einem ISO-Datum, sonst leer. */
function standText(stand: unknown): string {
  const t = text(stand);
  const treffer = /^(\d{4})-(\d{2})/.exec(t);
  return treffer ? `${treffer[2]}/${treffer[1]}` : "";
}

function quelleName(id: unknown): string {
  const t = text(id);
  return QUELLEN_NAMEN[t] ?? t.toUpperCase();
}

/** Die Kennzahlen, die in die Liste dürfen, mit Beschriftung und Einheit. */
const KENNZAHLEN: ReadonlyArray<{ schluessel: string[]; beschriftung: string; wert: (w: number) => string }> = [
  { schluessel: ["einwohner"], beschriftung: "Einwohner", wert: (w) => zahlFormat(w) },
  { schluessel: ["arbeitslosenquote_pct"], beschriftung: "Arbeitslosenquote", wert: (w) => `${zahlFormat(w, 1)} Prozent` },
  { schluessel: ["kaufkraft_index"], beschriftung: "Kaufkraftindex (Deutschland gleich 100)", wert: (w) => zahlFormat(w, 1) },
  {
    schluessel: ["kaufkraft_eur", "kaufkraft_pro_kopf_eur", "kaufkraft_je_einwohner_eur"],
    beschriftung: "Kaufkraft je Einwohner",
    wert: (w) => `${zahlFormat(w)} Euro`,
  },
  { schluessel: ["bip_pro_kopf_eur", "bip_pro_kopf"], beschriftung: "Bruttoinlandsprodukt je Einwohner", wert: (w) => `${zahlFormat(w)} Euro` },
  { schluessel: ["leerstand_pct"], beschriftung: "Leerstandsquote", wert: (w) => `${zahlFormat(w, 1)} Prozent` },
  { schluessel: ["bodenrichtwert_eur_qm"], beschriftung: "Bodenrichtwert", wert: (w) => `${zahlFormat(w)} Euro je m²` },
];

/** Je Kennzahl die erhobenen Zeilen dieses Standorts, neueste zuerst. */
function erhobeneJeKennzahl(kennzahlen: MarktKennzahl[], standortId: string): Map<string, MarktKennzahl[]> {
  const je = new Map<string, MarktKennzahl[]>();
  for (const k of kennzahlen || []) {
    if (!k || (k.standort_id && k.standort_id !== standortId) || !istErhobeneKennzahl(k)) continue;
    const liste = je.get(k.kennzahl) || [];
    liste.push(k);
    je.set(k.kennzahl, liste);
  }
  for (const liste of je.values()) liste.sort((a, b) => text(b.stand).localeCompare(text(a.stand)));
  return je;
}

/**
 * Die Einwohnerentwicklung, nur wenn zwei erhobene Stände mindestens ein
 * Jahr auseinanderliegen. Zwei Abrufe im selben Jahr sagen nichts über eine
 * Entwicklung.
 */
function einwohnerEntwicklung(zeilen: MarktKennzahl[] | undefined, stadt: string): string {
  if (!zeilen || zeilen.length < 2) return "";
  const neu = zeilen[0];
  const alt = zeilen[zeilen.length - 1];
  const tNeu = Date.parse(text(neu.stand));
  const tAlt = Date.parse(text(alt.stand));
  const wNeu = Number(neu.wert);
  const wAlt = Number(alt.wert);
  if (!Number.isFinite(tNeu) || !Number.isFinite(tAlt) || tNeu - tAlt < 365 * 86_400_000 || !(wAlt > 0)) return "";
  const prozent = ((wNeu - wAlt) / wAlt) * 100;
  const richtung = prozent >= 0 ? "plus" : "minus";
  return `Markt ${stadt}, Einwohnerentwicklung: von ${zahlFormat(wAlt)} (Stand ${standText(alt.stand)}) auf ${zahlFormat(wNeu)} (Stand ${standText(neu.stand)}), ${richtung} ${zahlFormat(Math.abs(prozent), 1)} Prozent (${quelleName(neu.quelle_id)})`;
}

/**
 * Die Tatsachenzeilen für die Marktargumente.
 *
 * Jede Zeile beginnt mit „Markt“, nennt die Stadt, die Quelle und den Stand.
 * Die Anweisung an das Modell verweist genau auf diese Zeilen. Ohne eine
 * einzige erhobene Angabe kommt eine leere Liste zurück, auch ohne Kopfzeile.
 */
export function marktQuellen(params: {
  standort: MarktStandort;
  zuordnung: MarktZuordnung;
  kennzahlen: MarktKennzahl[] | null | undefined;
  arbeitgeber?: MarktArbeitgeber[] | null;
}): string[] {
  const stadt = text(params.standort.name);
  if (!stadt) return [];
  const je = erhobeneJeKennzahl(params.kennzahlen || [], params.standort.id);
  const zeilen: string[] = [];

  for (const k of KENNZAHLEN) {
    const schluessel = k.schluessel.find((s) => je.has(s));
    if (!schluessel) continue;
    const neueste = je.get(schluessel)![0];
    const stand = standText(neueste.stand);
    zeilen.push(
      `Markt ${stadt}, ${k.beschriftung}: ${k.wert(Number(neueste.wert))} (${quelleName(neueste.quelle_id)}${stand ? `, Stand ${stand}` : ""})`,
    );
    if (schluessel === "einwohner") {
      const entwicklung = einwohnerEntwicklung(je.get("einwohner"), stadt);
      if (entwicklung) zeilen.push(entwicklung);
    }
  }

  const arbeitgeber = (params.arbeitgeber || [])
    .filter((a) => (!a.standort_id || a.standort_id === params.standort.id) && istErhobenerArbeitgeber(a))
    .sort((a, b) => (Number(a.rang) || 999) - (Number(b.rang) || 999) || (Number(b.mitarbeiter) || 0) - (Number(a.mitarbeiter) || 0))
    .slice(0, 5);
  if (arbeitgeber.length > 0) {
    const quellen = [...new Set(arbeitgeber.map((a) => quelleName(text(a.quelle) || a.quelle_id)))].join(", ");
    const liste = arbeitgeber.map((a) => {
      const zusatz = [
        text(a.branche),
        Number(a.mitarbeiter) > 0 ? `rund ${zahlFormat(Number(a.mitarbeiter))} Beschäftigte` : "",
      ].filter(Boolean).join(", ");
      return zusatz ? `${text(a.name)} (${zusatz})` : text(a.name);
    });
    zeilen.push(`Markt ${stadt}, große Arbeitgeber laut ${quellen}: ${liste.join("; ")}`);
  }

  if (zeilen.length === 0) return [];
  const land = text(params.standort.bundesland);
  const ort = `${stadt}${land ? ` (${land})` : ""}`;
  const kopf = params.zuordnung.art === "ort"
    ? `Markt, Standort der Marktanalyse: ${ort}, derselbe Ort wie das Objekt`
    : `Markt, nächstgelegener Standort der Marktanalyse: ${ort}, rund ${params.zuordnung.entfernungKm} km Luftlinie vom Objekt entfernt`;
  return [kopf, ...zeilen];
}
