import { useId, useMemo } from "react";
import { useSeitenTexte } from "@/components/SeitenSprache";
import { MIKROSEITE_TEXTE } from "../mikroseiteTexte";

/**
 * Zeitachse über zehn Jahre mit der Lücke zwischen zwei Kurven — die Schere.
 *
 * Oben das Einkommen, unten der Anteil davon, der zu Vermögen wird. Beide
 * starten am selben Punkt und laufen auseinander, die Fläche dazwischen ist
 * die Lücke und bekommt ein Maß. Die Kurven werden mit dem Scrollfortschritt
 * von links nach rechts aufgedeckt, je Punkt setzt sich eine Marke auf die
 * obere Kurve.
 *
 * Bewusst ohne Zahlenachse: Ein Eurobetrag wäre hier nicht belegbar. Die
 * Aussage ist die Form, nicht der Wert — deshalb steht unter der Grafik
 * „Schematische Darstellung, keine Prognose."
 *
 * Farben: Das Vorbild auf more.immo ist dunkel, die Microseite ist hell.
 * Deshalb hier eigene Werte, alle gegen Weiß geprüft:
 *   Einkommen  hsl(var(--primary)) = #087ac7   4,55:1
 *   Vermögen   hsl(220 10% 46%)    = #6a7181   4,89:1
 *   Lücke      hsl(18 88% 40%)     = #c2400c   5,18:1
 * Die Achsen sind reine Zierlinien und deshalb bewusst hell.
 */

const FARBE_EINKOMMEN = "hsl(var(--primary))";
const FARBE_VERMOEGEN = "hsl(220 10% 46%)";
const FARBE_LUECKE = "hsl(18 88% 40%)";
const FARBE_ACHSE = "hsl(214 24% 86%)";

interface Mass {
  W: number;
  H: number;
  X0: number;
  X1: number;
  Y0: number;
  Y1: number;
}

/** Mit Beschriftungen in der Grafik. */
const BREIT: Mass = { W: 760, H: 440, X0: 64, X1: 724, Y0: 52, Y1: 376 };
/**
 * Handy: hochformatiger und ohne Schrift in der Grafik.
 *
 * Bei rund 330 Pixeln Anzeigebreite schrumpft ein 760 Pixel breiter
 * Ausschnitt auf 43 Prozent — aus 13 Pixel Schrift würden 5,6. Die
 * Beschriftungen stehen dort als HTML neben und unter der Grafik.
 */
const SCHMAL: Mass = { W: 420, H: 356, X0: 34, X1: 396, Y0: 34, Y1: 306 };

/** Endwerte als Anteil der Zeichenhöhe und jährliches Wachstum. Schematisch, keine Prognose. */
const EINKOMMEN = { endwert: 0.92, wachstum: 0.065 };
const VERMOEGEN = { endwert: 0.22, wachstum: 0.015 };

/** Anteil des Endwerts nach dem Anteil t der zehn Jahre, mit Zinseszinsverlauf. */
function verlauf(t: number, wachstum: number): number {
  const gesamt = Math.pow(1 + wachstum, 10) - 1;
  return (Math.pow(1 + wachstum, 10 * t) - 1) / gesamt;
}

function hoehe(t: number, kurve: { endwert: number; wachstum: number }, m: Mass): number {
  return m.Y1 - (m.Y1 - m.Y0) * kurve.endwert * verlauf(t, kurve.wachstum);
}

interface Props {
  /** Beschriftungen der Marken, z. B. ["01", "02", "03"]. */
  marken: string[];
  /** Index der gerade aktiven Marke. */
  aktiv: number;
  /** 0 bis 1, wie weit die Kurven aufgedeckt sind. */
  aufbau: number;
  /** Zeigt die Klammer mit der Beschriftung „Die Lücke". */
  zeigeLuecke: boolean;
  /** Handyfassung: engerer Ausschnitt, keine Schrift in der Grafik. */
  kompakt?: boolean;
}

export default function LueckenZeitachse({ marken, aktiv, aufbau, zeigeLuecke, kompakt = false }: Props) {
  const id = useId();
  const t = useSeitenTexte(MIKROSEITE_TEXTE).zeitachse;
  const maske = `zeitachse-${id.replace(/[^a-zA-Z0-9]/g, "")}`;
  const m = kompakt ? SCHMAL : BREIT;

  const { einkommenPfad, vermoegenPfad, flaeche, markenPunkte, klammer } = useMemo(() => {
    const schritte = 60;
    const oben: Array<[number, number]> = [];
    const unten: Array<[number, number]> = [];
    for (let i = 0; i <= schritte; i += 1) {
      const t = i / schritte;
      const x = m.X0 + (m.X1 - m.X0) * t;
      oben.push([x, hoehe(t, EINKOMMEN, m)]);
      unten.push([x, hoehe(t, VERMOEGEN, m)]);
    }
    const alsPfad = (punkte: Array<[number, number]>) =>
      punkte.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(2)}`).join("");

    // Die Marken liegen gleichmäßig verteilt auf der Einkommenskurve.
    const punkte = marken.map((beschriftung, i) => {
      const t = (i + 1) / (marken.length + 1);
      return { beschriftung, t, x: m.X0 + (m.X1 - m.X0) * t, y: hoehe(t, EINKOMMEN, m) };
    });

    const tKlammer = 0.62;
    return {
      einkommenPfad: alsPfad(oben),
      vermoegenPfad: alsPfad(unten),
      flaeche: `${alsPfad(oben)}${[...unten]
        .reverse()
        .map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(2)}`)
        .join("")}Z`,
      markenPunkte: punkte,
      klammer: {
        x: m.X0 + (m.X1 - m.X0) * tKlammer,
        oben: hoehe(tKlammer, EINKOMMEN, m),
        unten: hoehe(tKlammer, VERMOEGEN, m),
      },
    };
  }, [marken, m]);

  const breite = m.X0 + (m.X1 - m.X0) * Math.max(0, Math.min(1, aufbau));

  return (
    <svg
      viewBox={`0 0 ${m.W} ${m.H}`}
      className="w-full h-auto"
      role="img"
      aria-label={t.ariaLabel}
    >
      <defs>
        <clipPath id={maske}>
          <rect x="0" y="0" width={breite} height={m.H} />
        </clipPath>
      </defs>

      <line x1={m.X0} y1={m.Y1} x2={m.X1} y2={m.Y1} stroke={FARBE_ACHSE} strokeWidth="1.5" />
      <line x1={m.X0} y1={m.Y0} x2={m.X0} y2={m.Y1} stroke={FARBE_ACHSE} strokeWidth="1.5" />

      <g clipPath={`url(#${maske})`}>
        <path d={flaeche} fill={FARBE_LUECKE} fillOpacity="0.12" />
        <path
          d={vermoegenPfad}
          fill="none"
          stroke={FARBE_VERMOEGEN}
          strokeWidth="2.5"
          strokeDasharray="5 5"
        />
        <path
          d={einkommenPfad}
          fill="none"
          stroke={FARBE_EINKOMMEN}
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <circle cx={m.X1} cy={hoehe(1, EINKOMMEN, m)} r="7" fill={FARBE_EINKOMMEN} />
        <circle cx={m.X1} cy={hoehe(1, VERMOEGEN, m)} r="6" fill={FARBE_VERMOEGEN} />
      </g>

      {zeigeLuecke && (
        <g>
          <g stroke={FARBE_LUECKE} strokeWidth="2">
            <line x1={klammer.x} y1={klammer.oben} x2={klammer.x} y2={klammer.unten} />
            <line x1={klammer.x - 6} y1={klammer.oben} x2={klammer.x + 6} y2={klammer.oben} />
            <line x1={klammer.x - 6} y1={klammer.unten} x2={klammer.x + 6} y2={klammer.unten} />
          </g>
          {!kompakt && (
            <text
              x={klammer.x - 14}
              y={(klammer.oben + klammer.unten) / 2 + 5}
              textAnchor="end"
              fill={FARBE_LUECKE}
              className="text-[15px] font-semibold"
            >
              {t.luecke}
            </text>
          )}
        </g>
      )}

      {markenPunkte.map((marke, i) => {
        if (marke.t > aufbau + 0.01) return null;
        const istAktiv = i === aktiv;
        return (
          <g key={marke.beschriftung}>
            <line
              x1={marke.x}
              y1={marke.y}
              x2={marke.x}
              y2={m.Y1 - 8}
              stroke={FARBE_LUECKE}
              strokeOpacity="0.35"
              strokeDasharray="3 4"
            />
            <circle
              cx={marke.x}
              cy={marke.y}
              r={istAktiv ? 12 : 9}
              fill="white"
              stroke={FARBE_LUECKE}
              strokeWidth="2"
              className="transition-all duration-300"
            />
            <text
              x={marke.x}
              y={marke.y + 4}
              textAnchor="middle"
              fill={FARBE_LUECKE}
              className={`font-bold ${istAktiv ? "text-[12px]" : "text-[10px]"}`}
            >
              {marke.beschriftung}
            </text>
          </g>
        );
      })}

      {/* Die Schrift in der Grafik entfällt in der Handyfassung, siehe SCHMAL. */}
      {!kompakt && (
        <>
          <text x={m.X0} y={m.Y1 + 26} fill={FARBE_VERMOEGEN} className="text-[13px]">
            {t.heute}
          </text>
          <text x={m.X1} y={m.Y1 + 26} textAnchor="end" fill={FARBE_VERMOEGEN} className="text-[13px]">
            {t.inZehnJahren}
          </text>
          <text
            x={m.X1 - 16}
            y={hoehe(1, EINKOMMEN, m) - 18}
            textAnchor="end"
            fill={FARBE_EINKOMMEN}
            className="text-[16px] font-semibold"
          >
            {t.einkommen}
          </text>
          <text
            x={m.X1 - 16}
            y={hoehe(1, VERMOEGEN, m) + 34}
            textAnchor="end"
            fill={FARBE_VERMOEGEN}
            className="text-[14px]"
          >
            {t.vermoegen}
          </text>
          <text x={m.X0} y={m.H - 6} fill={FARBE_VERMOEGEN} className="text-[11.5px]">
            {t.hinweis}
          </text>
        </>
      )}
    </svg>
  );
}
