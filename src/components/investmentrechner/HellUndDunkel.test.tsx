import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TooltipProvider } from "@/components/ui/tooltip";
import { berechneInvestment, standardEingabe } from "@/lib/investmentrechner/rechenkern";
import { leereUnterlagenDaten } from "@/lib/investmentrechner/unterlagenAuslesen";
import { ExposeDokument, type ExposeObjekt } from "./ExposeDokument";
import { InvestmentrechnerInhalt } from "./InvestmentrechnerInhalt";

/*
 * Hell und dunkel im Rechner.
 *
 * Der Rechner folgt seit dem 22.09.2026 dem Modus, den der Nutzer oben im
 * Menü wählt. Das Dokument nicht: Die Ansicht „Berechnung" samt Vorschau und
 * alles, was gedruckt wird, bleibt weiß mit dunkler Schrift.
 *
 * Geprüft wird hier nicht das Aussehen, sondern die Mechanik dahinter, so wie
 * es ExposeTabellenbreite.test.tsx für die Tabellenbreite tut. Der Modus
 * hängt an einer Klasse am <html>, und jsdom rechnet weder Kaskade noch
 * `var()` aus. Gelesen wird deshalb das Stylesheet selbst:
 *
 *   - Holt sich das Dokument jede Variable zurück, die der Dunkelmodus
 *     ersetzt?
 *   - Bleibt der Dunkelmodus bei Variablen, statt einem Bauteil eine feste
 *     Farbe zu geben? Eine feste Farbe käme im Dokument nicht mehr weg.
 *   - Ist das Blatt weiß, und bleibt es das im Druck?
 *   - Reicht der Kontrast im Dunkelmodus, auch bei der leisesten Schrift?
 *
 * Dazu zwei Prüfungen am gerenderten Baum: Die Klassen, an denen die
 * Selektoren hängen, müssen auch wirklich im Markup stehen.
 */

const CSS = readFileSync(resolve(process.cwd(), "src/styles/investmentrechner.css"), "utf8");
const HAUS_CSS = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

/** Kommentare raus, Umbrüche zu Leerzeichen: So steht jeder Selektor am Stück. */
function flach(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const RECHNER = flach(CSS);
const HAUS = flach(HAUS_CSS);

/** Der Inhalt der Regel, die mit diesem Selektor anfängt. */
function koerper(css: string, selektor: string): string {
  const start = css.indexOf(`${selektor} {`);
  expect(start, `Regel "${selektor}" fehlt`).toBeGreaterThanOrEqual(0);
  const ab = css.indexOf("{", start) + 1;
  const bis = css.indexOf("}", ab);
  return css.slice(ab, bis);
}

/** Die Variablen einer Regel als Name zu Wert. */
function variablen(block: string): Map<string, string> {
  const gefunden = new Map<string, string>();
  for (const treffer of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    gefunden.set(treffer[1], treffer[2].trim());
  }
  return gefunden;
}

/*
  Der helle Block trägt drei Selektoren: die Oberfläche im Hellmodus und,
  eine Klasse länger als der Dunkelmodus, das Dokument und das Druckstück.
  Damit stehen die Werte des Papiers genau einmal in der Datei.
*/
const HELLER_SELEKTOR =
  ".investmentrechner, .dark .investmentrechner .expose-document, .dark .investmentrechner.investmentrechner-print";
const HELL = variablen(koerper(RECHNER, HELLER_SELEKTOR));
const DUNKEL = variablen(koerper(RECHNER, ".dark .investmentrechner"));

describe("Der Aufbau der Farbschichten", () => {
  it("gibt dem Dokument dieselbe Regel wie dem Hellmodus", () => {
    // Steht das Dokument nicht in dieser Liste, bleibt es im Dunkelmodus dunkel.
    expect(RECHNER).toContain(`${HELLER_SELEKTOR} {`);
    expect(HELL.size).toBeGreaterThan(30);
  });

  it("holt dem Dokument jede Variable zurück, die der Dunkelmodus ersetzt", () => {
    const ohneRueckweg = [...DUNKEL.keys()].filter((name) => !HELL.has(name));
    expect(ohneRueckweg, "Variablen ohne hellen Wert").toEqual([]);
  });

  it("färbt im Dunkelmodus nur Variablen, niemals ein einzelnes Bauteil", () => {
    /*
      Sobald im Dunkelmodus eine feste Farbe an einer Kachel, einer Tabelle
      oder einem Kasten stünde, nähme das Dokument sie mit: Es kann nur
      Variablen zurückholen, keine fertigen Regeln.
    */
    const erlaubt = [
      ".investmentrechner, .dark .investmentrechner .expose-document, .dark .investmentrechner.investmentrechner-print",
      ".dark .investmentrechner",
    ];
    // Die Klasse .dark, nicht .dark-text: Das Exposé hat eine Klasse, die so anfängt.
    const mitDunkel = [...RECHNER.matchAll(/([^{}]+)\{/g)]
      .map((treffer) => treffer[1].trim())
      .filter((auswahl) => !auswahl.startsWith("@") && /\.dark(?![\w-])/.test(auswahl));
    expect(mitDunkel).toEqual(erlaubt);

    const eigeneFarbe = [...DUNKEL.keys()].length;
    const alleZeilen = koerper(RECHNER, ".dark .investmentrechner").split(";").filter((z) => z.trim());
    // Keine Zeile im Dunkelblock, die keine Variable setzt.
    expect(alleZeilen).toHaveLength(eigeneFarbe);
  });

  it("benutzt keine Variable, die nirgends gesetzt wird", () => {
    // Von aussen: die Tokens des Haus-Designs aus index.css.
    const vonAussen = new Set([
      "--success",
      "--destructive",
      "--foreground",
      "--card",
      "--background",
      "--border",
      "--primary",
      "--primary-foreground",
    ]);
    // An Ort und Stelle gesetzt: Zoom der Vorschau, Radien der Exposéseite,
    // die Startwerte der Tailwind-Einblendung.
    const oertlich = /^--(expose-zoom|expose-radius|expose-radius-klein|tw-enter-)/;
    const unbekannt = [...new Set([...RECHNER.matchAll(/var\((--[a-z0-9-]+)/g)].map((t) => t[1]))]
      .filter((name) => !HELL.has(name) && !vonAussen.has(name) && !oertlich.test(name))
      .sort();
    expect(unbekannt, "Variablen ohne Wert").toEqual([]);
  });
});

describe("Das Dokument bleibt Papier", () => {
  it("hat ein weisses Blatt, ohne Variable und damit ohne Umweg", () => {
    const blatt = koerper(RECHNER, ".investmentrechner .expose-page");
    expect(blatt).toContain("background: #fff;");
  });

  it("rechnet seine Schriftfarbe neu, statt sie vom Rechner zu erben", () => {
    /*
      `.investmentrechner` schreibt `color: var(--ink)`. Gerechnet wird das
      dort, im Dunkelmodus also mit dem hellen Wert, und die Kinder erben die
      fertige Farbe. Ohne diese Zeile käme der zurückgeholte Wert nie an.
    */
    expect(koerper(RECHNER, ".investmentrechner .expose-document")).toContain("color: var(--ink);");
  });

  it("bleibt im Druck weiss, was immer jemand an den Variablen dreht", () => {
    const druck = RECHNER.slice(RECHNER.indexOf("@media print {"));
    expect(druck).toContain(".investmentrechner .expose-page { background: #fff !important; color: #0F1621 !important; }");
    expect(druck).toContain("body.investmentrechner-druck { -webkit-print-color-adjust: exact;");
    expect(druck).toContain("background: #fff !important;");
  });

  it("setzt die Schrift des Papiers auf dunkle Werte, nicht auf Tokens", () => {
    // Tokens folgen dem Modus. Im Dokument wäre das genau falsch.
    for (const name of ["--ink", "--text-1", "--text-2", "--text-3", "--muted", "--flaeche"]) {
      expect(HELL.get(name), name).toMatch(/^#[0-9A-Fa-f]{3,6}$/);
    }
  });
});

/* ── Kontrast ──────────────────────────────────────────────────────────── */

type Rgb = [number, number, number];

function ausHsl(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hs = h / 60;
  const x = c * (1 - Math.abs((hs % 2) - 1));
  const teil: Rgb = hs < 1 ? [c, x, 0] : hs < 2 ? [x, c, 0] : hs < 3 ? [0, c, x] : hs < 4 ? [0, x, c] : hs < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return [teil[0] + m, teil[1] + m, teil[2] + m];
}

function ausHex(hex: string): Rgb {
  const voll = hex.length === 4 ? hex[1].repeat(2) + hex[2].repeat(2) + hex[3].repeat(2) : hex.slice(1);
  return [0, 2, 4].map((i) => parseInt(voll.slice(i, i + 2), 16) / 255) as Rgb;
}

/** Die Tokens aus dem .dark-Block von index.css, etwa "--card" zu "210 12% 14%". */
const HAUS_DUNKEL = variablen(koerper(HAUS, ".dark"));

/** Einen Wert aus dem Stylesheet zu RGB auflösen, auch über hsl(var(--token)). */
function farbe(wert: string): Rgb {
  if (wert.startsWith("#")) return ausHex(wert);
  const ueberToken = /^hsl\(var\((--[a-z-]+)\)\)$/.exec(wert);
  const roh = ueberToken ? HAUS_DUNKEL.get(ueberToken[1]) : /^hsl\(([^)]+)\)$/.exec(wert)?.[1];
  expect(roh, `Farbe "${wert}" nicht auflösbar`).toBeTruthy();
  const teile = (roh as string).split(/[\s/]+/);
  return ausHsl(Number(teile[0]), Number(teile[1].replace("%", "")) / 100, Number(teile[2].replace("%", "")) / 100);
}

function helligkeit(rgb: Rgb): number {
  const [r, g, b] = rgb.map((wert) => (wert <= 0.03928 ? wert / 12.92 : ((wert + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function kontrast(vorne: string, hinten: string): number {
  const a = helligkeit(farbe(vorne));
  const b = helligkeit(farbe(hinten));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Der Wert im Dunkelmodus, sonst der helle: genau das sieht der Nutzer dort. */
function imDunkeln(name: string): string {
  const wert = DUNKEL.get(name) ?? HELL.get(name);
  expect(wert, `${name} fehlt`).toBeTruthy();
  return wert as string;
}

describe("Kontrast im Dunkelmodus", () => {
  it("hält die ganze Schriftleiter auf der Karte über 4,5:1", () => {
    // Auch die leiseste Stufe. Zahlen in Tabellen und Kacheln muss man lesen
    // können, ohne sich vorzubeugen.
    for (const name of ["--ink", "--text-1", "--text-2", "--text-3", "--muted", "--text-schwach"]) {
      expect(kontrast(imDunkeln(name), imDunkeln("--flaeche")), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("hält die Schrift auf den dunklen Kacheln über 4,5:1", () => {
    const auf: [string, string][] = [
      ["--auf-dunkel", "--flaeche-dunkel"],
      ["--auf-dunkel-leise", "--flaeche-dunkel"],
      ["--blau-hell", "--flaeche-dunkel-2"],
      ["--gruen-hell", "--flaeche-dunkel-3"],
      ["--gruen-hell-leise", "--flaeche-dunkel-3"],
      ["--rot-hell", "--flaeche-dunkel-3"],
      ["--auf-dunkel-schwach", "--flaeche-dunkel-3"],
      ["--auf-aktiv", "--flaeche-aktiv"],
    ];
    for (const [schrift, grund] of auf) {
      expect(kontrast(imDunkeln(schrift), imDunkeln(grund)), `${schrift} auf ${grund}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("dreht die Schrift auf dem Akzentblau mit, statt Weiss auf Hellblau zu setzen", () => {
    // --primary ist im Dunkelmodus ein helles Blau. Bliebe die Schrift weiss,
    // stünde sie auf dem Knopf „Als PDF" praktisch nicht mehr da.
    expect(kontrast(imDunkeln("--auf-akzent"), imDunkeln("--gold"))).toBeGreaterThanOrEqual(4.5);
  });

  it("lässt Rot lesbar, obwohl das Haus-Token im Dunkelmodus dunkler wird", () => {
    // --destructive liegt dort bei 35 Prozent Helligkeit, das wäre als Schrift
    // auf dunklem Grund nicht mehr zu lesen.
    expect(DUNKEL.get("--red"), "--red muss im Dunkelmodus eigens gesetzt sein").toBeTruthy();
    expect(kontrast(imDunkeln("--red"), imDunkeln("--flaeche"))).toBeGreaterThanOrEqual(4.5);
  });
});

/* ── Die Klassen im Markup ─────────────────────────────────────────────── */

function exposeObjekt(): ExposeObjekt {
  const input = { ...standardEingabe, propertyTitle: "Musterwohnanlage, WE 7" };
  return { input, result: berechneInvestment(input), photos: [], documents: [], documentData: leereUnterlagenDaten };
}

describe("Die Klassen, an denen die Regeln hängen", () => {
  it("stehen im Dokument: expose-document um jede Seite", () => {
    const { container } = render(<ExposeDokument {...exposeObjekt()} />);
    const dokument = container.querySelector(".expose-document");
    expect(dokument, "expose-document fehlt").toBeTruthy();
    expect(dokument!.querySelectorAll(".expose-page").length).toBeGreaterThan(0);
  });

  it("stehen am Druckstück: investmentrechner und investmentrechner-print zusammen", () => {
    render(
      <TooltipProvider>
        <InvestmentrechnerInhalt />
      </TooltipProvider>,
    );
    // Das Druckstück hängt per Portal am body, nicht im gerenderten Baum.
    const druck = document.body.querySelector(".investmentrechner-print");
    expect(druck, "Druckstück fehlt").toBeTruthy();
    expect(druck!.classList.contains("investmentrechner")).toBe(true);
    expect(druck!.querySelector(".expose-document"), "expose-document im Druckstück fehlt").toBeTruthy();
  });
});
