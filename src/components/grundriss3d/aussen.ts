import * as THREE from "three";
import { punktInPolygon, type Aussehen, type Dach, type Gaube, type Punkt } from "./plan";

/*
 * Das Haus von außen: Fassadenfarben, Dächer und Balkone nach Fotos und
 * Ansichten (Aussehen in plan.ts). Wird nur aus szene.ts gerufen und liegt
 * damit im selben nachgeladenen Chunk.
 */

/** Außenumriss eines Geschosses in Weltkoordinaten (x, z). */
export interface Kontur {
  y0: number;
  y1: number;
  /** Erdgeschoss: dort gilt die Sockelfarbe. */
  erdgeschoss: boolean;
  art: "fassade" | "hof";
  punkte: Punkt[];
}

export function rechteckPunkte(r: { minX: number; minY: number; maxX: number; maxY: number }, rand = 0): Punkt[] {
  return [
    { x: r.minX - rand, y: r.minY - rand }, { x: r.maxX + rand, y: r.minY - rand },
    { x: r.maxX + rand, y: r.maxY + rand }, { x: r.minX - rand, y: r.maxY + rand },
  ];
}

/* ── Fassade ───────────────────────────────────────────────────────── */

/**
 * Färbt die nach außen zeigenden Wandseiten. Je Dreieck: Zeigt ein Schritt
 * von 30 cm entlang der Flächennormale aus allen Umrissen hinaus (oder in den
 * Hof hinein), liegt die Seite außen. So bleiben Innenseiten, Laibungen und
 * Wände zum Nachbarhaus in der Wandfarbe. Farben gehen als Vertexfarben in
 * eine Kopie des Wandmaterials.
 */
export function faerbeFassade(gruppe: THREE.Object3D, wandMats: Set<THREE.Material>, konturen: Kontur[], farben: { wand: string; fassade: string; sockel?: string; hof?: string; brandwand?: Aussehen["brandwand"] }): void {
  if (!konturen.length) return;
  gruppe.updateMatrixWorld(true);
  const wand = new THREE.Color(farben.wand), fassade = new THREE.Color(farben.fassade);
  const sockel = new THREE.Color(farben.sockel ?? farben.fassade), hof = new THREE.Color(farben.hof ?? farben.fassade);
  const brand = farben.brandwand ? new THREE.Color(farben.brandwand.farbe) : null;
  const brandSeite = (n: THREE.Vector3): boolean => {
    const s = farben.brandwand?.seiten ?? [];
    return (n.x < -0.9 && s.includes("links")) || (n.x > 0.9 && s.includes("rechts")) || (n.z < -0.9 && s.includes("oben")) || (n.z > 0.9 && s.includes("unten"));
  };
  const kopien = new Map<THREE.Material, THREE.Material>();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), m = new THREE.Vector3();

  const aussenFarbe = (p: THREE.Vector3, normale: THREE.Vector3): THREE.Color | null => {
    if (Math.abs(normale.y) > 0.4) return null;
    const hier = konturen.filter((k) => p.y >= k.y0 - 0.05 && p.y <= k.y1 + 0.05);
    if (!hier.length) return null;
    const vor = { x: p.x + normale.x * 0.3, y: p.z + normale.z * 0.3 };
    const zurueck = { x: p.x - normale.x * 0.3, y: p.z - normale.z * 0.3 };
    const fassaden = hier.filter((k) => k.art === "fassade");
    const imHof = hier.find((k) => k.art === "hof" && punktInPolygon(vor, k.punkte) && !punktInPolygon(zurueck, k.punkte));
    if (imHof) return imHof.erdgeschoss && farben.sockel && !farben.hof ? sockel : hof;
    if (!fassaden.length || fassaden.some((k) => punktInPolygon(vor, k.punkte))) return null;
    if (!fassaden.some((k) => punktInPolygon(zurueck, k.punkte))) return null;
    if (brand && brandSeite(normale)) return brand;
    return fassaden.some((k) => k.erdgeschoss) ? sockel : fassade;
  };

  gruppe.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material) || !wandMats.has(o.material)) return;
    const geo = o.geometry as THREE.BufferGeometry;
    const pos = geo.getAttribute("position");
    const index = geo.getIndex();
    const dreiecke = index ? index.count / 3 : pos.count / 3;
    const farbe = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) wand.toArray(farbe, i * 3);
    let aussen = false;
    for (let t = 0; t < dreiecke; t++) {
      const i0 = index ? index.getX(t * 3) : t * 3, i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1, i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(o.matrixWorld);
      b.fromBufferAttribute(pos, i1).applyMatrix4(o.matrixWorld);
      c.fromBufferAttribute(pos, i2).applyMatrix4(o.matrixWorld);
      n.subVectors(c, b).cross(m.subVectors(a, b)).normalize();
      m.copy(a).add(b).add(c).divideScalar(3);
      const f = aussenFarbe(m, n);
      if (!f) continue;
      aussen = true;
      for (const i of [i0, i1, i2]) f.toArray(farbe, i * 3);
    }
    if (!aussen) return;
    geo.setAttribute("color", new THREE.BufferAttribute(farbe, 3));
    let kopie = kopien.get(o.material);
    if (!kopie) {
      kopie = o.material.clone();
      (kopie as THREE.MeshStandardMaterial).vertexColors = true;
      (kopie as THREE.MeshStandardMaterial).color.set("#ffffff");
      kopien.set(o.material, kopie);
    }
    o.material = kopie;
  });
}

/* ── Dächer ────────────────────────────────────────────────────────── */

/** Dachziegel in Reihen, ein Bild je Meter. */
function ziegel(farbe: string): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const k = c.getContext("2d");
  if (k) {
    const basis = new THREE.Color(farbe);
    const reihen = 3, spalten = 4, h = 128 / reihen, b = 128 / spalten;
    for (let r = 0; r < reihen; r++) for (let s = -1; s < spalten; s++) {
      const x = s * b + (r % 2 ? b / 2 : 0);
      k.fillStyle = `#${basis.clone().offsetHSL(0, 0, (((r * 7 + s * 3) % 5) - 2) / 70).getHexString()}`;
      k.fillRect(x, r * h, b, h);
      k.fillStyle = `#${basis.clone().offsetHSL(0, 0, -0.12).getHexString()}`;
      k.fillRect(x, r * h + h - 3, b, 3);
      k.fillRect(x, r * h, 1.5, h);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Ebenes Vieleck im Raum als Fläche, mit UV in Metern (u entlang der ersten Kante). */
function flaeche3d(ecken: THREE.Vector3[], m: THREE.Material): THREE.Mesh {
  const u = new THREE.Vector3().subVectors(ecken[1], ecken[0]).normalize();
  const n = new THREE.Vector3().subVectors(ecken[1], ecken[0]).cross(new THREE.Vector3().subVectors(ecken[ecken.length - 1], ecken[0])).normalize();
  const v = new THREE.Vector3().crossVectors(n, u);
  const pos: number[] = [], uv: number[] = [];
  for (let i = 1; i < ecken.length - 1; i++) {
    for (const e of [ecken[0], ecken[i], ecken[i + 1]]) {
      pos.push(e.x, e.y, e.z);
      const d = new THREE.Vector3().subVectors(e, ecken[0]);
      uv.push(d.dot(u), d.dot(v));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, m);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export interface Steildach {
  gruppe: THREE.Group;
  /** Schnittebenen: alles darüber wird im Dachgeschoss abgeschnitten. */
  ebenen: THREE.Plane[];
}

/**
 * Sattel- oder Walmdach über einem Rechteck (Außenkante der Wände). `y` ist
 * die Höhe des Dachfußes (Geschossboden + Kniestock), `wandOben` die Oberkante
 * der Wände: darüber schließen Giebeldreiecke in Fassadenfarbe.
 */
export function steildach(dach: Extract<Dach, { art: "sattel" | "walm" }>, r: { minX: number; minY: number; maxX: number; maxY: number }, y: number, wandOben: number, fassade: THREE.Material, mitGauben?: { liste: Gaube[]; boden: number }): Steildach {
  const g = new THREE.Group();
  const t = Math.tan((dach.neigung * Math.PI) / 180);
  const ue = dach.ueberstand ?? 0.4;
  const deckung = new THREE.MeshStandardMaterial({ map: ziegel(dach.farbe), roughness: 0.85, side: THREE.DoubleSide });
  // First entlang x heißt: Traufen oben und unten (y), Giebel links und rechts.
  const firstX = dach.art === "sattel" ? dach.first === "x" : r.maxX - r.minX >= r.maxY - r.minY;
  const V = (x: number, h: number, z: number) => new THREE.Vector3(x, h, z);
  const halb = firstX ? (r.maxY - r.minY) / 2 : (r.maxX - r.minX) / 2;
  const first = y + halb * t;
  const tief = y - ue * t;
  const ebenen: THREE.Plane[] = [];
  // Ebenen durch die Traufkanten; die Normale zeigt zur Seite, die stehen bleibt.
  if (firstX) {
    ebenen.push(new THREE.Plane().setComponents(0, -1, t, y - r.minY * t).normalize(), new THREE.Plane().setComponents(0, -1, -t, y + r.maxY * t).normalize());
  } else {
    ebenen.push(new THREE.Plane().setComponents(t, -1, 0, y - r.minX * t).normalize(), new THREE.Plane().setComponents(-t, -1, 0, y + r.maxX * t).normalize());
  }
  const mitte = firstX ? (r.minY + r.maxY) / 2 : (r.minX + r.maxX) / 2;
  if (dach.art === "sattel") {
    if (firstX) {
      const x0 = r.minX - ue, x1 = r.maxX + ue;
      g.add(flaeche3d([V(x0, tief, r.minY - ue), V(x1, tief, r.minY - ue), V(x1, first, mitte), V(x0, first, mitte)], deckung));
      g.add(flaeche3d([V(x1, tief, r.maxY + ue), V(x0, tief, r.maxY + ue), V(x0, first, mitte), V(x1, first, mitte)], deckung));
    } else {
      const z0 = r.minY - ue, z1 = r.maxY + ue;
      g.add(flaeche3d([V(r.minX - ue, tief, z1), V(r.minX - ue, tief, z0), V(mitte, first, z0), V(mitte, first, z1)], deckung));
      g.add(flaeche3d([V(r.maxX + ue, tief, z0), V(r.maxX + ue, tief, z1), V(mitte, first, z1), V(mitte, first, z0)], deckung));
    }
    // Giebel über der Wandoberkante.
    const lo = firstX ? r.minY : r.minX, hi = firstX ? r.maxY : r.maxX;
    const giebel = (aussen: number) => {
      const ab = Math.max(y, wandOben);
      if (ab >= first - 0.01) return;
      const d = (ab - y) / t;
      const punkte = ab > y ? [[lo + d, ab], [mitte, first], [hi - d, ab]] : [[lo, ab], [lo, y], [mitte, first], [hi, y], [hi, ab]];
      g.add(flaeche3d(punkte.map(([q, h]) => (firstX ? V(aussen, h, q) : V(q, h, aussen))), fassade));
    };
    if (firstX) { giebel(r.minX); giebel(r.maxX); } else { giebel(r.minY); giebel(r.maxY); }
  } else {
    // Walm: First kürzer um die Breite, vier Flächen.
    const lang = firstX ? r.maxX - r.minX : r.maxY - r.minY;
    const rest = Math.max(0, lang / 2 - halb);
    const c = firstX ? (r.minX + r.maxX) / 2 : (r.minY + r.maxY) / 2;
    const e = [V(r.minX - ue, tief, r.minY - ue), V(r.maxX + ue, tief, r.minY - ue), V(r.maxX + ue, tief, r.maxY + ue), V(r.minX - ue, tief, r.maxY + ue)];
    const f0 = firstX ? V(c - rest, first, mitte) : V(mitte, first, c - rest);
    const f1 = firstX ? V(c + rest, first, mitte) : V(mitte, first, c + rest);
    if (firstX) {
      g.add(flaeche3d([e[0], e[1], f1, f0], deckung), flaeche3d([e[2], e[3], f0, f1], deckung), flaeche3d([e[3], e[0], f0], deckung), flaeche3d([e[1], e[2], f1], deckung));
      ebenen.push(new THREE.Plane().setComponents(t, -1, 0, y - r.minX * t).normalize(), new THREE.Plane().setComponents(-t, -1, 0, y + r.maxX * t).normalize());
    } else {
      g.add(flaeche3d([e[3], e[0], f0, f1], deckung), flaeche3d([e[1], e[2], f1, f0], deckung), flaeche3d([e[0], e[1], f0], deckung), flaeche3d([e[2], e[3], f1], deckung));
      ebenen.push(new THREE.Plane().setComponents(0, -1, t, y - r.minY * t).normalize(), new THREE.Plane().setComponents(0, -1, -t, y + r.maxY * t).normalize());
    }
  }
  if (mitGauben?.liste.length) g.add(gauben(mitGauben.liste, r, y, mitGauben.boden, t, deckung, fassade));
  return { gruppe: g, ebenen };
}

/**
 * Gauben auf einem Steildach: Vorderwand mit Fenster, seitliche Wangen bis
 * zur Dachfläche, eigenes Sattel- oder Flachdach. `y` ist der Dachfuß an der
 * Außenwand, `boden` der Dachgeschossboden, `t` die Steigung (tan Neigung).
 * Innen schneidet die Hauptdachfläche weiter durch; von außen zählt die Form.
 */
export function gauben(liste: Gaube[], r: { minX: number; minY: number; maxX: number; maxY: number }, y: number, boden: number, t: number, deckung: THREE.Material, fassade: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const glas = new THREE.MeshStandardMaterial({ color: "#3d4a55", roughness: 0.15, metalness: 0.3, side: THREE.DoubleSide });
  const rahmen = new THREE.MeshStandardMaterial({ color: "#f4f2ee", roughness: 0.5, side: THREE.DoubleSide });
  for (const q of liste) {
    // Örtliches Achsenkreuz: u entlang der Traufe, v von der Außenwand ins Dach hinein.
    const P = (u: number, h: number, v: number): THREE.Vector3 => {
      if (q.seite === "oben") return new THREE.Vector3(u, h, r.minY + v);
      if (q.seite === "unten") return new THREE.Vector3(u, h, r.maxY - v);
      if (q.seite === "links") return new THREE.Vector3(r.minX + v, h, u);
      return new THREE.Vector3(r.maxX - v, h, u);
    };
    const dachAn = (v: number) => y + v * t;
    const u0 = q.von, u1 = q.von + q.b, um = (u0 + u1) / 2, v0 = q.abstand;
    const top = boden + q.hoehe;
    const unten = Math.min(dachAn(v0), top) - 0.05;
    const firstH = q.art === "sattel" ? top + q.b / 2 : top;
    const hinten = (h: number) => Math.max(v0 + 0.2, (h - y) / t + 0.05);
    // Vorderwand: Rechteck, bei Satteldach mit Giebeldreieck.
    g.add(flaeche3d(q.art === "sattel" ? [P(u0, unten, v0), P(u1, unten, v0), P(u1, top, v0), P(um, firstH, v0), P(u0, top, v0)] : [P(u0, unten, v0), P(u1, unten, v0), P(u1, top, v0), P(u0, top, v0)], fassade));
    // Wangen bis zur Dachfläche.
    for (const u of [u0, u1]) g.add(flaeche3d([P(u, unten, v0), P(u, top, v0), P(u, top, hinten(top))], fassade));
    if (q.art === "sattel") {
      const ue = 0.25;
      g.add(flaeche3d([P(u0 - ue * 0.7, top - ue * 0.7, v0 - ue), P(um, firstH, v0 - ue), P(um, firstH, hinten(firstH)), P(u0 - ue * 0.7, top - ue * 0.7, hinten(top))], deckung));
      g.add(flaeche3d([P(um, firstH, v0 - ue), P(u1 + ue * 0.7, top - ue * 0.7, v0 - ue), P(u1 + ue * 0.7, top - ue * 0.7, hinten(top)), P(um, firstH, hinten(firstH))], deckung));
    } else {
      // Flachdach mit leichtem Gefälle nach vorn und kleinem Überstand.
      g.add(flaeche3d([P(u0 - 0.15, top + 0.04, v0 - 0.2), P(u1 + 0.15, top + 0.04, v0 - 0.2), P(u1 + 0.15, top + 0.12, hinten(top + 0.12)), P(u0 - 0.15, top + 0.12, hinten(top + 0.12))], deckung));
    }
    // Fenster: dunkles Glas mit hellem Rahmen, knapp vor der Vorderwand.
    const fb = Math.min(q.b - 0.3, q.fenster ?? q.b - 0.5), fu0 = um - fb / 2, fu1 = um + fb / 2;
    const fUnten = Math.max(unten + 0.15, top - 1.45), fOben = top - 0.2;
    if (fb > 0.3 && fOben - fUnten > 0.4) {
      g.add(flaeche3d([P(fu0 - 0.06, fUnten - 0.06, v0 - 0.01), P(fu1 + 0.06, fUnten - 0.06, v0 - 0.01), P(fu1 + 0.06, fOben + 0.06, v0 - 0.01), P(fu0 - 0.06, fOben + 0.06, v0 - 0.01)], rahmen));
      g.add(flaeche3d([P(fu0, fUnten, v0 - 0.02), P(fu1, fUnten, v0 - 0.02), P(fu1, fOben, v0 - 0.02), P(fu0, fOben, v0 - 0.02)], glas));
    }
  }
  return g;
}

/** Materialien eines Geschosses an den Dachflächen kappen (Kopien, die Originale teilen andere Geschosse). */
export function kappeAnDach(ebene: THREE.Object3D, ebenen: THREE.Plane[]): void {
  const kopien = new Map<THREE.Material, THREE.Material>();
  ebene.traverse((o) => {
    // Glas behalten: Die Nachtbeleuchtung schaltet es über das gemeinsame Material.
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material) || o.material.transparent) return;
    let k = kopien.get(o.material);
    if (!k) {
      k = o.material.clone();
      k.clippingPlanes = ebenen;
      k.clipShadows = true;
      kopien.set(o.material, k);
    }
    o.material = k;
  });
}

/** Linien a→b des Vielecks um `d` nach links verschoben, Ecken neu geschnitten. */
function versetzt(poly: Punkt[], abstaende: number[]): Punkt[] {
  const n = poly.length;
  const linie = (i: number) => {
    const a = poly[i], b = poly[(i + 1) % n];
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / l, ny = (b.x - a.x) / l;
    return { a: { x: a.x + nx * abstaende[i], y: a.y + ny * abstaende[i] }, d: { x: (b.x - a.x) / l, y: (b.y - a.y) / l } };
  };
  return poly.map((_, i) => {
    const p = linie((i - 1 + n) % n), q = linie(i);
    const kreuz = p.d.x * q.d.y - p.d.y * q.d.x;
    if (Math.abs(kreuz) < 1e-9) return q.a;
    const s = ((q.a.x - p.a.x) * q.d.y - (q.a.y - p.a.y) * q.d.x) / kreuz;
    return { x: p.a.x + p.d.x * s, y: p.a.y + p.d.y * s };
  });
}

function drehsinn(poly: Punkt[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; s += a.x * b.y - b.x * a.y; }
  return Math.sign(s) || 1;
}

/**
 * Berliner Mansarddach über einem Hausring: an den Traufseiten und am Hof
 * steile Ziegelflächen, dazwischen flach. Brandwandseiten bleiben senkrecht.
 */
export function mansarde(dach: Extract<Dach, { art: "mansarde" }>, r: { minX: number; minY: number; maxX: number; maxY: number }, hof: Punkt[] | undefined, y: number, fassade: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const deckung = new THREE.MeshStandardMaterial({ map: ziegel(dach.farbe), roughness: 0.85, side: THREE.DoubleSide });
  const flach = new THREE.MeshStandardMaterial({ color: dach.flach, roughness: 0.95, side: THREE.DoubleSide });
  const V = (p: Punkt, h: number) => new THREE.Vector3(p.x, h, p.y);
  const oben = y + dach.hoehe;
  // Umriss im Uhrzeigersinn des Plans: oben, rechts, unten, links.
  const aussen = rechteckPunkte(r);
  const seiten: Array<"oben" | "rechts" | "unten" | "links"> = ["oben", "rechts", "unten", "links"];
  const sinn = drehsinn(aussen);
  const innenAussen = versetzt(aussen, seiten.map((s) => (dach.traufe.includes(s) ? dach.tiefe * sinn : 0)));
  // Traufseiten steil in Ziegeln; Brandwandseiten liegen in der Wandebene und bekommen Putz.
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    g.add(flaeche3d([V(aussen[i], y), V(aussen[j], y), V(innenAussen[j], oben), V(innenAussen[i], oben)], dach.traufe.includes(seiten[i]) ? deckung : fassade));
  }
  const form = new THREE.Shape(innenAussen.map((p) => new THREE.Vector2(p.x, -p.y)));
  if (hof) {
    const hofSinn = drehsinn(hof);
    const hofAussen = versetzt(hof, hof.map(() => -dach.tiefe * hofSinn));
    for (let i = 0; i < hof.length; i++) {
      const j = (i + 1) % hof.length;
      g.add(flaeche3d([V(hof[i], y), V(hof[j], y), V(hofAussen[j], oben), V(hofAussen[i], oben)], deckung));
    }
    form.holes.push(new THREE.Path(hofAussen.map((p) => new THREE.Vector2(p.x, -p.y))));
  }
  const platte = new THREE.Mesh(new THREE.ShapeGeometry(form), flach);
  platte.geometry.rotateX(-Math.PI / 2);
  platte.position.y = oben;
  platte.receiveShadow = true;
  g.add(platte);
  return g;
}

/* ── Balkone ───────────────────────────────────────────────────────── */

/** Kragplatte mit Stahlgeländer; zur Wand hin (Seite im Umriss) ohne Geländer. */
export function balkon(b: NonNullable<Aussehen["balkone"]>[number], y: number, umriss: Punkt[] | null): THREE.Group {
  const g = new THREE.Group();
  const beton = new THREE.MeshStandardMaterial({ color: "#d6cfc2", roughness: 0.9 });
  const stahl = new THREE.MeshStandardMaterial({ color: "#2f3236", roughness: 0.45, metalness: 0.6 });
  const platte = new THREE.Mesh(new THREE.BoxGeometry(b.b, 0.2, b.t), beton);
  platte.position.set(b.x + b.b / 2, y - 0.1, b.y + b.t / 2);
  platte.castShadow = platte.receiveShadow = true;
  g.add(platte);
  const kanten: Array<[Punkt, Punkt]> = [
    [{ x: b.x, y: b.y }, { x: b.x + b.b, y: b.y }], [{ x: b.x + b.b, y: b.y }, { x: b.x + b.b, y: b.y + b.t }],
    [{ x: b.x + b.b, y: b.y + b.t }, { x: b.x, y: b.y + b.t }], [{ x: b.x, y: b.y + b.t }, { x: b.x, y: b.y }],
  ];
  const mx = b.x + b.b / 2, my = b.y + b.t / 2;
  for (const [p, q] of kanten) {
    const mitte = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    // Hinter der Kante liegt das Haus: dort steht die Wand, kein Geländer.
    const weg = Math.hypot(mitte.x - mx, mitte.y - my) || 1;
    const dahinter = { x: mitte.x + ((mitte.x - mx) / weg) * 0.15, y: mitte.y + ((mitte.y - my) / weg) * 0.15 };
    if (umriss && punktInPolygon(dahinter, umriss)) continue;
    const l = Math.hypot(q.x - p.x, q.y - p.y);
    const holm = new THREE.Mesh(new THREE.BoxGeometry(l, 0.05, 0.05), stahl);
    holm.position.set(mitte.x, y + 1.0, mitte.y);
    holm.rotation.y = -Math.atan2(q.y - p.y, q.x - p.x);
    g.add(holm);
    const staebe = Math.max(2, Math.round(l / 0.12));
    for (let i = 0; i <= staebe; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.018, 1.0, 0.018), stahl);
      s.position.set(p.x + ((q.x - p.x) * i) / staebe, y + 0.5, p.y + ((q.y - p.y) * i) / staebe);
      g.add(s);
    }
  }
  return g;
}
