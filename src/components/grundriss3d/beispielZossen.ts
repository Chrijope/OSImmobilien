import type { Grundriss3dPlan, Oeffnung, Punkt, Raum, RaumTyp, Wand } from "./plan";

/*
 * Waldsiedlung Zossen-Wünsdorf (17.10.2026): Mustergrundrisse der Haustypen
 * aus dem Drive-Ordner „Grundrisse aller Haustypen“ (Scans mit Bemaßung).
 *   DHH 1 (klein, 91 m²):  Luisenstraße 72
 *   DHH 2 (groß, 121 m²):  Agnesstraße 29 und 30
 * Die Exposés nennen sie ausdrücklich Mustergrundrisse des Haustyps; das
 * einzelne Haus kann abweichen. Die Scans sind nachgezeichnet (keine
 * Vektordaten), Maßstab je Seite aus den Maßketten, Genauigkeit etwa 5 cm.
 *
 * Koordinaten: Bildpunkte der halbierten Scanseite, umgerechnet in Meter des
 * Erdgeschosses. Das Dachgeschoss wird über das Erdgeschoss gelegt (bei DHH 2
 * ist die Seite um 180° gedreht gezeichnet).
 */

type Abb = (x: number, y: number) => Punkt;

function bauer(abb: Abb, massstab: number) {
  const waende: Wand[] = [], oeffnungen: Oeffnung[] = [], raeume: Raum[] = [];
  let n = 0;
  const api = {
    /** Wand von (x1,y1) nach (x2,y2) in Bildpunkten, Öffnungen als [Art, von, bis] entlang der Wand in Bildpunkten. */
    wand(x1: number, y1: number, x2: number, y2: number, dicke: number, ...oeff: Array<["tuer" | "fenster", number, number]>) {
      const id = `w${++n}`;
      waende.push({ id, a: abb(x1, y1), b: abb(x2, y2), dicke });
      const laengs = Math.abs(x2 - x1) > Math.abs(y2 - y1);
      const start = laengs ? x1 : y1, richtung = Math.sign((laengs ? x2 : y2) - start) || 1;
      for (const [art, von, bis] of oeff) {
        const mitte = ((von + bis) / 2 - start) * richtung / massstab;
        oeffnungen.push({ id: `${id}${art[0]}${oeffnungen.length}`, wandId: id, art, position: mitte, breite: Math.abs(bis - von) / massstab });
      }
      return api;
    },
    raum(name: string, typ: RaumTyp, ...punkte: number[]) {
      const p: Punkt[] = [];
      for (let i = 0; i < punkte.length; i += 2) p.push(abb(punkte[i], punkte[i + 1]));
      raeume.push({ id: `r${raeume.length + 1}`, name, typ, punkte: p });
      return api;
    },
    plan(geschoss: number): Grundriss3dPlan {
      return { version: 1, nordWinkel: 0, geschoss, waende, oeffnungen, raeume };
    },
  };
  return api;
}

/* ── DHH 2 (Agnesstraße 29, 30) ── */

const S2 = 78.7;
const eg2: Abb = (x, y) => ({ x: x / S2, y: y / S2 });
// Dachgeschoss um 180° gedreht gezeichnet; über die Treppe ausgerichtet.
const dg2: Abb = (x, y) => ({ x: (825 - x) / S2, y: (1000 - y) / S2 });

const DHH2_EG = bauer(eg2, S2)
  .wand(108, 135, 695, 135, 0.36, ["fenster", 185, 265], ["fenster", 412, 482])
  .wand(108, 135, 108, 868, 0.36, ["fenster", 515, 700])
  .wand(695, 135, 695, 868, 0.36, ["fenster", 345, 395], ["tuer", 515, 578], ["tuer", 642, 742])
  .wand(108, 868, 695, 868, 0.36)
  .wand(388, 135, 388, 590, 0.12, ["tuer", 518, 582])
  .wand(108, 382, 388, 382, 0.12, ["tuer", 258, 322])
  .wand(388, 332, 695, 332, 0.12, ["tuer", 405, 470])
  .wand(518, 332, 518, 492, 0.12, ["tuer", 348, 400])
  .wand(518, 405, 695, 405, 0.12)
  .wand(482, 492, 695, 492, 0.12)
  .wand(388, 590, 695, 590, 0.12, ["tuer", 600, 680])
  .raum("Küche", "kueche", 120, 142, 380, 142, 380, 375, 120, 375)
  .raum("Arbeiten / Gäste", "schlafen", 395, 142, 685, 142, 685, 327, 395, 327)
  .raum("WC", "bad", 523, 338, 685, 338, 685, 400, 523, 400)
  .raum("Treppe", "treppenhaus", 524, 410, 685, 410, 685, 487, 524, 487)
  .raum("Flur", "flur", 395, 338, 512, 338, 512, 497, 685, 497, 685, 585, 395, 585)
  .raum("Wohnen / Essen", "wohnen", 120, 388, 382, 388, 382, 596, 685, 596, 685, 862, 120, 862)
  .plan(0);

const DHH2_DG = bauer(dg2, S2)
  .wand(172, 140, 670, 140, 0.3)
  .wand(172, 140, 172, 878, 0.3)
  .wand(670, 140, 670, 878, 0.3)
  .wand(172, 878, 670, 878, 0.3, ["fenster", 290, 370], ["fenster", 465, 545])
  .wand(400, 140, 400, 410, 0.12)
  .wand(172, 505, 355, 505, 0.12)
  .wand(355, 410, 355, 505, 0.12, ["tuer", 425, 497])
  .wand(445, 410, 445, 512, 0.12, ["tuer", 425, 497])
  .wand(445, 512, 670, 512, 0.12)
  .wand(405, 512, 405, 878, 0.12, ["tuer", 575, 635])
  .wand(172, 650, 405, 650, 0.12, ["tuer", 320, 392])
  .wand(245, 595, 245, 650, 0.1)
  .raum("Zimmer 1", "schlafen", 180, 150, 395, 150, 395, 405, 350, 405, 350, 500, 180, 500)
  .raum("Zimmer 2", "schlafen", 405, 150, 663, 150, 663, 505, 450, 505, 450, 405, 405, 405)
  .raum("Zimmer 3", "schlafen", 410, 518, 663, 518, 663, 872, 410, 872)
  .raum("Bad", "bad", 180, 656, 398, 656, 398, 872, 180, 872)
  .raum("Abstellraum", "abstell", 180, 598, 240, 598, 240, 646, 180, 646)
  .raum("Treppe", "treppenhaus", 180, 508, 348, 508, 348, 588, 180, 588)
  .raum("Flur", "flur", 360, 412, 440, 412, 440, 640, 400, 640, 400, 646, 250, 646, 250, 594, 360, 594)
  .plan(1);

/* ── DHH 1 (Luisenstraße 72) ── */

const S1 = 79.5;
const eg1: Abb = (x, y) => ({ x: x / S1, y: y / S1 });
// Dachgeschoss gleich ausgerichtet, Seite im Maßstab 78 px/m; Mitte auf die Mitte des Erdgeschosses gelegt.
const dg1: Abb = (x, y) => ({ x: (x - 442) / 78 + 447 / S1, y: (y - 476) / 78 + 433 / S1 });

const DHH1_EG = bauer(eg1, S1)
  .wand(150, 148, 745, 148, 0.36, ["fenster", 182, 245], ["tuer", 377, 443], ["fenster", 520, 660])
  .wand(150, 148, 150, 718, 0.36, ["tuer", 398, 482], ["fenster", 560, 655])
  .wand(745, 148, 745, 718, 0.36, ["fenster", 345, 448], ["fenster", 585, 688])
  .wand(150, 718, 745, 718, 0.36)
  .wand(330, 148, 330, 322, 0.12, ["tuer", 172, 230], ["tuer", 262, 316])
  .wand(150, 254, 330, 254, 0.1)
  .wand(150, 322, 422, 322, 0.12)
  .wand(150, 397, 422, 397, 0.12)
  .wand(445, 148, 445, 490, 0.12, ["tuer", 402, 480])
  .wand(445, 325, 745, 325, 0.12, ["tuer", 560, 625])
  .wand(150, 490, 445, 490, 0.12)
  .raum("WC", "bad", 160, 158, 322, 158, 322, 250, 160, 250)
  .raum("Therme", "abstell", 160, 258, 322, 258, 322, 316, 160, 316)
  .raum("Treppe", "treppenhaus", 160, 328, 418, 328, 418, 391, 160, 391)
  .raum("Flur", "flur", 338, 158, 440, 158, 440, 484, 160, 484, 160, 403, 424, 403, 424, 318, 338, 318)
  .raum("Küche", "kueche", 452, 158, 738, 158, 738, 318, 452, 318)
  .raum("Wohnen / Essen", "wohnen", 452, 332, 738, 332, 738, 712, 160, 712, 160, 497, 452, 497)
  .plan(0);

const DHH1_DG = bauer(dg1, 78)
  .wand(172, 182, 713, 182, 0.3, ["fenster", 300, 390], ["fenster", 500, 575])
  .wand(172, 182, 172, 765, 0.3)
  .wand(713, 182, 713, 765, 0.3)
  .wand(172, 765, 713, 765, 0.3)
  .wand(465, 182, 465, 375, 0.12)
  .wand(172, 360, 395, 360, 0.12, ["tuer", 330, 385])
  .wand(172, 443, 380, 443, 0.12)
  .wand(520, 375, 520, 440, 0.12, ["tuer", 380, 437])
  .wand(520, 440, 713, 440, 0.12)
  .wand(380, 518, 520, 518, 0.12, ["tuer", 383, 418], ["tuer", 448, 510])
  .wand(425, 518, 425, 765, 0.12)
  .raum("Bad", "bad", 180, 190, 458, 190, 458, 354, 180, 354)
  .raum("Kinder / Gäste / Arbeiten", "schlafen", 472, 190, 706, 190, 706, 434, 526, 434, 526, 368, 472, 368)
  .raum("Treppe", "treppenhaus", 180, 366, 376, 366, 376, 437, 180, 437)
  .raum("Flur", "flur", 384, 366, 514, 366, 514, 512, 384, 512)
  .raum("Zimmer", "schlafen", 180, 449, 376, 449, 376, 524, 419, 524, 419, 758, 180, 758)
  .raum("Schlafen", "schlafen", 431, 446, 706, 446, 706, 758, 431, 758)
  .plan(1);

export const ZOSSEN_DHH1 = { name: "Haustyp DHH 1 (Mustergrundriss)", etagen: [
  { geschoss: 0, titel: "Erdgeschoss", plan: DHH1_EG },
  { geschoss: 1, titel: "Dachgeschoss", plan: DHH1_DG },
] };
export const ZOSSEN_DHH2 = { name: "Haustyp DHH 2 (Mustergrundriss)", etagen: [
  { geschoss: 0, titel: "Erdgeschoss", plan: DHH2_EG },
  { geschoss: 1, titel: "Dachgeschoss", plan: DHH2_DG },
] };
