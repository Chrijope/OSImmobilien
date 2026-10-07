import React from "react";

/**
 * Cinematic, continuously animated SVG visuals for the "Marktlage" section.
 * Pure CSS animations, no external deps. Each visual is contextually tied to its metric.
 */

const STYLE = `
@keyframes ml-rise { 0%{transform:scaleY(.15);opacity:.6} 60%{transform:scaleY(1);opacity:1} 100%{transform:scaleY(1);opacity:1} }
@keyframes ml-fall { 0%{transform:scaleY(1);opacity:1} 60%{transform:scaleY(.25);opacity:.6} 100%{transform:scaleY(.25);opacity:.6} }
@keyframes ml-drift { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
@keyframes ml-pulse { 0%,100%{opacity:.35;transform:scale(1)} 50%{opacity:1;transform:scale(1.06)} }
@keyframes ml-dash  { to { stroke-dashoffset: 0 } }
@keyframes ml-sweep { 0%{transform:rotate(-70deg)} 50%{transform:rotate(20deg)} 100%{transform:rotate(-70deg)} }
@keyframes ml-fade  { 0%,100%{opacity:.25} 50%{opacity:1} }
@keyframes ml-flow  { to { stroke-dashoffset: -60 } }
@keyframes ml-pop   { 0%{transform:scale(0);opacity:0} 60%{transform:scale(1.15);opacity:1} 100%{transform:scale(1);opacity:.9} }
.ml-bar { transform-origin: bottom; animation: ml-rise 2.6s ease-in-out infinite alternate; }
.ml-bar-down { transform-origin: bottom; animation: ml-fall 2.6s ease-in-out infinite alternate; }
.ml-drift { animation: ml-drift 3.4s ease-in-out infinite; }
.ml-pulse { transform-origin: center; animation: ml-pulse 2.4s ease-in-out infinite; }
.ml-path  { stroke-dasharray: 220; stroke-dashoffset: 220; animation: ml-dash 3s ease-out infinite alternate; }
.ml-sweep { transform-origin: 50% 90%; animation: ml-sweep 4s ease-in-out infinite; }
.ml-fade  { animation: ml-fade 2.2s ease-in-out infinite; }
.ml-flow  { stroke-dasharray: 6 8; animation: ml-flow 2.4s linear infinite; }
.ml-pop   { transform-origin: center; animation: ml-pop 2.8s ease-out infinite; }
`;

export function MarktlageStyles() {
  return <style dangerouslySetInnerHTML={{ __html: STYLE }} />;
}

const box = "w-full h-28 md:h-32 mb-4 rounded-xl bg-gradient-to-br from-primary/5 to-primary/0 overflow-hidden";

/* +8,1 % Mietsteigerung — steigende Balken mit Aufwärtspfeil */
export const RisingRentVisual = () => (
  <div className={box}>
    <svg viewBox="0 0 200 100" className="w-full h-full">
      <g fill="hsl(var(--primary))">
        <rect x="20"  y="30" width="18" height="60" rx="3" className="ml-bar" style={{ animationDelay: "0s"    }} />
        <rect x="52"  y="30" width="18" height="60" rx="3" className="ml-bar" style={{ animationDelay: ".25s" }} />
        <rect x="84"  y="30" width="18" height="60" rx="3" className="ml-bar" style={{ animationDelay: ".5s"  }} />
        <rect x="116" y="30" width="18" height="60" rx="3" className="ml-bar" style={{ animationDelay: ".75s" }} />
        <rect x="148" y="30" width="18" height="60" rx="3" className="ml-bar" style={{ animationDelay: "1s"   }} />
      </g>
      <path d="M20 80 L60 65 L100 55 L140 40 L180 22" fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5" className="ml-path" />
      <path d="M170 22 L182 20 L180 32 Z" fill="hsl(var(--primary))" className="ml-drift" />
    </svg>
  </div>
);

/* -16,8 % Baugenehmigungen — fallende Balken mit rotem Abwärtspfeil */
export const PermitsDownVisual = () => (
  <div className={box}>
    <svg viewBox="0 0 200 100" className="w-full h-full">
      <g fill="hsl(var(--primary))" opacity="0.85">
        <rect x="20"  y="20" width="18" height="70" rx="3" className="ml-bar-down" style={{ animationDelay: "0s"   }} />
        <rect x="52"  y="20" width="18" height="70" rx="3" className="ml-bar-down" style={{ animationDelay: ".2s" }} />
        <rect x="84"  y="20" width="18" height="70" rx="3" className="ml-bar-down" style={{ animationDelay: ".4s" }} />
        <rect x="116" y="20" width="18" height="70" rx="3" className="ml-bar-down" style={{ animationDelay: ".6s" }} />
        <rect x="148" y="20" width="18" height="70" rx="3" className="ml-bar-down" style={{ animationDelay: ".8s" }} />
      </g>
      <path d="M20 25 L60 40 L100 55 L140 68 L180 82" fill="none" stroke="hsl(var(--destructive))" strokeWidth="2.5" className="ml-path" />
      <path d="M170 78 L184 82 L176 92 Z" fill="hsl(var(--destructive))" className="ml-drift" />
    </svg>
  </div>
);

/* ≈ 800.000 Fehlende Wohnungen — Grid aus Häusern, einige "fehlen" (blinken) */
export const MissingHomesVisual = () => {
  const houses = Array.from({ length: 32 });
  const missing = new Set([2, 7, 11, 15, 20, 24, 28, 30]);
  return (
    <div className={box}>
      <svg viewBox="0 0 200 100" className="w-full h-full">
        {houses.map((_, i) => {
          const col = i % 8;
          const row = Math.floor(i / 8);
          const x = 12 + col * 23;
          const y = 12 + row * 22;
          const isMissing = missing.has(i);
          return (
            <g key={i} transform={`translate(${x} ${y})`} className={isMissing ? "ml-fade" : ""} style={{ animationDelay: `${(i % 8) * 0.15}s` }}>
              <path
                d="M0 10 L8 2 L16 10 L16 18 L0 18 Z"
                fill={isMissing ? "none" : "hsl(var(--primary))"}
                stroke={isMissing ? "hsl(var(--destructive))" : "none"}
                strokeDasharray={isMissing ? "2 2" : ""}
                strokeWidth="1.2"
                opacity={isMissing ? 1 : 0.85}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};

/* +4,7 % Kaufpreise — Preisschild mit steigendem Pfad */
export const PricesUpVisual = () => (
  <div className={box}>
    <svg viewBox="0 0 200 100" className="w-full h-full">
      <path d="M10 80 Q60 60 100 50 T195 15" fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5" className="ml-path" />
      <g className="ml-drift">
        <rect x="120" y="30" width="60" height="34" rx="6" fill="hsl(var(--primary))" opacity="0.12" stroke="hsl(var(--primary))" strokeWidth="1.5" />
        <circle cx="132" cy="47" r="3" fill="hsl(var(--primary))" />
        <text x="145" y="52" fontSize="14" fontWeight="700" fill="hsl(var(--primary))" fontFamily="ui-sans-serif, system-ui">€ ↑</text>
      </g>
      <g fill="hsl(var(--primary))">
        <circle cx="10"  cy="80" r="2.5" className="ml-pulse" />
        <circle cx="60"  cy="63" r="2.5" className="ml-pulse" style={{ animationDelay: ".4s" }} />
        <circle cx="100" cy="50" r="2.5" className="ml-pulse" style={{ animationDelay: ".8s" }} />
      </g>
    </svg>
  </div>
);

/* 84,7 Mio. Einwohner — pulsierendes Punkte-Cluster (Bevölkerungs-Netz) */
export const PopulationVisual = () => {
  const dots = [
    [30, 40], [50, 25], [70, 55], [95, 30], [115, 60], [140, 25],
    [160, 50], [180, 35], [45, 70], [80, 78], [125, 80], [165, 78],
    [25, 60], [100, 15], [55, 45], [135, 45],
  ];
  return (
    <div className={box}>
      <svg viewBox="0 0 200 100" className="w-full h-full">
        <g stroke="hsl(var(--primary))" strokeWidth="0.6" opacity="0.35">
          {dots.slice(0, -1).map(([x1, y1], i) => {
            const [x2, y2] = dots[i + 1];
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="ml-fade" style={{ animationDelay: `${i * 0.12}s` }} />;
          })}
        </g>
        {dots.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="3" fill="hsl(var(--primary))" className="ml-pulse" style={{ animationDelay: `${(i % 6) * 0.25}s` }} />
        ))}
      </svg>
    </div>
  );
};

/* 3,45 % Bauzins — Tacho / Gauge */
export const InterestGaugeVisual = () => (
  <div className={box}>
    <svg viewBox="0 0 200 100" className="w-full h-full">
      <path d="M25 90 A 75 75 0 0 1 175 90" fill="none" stroke="hsl(var(--primary))" strokeOpacity="0.15" strokeWidth="10" strokeLinecap="round" />
      <path d="M25 90 A 75 75 0 0 1 120 22" fill="none" stroke="hsl(var(--primary))" strokeWidth="10" strokeLinecap="round" className="ml-path" style={{ strokeDasharray: 180 }} />
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = (Math.PI * i) / 5;
        const x1 = 100 - Math.cos(a) * 68;
        const y1 = 90 - Math.sin(a) * 68;
        const x2 = 100 - Math.cos(a) * 60;
        const y2 = 90 - Math.sin(a) * 60;
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="hsl(var(--primary))" strokeWidth="1.5" opacity="0.5" />;
      })}
      <g className="ml-sweep">
        <line x1="100" y1="90" x2="100" y2="30" stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="100" cy="90" r="5" fill="hsl(var(--primary))" />
      </g>
      <text x="100" y="80" textAnchor="middle" fontSize="11" fontWeight="700" fill="hsl(var(--primary))" fontFamily="ui-sans-serif, system-ui">3,45 %</text>
    </svg>
  </div>
);

export const MARKTLAGE_VISUALS = [
  RisingRentVisual,
  PermitsDownVisual,
  MissingHomesVisual,
  PricesUpVisual,
  PopulationVisual,
  InterestGaugeVisual,
];

/* =========================================================================
 * Weitere Visuals — für Abschnitt "Quellen & Studien" (Bestand)
 * Nutzen dieselben Keyframes/Klassen wie oben (MarktlageStyles laden!).
 * =======================================================================*/

/* BBSR — Bestand > Neubau: großes Bestandsgebäude vs. kleines Neubau-Kran-Symbol */
export const BestandVsNeubauVisual = () => (
  <div className={box}>
    <svg viewBox="0 0 200 100" className="w-full h-full">
      {/* Bestand (groß, links) */}
      <g className="ml-drift">
        <rect x="14" y="24" width="70" height="66" fill="hsl(var(--primary))" fillOpacity="0.18" stroke="hsl(var(--primary))" strokeOpacity="0.7" />
        <polygon points="14,24 49,8 84,24" fill="hsl(var(--primary))" fillOpacity="0.4" />
        {[0,1,2].map(r => [0,1,2].map(c => (
          <rect key={`${r}${c}`} x={22 + c*20} y={34 + r*18} width="12" height="12" fill="hsl(var(--primary))" fillOpacity={0.55} className="ml-fade" style={{ animationDelay: `${(r+c)*0.2}s` }} />
        )))}
      </g>
      {/* Neubau (klein, rechts, mit Kran) */}
      <g opacity="0.55">
        <rect x="130" y="60" width="34" height="30" fill="hsl(var(--primary))" fillOpacity="0.12" stroke="hsl(var(--primary))" strokeOpacity="0.5" strokeDasharray="2 2" />
        <line x1="170" y1="20" x2="170" y2="90" stroke="hsl(var(--primary))" strokeWidth="1.5" />
        <line x1="170" y1="20" x2="192" y2="20" stroke="hsl(var(--primary))" strokeWidth="1.5" />
        <line x1="185" y1="20" x2="185" y2="34" stroke="hsl(var(--primary))" strokeWidth="1" className="ml-fade" />
        <rect x="180" y="34" width="10" height="6" fill="hsl(var(--primary))" fillOpacity="0.5" className="ml-fade" />
      </g>
      {/* Vergleichs-Größer-Zeichen */}
      <text x="100" y="60" fontSize="18" fontWeight="700" fill="hsl(var(--primary))" fontFamily="ui-sans-serif, system-ui" className="ml-pulse">›</text>
    </svg>
  </div>
);

/* IW Köln — Sachwert / Inflationsschutz: Schild + steigende Wert-Linie über Inflations-Zickzack */
export const InflationsschutzVisual = () => (
  <div className={box}>
    <svg viewBox="0 0 200 100" className="w-full h-full">
      {/* Inflations-Zickzack (Hintergrund, gedämpft) */}
      <path d="M10 55 L30 62 L50 50 L70 66 L90 54 L110 70 L130 58 L150 74 L170 62 L190 78"
            fill="none" stroke="hsl(var(--destructive))" strokeWidth="1.2" strokeOpacity="0.55" strokeDasharray="3 3" className="ml-fade" />
      {/* Sachwert-Aufwärtslinie */}
      <path d="M10 78 Q60 60 100 46 T190 18" fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5" className="ml-path" />
      <path d="M180 20 L192 16 L190 28 Z" fill="hsl(var(--primary))" className="ml-drift" />
      {/* Schild (Sachwert-Symbol) */}
      <g transform="translate(20 14)" className="ml-pulse">
        <path d="M14 0 L28 6 L28 18 Q28 30 14 36 Q0 30 0 18 L0 6 Z" fill="hsl(var(--primary))" fillOpacity="0.15" stroke="hsl(var(--primary))" strokeWidth="1.5" />
        <path d="M8 18 L13 23 L21 13" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  </div>
);

/* KfW — Förderung: Münzstapel + Haus mit Blatt (energetisch) */
export const KfwFoerderungVisual = () => (
  <div className={box}>
    <svg viewBox="0 0 200 100" className="w-full h-full">
      {/* Haus mit Blatt */}
      <g transform="translate(24 22)" className="ml-drift">
        <rect x="0" y="26" width="66" height="52" fill="hsl(var(--primary))" fillOpacity="0.15" stroke="hsl(var(--primary))" strokeOpacity="0.55" />
        <polygon points="0,26 33,4 66,26" fill="hsl(var(--primary))" fillOpacity="0.4" />
        <rect x="28" y="48" width="14" height="30" fill="hsl(var(--primary))" fillOpacity="0.6" />
        {/* Blatt (Energie-Effizienz) */}
        <g transform="translate(46 12)" className="ml-pulse">
          <path d="M0 8 Q4 -2 14 0 Q12 10 2 12 Z" fill="#22c55e" opacity="0.85" />
          <path d="M2 12 Q6 8 12 4" fill="none" stroke="#065f46" strokeWidth="0.8" />
        </g>
      </g>
      {/* Münzstapel — animiert wachsend */}
      <g transform="translate(120 34)">
        {[0,1,2,3,4].map(i => (
          <g key={i} transform={`translate(0 ${52 - i*10})`} className="ml-pop" style={{ animationDelay: `${i*0.25}s` }}>
            <ellipse cx="26" cy="0" rx="26" ry="6" fill="hsl(var(--primary))" fillOpacity={0.35 + i*0.1} />
            <ellipse cx="26" cy="-2" rx="26" ry="6" fill="hsl(var(--primary))" fillOpacity={0.7} />
            <text x="26" y="1" textAnchor="middle" fontSize="7" fontWeight="700" fill="#fff" fontFamily="ui-sans-serif, system-ui">€</text>
          </g>
        ))}
      </g>
    </svg>
  </div>
);

/* dena — Sanierungsquote 1 %: dünner Ring mit 1%-Segment */
export const SanierungsquoteVisual = () => {
  const cx = 100, cy = 50, r = 34;
  const C = 2 * Math.PI * r;
  const seg = C * 0.01; // 1 %
  return (
    <div className={box}>
      <svg viewBox="0 0 200 100" className="w-full h-full">
        {/* Hintergrund-Ring */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="hsl(var(--primary))" strokeOpacity="0.15" strokeWidth="8" />
        {/* 1%-Segment (rot, klein) */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke="hsl(var(--destructive))"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${seg} ${C - seg}`}
          transform={`rotate(-90 ${cx} ${cy})`}
          className="ml-pulse"
        />
        {/* Zentrum-Text */}
        <text x={cx} y={cy - 2} textAnchor="middle" fontSize="16" fontWeight="700" fill="hsl(var(--primary))" fontFamily="ui-sans-serif, system-ui">1 %</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize="7" fill="hsl(var(--primary))" opacity="0.7" fontFamily="ui-monospace, monospace">SANIERUNGSQUOTE</text>
        {/* Werkzeug-Symbol (Schraubenschlüssel) */}
        <g transform="translate(160 22) rotate(35)" className="ml-drift">
          <path d="M0 4 Q-4 0 0 -4 L4 -4 L4 -1 L10 -1 L10 -7 L18 0 L10 7 L10 1 L4 1 L4 4 Z" fill="hsl(var(--primary))" fillOpacity="0.6" />
        </g>
      </svg>
    </div>
  );
};

/* Mapping in Reihenfolge des Quellen-Abschnitts (Bestand · 05) */
export const QUELLEN_BESTAND_VISUALS = [
  PermitsDownVisual,        // Destatis · Baugenehmigungen −16,8 %
  BestandVsNeubauVisual,    // BBSR · Bestand > Neubau
  MissingHomesVisual,       // Pestel · ≈ 800.000
  InflationsschutzVisual,   // IW Köln · Sachwert / Inflationsschutz
  KfwFoerderungVisual,      // KfW · Förderung
  SanierungsquoteVisual,    // dena · Sanierungsquote 1 %
];