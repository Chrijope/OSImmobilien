import React from "react";

/**
 * Cinematic browser-window-style illustrations for the 6-step Beratungsprozess.
 * Pure inline SVG + CSS keyframes. Each visual is contextually tied to the step.
 */

const STYLE = `
@keyframes pv-blink { 0%,45%{opacity:1} 50%,95%{opacity:0} 100%{opacity:1} }
@keyframes pv-wave  { 0%,100%{transform:scaleY(.4)} 50%{transform:scaleY(1)} }
@keyframes pv-grow  { 0%{transform:scaleY(.15)} 60%,100%{transform:scaleY(1)} }
@keyframes pv-slide { 0%{transform:translateX(-8px);opacity:.4} 100%{transform:translateX(0);opacity:1} }
@keyframes pv-check { to { stroke-dashoffset: 0 } }
@keyframes pv-sign  { to { stroke-dashoffset: 0 } }
@keyframes pv-pen   { 0%{transform:translate(0,0) rotate(-25deg)} 100%{transform:translate(58px,4px) rotate(-25deg)} }
@keyframes pv-stamp { 0%,70%{transform:translateY(-14px) scale(1.05);opacity:0} 78%{transform:translateY(0) scale(1);opacity:1} 90%,100%{transform:translateY(0) scale(1);opacity:1} }
@keyframes pv-count { 0%{opacity:.4} 50%{opacity:1} 100%{opacity:.4} }
@keyframes pv-pulse { 0%,100%{transform:scale(1);opacity:.9} 50%{transform:scale(1.08);opacity:1} }
@keyframes pv-key   { 0%{transform:translateX(-40px);opacity:0} 40%{opacity:1} 100%{transform:translateX(0);opacity:1} }
@keyframes pv-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-3px)} }
@keyframes pv-fade  { 0%,100%{opacity:.3} 50%{opacity:1} }

.pv-blink { animation: pv-blink 1.4s steps(2) infinite; }
.pv-wave  { transform-origin: center; animation: pv-wave 1.1s ease-in-out infinite; }
.pv-grow  { transform-origin: bottom; animation: pv-grow 2.4s ease-in-out infinite alternate; }
.pv-slide { animation: pv-slide 2.2s ease-out infinite alternate; }
.pv-check { stroke-dasharray: 30; stroke-dashoffset: 30; animation: pv-check 1.6s ease-in-out infinite alternate; }
.pv-sign  { stroke-dasharray: 160; stroke-dashoffset: 160; animation: pv-sign 3s ease-in-out infinite alternate; }
.pv-pen   { animation: pv-pen 3s ease-in-out infinite alternate; }
.pv-stamp { transform-origin: center; animation: pv-stamp 3s ease-out infinite; }
.pv-count { animation: pv-count 1.6s ease-in-out infinite; }
.pv-pulse { transform-origin: center; animation: pv-pulse 2s ease-in-out infinite; }
.pv-key   { animation: pv-key 3s ease-in-out infinite alternate; }
.pv-float { animation: pv-float 3s ease-in-out infinite; }
.pv-fade  { animation: pv-fade 2s ease-in-out infinite; }
`;

export function ProzessStyles() {
  return <style dangerouslySetInnerHTML={{ __html: STYLE }} />;
}

/** Reusable browser-window frame with URL bar. */
function Frame({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <div className="w-full rounded-lg border border-primary/25 bg-background/70 overflow-hidden shadow-[0_10px_30px_-18px_hsl(var(--primary)/0.35)] mb-5">
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-primary/15 bg-muted/40">
        <span className="h-2 w-2 rounded-full bg-red-400/70" />
        <span className="h-2 w-2 rounded-full bg-yellow-400/70" />
        <span className="h-2 w-2 rounded-full bg-green-400/70" />
        <span className="ml-3 text-[9px] font-mono text-muted-foreground/80 tracking-wider truncate">{url}</span>
      </div>
      <div className="p-3">
        <svg viewBox="0 0 240 120" className="w-full h-24 md:h-28">{children}</svg>
      </div>
    </div>
  );
}

const P = "hsl(var(--primary))";

/* 01 · Beratung, Videocall: 4 Video-Kacheln + Waveform */
export const VideoCallVisual = () => (
  <Frame url="videoraum · moreimmo-beratung">
    <g>
      {[[10, 12], [86, 12], [10, 62], [86, 62]].map(([x, y], i) => (
        <g key={i}>
          <rect x={x} y={y} width="66" height="42" rx="4" fill={P} fillOpacity="0.08" stroke={P} strokeOpacity="0.35" />
          <circle cx={x + 33} cy={y + 18} r="7" fill={P} fillOpacity="0.55" />
          <path d={`M${x + 20} ${y + 36} Q${x + 33} ${y + 26} ${x + 46} ${y + 36}`} fill={P} fillOpacity="0.55" />
          <circle cx={x + 60} cy={y + 6} r="2" fill="#22c55e" className="pv-blink" style={{ animationDelay: `${i * 0.3}s` }} />
        </g>
      ))}
    </g>
    {/* Waveform Live-Indikator */}
    <g transform="translate(170 55)" stroke={P} strokeWidth="2" strokeLinecap="round">
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <line key={i} x1={i * 7} y1="8" x2={i * 7} y2="-8" className="pv-wave" style={{ animationDelay: `${i * 0.12}s` }} />
      ))}
    </g>
    <text x="170" y="105" fontSize="8" fontFamily="ui-monospace, monospace" fill={P} opacity="0.7">● LIVE</text>
  </Frame>
);

/* 02 · Machbarkeitsprüfung — Bonitäts-Score + Gebäude-Check */
export const CheckVisual = () => (
  <Frame url="pruefung · bonitaet & objekt">
    {/* ── Linke Spalte: Bonitäts-Score + Checkliste ─────────────── */}
    <g>
      <text x="8" y="14" fontSize="7" fontFamily="ui-monospace, monospace" fill={P} opacity="0.75" letterSpacing="0.5">BONITÄTS-SCORE</text>
      <rect x="8" y="20" width="120" height="7" rx="3.5" fill={P} fillOpacity="0.12" />
      <rect x="8" y="20" width="102" height="7" rx="3.5" fill={P} className="pv-slide" />
      <text x="114" y="26" fontSize="6.5" fontFamily="ui-monospace, monospace" fill={P} opacity="0.7" textAnchor="end">85 / 100</text>

      <g transform="translate(8 40)" fontSize="8" fontFamily="ui-sans-serif">
        {["Einkommen", "Eigenkapital", "SCHUFA"].map((lbl, i) => (
          <g key={i} transform={`translate(0 ${i * 18})`}>
            <rect x="0" y="0" width="120" height="14" rx="3" fill={P} fillOpacity="0.05" />
            <circle cx="10" cy="7" r="6" fill={P} fillOpacity="0.18" />
            <path d="M7 7 L9.5 9.5 L13 5.5" fill="none" stroke={P} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="pv-check" style={{ animationDelay: `${i * 0.4}s` }} />
            <text x="22" y="10" fill={P} opacity="0.85">{lbl}</text>
          </g>
        ))}
      </g>
    </g>

    {/* ── Trenner ──────────────────────────────────────────────── */}
    <line x1="138" y1="8" x2="138" y2="112" stroke={P} strokeOpacity="0.15" strokeDasharray="2 3" />

    {/* ── Rechte Spalte: Score-Ring "SCORE 85 / A" ─────────────── */}
    <g>
      <text x="150" y="14" fontSize="7" fontFamily="ui-monospace, monospace" fill={P} opacity="0.75" letterSpacing="0.5">GESAMT-SCORE</text>
      {(() => {
        const cx = 190, cy = 66, r = 30;
        const C = 2 * Math.PI * r;
        const pct = 0.85;
        return (
          <g>
            <circle cx={cx} cy={cy} r={r} fill="none" stroke={P} strokeOpacity="0.12" strokeWidth="7" />
            <circle
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={P}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={`${C * pct} ${C}`}
              transform={`rotate(-90 ${cx} ${cy})`}
              className="pv-slide"
            />
            <text x={cx} y={cy - 2} textAnchor="middle" fontSize="16" fontWeight="700" fill={P} fontFamily="ui-sans-serif">85</text>
            <text x={cx} y={cy + 10} textAnchor="middle" fontSize="6.5" fill={P} opacity="0.65" fontFamily="ui-monospace, monospace" letterSpacing="1">RATING · A</text>
          </g>
        );
      })()}
      <text x="190" y="108" textAnchor="middle" fontSize="6.5" fill={P} opacity="0.6" fontFamily="ui-monospace, monospace" letterSpacing="0.5">MACHBARKEIT BESTÄTIGT</text>
    </g>
  </Frame>
);

/* 03 · Business Case — Zahlen-Dashboard */
export const BusinessCaseVisual = () => (
  <Frame url="business-case · kalkulation">
    <text x="10" y="16" fontSize="8" fontFamily="ui-monospace, monospace" fill={P} opacity="0.7">KALKULATION</text>
    {/* KPI-Kacheln */}
    <g fontFamily="ui-monospace, monospace">
      <g transform="translate(10 24)">
        <rect width="68" height="34" rx="4" fill={P} fillOpacity="0.08" stroke={P} strokeOpacity="0.25" />
        <text x="6" y="14" fontSize="7" fill={P} opacity="0.7">MIETE / M</text>
        <text x="6" y="28" fontSize="12" fontWeight="700" fill={P} className="pv-count">1.284 €</text>
      </g>
      <g transform="translate(86 24)">
        <rect width="68" height="34" rx="4" fill={P} fillOpacity="0.08" stroke={P} strokeOpacity="0.25" />
        <text x="6" y="14" fontSize="7" fill={P} opacity="0.7">RENDITE</text>
        <text x="6" y="28" fontSize="12" fontWeight="700" fill={P} className="pv-count" style={{ animationDelay: ".4s" }}>4,6 %</text>
      </g>
      <g transform="translate(162 24)">
        <rect width="68" height="34" rx="4" fill={P} fillOpacity="0.08" stroke={P} strokeOpacity="0.25" />
        <text x="6" y="14" fontSize="7" fill={P} opacity="0.7">HEBEL</text>
        <text x="6" y="28" fontSize="12" fontWeight="700" fill={P} className="pv-count" style={{ animationDelay: ".8s" }}>3,7 ×</text>
      </g>
    </g>
    {/* Chart */}
    <g transform="translate(10 66)">
      {[26, 42, 38, 58, 50, 74, 68, 90].map((h, i) => (
        <rect key={i} x={i * 28} y={40 - h * 0.4} width="18" height={h * 0.4} rx="2" fill={P} fillOpacity="0.7" className="pv-grow" style={{ animationDelay: `${i * 0.12}s` }} />
      ))}
    </g>
  </Frame>
);

/* 04 · Investmentchance sichern — Zins-Optionen + Bank */
export const FinanzierungVisual = () => (
  <Frame url="finanzierung · zins-vergleich">
    {/* Bank-Icon */}
    <g transform="translate(14 20)" className="pv-float">
      <polygon points="0,10 24,0 48,10" fill={P} fillOpacity="0.5" />
      <rect x="0" y="10" width="48" height="4" fill={P} fillOpacity="0.7" />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={4 + i * 11} y="16" width="6" height="30" fill={P} fillOpacity="0.35" />
      ))}
      <rect x="0" y="48" width="48" height="4" fill={P} fillOpacity="0.7" />
    </g>
    {/* Zins-Optionen */}
    <g transform="translate(80 20)" fontFamily="ui-monospace, monospace" fontSize="8">
      {[
        { bank: "BANK A", rate: "3,42 %", best: false },
        { bank: "BANK B", rate: "3,18 %", best: true },
        { bank: "BANK C", rate: "3,55 %", best: false },
      ].map((o, i) => (
        <g key={i} transform={`translate(0 ${i * 22})`}>
          <rect width="148" height="16" rx="3" fill={o.best ? P : P} fillOpacity={o.best ? 0.18 : 0.06} stroke={P} strokeOpacity={o.best ? 0.7 : 0.2} />
          <text x="8" y="11" fill={P} opacity="0.8">{o.bank}</text>
          <text x="70" y="11" fill={P} fontWeight={o.best ? 700 : 400}>{o.rate}</text>
          {o.best && (
            <g transform="translate(118 3)" className="pv-pulse">
              <rect width="24" height="10" rx="2" fill={P} />
              <text x="12" y="8" textAnchor="middle" fill="#fff" fontSize="6" fontWeight="700">BEST</text>
            </g>
          )}
        </g>
      ))}
    </g>
  </Frame>
);

/* 05 · Kaufvertrag — Dokument mit Stift, der Signatur schreibt */
export const VertragVisual = () => (
  <Frame url="kaufvertrag · unterschrift">
    {/* Dokument */}
    <g transform="translate(50 10)">
      <rect width="140" height="100" rx="4" fill="#fff" stroke={P} strokeOpacity="0.35" />
      <rect x="10" y="10" width="70" height="4" rx="1" fill={P} fillOpacity="0.4" />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x="10" y={22 + i * 8} width={i === 4 ? 90 : 110 - i * 6} height="2.5" rx="1" fill={P} fillOpacity="0.2" />
      ))}
      {/* Signatur-Linie */}
      <line x1="10" y1="82" x2="70" y2="82" stroke={P} strokeOpacity="0.4" strokeWidth="0.6" />
      <text x="10" y="92" fontSize="6" fontFamily="ui-monospace, monospace" fill={P} opacity="0.6">UNTERSCHRIFT</text>
      {/* Gezeichnete Signatur */}
      <path
        d="M12 78 C 16 72, 20 82, 24 76 S 32 70, 36 78 T 48 74 T 62 78"
        fill="none"
        stroke={P}
        strokeWidth="1.8"
        strokeLinecap="round"
        className="pv-sign"
      />
    </g>
    {/* Stift */}
    <g className="pv-pen" transform="translate(58 60)">
      <g transform="rotate(-25)">
        <rect x="0" y="0" width="34" height="5" rx="1" fill={P} />
        <polygon points="34,0 44,2.5 34,5" fill={P} fillOpacity="0.6" />
        <polygon points="44,2.5 48,2.5 44,2.5" stroke={P} strokeWidth="1" />
        <rect x="-6" y="0" width="6" height="5" fill={P} fillOpacity="0.4" />
      </g>
    </g>
  </Frame>
);

/* 06 · Notar & Übergabe — Notarsiegel-Stempel + Schlüsselübergabe */
export const NotarVisual = () => (
  <Frame url="notar · beurkundung & übergabe">
    {/* Dokument mit Stempel */}
    <g transform="translate(14 14)">
      <rect width="110" height="92" rx="4" fill="#fff" stroke={P} strokeOpacity="0.35" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={i} x="10" y={12 + i * 10} width={90 - (i % 3) * 12} height="2.5" rx="1" fill={P} fillOpacity="0.2" />
      ))}
      {/* Notar-Siegel Stempel */}
      <g transform="translate(70 58)" className="pv-stamp">
        <circle r="18" fill="none" stroke={P} strokeWidth="1.5" opacity="0.85" />
        <circle r="13" fill="none" stroke={P} strokeWidth="0.8" opacity="0.7" />
        <text y="-3" textAnchor="middle" fontSize="5" fontFamily="ui-serif, serif" fill={P} fontWeight="700">NOTAR</text>
        <text y="5" textAnchor="middle" fontSize="4" fontFamily="ui-serif, serif" fill={P} opacity="0.8">SIEGEL</text>
        <path d="M-8 10 L-3 14 L8 6" fill="none" stroke={P} strokeWidth="1.2" strokeLinecap="round" />
      </g>
    </g>
    {/* Schlüsselübergabe */}
    <g transform="translate(140 46)">
      {/* Hand-Silhouette (Empfänger) */}
      <path d="M60 20 L82 20 L82 34 L60 34 Z" fill={P} fillOpacity="0.35" />
      <path d="M60 22 Q 55 27 60 32" fill={P} fillOpacity="0.35" />
      {/* Schlüssel animiert nach rechts */}
      <g className="pv-key">
        <circle cx="12" cy="27" r="7" fill="none" stroke={P} strokeWidth="2.5" />
        <rect x="19" y="25" width="36" height="4" fill={P} />
        <rect x="46" y="29" width="4" height="6" fill={P} />
        <rect x="52" y="29" width="4" height="6" fill={P} />
      </g>
    </g>
  </Frame>
);

export const PROZESS_VISUALS = [
  VideoCallVisual,
  CheckVisual,
  BusinessCaseVisual,
  FinanzierungVisual,
  VertragVisual,
  NotarVisual,
];