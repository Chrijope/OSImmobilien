import { WE03_PLAN, WE03_PX_PRO_METER } from "./beispielWe03";
import type { Aussehen, Grundriss3dPlan, HausPlan, Oeffnung, Punkt, Raum, Wand } from "./plan";

/*
 * Barfusstraße 9, 13349 Berlin (17.10.2026).
 *
 * Hülle aus der Flächenberechnung „BAR9 Vorplanung, Ausbau des
 * Dachgeschosses“ (23.10.2024, M 1:100): Eckhaus als Ring um den Innenhof,
 * Vorderhaus an der Straße, zwei Seitenflügel, Quergebäude an der
 * Grundstücksgrenze, vier Treppenhäuser, drei Aufzüge am Hof.
 *
 * Feinmaße aus den Einzelgrundrissen der Exposés (Seite 5): Vorderhaus
 * links (WE 03/07/11), Mitte links (WE 04/08/12), rechts (WE 06/10/14) im
 * 1. bis 3. OG. WE 06 ist der gespiegelte Zuschnitt von WE 03 (Achse
 * Treppenhaus), wie im Exposé zu sehen; Flächen können dadurch um bis zu
 * 1 m² von der Exposé-Angabe abweichen.
 *
 * Hauskoordinaten in Metern: x nach rechts (Straße rechts), y nach unten,
 * Ursprung oben links der Zeichnung. Die Einzelgrundrisse liegen in
 * „Bildmetern“ (Pixel / 87,5) und kommen mit VERSATZ ins Haus. Er ergibt
 * sich aus der Hofwand (x 32,58) und der Brandwand zu Nr. 11 (y 1,98).
 */

const VERSATZ: Punkt = { x: 30.43, y: 1.12 };
const p = (x: number, y: number): Punkt => ({ x: x / WE03_PX_PRO_METER, y: y / WE03_PX_PRO_METER });
const m = (px: number) => px / WE03_PX_PRO_METER;

/* ── Hülle ── */

const X0 = 0.46, X1 = 44.28, Y0 = 1.98, Y1 = 25.6;
const HOF: Punkt[] = [
  { x: 6.2, y: 6.17 }, { x: 31.88, y: 6.17 }, { x: 32.58, y: 7.8 },
  { x: 32.58, y: 19.78 }, { x: 31.88, y: 21.41 }, { x: 6.2, y: 21.41 },
];

/** Fenster in gleichem Abstand, wie bei einer Altbaufassade. */
function fensterReihe(w: Wand, abstand = 2.7, breite = 1.25): Oeffnung[] {
  const l = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
  const n = Math.max(0, Math.floor((l - 1) / abstand));
  const rand = (l - (n - 1) * abstand) / 2;
  return Array.from({ length: n }, (_, i) => ({ id: `${w.id}-f${i}`, wandId: w.id, art: "fenster" as const, position: rand + i * abstand, breite }));
}

const aussen: Wand[] = [
  { id: "h-brand-11", a: { x: X0, y: Y0 }, b: { x: X1, y: Y0 }, dicke: 0.36 },
  { id: "h-brand-7", a: { x: X0, y: Y1 }, b: { x: X1, y: Y1 }, dicke: 0.36 },
  { id: "h-grenze", a: { x: X0, y: Y0 }, b: { x: X0, y: Y1 }, dicke: 0.36 },
  { id: "h-strasse", a: { x: X1, y: Y0 }, b: { x: X1, y: Y1 }, dicke: 0.5 },
];
const hofWaende: Wand[] = HOF.map((a, i) => ({ id: `h-hof-${i}`, a, b: HOF[(i + 1) % HOF.length], dicke: 0.4 }));

const treppenhaeuser: Array<{ id: string; name: string; r: [number, number, number, number]; waende: Array<[Punkt, Punkt]> }> = [
  { id: "th-vorderhaus", name: "Treppenhaus Vorderhaus", r: [32.58, 12.32, 38.3, 15.26],
    waende: [[{ x: 32.58, y: 12.32 }, { x: 38.3, y: 12.32 }], [{ x: 38.3, y: 12.32 }, { x: 38.3, y: 15.26 }], [{ x: 32.58, y: 15.26 }, { x: 38.3, y: 15.26 }]] },
  { id: "th-quer", name: "Treppenhaus Quergebäude", r: [0.64, 11.94, 4.37, 15.55],
    waende: [[{ x: X0, y: 11.94 }, { x: 6.2, y: 11.94 }], [{ x: X0, y: 15.55 }, { x: 6.2, y: 15.55 }]] },
  // Linke Treppenwand nach den Exposé-Grundrissen der Seitenflügel (WE 28/30/32, 23/25) bei x 15,97, nicht 15,1.
  { id: "th-seite-rechts", name: "Treppenhaus rechter Seitenflügel", r: [15.97, 2.24, 19.3, 5.89],
    waende: [[{ x: 15.97, y: Y0 }, { x: 15.97, y: 6.17 }], [{ x: 19.3, y: Y0 }, { x: 19.3, y: 6.17 }]] },
  { id: "th-seite-links", name: "Treppenhaus linker Seitenflügel", r: [15.97, 21.84, 19.43, 25.4],
    waende: [[{ x: 15.97, y: 21.41 }, { x: 15.97, y: Y1 }], [{ x: 19.43, y: 21.41 }, { x: 19.43, y: Y1 }]] },
];

const treppenWaende: Wand[] = treppenhaeuser.flatMap((t) => t.waende.map(([a, b], i) => ({ id: `${t.id}-w${i}`, a, b, dicke: 0.24 })));
const treppenTueren: Oeffnung[] = treppenWaende.map((w) => ({ id: `${w.id}-t`, wandId: w.id, art: "tuer" as const, position: Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) / 2, breite: 1.0 }));
const treppenRaeume: Raum[] = treppenhaeuser.map((t) => {
  const [x0, y0, x1, y1] = t.r;
  return { id: t.id, name: t.name, typ: "treppenhaus" as const, punkte: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] };
});

const HUELLE: Grundriss3dPlan = {
  version: 1, nordWinkel: 0,
  waende: [...aussen, ...hofWaende, ...treppenWaende],
  oeffnungen: [
    ...fensterReihe(aussen[3]),
    ...hofWaende.flatMap((w) => fensterReihe(w)),
    ...treppenTueren,
  ],
  raeume: treppenRaeume,
};

export const BARFUSS9_HAUS: HausPlan = {
  version: 1,
  geschosse: 5,
  huelle: HUELLE,
  hof: HOF,
  aufzuege: [
    { id: "aufzug-seite-rechts", x: 17.65, y: 6.37, b: 1.55, t: 1.5 },
    { id: "aufzug-seite-links", x: 16.18, y: 19.71, b: 1.55, t: 1.5 },
    { id: "aufzug-vorderhaus", x: 30.88, y: 13.72, b: 1.5, t: 1.57 },
  ],
  quelle: "Flächenberechnung BAR9 Vorplanung vom 23.10.2024 und Einzelgrundrisse der Exposés",
};

/* ── Einheiten im Vorderhaus ── */

/** WE 04 (Vorderhaus, Mitte links, 45 m²), im Bild von WE 03 rechts unten mitgezeichnet. */
const WE04: Grundriss3dPlan = {
  version: 1, nordWinkel: 0,
  waende: [
    { id: "w-links", a: p(690, 435), b: p(690, 1108), dicke: 0.4 },
    { id: "w-oben", a: p(690, 435), b: p(1212, 435), dicke: 0.12 },
    { id: "w-strasse", a: p(1212, 435), b: p(1212, 1108), dicke: 0.4 },
    { id: "w-unten", a: p(690, 1108), b: p(1212, 1108), dicke: 0.24 },
    { id: "w-zimmer", a: p(690, 790), b: p(1212, 790), dicke: 0.12 },
    { id: "w-bad-kueche", a: p(812, 868), b: p(1212, 868), dicke: 0.12 },
    { id: "w-flur", a: p(812, 790), b: p(812, 1108), dicke: 0.12 },
    { id: "w-ar", a: p(1092, 790), b: p(1092, 868), dicke: 0.12 },
    { id: "w-balkon-o", a: p(1212, 625), b: p(1330, 625), dicke: 0.1 },
    { id: "w-balkon-r", a: p(1330, 625), b: p(1330, 878), dicke: 0.1 },
    { id: "w-balkon-u", a: p(1212, 878), b: p(1330, 878), dicke: 0.1 },
  ],
  oeffnungen: [
    { id: "t-eingang", wandId: "w-unten", art: "tuer", position: m(757 - 690), breite: 0.9 },
    { id: "t-zimmer", wandId: "w-zimmer", art: "tuer", position: m(757 - 690), breite: 0.85 },
    { id: "t-bad", wandId: "w-flur", art: "tuer", position: m(829 - 790), breite: 0.7 },
    { id: "t-kueche", wandId: "w-flur", art: "tuer", position: m(945 - 790), breite: 0.85 },
    { id: "t-balkon", wandId: "w-strasse", art: "tuer", position: m(700 - 435), breite: 0.9 },
    { id: "f-zimmer", wandId: "w-strasse", art: "fenster", position: m(542 - 435), breite: 1.1 },
    { id: "f-ar", wandId: "w-strasse", art: "fenster", position: m(822 - 435), breite: 0.5 },
    { id: "f-kueche", wandId: "w-strasse", art: "fenster", position: m(952 - 435), breite: 1.1 },
    { id: "f-balkon", wandId: "w-balkon-r", art: "fenster", position: m(126), breite: 2.4 },
  ],
  raeume: [
    { id: "r-zimmer", name: "Zimmer", typ: "zimmer", punkte: [p(708, 441), p(1190, 441), p(1190, 784), p(708, 784)] },
    { id: "r-bad", name: "Bad", typ: "bad", punkte: [p(818, 796), p(1086, 796), p(1086, 862), p(818, 862)] },
    { id: "r-ar", name: "Abstellraum", typ: "abstell", punkte: [p(1098, 796), p(1190, 796), p(1190, 862), p(1098, 862)] },
    { id: "r-kueche", name: "Küche", typ: "kueche", punkte: [p(818, 874), p(1190, 874), p(1190, 1100), p(818, 1100)] },
    { id: "r-flur", name: "Flur", typ: "flur", punkte: [p(708, 796), p(806, 796), p(806, 1100), p(708, 1100)] },
    { id: "r-balkon", name: "Balkon", typ: "balkon", punkte: [p(1240, 631), p(1324, 631), p(1324, 872), p(1240, 872)] },
  ],
};

/** Bad geteilt in Abstellraum und Bad, wie bei WE 11 und WE 06. */
function mitAbstellraum(plan: Grundriss3dPlan): Grundriss3dPlan {
  return {
    ...plan,
    waende: [...plan.waende, { id: "w-ar-bad", a: p(320, 584), b: p(320, 714), dicke: 0.12 }],
    raeume: plan.raeume.flatMap((r) => r.id !== "r-bad" ? [r] : [
      { ...r, id: "r-ar", name: "Abstellraum", typ: "abstell" as const, punkte: [p(212, 590), p(314, 590), p(314, 708), p(212, 708)] },
      { ...r, punkte: [p(326, 590), p(542, 590), p(542, 708), p(326, 708)] },
    ]),
  };
}

/** An der Achse des Vorderhaus-Treppenhauses gespiegelt (Hausachse y 13,79). */
function gespiegelt(plan: Grundriss3dPlan): Grundriss3dPlan {
  const s = (q: Punkt): Punkt => ({ x: q.x, y: 2 * 13.79 - 2 * VERSATZ.y - q.y });
  return { ...plan, waende: plan.waende.map((w) => ({ ...w, a: s(w.a), b: s(w.b) })), raeume: plan.raeume.map((r) => ({ ...r, punkte: r.punkte.map(s) })) };
}

const imHaus = (plan: Grundriss3dPlan, geschoss: number): Grundriss3dPlan => ({ ...plan, geschoss, versatz: VERSATZ, hintergrund: undefined });

const WE03 = { ...WE03_PLAN, hintergrund: undefined };
const WE06 = gespiegelt(mitAbstellraum(WE03));
/** WE 05 liegt spiegelbildlich zu WE 04 (zweiter Kragbalkon der Straßenfassade, Foto 02). */
const WE05 = gespiegelt(WE04);

/**
 * Außen nach den Fotos vom Frühjahr 2026 (Straßenfassade, Balkone, Drohne
 * Hof und Quartier): himbeerroter Rauputz, Ladenzone im EG grau, Hof
 * cremefarben, Berliner Dach mit roten Ziegeln an Straße und Hof, oben flach
 * mit grauer Bahn. Farben als Mittel über die Putz- und Dachflächen der
 * Fotos; das Licht der Aufnahmen färbt sie etwas.
 * Straßenfassade je Obergeschoss: zwei Loggien außen (WE 03/06 …) und zwei
 * Kragbalkone innen (WE 04/05 …), zusammen acht im 1. und 2. OG wie im Foto.
 */
export const BARFUSS9_AUSSEHEN: Aussehen = {
  fassade: "#ad5262",
  sockel: "#8f9495",
  hof: "#c9b491",
  // Brandwände und Grundstücksgrenze stoßen an die Nachbarhäuser (Drohnenfoto): grau, ohne Putzfarbe.
  brandwand: { seiten: ["oben", "unten", "links"], farbe: "#b3ada4" },
  strasse: "rechts",
  dach: { art: "mansarde", tiefe: 1.8, hoehe: 2.6, traufe: ["rechts"], farbe: "#b5614a", flach: "#aaafae" },
};

/** Einheitennummer und Plan, so wie sie in `wohnungen.meta.grundriss3d` landen. */
export const BARFUSS9_EINHEITEN: Array<{ we: number; plan: Grundriss3dPlan }> = [
  { we: 3, plan: imHaus(WE03, 1) },
  { we: 7, plan: imHaus(WE03, 2) },
  { we: 11, plan: imHaus(mitAbstellraum(WE03), 3) },
  { we: 4, plan: imHaus(WE04, 1) },
  { we: 8, plan: imHaus(WE04, 2) },
  { we: 12, plan: imHaus(WE04, 3) },
  { we: 5, plan: imHaus(WE05, 1) },
  { we: 9, plan: imHaus(WE05, 2) },
  { we: 13, plan: imHaus(WE05, 3) },
  { we: 6, plan: imHaus(WE06, 1) },
  { we: 10, plan: imHaus(WE06, 2) },
  { we: 14, plan: imHaus(WE06, 3) },
  // 4. OG: gleicher Zuschnitt wie im 3. OG (Annahme, Altbau mit durchgehenden Achsen).
  { we: 15, plan: imHaus(mitAbstellraum(WE03), 4) },
  { we: 16, plan: imHaus(WE04, 4) },
  { we: 17, plan: imHaus(WE05, 4) },
  { we: 18, plan: imHaus(WE06, 4) },
];
