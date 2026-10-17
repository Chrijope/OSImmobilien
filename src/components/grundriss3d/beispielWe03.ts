import type { Grundriss3dPlan, Punkt } from "./plan";

/*
 * Beispielwohnung für Vorschau und Tests: Barfusstraße 9, WE 3 (Vorderhaus,
 * 1. OG links), nachgezeichnet aus dem Einzelgrundriss im Exposé, Seite 5.
 * Das Planbild hat 1365 × 1116 Pixel, die Bemaßung ergibt rund 87,5 Pixel je
 * Meter (5,65 m = 493 px, 3,81 m = 333 px). Die Werte unten sind Pixel
 * im Bild und werden hier in Meter umgerechnet. Ursprung ist die linke obere
 * Bildecke, so liegt der Plan im Editor genau auf dem Bild.
 */
export const WE03_PX_PRO_METER = 87.5;
const p = (x: number, y: number): Punkt => ({ x: x / WE03_PX_PRO_METER, y: y / WE03_PX_PRO_METER });
const m = (px: number) => px / WE03_PX_PRO_METER;

export const WE03_PLAN: Grundriss3dPlan = {
  version: 1,
  nordWinkel: 0,
  geschoss: 1,
  waende: [
    // Außenwände
    { id: "w-oben", a: p(127, 75), b: p(1212, 75), dicke: 0.4 },
    { id: "w-links", a: p(127, 75), b: p(127, 440), dicke: 0.4 },
    { id: "w-erker", a: p(127, 440), b: p(188, 585), dicke: 0.4 },
    { id: "w-links-unten", a: p(188, 585), b: p(188, 965), dicke: 0.4 },
    { id: "w-unten", a: p(188, 965), b: p(690, 965), dicke: 0.4 },
    { id: "w-loggia-rechts", a: p(1212, 75), b: p(1212, 420), dicke: 0.4 },
    { id: "w-loggia-unten", a: p(1097, 420), b: p(1212, 420), dicke: 0.3 },
    // Tragende Wände
    { id: "w-mitte", a: p(560, 75), b: p(560, 565), dicke: 0.3 },
    { id: "w-flur-rechts", a: p(690, 435), b: p(690, 965), dicke: 0.4 },
    { id: "w-loggia", a: p(1097, 75), b: p(1097, 435), dicke: 0.36 },
    // Innenwände
    { id: "w-zimmer2-unten", a: p(560, 435), b: p(1097, 435), dicke: 0.12 },
    { id: "w-flur-links", a: p(548, 565), b: p(548, 965), dicke: 0.12 },
    { id: "w-bad-oben", a: p(188, 584), b: p(548, 584), dicke: 0.12 },
    { id: "w-bad-kueche", a: p(188, 714), b: p(548, 714), dicke: 0.12 },
  ],
  oeffnungen: [
    { id: "t-zimmer", wandId: "w-mitte", art: "tuer", position: m(255 - 75), breite: 0.9 },
    { id: "t-flur-zimmer1", wandId: "w-mitte", art: "tuer", position: m(515 - 75), breite: 0.9 },
    { id: "t-flur-zimmer2", wandId: "w-zimmer2-unten", art: "tuer", position: m(628 - 560), breite: 0.85 },
    { id: "t-bad", wandId: "w-flur-links", art: "tuer", position: m(650 - 565), breite: 0.8 },
    { id: "t-kueche", wandId: "w-flur-links", art: "tuer", position: m(820 - 565), breite: 0.85 },
    { id: "t-eingang", wandId: "w-unten", art: "tuer", position: m(618 - 188), breite: 0.95 },
    { id: "t-loggia", wandId: "w-loggia", art: "tuer", position: m(345 - 75), breite: 1.0 },
    { id: "f-zimmer1", wandId: "w-links", art: "fenster", position: m(261 - 75), breite: 2.4 },
    { id: "f-erker", wandId: "w-erker", art: "fenster", position: m(Math.hypot(61, 145)) / 2, breite: 1.2 },
    { id: "f-bad", wandId: "w-links-unten", art: "fenster", position: m(672 - 585), breite: 0.6 },
    { id: "f-kueche", wandId: "w-links-unten", art: "fenster", position: m(818 - 585), breite: 1.0 },
    { id: "f-zimmer2", wandId: "w-loggia", art: "fenster", position: m(195 - 75), breite: 1.1 },
    { id: "f-loggia", wandId: "w-loggia-rechts", art: "fenster", position: m(250 - 75), breite: 2.4 },
  ],
  raeume: [
    { id: "r-zimmer1", name: "Zimmer", typ: "zimmer", punkte: [p(145, 92), p(545, 92), p(545, 578), p(210, 578), p(145, 440)] },
    { id: "r-zimmer2", name: "Zimmer", typ: "zimmer", punkte: [p(575, 92), p(1080, 92), p(1080, 429), p(575, 429)] },
    { id: "r-loggia", name: "Loggia", typ: "balkon", punkte: [p(1115, 92), p(1190, 92), p(1190, 405), p(1115, 405)] },
    { id: "r-bad", name: "Bad", typ: "bad", punkte: [p(212, 590), p(542, 590), p(542, 708), p(212, 708)] },
    { id: "r-kueche", name: "Küche", typ: "kueche", punkte: [p(212, 720), p(542, 720), p(542, 950), p(212, 950)] },
    { id: "r-flur", name: "Flur", typ: "flur", punkte: [p(575, 441), p(670, 441), p(670, 950), p(554, 950), p(554, 565), p(575, 565)] },
  ],
};

/**
 * Beispielhaus für die Objektansicht: drei Geschosse mit je zwei Einheiten.
 * Alle aus dem WE03-Plan, die rechte gespiegelt. Ausdrücklich ein Beispiel,
 * das echte Haus Barfusstraße 9 ist anders geschnitten.
 */
export function beispielHaus(): Array<{ plan: Grundriss3dPlan; titel: string }> {
  // An der rechten Außenwand (Pixel 1212) gespiegelt.
  const achse = 1212 / WE03_PX_PRO_METER;
  const spiegeln = (q: Punkt): Punkt => ({ x: 2 * achse - q.x, y: q.y });
  const gespiegelt: Grundriss3dPlan = {
    ...WE03_PLAN,
    waende: WE03_PLAN.waende.map((w) => ({ ...w, a: spiegeln(w.a), b: spiegeln(w.b) })),
    raeume: WE03_PLAN.raeume.map((r) => ({ ...r, punkte: r.punkte.map(spiegeln) })),
  };
  const liste: Array<{ plan: Grundriss3dPlan; titel: string }> = [];
  for (let g = 0; g < 3; g++) {
    liste.push({ plan: { ...WE03_PLAN, geschoss: g }, titel: `WE ${String(g * 2 + 1).padStart(2, "0")}` });
    liste.push({ plan: { ...gespiegelt, geschoss: g }, titel: `WE ${String(g * 2 + 2).padStart(2, "0")}` });
  }
  return liste;
}
