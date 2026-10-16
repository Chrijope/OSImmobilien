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

export type RaumTyp = "zimmer" | "wohnen" | "schlafen" | "kueche" | "bad" | "flur" | "balkon" | "abstell";

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
  if (!waende.length) return null;
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
  };
}

/** Für den Kundenlink: ohne Bildadresse des Hintergrunds. */
export function planOhneHintergrund(plan: Grundriss3dPlan): Grundriss3dPlan {
  const { hintergrund: _h, ...rest } = plan;
  return rest;
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
  return rahmen(plan.waende.flatMap((w) => [w.a, w.b]));
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
