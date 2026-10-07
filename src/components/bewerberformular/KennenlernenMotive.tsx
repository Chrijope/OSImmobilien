import { memo } from "react";
import type { MotivId } from "@/lib/bewerberKennenlernen";

/**
 * Die Motive des Kennenlernens (Punkt P2 des Sollzustands).
 *
 * Je Ansicht ein eigenes Bild, 150 mal 110, oben rechts neben der Überschrift
 * und auf dem Handy darunter. Reines Inline-SVG: keine Bilddatei, kein
 * Upload, keine fremde Bibliothek. Die Zeichnungen sind aus dem Freigabe-PDF
 * übernommen (`scratchpad/bewerber_pdf/gen/motive.mjs`), damit auf dem
 * Bildschirm dasselbe steht, was der Geschäftsführer abgenommen hat.
 *
 * ## Warum die Motive als Zeichenketten entstehen
 *
 * Jedes Motiv braucht eigene Verlaufs- und Filterkennungen, sonst greifen
 * zwei Motive auf demselben Bildschirm auf dieselbe `id` zu und das zweite
 * erbt die Farben des ersten. In JSX wäre das ein Wald aus `<linearGradient>`
 * mit zusammengesetzten Kennungen; als Zeichenkette mit einem Präfix je Motiv
 * bleibt es lesbar und entspricht Zeile für Zeile der abgenommenen Vorlage.
 * Der Inhalt ist vollständig fest verdrahtet, es fließt nie eine Eingabe
 * hinein.
 *
 * ## Die Bewegung
 *
 * Die Animation liegt in `MotivStil` als ein einziger Stilblock. Bewegt wird
 * sparsam und immer zum Inhalt passend: Der Pfad zeichnet sich, die Karten
 * heben sich gestaffelt, der Staffelstab wandert, die Uhren laufen
 * unterschiedlich schnell, die Häkchen rasten nacheinander ein. Unter
 * `prefers-reduced-motion: reduce` steht alles still, ohne dass ein Motiv
 * dabei unfertig aussieht.
 */

// ── Bausteine, wortgleich zur Vorlage ────────────────────────────────────

/** Verläufe und Schatten. Je Motiv ein eigener Schlüssel für eindeutige Kennungen. */
const defs = (k: string) => `<defs>
<linearGradient id="${k}p" x1="0" y1="0" x2="0.8" y2="1"><stop offset="0" stop-color="#FCFDFF"/><stop offset="1" stop-color="#E6F0FC"/></linearGradient>
<linearGradient id="${k}g" x1="0" y1="0" x2="1" y2="0.85"><stop offset="0" stop-color="#C4E1FF"/><stop offset="0.45" stop-color="#7CBEFF"/><stop offset="1" stop-color="#3E8EF0"/></linearGradient>
<linearGradient id="${k}b" x1="0" y1="0" x2="0.55" y2="1"><stop offset="0" stop-color="#2E8AE8"/><stop offset="1" stop-color="#0A5BB5"/></linearGradient>
<linearGradient id="${k}d" x1="0" y1="0" x2="0.55" y2="1"><stop offset="0" stop-color="#0A6EDB"/><stop offset="1" stop-color="#084A94"/></linearGradient>
<linearGradient id="${k}w" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#EAF3FD"/></linearGradient>
<linearGradient id="${k}h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".85"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>
<filter id="${k}s" x="-45%" y="-45%" width="190%" height="210%"><feDropShadow dx="0" dy="2.4" stdDeviation="2.4" flood-color="#0A3E7A" flood-opacity="0.20"/></filter>
<filter id="${k}t" x="-45%" y="-45%" width="190%" height="210%"><feDropShadow dx="0" dy="1.1" stdDeviation="1.2" flood-color="#0A3E7A" flood-opacity="0.16"/></filter>
</defs>`;

/** Rahmen eines Motivs: weiche Grundfläche, darauf der Inhalt. */
const M = (k: string, alt: string, inner: string) =>
  `<svg width="150" height="110" viewBox="0 0 150 110" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${alt}">${defs(k)}` +
  `<rect x="0" y="0" width="150" height="110" rx="16" fill="url(#${k}p)"/>` +
  `<rect x="0.5" y="0.5" width="149" height="109" rx="15.5" fill="none" stroke="#DCE8F6"/>` +
  `<path d="M0 16 A16 16 0 0 1 16 0 H134 A16 16 0 0 1 150 16 V44 Q75 66 0 44 Z" fill="url(#${k}h)" opacity=".55"/>` +
  `${inner}</svg>`;

/** Weicher Bodenschatten unter einem Körper. */
const boden = (cx: number, cy: number, rx: number, ry = 3.2, o = 0.14) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#0A3E7A" opacity="${o}"/>`;

/**
 * Isometrischer Quader (2:1). fx,fy ist die vordere untere Ecke,
 * w die Breite nach links, d die Tiefe nach rechts, h die Höhe.
 */
function quader(
  k: string,
  fx: number,
  fy: number,
  w: number,
  d: number,
  h: number,
  opt: { links?: string; rechts?: string; oben?: string } = {},
) {
  const P = (x: number, y: number) => `${x.toFixed(1)} ${y.toFixed(1)}`;
  const lb = [fx - w, fy - w / 2];
  const rb = [fx + d, fy - d / 2];
  const bb = [fx - w + d, fy - w / 2 - d / 2];
  const ft = [fx, fy - h];
  const lt = [lb[0], lb[1] - h];
  const rt = [rb[0], rb[1] - h];
  const bt = [bb[0], bb[1] - h];
  const links = `<path d="M${P(fx, fy)} L${P(lb[0], lb[1])} L${P(lt[0], lt[1])} L${P(ft[0], ft[1])} Z" fill="${opt.links || `url(#${k}d)`}"/>`;
  const rechts = `<path d="M${P(fx, fy)} L${P(rb[0], rb[1])} L${P(rt[0], rt[1])} L${P(ft[0], ft[1])} Z" fill="${opt.rechts || `url(#${k}b)`}"/>`;
  const oben = `<path d="M${P(ft[0], ft[1])} L${P(lt[0], lt[1])} L${P(bt[0], bt[1])} L${P(rt[0], rt[1])} Z" fill="${opt.oben || `url(#${k}g)`}"/>`;
  return links + rechts + oben;
}

const txt = (
  x: number,
  y: number,
  s: number,
  t: string,
  opt: { w?: number; f?: string; a?: string } = {},
) =>
  `<text x="${x}" y="${y}" font-family="Helvetica, Arial, sans-serif" font-size="${s}" font-weight="${opt.w || 600}" fill="${opt.f || "#0F1621"}" text-anchor="${opt.a || "middle"}">${t}</text>`;

/** Person: Kopf und Schulterbogen. */
const figur = (k: string, x: number, y: number, s = 1, glanz = false) => {
  const f = glanz ? `url(#${k}g)` : `url(#${k}b)`;
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <path d="M-11 20 c0 -12 5 -17 11 -17 s11 5 11 17 z" fill="${f}"/>
    <circle cx="0" cy="-6" r="7.5" fill="${f}"/>
    <path d="M-4 -10 a7.5 7.5 0 0 1 9 1" stroke="#FFFFFF" stroke-opacity=".45" stroke-width="1.6" fill="none" stroke-linecap="round"/>
  </g>`;
};

/**
 * Ein Element, das gestaffelt einrastet. `i` ist seine Position in der Reihe.
 *
 * Wichtig: Nie auf ein Element setzen, das selbst ein `transform`-Attribut
 * trägt. Die CSS-Animation setzt `transform` und überschreibt das Attribut
 * damit vollständig; die fünf Personen der Zielgruppe standen so alle
 * übereinander in der linken oberen Ecke. In solchen Fällen eine Gruppe
 * darumlegen.
 */
const rasten = (i: number) => `class="mv-rasten" style="--i:${i}"`;

// ══════════════════ Die Motive, in der Reihenfolge der Ansichten ══════════

// 1 Ankommen: sieben Etappen auf einem Pfad, der sich zeichnet, die erste pulsiert.
const pfad = (() => {
  const pts: [number, number][] = [[18, 90], [37, 81], [56, 73], [75, 60], [94, 51], [113, 37], [133, 25]];
  const d = "M18 90 C29 88 27 84 37 81 C47 78 47 76 56 73 C67 69 65 64 75 60 C85 56 85 55 94 51 C105 47 103 42 113 37 C123 32 124 30 133 25";
  const punkte = pts.map(([x, y], i) => {
    if (i === 0) {
      return `<circle class="mv-puls" cx="${x}" cy="${y}" r="12" fill="#0A6EDB" opacity=".13"/><circle cx="${x}" cy="${y}" r="8" fill="url(#Ag)" filter="url(#At)"/><circle cx="${x - 2}" cy="${y - 2.5}" r="2.4" fill="#FFFFFF" opacity=".7"/>`;
    }
    if (i === 6) {
      return `<g ${rasten(6)}><circle cx="${x}" cy="${y}" r="7" fill="url(#Ag)" filter="url(#At)"/><path d="M${x - 3} ${y} l2.2 2.4 l4 -5" stroke="#FFFFFF" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>`;
    }
    return `<g ${rasten(i)}><circle cx="${x}" cy="${y}" r="5.2" fill="#FFFFFF" filter="url(#At)"/><circle cx="${x}" cy="${y}" r="5.2" fill="none" stroke="#7CBEFF" stroke-width="1.8"/></g>`;
  }).join("");
  return M("A", "Sieben Etappen auf einem Pfad, die erste leuchtet",
    `<path d="${d}" stroke="url(#Ag)" stroke-width="11" stroke-linecap="round" fill="none" opacity=".22"/>
     <path class="mv-zeichnet" d="${d}" stroke="url(#Ag)" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="5 5" fill="none"/>
     ${punkte}`);
})();

// 2 Wer wir sind: drei gestapelte Zielkarten, die oberste hebt sich.
const zielkarten = M("B", "Drei gestapelte Zielkarten, die oberste hebt sich",
  `${boden(75, 98, 46, 4, 0.1)}
   <rect x="30" y="62" width="90" height="30" rx="9" fill="#CFE3F8"/>
   <rect x="25" y="50" width="100" height="32" rx="10" fill="url(#Bw)" stroke="#D6E6F7"/>
   <rect x="30" y="58" width="26" height="3.4" rx="1.7" fill="#B9D4F0"/>
   <rect x="30" y="65" width="46" height="3.4" rx="1.7" fill="#D3E4F5"/>
   <g class="mv-hebt" filter="url(#Bs)">
     <rect x="18" y="20" width="114" height="42" rx="12" fill="url(#Bg)"/>
     <path d="M18 32 A12 12 0 0 1 30 20 H120 A12 12 0 0 1 132 32 V38 Q75 52 18 38 Z" fill="#FFFFFF" opacity=".22"/>
     ${txt(38, 47, 17, "%", { f: "#FFFFFF", w: 700 })}
     <path d="M60 44 l7 -8 l6 5 l9 -12" stroke="#FFFFFF" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
     <path d="M82 29 l3 0 l0 3" stroke="#FFFFFF" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
     <circle cx="108" cy="41" r="10" fill="#FFFFFF" opacity=".28"/>
     ${txt(108, 46, 14, "+", { f: "#FFFFFF", w: 700 })}
   </g>`);

// 3 Zielgruppe: fünf Personen, die nacheinander erscheinen und leicht schweben.
const personen = (() => {
  const p: [number, number, number][] = [[24, 74, 1.0], [51, 66, 1.12], [78, 72, 1.0], [104, 64, 1.12], [129, 73, 0.95]];
  const zeichen = [
    `<rect x="-5" y="-1" width="10" height="7" rx="1.6" fill="#FFFFFF" opacity=".85"/><path d="M-2.5 -1 v-2 h5 v2" stroke="#FFFFFF" stroke-opacity=".85" stroke-width="1.3" fill="none"/>`,
    `<path d="M-4 -3 v3 a4 4 0 0 0 8 0 v-3" stroke="#FFFFFF" stroke-opacity=".9" stroke-width="1.5" fill="none" stroke-linecap="round"/><circle cx="4.5" cy="3.5" r="2.2" fill="#FFFFFF" opacity=".9"/>`,
    `<path d="M0 -4 l-4.5 8 M0 -4 l4.5 8" stroke="#FFFFFF" stroke-opacity=".9" stroke-width="1.5" stroke-linecap="round"/><circle cx="0" cy="-4.6" r="1.5" fill="#FFFFFF" opacity=".9"/>`,
    `<path d="M-4 -3 h8 v6 h-8 z" fill="#FFFFFF" opacity=".85"/><path d="M-6 4 h12" stroke="#FFFFFF" stroke-opacity=".85" stroke-width="1.6" stroke-linecap="round"/>`,
    `<path d="M0 -4 l2.6 2.2 l-2.6 6.5 l-2.6 -6.5 z" fill="#FFFFFF" opacity=".85"/>`,
  ];
  const g = p.map(([x, y, s], i) => `${boden(x, 94, 12 * s, 3, 0.1)}
    <g ${rasten(i)}><g transform="translate(${x} ${y}) scale(${s})">
      <circle cx="0" cy="0" r="15" fill="${i % 2 ? `url(#Cg)` : `url(#Cb)`}" filter="url(#Ct)"/>
      <path d="M-15 0 A15 15 0 0 1 0 -15 A15 15 0 0 1 8 -12 Q -4 -8 -11 6 Z" fill="#FFFFFF" opacity=".18"/>
      ${zeichen[i]}
    </g></g>`).join("");
  return M("C", "Fünf Personen als Kreise mit Berufszeichen", g);
})();

// 4 Immobilien-Typen: drei isometrische Häuser, das Portal wird durchgestrichen.
const haeuser = M("D", "Drei isometrische Häuser, darüber ein durchgestrichenes Portalsymbol",
  `${boden(75, 99, 56, 5, 0.09)}
   <g ${rasten(0)}>${quader("D", 40, 92, 20, 20, 22)}
   <rect x="26" y="76" width="4" height="5" rx="1" fill="#FFFFFF" opacity=".6"/>
   <rect x="34" y="80" width="4" height="5" rx="1" fill="#FFFFFF" opacity=".6"/></g>
   <g ${rasten(1)}>${quader("D", 78, 96, 22, 22, 40)}
   <rect x="62" y="66" width="4.4" height="5.4" rx="1" fill="#FFFFFF" opacity=".62"/>
   <rect x="70" y="70" width="4.4" height="5.4" rx="1" fill="#FFFFFF" opacity=".62"/>
   <rect x="62" y="78" width="4.4" height="5.4" rx="1" fill="#FFFFFF" opacity=".62"/>
   <rect x="70" y="82" width="4.4" height="5.4" rx="1" fill="#FFFFFF" opacity=".62"/></g>
   <g ${rasten(2)}>${quader("D", 122, 92, 18, 16, 28)}
   <rect x="110" y="72" width="4" height="5" rx="1" fill="#FFFFFF" opacity=".6"/>
   <rect x="110" y="81" width="4" height="5" rx="1" fill="#FFFFFF" opacity=".6"/></g>
   <g filter="url(#Dt)">
     <rect x="46" y="12" width="58" height="30" rx="7" fill="#FFFFFF" stroke="#D6E6F7"/>
     <path d="M46 20 A7 7 0 0 1 53 12 H97 A7 7 0 0 1 104 20 V22 H46 Z" fill="#DCEAF9"/>
     <circle cx="52" cy="17" r="1.6" fill="#A9C9EA"/><circle cx="57" cy="17" r="1.6" fill="#A9C9EA"/>
     <rect x="52" y="28" width="30" height="3" rx="1.5" fill="#CFE0F3"/>
     <rect x="52" y="34" width="20" height="3" rx="1.5" fill="#E0EBF7"/>
   </g>
   <path class="mv-streicht" d="M40 47 L110 7" stroke="url(#Dg)" stroke-width="4.5" stroke-linecap="round"/>`);

// 5 Die Weiche: fünf Wege aus einem Punkt, die sich rechts wieder treffen.
const wege = (() => {
  const bahn = (dy: number, aktiv: boolean) =>
    `<path d="M24 55 C56 55 52 ${55 + dy} 75 ${55 + dy} C98 ${55 + dy} 94 55 126 55" fill="none" stroke="${aktiv ? "url(#Eg)" : "#B7D5F2"}" stroke-width="${aktiv ? 5 : 2.4}" stroke-linecap="round"/>`;
  return M("E", "Fünf Wege, die aus einem Punkt auseinanderlaufen und sich wieder treffen",
    `${bahn(-34, false)}<g class="mv-leuchtet">${bahn(-17, true)}</g>${bahn(0, false)}${bahn(17, false)}${bahn(34, false)}
     <circle class="mv-puls" cx="24" cy="55" r="12" fill="#0A6EDB" opacity=".12"/>
     <circle cx="24" cy="55" r="8" fill="url(#Eg)" filter="url(#Et)"/>
     <circle cx="126" cy="55" r="12" fill="#0A6EDB" opacity=".12"/>
     <circle cx="126" cy="55" r="8" fill="url(#Eg)" filter="url(#Et)"/>
     <circle cx="75" cy="38" r="6.5" fill="#FFFFFF" filter="url(#Et)"/>
     <path d="M72 38 l2.2 2.4 l4.2 -5.2" stroke="#0A6EDB" stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);
})();

// Abschlusszähler mit steigenden Balken.
const zaehler = M("F", "Abschlusszähler mit steigenden Balken",
  `${boden(75, 98, 44, 4, 0.1)}
   <g filter="url(#Fs)"><rect x="20" y="20" width="110" height="70" rx="13" fill="url(#Fw)" stroke="#DCE8F6"/></g>
   <rect x="30" y="30" width="42" height="4" rx="2" fill="#CFE0F3"/>
   ${txt(51, 66, 30, "10", { f: "#0A5BB5", w: 700 })}
   <rect x="30" y="74" width="42" height="3.4" rx="1.7" fill="#E1ECF8"/>
   <g ${rasten(0)}><rect x="84" y="62" width="10" height="18" rx="3" fill="#BFDBF7"/></g>
   <g ${rasten(1)}><rect x="99" y="50" width="10" height="30" rx="3" fill="#7CBEFF"/></g>
   <g ${rasten(2)}><rect x="114" y="36" width="10" height="44" rx="3" fill="url(#Fg)"/></g>
   <path class="mv-zeichnet" d="M84 44 l14 -8 l12 -7 l14 -9" stroke="#0A6EDB" stroke-width="2" fill="none" stroke-linecap="round" stroke-dasharray="4 4" opacity=".55"/>`);

// Sanduhr, der Sand rieselt.
const sanduhr = M("G", "Sanduhr, der Sand rieselt nach unten",
  `${boden(75, 98, 30, 4, 0.11)}
   <rect x="46" y="16" width="58" height="6" rx="3" fill="url(#Gb)"/>
   <rect x="46" y="88" width="58" height="6" rx="3" fill="url(#Gb)"/>
   <g filter="url(#Gt)">
     <path d="M53 22 h44 c0 16 -17 22 -17 33 s17 17 17 33 h-44 c0 -16 17 -18 17 -33 s-17 -17 -17 -33 z" fill="#FFFFFF" opacity=".9" stroke="#CFE0F3"/>
   </g>
   <path d="M56 25 h38 c0 11 -13 16 -16 24 h-6 c-3 -8 -16 -13 -16 -24 z" fill="url(#Gg)"/>
   <path d="M60 85 h34 c0 -9 -11 -13 -14 -19 h-6 c-3 6 -14 10 -14 19 z" fill="url(#Gg)" opacity=".85"/>
   <path class="mv-rieselt" d="M75 56 v20" stroke="#3E8EF0" stroke-width="2" stroke-linecap="round" stroke-dasharray="2 4"/>
   <circle cx="75" cy="80" r="2" fill="#3E8EF0"/>`);

// Beratungstisch: zwei Figuren an einem isometrischen Tisch.
const beratungstisch = M("H", "Zwei Figuren an einem isometrischen Beratungstisch",
  `${boden(75, 99, 50, 5, 0.1)}
   ${figur("H", 30, 52, 1.05)}
   ${figur("H", 120, 52, 1.05, true)}
   <g filter="url(#Ht)">
     <path d="M75 92 L36 72 L75 52 L114 72 Z" fill="url(#Hw)" stroke="#D6E6F7"/>
     <path d="M36 72 L36 77 L75 97 L114 77 L114 72 L75 92 Z" fill="#C7DEF6"/>
   </g>
   <path d="M75 66 L58 74 L70 80 L87 72 Z" fill="url(#Hg)"/>
   <path d="M64 73 l8 4 M70 70 l8 4" stroke="#FFFFFF" stroke-opacity=".6" stroke-width="1.3" stroke-linecap="round"/>
   <g class="mv-hakt"><circle cx="96" cy="74" r="5" fill="#FFFFFF" opacity=".9"/>
   <path d="M93.5 74 l1.8 2 l3.4 -4" stroke="#0A6EDB" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>`);

// Fächer aus vier Beratungskarten.
const faecher = M("I", "Ein Fächer aus vier Beratungskarten",
  `${boden(75, 98, 40, 4, 0.1)}
   <g ${rasten(0)}><g transform="rotate(-24 75 96)"><rect x="58" y="30" width="34" height="60" rx="8" fill="#CFE3F8" filter="url(#It)"/></g></g>
   <g ${rasten(1)}><g transform="rotate(-8 75 96)"><rect x="58" y="26" width="34" height="64" rx="8" fill="#9CC9F3" filter="url(#It)"/></g></g>
   <g ${rasten(2)}><g transform="rotate(8 75 96)"><rect x="58" y="26" width="34" height="64" rx="8" fill="#5FAEF6" filter="url(#It)"/></g></g>
   <g ${rasten(3)}><g transform="rotate(24 75 96)" filter="url(#Is)">
     <rect x="58" y="22" width="34" height="68" rx="8" fill="url(#Ig)"/>
     <rect x="64" y="32" width="22" height="3.2" rx="1.6" fill="#FFFFFF" opacity=".7"/>
     <rect x="64" y="39" width="16" height="3.2" rx="1.6" fill="#FFFFFF" opacity=".45"/>
     <circle cx="75" cy="56" r="8" fill="#FFFFFF" opacity=".3"/>
     <path d="M71.5 56 l2.4 2.6 l5 -6" stroke="#FFFFFF" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
   </g></g>`);

// Netz: Punkte, die sich verbinden.
const netz = (() => {
  const n: [number, number][] = [[26, 30], [124, 26], [20, 82], [128, 84], [75, 16], [75, 96]];
  const linien = n.map(([x, y]) => `<path class="mv-zeichnet" d="M75 56 L${x} ${y}" stroke="#A8CBEE" stroke-width="1.8" stroke-linecap="round"/>`).join("")
    + `<path d="M26 30 L75 16 L124 26" stroke="#CBE0F5" stroke-width="1.4" fill="none"/>`
    + `<path d="M20 82 L75 96 L128 84" stroke="#CBE0F5" stroke-width="1.4" fill="none"/>`;
  const knoten = n.map(([x, y], i) => `<g ${rasten(i)}><circle cx="${x}" cy="${y}" r="7" fill="#FFFFFF" filter="url(#Jt)"/><circle cx="${x}" cy="${y}" r="7" fill="none" stroke="${i < 3 ? "#0A6EDB" : "#7CBEFF"}" stroke-width="2"/></g>`).join("");
  return M("J", "Ein Netz aus Punkten, das sich verbindet",
    `${linien}${knoten}
     <circle class="mv-puls" cx="75" cy="56" r="16" fill="#0A6EDB" opacity=".12"/>
     <circle cx="75" cy="56" r="11.5" fill="url(#Jg)" filter="url(#Jt)"/>
     <circle cx="71" cy="52" r="3.2" fill="#FFFFFF" opacity=".55"/>`);
})();

// Zwei Produktkarten, die ineinandergreifen.
const produktkarten = M("K", "Zwei Produktkarten, die ineinandergreifen",
  `${boden(75, 98, 46, 4, 0.1)}
   <g ${rasten(0)} filter="url(#Ks)">
     <rect x="14" y="26" width="66" height="58" rx="11" fill="url(#Kw)" stroke="#DCE8F6"/>
   </g>
   <g ${rasten(0)}>
     <path d="M32 60 V46 l15 -11 l15 11 v14 z" fill="url(#Kg)"/>
     <rect x="42" y="50" width="10" height="10" rx="1.5" fill="#FFFFFF" opacity=".55"/>
     <rect x="26" y="68" width="42" height="3.4" rx="1.7" fill="#DDE9F6"/>
     <rect x="26" y="75" width="28" height="3.4" rx="1.7" fill="#E9F1FA"/>
   </g>
   <g ${rasten(2)}>
     <g filter="url(#Ks)">
       <rect x="70" y="34" width="66" height="58" rx="11" fill="url(#Kg)"/>
       <path d="M70 45 A11 11 0 0 1 81 34 H125 A11 11 0 0 1 136 45 V52 Q103 66 70 52 Z" fill="#FFFFFF" opacity=".22"/>
     </g>
     <path d="M103 48 c-9 0 -14 6 -14 13 c0 9 8 14 14 19 c6 -5 14 -10 14 -19 c0 -7 -5 -13 -14 -13 z" fill="#FFFFFF" opacity=".72"/>
     <rect x="82" y="82" width="30" height="3.4" rx="1.7" fill="#FFFFFF" opacity=".5"/>
   </g>
   <path d="M74 62 h6 a5.5 5.5 0 0 1 0 11 h-6" stroke="#0A5BB5" stroke-width="2.4" fill="none" stroke-linecap="round"/>`);

// Ein Aktenkoffer mit Anhänger.
const koffer = M("L", "Ein Aktenkoffer mit Anhänger",
  `${boden(75, 98, 42, 4.4, 0.12)}
   <path d="M62 34 v-6 a5 5 0 0 1 5 -5 h16 a5 5 0 0 1 5 5 v6" stroke="url(#Lb)" stroke-width="4" fill="none" stroke-linecap="round"/>
   <g filter="url(#Ls)">
     <rect x="22" y="34" width="106" height="54" rx="10" fill="url(#Lg)"/>
     <path d="M22 44 A10 10 0 0 1 32 34 H118 A10 10 0 0 1 128 44 V52 Q75 68 22 52 Z" fill="#FFFFFF" opacity=".2"/>
   </g>
   <rect x="62" y="54" width="26" height="12" rx="3" fill="#FFFFFF" opacity=".82"/>
   <rect x="68" y="58" width="14" height="4" rx="2" fill="#0A6EDB" opacity=".45"/>
   <path d="M22 62 h106" stroke="#FFFFFF" stroke-opacity=".35" stroke-width="1.4"/>
   <g class="mv-schwingt" filter="url(#Lt)">
     <path d="M104 78 l14 -6 l10 10 l-14 6 z" fill="#FFFFFF"/>
     <circle cx="112" cy="79" r="2" fill="#7CBEFF"/>
   </g>`);

// Rohbau mit Kran.
const baustelle = M("N", "Ein Rohbau mit Kran",
  `${boden(78, 99, 52, 5, 0.09)}
   <path d="M118 96 V22 h4 V96 z" fill="url(#Nb)"/>
   <g class="mv-kran">
     <rect x="56" y="23.5" width="66" height="5" rx="2.5" fill="#2E8AE8"/>
     <path d="M120 26 L134 40" stroke="#7CBEFF" stroke-width="2.4" stroke-linecap="round"/>
     <path d="M76 26 v18" stroke="#0A5BB5" stroke-width="1.8"/>
     <rect x="69" y="44" width="15" height="13" rx="2.5" fill="url(#Ng)"/>
   </g>
   ${quader("N", 52, 92, 22, 20, 34)}
   <path d="M30 82 h44 M30 72 h44" stroke="#FFFFFF" stroke-opacity=".38" stroke-width="1.6"/>
   <path d="M52 92 v-34" stroke="#FFFFFF" stroke-opacity=".3" stroke-width="1.6"/>
   <path d="M96 96 l10 -22 h9 l-10 22 z" fill="#CFE3F8"/>
   <path d="M20 96 h116" stroke="#B7D5F2" stroke-width="2" stroke-linecap="round"/>`);

// Eine Schranke, die sich hebt.
const bremse = M("O", "Eine Schranke, die sich hebt",
  `<path d="M14 92 C50 92 60 78 96 78 C120 78 130 74 138 70" stroke="#C6DDF5" stroke-width="10" fill="none" stroke-linecap="round"/>
   <path class="mv-zeichnet" d="M14 92 C50 92 60 78 96 78 C120 78 130 74 138 70" stroke="#FFFFFF" stroke-width="2" fill="none" stroke-dasharray="6 8" stroke-linecap="round"/>
   ${boden(38, 96, 16, 3.6, 0.12)}
   <rect x="32" y="46" width="10" height="48" rx="4" fill="url(#Ob)"/>
   <g class="mv-schranke" filter="url(#Ot)">
     <rect x="38" y="46" width="86" height="11" rx="5" fill="url(#Og)"/>
     <path d="M52 46 l-8 11 M70 46 l-8 11 M88 46 l-8 11 M106 46 l-8 11" stroke="#FFFFFF" stroke-opacity=".65" stroke-width="4"/>
   </g>
   <circle cx="37" cy="49" r="4.5" fill="#FFFFFF" stroke="#7CBEFF" stroke-width="2"/>
   <path d="M112 22 a8 8 0 1 1 8 8 v4" stroke="#7CBEFF" stroke-width="3" fill="none" stroke-linecap="round"/>
   <circle cx="120" cy="40" r="2.2" fill="#7CBEFF"/>`);

// Ein Kompass, dessen Nadel einrastet.
const kompass = M("P", "Ein Kompass, dessen Nadel einrastet",
  `${boden(75, 98, 34, 4, 0.11)}
   <circle cx="75" cy="54" r="42" fill="#0A6EDB" opacity=".08"/>
   <g filter="url(#Ps)"><circle cx="75" cy="54" r="34" fill="url(#Pw)" stroke="#D6E6F7"/></g>
   <circle cx="75" cy="54" r="27" fill="none" stroke="#D9E8F7" stroke-width="1.4" stroke-dasharray="2 5"/>
   ${["0", "90", "180", "270"].map((a) => `<path d="M75 22 v6" stroke="#A8CBEE" stroke-width="2" stroke-linecap="round" transform="rotate(${a} 75 54)"/>`).join("")}
   <g class="mv-nadel">
     <path d="M75 54 L96 32 L84 60 Z" fill="url(#Pg)"/>
     <path d="M75 54 L54 76 L66 48 Z" fill="#C7DEF6"/>
   </g>
   <circle cx="75" cy="54" r="4.4" fill="#FFFFFF" stroke="#0A6EDB" stroke-width="2"/>
   <path class="mv-funkelt" d="M112 20 l2.6 5.6 l6 0.8 l-4.4 4.2 l1.1 6 l-5.3 -2.9 l-5.3 2.9 l1.1 -6 l-4.4 -4.2 l6 -0.8 z" fill="url(#Pg)"/>`);

// Eine Waage, die sich einpendelt.
const waage = M("Q", "Eine Waage, die sich einpendelt",
  `${boden(75, 99, 34, 4.5, 0.12)}
   <rect x="60" y="93" width="30" height="5" rx="2.5" fill="#0A5BB5"/>
   <rect x="71" y="32" width="8" height="62" rx="3" fill="#1A78DD"/>
   <g class="mv-pendelt">
     <rect x="26" y="29.5" width="98" height="5.5" rx="2.75" fill="#2E8AE8"/>
     <rect x="31" y="33" width="2" height="10" fill="#A8CBEE"/>
     <rect x="117" y="33" width="2" height="10" fill="#A8CBEE"/>
     <g filter="url(#Qt)"><path d="M16 42 h32 l-8 16 h-16 z" fill="url(#Qw)" stroke="#D6E6F7"/></g>
     <g filter="url(#Qt)"><path d="M102 42 h32 l-8 16 h-16 z" fill="url(#Qw)" stroke="#D6E6F7"/></g>
   </g>
   <g class="mv-hakt"><circle cx="75" cy="30" r="7.5" fill="url(#Qg)" filter="url(#Qt)"/>
   <path d="M71.5 30 l2.4 2.6 l4.6 -5.4" stroke="#FFFFFF" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>`);

// Ein aufgeschlagenes Buch, in dem geblättert wird.
const buch = M("R", "Ein aufgeschlagenes Buch, in dem geblättert wird",
  `${boden(75, 96, 50, 5, 0.11)}
   <g filter="url(#Rs)">
     <path d="M75 34 C62 24 40 24 22 30 v52 c18 -6 40 -6 53 4 z" fill="url(#Rw)" stroke="#D9E7F6"/>
     <path d="M75 34 C88 24 110 24 128 30 v52 c-18 -6 -40 -6 -53 4 z" fill="url(#Rg)"/>
   </g>
   <path d="M30 42 h34 M30 50 h34 M30 58 h28 M30 66 h34" stroke="#CDDFF2" stroke-width="2.4" stroke-linecap="round"/>
   <path d="M86 42 h34 M86 50 h30 M86 58 h34 M86 66 h22" stroke="#FFFFFF" stroke-opacity=".6" stroke-width="2.4" stroke-linecap="round"/>
   <path d="M75 34 v52" stroke="#B7D5F2" stroke-width="2"/>
   <path class="mv-blaettert" d="M75 34 C90 28 104 30 112 34 c-10 12 -22 26 -37 38 z" fill="#FFFFFF" opacity=".55"/>`);

// Der Staffelstab wandert von links nach rechts.
const staffelstab = M("S", "Zwei Figuren, ein Staffelstab wandert von links nach rechts",
  `${boden(34, 98, 18, 4, 0.11)}${boden(116, 98, 18, 4, 0.11)}
   ${figur("S", 34, 74, 1.5)}
   ${figur("S", 116, 74, 1.5, true)}
   <path d="M48 54 C70 40 82 40 104 54" stroke="#B7D5F2" stroke-width="2" fill="none" stroke-dasharray="4 5"/>
   <g class="mv-staffel">
     <g transform="rotate(-16 75 46)" filter="url(#St)">
       <rect x="55" y="41" width="40" height="10" rx="5" fill="url(#Sg)"/>
       <rect x="60" y="43.6" width="12" height="4.8" rx="2.4" fill="#FFFFFF" opacity=".55"/>
     </g>
   </g>
   <path d="M100 46 l7 5 l-7 5" stroke="#0A6EDB" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);

// Die Werkzeugwand, deren zehn Felder nacheinander einrasten.
const werkzeugwand = (() => {
  const felder: string[] = [];
  for (let r = 0; r < 2; r++) {
    for (let s = 0; s < 5; s++) {
      const x = 16 + s * 24.4;
      const y = 26 + r * 32;
      const i = r * 5 + s;
      felder.push(`<g ${rasten(i)}><g filter="url(#Tt)"><rect x="${x}" y="${y}" width="20" height="26" rx="5" fill="url(#Tg)"/></g>
        <path d="M${x + 6} ${y + 13} l3 3.4 l5.4 -6.6" stroke="#FFFFFF" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>`);
    }
  }
  return M("T", "Eine Werkzeugwand, deren zehn Felder nacheinander einrasten",
    `<rect x="8" y="16" width="134" height="80" rx="12" fill="#FFFFFF" opacity=".55" stroke="#DCE8F6"/>
     ${Array.from({ length: 9 }, (_, i) => `<path d="M${16 + i * 15} 20 v72" stroke="#EAF1FA" stroke-width="1"/>`).join("")}
     ${felder.join("")}`);
})();

// Drei Uhren, deren Zeiger unterschiedlich schnell laufen, darunter fällt eine Münze.
const uhren = (() => {
  const uhr = (x: number, klasse: string) => `<g filter="url(#Ut)"><circle cx="${x}" cy="40" r="17" fill="url(#Uw)" stroke="#D6E6F7"/></g>
    <circle cx="${x}" cy="40" r="12.5" fill="none" stroke="#E3EDF8" stroke-width="1.2"/>
    <path d="M${x} 40 V30" stroke="#0A5BB5" stroke-width="2.4" stroke-linecap="round"/>
    <g class="${klasse}" style="transform-origin:${x}px 40px"><path d="M${x} 40 V26" stroke="url(#Ug)" stroke-width="2.8" stroke-linecap="round"/></g>
    <circle cx="${x}" cy="40" r="2.4" fill="#0A6EDB"/>`;
  return M("U", "Drei Uhren, darunter fällt eine Münze",
    `<path d="M14 40 H136" stroke="#DCE8F6" stroke-width="2" stroke-dasharray="4 5"/>
     ${uhr(30, "mv-uhr1")}${uhr(75, "mv-uhr2")}${uhr(120, "mv-uhr3")}
     ${boden(75, 98, 22, 3.6, 0.12)}
     <path d="M75 62 v14" stroke="#B7D5F2" stroke-width="2" stroke-dasharray="3 4" stroke-linecap="round"/>
     <g class="mv-muenze"><g filter="url(#Ut)"><ellipse cx="75" cy="86" rx="19" ry="8" fill="url(#Ug)"/><ellipse cx="75" cy="83.5" rx="19" ry="8" fill="#9BCBFA"/><ellipse cx="75" cy="83.5" rx="12" ry="5" fill="#FFFFFF" opacity=".35"/></g>
     ${txt(75, 87, 9, "€", { f: "#0A5BB5", w: 700 })}</g>`);
})();

// Ein Wochenraster, in dem Stunden aufgefüllt werden.
const wochenraster = (() => {
  const zellen: string[] = [];
  const voll: [number, number][] = [[0, 2], [0, 3], [1, 1], [1, 2], [1, 3], [2, 2], [3, 1], [3, 2], [3, 3], [4, 3]];
  let n = 0;
  for (let s = 0; s < 5; s++) {
    for (let r = 0; r < 4; r++) {
      const x = 18 + s * 23.6;
      const y = 36 + r * 15;
      const an = voll.some(([a, b]) => a === s && b === r);
      zellen.push(an
        ? `<rect ${rasten(n++)} x="${x}" y="${y}" width="19" height="11.5" rx="3.5" fill="url(#Vg)"/>`
        : `<rect x="${x}" y="${y}" width="19" height="11.5" rx="3.5" fill="#FFFFFF" stroke="#E1EBF6"/>`);
    }
  }
  return M("V", "Ein Wochenraster, in dem Stunden aufgefüllt werden",
    `<g filter="url(#Vt)"><rect x="10" y="16" width="130" height="84" rx="12" fill="url(#Vw)" stroke="#DCE8F6"/></g>
     ${["Mo", "Di", "Mi", "Do", "Fr"].map((d, i) => txt(27.5 + i * 23.6, 30, 8, d, { f: "#7E93AB", w: 600 })).join("")}
     ${zellen.join("")}`);
})();

// Ein Kalenderblatt, das umblättert.
const kalenderblatt = M("W", "Ein Kalenderblatt, das umblättert",
  `${boden(75, 99, 46, 4.4, 0.1)}
   <g filter="url(#Ws)"><rect x="20" y="22" width="110" height="74" rx="12" fill="url(#Ww)" stroke="#DCE8F6"/></g>
   <path d="M20 34 A12 12 0 0 1 32 22 H118 A12 12 0 0 1 130 34 V42 H20 Z" fill="url(#Wg)"/>
   <rect x="42" y="14" width="7" height="16" rx="3.5" fill="#0A5BB5"/>
   <rect x="101" y="14" width="7" height="16" rx="3.5" fill="#0A5BB5"/>
   ${[0, 1, 2].map((r) => [0, 1, 2, 3, 4].map((s) => {
    const x = 30 + s * 19.4;
    const y = 50 + r * 15;
    const jetzt = r === 1 && s === 2;
    return jetzt
      ? `<rect class="mv-hakt" x="${x}" y="${y}" width="14" height="11" rx="3.5" fill="url(#Wg)"/>`
      : `<rect x="${x}" y="${y}" width="14" height="11" rx="3.5" fill="#D7E6F7"/>`;
  }).join("")).join("")}
   <g class="mv-blaettert">
     <path d="M118 96 C136 88 138 60 130 40 l0 44 a12 12 0 0 1 -12 12 z" fill="#FFFFFF" stroke="#D6E6F7"/>
     <path d="M130 40 C142 62 136 86 118 96" stroke="#B7D5F2" stroke-width="1.6" fill="none"/>
   </g>`);

// Ein Dokument mit Siegel, das aufgedrückt wird.
const siegel = M("X", "Ein Dokument mit Siegel, das aufgedrückt wird",
  `${boden(70, 99, 40, 4.4, 0.1)}
   <g filter="url(#Xs)">
     <path d="M28 16 h56 l24 24 v56 a6 6 0 0 1 -6 6 H34 a6 6 0 0 1 -6 -6 z" fill="url(#Xw)" stroke="#DCE8F6"/>
     <path d="M84 16 l24 24 h-24 z" fill="#D3E4F6"/>
   </g>
   <path d="M40 46 h34 M40 55 h44 M40 64 h30" stroke="#D3E2F1" stroke-width="3" stroke-linecap="round"/>
   <g class="mv-siegel" filter="url(#Xs)">
     <circle cx="98" cy="76" r="19" fill="url(#Xg)"/>
     <circle cx="98" cy="76" r="13" fill="none" stroke="#FFFFFF" stroke-opacity=".55" stroke-width="1.6" stroke-dasharray="3 3"/>
     <path d="M92 76 l4 4.4 l8 -9.4" stroke="#FFFFFF" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
   </g>
   <path d="M98 44 v10" stroke="#B7D5F2" stroke-width="2" stroke-dasharray="3 4" stroke-linecap="round"/>`);

// Sprechblasen, die aufsteigen.
const sprechblasen = M("Y", "Sprechblasen, die aufsteigen",
  `<g ${rasten(0)} filter="url(#Yt)">
     <path d="M14 62 h52 a9 9 0 0 1 9 9 v14 a9 9 0 0 1 -9 9 h-32 l-11 8 v-8 h-9 a9 9 0 0 1 -9 -9 v-14 a9 9 0 0 1 9 -9 z" fill="url(#Yw)" stroke="#DCE8F6"/>
     <path d="M22 72 h34 M22 80 h22" stroke="#CFDFF0" stroke-width="3" stroke-linecap="round"/>
   </g>
   <g ${rasten(2)}>
     <g filter="url(#Ys)">
       <path d="M136 20 h-52 a9 9 0 0 0 -9 9 v14 a9 9 0 0 0 9 9 h32 l11 8 v-8 h9 a9 9 0 0 0 9 -9 v-14 a9 9 0 0 0 -9 -9 z" fill="url(#Yg)"/>
     </g>
     <path d="M88 30 h38 M88 38 h26" stroke="#FFFFFF" stroke-opacity=".62" stroke-width="3" stroke-linecap="round"/>
   </g>
   <circle class="mv-steigt" cx="120" cy="72" r="6" fill="#BFDBF7"/><circle class="mv-steigt" cx="134" cy="86" r="4" fill="#D8E9F9"/>`);

// Eine Liste, die sich selbst abhakt.
const abhakliste = (() => {
  const zeilen = [0, 1, 2, 3].map((i) => {
    const y = 28 + i * 19;
    return `<g filter="url(#Zt)"><rect x="18" y="${y}" width="114" height="15" rx="6" fill="#FFFFFF" stroke="#E4EDF7"/></g>
      <circle cx="29" cy="${y + 7.5}" r="5.6" fill="#FFFFFF" stroke="#C3DAF2" stroke-width="1.8"/>
      <g ${rasten(i)}><circle cx="29" cy="${y + 7.5}" r="5.6" fill="url(#Zg)"/><path d="M26.4 ${y + 7.4} l2 2.2 l3.8 -4.4" stroke="#FFFFFF" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>
      <rect x="40" y="${y + 4}" width="${[56, 72, 48, 64][i]}" height="3.4" rx="1.7" fill="#CBDEF2"/>
      <rect x="40" y="${y + 10}" width="${[34, 28, 40, 30][i]}" height="2.6" rx="1.3" fill="#EAF1F9"/>`;
  }).join("");
  return M("Z", "Eine Liste, die sich selbst abhakt", zeilen);
})();

// Zwei Bildschirme, die sich verbinden.
const bildschirme = M("aa", "Zwei Bildschirme, die sich verbinden",
  `${boden(38, 96, 24, 4, 0.1)}${boden(112, 96, 24, 4, 0.1)}
   <g filter="url(#aat)">
     <rect x="8" y="26" width="60" height="44" rx="8" fill="url(#aaw)" stroke="#DCE8F6"/>
     <rect x="32" y="70" width="12" height="8" fill="#D3E4F6"/><rect x="24" y="78" width="28" height="4" rx="2" fill="#C3DAF2"/>
   </g>
   ${figur("aa", 38, 52, 0.8)}
   <g filter="url(#aas)">
     <rect x="82" y="26" width="60" height="44" rx="8" fill="url(#aag)"/>
     <rect x="106" y="70" width="12" height="8" fill="#9BCBFA"/><rect x="98" y="78" width="28" height="4" rx="2" fill="#8CC2F8"/>
   </g>
   <g transform="translate(112 52)"><path d="M-11 20 c0 -12 5 -17 11 -17 s11 5 11 17 z" fill="#FFFFFF" opacity=".85"/><circle cx="0" cy="-6" r="7.5" fill="#FFFFFF" opacity=".85"/></g>
   <path class="mv-rieselt" d="M68 48 h14" stroke="#7CBEFF" stroke-width="3" stroke-linecap="round" stroke-dasharray="1 6"/>
   <g class="mv-hakt"><circle cx="75" cy="48" r="8" fill="#FFFFFF" filter="url(#aat)"/>
   <path d="M71.5 48 l2.4 2.6 l5 -6" stroke="#0A6EDB" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>`);

// Ein Monatskalender mit hervorgehobenen buchbaren Tagen.
const monat = (() => {
  const zellen: string[] = [];
  const frei = [3, 4, 8, 10, 11, 15, 17, 18, 19, 22, 24];
  let n = 0;
  for (let i = 0; i < 25; i++) {
    const s = i % 5;
    const r = Math.floor(i / 5);
    const x = 24 + s * 21;
    const y = 44 + r * 12;
    zellen.push(frei.includes(i)
      ? `<rect ${rasten(n++)} x="${x}" y="${y}" width="16" height="9" rx="3" fill="url(#bbg)"/>`
      : `<rect x="${x}" y="${y}" width="16" height="9" rx="3" fill="#EDF3FA"/>`);
  }
  return M("bb", "Ein Monatskalender mit hervorgehobenen buchbaren Tagen",
    `<g filter="url(#bbs)"><rect x="12" y="16" width="126" height="80" rx="12" fill="url(#bbw)" stroke="#DCE8F6"/></g>
     <rect x="24" y="26" width="42" height="5" rx="2.5" fill="#C6DBF2"/>
     <circle cx="118" cy="28.5" r="5" fill="#EDF3FA"/><circle cx="104" cy="28.5" r="5" fill="#EDF3FA"/>
     <path d="M103 28.5 l2 -2 M103 28.5 l2 2" stroke="#8FB4DA" stroke-width="1.4" fill="none" stroke-linecap="round"/>
     <path d="M119 28.5 l-2 -2 M119 28.5 l-2 2" stroke="#8FB4DA" stroke-width="1.4" fill="none" stroke-linecap="round"/>
     ${zellen.join("")}`);
})();

// Eine Lupe über einer Produktkarte.
const lupe = M("cc", "Eine Lupe über einer Produktkarte",
  `${boden(70, 98, 40, 4, 0.1)}
   <g filter="url(#ccs)">
     <rect x="18" y="24" width="80" height="62" rx="12" fill="url(#ccw)" stroke="#DCE8F6"/>
   </g>
   <rect x="28" y="36" width="46" height="4" rx="2" fill="#C6DBF2"/>
   <rect x="28" y="46" width="34" height="4" rx="2" fill="#DDE9F6"/>
   <rect x="28" y="56" width="42" height="4" rx="2" fill="#DDE9F6"/>
   <rect x="28" y="66" width="26" height="4" rx="2" fill="#EAF1FA"/>
   <g class="mv-lupe">
     <rect x="86" y="70" width="34" height="9" rx="4.5" fill="url(#ccg)" transform="rotate(45 103 74.5)"/>
     <g filter="url(#ccs)">
       <circle cx="92" cy="56" r="26" fill="#FFFFFF" fill-opacity=".62"/>
       <circle cx="92" cy="56" r="26" fill="none" stroke="url(#ccg)" stroke-width="6"/>
     </g>
     <path d="M74 44 A26 26 0 0 1 96 32" stroke="#FFFFFF" stroke-opacity=".8" stroke-width="3" fill="none" stroke-linecap="round"/>
   </g>`);

/** Die fertigen Zeichnungen. Ausgeführt wird daraus `Motiv`; ein Test liest sie zusätzlich. */
export const MOTIVE: Record<MotivId, string> = {
  pfad, zielkarten, personen, haeuser, wege,
  zaehler, sanduhr, beratungstisch, faecher, lupe, netz, produktkarten, koffer,
  baustelle, bremse, kompass, waage, buch,
  staffelstab, werkzeugwand, uhren, wochenraster, kalenderblatt,
  siegel, sprechblasen, abhakliste, bildschirme, monat,
};

/**
 * Der Stilblock für alle Motive, genau einmal je Seite.
 *
 * Steht bewusst nicht in `index.css`: Die Regeln gelten ausschließlich für
 * diese Motive, und wer sie sucht, sucht sie hier. Alles läuft einmal beim
 * Erscheinen ab und wiederholt sich nur dort, wo es zum Inhalt gehört (Uhren,
 * Sand, Münze). Unter `prefers-reduced-motion: reduce` steht alles still, und
 * zwar im Endzustand, damit kein Motiv unfertig aussieht.
 */
export function MotivStil() {
  return (
    <style>{`
.kl-motiv svg { display: block; width: 100%; height: auto; }

@keyframes kl-zeichnet { from { stroke-dashoffset: 260; } to { stroke-dashoffset: 0; } }
@keyframes kl-rasten { from { opacity: 0; transform: translateY(4px) scale(.86); } 60% { transform: translateY(0) scale(1.06); } to { opacity: 1; transform: none; } }
@keyframes kl-hebt { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes kl-puls { 0%, 100% { opacity: .10; transform: scale(1); } 50% { opacity: .26; transform: scale(1.14); } }
@keyframes kl-staffel { 0%, 12% { transform: translateX(-14px); } 55%, 100% { transform: translateX(14px); } }
@keyframes kl-dreht { to { transform: rotate(360deg); } }
@keyframes kl-rieselt { to { stroke-dashoffset: -18; } }
@keyframes kl-muenze { 0% { opacity: 0; transform: translateY(-14px); } 70% { opacity: 1; transform: translateY(2px); } 100% { opacity: 1; transform: none; } }
@keyframes kl-pendelt { 0% { transform: rotate(-9deg); } 45% { transform: rotate(5deg); } 75% { transform: rotate(-2deg); } 100% { transform: rotate(0deg); } }
@keyframes kl-schranke { 0%, 30% { transform: rotate(0deg); } 100% { transform: rotate(-22deg); } }
@keyframes kl-blaettert { from { transform: scaleX(.1); opacity: 0; } to { transform: scaleX(1); opacity: 1; } }
@keyframes kl-schwingt { 0%, 100% { transform: rotate(-4deg); } 50% { transform: rotate(4deg); } }
@keyframes kl-lupe { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(-8px, 6px); } }
@keyframes kl-siegel { from { opacity: 0; transform: scale(1.9); } 70% { opacity: 1; transform: scale(.94); } to { opacity: 1; transform: scale(1); } }
@keyframes kl-steigt { 0% { opacity: 0; transform: translateY(6px); } 40%, 100% { opacity: 1; transform: translateY(-4px); } }
@keyframes kl-leuchtet { from { opacity: .35; } to { opacity: 1; } }

.kl-motiv .mv-zeichnet { stroke-dasharray: 5 5; animation: kl-zeichnet 1.4s ease-out both; }
.kl-motiv .mv-rasten { animation: kl-rasten .5s cubic-bezier(.2,.8,.3,1) both; animation-delay: calc(var(--i, 0) * 90ms + 120ms); transform-box: fill-box; transform-origin: center; }
.kl-motiv .mv-hebt { animation: kl-hebt .6s cubic-bezier(.2,.8,.3,1) both .2s; }
.kl-motiv .mv-puls { animation: kl-puls 2.8s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
.kl-motiv .mv-staffel { animation: kl-staffel 3.4s ease-in-out infinite; }
.kl-motiv .mv-uhr1 { animation: kl-dreht 4s linear infinite; }
.kl-motiv .mv-uhr2 { animation: kl-dreht 7s linear infinite; }
.kl-motiv .mv-uhr3 { animation: kl-dreht 11s linear infinite; }
.kl-motiv .mv-rieselt { animation: kl-rieselt 1.2s linear infinite; }
.kl-motiv .mv-muenze { animation: kl-muenze 1.1s cubic-bezier(.3,1.4,.5,1) both .9s; transform-box: fill-box; }
.kl-motiv .mv-pendelt { animation: kl-pendelt 1.8s ease-out both .2s; transform-box: fill-box; transform-origin: center top; }
.kl-motiv .mv-schranke { animation: kl-schranke 1.6s ease-out both .3s; transform-box: fill-box; transform-origin: 0 6px; }
.kl-motiv .mv-blaettert { animation: kl-blaettert .9s ease-out both .3s; transform-box: fill-box; transform-origin: left center; }
.kl-motiv .mv-schwingt { animation: kl-schwingt 3s ease-in-out infinite; transform-box: fill-box; transform-origin: top center; }
.kl-motiv .mv-lupe { animation: kl-lupe 5s ease-in-out infinite; }
.kl-motiv .mv-siegel { animation: kl-siegel .7s cubic-bezier(.3,1.3,.4,1) both .5s; transform-box: fill-box; transform-origin: center; }
.kl-motiv .mv-steigt { animation: kl-steigt 2.6s ease-in-out infinite alternate; transform-box: fill-box; }
.kl-motiv .mv-hakt { animation: kl-rasten .5s cubic-bezier(.2,.8,.3,1) both .7s; transform-box: fill-box; transform-origin: center; }
.kl-motiv .mv-leuchtet { animation: kl-leuchtet .8s ease-out both .4s; }
.kl-motiv .mv-streicht { stroke-dasharray: 90; animation: kl-zeichnet .7s ease-out both .8s; }
.kl-motiv .mv-nadel { animation: kl-pendelt 1.6s ease-out both .3s; transform-box: fill-box; transform-origin: center; }
.kl-motiv .mv-funkelt { animation: kl-puls 2.4s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
.kl-motiv .mv-kran { animation: kl-pendelt 3.4s ease-in-out infinite alternate; transform-box: fill-box; transform-origin: right top; }

@media (prefers-reduced-motion: reduce) {
  .kl-motiv * { animation: none !important; }
  .kl-motiv .mv-zeichnet, .kl-motiv .mv-streicht { stroke-dashoffset: 0; }
}
    `}</style>
  );
}

/**
 * Ein Motiv, oben rechts neben der Überschrift.
 *
 * Auf dem Handy steht es unter der Überschrift und über dem Text; das regelt
 * die Seite über die Anordnung, nicht dieser Baustein.
 */
export const Motiv = memo(function Motiv({ id }: { id: MotivId }) {
  const svg = MOTIVE[id];
  if (!svg) return null;
  return (
    <span
      className="kl-motiv block w-[130px] sm:w-[150px] shrink-0"
      data-motiv={id}
      // Fest verdrahtete Zeichnungen aus diesem Modul, keine Eingabe von außen.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
});

/** Nur für Tests: Gibt es zu jeder Kennung wirklich eine Zeichnung? */
export const MOTIV_IDS = Object.keys(MOTIVE) as MotivId[];
