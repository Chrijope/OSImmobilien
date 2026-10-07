/**
 * Schematische Grafik je Prozessschritt.
 *
 * Sechs einfache Bilder aus Balken, Kreisen und Rechtecken, eines je Schritt.
 * Bewusst ohne Euro-Beträge, Zinssätze oder Renditen: Die Grafik erklärt den
 * Ablauf, sie verspricht kein Ergebnis. Die Fußzeile sagt das noch einmal.
 */

import { useSeitenTexte } from "@/components/SeitenSprache";
import { MIKROSEITE_ABSCHLUSS_TEXTE, type MikroseiteAbschlussTexte } from "../mikroseiteAbschlussTexte";

/** Die Beschriftungen der sechs Bilder, in der Sprache der Seite. */
type GrafikTexte = MikroseiteAbschlussTexte["prozess"]["grafik"];

const BLAU = "hsl(var(--primary))";
const GRAU = "hsl(220 10% 46%)";
const FLAECHE = "hsl(210 30% 93%)";
const LINIE = "hsl(214 24% 86%)";

interface Props {
  /** Index des Schritts, 0 bis 5. */
  schritt: number;
  /** Kurzer Name für das Abzeichen in der Kopfzeile. */
  name: string;
}

/** Waagerechter Balken mit Beschriftung, für die Ausgangsanalyse. */
function Balken({ y, text, anteil }: { y: number; text: string; anteil: number }) {
  return (
    <g>
      <text x="24" y={y - 8} fill={GRAU} className="text-[12px]">
        {text}
      </text>
      <rect x="24" y={y} width="352" height="12" rx="6" fill={FLAECHE} />
      <rect x="24" y={y} width={352 * anteil} height="12" rx="6" fill={BLAU} />
    </g>
  );
}

function Analyse({ t }: { t: GrafikTexte }) {
  const zeilen = [0.78, 0.62, 0.86, 0.5].map((anteil, i) => ({ text: t.analyseZeilen[i], anteil }));
  return (
    <g>
      {zeilen.map((z, i) => (
        <Balken key={z.text} y={52 + i * 62} text={z.text} anteil={z.anteil} />
      ))}
      <text x="24" y="292" fill={GRAU} className="text-[11px]">
        {t.analyseUnten}
      </text>
    </g>
  );
}

function Strategie({ t }: { t: GrafikTexte }) {
  return (
    <g>
      <rect x="24" y="36" width="150" height="220" rx="10" fill="white" stroke={LINIE} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect
          key={i}
          x="42"
          y={64 + i * 26}
          width={i % 3 === 2 ? 70 : 114}
          height="8"
          rx="4"
          fill={i === 0 ? BLAU : FLAECHE}
        />
      ))}
      {t.strategieObjekte.map((name, i) => (
        <g key={name}>
          <rect
            x="204"
            y={36 + i * 76}
            width="172"
            height="64"
            rx="10"
            fill={i === 1 ? "white" : FLAECHE}
            stroke={i === 1 ? BLAU : LINIE}
            strokeWidth={i === 1 ? 2 : 1}
          />
          <text x="222" y={64 + i * 76} fill="hsl(220 25% 10%)" className="text-[13px] font-semibold">
            {name}
          </text>
          <text x="222" y={82 + i * 76} fill={GRAU} className="text-[11px]">
            {i === 1 ? t.strategiePasst : t.strategieZurueck}
          </text>
        </g>
      ))}
      <text x="24" y="292" fill={GRAU} className="text-[11px]">
        {t.strategieUnten}
      </text>
    </g>
  );
}

function Finanzierung({ t }: { t: GrafikTexte }) {
  const saeulen = [96, 150, 120].map((hoehe, i) => ({ name: t.finanzierungBanken[i], hoehe }));
  return (
    <g>
      <line x1="24" y1="228" x2="376" y2="228" stroke={LINIE} strokeWidth="1.5" />
      {saeulen.map((s, i) => (
        <g key={s.name}>
          <rect
            x={52 + i * 108}
            y={228 - s.hoehe}
            width="64"
            height={s.hoehe}
            rx="8"
            fill={i === 1 ? BLAU : FLAECHE}
          />
          <text
            x={84 + i * 108}
            y="248"
            textAnchor="middle"
            fill={i === 1 ? "hsl(220 25% 10%)" : GRAU}
            className="text-[12px] font-semibold"
          >
            {s.name}
          </text>
        </g>
      ))}
      <text x="24" y="36" fill={GRAU} className="text-[12px]">
        {t.finanzierungOben}
      </text>
      <text x="24" y="292" fill={GRAU} className="text-[11px]">
        {t.finanzierungUnten}
      </text>
    </g>
  );
}

function Kaufbegleitung({ t }: { t: GrafikTexte }) {
  const stationen = t.kaufStationen;
  return (
    <g>
      <line x1="46" y1="140" x2="354" y2="140" stroke={LINIE} strokeWidth="2" />
      <line x1="46" y1="140" x2="252" y2="140" stroke={BLAU} strokeWidth="3" strokeLinecap="round" />
      {stationen.map((name, i) => {
        const x = 46 + i * 103;
        const erledigt = i <= 2;
        return (
          <g key={name}>
            <circle cx={x} cy="140" r="14" fill={erledigt ? BLAU : "white"} stroke={erledigt ? BLAU : LINIE} strokeWidth="2" />
            {erledigt && (
              <path
                d={`M${x - 6},140 L${x - 1},145 L${x + 6},135`}
                fill="none"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            <text x={x} y="180" textAnchor="middle" fill={erledigt ? "hsl(220 25% 10%)" : GRAU} className="text-[12px] font-semibold">
              {name}
            </text>
          </g>
        );
      })}
      <text x="24" y="36" fill={GRAU} className="text-[12px]">
        {t.kaufOben}
      </text>
      <text x="24" y="292" fill={GRAU} className="text-[11px]">
        {t.kaufUnten}
      </text>
    </g>
  );
}

function Vermietung({ t }: { t: GrafikTexte }) {
  return (
    <g>
      <path d="M40,120 L96,74 L152,120 Z" fill={FLAECHE} />
      <rect x="56" y="120" width="80" height="86" rx="6" fill={FLAECHE} />
      <rect x="72" y="140" width="22" height="22" rx="3" fill="white" />
      <rect x="102" y="140" width="22" height="22" rx="3" fill="white" />
      <rect x="86" y="174" width="24" height="32" rx="3" fill="white" />
      <text x="96" y="230" textAnchor="middle" fill={GRAU} className="text-[12px]">
        {t.vermietungHaus}
      </text>
      <text x="196" y="86" fill={GRAU} className="text-[12px]">
        {t.vermietungMiete}
      </text>
      {Array.from({ length: 12 }, (_, i) => (
        <rect
          key={i}
          x={196 + (i % 6) * 30}
          y={102 + Math.floor(i / 6) * 30}
          width="22"
          height="22"
          rx="5"
          fill={i < 10 ? BLAU : FLAECHE}
        />
      ))}
      <text x="196" y="188" fill={GRAU} className="text-[11px]">
        {t.vermietungPartner}
      </text>
      <text x="24" y="292" fill={GRAU} className="text-[11px]">
        {t.vermietungUnten}
      </text>
    </g>
  );
}

function Portfolio({ t }: { t: GrafikTexte }) {
  const haeuser = [90, 128, 166].map((hoehe, i) => ({ name: t.portfolioObjekte[i], hoehe }));
  return (
    <g>
      <line x1="24" y1="236" x2="376" y2="236" stroke={LINIE} strokeWidth="1.5" />
      {haeuser.map((h, i) => (
        <g key={h.name}>
          <rect
            x={60 + i * 104}
            y={236 - h.hoehe}
            width="72"
            height={h.hoehe}
            rx="6"
            fill={i === 2 ? FLAECHE : BLAU}
            opacity={i === 2 ? 1 : 0.85}
          />
          {Array.from({ length: Math.floor(h.hoehe / 32) }, (_, z) => (
            <rect
              key={z}
              x={74 + i * 104}
              y={236 - h.hoehe + 14 + z * 32}
              width="44"
              height="14"
              rx="3"
              fill={i === 2 ? "white" : "hsl(0 0% 100% / 0.75)"}
            />
          ))}
          <text
            x={96 + i * 104}
            y="256"
            textAnchor="middle"
            fill={i === 2 ? GRAU : "hsl(220 25% 10%)"}
            className="text-[12px] font-semibold"
          >
            {h.name}
          </text>
        </g>
      ))}
      <path d="M40,96 L150,70 L260,44" fill="none" stroke={BLAU} strokeWidth="2" strokeDasharray="5 5" />
      <text x="272" y="48" fill={BLAU} className="text-[12px] font-semibold">
        {t.portfolioNaechster}
      </text>
      <text x="24" y="292" fill={GRAU} className="text-[11px]">
        {t.portfolioUnten}
      </text>
    </g>
  );
}

const GRAFIKEN = [Analyse, Strategie, Finanzierung, Kaufbegleitung, Vermietung, Portfolio];

export default function ProzessSchrittGrafik({ schritt, name }: Props) {
  const texte = useSeitenTexte(MIKROSEITE_ABSCHLUSS_TEXTE).prozess;
  const Bild = GRAFIKEN[Math.max(0, Math.min(GRAFIKEN.length - 1, schritt))];
  const nummer = String(schritt + 1).padStart(2, "0");

  return (
    <div className="rounded-2xl border border-[hsl(214,24%,88%)] bg-[hsl(210,33%,98%)] p-4 sm:p-5">
      {/* Umbruch erlaubt: Die Karte ist seit dem 16.09.2026 deutlich schmaler. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-[11px] uppercase tracking-[0.18em] text-[hsl(220,10%,46%)]">
          {texte.schritt(nummer)}
        </span>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-[11px] uppercase tracking-[0.12em] text-primary font-semibold">
          {name}
        </span>
      </div>
      <div className="mt-3">
        <svg viewBox="0 0 400 300" className="w-full h-auto" role="img" aria-label={texte.grafik.beschreibung(name)}>
          <Bild t={texte.grafik} />
        </svg>
      </div>
      <p className="mt-2 text-[11px] text-[hsl(220,10%,46%)]">{texte.grafik.fusszeile}</p>
    </div>
  );
}
