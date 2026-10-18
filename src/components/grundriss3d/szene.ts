import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  FENSTER_BRUESTUNG, FENSTER_HOEHE, TUER_HOEHE, flaeche, laenge, planRahmen, punktInPolygon, qm, rahmen, schwerpunkt, wirksamerTyp,
  type Aussehen, type Flaechen, type Seite, type Grundriss3dPlan, type HausPlan, type Punkt, type XY, type Raum, type RaumTyp, type Wand,
} from "./plan";
import { balkon, faerbeFassade, flaechenDach, kappeAnDach, kappeUnterKarte, mansarde, rechteckPunkte, steildach, type Kontur } from "./aussen";

/*
 * Baut aus Plänen eine three.js-Szene. Nur dieses Modul und die Ansicht
 * importieren three; beide werden erst geladen, wenn eine 3D-Ansicht
 * wirklich gebraucht wird (eigener Chunk, siehe Grundriss3dBlock).
 *
 * Plan (x, y) wird zu three (x, Höhe, y): y im Plan zeigt nach unten, z in
 * three zum Betrachter. Von oben gesehen liegt der Plan damit so wie im Bild.
 */

export type StilId = "modern" | "skandinavisch" | "altbau" | "leer";

interface Stil {
  name: string;
  boden: string;
  fuge: string;
  wand: string;
  holz: string;
  stoff: string;
  akzent: string;
  korpus: string;
  metall: string;
  teppich: string;
}

export const STILE: Record<StilId, Stil> = {
  modern: { name: "Modern", boden: "#b48a5e", fuge: "#8d6a45", wand: "#f3f2ef", holz: "#7a5a3c", stoff: "#596068", akzent: "#c9a45c", korpus: "#f6f6f4", metall: "#2c2c2c", teppich: "#a3a7ab" },
  skandinavisch: { name: "Skandinavisch", boden: "#dcc39c", fuge: "#c2a67c", wand: "#fbfaf6", holz: "#d8bd94", stoff: "#d4dad5", akzent: "#7f9c8a", korpus: "#ffffff", metall: "#bdbdbd", teppich: "#ebe4d8" },
  altbau: { name: "Altbau klassisch", boden: "#8a5a36", fuge: "#6a4126", wand: "#f2ebdf", holz: "#5a3a26", stoff: "#7a3434", akzent: "#b08a3e", korpus: "#efe6d6", metall: "#8f7742", teppich: "#7d4f3d" },
  leer: { name: "Leer (ohne Möbel)", boden: "#c9a57c", fuge: "#a8865f", wand: "#f5f4f1", holz: "#a07850", stoff: "#cccccc", akzent: "#cccccc", korpus: "#eeeeee", metall: "#999999", teppich: "#dddddd" },
};

export const WANDHOEHEN = [2.5, 2.65, 2.8, 3.0, 3.2];

export interface SzenenOptionen {
  wandhoehe: number;
  stil: StilId;
  beschriftung: boolean;
  /** Zusätzlicher Abstand zwischen den Geschossen in Metern (Explosionsansicht). */
  explosion: number;
  /** Nur dieses Geschoss zeigen; undefined = alle. */
  nurGeschoss?: number;
  /** Farbe der Außenwände in der Hausansicht, etwa aus dem Titelbild. */
  fassade?: string;
  /** Schnittansicht: Wände bei 1,20 m gekappt, wie ein Puppenhaus von oben. */
  schnitt?: boolean;
  /** Fassade, Dach und Balkone nach Fotos; nur in der Hausansicht. */
  aussehen?: Aussehen;
}

export const SCHNITT_HOEHE = 1.2;

export const GESCHOSS_TEXT = (g: number) => (g === 0 ? "Erdgeschoss" : g < 0 ? `${-g}. Untergeschoss` : `${g}. Obergeschoss`);

export interface Einheit3d { plan: Grundriss3dPlan; titel?: string }

export interface Szene {
  gruppe: THREE.Group;
  /** Decken, nur in der Begehung sichtbar. */
  decken: THREE.Object3D[];
  /** Wandkappen und Beschriftungen, nur in der Rundumsicht. */
  nurRundum: THREE.Object3D[];
  /** Für die Begehung: Wände je Geschoss mit Türen, gegen die man läuft. */
  hindernisse: Array<{ wand: Wand; versatz: Punkt; tueren: Array<[number, number]> }>;
  /** Startpunkt der Begehung: im größten Raum des untersten gezeigten Geschosses, am Rand. */
  start: THREE.Vector3;
  /** Blickrichtung zum Start (Drehung um die Hochachse): entlang der langen Raumachse. */
  startBlick: number;
  /** Fensterglas, nachts leuchtend. */
  glas: THREE.MeshStandardMaterial;
  /** Deckenleuchten je Raum (Weltkoordinaten), für das Nachtlicht. */
  lichtpunkte: THREE.Vector3[];
  /** Stationen des automatischen Rundgangs: Räume, im ganzen Haus die Geschosse. */
  stationen: Array<{ ziel: THREE.Vector3; name: string }>;
  rahmen: THREE.Box3;
}

const DECKE = 0.3;

/* ── Materialien und Muster ────────────────────────────────────────── */

function muster(zeichnen: (c: CanvasRenderingContext2D, g: number) => void, groesse = 256, wiederholung = 1): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = groesse;
  const k = c.getContext("2d");
  if (k) zeichnen(k, groesse);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(wiederholung, wiederholung);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Dielen, ein Bild entspricht einem Meter. */
function dielen(farbe: string, fuge: string): THREE.Texture {
  return muster((k, g) => {
    const reihen = 6;
    const h = g / reihen;
    const basis = new THREE.Color(farbe);
    for (let r = 0; r < reihen; r++) {
      let x = -((r * 97) % g);
      while (x < g) {
        const l = g * (0.9 + ((r * 31 + x) % 7) / 10);
        const c = basis.clone().offsetHSL(0, 0, (((r * 13 + Math.floor(x)) % 9) - 4) / 120);
        k.fillStyle = `#${c.getHexString()}`;
        k.fillRect(x, r * h, l, h);
        k.fillStyle = fuge;
        k.fillRect(x, r * h, 1.5, h);
        x += l;
      }
      k.fillStyle = fuge;
      k.fillRect(0, r * h, g, 1.5);
    }
  });
}

/** Fliesen 30 × 30 cm. */
function fliesen(farbe: string, fuge: string): THREE.Texture {
  return muster((k, g) => {
    k.fillStyle = fuge; k.fillRect(0, 0, g, g);
    const n = 3, s = g / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      k.fillStyle = farbe;
      k.fillRect(i * s + 1.5, j * s + 1.5, s - 3, s - 3);
    }
  }, 256, 1 / 0.9);
}

function mat(farbe: string, rauheit = 0.8, metall = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: farbe, roughness: rauheit, metalness: metall });
}

/* ── Wände ─────────────────────────────────────────────────────────── */

function quader(b: number, h: number, t: number, m: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(b, h, t), m);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Ein Stück Wand von t0 bis t1 entlang der Wand, Höhe y0 bis y1. */
function wandStueck(w: Wand, t0: number, t1: number, y0: number, y1: number, m: THREE.Material): THREE.Mesh | null {
  if (t1 - t0 < 0.005 || y1 - y0 < 0.005) return null;
  const l = laenge(w.a, w.b);
  const ux = (w.b.x - w.a.x) / l, uy = (w.b.y - w.a.y) / l;
  const mitte = (t0 + t1) / 2;
  const mesh = quader(t1 - t0, y1 - y0, w.dicke, m);
  mesh.position.set(w.a.x + ux * mitte, (y0 + y1) / 2, w.a.y + uy * mitte);
  mesh.rotation.y = -Math.atan2(uy, ux);
  return mesh;
}

const BRUESTUNG = 1.0;

/** Wand zwischen Balkon (oder Loggia) und draußen: nur Brüstungshöhe, sonst stünde ein Kasten vor der Fassade. */
function istBruestung(plan: Grundriss3dPlan, w: Wand): boolean {
  const l = laenge(w.a, w.b);
  if (l < 0.05) return false;
  const nx = -(w.b.y - w.a.y) / l, ny = (w.b.x - w.a.x) / l;
  const m = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 };
  const seite = (d: number) => plan.raeume.find((r) => punktInPolygon({ x: m.x + nx * d, y: m.y + ny * d }, r.punkte))?.typ;
  const a = seite(w.dicke / 2 + 0.15), b = seite(-(w.dicke / 2 + 0.15));
  return (a === "balkon" && b === undefined) || (b === "balkon" && a === undefined);
}

function baueWaende(plan: Grundriss3dPlan, h: number, wandMat: THREE.Material, kappeMat: THREE.Material, glas: THREE.Material, rahmenMat: THREE.Material, tuerMat: THREE.Material, kappen: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  for (const w of plan.waende) {
    const l = laenge(w.a, w.b);
    // Um die halbe Stärke verlängert, damit Ecken geschlossen sind.
    const ueber = w.dicke / 2;
    if (istBruestung(plan, w)) {
      const b = Math.min(h, BRUESTUNG);
      const teil = wandStueck(w, -ueber, l + ueber, 0, b, wandMat);
      const kappe = wandStueck({ ...w, dicke: w.dicke + 0.03 }, -ueber, l + ueber, b, b + 0.04, rahmenMat);
      if (teil) g.add(teil);
      if (kappe) g.add(kappe);
      continue;
    }
    const oeff = plan.oeffnungen.filter((o) => o.wandId === w.id)
      .map((o) => ({ ...o, von: Math.max(0, o.position - o.breite / 2), bis: Math.min(l, o.position + o.breite / 2) }))
      .sort((a, b) => a.von - b.von);
    let t = -ueber;
    const teile: Array<THREE.Mesh | null> = [];
    for (const o of oeff) {
      teile.push(wandStueck(w, t, o.von, 0, h, wandMat));
      if (o.art === "tuer") {
        teile.push(wandStueck(w, o.von, o.bis, Math.min(TUER_HOEHE, h), h, wandMat));
        // Türblatt, angelehnt offen; im Schnitt ohne, ein halbes Blatt sähe falsch aus.
        if (h < TUER_HOEHE) { t = o.bis; continue; }
        const blatt = quader(o.bis - o.von - 0.02, Math.min(TUER_HOEHE, h) - 0.02, 0.04, tuerMat);
        const ux = (w.b.x - w.a.x) / l, uy = (w.b.y - w.a.y) / l;
        const angel = { x: w.a.x + ux * o.von, y: w.a.y + uy * o.von };
        const halb = (o.bis - o.von) / 2;
        // Zur Seite aufschlagen, auf der ein Raum liegt, nicht ins Treppenhaus oder zum Nachbarn.
        const imRaum = (wk: number) => plan.raeume.some((r) => punktInPolygon({ x: angel.x + Math.cos(-wk) * halb, y: angel.y + Math.sin(-wk) * halb }, r.punkte));
        const winkel = [-Math.atan2(uy, ux) - Math.PI * 0.42, -Math.atan2(uy, ux) + Math.PI * 0.42].find(imRaum) ?? -Math.atan2(uy, ux) - Math.PI * 0.42;
        blatt.position.set(angel.x + Math.cos(-winkel) * halb, (Math.min(TUER_HOEHE, h)) / 2, angel.y + Math.sin(-winkel) * halb);
        blatt.rotation.y = winkel;
        g.add(blatt);
      } else {
        const oben = Math.min(h, FENSTER_BRUESTUNG + FENSTER_HOEHE);
        teile.push(wandStueck(w, o.von, o.bis, 0, FENSTER_BRUESTUNG, wandMat));
        teile.push(wandStueck(w, o.von, o.bis, oben, h, wandMat));
        const scheibe = wandStueck({ ...w, dicke: 0.02 }, o.von, o.bis, FENSTER_BRUESTUNG, oben, glas);
        if (scheibe) { scheibe.castShadow = false; teile.push(scheibe); }
        const bank = wandStueck({ ...w, dicke: w.dicke + 0.04 }, o.von - 0.02, o.bis + 0.02, FENSTER_BRUESTUNG - 0.03, FENSTER_BRUESTUNG, rahmenMat);
        teile.push(bank);
      }
      t = o.bis;
    }
    teile.push(wandStueck(w, t, l + ueber, 0, h, wandMat));
    for (const m of teile) if (m) g.add(m);
    // Dunkle Schnittkante oben wie in einer Architekturzeichnung.
    const kappe = wandStueck(w, -ueber, l + ueber, h, h + 0.015, kappeMat);
    if (kappe) { kappe.castShadow = false; g.add(kappe); kappen.push(kappe); }
  }
  return g;
}

/* ── Böden und Decken ──────────────────────────────────────────────── */

function flaechenGeometrie(punkte: Punkt[]): THREE.ShapeGeometry {
  const form = new THREE.Shape(punkte.map((p) => new THREE.Vector2(p.x, -p.y)));
  const geo = new THREE.ShapeGeometry(form);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/* ── Möbel ─────────────────────────────────────────────────────────── */

interface Mats { wasser: THREE.Material; holz: THREE.Material; stoff: THREE.Material; akzent: THREE.Material; korpus: THREE.Material; metall: THREE.Material; teppich: THREE.Material; weiss: THREE.Material; pflanze: THREE.Material; topf: THREE.Material; glas: THREE.Material; stein: THREE.Material }

function teil(b: number, h: number, t: number, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const q = quader(b, h, t, m);
  q.position.set(x, y, z);
  return q;
}

/* Jedes Möbel steht mit der Rückseite bei z = 0 und zeigt nach +z. */

function sofa(M: Mats, b = 2.2): THREE.Group {
  const g = new THREE.Group();
  g.add(teil(b, 0.42, 0.9, M.stoff, 0, 0.21, 0.45));
  g.add(teil(b, 0.45, 0.2, M.stoff, 0, 0.62, 0.1));
  g.add(teil(0.18, 0.25, 0.9, M.stoff, -b / 2 + 0.09, 0.55, 0.45));
  g.add(teil(0.18, 0.25, 0.9, M.stoff, b / 2 - 0.09, 0.55, 0.45));
  g.add(teil(0.5, 0.12, 0.12, M.akzent, -b / 2 + 0.5, 0.55, 0.3));
  return g;
}
function couchtisch(M: Mats): THREE.Group {
  const g = new THREE.Group();
  g.add(teil(1.1, 0.04, 0.6, M.holz, 0, 0.4, 0.3));
  g.add(teil(1.0, 0.36, 0.5, M.korpus, 0, 0.19, 0.3));
  return g;
}
function teppich(M: Mats, b: number, t: number): THREE.Mesh {
  const q = teil(b, 0.012, t, M.teppich, 0, 0.006, t / 2);
  q.castShadow = false;
  return q;
}
function sideboard(M: Mats, b = 1.8): THREE.Group {
  const g = new THREE.Group();
  g.add(teil(b, 0.5, 0.42, M.korpus, 0, 0.3, 0.21));
  g.add(teil(b, 0.04, 0.44, M.holz, 0, 0.56, 0.22));
  g.add(teil(1.2, 0.7, 0.05, M.metall, 0, 1.3, 0.05));
  return g;
}
function pflanze(M: Mats): THREE.Group {
  const g = new THREE.Group();
  // Grundfläche 0,6 × 0,6 m: Topf und Krone bleiben darin (geprüfte Fläche = gebaute Fläche).
  const topf = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.35, 16), M.topf);
  topf.position.set(0, 0.175, 0.3); topf.castShadow = true;
  const krone = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), M.pflanze);
  krone.position.set(0, 0.75, 0.3); krone.castShadow = true;
  g.add(topf, krone);
  return g;
}
/** Tisch mit Stühlen; Grundfläche b × (t + 1,0) ab z = 0, weil die Stühle 0,5 m vor und hinter dem Tisch stehen. */
function tischMitStuehlen(M: Mats, b = 1.6, t = 0.9, stuehle = 4): THREE.Group {
  const huelle = new THREE.Group();
  const g = new THREE.Group();
  g.position.z = 0.5;
  huelle.add(g);
  g.add(teil(b, 0.04, t, M.holz, 0, 0.74, t / 2));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(teil(0.05, 0.72, 0.05, M.holz, sx * (b / 2 - 0.08), 0.36, t / 2 + sz * (t / 2 - 0.08)));
  const proSeite = Math.max(1, Math.floor(stuehle / 2));
  for (let i = 0; i < proSeite; i++) {
    const x = -b / 2 + (b / proSeite) * (i + 0.5);
    for (const seite of [-1, 1]) {
      const z = t / 2 + seite * (t / 2 + 0.25);
      g.add(teil(0.44, 0.05, 0.44, M.stoff, x, 0.46, z));
      g.add(teil(0.44, 0.45, 0.05, M.stoff, x, 0.7, z + seite * 0.2));
      g.add(teil(0.04, 0.44, 0.04, M.metall, x - 0.18, 0.22, z - 0.18));
      g.add(teil(0.04, 0.44, 0.04, M.metall, x + 0.18, 0.22, z + 0.18));
    }
  }
  return huelle;
}
function bett(M: Mats, b = 1.8, nachttische = true): THREE.Group {
  const g = new THREE.Group();
  g.add(teil(b + 0.1, 0.3, 2.1, M.holz, 0, 0.15, 1.05));
  g.add(teil(b, 0.22, 2.0, M.weiss, 0, 0.41, 1.05));
  g.add(teil(b + 0.1, 0.9, 0.08, M.stoff, 0, 0.6, 0.04));
  g.add(teil(b, 0.06, 1.1, M.akzent, 0, 0.54, 1.45));
  g.add(teil(0.6, 0.12, 0.35, M.weiss, -b / 4, 0.58, 0.3));
  g.add(teil(0.6, 0.12, 0.35, M.weiss, b / 4, 0.58, 0.3));
  if (nachttische) for (const s of [-1, 1]) g.add(teil(0.45, 0.45, 0.4, M.korpus, s * (b / 2 + 0.35), 0.225, 0.2));
  return g;
}
function schrank(M: Mats, b = 2.0): THREE.Group {
  const g = new THREE.Group();
  g.add(teil(b, 2.2, 0.6, M.korpus, 0, 1.1, 0.3));
  const tueren = Math.max(2, Math.round(b / 0.5));
  for (let i = 1; i < tueren; i++) g.add(teil(0.01, 2.1, 0.01, M.metall, -b / 2 + (b / tueren) * i, 1.1, 0.605));
  return g;
}
/** Küchenzeile über die volle Breite b; ab 2,2 m steht links ein Hochschrank mit Kühlschrank innerhalb von b. */
function kuechenzeile(M: Mats, b: number): THREE.Group {
  const g = new THREE.Group();
  const hoch = b > 2.2 ? 0.62 : 0;
  const zb = b - hoch, zx = hoch / 2;
  g.add(teil(zb, 0.86, 0.6, M.korpus, zx, 0.43, 0.3));
  g.add(teil(zb, 0.04, 0.62, M.stein, zx, 0.88, 0.31));
  g.add(teil(zb, 0.7, 0.35, M.korpus, zx, 1.85, 0.175));
  g.add(teil(0.6, 0.02, 0.5, M.metall, zx - zb / 2 + 0.9, 0.905, 0.3));
  g.add(teil(0.5, 0.12, 0.4, M.metall, zx + zb / 2 - 0.8, 0.85, 0.3));
  if (hoch) g.add(teil(0.6, 2.05, 0.6, M.korpus, -b / 2 + 0.31, 1.025, 0.3));
  return g;
}
function badewanne(M: Mats): THREE.Group {
  const g = new THREE.Group();
  g.add(teil(1.7, 0.55, 0.75, M.weiss, 0, 0.275, 0.375));
  const innen = teil(1.5, 0.02, 0.55, M.wasser, 0, 0.56, 0.375);
  innen.castShadow = false;
  g.add(innen);
  return g;
}
function dusche(M: Mats, k = 0.9): THREE.Group {
  const g = new THREE.Group();
  g.add(teil(k, 0.05, k, M.weiss, 0, 0.025, k / 2));
  const wand = teil(k, 2.0, 0.01, M.glas, 0, 1.0, k);
  wand.castShadow = false;
  g.add(wand);
  return g;
}
function wc(M: Mats): THREE.Group {
  const g = new THREE.Group();
  g.add(teil(0.38, 0.4, 0.5, M.weiss, 0, 0.2, 0.35));
  g.add(teil(0.4, 0.5, 0.15, M.weiss, 0, 0.75, 0.075));
  return g;
}
function waschtisch(M: Mats): THREE.Group {
  const g = new THREE.Group();
  g.add(teil(0.8, 0.45, 0.48, M.holz, 0, 0.6, 0.24));
  g.add(teil(0.6, 0.06, 0.4, M.weiss, 0, 0.86, 0.24));
  g.add(teil(0.7, 0.8, 0.02, M.glas, 0, 1.5, 0.01));
  return g;
}
function garderobe(M: Mats): THREE.Group {
  const g = new THREE.Group();
  g.add(teil(1.0, 0.45, 0.35, M.holz, 0, 0.225, 0.175));
  g.add(teil(1.0, 0.04, 0.04, M.metall, 0, 1.75, 0.15));
  return g;
}
function balkonmoebel(M: Mats): THREE.Group {
  const g = new THREE.Group();
  const tisch = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 20), M.metall);
  tisch.position.set(0, 0.72, 0.4); tisch.castShadow = true;
  const fuss = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8), M.metall);
  fuss.position.set(0, 0.36, 0.4);
  g.add(tisch, fuss);
  for (const s of [-1, 1]) g.add(teil(0.42, 0.05, 0.42, M.holz, s * 0.55, 0.44, 0.4), teil(0.42, 0.4, 0.04, M.holz, s * 0.55, 0.66, 0.4 + 0.2));
  return g;
}
function regal(M: Mats, b = 0.9): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) g.add(teil(b, 0.025, 0.4, M.holz, 0, 0.05 + i * 0.45, 0.2));
  g.add(teil(0.03, 1.9, 0.4, M.holz, -b / 2, 0.95, 0.2), teil(0.03, 1.9, 0.4, M.holz, b / 2, 0.95, 0.2));
  return g;
}

/**
 * Möbel in einen Raum stellen. Gerechnet wird im achsparallelen Rahmen des
 * Raums; ein Möbel kommt nur dazu, wenn seine Grundfläche ganz im Raum
 * liegt. Steht es nicht, fällt es weg statt in der Wand zu stecken.
 * ponytail: einfache Faustregeln je Raumtyp, keine Rücksicht auf
 * Türaufschläge und Fenster; ein Planer mit Kollisionsprüfung wäre Stufe 2.
 */
/** Hauptrichtung eines Raums: längengewichtetes Mittel der Kantenwinkel (modulo 90°). */
export function hauptrichtung(punkte: Punkt[]): number {
  let c = 0, s = 0;
  for (let i = 0; i < punkte.length; i++) {
    const a = punkte[i], b = punkte[(i + 1) % punkte.length];
    const l = laenge(a, b), w = Math.atan2(b.y - a.y, b.x - a.x) * 4;
    c += l * Math.cos(w); s += l * Math.sin(w);
  }
  const winkel = Math.atan2(s, c) / 4;
  return Math.abs(winkel) < 0.01 ? 0 : winkel;
}

/**
 * Größtes achsenparalleles Rechteck, das ganz im Raum liegt (Raster, je
 * Zeile die Säulenhöhen, dann größtes Rechteck im Histogramm). Daran
 * richten sich die Möbel aus: Bei verwinkelten oder schiefen Räumen läge das
 * umschließende Rechteck halb außerhalb, und kein Möbel fände Platz.
 */
export function groesstesRechteck(punkte: Punkt[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const r = rahmen(punkte);
  const schritt = Math.max(0.08, Math.sqrt(flaeche(punkte)) / 60);
  const nx = Math.max(1, Math.ceil((r.maxX - r.minX) / schritt)), ny = Math.max(1, Math.ceil((r.maxY - r.minY) / schritt));
  const hoehe = new Array<number>(nx).fill(0);
  let best = { a: 0, x0: 0, x1: 0, y0: 0, y1: 0 };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const drin = punktInPolygon({ x: r.minX + (i + 0.5) * schritt, y: r.minY + (j + 0.5) * schritt }, punkte);
      hoehe[i] = drin ? hoehe[i] + 1 : 0;
    }
    // Größtes Rechteck im Histogramm dieser Zeile (Stapelverfahren).
    const stapel: number[] = [];
    for (let i = 0; i <= nx; i++) {
      const h = i < nx ? hoehe[i] : 0;
      while (stapel.length && hoehe[stapel[stapel.length - 1]] >= h) {
        const oben = hoehe[stapel.pop()!];
        const links = stapel.length ? stapel[stapel.length - 1] + 1 : 0;
        const a = oben * (i - links);
        if (a > best.a) best = { a, x0: links, x1: i, y0: j - oben + 1, y1: j + 1 };
      }
      stapel.push(i);
    }
  }
  if (!best.a) return null;
  return { minX: r.minX + best.x0 * schritt, maxX: r.minX + best.x1 * schritt, minY: r.minY + best.y0 * schritt, maxY: r.minY + best.y1 * schritt };
}

/** Mitten aller Türen eines Plans: aus Wandöffnungen und aus CAD-Türflächen. */
export function tuerMitten(plan: Grundriss3dPlan): Punkt[] {
  const mitten: Punkt[] = [];
  for (const o of plan.oeffnungen) {
    if (o.art !== "tuer") continue;
    const w = plan.waende.find((x) => x.id === o.wandId);
    if (!w) continue;
    const l = laenge(w.a, w.b) || 1;
    mitten.push({ x: w.a.x + ((w.b.x - w.a.x) * o.position) / l, y: w.a.y + ((w.b.y - w.a.y) * o.position) / l });
  }
  for (const t of plan.flaechen?.tueren ?? []) {
    mitten.push({ x: t.reduce((s, [x]) => s + x, 0) / t.length, y: t.reduce((s, [, y]) => s + y, 0) / t.length });
  }
  return mitten;
}

/** Bewegungsfläche vor Türen, in der keine Möbel stehen (Teppiche schon). */
const TUER_FREI = 0.9;

export function moebliere(raumImPlan: Raum, typ: RaumTyp, M: Mats, tueren: Punkt[] = []): THREE.Group {
  const g = new THREE.Group();
  // Schräg liegende Räume ins Achsenkreuz drehen, möblieren, die Gruppe zurückdrehen.
  const winkel = hauptrichtung(raumImPlan.punkte);
  const cw = Math.cos(-winkel), sw = Math.sin(-winkel);
  const raum = winkel ? { ...raumImPlan, punkte: raumImPlan.punkte.map((p) => ({ x: p.x * cw - p.y * sw, y: p.x * sw + p.y * cw })) } : raumImPlan;
  // Nur Türen in der eigenen Raumwand (Mitte höchstens 35 cm vom Raumrand): Türen der Nachbarn hinter der Wand
  // dürfen hier keinen Platz sperren.
  const randAbstand = (p: Punkt) => {
    let d = Infinity;
    const q = raumImPlan.punkte;
    for (let i = 0; i < q.length; i++) {
      const a = q[i], b = q[(i + 1) % q.length];
      const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2));
      d = Math.min(d, Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y))));
    }
    return punktInPolygon(p, q) ? 0 : d;
  };
  // In Bad und Küche reicht der Schwenkbereich der kleineren Tür; dort ist jeder Zentimeter verplant.
  const tuerFrei = typ === "bad" || typ === "kueche" ? 0.65 : TUER_FREI;
  const tuerenLokal = tueren.filter((p) => randAbstand(p) <= 0.35).map((p) => ({ x: p.x * cw - p.y * sw, y: p.x * sw + p.y * cw }));
  g.rotation.y = -winkel;
  // Bezug ist das größte Rechteck im Raum, nicht der Umriss: so finden Möbel auch in L-förmigen und schiefen Räumen Platz.
  const r = groesstesRechteck(raum.punkte) ?? rahmen(raum.punkte);
  const W = r.maxX - r.minX, D = r.maxY - r.minY;
  const innen = 0.06;

  /** Möbel an eine Wand stellen: Seite oben/unten/links/rechts, entlang 0..1. */
  const stelle = (m: THREE.Group | THREE.Mesh, b: number, t: number, seite: "o" | "u" | "l" | "r", wunsch = 0.5, abstand = 0): boolean => {
    // Erst die gewünschte Stelle, dann Ausweichstellen entlang derselben Wand (Nischen, Türen, Vorsprünge).
    // Große Stücke (Sofa, Bett, Schrank, Küche) notfalls an jede andere Wand; ein leerer Raum sieht falscher aus.
    // Große Stücke: die Wunschseite und danach die übrigen, jeweils Seiten mit echter Wand dahinter zuerst.
    const alle = b * t > 0.5 ? [seite, ...(["o", "u", "l", "r"] as const).filter((x) => x !== seite)] : [seite];
    const seiten = [...alle].sort((x, y) => wandAnteil(y) - wandAnteil(x) || alle.indexOf(x) - alle.indexOf(y));
    // Je Stelle zuerst bis 60 cm hinter die Kante des Innenrechtecks: Dort steht in verwinkelten Räumen die echte Wand.
    for (const s of seiten) for (const entlang of [wunsch, 0.5, 0.15, 0.85, 0, 1]) {
      for (const zurueck of [0.6, 0.45, 0.3, 0.15, 0.05, 0]) if (stelleAn(m, b, t, s, entlang, abstand - zurueck)) return true;
    }
    return false;
  };
  const belegt: Array<{ minX: number; maxX: number; minY: number; maxY: number }> = [];
  /**
   * Anteil einer Seite des Innenrechtecks, hinter dem bis 70 cm eine Wand
   * kommt (der Raum endet). Nur dort stehen Sofa, Bett und Küche mit dem
   * Rücken richtig; eine Rechteckkante mitten im Raum ist keine Wand.
   */
  const wandAnteil = (seite: "o" | "u" | "l" | "r"): number => {
    let treffer = 0;
    const n = 12;
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n;
      const pkt = seite === "o" ? { x: r.minX + W * f, y: r.minY - 0.7 } : seite === "u" ? { x: r.minX + W * f, y: r.maxY + 0.7 }
        : seite === "l" ? { x: r.minX - 0.7, y: r.minY + D * f } : { x: r.maxX + 0.7, y: r.minY + D * f };
      const innen = seite === "o" ? { x: pkt.x, y: r.minY + 0.02 } : seite === "u" ? { x: pkt.x, y: r.maxY - 0.02 }
        : seite === "l" ? { x: r.minX + 0.02, y: pkt.y } : { x: r.maxX - 0.02, y: pkt.y };
      // Wand dahinter: Zwischen Rechteckkante und 70 cm dahinter verlässt man den Raum.
      let raus = false;
      for (let k = 1; k <= 7 && !raus; k++) {
        const q = { x: innen.x + ((pkt.x - innen.x) * k) / 7, y: innen.y + ((pkt.y - innen.y) * k) / 7 };
        if (!punktInPolygon(q, raum.punkte)) raus = true;
      }
      if (raus) treffer++;
    }
    return treffer / n;
  };
  const stelleAn = (m: THREE.Group | THREE.Mesh, b: number, t: number, seite: "o" | "u" | "l" | "r", entlang: number, abstand: number): boolean => {
    let x: number, z: number, rot: number;
    if (seite === "o") { x = r.minX + innen + b / 2 + (W - 2 * innen - b) * entlang; z = r.minY + innen + abstand; rot = 0; }
    else if (seite === "u") { x = r.minX + innen + b / 2 + (W - 2 * innen - b) * entlang; z = r.maxY - innen - abstand; rot = Math.PI; }
    else if (seite === "l") { z = r.minY + innen + b / 2 + (D - 2 * innen - b) * entlang; x = r.minX + innen + abstand; rot = -Math.PI / 2 + Math.PI; }
    else { z = r.minY + innen + b / 2 + (D - 2 * innen - b) * entlang; x = r.maxX - innen - abstand; rot = Math.PI / 2 + Math.PI; }
    // Ecken der Grundfläche prüfen.
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const ecken = [[-b / 2, 0], [b / 2, 0], [-b / 2, t], [b / 2, t]].map(([lx, lz]) => ({ x: x + lx * cos + lz * sin, y: z - lx * sin + lz * cos }));
    // Ecken 5 cm nach innen geprüft: Nachgezeichnete Räume haben leicht schräge Kanten.
    const mitte = { x: ecken.reduce((s, e) => s + e.x, 0) / 4, y: ecken.reduce((s, e) => s + e.y, 0) / 4 };
    const pruef = ecken.map((e) => { const d = Math.hypot(e.x - mitte.x, e.y - mitte.y) || 1; return { x: e.x - ((e.x - mitte.x) / d) * 0.05, y: e.y - ((e.y - mitte.y) / d) * 0.05 }; });
    if (!pruef.every((e) => punktInPolygon(e, raum.punkte))) return false;
    // Auch die Fläche dazwischen: In verwinkelten Räumen kann eine Wandecke zwischen den Ecken liegen.
    const proben = 5;
    for (let i = 0; i <= proben; i++) for (let j = 0; j <= proben; j++) {
      const u = i / proben, v = j / proben;
      const pkt = {
        x: pruef[0].x + (pruef[1].x - pruef[0].x) * u + (pruef[2].x - pruef[0].x) * v,
        y: pruef[0].y + (pruef[1].y - pruef[0].y) * u + (pruef[2].y - pruef[0].y) * v,
      };
      if (!punktInPolygon(pkt, raum.punkte)) return false;
    }
    // Nicht in schon gestellte Möbel; Teppiche (einzelne Fläche) dürfen darunter liegen.
    const box = { minX: Math.min(...pruef.map((e) => e.x)), maxX: Math.max(...pruef.map((e) => e.x)), minY: Math.min(...pruef.map((e) => e.y)), maxY: Math.max(...pruef.map((e) => e.y)) };
    const istTeppich = m instanceof THREE.Mesh;
    // Türen freihalten: Abstand jeder Türmitte zum Möbelrechteck mindestens TUER_FREI.
    if (!istTeppich && tuerenLokal.some((p) => Math.hypot(Math.max(box.minX - p.x, 0, p.x - box.maxX), Math.max(box.minY - p.y, 0, p.y - box.maxY)) < tuerFrei)) return false;
    if (!istTeppich && belegt.some((q) => box.minX < q.maxX && box.maxX > q.minX && box.minY < q.maxY && box.maxY > q.minY)) return false;
    if (!istTeppich) belegt.push(box);
    m.position.set(x, 0, z);
    m.rotation.y = rot;
    g.add(m);
    return true;
  };
  const lang: "o" | "l" = W >= D ? "o" : "l";
  const gegen: "u" | "r" = lang === "o" ? "u" : "r";
  const quer: "l" | "o" = lang === "o" ? "l" : "o";
  const laengs = Math.max(W, D), tiefe = Math.min(W, D);

  if (typ === "wohnen") {
    const sb = Math.min(2.4, laengs * 0.5);
    if (!stelle(sofa(M, sb), sb, 0.9, lang, 0.3)) stelle(sofa(M, 1.8), 1.8, 0.9, gegen, 0.3);
    stelle(teppich(M, Math.min(2.6, laengs * 0.55), Math.min(1.8, tiefe * 0.45)), Math.min(2.6, laengs * 0.55), Math.min(1.8, tiefe * 0.45), lang, 0.3, 0.6);
    stelle(couchtisch(M), 1.1, 0.6, lang, 0.3, 1.2);
    stelle(sideboard(M), 1.8, 0.45, gegen, 0.3);
    if (flaeche(raum.punkte) > 18 && laengs > 4.2) stelle(tischMitStuehlen(M), 1.6, 1.9, lang, 0.95, 0.75);
    stelle(pflanze(M), 0.6, 0.6, quer, 0.05);
  } else if (typ === "schlafen") {
    const bb = tiefe > 3.2 ? 1.8 : 1.4;
    // Bett samt Nachttischen ist b + 1,15 m breit; notfalls ein schmaleres Bett.
    if (!stelle(bett(M, bb), bb + 1.15, 2.1, quer, 0.5) && !stelle(bett(M, 1.4), 2.55, 2.1, lang, 0.5)
      && !stelle(bett(M, 1.4, false), 1.5, 2.1, lang, 0.5)) stelle(bett(M, 0.9, false), 1.0, 2.1, lang, 0.5);
    stelle(schrank(M, Math.min(2.4, laengs * 0.45)), Math.min(2.4, laengs * 0.45), 0.6, lang, 0.9);
    stelle(teppich(M, 2.0, 1.4), 2.0, 1.4, gegen, 0.5, 0.3);
    stelle(pflanze(M), 0.6, 0.6, gegen, 0.02);
  } else if (typ === "kueche") {
    // Küchenzeile so lang wie möglich, sonst kürzer bis zur Kompaktküche (1,2 m).
    const kb = Math.min(3.4, laengs - 0.2);
    for (const breite of [kb, 2.4, 1.8, 1.2].filter((x, i, a) => x <= kb && a.indexOf(x) === i)) {
      if (stelle(kuechenzeile(M, breite), breite, 0.62, lang, breite > 2.2 ? 0.6 : 0.5)) break;
    }
    if (flaeche(raum.punkte) > 8) stelle(tischMitStuehlen(M, 1.1, 0.75, 2), 1.1, 1.75, gegen, 0.5, 0.1);
  } else if (typ === "bad") {
    const wanne = laengs >= 2.2 && stelle(badewanne(M), 1.7, 0.75, quer, 0.5);
    if (!wanne && !stelle(dusche(M), 0.9, 0.9, lang, 0)) stelle(dusche(M, 0.8), 0.8, 0.8, lang, 0);
    stelle(wc(M), 0.4, 0.65, gegen, 0.75);
    stelle(waschtisch(M), 0.8, 0.5, gegen, 0.3);
  } else if (typ === "flur") {
    if (!stelle(garderobe(M), 1.0, 0.35, quer === "l" ? "r" : "u", 0.6)) stelle(garderobe(M), 1.0, 0.35, "l", 0.6);
  } else if (typ === "balkon") {
    if (!stelle(balkonmoebel(M), 1.5, 0.8, lang, 0.5, 0.05)) stelle(pflanze(M), 0.6, 0.6, lang, 0.5);
  } else if (typ === "abstell") {
    stelle(regal(M), 0.9, 0.4, lang, 0.5);
  }
  return g;
}

/* ── Gesamte Szene ─────────────────────────────────────────────────── */

export function geschossHoehe(o: Pick<SzenenOptionen, "wandhoehe" | "explosion">): number {
  return o.wandhoehe + DECKE + o.explosion;
}

export function baueSzene(einheiten: Einheit3d[], o: SzenenOptionen, haus?: HausPlan | null): Szene {
  const stil = STILE[o.stil];
  const h = o.schnitt ? Math.min(SCHNITT_HOEHE, o.wandhoehe) : o.wandhoehe;
  const gruppe = new THREE.Group();
  const decken: THREE.Object3D[] = [];
  const nurRundum: THREE.Object3D[] = [];
  const hindernisse: Szene["hindernisse"] = [];

  const wandMat = mat(stil.wand, 0.92);
  const fassadeFarbe = o.aussehen?.fassade ?? o.fassade;
  const fassadeMat = mat(fassadeFarbe ?? stil.wand, 0.9);
  fassadeMat.side = THREE.DoubleSide;
  const rohMat = mat("#d8d5cf", 0.95);
  const betonMat = mat("#d6cfc2", 0.9);
  const konturen: Kontur[] = [];
  const ebenen: Array<{ geschoss: number; ebene: THREE.Group; plan: Grundriss3dPlan; v: Punkt }> = [];
  const kappeMat = mat("#3b3d40", 0.9);
  // Durchsichtig über Deckkraft statt Transmission: die kostet einen zweiten Renderdurchgang.
  const glas = new THREE.MeshStandardMaterial({ color: "#cfe6f2", roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.3, depthWrite: false });
  const rahmenMat = mat("#ffffff", 0.5);
  const tuerMat = mat(o.stil === "altbau" ? "#f4efe6" : "#fafafa", 0.6);
  const holzBoden = new THREE.MeshStandardMaterial({ map: dielen(stil.boden, stil.fuge), roughness: 0.65 });
  const fliesenBoden = new THREE.MeshStandardMaterial({ map: fliesen(o.stil === "altbau" ? "#e9e3d6" : "#d9d9d6", "#b9b6ae"), roughness: 0.4 });
  const balkonBoden = new THREE.MeshStandardMaterial({ map: dielen("#9a8f84", "#7d736a"), roughness: 0.85 });
  const deckenMat = new THREE.MeshStandardMaterial({ color: "#fbfbfa", roughness: 1, side: THREE.DoubleSide });
  const M: Mats = {
    wasser: mat("#d7e6ec", 0.1), holz: mat(stil.holz, 0.6), stoff: mat(stil.stoff, 0.95), akzent: mat(stil.akzent, 0.8), korpus: mat(stil.korpus, 0.5),
    metall: mat(stil.metall, 0.35, 0.6), teppich: mat(stil.teppich, 1), weiss: mat("#f7f7f5", 0.25), pflanze: mat("#4f7a4a", 0.9),
    topf: mat("#d9d3c7", 0.7), glas: glas.clone(), stein: mat(o.stil === "altbau" ? "#2f2f2f" : "#e7e5e0", 0.3),
  };

  let start: THREE.Vector3 | null = null;
  let startBlick = 0;
  const lichtpunkte: THREE.Vector3[] = [];
  const stationen: Szene["stationen"] = [];
  let groessterRaum = 0;
  const geschosse = [...einheiten.map((e) => e.plan.geschoss ?? 0), ...(haus ? Array.from({ length: haus.geschosse }, (_, i) => i) : [])];
  const unterstes = Math.min(...(o.nurGeschoss !== undefined ? [o.nurGeschoss] : geschosse));
  // Im ganzen Haus nur die Einheiten beschriften, Räume erst im einzelnen Geschoss.
  const hausAnsicht = (new Set(geschosse).size > 1 || !!haus) && o.nurGeschoss === undefined;
  const basis = Math.min(...geschosse);
  for (const e of einheiten) {
    const geschoss = e.plan.geschoss ?? 0;
    if (o.nurGeschoss !== undefined && geschoss !== o.nurGeschoss) continue;
    const v = e.plan.versatz ?? { x: 0, y: 0 };
    const ebene = new THREE.Group();
    // Ein einzelnes Geschoss steht auf dem Boden, sonst gestapelt.
    ebene.position.set(v.x, o.nurGeschoss !== undefined ? 0 : (geschoss - basis) * geschossHoehe(o), v.y);

    ebene.add(baueWaende(e.plan, h, wandMat, kappeMat, glas, rahmenMat, tuerMat, nurRundum));
    if (e.plan.flaechen) ebene.add(baueFlaechenWaende(e.plan.flaechen, h, wandMat, kappeMat, glas, nurRundum, { raeume: e.plan.raeume, rahmenMat, tuerMat, bodenMat: holzBoden }));
    ebenen.push({ geschoss, ebene, plan: e.plan, v });
    // Außenumriss für die Fassadenfarbe: aus CAD-Plänen der Deckenumriss, sonst das Rechteck um die Wände.
    const y0 = ebene.position.y, y1 = y0 + h;
    if (e.plan.flaechen?.decke?.length) {
      for (const ring of e.plan.flaechen.decke) konturen.push({ y0, y1, erdgeschoss: geschoss === 0, art: "fassade", punkte: ring.map(([x, y]) => ({ x: x + v.x, y: y + v.y })) });
    } else if (!haus) {
      const r = planRahmen(e.plan);
      konturen.push({ y0, y1, erdgeschoss: geschoss === 0, art: "fassade", punkte: rechteckPunkte({ minX: r.minX + v.x, minY: r.minY + v.y, maxX: r.maxX + v.x, maxY: r.maxY + v.y }, 0.2) });
    }

    // Ein ganzer Geschossplan hat viele Räume: dann ein Schild je Wohnung statt je Raum.
    const grossePlan = e.plan.raeume.length > 12 || new Set(e.plan.raeume.map((r) => /\(WE (\d+)\)/.exec(r.name)?.[1]).filter(Boolean)).size > 1;
    if (grossePlan && o.beschriftung && !hausAnsicht) {
      const jeWe = new Map<string, Raum[]>();
      for (const r of e.plan.raeume) { const m = /\(WE (\d+)\)/.exec(r.name); if (m) jeWe.set(m[1], [...(jeWe.get(m[1]) ?? []), r]); }
      for (const [we, rs] of jeWe) {
        const groesster = rs.reduce((a, b) => (flaeche(b.punkte) > flaeche(a.punkte) ? b : a));
        const s = schwerpunkt(groesster.punkte);
        const el = document.createElement("div");
        el.className = "g3d-label";
        el.innerHTML = `<b>WE ${we}</b><span>${qm(rs.reduce((x, r) => x + flaeche(r.punkte) * (r.typ === "balkon" ? 0.5 : 1), 0))}</span>`;
        const label = new CSS2DObject(el);
        label.position.set(s.x, 0.1, s.y);
        ebene.add(label);
        nurRundum.push(label);
      }
    }
    // Türen der Einheit nur einmal je Plan ermitteln, nicht je Raum.
    const tueren = o.stil !== "leer" ? tuerMitten(e.plan) : [];
    for (const raum of e.plan.raeume) {
      const rohTyp = wirksamerTyp(e.plan, raum);
      // Eine Diele über 16 m² ist ein Wohnraum (offener Grundriss, CAD-Beschriftung im Durchgang).
      // Ein unbeschrifteter „Raum“ ab 7 m² ist ein Zimmer: Im CAD-Plan fehlte nur der Text.
      const a = flaeche(raum.punkte);
      const allgemein = /gemeinschaft|treppe/i.test(raum.name);
      const typ = rohTyp === "flur" && !allgemein && a > 16 ? "wohnen"
        : rohTyp === "flur" && !allgemein && /^Raum\b/.test(raum.name) && a >= 7 ? "schlafen"
        : rohTyp;
      const bodenMat = typ === "bad" || typ === "kueche" || typ === "treppenhaus" ? fliesenBoden : typ === "balkon" ? balkonBoden : holzBoden;
      const boden = new THREE.Mesh(flaechenGeometrie(raum.punkte), bodenMat);
      boden.receiveShadow = true;
      ebene.add(boden);
      // Balkone kragen aus: eigene Platte darunter, sonst schwebt der Belag.
      if (typ === "balkon" && geschosse.length > 1) ebene.add(prisma([raum.punkte.map((q): XY => [q.x, q.y])], -0.2, -0.012, betonMat));
      if (typ !== "balkon") {
        const decke = new THREE.Mesh(flaechenGeometrie(raum.punkte), deckenMat);
        decke.position.y = o.wandhoehe;
        decke.visible = false;
        ebene.add(decke);
        decken.push(decke);
      }
      if (o.stil !== "leer") ebene.add(moebliere(raum, typ, M, tueren));
      if (o.beschriftung && !hausAnsicht && !grossePlan) {
        const s = schwerpunkt(raum.punkte);
        const el = document.createElement("div");
        el.className = "g3d-label";
        el.innerHTML = `<b>${raum.name.replace(/[<>&]/g, "")}</b><span>${qm(flaeche(raum.punkte))}</span>`;
        const label = new CSS2DObject(el);
        label.position.set(s.x, 0.1, s.y);
        ebene.add(label);
        nurRundum.push(label);
      }
      if (typ !== "balkon") {
        const s = schwerpunkt(raum.punkte);
        lichtpunkte.push(new THREE.Vector3(ebene.position.x + s.x, ebene.position.y + o.wandhoehe - 0.25, ebene.position.z + s.y));
        if (!hausAnsicht) stationen.push({ ziel: new THREE.Vector3(ebene.position.x + s.x, ebene.position.y + 0.8, ebene.position.z + s.y), name: `${einheiten.length > 1 && e.titel ? `${e.titel}, ` : ""}${raum.name}, ${qm(flaeche(raum.punkte))}` });
      }
      if (geschoss === unterstes && typ !== "balkon" && a > groessterRaum) {
        groessterRaum = a;
        const r = rahmen(raum.punkte);
        const lang = r.maxY - r.minY >= r.maxX - r.minX;
        // Am Rand stehen und in den Raum blicken, nicht auf die nächste Wand.
        start = lang
          ? new THREE.Vector3(v.x + (r.minX + r.maxX) / 2, 0, v.y + r.minY + 0.7)
          : new THREE.Vector3(v.x + r.minX + 0.7, 0, v.y + (r.minY + r.maxY) / 2);
        startBlick = lang ? Math.PI : -Math.PI / 2;
      }
    }
    // Rohdecke unter dem Geschoss: schließt die Etagen zum Haus. Mit Hülle liefert die die Decke.
    if (e.plan.flaechen?.decke?.length && geschosse.length > 1) {
      for (const ring of e.plan.flaechen.decke) {
        const platte = prisma([ring], -DECKE - 0.01, -0.01, rohMat);
        ebene.add(platte);
      }
    } else if (geschosse.length > 1 && !haus) {
      const r = planRahmen(e.plan);
      const platte = quader(r.maxX - r.minX + 0.4, DECKE, r.maxY - r.minY + 0.4, rohMat);
      platte.position.set((r.minX + r.maxX) / 2, -DECKE / 2 - 0.01, (r.minY + r.maxY) / 2);
      ebene.add(platte);
    }
    if (e.titel && einheiten.length > 1 && o.beschriftung) {
      const r = planRahmen(e.plan);
      const el = document.createElement("div");
      el.className = "g3d-label g3d-label-einheit";
      el.textContent = e.titel;
      const label = new CSS2DObject(el);
      // Im ganzen Haus seitlich auf Geschosshöhe, sonst stapeln sich die Schilder über der Mitte.
      if (hausAnsicht) label.position.set(r.minX - 1.2, h / 2, (r.minY + r.maxY) / 2);
      else label.position.set((r.minX + r.maxX) / 2, h + 0.3, r.minY);
      ebene.add(label);
      nurRundum.push(label);
    }
    // CAD-Wände sind Flächen: jede Kante als dünne Wand, damit man in der Begehung nicht hindurchläuft.
    for (const ringe of e.plan.flaechen?.waende ?? []) for (const ring of ringe) for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      hindernisse.push({ wand: { id: `cad-${i}`, a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] }, dicke: 0.02 }, versatz: { x: v.x, y: v.y }, tueren: [] });
    }
    for (const w of e.plan.waende) {
      const l = laenge(w.a, w.b);
      hindernisse.push({
        wand: w, versatz: { x: v.x, y: v.y },
        tueren: e.plan.oeffnungen.filter((x) => x.wandId === w.id && x.art === "tuer").map((x) => [Math.max(0, x.position - x.breite / 2), Math.min(l, x.position + x.breite / 2)]),
      });
    }
    ebene.userData.geschoss = geschoss;
    if (hausAnsicht && !stationen.some((x) => x.name === GESCHOSS_TEXT(geschoss))) {
      const r = planRahmen(e.plan);
      stationen.push({ ziel: new THREE.Vector3(v.x + (r.minX + r.maxX) / 2, ebene.position.y + 1, v.y + (r.minY + r.maxY) / 2), name: GESCHOSS_TEXT(geschoss) });
    }
    gruppe.add(ebene);
  }

  if (haus) {
    baueHuelle({ haus, einheiten, o, h, basis, gruppe, nurRundum, hindernisse, stationen, hausAnsicht, konturen,
      mats: { wandMat, fassadeMat, kappeMat, glas, rahmenMat, tuerMat, stein: fliesenBoden } });
  }

  // ── Außen: Fassadenfarbe, Dach, Balkone (nur wo das Haus als Ganzes zu sehen ist) ──
  const zeigeDach = o.nurGeschoss === undefined && !o.schnitt;
  if (fassadeFarbe && hausAnsicht) {
    faerbeFassade(gruppe, new Set([wandMat]), konturen, { wand: stil.wand, fassade: fassadeFarbe, sockel: o.aussehen?.sockel, hof: o.aussehen?.hof, brandwand: o.aussehen?.brandwand });
  }
  const dach = o.aussehen?.dach;
  if (!haus && ebenen.length) {
    const oberstes = Math.max(...einheiten.map((e) => e.plan.geschoss ?? 0));
    const oben = ebenen.filter((x) => x.geschoss === oberstes);
    if ((dach?.art === "sattel" || dach?.art === "walm") && oben.length) {
      // Traufe auf den Außenwänden des ganzen Hauses (das Dachgeschoss ist oft eingerückt), Außenkante der Wände.
      const r = rahmen(ebenen.flatMap((x) => { const q = planRahmen(x.plan); return [{ x: q.minX + x.v.x, y: q.minY + x.v.y }, { x: q.maxX + x.v.x, y: q.maxY + x.v.y }]; }));
      const dicke = Math.max(0, ...ebenen.flatMap((x) => x.plan.waende.map((w) => w.dicke))) / 2;
      const aussenkante = { minX: r.minX - dicke, minY: r.minY - dicke, maxX: r.maxX + dicke, maxY: r.maxY + dicke };
      const ey = oben[0].ebene.position.y;
      const d = steildach(dach, aussenkante, ey + dach.kniestock, ey + h, fassadeMat, { liste: o.aussehen?.gauben ?? [], boden: ey });
      for (const x of oben) kappeAnDach(x.ebene, d.ebenen);
      if (zeigeDach) gruppe.add(d.gruppe);
    } else if (dach?.art === "flaechen") {
      // Dach aus der Dachaufsicht: jede Fläche eben, die Geschosse darunter exakt an der Dachunterseite gekappt.
      const d = flaechenDach(dach.flaechen, (g) => ebenen.find((x) => x.geschoss === g)?.ebene.position.y, fassadeMat, h);
      if (d.karte) {
        for (const x of ebenen) kappeUnterKarte(x.ebene, d.karte);
        gruppe.userData.dachKarte = d.karte.textur;
      }
      if (zeigeDach) gruppe.add(d.gruppe);
    } else if (zeigeDach && dach?.art !== "sattel" && dach?.art !== "walm") {
      // Flachdach über jedem Geschoss aus CAD-Plänen; wo ein Geschoss darüber steht, verdeckt dessen Decke es.
      const dachMat = mat(dach?.art === "flach" && dach.farbe ? dach.farbe : "#b9b5ad", 0.95);
      for (const x of ebenen) {
        for (const ring of x.plan.flaechen?.decke ?? []) {
          // Deckel in Dachfarbe, Seiten wie die Rohdecke: wo beide zusammenfallen, sieht man keinen Wechsel.
          const p = prisma([ring], h, h + DECKE - 0.03, dachMat);
          p.material = [dachMat, rohMat];
          x.ebene.add(p);
        }
      }
    }
  }
  for (const b of o.aussehen?.balkone ?? []) {
    const umriss = haus ? rechteckPunkte(rahmen(haus.huelle.waende.flatMap((w) => [w.a, w.b]))) : konturen[0]?.punkte ?? null;
    for (const g of b.geschosse) {
      if (o.nurGeschoss !== undefined && g !== o.nurGeschoss) continue;
      gruppe.add(balkon(b, o.nurGeschoss !== undefined ? 0 : (g - basis) * geschossHoehe(o), umriss));
    }
  }

  const box = new THREE.Box3().setFromObject(gruppe);
  // Im Haus von oben nach unten durch die Geschosse.
  if (hausAnsicht) stationen.sort((a, b) => b.ziel.y - a.ziel.y);
  return { gruppe, decken, nurRundum, hindernisse, start: start ?? box.getCenter(new THREE.Vector3()).setY(0), startBlick, rahmen: box, glas, lichtpunkte, stationen };
}

/* ── Wände als Flächen (aus CAD-Plänen) ───────────────────────────── */

/** Ein Polygon (mit Löchern) als senkrechtes Prisma von y0 bis y1. */
function prisma(ringe: XY[][], y0: number, y1: number, m: THREE.Material): THREE.Mesh {
  const form = new THREE.Shape(ringe[0].map(([x, y]) => new THREE.Vector2(x, -y)));
  for (const loch of ringe.slice(1)) form.holes.push(new THREE.Path(loch.map(([x, y]) => new THREE.Vector2(x, -y))));
  const geo = new THREE.ExtrudeGeometry(form, { depth: Math.max(0.005, y1 - y0), bevelEnabled: false, curveSegments: 1 });
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.y = y0;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Öffnung in einer CAD-Wand: Achse a→b entlang der Wand (lichte Breite), Wanddicke quer dazu. */
export interface Portal { a: Punkt; b: Punkt; dicke: number }

/**
 * Achse einer Öffnungsfläche über das kleinste umschließende Rechteck (je
 * Kante gedreht). Die längere Seite liegt in der Wand, die kürzere ist die
 * Wanddicke. Nach dem Vorschlag aus der Codex-Prüfung vom 18.10.2026.
 */
export function portalAusFlaeche(ring: XY[]): Portal | null {
  if (ring.length < 3) return null;
  let best: { ux: number; uy: number; minU: number; maxU: number; minV: number; maxV: number; a: number } | undefined;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length];
    const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (l < 1e-6) continue;
    const ux = (q[0] - p[0]) / l, uy = (q[1] - p[1]) / l;
    const us = ring.map(([x, y]) => x * ux + y * uy), vs = ring.map(([x, y]) => -x * uy + y * ux);
    const minU = Math.min(...us), maxU = Math.max(...us), minV = Math.min(...vs), maxV = Math.max(...vs);
    const a = (maxU - minU) * (maxV - minV);
    if (!best || a < best.a) best = { ux, uy, minU, maxU, minV, maxV, a };
  }
  if (!best) return null;
  let { ux, uy } = best;
  let breite = best.maxU - best.minU, dicke = best.maxV - best.minV;
  const cu = (best.minU + best.maxU) / 2, cv = (best.minV + best.maxV) / 2;
  const m = { x: ux * cu - uy * cv, y: uy * cu + ux * cv };
  if (dicke > breite) { [ux, uy] = [-uy, ux]; [breite, dicke] = [dicke, breite]; }
  if (breite < 0.4 || dicke < 0.01) return null;
  return { dicke, a: { x: m.x - (ux * breite) / 2, y: m.y - (uy * breite) / 2 }, b: { x: m.x + (ux * breite) / 2, y: m.y + (uy * breite) / 2 } };
}

/** Rang eines Raums als Ziel einer Türöffnung: private Räume vor Flur, Wohnung vor Treppenhaus. */
function zielRang(r: Raum | undefined): number {
  if (!r) return -1;
  if (r.typ === "treppenhaus" || /gemeinschaft|treppe/i.test(r.name)) return 0;
  if (r.typ === "flur") return 1;
  if (r.typ === "balkon") return 0.5;
  return 2;
}

/**
 * Türblatt in einer CAD-Öffnung: öffnet in den Raum mit dem höheren Rang
 * (Zimmer, Bad, Küche vor Flur, Wohnung vor Treppenhaus), angeschlagen an dem
 * Ende, bei dem das geöffnete Blatt ganz im Zielraum liegt.
 */
export function cadTuerblatt(p: Portal, raeume: Raum[], h: number, material: THREE.Material): THREE.Object3D | null {
  if (h < TUER_HOEHE) return null;
  const l = laenge(p.a, p.b);
  const ux = (p.b.x - p.a.x) / l, uy = (p.b.y - p.a.y) / l, nx = -uy, ny = ux;
  const m = { x: (p.a.x + p.b.x) / 2, y: (p.a.y + p.b.y) / 2 };
  const raumBei = (q: Punkt) => raeume.find((r) => punktInPolygon(q, r.punkte));
  const abstand = p.dicke / 2 + 0.3;
  const links = raumBei({ x: m.x + nx * abstand, y: m.y + ny * abstand });
  const rechts = raumBei({ x: m.x - nx * abstand, y: m.y - ny * abstand });
  if (!links && !rechts) return null;
  const seite = zielRang(links) >= zielRang(rechts) ? 1 : -1;
  const ziel = seite === 1 ? links : rechts;
  const breite = Math.min(1.1, l - 0.06);
  const winkel = Math.PI * 0.42;
  // Beide Anschläge prüfen: Das offene Blatt muss mit Spitze und Mitte im Zielraum liegen.
  for (const anschlag of ["a", "b"] as const) {
    const richtung = anschlag === "a" ? 1 : -1;
    const ende = anschlag === "a" ? p.a : p.b;
    const angel = { x: ende.x + ux * richtung * 0.03 + nx * seite * (p.dicke / 2), y: ende.y + uy * richtung * 0.03 + ny * seite * (p.dicke / 2) };
    const dx = ux * richtung * Math.cos(winkel) + nx * seite * Math.sin(winkel);
    const dy = uy * richtung * Math.cos(winkel) + ny * seite * Math.sin(winkel);
    const spitze = { x: angel.x + dx * breite, y: angel.y + dy * breite };
    const mitte = { x: angel.x + (dx * breite) / 2, y: angel.y + (dy * breite) / 2 };
    if (ziel && !(punktInPolygon(spitze, ziel.punkte) && punktInPolygon(mitte, ziel.punkte)) && anschlag === "a") continue;
    const blatt = quader(breite, TUER_HOEHE - 0.02, 0.04, material);
    blatt.position.set(mitte.x, (TUER_HOEHE - 0.02) / 2, mitte.y);
    blatt.rotation.y = -Math.atan2(dy, dx);
    return blatt;
  }
  return null;
}

/** Fenster in einer CAD-Öffnung: Rahmen, dünne Scheibe in Wandmitte, Fensterbank innen. */
function cadFenster(p: Portal, unten: number, oben: number, rahmenMat: THREE.Material, glas: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const b = laenge(p.a, p.b), hoehe = oben - unten;
  if (b < 0.2 || hoehe < 0.2) return g;
  g.position.set((p.a.x + p.b.x) / 2, unten, (p.a.y + p.b.y) / 2);
  g.rotation.y = -Math.atan2(p.b.y - p.a.y, p.b.x - p.a.x);
  const profil = 0.055, tiefe = Math.min(0.075, p.dicke);
  for (const s of [-1, 1]) {
    g.add(teilOhneSchatten(profil, hoehe, tiefe, rahmenMat, (s * (b - profil)) / 2, hoehe / 2, 0));
    g.add(teilOhneSchatten(b - 2 * profil, profil, tiefe, rahmenMat, 0, s === -1 ? profil / 2 : hoehe - profil / 2, 0));
  }
  const scheibe = teilOhneSchatten(b - 2 * profil - 0.004, hoehe - 2 * profil - 0.004, 0.012, glas, 0, hoehe / 2, 0);
  g.add(scheibe);
  // Fensterbank knapp unter der Brüstungsoberkante, etwas breiter als die Öffnung.
  g.add(teilOhneSchatten(b + 0.06, 0.025, p.dicke + 0.08, rahmenMat, 0, -0.0145, 0));
  return g;
}

function teilOhneSchatten(b: number, h: number, t: number, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const q = new THREE.Mesh(new THREE.BoxGeometry(b, h, t), m);
  q.position.set(x, y, z);
  q.castShadow = false;
  q.receiveShadow = true;
  return q;
}

/** Wände in voller Höhe, über Türen ein Sturz, in Fenstern Brüstung, Glas und Sturz. */
function baueFlaechenWaende(f: Flaechen, h: number, wandMat: THREE.Material, kappeMat: THREE.Material, glas: THREE.Material, kappen: THREE.Object3D[], extra?: { raeume: Raum[]; rahmenMat: THREE.Material; tuerMat: THREE.Material; bodenMat: THREE.Material }): THREE.Group {
  const g = new THREE.Group();
  for (const w of f.waende) {
    g.add(prisma(w, 0, h, wandMat));
    const kappe = prisma(w, h, h + 0.015, kappeMat);
    kappe.castShadow = false;
    g.add(kappe);
    kappen.push(kappe);
  }
  const sturz = Math.min(TUER_HOEHE, h);
  for (const t of f.tueren) {
    if (h > sturz + 0.01) g.add(prisma([t], sturz, h, wandMat));
    if (!extra) continue;
    // Boden in der Türöffnung, sonst bleibt zwischen zwei Räumen ein Streifen ohne Belag.
    const schwelle = new THREE.Mesh(flaechenGeometrie(t.map(([x, y]) => ({ x, y }))), extra.bodenMat);
    schwelle.receiveShadow = true;
    g.add(schwelle);
    const p = portalAusFlaeche(t);
    const blatt = p && cadTuerblatt(p, extra.raeume, h, extra.tuerMat);
    if (blatt) g.add(blatt);
  }
  const brustung = Math.min(FENSTER_BRUESTUNG, h);
  const oben = Math.min(h, FENSTER_BRUESTUNG + FENSTER_HOEHE);
  for (const fe of f.fenster) {
    g.add(prisma([fe], 0, brustung, wandMat));
    if (h > oben + 0.01) g.add(prisma([fe], oben, h, wandMat));
    if (oben <= FENSTER_BRUESTUNG) continue;
    const p = extra ? portalAusFlaeche(fe) : null;
    if (p && extra) g.add(cadFenster(p, FENSTER_BRUESTUNG, oben, extra.rahmenMat, glas));
    else {
      const scheibe = prisma([fe], FENSTER_BRUESTUNG, oben, glas);
      scheibe.castShadow = false;
      g.add(scheibe);
    }
  }
  return g;
}

/* ── Gebäudehülle ──────────────────────────────────────────────────── */

type Rechteck = { minX: number; minY: number; maxX: number; maxY: number };

/** Welcher Teil (0..1) der Strecke a→b liegt im Rechteck? Nach Liang und Barsky. */
function imRechteck(a: Punkt, b: Punkt, r: Rechteck): [number, number] | null {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - r.minX], [dx, r.maxX - a.x], [-dy, a.y - r.minY], [dy, r.maxY - a.y]]) {
    if (Math.abs(p) < 1e-9) { if (q < 0) return null; continue; }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return [t0, t1];
}

/**
 * Hüllenwände ohne die Stücke, an denen eine Einheit mit eigenem Plan liegt.
 * Sonst stünden zwei Wände ineinander und die Fenster der Einheit wären zu.
 */
export function huelleAusschneiden(huelle: Grundriss3dPlan, frei: Rechteck[]): Grundriss3dPlan {
  const waende: Wand[] = [];
  const oeffnungen: Grundriss3dPlan["oeffnungen"] = [];
  for (const w of huelle.waende) {
    const l = laenge(w.a, w.b);
    let stuecke: Array<[number, number]> = [[0, 1]];
    for (const r of frei) {
      const weg = imRechteck(w.a, w.b, r);
      if (!weg) continue;
      stuecke = stuecke.flatMap(([s, e]) => [[s, Math.min(e, weg[0])], [Math.max(s, weg[1]), e]] as Array<[number, number]>).filter(([s, e]) => (e - s) * l > 0.05);
    }
    stuecke.forEach(([s, e], k) => {
      const at = (t: number): Punkt => ({ x: w.a.x + (w.b.x - w.a.x) * t, y: w.a.y + (w.b.y - w.a.y) * t });
      const id = stuecke.length === 1 && s === 0 && e === 1 ? w.id : `${w.id}~${k}`;
      waende.push({ ...w, id, a: at(s), b: at(e) });
      for (const o of huelle.oeffnungen) {
        if (o.wandId !== w.id || o.position - o.breite / 2 < s * l - 1e-6 || o.position + o.breite / 2 > e * l + 1e-6) continue;
        oeffnungen.push({ ...o, id: `${o.id}~${k}`, wandId: id, position: o.position - s * l });
      }
    });
  }
  return { ...huelle, waende, oeffnungen };
}

/** Zwei Läufe mit Podest, als einfache Blockstufen. */
function treppe(r: Rechteck, h: number, m: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const lang = r.maxX - r.minX >= r.maxY - r.minY;
  const L = lang ? r.maxX - r.minX : r.maxY - r.minY, B = lang ? r.maxY - r.minY : r.maxX - r.minX;
  const n = Math.max(8, Math.round(h / 0.18)), halb = Math.ceil(n / 2), stufe = h / n;
  const lauf = Math.min(0.3, Math.max(0.2, (L - 1.4) / halb));
  const block = (entlang: number, quer: number, laenge: number, breite: number, hoehe: number) => {
    const q = quader(lang ? laenge : breite, hoehe, lang ? breite : laenge, m);
    q.position.set(lang ? r.minX + entlang + laenge / 2 : r.minX + quer, hoehe / 2, lang ? r.minY + quer : r.minY + entlang + laenge / 2);
    g.add(q);
  };
  for (let i = 0; i < n; i++) {
    const zweiter = i >= halb, j = zweiter ? i - halb : i;
    const entlang = zweiter ? halb * lauf - (j + 1) * lauf : j * lauf;
    block(entlang + 0.2, zweiter ? B * 0.26 : B * 0.74, lauf, B * 0.44, (i + 1) * stufe);
  }
  block(halb * lauf + 0.2, B / 2, 1.1, B * 0.92, halb * stufe);
  return g;
}

/** Ring aus Umriss und Hof als Platte (Decke oder Dach). */
function platte(umriss: Rechteck, hof: Punkt[] | undefined, dicke: number, m: THREE.Material): THREE.Mesh {
  const form = new THREE.Shape([
    new THREE.Vector2(umriss.minX, -umriss.minY), new THREE.Vector2(umriss.maxX, -umriss.minY),
    new THREE.Vector2(umriss.maxX, -umriss.maxY), new THREE.Vector2(umriss.minX, -umriss.maxY),
  ]);
  if (hof) form.holes.push(new THREE.Path(hof.map((q) => new THREE.Vector2(q.x, -q.y))));
  const geo = new THREE.ExtrudeGeometry(form, { depth: dicke, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, m);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function baueHuelle(x: {
  haus: HausPlan; einheiten: Einheit3d[]; o: SzenenOptionen; h: number; basis: number; gruppe: THREE.Group;
  nurRundum: THREE.Object3D[]; hindernisse: Szene["hindernisse"]; stationen: Szene["stationen"]; hausAnsicht: boolean; konturen: Kontur[];
  mats: { wandMat: THREE.Material; fassadeMat: THREE.Material; kappeMat: THREE.Material; glas: THREE.Material; rahmenMat: THREE.Material; tuerMat: THREE.Material; stein: THREE.Material };
}) {
  const { haus, o, h, M } = { ...x, M: x.mats };
  const umriss = rahmen(haus.huelle.waende.flatMap((w) => [w.a, w.b]));
  const deckeMat = mat("#d9d6d0", 0.95);
  const treppeMat = mat("#c9c4bb", 0.8);
  let obersteY = 0;
  for (let g = 0; g < haus.geschosse; g++) {
    if (o.nurGeschoss !== undefined && g !== o.nurGeschoss) continue;
    const y = o.nurGeschoss !== undefined ? 0 : (g - x.basis) * geschossHoehe(o);
    obersteY = Math.max(obersteY, y);
    // Wo eine Einheit dieses Geschosses liegt, tritt die Hülle zurück.
    const frei = x.einheiten.filter((e) => (e.plan.geschoss ?? 0) === g).map((e) => {
      const r = planRahmen(e.plan);
      const v = e.plan.versatz ?? { x: 0, y: 0 };
      return { minX: r.minX + v.x - 0.05, minY: r.minY + v.y - 0.05, maxX: r.maxX + v.x + 0.05, maxY: r.maxY + v.y + 0.05 };
    });
    const plan = huelleAusschneiden(haus.huelle, frei);
    const ebene = new THREE.Group();
    ebene.position.y = y;
    x.konturen.push({ y0: y, y1: y + h, erdgeschoss: g === 0, art: "fassade", punkte: rechteckPunkte(umriss, 0.3) });
    if (haus.hof) x.konturen.push({ y0: y, y1: y + h, erdgeschoss: g === 0, art: "hof", punkte: haus.hof });
    ebene.add(baueWaende(plan, h, M.wandMat, M.kappeMat, M.glas, M.rahmenMat, M.tuerMat, x.nurRundum));
    const decke = platte(umriss, haus.hof, DECKE, deckeMat);
    decke.position.y = -DECKE - 0.01;
    ebene.add(decke);
    for (const r of plan.raeume) {
      const boden = new THREE.Mesh(flaechenGeometrie(r.punkte), M.stein);
      boden.position.y = 0.001;
      boden.receiveShadow = true;
      ebene.add(boden);
      // Die Treppe steigt bis zum nächsten Fußboden (Wand plus Decke), im Schnitt nur bis zur Schnitthöhe.
      if (r.typ === "treppenhaus") ebene.add(treppe(rahmen(r.punkte), h < o.wandhoehe ? h : o.wandhoehe + DECKE, treppeMat));
    }
    for (const w of plan.waende) {
      const l = laenge(w.a, w.b);
      x.hindernisse.push({ wand: w, versatz: { x: 0, y: 0 }, tueren: plan.oeffnungen.filter((q) => q.wandId === w.id && q.art === "tuer").map((q) => [q.position - q.breite / 2, Math.min(l, q.position + q.breite / 2)]) });
    }
    if (x.hausAnsicht && x.o.beschriftung) {
      const el = document.createElement("div");
      el.className = "g3d-label";
      el.innerHTML = `<b>${GESCHOSS_TEXT(g)}</b>`;
      const label = new CSS2DObject(el);
      label.position.set(umriss.maxX + 1.2, h / 2, (umriss.minY + umriss.maxY) / 2);
      ebene.add(label);
      x.nurRundum.push(label);
    }
    if (x.hausAnsicht && !x.stationen.some((s) => s.name === GESCHOSS_TEXT(g))) {
      x.stationen.push({ ziel: new THREE.Vector3((umriss.minX + umriss.maxX) / 2, y + 1, (umriss.minY + umriss.maxY) / 2), name: GESCHOSS_TEXT(g) });
    }
    x.gruppe.add(ebene);
  }
  const ganzesHaus = o.nurGeschoss === undefined;
  // Dach: Mansarde nach Fotos oder flache Platte; im Schnitt und bei einem einzelnen Geschoss offen.
  if (ganzesHaus && !o.schnitt) {
    const form = o.aussehen?.dach;
    if (form?.art === "mansarde") {
      const unterkante = platte(umriss, haus.hof, DECKE, mat("#d9d6d0", 0.95));
      unterkante.position.y = obersteY + o.wandhoehe;
      // Die Giebelstücke über den Brandwänden in deren Farbe.
      const brand = o.aussehen?.brandwand ? new THREE.MeshStandardMaterial({ color: o.aussehen.brandwand.farbe, roughness: 0.95, side: THREE.DoubleSide }) : M.fassadeMat;
      x.gruppe.add(unterkante, mansarde(form, umriss, haus.hof, obersteY + o.wandhoehe + DECKE, brand));
    } else {
      const dach = platte(umriss, haus.hof, 0.35, mat(form?.art === "flach" && form.farbe ? form.farbe : "#6f6a64", 0.9));
      dach.position.y = obersteY + o.wandhoehe;
      x.gruppe.add(dach);
    }
  }
  // Hof: gepflastert, auf Höhe des Erdgeschossbodens.
  if (haus.hof && (ganzesHaus || o.nurGeschoss === x.basis)) {
    const hof = new THREE.Mesh(flaechenGeometrie(haus.hof), new THREE.MeshStandardMaterial({ map: fliesen("#b9b4aa", "#8f8a80"), roughness: 0.95 }));
    hof.position.y = -DECKE - 0.01;
    hof.receiveShadow = true;
    x.gruppe.add(hof);
  }
  // Aufzüge: Glasschacht mit Stahlrahmen über alle gezeigten Geschosse.
  const schachtH = obersteY + o.wandhoehe + 1.2 + DECKE;
  const stahl = mat("#4a4f55", 0.4, 0.7);
  const schachtGlas = new THREE.MeshStandardMaterial({ color: "#bcd3dd", roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.35, depthWrite: false });
  for (const a of haus.aufzuege) {
    const g = new THREE.Group();
    const glasKoerper = quader(a.b, schachtH, a.t, schachtGlas);
    glasKoerper.castShadow = false;
    glasKoerper.position.set(a.x + a.b / 2, -DECKE + schachtH / 2, a.y + a.t / 2);
    g.add(glasKoerper);
    for (const [dx, dz] of [[0, 0], [a.b, 0], [0, a.t], [a.b, a.t]]) {
      const pfosten = quader(0.08, schachtH, 0.08, stahl);
      pfosten.position.set(a.x + dx, -DECKE + schachtH / 2, a.y + dz);
      g.add(pfosten);
    }
    const kabine = quader(a.b * 0.8, 2.2, a.t * 0.8, stahl);
    kabine.position.set(a.x + a.b / 2, 1.1, a.y + a.t / 2);
    g.add(kabine);
    const deckel = quader(a.b + 0.1, 0.15, a.t + 0.1, stahl);
    deckel.position.set(a.x + a.b / 2, -DECKE + schachtH, a.y + a.t / 2);
    g.add(deckel);
    x.gruppe.add(g);
  }
}

/** Speicher freigeben: Geometrien, Materialien und Muster. */
export function entsorge(obj: THREE.Object3D): void {
  const mats = new Set<THREE.Material>();
  obj.traverse((x) => {
    if (x instanceof THREE.Mesh) {
      x.geometry.dispose();
      (Array.isArray(x.material) ? x.material : [x.material]).forEach((m) => mats.add(m));
    }
    if (x instanceof CSS2DObject) x.element.remove();
  });
  // Höhenkarte eines Flächendachs hängt nur an Shader-Uniforms, nicht an einem Material.
  (obj.userData.dachKarte as THREE.Texture | undefined)?.dispose();
  mats.forEach((m) => {
    const map = (m as THREE.MeshStandardMaterial).map;
    if (map) map.dispose();
    m.dispose();
  });
}

/* ── Bühne: Licht, Umgebung, Boden ─────────────────────────────────── */

export interface Buehne { licht: THREE.DirectionalLight; himmel: THREE.HemisphereLight; boden: THREE.Mesh; umgebung: THREE.Texture }

/**
 * Licht und Umgebung, gemeinsam für Ansicht und Standbild. Die
 * Raumumgebung (RoomEnvironment) gibt weiches, gleichmäßiges Licht und
 * Spiegelungen auf Glas und Lack, ohne eine Bilddatei laden zu müssen.
 */
export function richteBuehneEin(renderer: THREE.WebGLRenderer, scene: THREE.Scene, schatten: boolean): Buehne {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = schatten;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const umgebung = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = umgebung;
  scene.environmentIntensity = 0.55;
  scene.background = new THREE.Color("#eef0f2");
  const himmel = new THREE.HemisphereLight("#ffffff", "#d9d3c8", 0.75);
  scene.add(himmel);
  const licht = new THREE.DirectionalLight("#fff4e5", 2.0);
  licht.castShadow = schatten;
  licht.shadow.mapSize.set(2048, 2048);
  licht.shadow.bias = -0.0004;
  licht.shadow.normalBias = 0.02;
  scene.add(licht, licht.target);
  const boden = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: "#e4e2dd", roughness: 1 }));
  boden.rotation.x = -Math.PI / 2;
  boden.receiveShadow = true;
  scene.add(boden);
  return { licht, himmel, boden, umgebung };
}

/** Sonne und Boden an die Größe der Szene anpassen. */
export function buehneAnpassen(b: Buehne, box: THREE.Box3): void {
  const c = box.getCenter(new THREE.Vector3());
  const s = Math.max(4, box.getSize(new THREE.Vector3()).length());
  b.licht.position.set(c.x + s * 0.45, c.y + s * 1.1, c.z + s * 0.35);
  b.licht.target.position.copy(c);
  b.licht.userData.abstand = s * 1.2;
  const k = b.licht.shadow.camera;
  k.left = -s * 0.7; k.right = s * 0.7; k.top = s * 0.7; k.bottom = -s * 0.7; k.near = 0.1; k.far = s * 4;
  k.updateProjectionMatrix();
  // Deutlich unter dem Fußboden, sonst flimmern beide (z-fighting).
  b.boden.position.y = box.min.y - 0.08;
}

/** Kamera schräg von oben auf die ganze Szene. */
export function kameraRundum(kamera: THREE.PerspectiveCamera, box: THREE.Box3, strasse: Seite = "rechts"): THREE.Vector3 {
  const c = box.getCenter(new THREE.Vector3());
  const groesse = box.getSize(new THREE.Vector3());
  // Im Hochformat (Handy) weiter weg, sonst ragt das Modell seitlich hinaus.
  const s = Math.max(3, groesse.length()) * (kamera.aspect < 1 ? Math.min(2, 1 / kamera.aspect) : 1);
  if (groesse.y > 4) {
    // Ein Haus mit mehreren Geschossen: flach von schräg vorn auf die Straßenfassade, wie ein Passant mit etwas Abstand.
    const vorn = { rechts: [1, 0], links: [-1, 0], oben: [0, -1], unten: [0, 1] }[strasse];
    const quer = [-vorn[1], vorn[0]];
    kamera.position.set(c.x + s * (0.82 * vorn[0] + 0.48 * quer[0]), c.y + s * 0.34, c.z + s * (0.82 * vorn[1] + 0.48 * quer[1]));
  } else {
    // Eine Wohnung steil von oben: Wände verdecken so wenig vom Boden dahinter.
    kamera.position.set(c.x + s * 0.05, c.y + s * 0.72, c.z + s * 0.32);
  }
  kamera.lookAt(c);
  return c;
}

/* ── Licht: Tageszeit und Nacht ────────────────────────────────────── */

export type Lichtart = "tag" | "nacht";

/**
 * Sonnenstand vereinfacht für Berlin um die Tag-und-Nacht-Gleiche: um 6 Uhr
 * im Osten, um 12 Uhr im Süden in rund 38 Grad Höhe, um 18 Uhr im Westen.
 * Zurück kommt die Richtung zur Sonne in Szenenkoordinaten. Der Nordwinkel
 * des Plans dreht sie mit, damit die Schatten zur echten Ausrichtung passen.
 * ponytail: ohne Jahreszeit; mit Datum und Breitengrad genauer, falls nötig.
 */
export function sonnenRichtung(stunde: number, nordWinkel: number): THREE.Vector3 {
  const t = Math.max(0, Math.min(1, (stunde - 6) / 12));
  const kompass = 90 + t * 180; // Grad im Uhrzeigersinn ab Norden
  const hoehe = Math.max(6, 38 * Math.sin(Math.PI * t)) * Math.PI / 180;
  const imPlan = (nordWinkel + kompass) * Math.PI / 180; // im Uhrzeigersinn ab „oben im Plan“
  return new THREE.Vector3(Math.sin(imPlan) * Math.cos(hoehe), Math.sin(hoehe), -Math.cos(imPlan) * Math.cos(hoehe)).normalize();
}

/** Tageslicht nach Uhrzeit oder Nacht mit dunklem Himmel und leuchtenden Fenstern. */
export function lichtSetzen(scene: THREE.Scene, b: Buehne, szene: Szene, o: { art: Lichtart; stunde: number; nordWinkel: number }): void {
  const c = szene.rahmen.getCenter(new THREE.Vector3());
  const abstand = (b.licht.userData.abstand as number) || 20;
  if (o.art === "tag") {
    const r = sonnenRichtung(o.stunde, o.nordWinkel);
    b.licht.position.copy(c).addScaledVector(r, abstand);
    // Morgens und abends wärmer und schwächer.
    const flach = 1 - Math.min(1, r.y / 0.6);
    b.licht.color.setHSL(0.09, 0.4 + 0.5 * flach, 0.92 - 0.2 * flach);
    b.licht.intensity = 2.2 - flach * 0.9;
    b.himmel.intensity = 0.75;
    b.himmel.color.set("#ffffff");
    scene.environmentIntensity = 0.55;
    scene.background = new THREE.Color(flach > 0.6 ? "#f1e6d8" : "#eef0f2");
    szene.glas.emissive.set("#000000");
    szene.glas.opacity = 0.3;
    (b.boden.material as THREE.MeshStandardMaterial).color.set("#e4e2dd");
  } else {
    // Mondlicht von schräg oben, sehr schwach und bläulich.
    b.licht.position.copy(c).add(new THREE.Vector3(-0.4, 1, 0.3).normalize().multiplyScalar(abstand));
    b.licht.color.set("#9db4ff");
    b.licht.intensity = 0.25;
    b.himmel.color.set("#3a4a78");
    b.himmel.intensity = 0.12;
    scene.environmentIntensity = 0.08;
    scene.background = new THREE.Color("#0d1526");
    szene.glas.emissive.set("#ffcf87");
    szene.glas.emissiveIntensity = 2.6;
    szene.glas.opacity = 0.9;
    (b.boden.material as THREE.MeshStandardMaterial).color.set("#1b2233");
  }
  b.licht.target.position.copy(c);
}
