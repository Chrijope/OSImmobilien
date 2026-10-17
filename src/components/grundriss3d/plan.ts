/**
 * Datenmodell des 3D-Grundrisses (seit 16.10.2026).
 *
 * Ein Plan je Einheit, gespeichert als JSON in `wohnungen.meta.grundriss3d`.
 * Alle Längen in Metern, Ursprung oben links, y wächst nach unten wie im
 * Bild. Das 3D-Modell entsteht erst beim Anzeigen aus diesem Plan, es wird
 * nichts Gerendertes gespeichert. Der Plan ist damit klein (wenige KB) und
 * lässt sich jederzeit neu darstellen, etwa mit anderer Wandhöhe.
 */

export const PLAN_VERSION = 1;

export interface Punkt { x: number; y: number }

export interface Wand {
  id: string;
  a: Punkt;
  b: Punkt;
  /** Wandstärke in Metern. Außenwand etwa 0,36, Innenwand 0,12. */
  dicke: number;
}

export type OeffnungArt = "tuer" | "fenster";

export interface Oeffnung {
  id: string;
  wandId: string;
  art: OeffnungArt;
  /** Abstand der Mitte vom Wandanfang `a`, in Metern. */
  position: number;
  breite: number;
}

export type RaumTyp = "zimmer" | "wohnen" | "schlafen" | "kueche" | "bad" | "flur" | "balkon" | "abstell" | "treppenhaus";

export interface Raum {
  id: string;
  name: string;
  typ: RaumTyp;
  /** Umriss im Uhrzeigersinn oder dagegen, mindestens drei Punkte. */
  punkte: Punkt[];
}

export interface Grundriss3dPlan {
  version: number;
  /** Der Plan als Bild, nur zum Nachzeichnen im Editor. */
  hintergrund?: { url: string; pxProMeter: number };
  waende: Wand[];
  oeffnungen: Oeffnung[];
  raeume: Raum[];
  /** Wohin Norden zeigt, Grad im Uhrzeigersinn ab „oben im Plan“. */
  nordWinkel: number;
  /** Geschoss im Haus, 0 = EG. Für die gestapelte Objektansicht. */
  geschoss?: number;
  /** Lage der Einheit im Geschoss, in Metern. Für die Objektansicht. */
  versatz?: Punkt;
  geaendertAm?: string;
  /**
   * Wände als Flächen statt als Linien (seit 17.10.2026): so kommen Pläne,
   * die aus CAD-Zeichnungen gelesen werden. Jede Wand ein Polygon mit
   * Löchern, Fenster und Türen als Lückenflächen, dazu die Deckenplatte.
   */
  flaechen?: Flaechen;
}

export type XY = [number, number];
export interface Flaechen {
  /** Je Wand: äußerer Ring, danach die Löcher. */
  waende: XY[][][];
  fenster: XY[][];
  tueren: XY[][];
  decke?: XY[][];
}

export const RAUM_TYPEN: Array<{ id: RaumTyp; name: string }> = [
  { id: "zimmer", name: "Zimmer" },
  { id: "wohnen", name: "Wohnen" },
  { id: "schlafen", name: "Schlafen" },
  { id: "kueche", name: "Küche" },
  { id: "bad", name: "Bad" },
  { id: "flur", name: "Flur" },
  { id: "balkon", name: "Balkon / Loggia" },
  { id: "abstell", name: "Abstellraum" },
  { id: "treppenhaus", name: "Treppenhaus" },
];

export const TUER_HOEHE = 2.01;
export const FENSTER_BRUESTUNG = 0.9;
export const FENSTER_HOEHE = 1.4;

export function leererPlan(): Grundriss3dPlan {
  return { version: PLAN_VERSION, waende: [], oeffnungen: [], raeume: [], nordWinkel: 0 };
}

let zaehler = 0;
export function neueId(praefix: string): string {
  zaehler += 1;
  return `${praefix}${Date.now().toString(36)}${zaehler.toString(36)}`;
}

/* ── Prüfen beim Lesen ─────────────────────────────────────────────── */

const zahl = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const punktOk = (p: unknown): p is Punkt => !!p && typeof p === "object" && zahl((p as Punkt).x) && zahl((p as Punkt).y);

/**
 * Plan aus `meta` lesen. Alles, was nicht passt, fällt weg statt die Ansicht
 * abstürzen zu lassen: Ein halb kaputter Plan zeigt dann eben weniger.
 * Ohne eine einzige Wand gilt der Plan als nicht vorhanden.
 */
export function planAusMeta(roh: unknown): Grundriss3dPlan | null {
  if (!roh || typeof roh !== "object" || Array.isArray(roh)) return null;
  const r = roh as Record<string, unknown>;
  const waende = (Array.isArray(r.waende) ? r.waende : []).filter((w): w is Wand =>
    !!w && typeof w.id === "string" && punktOk(w.a) && punktOk(w.b) && zahl(w.dicke) && w.dicke > 0 && laenge(w.a, w.b) > 0.01);
  const flaechen = flaechenAusMeta(r.flaechen);
  if (!waende.length && !flaechen) return null;
  const wandIds = new Set(waende.map((w) => w.id));
  const oeffnungen = (Array.isArray(r.oeffnungen) ? r.oeffnungen : []).filter((o): o is Oeffnung =>
    !!o && typeof o.id === "string" && wandIds.has(o.wandId) && (o.art === "tuer" || o.art === "fenster") && zahl(o.position) && zahl(o.breite) && o.breite > 0);
  const typen = new Set(RAUM_TYPEN.map((t) => t.id));
  const raeume = (Array.isArray(r.raeume) ? r.raeume : []).filter((x): x is Raum =>
    !!x && typeof x.id === "string" && typeof x.name === "string" && typen.has(x.typ) && Array.isArray(x.punkte) && x.punkte.length >= 3 && x.punkte.every(punktOk));
  const h = r.hintergrund as Grundriss3dPlan["hintergrund"] | undefined;
  return {
    version: zahl(r.version) ? r.version : PLAN_VERSION,
    ...(h && typeof h.url === "string" && zahl(h.pxProMeter) && h.pxProMeter > 0 ? { hintergrund: { url: h.url, pxProMeter: h.pxProMeter } } : {}),
    waende, oeffnungen, raeume,
    nordWinkel: zahl(r.nordWinkel) ? r.nordWinkel : 0,
    ...(zahl(r.geschoss) ? { geschoss: r.geschoss } : {}),
    ...(punktOk(r.versatz) ? { versatz: r.versatz } : {}),
    ...(typeof r.geaendertAm === "string" ? { geaendertAm: r.geaendertAm } : {}),
    ...(flaechen ? { flaechen } : {}),
  };
}

const xyOk = (p: unknown): p is XY => Array.isArray(p) && p.length === 2 && zahl(p[0]) && zahl(p[1]);
const ringOk = (r: unknown): r is XY[] => Array.isArray(r) && r.length >= 3 && r.every(xyOk);

function flaechenAusMeta(roh: unknown): Flaechen | null {
  if (!roh || typeof roh !== "object") return null;
  const r = roh as Record<string, unknown>;
  const waende = (Array.isArray(r.waende) ? r.waende : []).filter((w): w is XY[][] => Array.isArray(w) && w.length >= 1 && w.every(ringOk));
  if (!waende.length) return null;
  const liste = (v: unknown) => (Array.isArray(v) ? v : []).filter(ringOk);
  return { waende, fenster: liste(r.fenster), tueren: liste(r.tueren), ...(Array.isArray(r.decke) ? { decke: liste(r.decke) } : {}) };
}

/** Für den Kundenlink: ohne Bildadresse des Hintergrunds. */
export function planOhneHintergrund(plan: Grundriss3dPlan): Grundriss3dPlan {
  const { hintergrund: _h, ...rest } = plan;
  return rest;
}

/* ── Haus: Gebäudehülle je Objekt ──────────────────────────────────── */

/**
 * Die Hülle eines Hauses (seit 17.10.2026), gespeichert in
 * `objekte.meta.grundriss3dHaus`. Ein Regelgeschoss in Hauskoordinaten
 * (Meter): Außen- und Hofwände mit Fenstern, Treppenhäuser als Räume, dazu
 * Aufzüge, die über alle Geschosse gehen. Die Einheiten legen sich mit
 * `geschoss` und `versatz` hinein; wo eine Einheit liegt, tritt die Hülle
 * zurück. Geschosse ohne Einheitenplan bleiben als leere Hülle sichtbar.
 */
export interface HausPlan {
  version: number;
  /** Vollgeschosse von 0 (EG) bis `geschosse - 1`. */
  geschosse: number;
  huelle: Grundriss3dPlan;
  /** Umriss des Innenhofs, für Hofboden und Decke mit Loch. */
  hof?: Punkt[];
  aufzuege: Array<{ id: string; x: number; y: number; b: number; t: number }>;
  quelle?: string;
}

/** Seite eines rechteckigen Umrisses: oben = kleines y, links = kleines x. */
export type Seite = "oben" | "unten" | "links" | "rechts";

/**
 * Dachform aus Ansichten, Schnitt oder Fotos.
 * - flach: Dachplatte über jedem obersten Geschoss.
 * - sattel: über dem Umriss des obersten Geschosses; `first` ist die Richtung
 *   des Firsts (x = waagerecht im Plan). Das oberste Geschoss ist dann das
 *   Dachgeschoss: Seine Wände werden an den Dachflächen abgeschnitten.
 * - mansarde: Hausring mit Hof (Berliner Altbau): steile Flächen an den
 *   genannten Außenseiten und am Hof, oben flach.
 */
export type Dach =
  | { art: "flach"; farbe?: string }
  | { art: "sattel"; first: "x" | "y"; neigung: number; kniestock: number; farbe: string; ueberstand?: number }
  | { art: "walm"; neigung: number; kniestock: number; farbe: string; ueberstand?: number }
  | { art: "mansarde"; tiefe: number; hoehe: number; traufe: Seite[]; farbe: string; flach: string };

/**
 * Gaube oder Zwerchgiebel auf einem Sattel- oder Walmdach. `von` und `b`
 * entlang der Traufe in Hausmetern, `abstand` der Vorderwand zur
 * Außenwandflucht (0 = bündig), `hoehe` Oberkante Vorderwand über
 * Dachgeschossboden.
 */
export interface Gaube {
  seite: Seite;
  von: number;
  b: number;
  abstand: number;
  hoehe: number;
  art: "sattel" | "flach";
  /** Neigung des Gaubendachs in Grad (nur Sattel), Standard 45°. */
  neigung?: number;
  /** Fensterbreite; ohne Angabe Gaubenbreite minus 0,5 m. */
  fenster?: number;
}

/** Wie das Haus von außen aussieht, nach Fotos und Ansichten. */
export interface Aussehen {
  /** Putz- oder Klinkerfarbe der Außenwände. */
  fassade?: string;
  /** Erdgeschoss, wenn anders (Ladenzone, Sockel). */
  sockel?: string;
  /** Hoffassade, wenn anders als zur Straße. */
  hof?: string;
  /** Brandwände zum Nachbarhaus: unverputzt grau statt Fassadenfarbe. */
  brandwand?: { seiten: Seite[]; farbe: string };
  /** Straßenseite: Von dort schaut die Kamera zum Start aufs Haus. */
  strasse?: Seite;
  dach?: Dach;
  gauben?: Gaube[];
  /** Balkonplatten mit Geländer je Geschoss: Rechteck (x, y, Breite b in x, Tiefe t in y) in Hausmetern. */
  balkone?: Array<{ geschosse: number[]; x: number; y: number; b: number; t: number }>;
}

export function hausAusMeta(roh: unknown): HausPlan | null {
  if (!roh || typeof roh !== "object" || Array.isArray(roh)) return null;
  const r = roh as Record<string, unknown>;
  const huelle = planAusMeta(r.huelle);
  if (!huelle || !zahl(r.geschosse) || r.geschosse < 1 || r.geschosse > 40) return null;
  const aufzuege = (Array.isArray(r.aufzuege) ? r.aufzuege : []).filter((a): a is HausPlan["aufzuege"][number] =>
    !!a && typeof a.id === "string" && zahl(a.x) && zahl(a.y) && zahl(a.b) && zahl(a.t) && a.b > 0 && a.t > 0);
  const hof = Array.isArray(r.hof) && r.hof.length >= 3 && r.hof.every(punktOk) ? (r.hof as Punkt[]) : undefined;
  return {
    version: zahl(r.version) ? r.version : PLAN_VERSION, geschosse: Math.round(r.geschosse), huelle, aufzuege,
    ...(hof ? { hof } : {}), ...(typeof r.quelle === "string" ? { quelle: r.quelle } : {}),
  };
}

/** Die Pläne mehrerer Einheiten, etwa eines ganzen Hauses, mit „WE …“ als Titel. */
export function plaeneAusEinheiten(einheiten: Array<{ weNr: string; grundriss3d?: unknown }>): Array<{ plan: Grundriss3dPlan; titel: string }> {
  return einheiten
    .map((w) => ({ plan: planAusMeta(w.grundriss3d), titel: `WE ${w.weNr}` }))
    .filter((x): x is { plan: Grundriss3dPlan; titel: string } => !!x.plan);
}

/* ── Geometrie ─────────────────────────────────────────────────────── */

export function laenge(a: Punkt, b: Punkt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Fläche nach der Gaußschen Trapezformel, immer positiv. */
export function flaeche(punkte: Punkt[]): number {
  let s = 0;
  for (let i = 0; i < punkte.length; i++) {
    const p = punkte[i], q = punkte[(i + 1) % punkte.length];
    s += p.x * q.y - q.x * p.y;
  }
  return Math.abs(s) / 2;
}

export function gesamtFlaeche(plan: Grundriss3dPlan): number {
  return plan.raeume.reduce((s, r) => s + flaeche(r.punkte), 0);
}

/**
 * Wohnfläche nach Wohnflächenverordnung, vereinfacht: Balkone und Loggien
 * zählen zur Hälfte (üblich ist ein Viertel bis die Hälfte). Nur als
 * Orientierung, maßgeblich bleibt die Angabe aus Teilungserklärung und
 * Aufteilungsplan.
 */
export function wohnflaeche(plan: Grundriss3dPlan): number {
  return plan.raeume.reduce((s, r) => s + flaeche(r.punkte) * (r.typ === "balkon" ? 0.5 : 1), 0);
}

export function schwerpunkt(punkte: Punkt[]): Punkt {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < punkte.length; i++) {
    const p = punkte[i], q = punkte[(i + 1) % punkte.length];
    const k = p.x * q.y - q.x * p.y;
    a += k; cx += (p.x + q.x) * k; cy += (p.y + q.y) * k;
  }
  if (Math.abs(a) < 1e-9) return { x: punkte.reduce((s, p) => s + p.x, 0) / punkte.length, y: punkte.reduce((s, p) => s + p.y, 0) / punkte.length };
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

export function rahmen(punkte: Punkt[]): { minX: number; minY: number; maxX: number; maxY: number } {
  return {
    minX: Math.min(...punkte.map((p) => p.x)), minY: Math.min(...punkte.map((p) => p.y)),
    maxX: Math.max(...punkte.map((p) => p.x)), maxY: Math.max(...punkte.map((p) => p.y)),
  };
}

export function planRahmen(plan: Grundriss3dPlan) {
  const punkte = plan.waende.flatMap((w) => [w.a, w.b]);
  for (const w of plan.flaechen?.waende ?? []) for (const [x, y] of w[0]) punkte.push({ x, y });
  if (!punkte.length) for (const r of plan.raeume) punkte.push(...r.punkte);
  return punkte.length ? rahmen(punkte) : { minX: 0, minY: 0, maxX: 1, maxY: 1 };
}

export function punktInPolygon(p: Punkt, poly: Punkt[]): boolean {
  let drin = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) drin = !drin;
  }
  return drin;
}

/** Nächster Punkt auf einer Wand: Abstand und Lage ab `a` in Metern. */
export function aufWand(p: Punkt, w: Wand): { abstand: number; position: number } {
  const l = laenge(w.a, w.b);
  const ux = (w.b.x - w.a.x) / l, uy = (w.b.y - w.a.y) / l;
  const t = Math.max(0, Math.min(l, (p.x - w.a.x) * ux + (p.y - w.a.y) * uy));
  return { abstand: Math.hypot(w.a.x + ux * t - p.x, w.a.y + uy * t - p.y), position: t };
}

/* ── Maßstab ───────────────────────────────────────────────────────── */

/**
 * Neuer Maßstab aus einer bekannten Strecke. `strecke` ist in den aktuellen
 * Plan-Metern gemessen, also im alten Maßstab. Zurück kommt der neue
 * Maßstab und der Faktor, mit dem schon gezeichnete Teile skaliert werden
 * müssen, damit sie auf dem Bild liegen bleiben.
 */
export function massstabAusStrecke(altPxProMeter: number, strecke: number, wirklicheMeter: number): { pxProMeter: number; faktor: number } {
  if (!(strecke > 0) || !(wirklicheMeter > 0) || !(altPxProMeter > 0)) throw new Error("Strecke und Länge müssen größer als null sein.");
  const pixel = strecke * altPxProMeter;
  const pxProMeter = pixel / wirklicheMeter;
  return { pxProMeter, faktor: altPxProMeter / pxProMeter };
}

export function planSkalieren(plan: Grundriss3dPlan, faktor: number): Grundriss3dPlan {
  const s = (p: Punkt): Punkt => ({ x: p.x * faktor, y: p.y * faktor });
  return {
    ...plan,
    waende: plan.waende.map((w) => ({ ...w, a: s(w.a), b: s(w.b) })),
    oeffnungen: plan.oeffnungen.map((o) => ({ ...o, position: o.position * faktor, breite: o.breite * faktor })),
    raeume: plan.raeume.map((r) => ({ ...r, punkte: r.punkte.map(s) })),
  };
}

/* ── Räume ─────────────────────────────────────────────────────────── */

/**
 * Für die Möblierung: Aus „Zimmer“ wird das größte zu Wohnen, die übrigen
 * zu Schlafen. Bei nur einem Zimmer ist es Wohnen (Einzimmerwohnung mit
 * Schlafecke).
 */
export function wirksamerTyp(plan: Grundriss3dPlan, raum: Raum): RaumTyp {
  if (raum.typ !== "zimmer") return raum.typ;
  if (plan.raeume.some((r) => r.typ === "wohnen")) return "schlafen";
  const zimmer = plan.raeume.filter((r) => r.typ === "zimmer").sort((a, b) => flaeche(b.punkte) - flaeche(a.punkte));
  return zimmer[0]?.id === raum.id ? "wohnen" : "schlafen";
}

export function qm(v: number): string {
  return `${v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;
}

export function meter(v: number): string {
  return `${v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
}
