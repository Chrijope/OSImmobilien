/**
 * Kleine Werkzeuge fuer die Waechtertests eigener Liquid-Glass-Dateien
 * (`kundenportal-liquid.test.ts`, `lp-theme-liquid.test.ts`).
 *
 * Dieselben Handgriffe wie in `design-liquid.test.ts`: CSS in Regeln
 * zerlegen, Selektorlisten teilen, Kontrast rechnen. Sie stehen hier
 * getrennt, damit die Tests der Schicht selbst unberuehrt bleiben.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type Regel = { selektor: string; inhalt: string; rahmen: string[] };

/** Die Datei ohne Kommentare: Dort steht absichtlich, was NICHT im Code stehen darf. */
export function ohneKommentare(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

export function lies(pfad: string): string {
  return readFileSync(resolve(__dirname, pfad), "utf8");
}

/** Zerlegt CSS in Regeln samt der @-Bloecke, in denen sie stehen. */
export function regeln(quelle: string): Regel[] {
  const ergebnis: Regel[] = [];
  const stapel: string[] = [];
  let puffer = "";
  for (const zeichen of quelle) {
    if (zeichen === "{") {
      stapel.push(puffer.trim());
      puffer = "";
    } else if (zeichen === "}") {
      const kopf = stapel.pop() ?? "";
      if (!kopf.startsWith("@") && puffer.trim() !== "" && !stapel.some((s) => s.startsWith("@keyframes"))) {
        ergebnis.push({ selektor: kopf.replace(/\s+/g, " "), inhalt: puffer.trim(), rahmen: [...stapel] });
      }
      puffer = "";
    } else {
      puffer += zeichen;
    }
  }
  return ergebnis;
}

/** Teilt eine Selektorliste nur an den Kommas der obersten Ebene, nicht in `:is(...)`. */
export function teile(selektor: string): string[] {
  const liste: string[] = [];
  let tiefe = 0;
  let aktuell = "";
  for (const zeichen of selektor) {
    if (zeichen === "(" || zeichen === "[") tiefe++;
    if (zeichen === ")" || zeichen === "]") tiefe--;
    if (zeichen === "," && tiefe === 0) {
      liste.push(aktuell.trim());
      aktuell = "";
    } else {
      aktuell += zeichen;
    }
  }
  liste.push(aktuell.trim());
  return liste;
}

/** Wert eines Tokens in einem Regelinhalt, etwa `--lg-glas`. */
export function token(inhalt: string, name: string): string {
  const treffer = inhalt.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!treffer) throw new Error(`Token --${name} fehlt`);
  return treffer[1].trim();
}

/* ── Kontrast, dieselbe Rechnung wie in design-liquid.test.ts ─────────────── */

export type Rgb = [number, number, number];

export function hslZuRgb(h: number, s: number, l: number): Rgb {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
export const ausToken = (wert: string): Rgb => {
  const [h, s, l] = wert.split(/\s+/).map((t) => parseFloat(t));
  return hslZuRgb(h, s, l);
};
export const ausHex = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
export const mische = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => a[i] * (1 - t) + b[i] * t) as Rgb;
/** CSS `saturate()`, dieselbe Matrix wie im Browser. */
export const saettige = ([r, g, b]: Rgb, s: number): Rgb => {
  const c = (v: number) => Math.min(255, Math.max(0, v));
  return [
    c((0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * b),
    c((0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * b),
    c((0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * b),
  ];
};
const helligkeit = (c: Rgb) => {
  const [r, g, b] = c.map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const kontrast = (a: Rgb, b: Rgb) => {
  const [x, y] = [helligkeit(a), helligkeit(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

/**
 * Jede Stelle des hellen Grundes der Schicht: der Grund allein, eine Wolke,
 * zwei Wolken uebereinander, jeweils in voller Staerke. Gelesen aus
 * `design-liquid.css`, so wie der Test der Schicht es tut.
 */
export function stellenDesHellenGrundes(schicht: Regel[]): Rgb[] {
  const tokens = schicht.find((r) => r.selektor === '[data-glas="liquid"]' && r.rahmen.join() === "@media screen")!.inhalt;
  const grund = ausToken(token(tokens, "lg-grund"));
  const wolkenBlock = schicht.find((r) => r.selektor === '[data-glas="liquid"] .lg-grund-wolken' && r.rahmen.join() === "@media screen")!.inhalt;
  const wolken = [...wolkenBlock.matchAll(/hsl\((\d+(?:\.\d+)?) (\d+)% (\d+)% \/ (\.\d+|\d(?:\.\d+)?)\)/g)].map((m) => ({
    farbe: hslZuRgb(Number(m[1]), Number(m[2]), Number(m[3])),
    staerke: Number(m[4]),
  }));
  const ergebnis: Rgb[] = [grund];
  wolken.forEach((a, i) => {
    ergebnis.push(mische(grund, a.farbe, a.staerke));
    wolken.slice(i + 1).forEach((b) => ergebnis.push(mische(mische(grund, a.farbe, a.staerke), b.farbe, b.staerke)));
  });
  return ergebnis;
}
