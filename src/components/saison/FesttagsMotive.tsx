import { useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import type { Festtag, KartenTexte } from "@/lib/festtagskarten";

/**
 * Die Vorderseiten der Festtagskarten. `fertig` zeigt sofort den Endzustand
 * der Animation: für das PDF und bei „Bewegung reduzieren“.
 */
export interface MotivProps {
  f: Festtag;
  t: KartenTexte;
  en: boolean;
  fertig: boolean;
}

export const bewegtNicht = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Setzt nach `ms` einen Schalter, es sei denn, die Karte steht schon im Endzustand. */
function useNach(ms: number, fertig: boolean): boolean {
  const [an, setAn] = useState(false);
  useEffect(() => {
    if (fertig) return;
    const id = window.setTimeout(() => setAn(true), ms);
    return () => window.clearTimeout(id);
  }, [ms, fertig]);
  return fertig || an;
}

// ─── Leinwände: Schnee, Sterne, Feuerwerk, Konfetti ───────────────────────

type Art = "schnee" | "sterne" | "feuerwerk" | "konfetti";
const FARBEN_FEST = ["#F3DFA8", "#D8B46A", "#E8742C", "#F7F5EF", "#7fd6b0"];

function useLeinwand(art: Art, opt: { menge?: number; aktiv?: boolean; schuetteln?: MutableRefObject<number> } = {}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { menge = 120, aktiv = true, schuetteln } = opt;
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !aktiv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.max(1, cv.clientWidth * dpr);
    cv.height = Math.max(1, cv.clientHeight * dpr);
    const W = cv.width, H = cv.height;
    const zufall = Math.random;

    const flocken = Array.from({ length: menge }, () => ({ x: zufall(), y: zufall(), r: .6 + zufall() * 2.2, v: .0006 + zufall() * .0016, d: zufall() * 6 }));
    const sterne = Array.from({ length: 90 }, () => ({ x: zufall(), y: zufall() * .7, r: zufall() * 1.3 + .2, p: zufall() * 6 }));
    type Teil = { x: number; y: number; vx: number; vy: number; leben: number; farbe: string; w: number; dreh: number; vd: number };
    const teile: Teil[] = [];
    const raketen: Array<{ x: number; y: number; ziel: number; farbe: string }> = [];
    let naechste = 0;

    const knall = (x: number, y: number, farbe: string) => {
      for (let i = 0; i < 90; i++) {
        const w = (Math.PI * 2 * i) / 90, v = (.6 + zufall() * .9) * 4.2 * dpr;
        teile.push({ x, y, vx: Math.cos(w) * v, vy: Math.sin(w) * v, leben: 1, farbe: i % 5 === 0 ? "#fff8e1" : farbe, w: 2.4 * dpr, dreh: 0, vd: 0 });
      }
    };
    const konfetti = (anzahl: number) => {
      for (let i = 0; i < anzahl; i++) {
        teile.push({ x: W * (.15 + zufall() * .7), y: -zufall() * H * .5, vx: (zufall() - .5) * 2 * dpr, vy: (1 + zufall() * 2) * dpr, leben: 1, farbe: FARBEN_FEST[i % FARBEN_FEST.length], w: (4 + zufall() * 5) * dpr, dreh: zufall() * 6, vd: (zufall() - .5) * .3 });
      }
    };
    if (art === "konfetti") konfetti(menge);

    const male = (zeit: number) => {
      if (art === "feuerwerk") {
        // Nicht ganz löschen, sondern ausblenden: so ziehen die Funken Leuchtspuren.
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = "rgba(0,0,0,.22)";
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = "source-over";
      } else ctx.clearRect(0, 0, W, H);
      if (art === "schnee") {
        const s = schuetteln ? (schuetteln.current *= .985) : 0;
        for (const fl of flocken) {
          fl.y += fl.v * (1 + s * 6);
          fl.x += Math.sin(zeit / 900 + fl.d) * .0006 * (1 + s * 8);
          if (fl.y > 1.02) { fl.y = -.02; fl.x = zufall(); }
          ctx.beginPath();
          ctx.fillStyle = `rgba(255,255,255,${.5 + fl.r / 5})`;
          ctx.arc(fl.x * W, fl.y * H, fl.r * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (art === "sterne") {
        for (const a of sterne) {
          ctx.fillStyle = `rgba(243,223,168,${.25 + .55 * (.5 + .5 * Math.sin(zeit / 700 + a.p))})`;
          ctx.beginPath(); ctx.arc(a.x * W, a.y * H, a.r * dpr, 0, 7); ctx.fill();
        }
      } else if (art === "feuerwerk") {
        if (zeit > naechste) {
          naechste = zeit + 500 + zufall() * 700;
          raketen.push({ x: W * (.12 + zufall() * .76), y: H, ziel: H * (.12 + zufall() * .3), farbe: FARBEN_FEST[Math.floor(zufall() * FARBEN_FEST.length)] });
        }
        for (let i = raketen.length - 1; i >= 0; i--) {
          const r = raketen[i];
          r.y -= 9 * dpr;
          ctx.fillStyle = "rgba(255,240,200,.9)";
          ctx.fillRect(r.x, r.y, 2 * dpr, 7 * dpr);
          if (r.y <= r.ziel) { knall(r.x, r.y, r.farbe); raketen.splice(i, 1); }
        }
      } else if (zeit % 1600 < 20) {
        konfetti(12);
      }
      ctx.globalCompositeOperation = art === "feuerwerk" ? "lighter" : "source-over";
      for (let i = teile.length - 1; i >= 0; i--) {
        const p = teile[i];
        p.x += p.vx; p.y += p.vy;
        if (art === "feuerwerk") { p.vx *= .975; p.vy = p.vy * .975 + .045 * dpr; p.leben -= .012; }
        else { p.vx *= .99; p.dreh += p.vd; p.x += Math.sin(zeit / 400 + p.w) * .4 * dpr; if (p.y > H + 20) p.leben = 0; }
        if (p.leben <= 0) { teile.splice(i, 1); continue; }
        ctx.globalAlpha = Math.max(0, Math.min(1, p.leben));
        ctx.fillStyle = p.farbe;
        if (art === "feuerwerk") { ctx.shadowColor = p.farbe; ctx.shadowBlur = 10 * dpr; ctx.beginPath(); ctx.arc(p.x, p.y, p.w * (.5 + p.leben * .5), 0, 7); ctx.fill(); ctx.shadowBlur = 0; }
        else { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.dreh); ctx.fillRect(-p.w / 2, -p.w / 4, p.w, p.w / 2); ctx.restore(); }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    };

    if (bewegtNicht()) {
      // Ein ruhiges Standbild: beim Feuerwerk zwei Bouquets, beim Konfetti eine Momentaufnahme.
      if (art === "feuerwerk") { knall(W * .3, H * .25, "#F3DFA8"); knall(W * .7, H * .3, "#E8742C"); for (let i = 0; i < 25; i++) male(i); }
      else if (art === "konfetti") { for (let i = 0; i < 90; i++) male(i * 16); }
      else male(0);
      return;
    }
    let lauf = true;
    const schleife = (zeit: number) => { if (!lauf) return; male(zeit); requestAnimationFrame(schleife); };
    requestAnimationFrame(schleife);
    return () => { lauf = false; };
  }, [art, menge, aktiv, schuetteln]);
  return ref;
}

const Leinwand = ({ art, menge, aktiv, schuetteln, className = "voll" }: { art: Art; menge?: number; aktiv?: boolean; schuetteln?: MutableRefObject<number>; className?: string }) => (
  <canvas ref={useLeinwand(art, { menge, aktiv, schuetteln })} className={className} aria-hidden="true" />
);

const Textspalte = ({ t, titel }: { t: KartenTexte; titel: ReactNode }) => (
  <div className="textspalte">
    <div className="augenbraue">{t.augenbraue}</div>
    <h1 className="folie">{titel}</h1>
    <p className="kurz">{t.kurz}</p>
  </div>
);

// ─── Weihnachten ─────────────────────────────────────────────────────────

function Schneekugel({ f, t }: MotivProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const schuetteln = useRef(0);
  return (
    <div
      className="ftk-seite gruen"
      onPointerMove={(e) => {
        const b = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - b.left) / b.width - .5, y = (e.clientY - b.top) / b.height - .5;
        if (wrap.current) wrap.current.style.transform = `rotate(${x * 8}deg) translate(${x * 10}px, ${y * 8}px)`;
        schuetteln.current = Math.min(1, schuetteln.current + .04);
      }}
    >
      <Leinwand art="sterne" />
      <div className="kugelwrap" ref={wrap}>
        <div className="kugel">
          <svg viewBox="0 0 400 448" aria-hidden="true">
            <defs>
              <radialGradient id="ftk-glas" cx="35%" cy="30%" r="75%"><stop offset="0" stopColor="#ffffff" stopOpacity=".22" /><stop offset=".55" stopColor="#9fd8c0" stopOpacity=".06" /><stop offset="1" stopColor="#0a1f18" stopOpacity=".35" /></radialGradient>
              <linearGradient id="ftk-sockel" x1="0" x2="1"><stop offset="0" stopColor="#7a5a24" /><stop offset=".45" stopColor="#F3DFA8" /><stop offset=".6" stopColor="#c9a24f" /><stop offset="1" stopColor="#6b4d1c" /></linearGradient>
              <clipPath id="ftk-innen"><circle cx="200" cy="176" r="168" /></clipPath>
              <filter id="ftk-warm"><feGaussianBlur stdDeviation="3" /></filter>
            </defs>
            <g clipPath="url(#ftk-innen)">
              <rect width="400" height="360" fill="#163f32" />
              <ellipse cx="200" cy="300" rx="220" ry="60" fill="#e9efe9" />
              <path d="M60 300 l26 -70 l26 70z M80 300 l18 -50 l18 50z" fill="#0d2a21" />
              <path d="M300 300 l30 -84 l30 84z M282 300 l18 -48 l18 48z" fill="#0d2a21" />
              <rect x="140" y="178" width="120" height="108" fill="#F7F5EF" />
              <path d="M128 182 L200 122 L272 182 Z" fill="#12362A" />
              <path d="M128 182 L200 122 L272 182" fill="none" stroke="#D8B46A" strokeWidth="3" />
              <path d="M150 168 L200 128 L250 168" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" opacity=".9" />
              <g fill="#FFB65C"><rect x="156" y="196" width="22" height="24" rx="2" /><rect x="222" y="196" width="22" height="24" rx="2" /><rect x="156" y="236" width="22" height="24" rx="2" /></g>
              <g fill="#FFB65C" filter="url(#ftk-warm)" opacity=".7"><rect x="156" y="196" width="22" height="24" /><rect x="222" y="196" width="22" height="24" /><rect x="156" y="236" width="22" height="24" /></g>
              <rect x="218" y="236" width="30" height="50" rx="15" fill="#E8742C" />
              <circle cx="241" cy="262" r="2.5" fill="#F3DFA8" />
              <circle cx="233" cy="230" r="9" fill="none" stroke="#2f6b4f" strokeWidth="4" />
              <text x="200" y="166" textAnchor="middle" fontFamily="FTK Playfair" fontSize="15" fill="#D8B46A" fontStyle="italic">OS</text>
            </g>
            <circle cx="200" cy="176" r="168" fill="url(#ftk-glas)" stroke="rgba(243,223,168,.55)" strokeWidth="2" />
            <path d="M98 88 A130 130 0 0 1 182 34" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="7" strokeLinecap="round" />
            <path d="M84 118 A130 130 0 0 1 90 104" fill="none" stroke="#fff" strokeOpacity=".4" strokeWidth="5" strokeLinecap="round" />
            <path d="M92 330 Q200 360 308 330 L326 420 Q200 448 74 420 Z" fill="url(#ftk-sockel)" />
            <text x="200" y="398" textAnchor="middle" fontFamily="FTK Outfit" fontSize="11" letterSpacing="4" fill="#3d2c0e">OS REAL ESTATE · {f.jahr}</text>
          </svg>
          <Leinwand art="schnee" menge={120} schuetteln={schuetteln} className="" />
        </div>
      </div>
      <Textspalte t={t} titel={<>Merry<br />Christmas</>} />
    </div>
  );
}

/** 22 Fenster am Adventshaus, die nacheinander angehen. */
const FENSTER = Array.from({ length: 24 }, (_, i) => ({ reihe: Math.floor(i / 6), sp: i % 6 }))
  .filter(({ reihe, sp }) => !(reihe === 3 && (sp === 2 || sp === 3)));

function Adventshaus({ t, en, fertig }: MotivProps) {
  const reihenfolge = useMemo(() => FENSTER.map((_, i) => i).sort(() => Math.random() - .5), []);
  const [an, setAn] = useState(0);
  useEffect(() => {
    if (fertig) return;
    const ids = FENSTER.map((_, i) => window.setTimeout(() => setAn(i + 1), 700 + i * 140));
    return () => ids.forEach(clearTimeout);
  }, [fertig]);
  const offen = useNach(700 + FENSTER.length * 140 + 300, fertig);
  const zahl = fertig || offen ? 24 : an;
  const leuchtet = new Set(reihenfolge.slice(0, fertig ? FENSTER.length : an));
  return (
    <div className={`ftk-seite nachtblau${offen ? " offen" : ""}`}>
      <Leinwand art="sterne" />
      <svg className="stadt" viewBox="0 0 880 560" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
        <defs>
          <filter id="ftk-leuchten" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <radialGradient id="ftk-tuerlicht"><stop offset="0" stopColor="#FFD58A" /><stop offset="1" stopColor="#E8742C" stopOpacity="0" /></radialGradient>
        </defs>
        <path d="M610 44 a40 40 0 1 0 38 58 a32 32 0 1 1 -38 -58z" fill="#F7F0D6" filter="url(#ftk-leuchten)" />
        <g fill="#0c241d"><rect x="0" y="300" width="120" height="260" /><rect x="110" y="250" width="90" height="310" /><rect x="690" y="270" width="110" height="290" /><rect x="790" y="320" width="90" height="240" /></g>
        <g transform="translate(296 222) scale(.78)">
          <path d="M-20 60 L190 -40 L400 60 Z" fill="#12362A" />
          <path d="M-20 60 L190 -40 L400 60" fill="none" stroke="#F7F5EF" strokeWidth="10" strokeLinejoin="round" />
          <rect x="0" y="58" width="380" height="340" fill="#E9E2D0" />
          {FENSTER.map(({ reihe, sp }, i) => (
            <rect key={i} className={`fenster${leuchtet.has(i) ? " an" : ""}`} x={24 + sp * 58} y={82 + reihe * 64} width="38" height="44" rx="3" />
          ))}
          <rect x="162" y="300" width="56" height="98" fill="url(#ftk-tuerlicht)" />
          <rect x="162" y="300" width="56" height="98" fill="#FFD58A" opacity=".9" />
          <rect className="tuer" x="162" y="300" width="56" height="98" fill="#E8742C" />
          <text x="190" y="356" textAnchor="middle" fontFamily="FTK Playfair" fontSize="24" fontStyle="italic" fill="#F7F5EF" className="tuer">24</text>
          <circle cx="190" cy="288" r="13" fill="none" stroke="#2f6b4f" strokeWidth="6" /><circle cx="190" cy="276" r="3" fill="#E8742C" />
        </g>
        <path d="M0 540 Q220 505 440 530 T880 520 L880 560 L0 560Z" fill="#F7F5EF" />
      </svg>
      {!fertig && (
        <svg className="schlitten" viewBox="0 0 300 80" aria-hidden="true">
          <g fill="#081a14"><path d="M10 50 q8-14 22-12 l10-12 3 3-6 10 q10 2 14 10 l-34 6z" /><path d="M62 52 q8-14 22-12 l10-12 3 3-6 10 q10 2 14 10 l-34 6z" />
            <path d="M130 40 h60 q10 0 12 10 l4 14 h-80z" /><path d="M120 70 h96" stroke="#081a14" strokeWidth="3" /></g>
          <path d="M40 46 L130 50" stroke="#D8B46A" strokeWidth="1" />
          <rect x="200" y="14" width="92" height="26" rx="3" fill="#F7F5EF" /><text x="246" y="32" textAnchor="middle" fontFamily="FTK Outfit" fontSize="12" fill="#12362A">{en ? "LET" : "VERMIETET"}</text>
          <path d="M200 27 L188 44" stroke="#F7F5EF" strokeWidth="1.5" />
        </svg>
      )}
      <div className="titel-links">
        <div className="augenbraue">{t.augenbraue}</div>
        <h1 className="folie">{en ? <>Merry<br /><em>Christmas</em></> : <>Frohe<br /><em>Weihnachten</em></>}</h1>
      </div>
      <div className="zaehler"><b className="folie">{zahl}</b><span>{en ? "windows lit" : "Fenster leuchten"}</span></div>
      <Leinwand art="schnee" menge={140} />
    </div>
  );
}

function Expose({ t, fertig, titel, ort, zeilen, preis, preisWert, marke, foto, fotoKlasse }: MotivProps & {
  titel: string; ort: string; zeilen: Array<[string, string]>; preis: string; preisWert: string; marke: string; foto: ReactNode; fotoKlasse?: string;
}) {
  const stempel = useNach(1900, false);
  return (
    <div className="ftk-seite expose">
      <div className={`foto${fotoKlasse ? ` ${fotoKlasse}` : ""}`}>
        {foto}
        <div className="marke">{marke}</div>
      </div>
      <div className="daten">
        <div className="augenbraue">{t.augenbraue}</div>
        <h1>{titel}</h1>
        <div className="ort">{ort}</div>
        <dl>{zeilen.map(([dt, dd]) => [<dt key={`t${dt}`}>{dt}</dt>, <dd key={`d${dt}`}>{dd}</dd>])}</dl>
        <div className="preis"><span>{preis}</span><b>{preisWert}</b></div>
        <div className={`stempel${fertig ? " fest" : stempel ? " da" : ""}`}>{t.stempel}</div>
      </div>
    </div>
  );
}

function NordpolExpose(p: MotivProps) {
  const { en } = p;
  return (
    <Expose
      {...p}
      titel={en ? "North Pole 1" : "Nordpol 1"}
      ort={en ? "Detached house with workshop, Arctic Circle" : "Einfamilienhaus mit Werkstatt, 99999 Am Polarkreis"}
      zeilen={en
        ? [["Location", "Prime, snow all year"], ["Energy rating", "Reindeer A+"], ["Features", "Fireplace, cookie kitchen"], ["Parking", "9 (reindeer)"], ["Available", "from 24 Dec"], ["Rental yield", "priceless"]]
        : [["Lage", "1A, ganzjährig Schnee"], ["Energieklasse", "Rentier A+"], ["Ausstattung", "Kamin, Plätzchenküche"], ["Stellplätze", "9 (Rentiere)"], ["Bezugsfrei", "ab 24.12."], ["Mietrendite", "unbezahlbar"]]}
      preis={en ? "Price" : "Kaufpreis"}
      preisWert={en ? "one smile" : "ein Lächeln"}
      marke={en ? "Property photo · Northern lights included" : "Objektfoto · Polarlicht inklusive"}
      foto={<>
        <div className="polar"><i /><i /><i /></div>
        <svg viewBox="0 0 480 560" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
          <path d="M0 420 L90 330 L170 400 L260 300 L360 390 L480 320 L480 560 L0 560Z" fill="#0d2621" />
          <path d="M0 470 Q240 430 480 460 L480 560 L0 560Z" fill="#E9EFEA" />
          <g transform="translate(160 360)">
            <path d="M-14 50 L80 -12 L174 50Z" fill="#12362A" /><path d="M-14 50 L80 -12 L174 50" fill="none" stroke="#F7F5EF" strokeWidth="8" strokeLinejoin="round" />
            <rect x="0" y="48" width="160" height="92" fill="#6b3f22" />
            <g fill="#FFB65C"><rect x="18" y="66" width="30" height="26" /><rect x="112" y="66" width="30" height="26" /></g>
            <rect x="66" y="78" width="28" height="62" fill="#E8742C" />
            <rect x="120" y="-6" width="16" height="36" fill="#4a2c18" />
          </g>
          <g fill="#081a14"><path d="M40 470 l22-70 22 70z" /><path d="M400 462 l26-84 26 84z" /><path d="M370 470 l16-48 16 48z" /></g>
        </svg>
        <Leinwand art="schnee" menge={140} />
      </>}
    />
  );
}

// ─── Silvester ───────────────────────────────────────────────────────────

/** Fenster der Skyline, je Haus [x, y]. Gehen beim Feuerwerk nach und nach an. */
const SKYLINE_FENSTER: Array<[number, number]> = [
  [40, 120], [70, 120], [40, 160], [70, 160], [150, 90], [180, 90], [150, 130], [180, 130], [150, 170],
  [300, 140], [330, 140], [420, 100], [450, 100], [420, 140], [450, 140], [560, 130], [590, 130], [560, 170],
  [690, 95], [720, 95], [690, 135], [720, 135], [800, 140], [830, 140],
];

function Silvester({ f, t, en, fertig }: MotivProps) {
  const alt = String(f.jahr), neu = String(f.jahr + 1);
  const [zaehler, setZaehler] = useState<number | null>(null);
  useEffect(() => {
    if (fertig) return;
    const ids = [3, 2, 1].map((n, i) => window.setTimeout(() => setZaehler(n), 900 + i * 900));
    ids.push(window.setTimeout(() => setZaehler(null), 900 + 3 * 900));
    return () => ids.forEach(clearTimeout);
  }, [fertig]);
  const um = useNach(900 + 3 * 900, fertig);
  const fenster = useMemo(() => SKYLINE_FENSTER.map(() => Math.random() > .45), []);
  return (
    <div className="ftk-seite silvester">
      <Leinwand art="sterne" />
      <Leinwand art="feuerwerk" aktiv={um} />
      <div className="jahr" aria-label={neu}>
        {neu.split("").map((z, i) => (
          <span key={i} className={`ziffer${um && z !== alt[i] ? " um" : ""}`}>
            <span><i className="folie">{alt[i]}</i><i className="folie">{z}</i></span>
          </span>
        ))}
      </div>
      {zaehler !== null && <div className="countdown"><b key={zaehler}>{zaehler}</b></div>}
      <svg className="skyline" viewBox="0 0 880 240" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
        <g fill="#12362A">
          <path d="M0 240 V100 L60 60 L120 100 V240Z" /><rect x="130" y="60" width="80" height="180" /><path d="M210 240 V120 L250 90 L290 120 V240Z" />
          <rect x="280" y="110" width="90" height="130" /><path d="M390 240 V80 L440 40 L490 80 V240Z" /><rect x="500" y="120" width="40" height="120" />
          <rect x="540" y="100" width="80" height="140" /><path d="M630 240 V140 L655 120 L680 140 V240Z" /><path d="M670 240 V70 L715 35 L760 70 V240Z" />
          <rect x="770" y="110" width="110" height="130" />
        </g>
        {SKYLINE_FENSTER.map(([x, y], i) => (
          <rect key={i} className={`fenster${fertig || (um && fenster[i]) || i % 4 === 0 ? " an" : ""}`} x={x} y={y} width="16" height="20" rx="2" />
        ))}
        <g transform="translate(440 116) scale(1.5)"><g className="schild">
          <path d="M-46 0 L-30 -24 M46 0 L30 -24" stroke="#D8B46A" strokeWidth="1.5" />
          <rect x="-58" y="0" width="116" height="34" rx="4" fill="#F7F5EF" />
          <text x="0" y="14" textAnchor="middle" fontFamily="FTK Outfit" fontSize="9" letterSpacing="1.5" fill="#E8742C">{en ? "MOVE-IN READY" : "BEZUGSFERTIG"}</text>
          <text x="0" y="27" textAnchor="middle" fontFamily="FTK Playfair" fontStyle="italic" fontSize="12" fill="#12362A">{en ? `1 Jan ${neu}` : `ab 01.01.${neu}`}</text>
        </g></g>
      </svg>
      <div className="unten">
        <div>
          <div className="augenbraue">{t.augenbraue}</div>
          <h1 className="folie">{en ? <>Happy<br />New Year</> : <>Prosit<br />Neujahr</>}</h1>
        </div>
        <p className="kurz" style={{ maxWidth: "26ch", textAlign: "right" }}>{t.kurz}</p>
      </div>
    </div>
  );
}

// ─── Geburtstag ──────────────────────────────────────────────────────────

const KERZEN = [150, 175, 200, 225, 250];

function Torte({ t, en, fertig }: MotivProps) {
  const [an, setAn] = useState(0);
  useEffect(() => {
    if (fertig) return;
    const ids = KERZEN.map((_, i) => window.setTimeout(() => setAn(i + 1), 800 + i * 380));
    return () => ids.forEach(clearTimeout);
  }, [fertig]);
  const konfetti = useNach(800 + KERZEN.length * 380 + 200, fertig);
  const fenster = (x0: number, y: number, n: number) =>
    Array.from({ length: n }, (_, i) => <rect key={`${y}-${i}`} x={x0 + i * 44} y={y} width="22" height="26" rx="2" fill="#FFB65C" />);
  return (
    <div className="ftk-seite gruen">
      <Leinwand art="sterne" />
      <svg className="torte" viewBox="0 0 400 520" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
        <ellipse cx="200" cy="500" rx="190" ry="16" fill="url(#ftk-teller)" />
        <defs><linearGradient id="ftk-teller" x1="0" x2="1"><stop offset="0" stopColor="#7a5a24" /><stop offset=".45" stopColor="#F3DFA8" /><stop offset="1" stopColor="#6b4d1c" /></linearGradient></defs>
        {/* Drei Etagen wie ein Haus, oben das Dach mit den Kerzen. */}
        <rect x="40" y="380" width="320" height="116" rx="6" fill="#F7F5EF" />
        {fenster(62, 410, 7)}
        <rect x="184" y="440" width="32" height="56" rx="16" fill="#E8742C" />
        <path d="M40 386 h320 v10 q-20 18 -40 0 q-20 18 -40 0 q-20 18 -40 0 q-20 18 -40 0 q-20 18 -40 0 q-20 18 -40 0 q-20 18 -40 0 q-20 18 -40 0z" fill="#12362A" />
        <rect x="80" y="286" width="240" height="96" rx="6" fill="#efe6d2" />
        {fenster(104, 318, 5)}
        <path d="M80 292 h240 v10 q-20 16 -40 0 q-20 16 -40 0 q-20 16 -40 0 q-20 16 -40 0 q-20 16 -40 0 q-20 16 -40 0z" fill="#E8742C" />
        <rect x="120" y="206" width="160" height="82" rx="6" fill="#F7F5EF" />
        {fenster(146, 236, 3)}
        <path d="M120 212 h160 v10 q-20 16 -40 0 q-20 16 -40 0 q-20 16 -40 0 q-20 16 -40 0z" fill="#12362A" />
        <text x="200" y="278" textAnchor="middle" fontFamily="FTK Playfair" fontStyle="italic" fontSize="16" fill="#D8B46A">OS</text>
        {KERZEN.map((x, i) => (
          <g key={x}>
            <rect x={x - 5} y="150" width="10" height="58" rx="3" fill={i % 2 ? "#D8B46A" : "#F7F5EF"} />
            <path className={`flamme${fertig || an > i ? " an" : ""}`} d={`M${x} 124 q9 14 0 24 q-9 -10 0 -24z`} fill="#FFB65C" />
          </g>
        ))}
      </svg>
      <Leinwand art="konfetti" menge={160} aktiv={konfetti} />
      <Textspalte t={t} titel={en ? <>Happy<br />Birthday</> : <>Happy<br />Birthday</>} />
    </div>
  );
}

function Geschenk({ t, en, fertig }: MotivProps) {
  const auf = useNach(1300, fertig);
  return (
    <div className={`ftk-seite nachtblau${auf ? " auf" : ""}`}>
      <Leinwand art="sterne" />
      <svg className="geschenk" viewBox="0 0 400 520" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
        <defs><linearGradient id="ftk-gold" x1="0" x2="1"><stop offset="0" stopColor="#9c7a3a" /><stop offset=".5" stopColor="#F3DFA8" /><stop offset="1" stopColor="#b8913f" /></linearGradient></defs>
        <g className="schluessel">
          <circle cx="200" cy="150" r="34" fill="none" stroke="url(#ftk-gold)" strokeWidth="14" />
          <rect x="193" y="182" width="14" height="150" fill="url(#ftk-gold)" />
          <rect x="207" y="290" width="26" height="12" fill="url(#ftk-gold)" /><rect x="207" y="312" width="18" height="12" fill="url(#ftk-gold)" />
          <path d="M226 150 Q280 150 292 186" fill="none" stroke="#F7F5EF" strokeWidth="1.5" />
          <g transform="translate(262 186) rotate(8)">
            <rect width="120" height="54" rx="6" fill="#F7F5EF" />
            <circle cx="12" cy="27" r="4" fill="#12362A" />
            <text x="66" y="23" textAnchor="middle" fontFamily="FTK Outfit" fontSize="9" letterSpacing="1.2" fill="#E8742C">{en ? "NEW YEAR OF LIFE" : "NEUES LEBENSJAHR"}</text>
            <text x="66" y="41" textAnchor="middle" fontFamily="FTK Playfair" fontStyle="italic" fontSize="13" fill="#12362A">{en ? "move-in ready" : "bezugsfertig"}</text>
          </g>
        </g>
        <rect x="70" y="330" width="260" height="180" rx="6" fill="#E8742C" />
        <rect x="186" y="330" width="28" height="180" fill="url(#ftk-gold)" />
        <g className="deckel">
          <rect x="56" y="296" width="288" height="44" rx="6" fill="#d0621f" />
          <rect x="186" y="296" width="28" height="44" fill="url(#ftk-gold)" />
          <path d="M200 296 q-50 -58 -70 -20 q-8 22 70 20z M200 296 q50 -58 70 -20 q8 22 -70 20z" fill="url(#ftk-gold)" />
        </g>
      </svg>
      <Leinwand art="konfetti" menge={160} aktiv={auf} />
      <Textspalte t={t} titel={en ? <>Happy<br /><em>Birthday</em></> : <>Alles<br /><em>Gute</em></>} />
    </div>
  );
}

function LebensjahrExpose(p: MotivProps) {
  const { en } = p;
  return (
    <Expose
      {...p}
      fotoKlasse="abend"
      titel={en ? "A brand-new year" : "Ein neues Lebensjahr"}
      ort={en ? "First occupancy from today, prime location" : "Erstbezug ab heute, beste Lage: mittendrin"}
      zeilen={en
        ? [["Condition", "as good as new"], ["Features", "cake, candles, confetti"], ["Location", "the best company"], ["Energy rating", "full of energy A+"], ["Available", "from today"], ["Yield", "priceless"]]
        : [["Zustand", "neuwertig"], ["Ausstattung", "Torte, Kerzen, Konfetti"], ["Lage", "beste Gesellschaft"], ["Energieklasse", "voller Energie A+"], ["Bezugsfrei", "ab heute"], ["Rendite", "unbezahlbar"]]}
      preis={en ? "Price" : "Kaufpreis"}
      preisWert={en ? "it's a gift" : "geschenkt"}
      marke={en ? "Property photo · balloons included" : "Objektfoto · Ballons inklusive"}
      foto={<>
        <svg viewBox="0 0 480 560" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
          <circle cx="70" cy="300" r="40" fill="#ffd9a0" opacity=".45" />
          <path d="M0 470 Q240 430 480 460 L480 560 L0 560Z" fill="#2f5a45" />
          <g transform="translate(160 330)">
            <path d="M-14 50 L80 -12 L174 50Z" fill="#12362A" /><path d="M-14 50 L80 -12 L174 50" fill="none" stroke="#F7F5EF" strokeWidth="6" strokeLinejoin="round" />
            <rect x="0" y="48" width="160" height="110" fill="#F7F5EF" />
            <g fill="#FFB65C"><rect x="18" y="70" width="30" height="28" /><rect x="112" y="70" width="30" height="28" /></g>
            <rect x="66" y="96" width="28" height="62" fill="#E8742C" />
            <path d="M80 -12 C70 -60 40 -90 30 -150 M80 -12 C80 -70 92 -110 86 -180 M80 -12 C96 -60 130 -90 140 -140" fill="none" stroke="#F7F5EF" strokeWidth="1.2" opacity=".8" />
            <ellipse className="ballon" cx="30" cy="-176" rx="24" ry="30" fill="#E8742C" />
            <ellipse className="ballon" cx="86" cy="-208" rx="26" ry="32" fill="#D8B46A" />
            <ellipse className="ballon" cx="140" cy="-166" rx="22" ry="28" fill="#7fd6b0" />
          </g>
        </svg>
        <Leinwand art="konfetti" menge={120} />
      </>}
    />
  );
}

export function Vorderseite(p: MotivProps) {
  const { f } = p;
  if (f.anlass === "silvester") return <Silvester {...p} />;
  if (f.anlass === "weihnachten") return f.motiv === 1 ? <Schneekugel {...p} /> : f.motiv === 2 ? <Adventshaus {...p} /> : <NordpolExpose {...p} />;
  return f.motiv === 1 ? <Torte {...p} /> : f.motiv === 2 ? <Geschenk {...p} /> : <LebensjahrExpose {...p} />;
}
