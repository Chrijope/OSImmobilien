import { aufWand, flaeche, laenge, leererPlan, neueId, RAUM_TYPEN, type Grundriss3dPlan, type Oeffnung, type Punkt, type Raum, type RaumTyp, type Wand } from "./plan";

/*
 * Aus der Antwort von `grundriss-erkennen` (Koordinaten 0 bis 1000 je
 * Bildachse) einen Plan in Metern machen (18.10.2026).
 *
 * Der Maßstab kommt, in dieser Rangfolge, aus
 *   1. den beschrifteten Maßketten (Median Meter je Bildpunkt),
 *   2. den beschrifteten Raumflächen (Summe m² gegen Summe Bildfläche),
 *   3. der Wohnfläche der Einheit aus dem CRM.
 * Ohne eins davon gibt es keinen Plan: Ein Grundriss in falscher Größe
 * wäre schlimmer als keiner.
 *
 * Die Koordinaten bleiben im Bildsystem (Ursprung oben links), damit der
 * Plan im Editor genau auf dem Bild liegt, das als Hintergrund mitkommt.
 */

export type MassstabQuelle = "massketten" | "raumflaechen" | "wohnflaeche";

export interface KiErgebnis {
  plan: Grundriss3dPlan;
  quelle: MassstabQuelle;
  /** Meter je Bildpunkt. */
  meterProPx: number;
}

const AUSSENWAND = 0.3;
const INNENWAND = 0.12;
/** Wandenden, die näher beieinander liegen, sind eine Ecke. */
const EINRASTEN_M = 0.2;

const zahl = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const liste = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x) => !!x && typeof x === "object") : []);

function median(werte: number[]): number {
  const s = [...werte].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Raumtyp aus der KI-Angabe, sonst aus dem Namen. */
export function raumTypAus(typ: unknown, name: string): RaumTyp {
  if (typeof typ === "string" && RAUM_TYPEN.some((t) => t.id === typ) && typ !== "treppenhaus") return typ as RaumTyp;
  const n = name.toLowerCase();
  if (/bad|wc|dusche|sanit/.test(n)) return "bad";
  if (/k(ü|ue)che|kochen/.test(n)) return "kueche";
  if (/schlaf|eltern/.test(n)) return "schlafen";
  if (/wohn|ess/.test(n)) return "wohnen";
  if (/flur|diele|gang|eingang/.test(n)) return "flur";
  if (/balkon|loggia|terrasse/.test(n)) return "balkon";
  if (/abst|hwr|speis|ankleide/.test(n)) return "abstell";
  return "zimmer";
}

/**
 * Plan aus der rohen KI-Antwort. `breite`/`hoehe` sind die Maße des an die
 * KI geschickten Bildes in Bildpunkten. Zurück kommt `null`, wenn das Bild
 * kein Grundriss war, keine Wand übrig bleibt oder kein Maßstab zu finden ist.
 */
export function planAusKi(roh: unknown, bild: { breite: number; hoehe: number }, wohnflaecheQm?: number): KiErgebnis | null {
  if (!roh || typeof roh !== "object" || (roh as { keinGrundriss?: unknown }).keinGrundriss === true) return null;
  if (!(bild.breite > 0) || !(bild.hoehe > 0)) return null;
  const r = roh as Record<string, unknown>;
  // Normiert 0..1000 je Achse in Bildpunkte.
  const px = (x: unknown, y: unknown): Punkt | null => (zahl(x) && zahl(y) ? { x: (x / 1000) * bild.breite, y: (y / 1000) * bild.hoehe } : null);

  const linien = liste(r.waende).map((w) => ({ a: px(w.x1, w.y1), b: px(w.x2, w.y2), aussen: w.aussen === true }))
    .filter((w): w is { a: Punkt; b: Punkt; aussen: boolean } => !!w.a && !!w.b && laenge(w.a, w.b) > 1);
  if (!linien.length) return null;

  const raeumePx = liste(r.raeume).map((x) => {
    const punkte = (Array.isArray(x.punkte) ? x.punkte : [])
      .map((p) => (Array.isArray(p) ? px(p[0], p[1]) : null))
      .filter((p): p is Punkt => !!p);
    const name = typeof x.name === "string" && x.name.trim() ? x.name.trim().slice(0, 40) : "Raum";
    return { name, typ: raumTypAus(x.typ, name), punkte, qm: zahl(x.flaecheQm) && x.flaecheQm > 0 ? x.flaecheQm : null };
  }).filter((x) => x.punkte.length >= 3 && flaeche(x.punkte) > 1);

  /* ── Maßstab ── */
  let meterProPx = 0;
  let quelle: MassstabQuelle | null = null;
  const ketten = liste(r.massketten)
    .map((k) => { const a = px(k.x1, k.y1), b = px(k.x2, k.y2); return a && b && zahl(k.meter) && k.meter > 0.3 && k.meter < 60 ? k.meter / laenge(a, b) : 0; })
    .filter((v) => v > 0 && Number.isFinite(v));
  if (ketten.length) {
    meterProPx = median(ketten);
    quelle = "massketten";
  } else {
    const beschriftet = raeumePx.filter((x) => x.qm);
    const qm = beschriftet.reduce((s, x) => s + (x.qm ?? 0), 0);
    const pxFlaeche = beschriftet.reduce((s, x) => s + flaeche(x.punkte), 0);
    if (qm > 0 && pxFlaeche > 0) {
      meterProPx = Math.sqrt(qm / pxFlaeche);
      quelle = "raumflaechen";
    } else if (wohnflaecheQm && wohnflaecheQm > 0) {
      // Balkone zählen in der Wohnfläche nur zur Hälfte, wie in `wohnflaeche()`.
      const pxWohn = raeumePx.reduce((s, x) => s + flaeche(x.punkte) * (x.typ === "balkon" ? 0.5 : 1), 0);
      if (pxWohn > 0) {
        meterProPx = Math.sqrt(wohnflaecheQm / pxWohn);
        quelle = "wohnflaeche";
      }
    }
  }
  // Eine Wohnung zwischen 3 und 80 m Kantenlänge; alles andere ist ein Lesefehler.
  const kante = Math.max(bild.breite, bild.hoehe) * meterProPx;
  if (!quelle || !(kante > 3 && kante < 80)) return null;

  const m = (p: Punkt): Punkt => ({ x: p.x * meterProPx, y: p.y * meterProPx });

  /* ── Wände: Ecken zusammenziehen ── */
  const ecken: Punkt[] = [];
  const einrasten = (p: Punkt): Punkt => {
    const da = ecken.find((e) => laenge(e, p) < EINRASTEN_M);
    if (da) return da;
    ecken.push(p);
    return p;
  };
  const rund = (p: Punkt): Punkt => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 });
  const waende: Wand[] = [];
  for (const l of linien) {
    const a = rund(einrasten(m(l.a))), b = rund(einrasten(m(l.b)));
    if (laenge(a, b) < 0.3) continue;
    waende.push({ id: neueId("w"), a, b, dicke: l.aussen ? AUSSENWAND : INNENWAND });
  }
  if (!waende.length) return null;

  /* ── Türen und Fenster: an die nächste Wand ── */
  const oeffnungen: Oeffnung[] = [];
  for (const o of liste(r.oeffnungen)) {
    const a = px(o.x1, o.y1), b = px(o.x2, o.y2);
    if (!a || !b || (o.art !== "tuer" && o.art !== "fenster")) continue;
    const am = m(a), bm = m(b);
    const mitte = { x: (am.x + bm.x) / 2, y: (am.y + bm.y) / 2 };
    let beste: { wand: Wand; abstand: number; position: number } | null = null;
    for (const w of waende) {
      const t = aufWand(mitte, w);
      if (!beste || t.abstand < beste.abstand) beste = { wand: w, ...t };
    }
    if (!beste || beste.abstand > 0.5) continue;
    const wl = laenge(beste.wand.a, beste.wand.b);
    const breite = Math.min(Math.max(laenge(am, bm), o.art === "tuer" ? 0.7 : 0.5), 3, wl - 0.1);
    if (breite <= 0.3) continue;
    const position = Math.min(Math.max(beste.position, breite / 2), wl - breite / 2);
    oeffnungen.push({ id: neueId("o"), wandId: beste.wand.id, art: o.art, position: Math.round(position * 100) / 100, breite: Math.round(breite * 100) / 100 });
  }

  const raeume: Raum[] = raeumePx.map((x) => ({ id: neueId("r"), name: x.name, typ: x.typ, punkte: x.punkte.map((p) => rund(m(p))) }))
    .filter((x) => flaeche(x.punkte) >= 0.5);

  return { plan: { ...leererPlan(), waende, oeffnungen, raeume }, quelle, meterProPx };
}

/** Geschoss aus dem Schlüssel von `geschossSchluessel`: „eg“ 0, „og3“ 3, „ug“ −1. Dachgeschoss bleibt offen. */
export function geschossAusSchluessel(s: string | undefined): number | undefined {
  if (s === "eg") return 0;
  if (s === "ug") return -1;
  const og = s && /^og(\d+)$/.exec(s);
  return og ? Number(og[1]) : undefined;
}
