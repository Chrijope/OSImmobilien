import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { Camera, Footprints, Maximize2, Minimize2, Orbit, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Play, Square, Sun, Moon, RotateCw } from "lucide-react";
import { schwachesGeraet } from "./Grundriss3dBlock";
import { aufWand } from "./plan";
import { STILE, WANDHOEHEN, baueSzene, buehneAnpassen, entsorge, kameraRundum, lichtSetzen, richteBuehneEin, type Buehne, type Einheit3d, type Lichtart, type StilId, type Szene } from "./szene";
import type { HausPlan } from "./plan";
import "./grundriss3d.css";

/*
 * Die interaktive 3D-Ansicht. Wird nur über `Grundriss3dBlock` (lazy)
 * geladen, damit three.js in einem eigenen Chunk liegt und das CRM nicht
 * langsamer startet.
 */

export interface Grundriss3dAnsichtProps {
  einheiten: Einheit3d[];
  /** Im Exposé: weniger Knöpfe, Stil und Wandhöhe bleiben wählbar. */
  kompakt?: boolean;
  hoehe?: number;
  fassade?: string;
  /** Gebäudehülle des Objekts (Außenwände, Hof, Treppenhäuser, Aufzüge), optional. */
  haus?: HausPlan | null;
  /** Startwerte, etwa für einen Link auf eine bestimmte Ansicht. */
  startwerte?: Partial<{ stil: StilId; schnitt: boolean; modus: Modus; explosion: number; wandhoehe: number; licht: Lichtart; stunde: number; drehen: boolean }>;
}

export type Modus = "rundum" | "begehung";
const AUGENHOEHE = 1.6;
const SCHRITT = 1.5; // m/s
const GESCHOSS_NAME = (g: number) => (g === 0 ? "EG" : g < 0 ? `${-g}. UG` : `${g}. OG`);

export default function Grundriss3dAnsicht({ einheiten, kompakt, hoehe = 480, fassade, startwerte, haus }: Grundriss3dAnsichtProps) {
  const huelle = useRef<HTMLDivElement>(null);
  const flaeche = useRef<HTMLDivElement>(null);
  const kompass = useRef<HTMLDivElement>(null);
  const welt = useRef<{
    renderer: THREE.WebGLRenderer; scene: THREE.Scene; kamera: THREE.PerspectiveCamera; steuerung: OrbitControls;
    labels: CSS2DRenderer; buehne: Buehne; szene?: Szene; neu: boolean; geschossWahl?: number; yaw: number; pitch: number; tasten: Set<string>;
    schwach: boolean; nachtLichter?: THREE.Group; rundgang?: Rundgang;
  } | null>(null);

  const geschosse = useMemo(() => [...new Set([...einheiten.map((e) => e.plan.geschoss ?? 0), ...(haus ? Array.from({ length: haus.geschosse }, (_, i) => i) : [])])].sort((a, b) => a - b), [einheiten, haus]);
  const mehrere = geschosse.length > 1;
  const [stil, setStil] = useState<StilId>(startwerte?.stil ?? "modern");
  // Ein Haus aus dem Bestand meist Altbau: dann 3,00 m als Start.
  const [wandhoehe, setWandhoehe] = useState(startwerte?.wandhoehe ?? (haus ? 3.0 : 2.65));
  const [modus, setModus] = useState<Modus>("rundum");
  const [beschriftung, setBeschriftung] = useState(true);
  const [schnitt, setSchnitt] = useState(!!startwerte?.schnitt);
  const [explosion, setExplosion] = useState(startwerte?.explosion ?? 0);
  const [nurGeschoss, setNurGeschoss] = useState<number | undefined>(undefined);
  const [vollbild, setVollbild] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [licht, setLicht] = useState<Lichtart>(startwerte?.licht ?? "tag");
  const [stunde, setStunde] = useState(startwerte?.stunde ?? 14);
  // Langsame Drehung zum Start, außer wer weniger Bewegung eingestellt hat.
  const [drehen, setDrehen] = useState(() => startwerte?.drehen ?? !(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false));
  const [station, setStation] = useState<string | null>(null);
  // Auf Touch-Geräten erst nach Antippen bedienbar, sonst bleibt man beim Scrollen der Seite im Modell hängen.
  const [bedienbar, setBedienbar] = useState(() => !(window.matchMedia?.("(pointer: coarse)").matches ?? false));
  const modusRef = useRef(modus);
  modusRef.current = modus;
  const nordWinkel = einheiten[0]?.plan.nordWinkel ?? 0;

  /* ── Aufbau einmalig ── */
  useEffect(() => {
    const el = flaeche.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
    } catch {
      setFehler("Dein Gerät kann die 3D-Ansicht nicht darstellen. Der Grundriss steht unten als Zeichnung.");
      return;
    }
    const grob = (window.matchMedia?.("(pointer: coarse)").matches ?? false) || schwachesGeraet();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, grob ? 1.5 : 2));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const buehne = richteBuehneEin(renderer, scene, !grob);
    const kamera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
    const steuerung = new OrbitControls(kamera, renderer.domElement);
    steuerung.enableDamping = true;
    steuerung.maxPolarAngle = Math.PI / 2 - 0.04;
    steuerung.minDistance = 1.5;
    steuerung.maxDistance = 120;
    steuerung.autoRotateSpeed = 0.7;
    // Erster Klick oder erstes Ziehen hält Drehung und Rundgang an.
    steuerung.addEventListener("start", () => { setDrehen(false); rundgangEnde(); });
    const labels = new CSS2DRenderer();
    labels.domElement.className = "g3d-labels";
    el.appendChild(labels.domElement);
    welt.current = { renderer, scene, kamera, steuerung, labels, buehne, neu: true, yaw: 0, pitch: 0, tasten: new Set(), schwach: grob };

    const groesse = () => {
      const b = el.clientWidth || 1, h = el.clientHeight || 1;
      renderer.setSize(b, h);
      labels.setSize(b, h);
      kamera.aspect = b / h;
      kamera.updateProjectionMatrix();
    };
    groesse();
    const beobachter = new ResizeObserver(groesse);
    beobachter.observe(el);

    // Begehung: Umsehen per Ziehen (Maus und Finger).
    let ziehen: { x: number; y: number } | null = null;
    const runter = (e: PointerEvent) => { rundgangEnde(); if (modusRef.current === "begehung") ziehen = { x: e.clientX, y: e.clientY }; };
    const bewegen = (e: PointerEvent) => {
      const w = welt.current;
      if (!ziehen || !w) return;
      w.yaw -= (e.clientX - ziehen.x) * 0.005;
      w.pitch = Math.max(-1.2, Math.min(1.2, w.pitch - (e.clientY - ziehen.y) * 0.005));
      ziehen = { x: e.clientX, y: e.clientY };
    };
    const hoch = () => { ziehen = null; };
    renderer.domElement.addEventListener("pointerdown", runter);
    window.addEventListener("pointermove", bewegen);
    window.addEventListener("pointerup", hoch);
    const taste = (an: boolean) => (e: KeyboardEvent) => {
      if (modusRef.current !== "begehung" || !welt.current) return;
      const k = e.key.toLowerCase();
      if (!["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) return;
      e.preventDefault();
      if (an) welt.current.tasten.add(k); else welt.current.tasten.delete(k);
    };
    const tasteRunter = taste(true), tasteHoch = taste(false);
    window.addEventListener("keydown", tasteRunter);
    window.addEventListener("keyup", tasteHoch);

    // Nur zeichnen, solange die Ansicht sichtbar ist.
    let sichtbar = true;
    const io = new IntersectionObserver(([e]) => { sichtbar = e.isIntersecting; });
    io.observe(el);

    let zuletzt = performance.now();
    let rahmenId = 0;
    const schleife = (jetzt: number) => {
      rahmenId = requestAnimationFrame(schleife);
      const dt = Math.min(0.1, (jetzt - zuletzt) / 1000);
      zuletzt = jetzt;
      const w = welt.current;
      if (!w || !sichtbar) return;
      if (w.rundgang) rundgangSchritt(w, dt, setStation);
      else if (modusRef.current === "begehung") gehen(w, dt);
      else w.steuerung.update();
      w.renderer.render(w.scene, w.kamera);
      w.labels.render(w.scene, w.kamera);
      if (kompass.current) {
        const blick = new THREE.Vector3();
        w.kamera.getWorldDirection(blick);
        const azimut = Math.atan2(blick.x, -blick.z) * 180 / Math.PI;
        kompass.current.style.transform = `rotate(${nordWinkel - azimut}deg)`;
      }
    };
    rahmenId = requestAnimationFrame(schleife);

    return () => {
      cancelAnimationFrame(rahmenId);
      beobachter.disconnect();
      io.disconnect();
      renderer.domElement.removeEventListener("pointerdown", runter);
      window.removeEventListener("pointermove", bewegen);
      window.removeEventListener("pointerup", hoch);
      window.removeEventListener("keydown", tasteRunter);
      window.removeEventListener("keyup", tasteHoch);
      steuerung.dispose();
      if (welt.current?.szene) entsorge(welt.current.szene.gruppe);
      entsorge(scene);
      buehne.umgebung.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      el.innerHTML = "";
      welt.current = null;
    };
  }, [nordWinkel]);

  /* ── Szene bei jeder Option neu bauen ── */
  useEffect(() => {
    const w = welt.current;
    if (!w) return;
    if (w.szene) { w.scene.remove(w.szene.gruppe); entsorge(w.szene.gruppe); }
    const szene = baueSzene(einheiten, { wandhoehe, stil, beschriftung: beschriftung && modus === "rundum", explosion, nurGeschoss, fassade: mehrere ? fassade : undefined, schnitt: schnitt && modus === "rundum" }, haus);
    w.szene = szene;
    w.scene.add(szene.gruppe);
    buehneAnpassen(w.buehne, szene.rahmen);
    szene.decken.forEach((d) => { d.visible = modus === "begehung"; });
    szene.nurRundum.forEach((d) => { d.visible = modus === "rundum"; });
    // Neu ausrichten beim ersten Mal und beim Wechsel zwischen Haus und einzelnem Geschoss.
    if ((w.neu || w.geschossWahl !== nurGeschoss) && modus === "rundum") {
      w.steuerung.target.copy(kameraRundum(w.kamera, szene.rahmen));
      w.neu = false;
    }
    w.geschossWahl = nurGeschoss;
    lichtAnwenden();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [einheiten, wandhoehe, stil, beschriftung, explosion, nurGeschoss, modus, fassade, mehrere, schnitt, haus]);

  /* ── Licht: Tag mit Uhrzeit oder Nacht, ohne die Szene neu zu bauen ── */
  const lichtAnwenden = () => {
    const w = welt.current;
    if (!w?.szene) return;
    lichtSetzen(w.scene, w.buehne, w.szene, { art: licht, stunde, nordWinkel });
    if (w.nachtLichter) { w.scene.remove(w.nachtLichter); w.nachtLichter = undefined; }
    // Deckenleuchten nur, solange es wenige sind; jedes Licht kostet Rechenzeit. Im Haus leuchten die Fenster.
    const hoechstens = w.schwach ? 3 : 8;
    if (licht === "nacht" && w.szene.lichtpunkte.length <= hoechstens) {
      w.nachtLichter = new THREE.Group();
      for (const p of w.szene.lichtpunkte) {
        const l = new THREE.PointLight("#ffd29a", 5, 7, 1.6);
        l.position.copy(p);
        w.nachtLichter.add(l);
      }
      w.scene.add(w.nachtLichter);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(lichtAnwenden, [licht, stunde]);

  /* ── Automatische Drehung ── */
  useEffect(() => {
    const w = welt.current;
    if (w) w.steuerung.autoRotate = drehen && modus === "rundum";
  }, [drehen, modus]);

  /* ── Rundgang: fährt die Räume ab, im Haus die Geschosse ── */
  const rundgangEnde = () => {
    const w = welt.current;
    if (!w?.rundgang) return;
    w.rundgang = undefined;
    w.steuerung.enabled = modusRef.current === "rundum";
    setStation(null);
  };
  const rundgangStarten = () => {
    const w = welt.current;
    if (!w?.szene?.stationen.length) return;
    if (modus !== "rundum") setModus("rundum");
    setDrehen(false);
    w.steuerung.enabled = false;
    const groesse = w.szene.rahmen.getSize(new THREE.Vector3());
    const abstand = mehrere && nurGeschoss === undefined ? Math.max(groesse.x, groesse.z) * 0.75 : 5.5;
    w.rundgang = {
      stationen: w.szene.stationen.map((s) => ({ ...s, kamera: s.ziel.clone().add(new THREE.Vector3(abstand * 0.25, abstand * 0.9, abstand * 0.6)) })),
      index: -1, zeit: 0,
      vonKamera: w.kamera.position.clone(), vonZiel: w.steuerung.target.clone(),
    };
  };

  /* ── Wechsel Rundum / Begehung ── */
  useEffect(() => {
    const w = welt.current;
    if (!w || !w.szene) return;
    w.steuerung.enabled = modus === "rundum";
    if (modus === "begehung") {
      w.kamera.position.set(w.szene.start.x, AUGENHOEHE, w.szene.start.z);
      w.yaw = w.szene.startBlick; w.pitch = -0.12;
      w.kamera.fov = 75;
    } else {
      w.kamera.fov = 50;
      w.steuerung.target.copy(kameraRundum(w.kamera, w.szene.rahmen));
    }
    w.kamera.updateProjectionMatrix();
  }, [modus]);

  // Begehung als Startwert erst, wenn die Szene steht.
  useEffect(() => {
    if (startwerte?.modus === "begehung") begehungStarten();
    // Nur einmal beim Start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Die Begehung läuft in einem Geschoss; im Haus ohne Auswahl das unterste.
  const begehungStarten = () => {
    rundgangEnde();
    if (mehrere && nurGeschoss === undefined) setNurGeschoss(geschosse[0]);
    setModus("begehung");
  };

  const bildSpeichern = () => {
    const w = welt.current;
    if (!w) return;
    w.renderer.render(w.scene, w.kamera);
    const a = document.createElement("a");
    a.href = w.renderer.domElement.toDataURL("image/png");
    a.download = "grundriss-3d.png";
    a.click();
  };

  const vollbildUmschalten = async () => {
    const el = huelle.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) { await document.exitFullscreen(); setVollbild(false); }
      else { await el.requestFullscreen(); setVollbild(true); }
    } catch { setVollbild((v) => !v); }
  };
  useEffect(() => {
    const ende = () => { if (!document.fullscreenElement) setVollbild(false); };
    document.addEventListener("fullscreenchange", ende);
    return () => document.removeEventListener("fullscreenchange", ende);
  }, []);

  const druecken = (k: string, an: boolean) => { const w = welt.current; if (!w) return; if (an) w.tasten.add(k); else w.tasten.delete(k); };
  const steuerKnopf = (k: string, Icon: typeof ArrowUp, label: string) => (
    <button type="button" aria-label={label} className="g3d-pad-knopf"
      onPointerDown={(e) => { e.preventDefault(); druecken(k, true); }} onPointerUp={() => druecken(k, false)} onPointerLeave={() => druecken(k, false)}>
      <Icon className="h-5 w-5" />
    </button>
  );

  if (fehler) return <p className="text-sm text-muted-foreground">{fehler}</p>;

  return (
    <div ref={huelle} className={`g3d ${licht === "nacht" ? "g3d-nacht" : ""} ${vollbild ? "g3d-vollbild" : ""} ${bedienbar || vollbild ? "" : "g3d-ruhend"}`} style={vollbild ? undefined : { height: hoehe }} data-testid="grundriss-3d-ansicht">
      <div ref={flaeche} className="g3d-flaeche" role="img" aria-label="3D-Ansicht des Grundrisses. Mit der Maus drehen, verschieben und zoomen." />
      {!bedienbar && !vollbild && (
        <button type="button" className="g3d-antippen" onClick={() => setBedienbar(true)}>Antippen zum Drehen und Zoomen</button>
      )}

      <div className="g3d-leiste">
        <div className="g3d-gruppe" role="group" aria-label="Ansicht">
          <button type="button" className={modus === "rundum" ? "aktiv" : ""} onClick={() => setModus("rundum")}><Orbit className="h-3.5 w-3.5" /> Rundum</button>
          <button type="button" className={modus === "begehung" ? "aktiv" : ""} onClick={begehungStarten}><Footprints className="h-3.5 w-3.5" /> Begehung</button>
        </div>
        <label className="g3d-feld">Stil
          <select value={stil} onChange={(e) => setStil(e.target.value as StilId)}>
            {(Object.keys(STILE) as StilId[]).map((s) => <option key={s} value={s}>{STILE[s].name}</option>)}
          </select>
        </label>
        <label className="g3d-feld">Wandhöhe
          <select value={wandhoehe} onChange={(e) => setWandhoehe(Number(e.target.value))}>
            {WANDHOEHEN.map((h) => <option key={h} value={h}>{h.toLocaleString("de-DE", { minimumFractionDigits: 2 })} m{h >= 3.2 ? " (Altbau)" : ""}</option>)}
          </select>
        </label>
        {mehrere && (
          <label className="g3d-feld">Geschoss
            <select value={nurGeschoss ?? "alle"} onChange={(e) => setNurGeschoss(e.target.value === "alle" ? undefined : Number(e.target.value))}>
              <option value="alle">Ganzes Haus</option>
              {geschosse.map((g) => <option key={g} value={g}>{GESCHOSS_NAME(g)}</option>)}
            </select>
          </label>
        )}
        {mehrere && nurGeschoss === undefined && modus === "rundum" && (
          <label className="g3d-feld g3d-regler">Etagen auseinander
            <input type="range" min={0} max={4} step={0.1} value={explosion} onChange={(e) => setExplosion(Number(e.target.value))} />
          </label>
        )}
        {modus === "rundum" && (
          <label className="g3d-feld g3d-haken" title="Wände bei 1,20 m abschneiden"><input type="checkbox" checked={schnitt} onChange={(e) => setSchnitt(e.target.checked)} /> Schnitt</label>
        )}
        {!kompakt && (
          <label className="g3d-feld g3d-haken"><input type="checkbox" checked={beschriftung} onChange={(e) => setBeschriftung(e.target.checked)} /> Räume und m²</label>
        )}
        <div className="g3d-gruppe" role="group" aria-label="Animation">
          <button type="button" className={station ? "aktiv" : ""} onClick={() => (station ? rundgangEnde() : rundgangStarten())}>
            {station ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />} Rundgang
          </button>
          {modus === "rundum" && (
            <button type="button" className={drehen ? "aktiv" : ""} onClick={() => setDrehen((d) => !d)} title="Langsam drehen" aria-label="Langsam drehen" aria-pressed={drehen}>
              <RotateCw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="g3d-gruppe" role="group" aria-label="Licht">
          <button type="button" className={licht === "tag" ? "aktiv" : ""} onClick={() => setLicht("tag")}><Sun className="h-3.5 w-3.5" /> Tag</button>
          <button type="button" className={licht === "nacht" ? "aktiv" : ""} onClick={() => setLicht("nacht")}><Moon className="h-3.5 w-3.5" /> Nacht</button>
        </div>
        {licht === "tag" && (
          <label className="g3d-feld g3d-regler">Uhrzeit {stunde} Uhr
            <input type="range" min={6} max={20} step={1} value={stunde} onChange={(e) => setStunde(Number(e.target.value))} aria-label="Uhrzeit für den Sonnenstand" />
          </label>
        )}
        <div className="g3d-gruppe g3d-rechts">
          <button type="button" onClick={bildSpeichern} title="Als Bild speichern" aria-label="Als Bild speichern"><Camera className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={vollbildUmschalten} title="Vollbild" aria-label="Vollbild">{vollbild ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}</button>
        </div>
      </div>

      {station && <div className="g3d-station" aria-live="polite">{station}</div>}

      <div className="g3d-kompass" aria-label="Nordpfeil">
        <div ref={kompass} className="g3d-nadel"><span>N</span></div>
      </div>

      <p className="g3d-hilfe">
        {modus === "rundum"
          ? "Ziehen dreht, rechte Maustaste oder zwei Finger verschieben, Mausrad oder Spreizen zoomt."
          : "Pfeiltasten oder W A S D zum Gehen, Ziehen zum Umsehen."}
      </p>

      {modus === "begehung" && (
        <div className="g3d-pad" aria-label="Gehen">
          <span />{steuerKnopf("arrowup", ArrowUp, "Vorwärts")}<span />
          {steuerKnopf("arrowleft", ArrowLeft, "Links drehen")}{steuerKnopf("arrowdown", ArrowDown, "Zurück")}{steuerKnopf("arrowright", ArrowRight, "Rechts drehen")}
        </div>
      )}
    </div>
  );
}

/** Ein Schritt der Begehung: drehen, gehen, an Wänden anhalten, Türen durchlassen. */
function gehen(w: { kamera: THREE.PerspectiveCamera; szene?: Szene; yaw: number; pitch: number; tasten: Set<string> }, dt: number) {
  const t = w.tasten;
  if (t.has("arrowleft")) w.yaw += 1.6 * dt;
  if (t.has("arrowright")) w.yaw -= 1.6 * dt;
  let vor = 0, seit = 0;
  if (t.has("w") || t.has("arrowup")) vor += 1;
  if (t.has("s") || t.has("arrowdown")) vor -= 1;
  if (t.has("a")) seit -= 1;
  if (t.has("d")) seit += 1;
  const richtung = new THREE.Vector3(-Math.sin(w.yaw), 0, -Math.cos(w.yaw));
  const rechts = new THREE.Vector3(Math.cos(w.yaw), 0, -Math.sin(w.yaw));
  const schritt = richtung.multiplyScalar(vor).add(rechts.multiplyScalar(seit));
  if (schritt.lengthSq() > 0 && w.szene) {
    schritt.normalize().multiplyScalar(SCHRITT * dt);
    const ziel = w.kamera.position.clone().add(schritt);
    if (frei(w.szene, ziel.x, ziel.z)) w.kamera.position.copy(ziel);
    else if (frei(w.szene, ziel.x, w.kamera.position.z)) w.kamera.position.x = ziel.x;
    else if (frei(w.szene, w.kamera.position.x, ziel.z)) w.kamera.position.z = ziel.z;
  }
  w.kamera.position.y = AUGENHOEHE;
  w.kamera.rotation.set(w.pitch, w.yaw, 0, "YXZ");
}

/** Steht man mit 25 cm Abstand frei von jeder Wand, außer in einer Tür? */
function frei(s: Szene, x: number, z: number): boolean {
  return s.hindernisse.every(({ wand, versatz, tueren }) => {
    const { abstand, position } = aufWand({ x: x - versatz.x, y: z - versatz.y }, wand);
    if (abstand >= wand.dicke / 2 + 0.25) return true;
    return tueren.some(([von, bis]) => position > von + 0.1 && position < bis - 0.1);
  });
}

interface Rundgang {
  stationen: Array<{ ziel: THREE.Vector3; kamera: THREE.Vector3; name: string }>;
  index: number;
  zeit: number;
  vonKamera: THREE.Vector3;
  vonZiel: THREE.Vector3;
}

const FLUG = 2.2; // Sekunden von Station zu Station
const HALT = 1.8; // Sekunden an jeder Station

/** Ein Bild des Rundgangs: weich zur nächsten Station fliegen, kurz halten, am Ende stehen bleiben. */
function rundgangSchritt(w: { kamera: THREE.PerspectiveCamera; steuerung: OrbitControls; rundgang?: Rundgang }, dt: number, melden: (name: string | null) => void) {
  const r = w.rundgang;
  if (!r) return;
  if (r.index < 0 || r.zeit >= FLUG + HALT) {
    if (r.index >= 0) { r.vonKamera = w.kamera.position.clone(); r.vonZiel = w.steuerung.target.clone(); }
    r.index += 1;
    r.zeit = 0;
    if (r.index >= r.stationen.length) {
      w.rundgang = undefined;
      w.steuerung.enabled = true;
      melden(null);
      return;
    }
    melden(r.stationen[r.index].name);
  }
  r.zeit += dt;
  const st = r.stationen[r.index];
  const t = Math.min(1, r.zeit / FLUG);
  const weich = t * t * (3 - 2 * t);
  w.kamera.position.lerpVectors(r.vonKamera, st.kamera, weich);
  w.steuerung.target.lerpVectors(r.vonZiel, st.ziel, weich);
  w.kamera.lookAt(w.steuerung.target);
}
