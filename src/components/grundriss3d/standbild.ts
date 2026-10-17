import * as THREE from "three";
import { baueSzene, buehneAnpassen, entsorge, kameraRundum, richteBuehneEin, type Einheit3d, type StilId } from "./szene";

/**
 * Ein Standbild des 3D-Modells als JPEG-Data-URL, für das PDF-Exposé (PDFs
 * sind nicht interaktiv). Rendert unsichtbar in eine eigene Zeichenfläche.
 * Ohne WebGL kommt null, das PDF zeigt dann nur den normalen Grundriss.
 */
export async function standbild(einheiten: Einheit3d[], o: { breite?: number; hoehe?: number; stil?: StilId } = {}): Promise<{ src: string; breite: number; hoehe: number } | null> {
  const breite = o.breite ?? 1600, hoehe = o.hoehe ?? 1100;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  } catch {
    return null;
  }
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(breite, hoehe, false);
    const scene = new THREE.Scene();
    const buehne = richteBuehneEin(renderer, scene, true);
    scene.background = new THREE.Color("#ffffff");
    const szene = baueSzene(einheiten, { wandhoehe: 2.65, stil: o.stil ?? "modern", beschriftung: false, explosion: einheiten.length > 2 ? 1.2 : 0 });
    scene.add(szene.gruppe);
    buehneAnpassen(buehne, szene.rahmen);
    const kamera = new THREE.PerspectiveCamera(40, breite / hoehe, 0.1, 500);
    kameraRundum(kamera, szene.rahmen);
    renderer.render(scene, kamera);
    const src = renderer.domElement.toDataURL("image/jpeg", 0.9);
    entsorge(scene);
    buehne.umgebung.dispose();
    return src.startsWith("data:image/jpeg") ? { src, breite, hoehe } : null;
  } finally {
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
