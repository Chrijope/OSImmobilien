/**
 * Die Deutschlandkarte mit unseren Standorten, übernommen von der Website
 * osimmobilien.netlify.app (`OS Immobilien-Website/src/components/StandortSection.tsx`, gelesen am
 * 30.09.2026): dunkle Bundesländer mit Verlauf und Glanz, Bayern in Blau mit
 * Leuchten, Nadeln hell auf Bayern und dunkel außerhalb, dazu Namensschilder.
 * Die Pfade stehen in `assets/deutschlandLaender.ts`, die Punkte in
 * `lib/partnerWerden/inhalt.ts`.
 *
 * Anders als auf der Website: Die Neigung der Karte (rotateX) fehlt, weil
 * Christian Neigungen am 23.09.2026 abgelehnt hat. Nadel und Schild sind
 * größer, weil die Karte hier schmaler steht. Die Nadelspitze sitzt auf dem
 * Punkt des Standorts. Jede Nadel ist ein Knopf: Klick oder Enter wählt den
 * Standort, die Seite hebt dann die Karte darunter hervor.
 */
import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { DE_STATES, DE_VIEWBOX } from "@/assets/deutschlandLaender";

export interface KartenStandort {
  name: string;
  bayern: boolean;
  x: number;
  y: number;
  seite: "links" | "rechts" | "unten";
}

/** Nadel und Schild wachsen um diesen Faktor gegenüber der Website. */
const GROESSE = 2.1;
/** Die Nadel der Website, so verschoben, dass ihre Spitze bei (0, 0) liegt. */
const NADEL = "M0,-25.5 c-6,0 -10.5,4.5 -10.5,10.5 c0,7.5 10.5,15 10.5,15 s10.5,-7.5 10.5,-15 c0,-6 -4.5,-10.5 -10.5,-10.5 z";
const SCHRIFT = 8.5;
/** Grobe Breite je Zeichen bei dieser Schrift, wie auf der Website. */
const ZEICHEN = 4.9;

function schild(s: KartenStandort) {
  const breite = s.name.length * ZEICHEN + 12;
  const hoehe = 14;
  if (s.seite === "rechts") return { x: 10, y: -21, breite, hoehe, anker: "start" as const, tx: 16 };
  if (s.seite === "links") return { x: -10 - breite, y: -21, breite, hoehe, anker: "end" as const, tx: -16 };
  return { x: -breite / 2, y: 6, breite, hoehe, anker: "middle" as const, tx: 0 };
}

export default function StandortKarte({
  standorte,
  aktiv,
  onWaehle,
  tipp,
}: {
  standorte: KartenStandort[];
  aktiv: string | null;
  onWaehle: (name: string) => void;
  tipp: string;
}) {
  const id = useId().replace(/:/g, "");
  const ref = useRef<HTMLElement>(null);
  const [sichtbar, setSichtbar] = useState(false);

  // Die Nadeln fallen ein, wenn die Karte ins Bild kommt. Ohne Beobachter gleich sichtbar.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setSichtbar(true);
      return;
    }
    const io = new IntersectionObserver(
      (eintraege) => {
        if (eintraege.some((e) => e.isIntersecting)) {
          setSichtbar(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const taste = (e: KeyboardEvent, name: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onWaehle(name);
    }
  };

  return (
    <figure ref={ref} className="pw-karte hb-karte" data-sichtbar={sichtbar ? "" : undefined}>
      <svg viewBox={DE_VIEWBOX} role="group" aria-label="Karte mit unseren Standorten">
        <defs>
          <linearGradient id={`${id}-land`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="hsl(220 18% 38%)" />
            <stop offset="55%" stopColor="hsl(220 22% 26%)" />
            <stop offset="100%" stopColor="hsl(222 26% 18%)" />
          </linearGradient>
          <linearGradient id={`${id}-glanz`} x1="0%" y1="0%" x2="0%" y2="60%">
            <stop offset="0%" stopColor="white" stopOpacity="0.28" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${id}-bayern`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="hsl(157 71% 42%)" />
            <stop offset="55%" stopColor="hsl(157 68% 31%)" />
            <stop offset="100%" stopColor="hsl(157 60% 20%)" />
          </linearGradient>
          <linearGradient id={`${id}-bayern-glanz`} x1="0%" y1="0%" x2="0%" y2="60%">
            <stop offset="0%" stopColor="white" stopOpacity="0.5" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <radialGradient id={`${id}-nadel-hell`} cx="50%" cy="30%" r="65%">
            <stop offset="0%" stopColor="#8BEEC9" />
            <stop offset="100%" stopColor="#30E19E" />
          </radialGradient>
          <radialGradient id={`${id}-nadel-dunkel`} cx="50%" cy="30%" r="65%">
            <stop offset="0%" stopColor="hsl(220 25% 14%)" />
            <stop offset="100%" stopColor="hsl(220 30% 8%)" />
          </radialGradient>
          <radialGradient id={`${id}-nadel-aktiv`} cx="50%" cy="30%" r="65%">
            <stop offset="0%" stopColor="hsl(157 71% 45%)" />
            <stop offset="100%" stopColor="hsl(157 60% 23%)" />
          </radialGradient>
          <filter id={`${id}-schatten`} x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="3" stdDeviation="2.2" floodColor="#000" floodOpacity="0.4" />
          </filter>
          <filter id={`${id}-leuchten`} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="hsl(157 68% 28%)" floodOpacity="0.7" />
          </filter>
        </defs>

        <g aria-hidden="true">
          {DE_STATES.map((land) => {
            const bayern = land.code === "BY";
            return (
              <g key={land.code} filter={bayern ? `url(#${id}-leuchten)` : undefined}>
                <path
                  d={land.d}
                  fill={`url(#${id}-${bayern ? "bayern" : "land"})`}
                  stroke={bayern ? "hsl(157 75% 60%)" : "hsl(157 60% 61% / 0.55)"}
                  strokeWidth={bayern ? 1.4 : 0.8}
                  strokeLinejoin="round"
                />
                <path d={land.d} fill={`url(#${id}-${bayern ? "bayern-glanz" : "glanz"})`} pointerEvents="none" />
              </g>
            );
          })}
        </g>

        {/* Unsichtbare Tippflächen, am Handy ist die Nadel allein nur gut 25 px
            hoch. Sie liegen in einer Ebene unter allen Nadeln: München und
            Augsburg stehen so dicht, dass sich die Flächen überlappen, und so
            gewinnt immer die sichtbare Nadel. Nur für den Finger, die Tastatur
            nutzt die Nadel selbst. */}
        <g aria-hidden="true">
          {standorte.map((s) => (
            <circle
              key={s.name}
              className="pw-pin-flaeche"
              cx={s.x}
              cy={s.y - 12 * GROESSE}
              r={21 * GROESSE}
              fill="transparent"
              onClick={() => onWaehle(s.name)}
            />
          ))}
        </g>

        {standorte.map((s, i) => {
          const an = aktiv === s.name;
          const gedimmt = aktiv !== null && !an;
          const sch = schild(s);
          const fuellung = an ? "nadel-aktiv" : s.bayern ? "nadel-hell" : "nadel-dunkel";
          return (
            <g
              key={s.name}
              className={`pw-pin${an ? " an" : ""}${gedimmt ? " gedimmt" : ""}`}
              style={{ "--pw-i": i } as CSSProperties}
              role="button"
              tabIndex={0}
              aria-label={s.name}
              aria-pressed={an}
              onClick={() => onWaehle(s.name)}
              onKeyDown={(e) => taste(e, s.name)}
            >
              <g transform={`translate(${s.x} ${s.y}) scale(${GROESSE})`}>
                <ellipse cx={0} cy={0} rx={4} ry={1.4} fill="#000" opacity={0.3} />
                {an && <circle className="pw-pin-puls" cx={0} cy={-14} r={14} fill="none" stroke="hsl(157 71% 42%)" strokeWidth={1.6} />}
                <g filter={`url(#${id}-schatten)`}>
                  <path d={NADEL} fill={`url(#${id}-${fuellung})`} stroke="white" strokeWidth={1} strokeOpacity={0.95} />
                  <circle cx={0} cy={-14.5} r={2.8} fill="white" />
                </g>
                {/* Eigene Gruppe, damit das Schild am Handy per CSS wachsen kann (partnerWerden.css). */}
                <g className="pw-pin-schild">
                  <rect
                    x={sch.x}
                    y={sch.y}
                    width={sch.breite}
                    height={sch.hoehe}
                    rx={7}
                    fill={an ? "hsl(157 68% 31%)" : "white"}
                    fillOpacity={0.97}
                    stroke={an ? "hsl(157 75% 54%)" : "hsl(220 30% 20% / 0.15)"}
                    strokeWidth={0.6}
                  />
                  <text
                    x={sch.anker === "middle" ? 0 : sch.tx}
                    y={sch.y + 10}
                    textAnchor={sch.anker}
                    className="pw-pin-name"
                    style={{ fontSize: SCHRIFT, fill: an ? "#fff" : "hsl(222 30% 18%)" }}
                  >
                    {s.name}
                  </text>
                </g>
              </g>
            </g>
          );
        })}
      </svg>
      <figcaption className="hb-klein">{tipp}</figcaption>
    </figure>
  );
}
