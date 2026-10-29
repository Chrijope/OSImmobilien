/*
 * Kleine Bewegtgrafiken für „Unser Prozess“ auf der Partner-Landingpage
 * (29.10.2026). Je Schritt ein Motiv, das zeigt, was dort passiert. Die
 * Bewegung steuert mikroseiteOs.css über `data-anim` am Schritt: ohne
 * Attribut (kein Skript, „Bewegung reduzieren“) steht das fertige Bild da.
 * Linien, die sich zeichnen, tragen `pathLength="1"` und die Klasse `zl`.
 */
import type { ReactNode } from "react";

type Motiv = "gespraech" | "beratung" | "objekt" | "reservierung" | "finanzierung" | "besichtigung" | "notar";

export const PROZESS_MOTIVE: ReadonlyArray<Motiv> = [
  "gespraech", "beratung", "objekt", "reservierung", "finanzierung", "besichtigung", "notar",
];

export default function ProzessGrafik({ motiv }: { motiv: Motiv }) {
  return (
    <svg className={`osm-pg osm-pg-${motiv}`} viewBox="0 0 96 96" aria-hidden="true" focusable="false">
      {MOTIVE[motiv]}
    </svg>
  );
}

const MOTIVE: Record<Motiv, ReactNode> = {
  // Zwei Sprechblasen, in der zweiten tippt jemand.
  gespraech: (
    <>
      <path className="zl" pathLength={1} d="M12 20h44a6 6 0 0 1 6 6v18a6 6 0 0 1-6 6H30l-10 9v-9h-8a6 6 0 0 1-6-6V26a6 6 0 0 1 6-6z" />
      <path className="zl zl-2 akzent" pathLength={1} d="M44 46h34a6 6 0 0 1 6 6v14a6 6 0 0 1-6 6h-4v8l-9-8H44a6 6 0 0 1-6-6V52a6 6 0 0 1 6-6z" />
      <circle className="punkt p1" cx="52" cy="59" r="3" />
      <circle className="punkt p2" cx="61" cy="59" r="3" />
      <circle className="punkt p3" cx="70" cy="59" r="3" />
    </>
  ),
  // Ein Diagramm, dessen Säulen wachsen, darüber die Linie nach oben.
  beratung: (
    <>
      <path className="zl" pathLength={1} d="M14 14v66h70" />
      <rect className="saeule s1" x="24" y="52" width="12" height="28" rx="2" />
      <rect className="saeule s2" x="44" y="40" width="12" height="40" rx="2" />
      <rect className="saeule s3 akzent-flaeche" x="64" y="26" width="12" height="54" rx="2" />
      <path className="zl zl-2 akzent" pathLength={1} d="M22 46l20-12 18 6 22-20" />
    </>
  ),
  // Ein Haus zeichnet sich, dann geht im Fenster das Licht an.
  objekt: (
    <>
      <path className="zl" pathLength={1} d="M14 44L48 16l34 28M22 38v42h52V38" />
      <path className="zl zl-2" pathLength={1} d="M42 80V60h12v20" />
      <rect className="fenster" x="28" y="48" width="10" height="10" rx="1" />
      <rect className="fenster f2" x="58" y="48" width="10" height="10" rx="1" />
    </>
  ),
  // Ein Lesezeichen wird gesetzt und abgehakt: reserviert, kostenfrei.
  reservierung: (
    <>
      <path className="zl" pathLength={1} d="M26 12h44a4 4 0 0 1 4 4v68L48 68 22 84V16a4 4 0 0 1 4-4z" />
      <path className="zl zl-2 akzent haken" pathLength={1} d="M34 40l10 10 20-20" />
    </>
  ),
  // Münzen fallen nacheinander auf den Stapel.
  finanzierung: (
    <>
      <path className="zl" pathLength={1} d="M14 82h68" />
      <g className="muenze m1"><ellipse cx="48" cy="72" rx="22" ry="6" /><path d="M26 72v4c0 3.3 9.8 6 22 6s22-2.7 22-6v-4" /></g>
      <g className="muenze m2"><ellipse cx="48" cy="60" rx="22" ry="6" /><path d="M26 60v4c0 3.3 9.8 6 22 6s22-2.7 22-6v-4" /></g>
      <g className="muenze m3 akzent"><ellipse cx="48" cy="48" rx="22" ry="6" /><path d="M26 48v4c0 3.3 9.8 6 22 6s22-2.7 22-6v-4" /></g>
      <path className="zl zl-2 akzent" pathLength={1} d="M48 14v18M41 25l7 7 7-7" />
    </>
  ),
  // Eine Standortnadel landet auf der Karte.
  besichtigung: (
    <>
      <path className="zl" pathLength={1} d="M10 70l22-8 32 10 22-8v18l-22 8-32-10-22 8z" />
      <ellipse className="schatten" cx="48" cy="70" rx="8" ry="2.5" />
      <g className="nadel">
        <path className="akzent" d="M48 64s-16-15-16-28a16 16 0 0 1 32 0c0 13-16 28-16 28z" />
        <circle cx="48" cy="36" r="5" />
      </g>
    </>
  ),
  // Auf dem Vertrag entsteht die Unterschrift, dann kommt das Siegel.
  notar: (
    <>
      <path className="zl" pathLength={1} d="M22 10h40l14 14v62H22z" />
      <path className="zl" pathLength={1} d="M32 30h26M32 40h34M32 50h30" />
      <path className="zl zl-3 akzent" pathLength={1} d="M30 72c6-10 9-10 10-3s4 6 8-2 6-4 7 0 5 2 10-4" />
      <g className="siegel">
        <circle className="akzent" cx="70" cy="80" r="10" />
        <path d="M65 80l4 4 7-8" />
      </g>
    </>
  ),
};
