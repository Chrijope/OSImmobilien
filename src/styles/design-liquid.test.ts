/**
 * Waechter ueber Liquid Glass, der dritten Designschicht.
 *
 * Dieselbe Aufgabe wie `design-glas.test.ts`, mit drei Unterschieden:
 *
 *   * Karten duerfen hier Weichzeichnung tragen (Entscheidung Christian,
 *     23.09.2026), aber nur ueber das Token `--lg-filter-karte`, und das muss
 *     am Handy und bei "weniger Transparenz" auf `none` stehen.
 *   * Die Lesbarkeit wird gerechnet. Der Test liest Grund, Wolken, Glas und
 *     Schriftfarben aus der CSS-Datei und prueft jeden Text gegen 4,5:1, im
 *     unguenstigsten Fall. Wer eine Wolke kraeftiger oder eine Scheibe
 *     durchsichtiger macht, merkt es hier und nicht erst am Bildschirm.
 *   * Alles steht in `@media screen`: Gedruckt wird ohne diese Schicht.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "design-liquid.css"), "utf8");
/** Ohne Kommentare: Dort steht absichtlich, was NICHT im Code stehen darf. */
const regelwerk = css.replace(/\/\*[\s\S]*?\*\//g, "");

type Regel = { selektor: string; inhalt: string; rahmen: string[] };

/**
 * Zerlegt die Datei in Regeln samt der @-Bloecke, in denen sie stehen.
 * Ein kleiner Zaehler ueber die Klammern genuegt, die Datei hat keine
 * Zeichenketten mit geschweiften Klammern.
 */
function regeln(quelle: string = regelwerk): Regel[] {
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
        ergebnis.push({ selektor: kopf, inhalt: puffer.trim(), rahmen: [...stapel] });
      }
      puffer = "";
    } else {
      puffer += zeichen;
    }
  }
  return ergebnis;
}

const alle = regeln();
const block = (selektor: string, rahmen?: (r: string[]) => boolean) =>
  alle.find((r) => r.selektor === selektor && (rahmen ? rahmen(r.rahmen) : r.rahmen.join() === "@media screen"));
const token = (inhalt: string, name: string): string => {
  const treffer = inhalt.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!treffer) throw new Error(`Token --${name} fehlt`);
  return treffer[1].trim();
};

/** Teilt eine Selektorliste nur an den Kommas der obersten Ebene, nicht in `:is(...)`. */
function teile(selektor: string): string[] {
  const teileListe: string[] = [];
  let tiefe = 0;
  let aktuell = "";
  for (const zeichen of selektor) {
    if (zeichen === "(" || zeichen === "[") tiefe++;
    if (zeichen === ")" || zeichen === "]") tiefe--;
    if (zeichen === "," && tiefe === 0) {
      teileListe.push(aktuell.trim());
      aktuell = "";
    } else {
      aktuell += zeichen;
    }
  }
  teileListe.push(aktuell.trim());
  return teileListe;
}

describe("Liquid Glass bleibt abschaltbar", () => {
  it("haengt jede Regel an das Merkmal", () => {
    // `:where(...)` zaehlt mit: Dort steht der Anker innen, damit die Regel
    // keine Spezifitaet hat (Positionierung der Karten).
    const ohneAnker = alle.filter((r) =>
      teile(r.selektor).some(
        (teil) => !teil.startsWith('[data-glas="liquid"]') && !teil.startsWith(':where([data-glas="liquid"]'),
      ),
    );
    expect(ohneAnker.map((r) => r.selektor)).toEqual([]);
  });

  it("wirkt nur auf dem Bildschirm, der Druck bleibt wie bisher", () => {
    const ohneScreen = alle.filter((r) => !r.rahmen.some((k) => k.startsWith("@media") && k.includes("screen")));
    expect(ohneScreen.map((r) => r.selektor)).toEqual([]);
  });

  it("kommt ohne !important aus", () => {
    expect(regelwerk).not.toContain("!important");
  });

  it("beruehrt die heutige Glasschicht nicht", () => {
    expect(regelwerk).not.toContain('[data-glas="an"]');
  });
});

describe("Christians Entscheidungen vom 23.09.2026", () => {
  it("neigt keine Kachel", () => {
    // Keine 3D-Neigung und keine mitwandernde Zahl.
    expect(regelwerk).not.toMatch(/rotate[XY]|perspective\(|--rx|--ry|data-lg-neigung/);
  });

  it("bewegt den Grund nur ueber transform", () => {
    const bild = css.match(/@keyframes lg-wolken\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(bild).not.toBe("");
    const eigenschaften = [...bild.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
    expect(new Set(eigenschaften)).toEqual(new Set(["transform"]));
  });

  it("legt den Grund hinter den Inhalt, nicht davor", () => {
    // Der Fehler vom 14.09.2026: Ebene 0 lag vor jedem Block ohne Position.
    const grund = block('[data-glas="liquid"] .lg-grund');
    expect(grund?.inhalt).toMatch(/z-index:\s*-1/);
    expect(regelwerk).not.toMatch(/body::(before|after)/);
  });

  it("laesst die Kopfleiste unter Dialogen liegen", () => {
    // Dialoge, Menues und Schubladen liegen auf 50 und hoeher.
    const kopf = block('[data-glas="liquid"] [data-lg="kopfbereich"]');
    const ebene = Number(kopf?.inhalt.match(/z-index:\s*(\d+)/)?.[1]);
    expect(ebene).toBeGreaterThan(10); // ueber der Seitenleiste
    expect(ebene).toBeLessThan(50);
  });

  it("dunkelt hinter Dialogen nichts ab und zeichnet hinter Popups nichts weich (Projektregel)", () => {
    // Die Abdunklung hat nur an der Schublade einen Haken (ui/sheet.tsx),
    // die Dialoge bleiben ohne. Keine Regel greift ueber Klassen nach ihnen.
    const abdunklung = block('[data-glas="liquid"] [data-ui="abdunklung"]');
    expect(abdunklung).toBeDefined();
    expect(abdunklung!.inhalt).not.toMatch(/backdrop-filter/);
    expect(alle.filter((r) => /overlay|bg-black|inset-0/i.test(r.selektor)).map((r) => r.selektor)).toEqual([]);
  });

  it("haelt den Grund waehrend eines Videogespraechs an", () => {
    const regel = alle.find((r) => r.selektor.includes('[data-pruefung="teilnehmer-kachel"]'));
    expect(regel?.inhalt).toMatch(/animation-play-state:\s*paused/);
  });
});

describe("Die Leistungsregel", () => {
  it("zeichnet nur ueber die Tokens weich", () => {
    const weich = alle.filter((r) => /(^|;)\s*backdrop-filter:(?!\s*none)/.test(r.inhalt));
    const falsch = weich.filter((r) => !/backdrop-filter:\s*var\(--lg-filter-(karte|leiste|schwebend)\)/.test(r.inhalt));
    expect(falsch.map((r) => r.selektor)).toEqual([]);
  });

  it("nimmt Karten am Handy und auf Tablets die Weichzeichnung", () => {
    const handy = alle.find(
      (r) => r.selektor === '[data-glas="liquid"]' && r.rahmen.some((k) => k.includes("max-width: 767px") && k.includes("hover: none")),
    );
    expect(handy && token(handy.inhalt, "lg-filter-karte")).toBe("none");
  });

  it("laesst Tabellenzeilen in Ruhe", () => {
    expect(regelwerk).not.toMatch(/tbody tr[^{]*\{[^}]*backdrop-filter:(?!\s*none)/);
  });
});

describe("Karten", () => {
  const kartenRegeln = alle.filter((r) => r.selektor.includes('[data-ui="card"]'));

  it("zeichnen nur ueber das Karten-Token weich", () => {
    const weich = kartenRegeln.filter((r) => /backdrop-filter:(?!\s*none)/.test(r.inhalt));
    expect(weich.length).toBeGreaterThan(0);
    for (const r of weich) expect(r.inhalt, r.selektor).toMatch(/backdrop-filter:\s*var\(--lg-filter-karte\)/);
  });

  it("zeichnen in einer Karte, einem Dialog oder Menue nicht noch einmal weich", () => {
    const innen = kartenRegeln.find((r) => /\) \[data-ui="card"\]$/.test(teile(r.selektor)[0]));
    expect(innen?.inhalt).toMatch(/backdrop-filter:\s*none/);
  });

  it("verzichten auf Weichzeichnung, wenn ein festes Element darin steht", () => {
    const fest = kartenRegeln.find((r) => r.selektor.includes(":has(.fixed)"));
    expect(fest?.inhalt).toMatch(/backdrop-filter:\s*none/);
  });

  it("behalten ihre eigene Positionierung (sticky, absolute)", () => {
    // Nur die Regel ohne Spezifitaet darf `position` setzen, sonst verloere
    // eine klebende Karte ihr Kleben.
    const mitPosition = alle.filter((r) => /(^|;)\s*position:/.test(r.inhalt) && r.selektor.includes('[data-ui="card"]') && !r.selektor.includes("::after"));
    expect(mitPosition.map((r) => r.selektor)).toEqual([':where([data-glas="liquid"] [data-ui="card"])']);
  });

  it("tragen das Licht nur an der Karte unter dem Zeiger", () => {
    const licht = alle.filter((r) => r.selektor.includes("::after"));
    expect(licht.length).toBeGreaterThan(0);
    for (const r of licht) expect(r.selektor).toContain("[data-lg-nah]");
  });
});

describe("Schwebende Flaechen", () => {
  it("werden nur Glas, wenn sie den Grundton tragen", () => {
    // Ein Dialog mit eigener Farbe, etwa ein schwarzer Bildbetrachter, bleibt.
    const glas = alle.find((r) => r.selektor.includes('[data-ui="dialog"]') && /--lg-filter-schwebend/.test(r.inhalt));
    for (const teil of teile(glas!.selektor)) {
      expect(teil, teil).toMatch(/:is\(\.bg-card|:is\(\.bg-popover|data-sonner-toast|:not\(\.destructive\)/);
    }
  });
});

describe("Ruecksichten", () => {
  it("haelt den Grund bei weniger Bewegung an", () => {
    const regel = alle.find((r) => r.rahmen.some((k) => k.includes("prefers-reduced-motion: reduce")) && r.selektor.includes(".lg-grund-wolken"));
    expect(regel?.inhalt).toMatch(/animation:\s*none/);
  });

  it("wird bei weniger Transparenz deckend und ohne Grund", () => {
    const im = (r: Regel) => r.rahmen.some((k) => k.includes("prefers-reduced-transparency: reduce"));
    const tokens = alle.find((r) => im(r) && r.selektor.startsWith('[data-glas="liquid"],'));
    expect(tokens).toBeDefined();
    for (const name of ["lg-deckkraft", "lg-deckkraft-leiste", "lg-deckkraft-schwebend", "lg-deckkraft-einlage"]) {
      expect(token(tokens!.inhalt, name)).toBe("1");
    }
    for (const name of ["lg-filter-karte", "lg-filter-leiste", "lg-filter-schwebend"]) {
      expect(token(tokens!.inhalt, name)).toBe("none");
    }
    expect(alle.find((r) => im(r) && r.selektor.includes(".lg-grund-wolken"))?.inhalt).toMatch(/display:\s*none/);
  });

  it("wird fast deckend, wenn der Browser keine Weichzeichnung kann", () => {
    expect(regelwerk).toContain("@supports not");
  });
});

/* ── Kontrast ─────────────────────────────────────────────────────────────── */

type Rgb = [number, number, number];

function hslZuRgb(h: number, s: number, l: number): Rgb {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
const ausToken = (wert: string): Rgb => {
  const [h, s, l] = wert.split(/\s+/).map((t) => parseFloat(t));
  return hslZuRgb(h, s, l);
};
const mische = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => a[i] * (1 - t) + b[i] * t) as Rgb;
/** CSS `saturate()`, dieselbe Matrix wie im Browser. */
const saettige = ([r, g, b]: Rgb, s: number): Rgb => {
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
const kontrast = (a: Rgb, b: Rgb) => {
  const [x, y] = [helligkeit(a), helligkeit(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

/** Die Wolken aus dem Block als Farbe und Staerke. */
function wolken(inhalt: string): { farbe: Rgb; staerke: number }[] {
  return [...inhalt.matchAll(/hsl\((\d+(?:\.\d+)?) (\d+)% (\d+)% \/ (\.\d+|\d(?:\.\d+)?)\)/g)].map((m) => ({
    farbe: hslZuRgb(Number(m[1]), Number(m[2]), Number(m[3])),
    staerke: Number(m[4]),
  }));
}

/**
 * Jede Stelle des Grundes, die vorkommen kann: der Grund allein, eine Wolke,
 * zwei Wolken uebereinander, jeweils in voller Staerke. Drei auf einmal
 * lassen die Positionen in den Ecken nicht zu, auch nicht in Bewegung.
 */
function stellen(grund: Rgb, liste: { farbe: Rgb; staerke: number }[]): Rgb[] {
  const ergebnis: Rgb[] = [grund];
  liste.forEach((a, i) => {
    ergebnis.push(mische(grund, a.farbe, a.staerke));
    liste.slice(i + 1).forEach((b) => ergebnis.push(mische(mische(grund, a.farbe, a.staerke), b.farbe, b.staerke)));
  });
  return ergebnis;
}

const saettigung = (filter: string) => Number(filter.match(/saturate\((\d+)%\)/)?.[1] ?? 100) / 100;

function modus(dunkel: boolean) {
  const basis = block('[data-glas="liquid"]')!.inhalt;
  const eigen = dunkel ? block('[data-glas="liquid"].dark')!.inhalt : basis;
  const wert = (name: string) => {
    try {
      return token(eigen, name);
    } catch {
      return token(basis, name);
    }
  };
  const handy = alle.find(
    (r) => r.selektor === (dunkel ? '[data-glas="liquid"].dark' : '[data-glas="liquid"]') && r.rahmen.some((k) => k.includes("hover: none")),
  )!;
  const wolkenBlock = block(dunkel ? '[data-glas="liquid"].dark .lg-grund-wolken' : '[data-glas="liquid"] .lg-grund-wolken')!;
  return {
    grund: ausToken(wert("lg-grund")),
    glas: ausToken(wert("lg-glas")),
    wolken: wolken(wolkenBlock.inhalt),
    deckkraft: {
      karte: Number(wert("lg-deckkraft")),
      leiste: Number(wert("lg-deckkraft-leiste")),
      schwebend: Number(wert("lg-deckkraft-schwebend")),
      handy: Number(token(handy.inhalt, "lg-deckkraft")),
    },
    saettigung: {
      karte: saettigung(wert("lg-filter-karte")),
      leiste: saettigung(wert("lg-filter-leiste")),
      schwebend: saettigung(wert("lg-filter-schwebend")),
    },
    schrift: {
      Text: ausToken(wert("foreground")),
      Grau: ausToken(wert("muted-foreground")),
      Blau: ausToken(wert("lg-schrift-blau")),
      Erfolg: ausToken(wert("success")),
      Fehler: ausToken(wert("destructive")),
      Achtung: ausToken(wert("warning")),
    },
  };
}

function schlechtester(flaechen: Rgb[], schrift: Record<string, Rgb>) {
  let min = Infinity;
  let wo = "";
  for (const flaeche of flaechen) {
    for (const [name, farbe] of Object.entries(schrift)) {
      const k = kontrast(farbe, flaeche);
      if (k < min) {
        min = k;
        wo = name;
      }
    }
  }
  return { min, wo };
}

describe.each([
  ["hell", false],
  ["dunkel", true],
])("Kontrast %s: jeder Text mindestens 4,5:1", (_name, dunkel) => {
  const m = modus(dunkel as boolean);
  const grund = stellen(m.grund, m.wolken);

  it("liest die Werte aus der Datei", () => {
    expect(m.wolken).toHaveLength(4);
    expect(m.deckkraft.karte).toBeGreaterThan(0);
  });

  it("direkt auf dem Grund, ohne Glas", () => {
    const { min, wo } = schlechtester(grund, m.schrift);
    expect(min, `${wo} faellt auf ${min.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ["Karte am Schreibtisch", "karte", "karte"],
    ["Seitenleiste und Kopfleiste", "leiste", "leiste"],
    ["Dialoge, Menues, Banner", "schwebend", "schwebend"],
  ] as const)("auf %s", (_titel, deckkraft, filter) => {
    const flaechen = grund.map((c) => mische(saettige(c, m.saettigung[filter]), m.glas, m.deckkraft[deckkraft]));
    const { min, wo } = schlechtester(flaechen, m.schrift);
    expect(min, `${wo} faellt auf ${min.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
  });

  it("auf getoenten Karten (Hinweis, Warnung, Erfolg)", () => {
    const basis = block('[data-glas="liquid"]')!.inhalt;
    const eigen = dunkel ? block('[data-glas="liquid"].dark')!.inhalt : basis;
    const staerke = Number(token(eigen, "lg-toenung"));
    // --primary steht in index.css: Blau 600 hell, Blau 300 dunkel.
    const toene = [dunkel ? hslZuRgb(204, 100, 77) : hslZuRgb(204, 92, 41), m.schrift.Fehler, m.schrift.Achtung, m.schrift.Erfolg];
    for (const ton of toene) {
      const flaechen = grund.map((c) => mische(mische(saettige(c, m.saettigung.karte), m.glas, m.deckkraft.karte), ton, staerke));
      const { min, wo } = schlechtester(flaechen, m.schrift);
      expect(min, `${wo} faellt auf ${min.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("auf einer Karte am Handy, ohne Weichzeichnung", () => {
    const flaechen = grund.map((c) => mische(c, m.glas, m.deckkraft.handy));
    const { min, wo } = schlechtester(flaechen, m.schrift);
    expect(min, `${wo} faellt auf ${min.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
  });
});

describe("Schrift auf der blauen Taste", () => {
  it("haelt hell mit weisser Schrift 4,5:1 an beiden Verlaufsstopps", () => {
    const hell = block('[data-glas="liquid"]')!.inhalt;
    for (const stopp of ["lg-primaer-hoch", "lg-primaer-tief"]) {
      expect(kontrast([255, 255, 255], ausToken(token(hell, stopp))), stopp).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("haelt dunkel mit dunkler Schrift 4,5:1 an beiden Verlaufsstopps", () => {
    const dunkel = block('[data-glas="liquid"].dark')!.inhalt;
    const schrift = hslZuRgb(210, 15, 10); // --primary-foreground im Dunkeln, index.css
    for (const stopp of ["lg-primaer-hoch", "lg-primaer-tief"]) {
      expect(kontrast(schrift, ausToken(token(dunkel, stopp))), stopp).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("nimmt fuer gefuellte Flaechen nie --primary selbst als oberen Stopp", () => {
    // --primary rundet heller als #15724F und traegt nur 4,45:1.
    expect(regelwerk).not.toMatch(/linear-gradient\(180deg,\s*hsl\(var\(--primary\)\)/);
  });
});

/* ── Die Berater-Mikroseite ───────────────────────────────────────────────── */

/*
 * Die Mikroseite (`/vp/:slug` und die Vorschau `/berater-microseite`) malt
 * ihre Flaechen mit `!important` fest an. Ihre Glasregeln stehen deshalb in
 * einer eigenen Datei neben ihr. Fuer diese Datei gelten dieselben Grenzen
 * wie fuer die Schicht, bis auf `!important`, das sie zum Ueberstimmen braucht.
 */
describe("Liquid Glass auf der Berater-Mikroseite", () => {
  const landing = resolve(__dirname, "../components/landing");
  const mikroCss = readFileSync(resolve(landing, "beraterMicroseiteLiquid.css"), "utf8");
  const mikroRegelwerk = mikroCss.replace(/\/\*[\s\S]*?\*\//g, "");
  const mikro = regeln(mikroRegelwerk);

  it("wird von der Mikroseite geladen, nach der Datei, die sie ueberstimmt", () => {
    const inhalt = readFileSync(resolve(landing, "BeraterMicrositeContent.tsx"), "utf8");
    const alt = inhalt.indexOf('import "./beraterMicroseite.css"');
    const glas = inhalt.indexOf('import "./beraterMicroseiteLiquid.css"');
    expect(alt).toBeGreaterThan(-1);
    expect(glas).toBeGreaterThan(alt);
  });

  it("haengt jede Regel an Liquid Glass und entscheidet ausdruecklich zwischen hell und dunkel", () => {
    expect(mikro.length).toBeGreaterThan(0);
    const ohneAnker = mikro.filter((r) =>
      teile(r.selektor).some(
        (teil) => !teil.startsWith('[data-glas="liquid"]:not(.dark) ') && !teil.startsWith('[data-glas="liquid"].dark '),
      ),
    );
    expect(ohneAnker.map((r) => r.selektor)).toEqual([]);
  });

  it("wirkt nur auf dem Bildschirm", () => {
    const ohneScreen = mikro.filter((r) => !r.rahmen.some((k) => k.startsWith("@media") && k.includes("screen")));
    expect(ohneScreen.map((r) => r.selektor)).toEqual([]);
  });

  it("neigt keine Kachel", () => {
    expect(mikroRegelwerk).not.toMatch(/rotate[XY]|perspective\(|--rx|--ry|data-lg-neigung/);
  });

  it("zeichnet nur ueber die Tokens der Schicht weich", () => {
    // So gelten deren Ruecksichten mit: am Handy und bei weniger Transparenz keine Weichzeichnung.
    const weich = mikro.filter((r) => /backdrop-filter:(?!\s*none)/.test(r.inhalt));
    expect(weich.length).toBeGreaterThan(0);
    for (const r of weich) {
      expect(r.inhalt, r.selektor).toMatch(/(^|;)\s*backdrop-filter:\s*var\(--lg-filter-(karte|leiste|schwebend)\)/);
    }
  });

  it("macht die Karten mit dem Karten-Token zu Glas, in der Deckkraft der Schicht", () => {
    const karte = mikro.find((r) => r.selektor.includes(".investment-card"));
    expect(karte?.inhalt).toMatch(/backdrop-filter:\s*var\(--lg-filter-karte\)/);
    expect(karte?.inhalt).toMatch(/background-color:\s*hsl\(var\(--lg-glas\) \/ var\(--lg-deckkraft\)\)/);
  });

  it("bringt keine eigene Farbe mit", () => {
    // Keine Hex- und keine rgb-Werte. Jeder feste hsl-Wert steht genau so
    // schon in der Schicht (Schatten, Lichtkanten); alles andere laeuft ueber Tokens.
    // Nur die Werte zaehlen; in den Selektoren stehen die Klassen der Seite, die hier gemeint sind.
    const werte = mikro.map((r) => r.inhalt).join("\n");
    expect(werte).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(werte).not.toMatch(/rgba?\(/);
    const fest = [...werte.matchAll(/hsl\((\d[^)]*)\)/g)].map((m) => m[0]);
    const fremd = fest.filter((wert) => !regelwerk.includes(wert));
    expect(fremd).toEqual([]);
  });

  it("macht den Grund sichtbar, laesst den dunklen Schlussabschnitt aber dunkel", () => {
    const abschnitte = mikro.find((r) => r.selektor.includes(".micro-abschnitt:not(.micro-abschnitt-16) section"));
    expect(abschnitte?.inhalt).toMatch(/background:\s*transparent/);
  });

  it("holt die dunklere Grauschrift der Schicht zurueck, statt sie zu wiederholen", () => {
    const huelle = mikro.find((r) => r.selektor.endsWith(".lp-theme:has(> .berater-mikroseite)"));
    expect(huelle?.inhalt).toMatch(/--muted-foreground:\s*inherit/);
  });

  it("schreibt Blau auf Glas in Blau 700 wie die Schicht", () => {
    const blau = mikro.filter((r) => /color:\s*hsl\(var\(--lg-schrift-blau\)\)/.test(r.inhalt));
    expect(blau.length).toBeGreaterThan(0);
  });

  it("zeigt die Vorschau im Dunkeln mit dem Blau der Seite, nicht mit dem hellen Blau fuer dunkles Glas", () => {
    // Blau 300 auf der weissen Seite waeren 1,9:1.
    const dunkel = mikro.find((r) => r.selektor.startsWith('[data-glas="liquid"].dark') && r.selektor.includes(".text-primary"));
    expect(dunkel?.inhalt).toMatch(/color:\s*hsl\(var\(--primary\)\)/);
    const glasImDunkeln = mikro.filter(
      (r) => r.selektor.startsWith('[data-glas="liquid"].dark') && /backdrop-filter|--lg-glas/.test(r.inhalt),
    );
    expect(glasImDunkeln.map((r) => r.selektor)).toEqual([]);
  });
});

/* ── Die Seitenleiste im Dunkeln ──────────────────────────────────────────── */

/*
 * `design-neu.css` setzte `--sidebar-accent` nur fuer hell. Im Dunkeln erbte
 * die Seitenleiste Blau 50 als Flaeche unter Blau 700 als Schrift, etwa
 * 2,7:1 (Rollenwahl, Menue-Eintraege beim Ueberfahren). Die Datei gilt auch
 * ohne Glas, deshalb wird hier ihr Dunkelblock selbst geprueft.
 */
describe("Seitenleiste im Dunkeln", () => {
  const neu = readFileSync(resolve(__dirname, "design-neu.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const dunkel = regeln(neu).find((r) => r.selektor === '[data-design="neu"].dark');

  it("setzt Flaeche und Schrift fuer den hervorgehobenen Eintrag eigens", () => {
    expect(dunkel).toBeDefined();
    expect(() => token(dunkel!.inhalt, "sidebar-accent")).not.toThrow();
    expect(() => token(dunkel!.inhalt, "sidebar-accent-foreground")).not.toThrow();
  });

  it("haelt dort 4,5:1, fuer die hervorgehobene und die normale Schrift", () => {
    const flaeche = ausToken(token(dunkel!.inhalt, "sidebar-accent"));
    for (const name of ["sidebar-accent-foreground", "sidebar-foreground"]) {
      const k = kontrast(ausToken(token(dunkel!.inhalt, name)), flaeche);
      expect(k, `${name} faellt auf ${k.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("hebt die Flaeche vom Grund der Seitenleiste ab", () => {
    const grund = helligkeit(ausToken(token(dunkel!.inhalt, "sidebar-background")));
    expect(helligkeit(ausToken(token(dunkel!.inhalt, "sidebar-accent")))).toBeGreaterThan(grund);
  });
});

/* ── Vollbildseiten ausserhalb des CRM-Geruests ───────────────────────────── */

/*
 * Jede Vollbildseite brachte an ihrer aeussersten Huelle eine deckende
 * Flaeche mit und deckte damit den bewegten Grund zu. Die Huelle traegt
 * deshalb `data-lg="seite"`, und genau eine Regel macht sie durchsichtig.
 * Der Test sucht in allen Seiten nach solchen Huellen: Eine neue Seite ohne
 * Haken faellt hier auf, nicht erst am Bildschirm.
 */
describe("Vollbildseiten zeigen den Grund", () => {
  const huelle = block('[data-glas="liquid"] body [data-lg="seite"]');

  it("macht nur die markierte Huelle durchsichtig", () => {
    expect(huelle?.inhalt).toMatch(/background-color:\s*transparent/);
    expect(huelle?.inhalt).toMatch(/background-image:\s*none/);
  });

  it("biegt bg-background nicht global um, Eingabefelder und Knoepfe bleiben deckend", () => {
    const durchsichtig = alle.filter((r) => /background(-color)?:\s*transparent/.test(r.inhalt));
    for (const r of durchsichtig) expect(r.selektor, r.selektor).not.toMatch(/bg-background|input|textarea|data-ui="field"/);
  });

  it("macht klebende Kopfleisten zu Glas ueber die Tokens der Schicht", () => {
    const scheibe = block('[data-glas="liquid"] [data-lg="kopfscheibe"]');
    expect(scheibe?.inhalt).toMatch(/backdrop-filter:\s*var\(--lg-filter-leiste\)/);
    expect(scheibe?.inhalt).toMatch(/background-color:\s*hsl\(var\(--lg-glas\) \/ var\(--lg-deckkraft-schwebend\)\)/);
    expect(block('[data-glas="liquid"] [data-lg="kopfscheibe"]:has(.fixed)')?.inhalt).toMatch(/backdrop-filter:\s*none/);
  });

  const quelle = resolve(__dirname, "..");
  const dateien = [
    ...readdirSync(resolve(quelle, "pages"))
      .filter((d) => d.endsWith(".tsx") && !d.includes(".test."))
      .map((d) => `pages/${d}`),
    "components/LoadingFallback.tsx",
    "components/ErrorBoundary.tsx",
    "components/DashboardLayout.tsx",
  ];

  /* Bewusst ohne Haken, jeweils mit Grund (Auftrag vom 24.09.2026). */
  const ausnahmen: Record<string, string> = {
    "pages/ObjektExpose.tsx": "Exposé kommt zuletzt",
    "pages/ObjektExposeGesamt.tsx": "Exposé kommt zuletzt",
    "pages/ObjektvorstellungPublic.tsx": "Kundenansicht eines Objekts, kommt mit dem Exposé",
    "pages/Beratungspraesentation.tsx": "Beratungspraesentationen bleiben unberuehrt",
    "pages/BeratungspraesentationHV.tsx": "Beratungspraesentationen bleiben unberuehrt",
    "pages/BeratungspraesentationWG.tsx": "Beratungspraesentationen bleiben unberuehrt",
    "pages/BeraterMicroseite.tsx": "eigene Glasregeln in beraterMicroseiteLiquid.css",
  };

  /* Ein oeffnendes Element mit voller Hoehe und eigener deckender Flaeche. */
  const vollbild =
    /<(div|main|section)\b[^>]*className="(?=[^"]*(min-h-screen|min-h-dvh|min-h-\[100dvh\]|\bh-screen)(?![\w-]))(?=[^"]*\b(bg-background|bg-white|bg-muted|bg-gradient))[^"]*"[^>]*>/g;

  it("findet die Huellen ueberhaupt", () => {
    const login = readFileSync(resolve(quelle, "pages/Login.tsx"), "utf8");
    expect(login.match(vollbild)?.length).toBeGreaterThan(0);
  });

  it("markiert jede deckende Vollbildhuelle", () => {
    const ohne: string[] = [];
    for (const datei of dateien) {
      if (datei in ausnahmen) continue;
      const inhalt = readFileSync(resolve(quelle, datei), "utf8");
      for (const treffer of inhalt.match(vollbild) ?? []) {
        if (!treffer.includes('data-lg="seite"')) ohne.push(`${datei}: ${treffer.slice(0, 90)}`);
      }
    }
    expect(ohne).toEqual([]);
  });

  it.each([
    "pages/Login.tsx",
    "pages/ResetPassword.tsx",
    "pages/PortalAktivieren.tsx",
    "pages/Aktivieren.tsx",
    "pages/VertriebspartnerLanding.tsx",
    "pages/KarrierePage.tsx",
    "pages/BewerbenPage.tsx",
    "pages/AnalysePublic.tsx",
    "pages/LinksPublic.tsx",
    "pages/Impressum.tsx",
    "pages/Datenschutz.tsx",
    "pages/Unsubscribe.tsx",
    "pages/MobileScan.tsx",
    "pages/NotFound.tsx",
    "pages/SelbstauskunftPublic.tsx",
    "pages/SignaturSeite.tsx",
    "pages/SaMobileSign.tsx",
    "pages/SteuerrechnerPublic.tsx",
    "pages/BewerberVideocallModeration.tsx",
    "pages/PraesentationsUebung.tsx",
    "pages/TippgeberPortal.tsx",
    "pages/Kundenprofilseite.tsx",
    "components/LoadingFallback.tsx",
    "components/ErrorBoundary.tsx",
    "components/DashboardLayout.tsx",
  ])("%s traegt den Haken", (datei) => {
    expect(readFileSync(resolve(quelle, datei), "utf8")).toContain('data-lg="seite"');
  });
});

/* ── Nachgebaute Karten ───────────────────────────────────────────────────── */

describe("Nachgebaute Karten tragen den Kartenhaken", () => {
  const quelle = resolve(__dirname, "..");
  const lies = (datei: string) => readFileSync(resolve(quelle, datei), "utf8");

  it.each(["components/ui/section-card.tsx", "components/ui/settings-list.tsx", "components/ui/stat-tile.tsx"])(
    "%s ist eine Karte",
    (datei) => {
      expect(lies(datei)).toContain('data-ui="card"');
    },
  );

  it("macht den weissen Arbeitsbereich des Steuerrechners zur Karte", () => {
    expect(lies("components/steuerrechner/SteuerRechnerStrecke.tsx")).toMatch(/data-ui="card" className="steuer-workspace bg-card"/);
  });

  it("laesst Unterschriftsfelder deckend", () => {
    // Die Flaeche zum Unterschreiben (`touch-none`) wird nie Glas.
    for (const datei of ["pages/SignaturSeite.tsx", "pages/SaMobileSign.tsx", "components/selbstauskunft/SelbstauskunftForm.tsx"]) {
      const felder = lies(datei).match(/<div\b[^>]*touch-none[^>]*>/g) ?? [];
      expect(felder.length, datei).toBeGreaterThan(0);
      for (const feld of felder) expect(feld, datei).not.toContain('data-ui="card"');
    }
  });

  it("laesst die Kundenansicht in Galerie und Unterlagen, wie sie ist", () => {
    // Beide Bausteine stehen auch in der Kundenansicht, die zuletzt kommt.
    expect(lies("components/objektseite/Galerie.tsx")).toContain('data-ui={kundenModus ? undefined : "card"}');
    expect(lies("components/objektseite/DokumenteAnsicht.tsx")).toContain('data-ui={kundenModus ? undefined : "card"}');
  });

  it("gibt der Kapitelliste der Akademie eine Einlage ohne Weichzeichnung", () => {
    const zeile = block('[data-glas="liquid"] .an-root .an-kapitel');
    expect(zeile?.inhalt).toMatch(/--lg-deckkraft-einlage/);
    expect(zeile?.inhalt).not.toMatch(/backdrop-filter/);
  });
});
