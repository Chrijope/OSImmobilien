/**
 * Die Diagramme der Handbuch-Seite und des Handbuchs.
 *
 * WARUM EINE ZEICHENLISTE STATT FERTIGER BILDER
 *
 * Dasselbe Diagramm erscheint an zwei Orten: auf der Seite im Browser und im
 * PDF. Ein Bild aus dem Browser in das PDF zu kopieren, hätte dort eine
 * fremde Schrift und unscharfe Kanten ergeben. Deshalb beschreibt jede
 * Funktion hier ihr Diagramm als Liste einfacher Formen (Rechteck, Linie,
 * Pfad, Kreis, Text) in einem festen Koordinatensystem. Zwei kleine Zeichner
 * setzen die Liste um: `zeichnungAlsSvg` für die Seite, `zeichneInsPdf` in
 * `handbuchPdf.ts` mit jsPDF, vektoriell und in der Hausschrift.
 *
 * Farben stehen als Rollen in der Liste („akzent“, „tinte“), nicht als Werte.
 * Der SVG-Zeichner setzt CSS-Variablen ein, damit die Diagramme hell und
 * dunkel richtig aussehen; der PDF-Zeichner die festen Farben des Hauses.
 *
 * Vorlage sind die Diagramme der Strategie vom 26.09.2026 (charts.py).
 */
import type { Sprache } from "../../../supabase/functions/_shared/kunden-sprache.ts";

/*
 * ─── Sprache der Beschriftungen und Zahlen (seit dem 26.09.2026) ─────────
 *
 * Handbuch, Landingpage und Diagramme gibt es auf Deutsch und Englisch.
 * Statt die Sprache durch jede Diagramm- und Textfunktion zu reichen, gilt
 * sie für die Dauer eines Aufbaus: `inSprache("en", () => baueHandbuch(…))`.
 * Darin formatieren `eur`, `euro` und `tx` englisch (en-GB, „€1,234“, wie
 * `sprachFormat.ts`), danach gilt wieder Deutsch.
 *
 * ponytail: eine Sprache je synchronem Aufbau statt eines Parameters durch
 * rund dreißig Funktionen. Trägt, solange der Aufbau synchron bleibt; wird er
 * asynchron, gehört die Sprache als Parameter in die Funktionen.
 */
let aktiveSprache: Sprache = "de";

export function inSprache<T>(sprache: Sprache, aufbau: () => T): T {
  const vorher = aktiveSprache;
  aktiveSprache = sprache;
  try {
    return aufbau();
  } finally {
    aktiveSprache = vorher;
  }
}

/** Die Sprache des laufenden Aufbaus. */
export function aufbauSprache(): Sprache {
  return aktiveSprache;
}

/** Der Text in der Sprache des laufenden Aufbaus. */
export function tx(de: string, en: string): string {
  return aktiveSprache === "en" ? en : de;
}

export type Farbe =
  | "tinte"
  | "akzent"
  | "akzentTief"
  | "akzentHell"
  | "flaeche"
  | "linie"
  | "text"
  | "text2"
  | "muted"
  | "gruen"
  | "rot"
  | "grau"
  | "weiss";

export type Form =
  | { art: "rect"; x: number; y: number; b: number; h: number; r?: number; farbe: Farbe; deckkraft?: number }
  | { art: "linie"; x1: number; y1: number; x2: number; y2: number; farbe: Farbe; breite?: number; gestrichelt?: boolean }
  | {
      art: "pfad";
      punkte: Array<[number, number]>;
      farbe: Farbe;
      breite?: number;
      gestrichelt?: boolean;
      /** Gefüllte Fläche statt Linie. */
      gefuellt?: boolean;
      deckkraft?: number;
    }
  | { art: "kreis"; x: number; y: number; r: number; farbe: Farbe; rand?: Farbe; randBreite?: number }
  | {
      art: "text";
      x: number;
      y: number;
      text: string;
      groesse: number;
      farbe: Farbe;
      anker?: "start" | "middle" | "end";
      fett?: boolean;
      /** Heller Rand um die Schrift, damit sie auf Linien lesbar bleibt. */
      hof?: boolean;
    };

export interface Zeichnung {
  breite: number;
  hoehe: number;
  formen: Form[];
  /** Kurzbeschreibung für Vorleseprogramme. */
  beschreibung: string;
}

/** Zahl ohne Nachkommastellen in der Sprache des Aufbaus, Minus als echtes Minuszeichen. */
export function eur(x: number): string {
  const neg = x < -0.5;
  const s = Math.round(Math.abs(x)).toLocaleString(aktiveSprache === "en" ? "en-GB" : "de-DE");
  return (neg ? "−" : "") + s;
}

/** Betrag mit Euro: „1.234 €“, englisch „€1,234“, negativ „−€354“. */
export function euro(v: number): string {
  if (aktiveSprache !== "en") return `${eur(v)} €`;
  const betrag = eur(Math.abs(v));
  return v < -0.5 ? `−€${betrag}` : `€${betrag}`;
}

/** `euro` in einer bestimmten Sprache, für die Seiten außerhalb eines Aufbaus. */
export function euroIn(v: number, sprache: Sprache): string {
  return inSprache(sprache, () => euro(v));
}

const eurZeichen = euro;
const tausendEur = (v: number) => (aktiveSprache === "en" ? `€${eur(v / 1000)}k` : `${eur(v / 1000)} T€`);

/** Ungefähre Textbreite in der Hausschrift, für Legenden und Umbrüche. */
export function textBreite(text: string, groesse: number): number {
  return text.length * groesse * 0.56;
}

function schoenerSchritt(spanne: number, ziel = 5): number {
  if (spanne <= 0) return 1;
  const roh = spanne / ziel;
  const exp = 10 ** Math.floor(Math.log10(roh));
  for (const m of [1, 2, 2.5, 5, 10]) if (roh <= m * exp) return m * exp;
  return 10 * exp;
}

function t(
  x: number,
  y: number,
  text: string,
  groesse: number,
  farbe: Farbe,
  anker: "start" | "middle" | "end" = "start",
  fett = false,
  hof = false,
): Form {
  return { art: "text", x, y, text, groesse, farbe, anker, fett, hof };
}

// ─── Linien ──────────────────────────────────────────────────────────────

export interface Serie {
  name: string;
  werte: number[];
  farbe: Farbe;
  breite?: number;
  gestrichelt?: boolean;
}

export interface Markierung {
  index: number;
  wert: number;
  text: string;
  farbe: Farbe;
  /** o = oberhalb, u = unterhalb; l/r = Seite der Beschriftung. */
  lage: "or" | "ol" | "ur" | "ul";
}

export function linien(args: {
  serien: Serie[];
  xs: number[];
  breite?: number;
  hoehe?: number;
  ymin?: number;
  ymax?: number;
  yFormat?: (v: number) => string;
  xBeschriftungJede?: number;
  xFormat?: (x: number) => string;
  markierungen?: Markierung[];
  flaecheIndex?: number;
  beschreibung: string;
}): Zeichnung {
  const breite = args.breite ?? 640;
  const hoehe = args.hoehe ?? 300;
  const yFormat = args.yFormat ?? tausendEur;
  const xFormat = args.xFormat ?? String;
  const jede = args.xBeschriftungJede ?? 5;
  const formen: Form[] = [];
  const ml = 70;
  const mr = 18;
  const mb = 34;

  // Legende vorab auf Zeilen verteilen, damit sie bei schmalen Diagrammen umbricht.
  const legende: Array<[number, number]> = [];
  let lx = ml;
  let ly = 14;
  for (const s of args.serien) {
    const w = 34 + textBreite(s.name, 12.5);
    if (lx + w > breite && lx > ml) {
      lx = ml;
      ly += 18;
    }
    legende.push([lx, ly]);
    lx += w;
  }
  const mt = ly + 26;
  const pw = breite - ml - mr;
  const ph = hoehe - mt - mb;
  const alle = args.serien.flatMap((s) => s.werte);
  let lo = args.ymin ?? Math.min(0, ...alle);
  let hi = args.ymax ?? Math.max(...alle);
  const schritt = schoenerSchritt(hi - lo);
  hi = Math.ceil(hi / schritt) * schritt;
  if (args.ymin === undefined) lo = lo < 0 ? Math.floor(lo / schritt) * schritt : 0;
  const X = (i: number) => ml + (pw * i) / Math.max(1, args.xs.length - 1);
  const Y = (v: number) => mt + ph * (1 - (v - lo) / (hi - lo || 1));

  for (let v = lo; v <= hi + 1e-9; v += schritt) {
    formen.push({ art: "linie", x1: ml, x2: breite - mr, y1: Y(v), y2: Y(v), farbe: "linie", breite: 1 });
    formen.push(t(ml - 8, Y(v) + 4, yFormat(v), 11.5, "muted", "end"));
  }
  args.xs.forEach((x, i) => {
    if (i % jede === 0 || i === args.xs.length - 1) {
      formen.push(t(X(i), hoehe - mb + 18, xFormat(x), 11.5, "muted", "middle"));
    }
  });
  if (args.flaecheIndex !== undefined) {
    const s = args.serien[args.flaecheIndex];
    const basis = Y(Math.max(lo, 0));
    formen.push({
      art: "pfad",
      punkte: [[X(0), basis], ...s.werte.map((w, i) => [X(i), Y(w)] as [number, number]), [X(s.werte.length - 1), basis]],
      farbe: s.farbe,
      gefuellt: true,
      deckkraft: 0.12,
    });
  }
  for (const s of args.serien) {
    formen.push({
      art: "pfad",
      punkte: s.werte.map((w, i) => [X(i), Y(w)] as [number, number]),
      farbe: s.farbe,
      breite: s.breite ?? 2.4,
      gestrichelt: s.gestrichelt,
    });
  }
  for (const m of args.markierungen ?? []) {
    const x = X(m.index);
    const y = Y(m.wert);
    formen.push({ art: "kreis", x, y, r: 4.2, farbe: "weiss", rand: m.farbe, randBreite: 2.4 });
    const dx = m.lage[1] === "l" ? -8 : 8;
    const dy = m.lage[0] === "o" ? -10 : 18;
    formen.push(t(x + dx, y + dy, m.text, 11, m.farbe, dx < 0 ? "end" : "start", true, true));
  }
  args.serien.forEach((s, i) => {
    const [x, y] = legende[i];
    formen.push({ art: "linie", x1: x, x2: x + 18, y1: y, y2: y, farbe: s.farbe, breite: 3, gestrichelt: s.gestrichelt });
    formen.push(t(x + 24, y + 4, s.name, 12.5, "tinte"));
  });
  return { breite, hoehe, formen, beschreibung: args.beschreibung };
}

// ─── Gruppierte Säulen ───────────────────────────────────────────────────

export function saeulenGruppen(args: {
  gruppen: Array<{ bezeichnung: string; werte: number[] }>;
  serienNamen: string[];
  farben: Farbe[];
  breite?: number;
  hoehe?: number;
  hervor?: number;
  beschreibung: string;
}): Zeichnung {
  const breite = args.breite ?? 640;
  const hoehe = args.hoehe ?? 280;
  const formen: Form[] = [];
  const ml = 66;
  const mr = 10;
  const mb = 40;
  // Legende wie bei den Linien, mit Umbruch bei schmaler Breite.
  let lx = ml;
  let ly = 14;
  const leg: Array<[number, number]> = [];
  for (const name of args.serienNamen) {
    const w = 30 + textBreite(name, 12.5);
    if (lx + w > breite && lx > ml) {
      lx = ml;
      ly += 18;
    }
    leg.push([lx, ly]);
    lx += w;
  }
  const mt = ly + 26;
  const pw = breite - ml - mr;
  const ph = hoehe - mt - mb;
  const maxWert = Math.max(1, ...args.gruppen.flatMap((g) => g.werte));
  const schritt = schoenerSchritt(maxWert, 4);
  const hi = Math.ceil((maxWert * 1.12) / schritt) * schritt;
  const Y = (v: number) => mt + ph * (1 - v / hi);
  for (let v = 0; v <= hi + 1e-9; v += schritt) {
    formen.push({ art: "linie", x1: ml, x2: breite - mr, y1: Y(v), y2: Y(v), farbe: "linie", breite: 1 });
    formen.push(t(ml - 8, Y(v) + 4, eurZeichen(v), 11.5, "muted", "end"));
  }
  const gw = pw / args.gruppen.length;
  const n = args.serienNamen.length;
  const bw = Math.min(46, (gw * 0.72) / n);
  args.gruppen.forEach((g, gi) => {
    const gx = ml + gi * gw + (gw - bw * n - 6 * (n - 1)) / 2;
    if (args.hervor === gi) {
      formen.push({ art: "rect", x: ml + gi * gw + 4, y: mt - 6, b: gw - 8, h: ph + 6, r: 10, farbe: "akzent", deckkraft: 0.08 });
    }
    g.werte.forEach((w, si) => {
      const x = gx + si * (bw + 6);
      const h = Math.max(1, Y(0) - Y(w));
      formen.push({ art: "rect", x, y: Y(0) - h, b: bw, h, r: 3, farbe: args.farben[si] });
      formen.push(t(x + bw / 2, Y(w) - 6, eurZeichen(w), 12, "tinte", "middle", true));
    });
    const hervor = args.hervor === gi;
    formen.push(t(ml + gi * gw + gw / 2, hoehe - mb + 18, g.bezeichnung, 11, hervor ? "tinte" : "text2", "middle", hervor));
  });
  args.serienNamen.forEach((name, si) => {
    const [x, y] = leg[si];
    formen.push({ art: "rect", x, y: y - 8, b: 12, h: 12, r: 2, farbe: args.farben[si] });
    formen.push(t(x + 18, y + 3, name, 12.5, "tinte"));
  });
  return { breite, hoehe, formen, beschreibung: args.beschreibung };
}

// ─── Wasserfall ──────────────────────────────────────────────────────────

export interface WasserfallSchritt {
  /** Zeilenumbruch mit „|“. */
  bezeichnung: string;
  betrag: number;
  art: "start" | "plus" | "minus" | "summe";
}

export function wasserfall(schritte: WasserfallSchritt[], breite = 640, hoehe = 300, beschreibung = ""): Zeichnung {
  const formen: Form[] = [];
  const ml = 20;
  const mr = 20;
  const mt = 26;
  const mb = 52;
  const pw = breite - ml - mr;
  const ph = hoehe - mt - mb;
  let stand = 0;
  const balken = schritte.map((s) => {
    if (s.art === "start") {
      stand = s.betrag;
      return { ...s, lo: Math.min(0, s.betrag), hi: Math.max(0, s.betrag), wert: s.betrag, ende: s.betrag };
    }
    if (s.art === "summe") {
      return { ...s, lo: Math.min(0, stand), hi: Math.max(0, stand), wert: stand, ende: stand };
    }
    const neu = stand + s.betrag;
    const b = { ...s, lo: Math.min(stand, neu), hi: Math.max(stand, neu), wert: s.betrag, ende: neu };
    stand = neu;
    return b;
  });
  const oben = Math.max(...balken.map((b) => b.hi)) * 1.14 || 1;
  let unten = Math.min(0, ...balken.map((b) => b.lo));
  unten = unten < 0 ? unten * 1.35 : 0;
  const Y = (v: number) => mt + (ph * (oben - v)) / (oben - unten);
  const bw = pw / balken.length;
  formen.push({ art: "linie", x1: ml, x2: breite - mr, y1: Y(0), y2: Y(0), farbe: "muted", breite: 1 });
  const farbe: Record<WasserfallSchritt["art"], Farbe> = { start: "akzent", plus: "gruen", minus: "rot", summe: "tinte" };
  balken.forEach((b, i) => {
    const x = ml + i * bw + bw * 0.16;
    const w = bw * 0.68;
    const f = b.art === "summe" && b.wert < 0 ? "rot" : farbe[b.art];
    formen.push({ art: "rect", x, y: Y(b.hi), b: w, h: Math.max(1.5, Y(b.lo) - Y(b.hi)), r: 3, farbe: f });
    const text = (b.art === "plus" ? "+" : "") + eurZeichen(b.wert);
    const unterhalb = b.art === "minus" || (b.art === "summe" && b.wert < 0);
    formen.push(t(x + w / 2, unterhalb ? Y(b.lo) + 15 : Y(b.hi) - 7, text, 12, "tinte", "middle", true));
    if (i < balken.length - 1) {
      const yv = Y(b.ende);
      formen.push({ art: "linie", x1: x + w, x2: ml + (i + 1) * bw + bw * 0.16, y1: yv, y2: yv, farbe: "muted", breite: 1, gestrichelt: true });
    }
    b.bezeichnung.split("|").forEach((z, zi) => {
      formen.push(t(x + w / 2, hoehe - mb + 16 + zi * 13, z, 11.5, "text2", "middle"));
    });
  });
  return { breite, hoehe, formen, beschreibung };
}

// ─── Waagerechte Balken ──────────────────────────────────────────────────

export function waagerecht(args: {
  zeilen: Array<{ bezeichnung: string; wert: number; farbe: Farbe }>;
  breite?: number;
  zeilenhoehe?: number;
  bezeichnungBreite?: number;
  maxWert?: number;
  beschreibung: string;
}): Zeichnung {
  const breite = args.breite ?? 640;
  const zh = args.zeilenhoehe ?? 40;
  const lb = args.bezeichnungBreite ?? 210;
  const hoehe = zh * args.zeilen.length + 10;
  const mx = args.maxWert ?? Math.max(1, ...args.zeilen.map((z) => z.wert)) * 1.3;
  const pw = breite - lb - 20;
  const formen: Form[] = [];
  args.zeilen.forEach((z, i) => {
    const y = 6 + i * zh;
    formen.push(t(lb - 12, y + zh / 2 + 2, z.bezeichnung, 12.5, "tinte", "end"));
    formen.push({ art: "rect", x: lb, y: y + 6, b: pw, h: zh - 14, r: 4, farbe: "flaeche" });
    const bw = Math.max(2, (pw * z.wert) / mx);
    formen.push({ art: "rect", x: lb, y: y + 6, b: bw, h: zh - 14, r: 4, farbe: z.farbe });
    formen.push(t(lb + bw + 8, y + zh / 2 + 2, eurZeichen(z.wert), 12.5, "tinte", "start", true));
  });
  return { breite, hoehe, formen, beschreibung: args.beschreibung };
}

// ─── Ring ────────────────────────────────────────────────────────────────

export function ring(args: {
  teile: Array<{ bezeichnung: string; wert: number; farbe: Farbe }>;
  mitteOben: string;
  mitteUnten: string;
  breite?: number;
  hoehe?: number;
  beschreibung: string;
}): Zeichnung {
  const breite = args.breite ?? 440;
  const hoehe = args.hoehe ?? 200;
  const r = hoehe * 0.43;
  const dicke = r * 0.32;
  const cx = hoehe / 2;
  const cy = hoehe / 2;
  const summe = args.teile.reduce((s, x) => s + x.wert, 0) || 1;
  const formen: Form[] = [];
  let a = -Math.PI / 2;
  for (const teil of args.teile) {
    const da = (2 * Math.PI * teil.wert) / summe;
    const schritte = Math.max(6, Math.ceil(da / 0.06));
    const aussen: Array<[number, number]> = [];
    const innen: Array<[number, number]> = [];
    for (let k = 0; k <= schritte; k++) {
      const w = a + (da * k) / schritte;
      aussen.push([cx + r * Math.cos(w), cy + r * Math.sin(w)]);
      innen.push([cx + (r - dicke) * Math.cos(w), cy + (r - dicke) * Math.sin(w)]);
    }
    formen.push({ art: "pfad", punkte: [...aussen, ...innen.reverse()], farbe: teil.farbe, gefuellt: true });
    a += da;
  }
  formen.push(t(cx, cy - 1, args.mitteOben, 16, "tinte", "middle", true));
  formen.push(t(cx, cy + 16, args.mitteUnten, 11.5, "muted", "middle"));
  let ly = cy - (args.teile.length * 22) / 2 + 8;
  for (const teil of args.teile) {
    formen.push({ art: "rect", x: hoehe + 6, y: ly - 10, b: 12, h: 12, r: 2, farbe: teil.farbe });
    formen.push(t(hoehe + 24, ly, teil.bezeichnung, 12.5, "tinte"));
    ly += 22;
  }
  return { breite, hoehe, formen, beschreibung: args.beschreibung };
}

// ─── Rahmen als Spanne ───────────────────────────────────────────────────

export function rahmenSpanne(r: { von: number; bis: number; empf: number }, breite = 640, hoehe = 120): Zeichnung {
  const mx = Math.max(420000, Math.ceil((r.bis * 1.1) / 100000) * 100000);
  const ml = 24;
  const mr = 24;
  const pw = breite - ml - mr;
  const X = (v: number) => ml + (pw * Math.min(v, mx)) / mx;
  const y = 50;
  const formen: Form[] = [
    { art: "rect", x: ml, y, b: pw, h: 18, r: 9, farbe: "flaeche" },
    { art: "rect", x: X(r.von), y, b: Math.max(4, X(r.bis) - X(r.von)), h: 18, r: 9, farbe: "akzent", deckkraft: 0.3 },
    { art: "rect", x: X(r.empf) - 2, y: y - 8, b: 4, h: 34, r: 2, farbe: "akzent" },
  ];
  const empfText = `${tx("Empfohlen", "Recommended")}: ${eurZeichen(r.empf)}`;
  // Nicht über den Rand laufen lassen.
  const halbe = textBreite(empfText, 14) / 2;
  const textX = Math.min(breite - mr - halbe, Math.max(ml + halbe, X(r.empf)));
  formen.push(t(textX, y - 16, empfText, 14, "tinte", "middle", true));
  formen.push(t(X(r.von) - 4, y + 13, eurZeichen(r.von), 11.5, "text2", "end"));
  formen.push(t(X(r.bis) + 4, y + 13, eurZeichen(r.bis), 11.5, "text2", "start"));
  for (let v = 0; v <= mx; v += 100000) {
    formen.push({ art: "linie", x1: X(v), x2: X(v), y1: y + 22, y2: y + 27, farbe: "muted", breite: 1 });
    formen.push(t(X(v), y + 42, tausendEur(v), 11.5, "muted", "middle"));
  }
  return {
    breite,
    hoehe,
    formen,
    beschreibung: tx(
      `Rahmen von ${eurZeichen(r.von)} bis ${eurZeichen(r.bis)}, empfohlen ${eurZeichen(r.empf)}.`,
      `Budget from ${eurZeichen(r.von)} to ${eurZeichen(r.bis)}, recommended ${eurZeichen(r.empf)}.`,
    ),
  };
}

// ─── SVG ─────────────────────────────────────────────────────────────────

/** CSS-Variablen der Handbuch-Seite, siehe `src/styles/handbuchSeite.css`. */
export const SVG_FARBEN: Record<Farbe, string> = {
  tinte: "var(--hb-tinte)",
  akzent: "var(--hb-akzent)",
  akzentTief: "var(--hb-akzent-tief)",
  akzentHell: "var(--hb-akzent-hell)",
  flaeche: "var(--hb-diagramm-flaeche)",
  linie: "var(--hb-linie)",
  text: "var(--hb-text)",
  text2: "var(--hb-text2)",
  muted: "var(--hb-muted)",
  gruen: "var(--hb-gruen-f)",
  rot: "var(--hb-rot-f)",
  grau: "var(--hb-grau)",
  weiss: "var(--hb-karte)",
};

/** Die festen Farben des Hauses, für das PDF und für Tests. */
export const FESTE_FARBEN: Record<Farbe, string> = {
  tinte: "#0F1621",
  akzent: "#187F58",
  akzentTief: "#136647",
  akzentHell: "#30E19E",
  flaeche: "#F4F7FA",
  linie: "#E3E8EE",
  text: "#2B323C",
  text2: "#4A5462",
  muted: "#7A8594",
  gruen: "#3BA55C",
  rot: "#E5484D",
  grau: "#C9D3DF",
  weiss: "#FFFFFF",
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const z = (n: number) => (Math.round(n * 10) / 10).toString();

/** Die Zeichenliste als SVG-Markup, mit viewBox, damit es frei skaliert. */
export function zeichnungAlsSvg(zeichnung: Zeichnung, farben: Record<Farbe, string> = SVG_FARBEN): string {
  const teile: string[] = [
    `<svg viewBox="0 0 ${zeichnung.breite} ${zeichnung.hoehe}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(zeichnung.beschreibung)}" font-family="'Plus Jakarta Sans', 'PJS', system-ui, sans-serif">`,
  ];
  for (const f of zeichnung.formen) {
    switch (f.art) {
      case "rect":
        teile.push(
          `<rect x="${z(f.x)}" y="${z(f.y)}" width="${z(Math.max(0, f.b))}" height="${z(Math.max(0, f.h))}" rx="${f.r ?? 0}" fill="${farben[f.farbe]}"${f.deckkraft !== undefined ? ` fill-opacity="${f.deckkraft}"` : ""}/>`,
        );
        break;
      case "linie":
        teile.push(
          `<line x1="${z(f.x1)}" y1="${z(f.y1)}" x2="${z(f.x2)}" y2="${z(f.y2)}" stroke="${farben[f.farbe]}" stroke-width="${f.breite ?? 1}"${f.gestrichelt ? ' stroke-dasharray="5 4"' : ""}/>`,
        );
        break;
      case "pfad": {
        const pts = f.punkte.map(([x, y]) => `${z(x)},${z(y)}`).join(" ");
        if (f.gefuellt) {
          teile.push(`<polygon points="${pts}" fill="${farben[f.farbe]}"${f.deckkraft !== undefined ? ` fill-opacity="${f.deckkraft}"` : ""}/>`);
        } else {
          teile.push(
            `<polyline points="${pts}" fill="none" stroke="${farben[f.farbe]}" stroke-width="${f.breite ?? 2}" stroke-linejoin="round" stroke-linecap="round"${f.gestrichelt ? ' stroke-dasharray="5 4"' : ""}/>`,
          );
        }
        break;
      }
      case "kreis":
        teile.push(
          `<circle cx="${z(f.x)}" cy="${z(f.y)}" r="${f.r}" fill="${farben[f.farbe]}"${f.rand ? ` stroke="${farben[f.rand]}" stroke-width="${f.randBreite ?? 1}"` : ""}/>`,
        );
        break;
      case "text":
        teile.push(
          `<text x="${z(f.x)}" y="${z(f.y)}" font-size="${f.groesse}" fill="${farben[f.farbe]}" text-anchor="${f.anker ?? "start"}" font-weight="${f.fett ? 700 : 400}"${f.hof ? ` stroke="${farben.weiss}" stroke-width="3.2" paint-order="stroke" stroke-linejoin="round"` : ""}>${esc(f.text)}</text>`,
        );
        break;
    }
  }
  teile.push("</svg>");
  return teile.join("");
}
