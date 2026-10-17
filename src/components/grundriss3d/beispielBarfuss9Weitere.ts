import { WE03_PX_PRO_METER } from "./beispielWe03";
import type { Grundriss3dPlan, Oeffnung, OeffnungArt, Raum, RaumTyp, Wand } from "./plan";

/*
 * Barfusstraße 9, Berlin: alle weiteren Einheiten mit Exposé (17.10.2026),
 * ergänzend zu den neun Vorderhaus-Einheiten in beispielBarfuss9.ts.
 *
 * Quelle: Einzelgrundrisse der Exposés, Seite 5 (Aufteilungsplanung vom
 * 19.07.2022, M 1:100). Die Bilder haben wie bei WE 03 rund 87,5 px je
 * Meter (geprüft an den Maßketten, z. B. 3,77 m = 328 px). Alle Werte unten
 * sind Pixel im jeweiligen Exposé-Bild, Ursprung oben links. Die Bilder sind
 * Ausschnitte desselben, nicht gedrehten Gesamtplans, deshalb genügt je
 * Einheit ein Versatz in Hauskoordinaten (Meter, wie in beispielBarfuss9.ts).
 *
 * Lage („links/rechts“ im Exposé gilt vom Hof aus gesehen):
 * - Rechter Seitenflügel = oben an der Brandwand zu Nr. 11, linker = unten
 *   an der Brandwand zu Nr. 7, Quergebäude (im Exposé „Hinterhaus“) links an
 *   der Grundstücksgrenze; dort ist „rechts“ oben, „links“ unten.
 * - Versatz aus Wandmitten: Brandwand y 1,98 bzw. 25,6, Grenze x 0,46,
 *   Vorderhaus-Hofwand x 31,88 (Erker-Ecke). Die Seitenflügel-Einheiten an der
 *   Quergebäude-Ecke liegen an der Trennwand zum großen Quergebäude-Zimmer
 *   (x 6,82); so treffen sich die Erker beider Pläne an der Hofecke.
 *
 * Genauigkeit: Wände auf etwa ±5 cm im Bild, Raumflächen je Raum innerhalb
 * ±5 % der Exposé-Angaben (Prüfrechnung über die Raumpolygone). Türen und
 * Fenster nach Augenmaß, Breiten gerundet.
 *
 * Annahmen und Grenzen:
 * - Küchen neben den Seitenflügel-Treppenhäusern ragen laut Plan bis 1,6 m
 *   über die Hofkante der Hülle hinaus (Treppenhaus-Vorbau); so übernommen.
 * - Laut Exposés endet die Einheit vor dem Seitenflügel-Treppenhaus bei
 *   x ≈ 16,0, die Hülle setzt das Treppenhaus schon bei 15,11 bzw. 15,24 an
 *   (Flächenberechnung des Dachgeschosses). Hier gilt der Exposé-Plan.
 * - Gleiche Zuschnitte werden mehrfach verwendet, wo die Exposé-Bilder
 *   dieselbe Geometrie zeigen: WE 30/32, WE 35/37, WE 45/47, WE 44/46.
 *   Abweichungen der Raumflächen dabei unter 4 %.
 * - WE 30: Das Exposé nennt 92 m², der Einzelgrundriss zeigt rund 35 m²
 *   (Hinweis im Exposé). Gezeichnet ist der Grundriss.
 * - Die Wohnfläche im Exposé enthält teils mehr als die Summe der Räume
 *   (z. B. WE 45: 59 m² gegenüber 55 m² Raumsumme).
 */

const PX = WE03_PX_PRO_METER;
const m = (px: number) => px / PX;
const w = (id: string, ax: number, ay: number, bx: number, by: number, dicke: number): Wand =>
  ({ id, a: { x: m(ax), y: m(ay) }, b: { x: m(bx), y: m(by) }, dicke });
const o = (id: string, wandId: string, art: OeffnungArt, positionPx: number, breite: number): Oeffnung =>
  ({ id, wandId, art, position: m(positionPx), breite });
const r = (id: string, name: string, typ: RaumTyp, punkte: Array<[number, number]>): Raum =>
  ({ id, name, typ, punkte: punkte.map(([x, y]) => ({ x: m(x), y: m(y) })) });

/** Versatz in Hauskoordinaten (Meter), Geschoss 0 = EG. */
const imHaus = (plan: Grundriss3dPlan, geschoss: number, x: number, y: number): Grundriss3dPlan =>
  ({ ...plan, geschoss, versatz: { x, y } });


/** Rechter Seitenflügel links, EG (WE 28). */
const RSL_EG: Grundriss3dPlan = {
  version: 1, nordWinkel: 0,
  waende: [
    w("w-brand", 113, 80, 912, 80, 0.45),
    w("w-links", 113, 80, 113, 437, 0.45),
    w("w-hof", 113, 437, 680, 437, 0.5),
    w("w-kueche-links", 680, 437, 680, 562, 0.45),
    w("w-kueche-unten", 680, 562, 912, 562, 0.45),
    w("w-treppe", 912, 80, 912, 562, 0.45),
    w("w-zimmer", 580, 102, 580, 410, 0.1),
    w("w-flur", 582, 204, 891, 204, 0.1),
    w("w-bad", 711, 204, 711, 437, 0.1),
  ],
  oeffnungen: [
    o("t-eingang", "w-treppe", "tuer", 65, 0.9),
    o("t-zimmer", "w-zimmer", "tuer", 41, 0.85),
    o("t-bad", "w-flur", "tuer", 43, 0.7),
    o("t-kueche", "w-flur", "tuer", 193, 0.85),
    o("f-zimmer1", "w-hof", "fenster", 169, 1.1),
    o("f-zimmer2", "w-hof", "fenster", 370, 1.1),
    o("f-kueche", "w-kueche-unten", "fenster", 122, 1.1),
  ],
  raeume: [
    r("r-zimmer", "Zimmer", "zimmer", [[134, 102], [579, 102], [579, 410], [134, 410]]),
    r("r-flur", "Flur", "flur", [[582, 102], [891, 102], [891, 203], [582, 203]]),
    r("r-bad", "Bad", "bad", [[582, 206], [710, 206], [710, 395], [582, 395]]),
    r("r-kueche", "Küche", "kueche", [[713, 206], [891, 206], [891, 410], [903, 410], [903, 536], [701, 536], [701, 410], [713, 410]]),
  ],
};

/** Rechter Seitenflügel links, 1. und 2. OG (WE 30, 32). */
const RSL_OG: Grundriss3dPlan = {
  version: 1, nordWinkel: 0,
  waende: [
    w("w-brand", 107, 80, 915, 80, 0.45),
    w("w-links", 107, 80, 107, 442, 0.35),
    w("w-hof", 107, 442, 675, 442, 0.45),
    w("w-kueche-links", 675, 442, 675, 567, 0.4),
    w("w-kueche-unten", 675, 567, 915, 567, 0.45),
    w("w-treppe", 915, 80, 915, 567, 0.4),
    w("w-zimmer", 606, 101, 606, 420, 0.1),
    w("w-flur", 607, 209, 896, 209, 0.1),
    w("w-bad", 691, 209, 691, 442, 0.1),
    w("w-ar", 607, 334, 691, 334, 0.1),
  ],
  oeffnungen: [
    o("t-eingang", "w-treppe", "tuer", 65, 0.9),
    o("t-zimmer", "w-zimmer", "tuer", 41, 0.85),
    o("t-bad", "w-flur", "tuer", 40, 0.6),
    o("t-kueche", "w-flur", "tuer", 170, 0.85),
    o("t-ar", "w-bad", "tuer", 166, 0.6),
    o("f-zimmer1", "w-hof", "fenster", 175, 1.1),
    o("f-zimmer2", "w-hof", "fenster", 376, 1.1),
    o("f-kueche", "w-kueche-unten", "fenster", 127, 1.1),
  ],
  raeume: [
    r("r-zimmer", "Zimmer", "zimmer", [[123, 101], [604, 101], [604, 420], [123, 420]]),
    r("r-flur", "Flur", "flur", [[607, 101], [912, 101], [912, 208], [607, 208]]),
    r("r-bad", "Bad", "bad", [[610, 211], [688, 211], [688, 332], [610, 332]]),
    r("r-ar", "Abstellraum", "abstell", [[610, 336], [688, 336], [688, 420], [610, 420]]),
    r("r-kueche", "Küche", "kueche", [[693, 211], [891, 211], [891, 410], [913, 410], [913, 545], [692, 545]]),
  ],
};

/** Rechter Seitenflügel rechts, 1. OG (WE 31). */
const RSR_1: Grundriss3dPlan = {
  version: 1, nordWinkel: 0,
  waende: [
    w("w-brand", 193, 79, 1289, 79, 0.45),
    w("w-treppe", 193, 79, 193, 566.5, 0.3),
    w("w-unten", 193, 566.5, 722, 566.5, 0.45),
    w("w-block", 722, 79, 722, 566.5, 0.35),
    w("w-hof", 722, 441.5, 1289, 441.5, 0.45),
    w("w-erker", 1289, 79, 1289, 441.5, 0.35),
    w("w-flur", 203, 205, 722, 205, 0.1),
    w("w-kueche-bad", 410, 205, 410, 545, 0.1),
    w("w-bad-zimmer", 491, 205, 491, 545, 0.1),
  ],
  oeffnungen: [
    o("t-eingang", "w-treppe", "tuer", 66, 0.9),
    o("t-kueche", "w-flur", "tuer", 134, 0.85),
    o("t-bad", "w-flur", "tuer", 252, 0.7),
    o("t-zimmer", "w-flur", "tuer", 407, 0.85),
    o("t-zimmer-gross", "w-block", "tuer", 66, 0.9),
    o("f-kueche", "w-unten", "fenster", 104, 1.1),
    o("f-bad", "w-unten", "fenster", 262, 0.4),
    o("f-zimmer", "w-unten", "fenster", 399, 1.1),
    o("f-zimmer-gross1", "w-hof", "fenster", 168, 1.1),
    o("f-zimmer-gross2", "w-hof", "fenster", 388, 1.1),
  ],
  raeume: [
    r("r-flur", "Flur", "flur", [[203, 100], [722, 100], [722, 203], [203, 203]]),
    r("r-kueche", "Küche", "kueche", [[219, 207], [408, 207], [408, 545], [203, 545], [203, 401], [219, 401]]),
    r("r-bad", "Bad", "bad", [[414, 207], [488, 207], [488, 545], [414, 545]]),
    r("r-zimmer", "Zimmer", "zimmer", [[493, 207], [707, 207], [707, 545], [493, 545]]),
    r("r-zimmer-gross", "Zimmer", "zimmer", [[738, 100], [1273, 100], [1273, 420], [738, 420]]),
  ],
};

/** Rechter Seitenflügel rechts, 3. und 4. OG (WE 35, 37). */
const RSR_3: Grundriss3dPlan = {
  version: 1, nordWinkel: 0,
  waende: [
    w("w-brand", 193, 74, 1289, 74, 0.45),
    w("w-treppe", 193, 74, 193, 572.5, 0.3),
    w("w-unten", 193, 572.5, 722, 572.5, 0.45),
    w("w-block", 722, 74, 722, 572.5, 0.35),
    w("w-hof", 722, 447.5, 1289, 447.5, 0.45),
    w("w-erker", 1289, 74, 1289, 447.5, 0.35),
    w("w-flur", 203, 205, 722, 205, 0.1),
    w("w-kueche-bad", 410, 205, 410, 557, 0.1),
    w("w-bad-zimmer", 491, 205, 491, 557, 0.1),
  ],
  oeffnungen: [
    o("t-eingang", "w-treppe", "tuer", 71, 0.9),
    o("t-kueche", "w-flur", "tuer", 134, 0.85),
    o("t-bad", "w-flur", "tuer", 252, 0.7),
    o("t-zimmer", "w-flur", "tuer", 407, 0.85),
    o("t-zimmer-gross", "w-block", "tuer", 71, 0.9),
    o("f-kueche", "w-unten", "fenster", 104, 1.1),
    o("f-bad", "w-unten", "fenster", 262, 0.4),
    o("f-zimmer", "w-unten", "fenster", 399, 1.1),
    o("f-zimmer-gross1", "w-hof", "fenster", 168, 1.1),
    o("f-zimmer-gross2", "w-hof", "fenster", 388, 1.1),
  ],
  raeume: [
    r("r-flur", "Flur", "flur", [[203, 90], [722, 90], [722, 203], [203, 203]]),
    r("r-kueche", "Küche", "kueche", [[219, 207], [408, 207], [408, 557], [203, 557], [203, 401], [219, 401]]),
    r("r-bad", "Bad", "bad", [[414, 207], [488, 207], [488, 557], [414, 557]]),
    r("r-zimmer", "Zimmer", "zimmer", [[493, 207], [707, 207], [707, 557], [493, 557]]),
    r("r-zimmer-gross", "Zimmer", "zimmer", [[738, 90], [1273, 90], [1273, 432], [738, 432]]),
  ],
};

/** Linker Seitenflügel links, 1. OG (WE 20). */
const LSL_1: Grundriss3dPlan = {
  version: 1, nordWinkel: 0,
  waende: [
    w("w-brand", 193, 583, 1289, 583, 0.45),
    w("w-treppe", 193, 98, 193, 583, 0.3),
    w("w-oben", 193, 98, 720, 98, 0.45),
    w("w-block", 720, 98, 720, 223.5, 0.4),
    w("w-hof", 720, 223.5, 1289, 223.5, 0.45),
    w("w-erker", 1289, 223.5, 1289, 583, 0.35),
    w("w-flur", 203, 459.5, 767, 459.5, 0.1),
    w("w-kueche-bad", 407, 120, 407, 459.5, 0.1),
    w("w-bad-zimmer", 488, 120, 488, 459.5, 0.1),
    w("w-zimmer-gross", 767.5, 245, 767.5, 562, 0.1),
    w("w-ar", 408, 222, 485, 222, 0.1),
  ],
  oeffnungen: [
    o("t-eingang", "w-treppe", "tuer", 412, 0.9),
    o("t-kueche", "w-flur", "tuer", 137, 0.85),
    o("t-bad", "w-flur", "tuer", 252, 0.7),
    o("t-zimmer", "w-flur", "tuer", 412, 0.85),
    o("t-zimmer-gross", "w-zimmer-gross", "tuer", 265, 0.9),
    o("f-kueche", "w-oben", "fenster", 110, 1.1),
    o("f-bad", "w-oben", "fenster", 254, 0.4),
    o("f-zimmer", "w-oben", "fenster", 397, 1.1),
    o("f-zimmer-gross1", "w-hof", "fenster", 170, 1.1),
    o("f-zimmer-gross2", "w-hof", "fenster", 390, 1.1),
    o("t-ar", "w-kueche-bad", "tuer", 40, 0.6),
  ],
  raeume: [
    r("r-kueche", "Küche", "kueche", [[203, 120], [405, 120], [405, 458], [225, 458], [225, 270], [203, 270]]),
    r("r-bad", "Bad", "bad", [[410, 224], [483, 224], [483, 458], [410, 458]]),
    r("r-zimmer", "Zimmer", "zimmer", [[488, 120], [703, 120], [703, 245], [766, 245], [766, 458], [488, 458]]),
    r("r-flur", "Flur", "flur", [[203, 461], [766, 461], [766, 562], [203, 562]]),
    r("r-zimmer-gross", "Zimmer", "zimmer", [[769, 245], [1273, 245], [1273, 562], [769, 562]]),
    r("r-ar", "Abstellraum", "abstell", [[408, 120], [485, 120], [485, 220], [408, 220]]),
  ],
};

/** Linker Seitenflügel links, 3. OG (WE 24). */
const LSL_3: Grundriss3dPlan = {
  version: 1, nordWinkel: 0,
  waende: [
    w("w-brand", 193, 588.5, 1289, 588.5, 0.45),
    w("w-treppe", 193, 91.5, 193, 588.5, 0.3),
    w("w-oben", 193, 91.5, 720, 91.5, 0.45),
    w("w-block", 720, 91.5, 720, 217.5, 0.4),
    w("w-hof", 720, 217.5, 1289, 217.5, 0.45),
    w("w-erker", 1289, 217.5, 1289, 588.5, 0.35),
    w("w-flur", 203, 459.5, 767, 459.5, 0.1),
    w("w-kueche-bad", 407, 107, 407, 459.5, 0.1),
    w("w-bad-zimmer", 488, 107, 488, 459.5, 0.1),
    w("w-zimmer-gross", 767.5, 233, 767.5, 573, 0.1),
  ],
  oeffnungen: [
    o("t-eingang", "w-treppe", "tuer", 418.5, 0.9),
    o("t-kueche", "w-flur", "tuer", 137, 0.85),
    o("t-bad", "w-flur", "tuer", 252, 0.7),
    o("t-zimmer", "w-flur", "tuer", 412, 0.85),
    o("t-zimmer-gross", "w-zimmer-gross", "tuer", 277, 0.9),
    o("f-kueche", "w-oben", "fenster", 110, 1.1),
    o("f-bad", "w-oben", "fenster", 254, 0.4),
    o("f-zimmer", "w-oben", "fenster", 397, 1.1),
    o("f-zimmer-gross1", "w-hof", "fenster", 170, 1.1),
    o("f-zimmer-gross2", "w-hof", "fenster", 390, 1.1),
  ],
  raeume: [
    r("r-kueche", "Küche", "kueche", [[203, 107], [412, 107], [412, 458], [226, 458], [226, 275], [203, 275]]),
    r("r-bad", "Bad", "bad", [[416, 107], [497, 107], [497, 458], [416, 458]]),
    r("r-zimmer", "Zimmer", "zimmer", [[502, 107], [703, 107], [703, 233], [766, 233], [766, 458], [502, 458]]),
    r("r-flur", "Flur", "flur", [[203, 461], [766, 461], [766, 573], [203, 573]]),
    r("r-zimmer-gross", "Zimmer", "zimmer", [[769, 233], [1273, 233], [1273, 573], [769, 573]]),
  ],
};

/** Linker Seitenflügel rechts, 2. OG (WE 23). */
const LSR_2: Grundriss3dPlan = {
  version: 1, nordWinkel: 0,
  waende: [
    w("w-brand", 107.5, 588.5, 912.5, 588.5, 0.4),
    w("w-links", 107.5, 223.5, 107.5, 588.5, 0.35),
    w("w-hof", 107.5, 223.5, 675, 223.5, 0.45),
    w("w-kueche-links", 675, 98, 675, 223.5, 0.4),
    w("w-kueche-oben", 675, 98, 912.5, 98, 0.45),
    w("w-treppe", 912.5, 98, 912.5, 588.5, 0.4),
    w("w-zimmer", 605.5, 223.5, 605.5, 588.5, 0.1),
    w("w-bad-kueche", 691.5, 223.5, 691.5, 460.5, 0.1),
    w("w-flur", 607, 460.5, 912, 460.5, 0.1),
  ],
  oeffnungen: [
    o("t-eingang", "w-treppe", "tuer", 407, 0.9),
    o("t-zimmer", "w-zimmer", "tuer", 296.5, 0.85),
    o("t-bad", "w-flur", "tuer", 33, 0.6),
    o("t-kueche", "w-flur", "tuer", 173, 0.85),
    o("f-zimmer1", "w-hof", "fenster", 174.5, 1.1),
    o("f-zimmer2", "w-hof", "fenster", 374.5, 1.1),
    o("f-bad", "w-hof", "fenster", 520.5, 0.35),
    o("f-kueche", "w-kueche-oben", "fenster", 125, 1.1),
  ],
  raeume: [
    r("r-zimmer", "Zimmer", "zimmer", [[123, 245], [604, 245], [604, 573], [123, 573]]),
    r("r-bad", "Bad", "bad", [[609, 245], [688, 245], [688, 459], [609, 459]]),
    r("r-kueche", "Küche", "kueche", [[693, 120], [914, 120], [914, 270], [891, 270], [891, 459], [693, 459]]),
    r("r-flur", "Flur", "flur", [[607, 462], [912, 462], [912, 573], [607, 573]]),
  ],
};

/** Linker Seitenflügel rechts, 3. OG (WE 25). */
const LSR_3: Grundriss3dPlan = {
  version: 1, nordWinkel: 0,
  waende: [
    w("w-brand", 107.5, 588.5, 912.5, 588.5, 0.4),
    w("w-links", 107.5, 217.5, 107.5, 588.5, 0.35),
    w("w-hof", 107.5, 217.5, 675, 217.5, 0.45),
    w("w-kueche-links", 675, 91.5, 675, 217.5, 0.4),
    w("w-kueche-oben", 675, 91.5, 912.5, 91.5, 0.45),
    w("w-treppe", 912.5, 91.5, 912.5, 588.5, 0.4),
    w("w-zimmer", 605.5, 217.5, 605.5, 588.5, 0.1),
    w("w-bad-kueche", 691.5, 217.5, 691.5, 456.5, 0.1),
    w("w-flur", 607, 456.5, 912, 456.5, 0.1),
  ],
  oeffnungen: [
    o("t-eingang", "w-treppe", "tuer", 413.5, 0.9),
    o("t-zimmer", "w-zimmer", "tuer", 302.5, 0.85),
    o("t-bad", "w-flur", "tuer", 33, 0.6),
    o("t-kueche", "w-flur", "tuer", 173, 0.85),
    o("f-zimmer1", "w-hof", "fenster", 174.5, 1.1),
    o("f-zimmer2", "w-hof", "fenster", 374.5, 1.1),
    o("f-bad", "w-hof", "fenster", 520.5, 0.35),
    o("f-kueche", "w-kueche-oben", "fenster", 125, 1.1),
  ],
  raeume: [
    r("r-zimmer", "Zimmer", "zimmer", [[123, 233], [604, 233], [604, 573], [123, 573]]),
    r("r-bad", "Bad", "bad", [[609, 233], [688, 233], [688, 455], [609, 455]]),
    r("r-kueche", "Küche", "kueche", [[693, 107], [914, 107], [914, 270], [891, 270], [891, 455], [693, 455]]),
    r("r-flur", "Flur", "flur", [[607, 458], [912, 458], [912, 573], [607, 573]]),
  ],
};

/** Quergebäude rechts, EG (WE 39). */
const QR_EG: Grundriss3dPlan = {
  version: 1, nordWinkel: 0,
  waende: [
    w("w-grenze", 80.5, 74, 80.5, 957, 0.4),
    w("w-brand", 80.5, 74, 637, 74, 0.3),
    w("w-zimmer-rechts", 637, 74, 637, 445, 0.4),
    w("w-erker", 637, 445, 563.5, 565, 0.45),
    w("w-hof", 563.5, 565, 563.5, 957, 0.45),
    w("w-treppe", 80.5, 957, 563.5, 957, 0.45),
    w("w-zimmer-unten", 102, 462, 388, 462, 0.12),
    w("w-schraeg", 388, 462, 537, 560, 0.12),
    w("w-flur", 204, 462, 204, 935, 0.1),
    w("w-kueche-zimmer", 207, 731.5, 537, 731.5, 0.1),
    w("w-kueche-bad", 382, 731.5, 382, 935, 0.1),
  ],
  oeffnungen: [
    o("t-eingang", "w-treppe", "tuer", 67.5, 0.85),
    o("t-zimmer-gross", "w-zimmer-unten", "tuer", 45, 0.8),
    o("t-zimmer", "w-flur", "tuer", 128, 0.85),
    o("t-kueche", "w-flur", "tuer", 340, 0.85),
    o("t-bad", "w-kueche-bad", "tuer", 40, 0.7),
    o("f-erker", "w-erker", "fenster", 70.4, 1.2),
    o("f-zimmer", "w-hof", "fenster", 95, 0.6),
    o("f-bad", "w-hof", "fenster", 197, 0.9),
  ],
  raeume: [
    r("r-zimmer-gross", "Zimmer", "zimmer", [[102, 90], [616, 90], [616, 445], [545, 556], [390, 459], [102, 459]]),
    r("r-zimmer", "Zimmer", "zimmer", [[207, 465], [388, 465], [537, 560], [537, 729], [207, 729]]),
    r("r-kueche", "Küche", "kueche", [[207, 734], [379, 734], [379, 935], [207, 935]]),
    r("r-flur", "Flur", "flur", [[102, 465], [201, 465], [201, 957], [102, 957]]),
    r("r-bad", "Bad", "bad", [[388, 742], [535, 742], [535, 924], [388, 924]]),
  ],
};

/** Quergebäude rechts, 2. OG (WE 43). */
const QR_2: Grundriss3dPlan = {
  version: 1, nordWinkel: 0,
  waende: [
    w("w-grenze", 74.5, 68.5, 74.5, 957, 0.4),
    w("w-brand", 74.5, 68.5, 631.5, 68.5, 0.3),
    w("w-zimmer-rechts", 631.5, 68.5, 631.5, 445, 0.4),
    w("w-erker", 631.5, 445, 568, 565, 0.45),
    w("w-hof", 568, 565, 568, 957, 0.45),
    w("w-treppe", 74.5, 957, 568, 957, 0.45),
    w("w-zimmer-unten", 90, 462, 388, 462, 0.12),
    w("w-schraeg", 388, 462, 546, 560, 0.12),
    w("w-flur", 204, 462, 204, 935, 0.1),
    w("w-kueche-zimmer", 207, 710, 546, 710, 0.1),
    w("w-kueche-bad", 382, 710, 382, 935, 0.1),
    w("w-ar-oben", 442, 884.5, 546, 884.5, 0.1),
    w("w-ar", 442, 884.5, 442, 959, 0.1),
  ],
  oeffnungen: [
    o("t-eingang", "w-treppe", "tuer", 73.5, 0.85),
    o("t-zimmer-gross", "w-zimmer-unten", "tuer", 57, 0.8),
    o("t-zimmer", "w-flur", "tuer", 128, 0.85),
    o("t-kueche", "w-flur", "tuer", 340, 0.85),
    o("t-bad", "w-kueche-bad", "tuer", 40, 0.7),
    o("f-erker", "w-erker", "fenster", 67.9, 1.2),
    o("f-zimmer", "w-hof", "fenster", 95, 0.6),
    o("f-bad", "w-hof", "fenster", 197, 0.9),
    o("t-ar", "w-ar-oben", "tuer", 30, 0.6),
  ],
  raeume: [
    r("r-zimmer-gross", "Zimmer", "zimmer", [[90, 79], [610.5, 79], [610.5, 445], [545, 556], [390, 459], [90, 459]]),
    r("r-zimmer", "Zimmer", "zimmer", [[207, 465], [388, 465], [546, 560], [546, 707.5], [207, 707.5]]),
    r("r-kueche", "Küche", "kueche", [[207, 712.5], [379, 712.5], [379, 935], [207, 935]]),
    r("r-flur", "Flur", "flur", [[90, 465], [201, 465], [201, 957], [90, 957]]),
    r("r-bad", "Bad", "bad", [[385, 712.5], [546, 712.5], [546, 882], [439, 882], [439, 959], [385, 959]]),
    r("r-ar", "Abstellraum", "abstell", [[445, 887], [546, 887], [546, 959], [445, 959]]),
  ],
};

/** Quergebäude rechts, 3. und 4. OG (WE 45, 47). */
const QR_OG: Grundriss3dPlan = {
  version: 1, nordWinkel: 0,
  waende: [
    w("w-grenze", 74.5, 68.5, 74.5, 957, 0.4),
    w("w-brand", 74.5, 68.5, 631.5, 68.5, 0.3),
    w("w-zimmer-rechts", 631.5, 68.5, 631.5, 445, 0.4),
    w("w-erker", 631.5, 445, 574.5, 565, 0.45),
    w("w-hof", 574.5, 565, 574.5, 957, 0.45),
    w("w-treppe", 74.5, 957, 574.5, 957, 0.45),
    w("w-zimmer-unten", 90, 462, 388, 462, 0.12),
    w("w-schraeg", 388, 462, 559, 560, 0.12),
    w("w-flur", 204, 462, 204, 935, 0.1),
    w("w-kueche-zimmer", 207, 712.5, 559, 712.5, 0.1),
    w("w-kueche-bad", 382, 712.5, 382, 935, 0.1),
    w("w-ar-oben", 442, 884.5, 559, 884.5, 0.1),
    w("w-ar", 442, 884.5, 442, 959, 0.1),
  ],
  oeffnungen: [
    o("t-eingang", "w-treppe", "tuer", 73.5, 0.85),
    o("t-zimmer-gross", "w-zimmer-unten", "tuer", 57, 0.8),
    o("t-zimmer", "w-flur", "tuer", 128, 0.85),
    o("t-kueche", "w-flur", "tuer", 340, 0.85),
    o("t-bad", "w-kueche-bad", "tuer", 40, 0.7),
    o("f-erker", "w-erker", "fenster", 66.4, 1.2),
    o("f-zimmer", "w-hof", "fenster", 95, 0.6),
    o("f-bad", "w-hof", "fenster", 197, 0.9),
    o("t-ar", "w-ar-oben", "tuer", 30, 0.6),
  ],
  raeume: [
    r("r-zimmer-gross", "Zimmer", "zimmer", [[90, 79], [610.5, 79], [610.5, 445], [545, 556], [390, 459], [90, 459]]),
    r("r-zimmer", "Zimmer", "zimmer", [[207, 465], [388, 465], [559, 560], [559, 710], [207, 710]]),
    r("r-kueche", "Küche", "kueche", [[207, 715], [379, 715], [379, 935], [207, 935]]),
    r("r-flur", "Flur", "flur", [[90, 465], [201, 465], [201, 957], [90, 957]]),
    r("r-bad", "Bad", "bad", [[385, 715], [559, 715], [559, 882], [439, 882], [439, 959], [385, 959]]),
    r("r-ar", "Abstellraum", "abstell", [[445, 887], [559, 887], [559, 959], [445, 959]]),
  ],
};

/** Quergebäude links, 1. OG (WE 40). */
const QL_1: Grundriss3dPlan = {
  version: 1, nordWinkel: 0,
  waende: [
    w("w-grenze", 81, 91, 81, 972.5, 0.35),
    w("w-treppe", 81, 91, 568, 91, 0.45),
    w("w-hof", 568, 91, 568, 480, 0.45),
    w("w-erker", 568, 480, 631.5, 600, 0.45),
    w("w-zimmer-rechts", 631.5, 600, 631.5, 972.5, 0.35),
    w("w-brand", 81, 972.5, 631.5, 972.5, 0.3),
    w("w-flur", 204, 91, 204, 570, 0.1),
    w("w-kueche-bad", 382, 91, 382, 336, 0.1),
    w("w-kueche-zimmer", 207, 336, 546, 336, 0.1),
    w("w-ar", 442, 91, 442, 168, 0.1),
    w("w-ar-unten", 442, 168, 546, 168, 0.1),
    w("w-zimmer-unten", 103, 570, 420, 570, 0.12),
    w("w-schraeg", 420, 570, 546, 488, 0.12),
  ],
  oeffnungen: [
    o("t-eingang", "w-treppe", "tuer", 64, 0.85),
    o("t-kueche", "w-flur", "tuer", 124, 0.85),
    o("t-zimmer", "w-flur", "tuer", 339, 0.85),
    o("t-zimmer-gross", "w-zimmer-unten", "tuer", 37, 0.8),
    o("t-bad", "w-kueche-zimmer", "tuer", 208, 0.7),
    o("t-ar", "w-ar-unten", "tuer", 50, 0.6),
    o("f-ar", "w-hof", "fenster", 19, 0.35),
    o("f-bad", "w-hof", "fenster", 131, 0.95),
    o("f-zimmer", "w-hof", "fenster", 271, 0.55),
    o("f-erker", "w-erker", "fenster", 67.9, 1.2),
  ],
  raeume: [
    r("r-kueche", "Küche", "kueche", [[207, 113], [379, 113], [379, 333], [207, 333]]),
    r("r-ar", "Abstellraum", "abstell", [[445, 90], [546, 90], [546, 165], [445, 165]]),
    r("r-bad", "Bad", "bad", [[385, 111], [442, 111], [442, 171], [546, 171], [546, 333], [385, 333]]),
    r("r-zimmer", "Zimmer", "zimmer", [[207, 339], [546, 339], [546, 488], [420, 567], [207, 567]]),
    r("r-flur", "Flur", "flur", [[103, 96], [201, 96], [201, 570], [103, 570]]),
    r("r-zimmer-gross", "Zimmer", "zimmer", [[103, 573], [420, 573], [546, 490], [616, 600], [616, 957], [103, 957]]),
  ],
};

/** Quergebäude links, 2. OG (WE 42). */
const QL_2: Grundriss3dPlan = {
  version: 1, nordWinkel: 0,
  waende: [
    w("w-grenze", 74.5, 91, 74.5, 978, 0.35),
    w("w-treppe", 74.5, 91, 568, 91, 0.45),
    w("w-hof", 568, 91, 568, 480, 0.45),
    w("w-erker", 568, 480, 631.5, 600, 0.45),
    w("w-zimmer-rechts", 631.5, 600, 631.5, 978, 0.35),
    w("w-brand", 74.5, 978, 631.5, 978, 0.3),
    w("w-flur", 204, 91, 204, 570, 0.1),
    w("w-kueche-bad", 382, 91, 382, 336, 0.1),
    w("w-kueche-zimmer", 207, 336, 546, 336, 0.1),
    w("w-ar", 442, 91, 442, 168, 0.1),
    w("w-ar-unten", 442, 168, 546, 168, 0.1),
    w("w-zimmer-unten", 90, 570, 420, 570, 0.12),
    w("w-schraeg", 420, 570, 546, 488, 0.12),
  ],
  oeffnungen: [
    o("t-eingang", "w-treppe", "tuer", 70.5, 0.85),
    o("t-kueche", "w-flur", "tuer", 124, 0.85),
    o("t-zimmer", "w-flur", "tuer", 339, 0.85),
    o("t-zimmer-gross", "w-zimmer-unten", "tuer", 50, 0.8),
    o("t-bad", "w-kueche-zimmer", "tuer", 208, 0.7),
    o("t-ar", "w-ar-unten", "tuer", 50, 0.6),
    o("f-ar", "w-hof", "fenster", 19, 0.35),
    o("f-bad", "w-hof", "fenster", 131, 0.95),
    o("f-zimmer", "w-hof", "fenster", 271, 0.55),
    o("f-erker", "w-erker", "fenster", 67.9, 1.2),
  ],
  raeume: [
    r("r-kueche", "Küche", "kueche", [[207, 113], [379, 113], [379, 333], [207, 333]]),
    r("r-ar", "Abstellraum", "abstell", [[445, 90], [546, 90], [546, 165], [445, 165]]),
    r("r-bad", "Bad", "bad", [[385, 111], [442, 111], [442, 171], [546, 171], [546, 333], [385, 333]]),
    r("r-zimmer", "Zimmer", "zimmer", [[207, 339], [546, 339], [546, 488], [420, 567], [207, 567]]),
    r("r-flur", "Flur", "flur", [[90, 96], [201, 96], [201, 570], [90, 570]]),
    r("r-zimmer-gross", "Zimmer", "zimmer", [[90, 573], [420, 573], [546, 490], [616, 600], [616, 968], [90, 968]]),
  ],
};

/** Quergebäude links, 3. und 4. OG (WE 44, 46). */
const QL_3: Grundriss3dPlan = {
  version: 1, nordWinkel: 0,
  waende: [
    w("w-grenze", 74.5, 91, 74.5, 978, 0.35),
    w("w-treppe", 74.5, 91, 574.5, 91, 0.45),
    w("w-hof", 574.5, 91, 574.5, 480, 0.45),
    w("w-erker", 574.5, 480, 631.5, 600, 0.45),
    w("w-zimmer-rechts", 631.5, 600, 631.5, 978, 0.35),
    w("w-brand", 74.5, 978, 631.5, 978, 0.3),
    w("w-flur", 204, 91, 204, 570, 0.1),
    w("w-kueche-bad", 382, 91, 382, 327, 0.1),
    w("w-kueche-zimmer", 207, 327, 559, 327, 0.1),
    w("w-ar", 442, 91, 442, 168, 0.1),
    w("w-ar-unten", 442, 168, 559, 168, 0.1),
    w("w-zimmer-unten", 90, 570, 420, 570, 0.12),
    w("w-schraeg", 420, 570, 559, 488, 0.12),
  ],
  oeffnungen: [
    o("t-eingang", "w-treppe", "tuer", 70.5, 0.85),
    o("t-kueche", "w-flur", "tuer", 124, 0.85),
    o("t-zimmer", "w-flur", "tuer", 339, 0.85),
    o("t-zimmer-gross", "w-zimmer-unten", "tuer", 50, 0.8),
    o("t-bad", "w-kueche-zimmer", "tuer", 208, 0.7),
    o("t-ar", "w-ar-unten", "tuer", 50, 0.6),
    o("f-ar", "w-hof", "fenster", 19, 0.35),
    o("f-bad", "w-hof", "fenster", 131, 0.95),
    o("f-zimmer", "w-hof", "fenster", 271, 0.55),
    o("f-erker", "w-erker", "fenster", 66.4, 1.2),
  ],
  raeume: [
    r("r-kueche", "Küche", "kueche", [[207, 113], [379, 113], [379, 324], [207, 324]]),
    r("r-ar", "Abstellraum", "abstell", [[445, 90], [559, 90], [559, 165], [445, 165]]),
    r("r-bad", "Bad", "bad", [[385, 111], [442, 111], [442, 171], [559, 171], [559, 324], [385, 324]]),
    r("r-zimmer", "Zimmer", "zimmer", [[207, 330], [559, 330], [559, 488], [420, 567], [207, 567]]),
    r("r-flur", "Flur", "flur", [[90, 96], [201, 96], [201, 570], [90, 570]]),
    r("r-zimmer-gross", "Zimmer", "zimmer", [[90, 573], [420, 573], [559, 490], [616, 600], [616, 968], [90, 968]]),
  ],
};

/** Vorderhaus Mitte rechts, 4. OG (WE 17). */
const VH_MR4: Grundriss3dPlan = {
  version: 1, nordWinkel: 0,
  waende: [
    w("w-oben", 106.5, 89, 634, 89, 0.25),
    w("w-strasse", 634, 89, 634, 740, 0.4),
    w("w-unten", 106.5, 740, 634, 740, 0.25),
    w("w-links", 106.5, 89, 106.5, 740, 0.35),
    w("w-flur", 228, 99, 228, 391.5, 0.1),
    w("w-bad-oben", 230, 306.5, 618, 306.5, 0.1),
    w("w-bad-unten", 122, 391.5, 618, 391.5, 0.1),
    w("w-balkon-o", 634, 285, 743, 285, 0.1),
    w("w-balkon-r", 743, 285, 743, 543, 0.1),
    w("w-balkon-u", 634, 543, 743, 543, 0.1),
  ],
  oeffnungen: [
    o("t-eingang", "w-links", "tuer", 41, 0.9),
    o("t-kueche", "w-flur", "tuer", 91, 0.85),
    o("t-bad", "w-flur", "tuer", 251, 0.7),
    o("t-zimmer", "w-bad-unten", "tuer", 53, 0.85),
    o("t-balkon", "w-strasse", "tuer", 381, 0.9),
    o("f-kueche", "w-strasse", "fenster", 116, 1),
    o("f-bad", "w-strasse", "fenster", 251, 0.4),
    o("f-zimmer", "w-strasse", "fenster", 531, 1),
    o("f-balkon", "w-balkon-r", "fenster", 128, 2.4),
  ],
  raeume: [
    r("r-kueche", "Küche", "kueche", [[230, 134], [412, 134], [412, 99], [618, 99], [618, 303], [230, 303]]),
    r("r-bad", "Bad", "bad", [[230, 310], [618, 310], [618, 388], [230, 388]]),
    r("r-flur", "Flur", "flur", [[122, 90], [226, 90], [226, 390], [122, 390]]),
    r("r-zimmer", "Zimmer", "zimmer", [[122, 395], [618, 395], [618, 729], [122, 729]]),
    r("r-balkon", "Balkon", "balkon", [[655, 290], [740, 290], [740, 540], [655, 540]]),
  ],
};

/** Einheitennummer und Plan, so wie sie in `wohnungen.meta.grundriss3d` landen. */
export const BARFUSS9_WEITERE: Array<{ we: number; plan: Grundriss3dPlan }> = [
  { we: 28, plan: imHaus(RSL_EG, 0, 5.529, 1.060) },
  { we: 30, plan: imHaus(RSL_OG, 1, 5.603, 1.066) },
  { we: 32, plan: imHaus(RSL_OG, 2, 5.603, 1.066) },
  { we: 31, plan: imHaus(RSR_1, 1, 17.149, 1.077) },
  { we: 35, plan: imHaus(RSR_3, 3, 17.149, 1.134) },
  { we: 37, plan: imHaus(RSR_3, 4, 17.149, 1.134) },
  { we: 20, plan: imHaus(LSL_1, 1, 17.149, 18.937) },
  { we: 24, plan: imHaus(LSL_3, 3, 17.149, 18.874) },
  { we: 23, plan: imHaus(LSR_2, 2, 5.597, 18.874) },
  { we: 25, plan: imHaus(LSR_3, 3, 5.597, 18.874) },
  { we: 39, plan: imHaus(QR_EG, 0, -0.460, 1.134) },
  { we: 43, plan: imHaus(QR_2, 2, -0.391, 1.197) },
  { we: 45, plan: imHaus(QR_OG, 3, -0.391, 1.197) },
  { we: 47, plan: imHaus(QR_OG, 4, -0.391, 1.197) },
  { we: 40, plan: imHaus(QL_1, 1, -0.466, 14.486) },
  { we: 42, plan: imHaus(QL_2, 2, -0.391, 14.423) },
  { we: 44, plan: imHaus(QL_3, 3, -0.391, 14.423) },
  { we: 46, plan: imHaus(QL_3, 4, -0.391, 14.423) },
  { we: 17, plan: imHaus(VH_MR4, 4, 37.034, 12.773) },
];
