/**
 * Waechter ueber Liquid Glass auf den Beratungspraesentationen und in der
 * Moderation (`praesentation-liquid.css`).
 *
 * Dasselbe Muster wie der Abschnitt zur Berater-Mikroseite in
 * `design-liquid.test.ts`: Fuer diese Datei gelten die Grenzen der
 * gemeinsamen Schicht, bis auf `!important`, das sie gegen `.beratung-apple`
 * (index.css) braucht. Eine eigene Testdatei, damit parallele Arbeit an der
 * gemeinsamen Schicht nicht in dieselbe Datei schreibt.
 *
 * Dazu kommt der PDF-Export: Er fotografiert eine Kopie, in der `data-glas`
 * auf `an` steht (`ohneLiquidGlasInKopie`). Keine Regel darf dort greifen.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ohneLiquidGlasInKopie } from "@/lib/designSchalter";

const css = readFileSync(resolve(__dirname, "praesentation-liquid.css"), "utf8");
const regelwerk = css.replace(/\/\*[\s\S]*?\*\//g, "");
const schicht = readFileSync(resolve(__dirname, "design-liquid.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

type Regel = { selektor: string; inhalt: string; rahmen: string[] };

/** Zerlegt die Datei in Regeln samt ihrer @-Bloecke (wie in `design-liquid.test.ts`). */
function regeln(quelle: string): Regel[] {
  const ergebnis: Regel[] = [];
  const stapel: string[] = [];
  let puffer = "";
  for (const zeichen of quelle) {
    if (zeichen === "{") {
      stapel.push(puffer.trim());
      puffer = "";
    } else if (zeichen === "}") {
      const kopf = stapel.pop() ?? "";
      if (!kopf.startsWith("@") && puffer.trim() !== "") {
        ergebnis.push({ selektor: kopf.replace(/\s+/g, " "), inhalt: puffer.trim(), rahmen: [...stapel] });
      }
      puffer = "";
    } else {
      puffer += zeichen;
    }
  }
  return ergebnis;
}

/**
 * Die Klammertiefe je Zeichen. Zeichen in Anfuehrungszeichen zaehlen nicht:
 * `[class*="bg-[#"]` enthaelt eine offene Klammer als Text.
 */
function* tiefen(text: string): Generator<[string, number]> {
  let tiefe = 0;
  let inText = false;
  for (const zeichen of text) {
    if (zeichen === '"') inText = !inText;
    else if (!inText && (zeichen === "(" || zeichen === "[")) tiefe++;
    else if (!inText && (zeichen === ")" || zeichen === "]")) tiefe--;
    yield [zeichen, inText ? -1 : tiefe];
  }
}

/** Teilt eine Selektorliste nur an den Kommas der obersten Ebene. */
function teile(selektor: string): string[] {
  const liste: string[] = [];
  let aktuell = "";
  for (const [zeichen, tiefe] of tiefen(selektor)) {
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

const alle = regeln(regelwerk);
const seiten = resolve(__dirname, "../pages");
const quelle = (datei: string) => readFileSync(resolve(seiten, datei), "utf8");
const BERATUNG = ["Beratungspraesentation.tsx", "BeratungspraesentationHV.tsx", "BeratungspraesentationWG.tsx"];

describe("Liquid Glass auf den Praesentationen: Einbau", () => {
  it.each([...BERATUNG, "PraesentationsUebung.tsx"])("%s laedt die Datei", (datei) => {
    expect(quelle(datei)).toContain('import "@/styles/praesentation-liquid.css";');
  });

  it.each(BERATUNG)("%s traegt die Haken an der aeusseren Huelle und an der Kopfleiste", (datei) => {
    // Die Huelle ist das Element mit `min-h-screen bg-background`, darin liegen Kopfleiste, Hero und `.beratung-apple`.
    const inhalt = quelle(datei);
    expect(inhalt).toMatch(/className="min-h-screen bg-background text-foreground font-sans" data-lg="seite" data-praesentation="beratung"/);
    expect(inhalt).toMatch(/<header data-lg="kopfscheibe" className="sticky top-0/);
  });

  it("die Moderation traegt den Haken an ihrem Inhaltsbereich, nicht an der Buehne", () => {
    const inhalt = quelle("PraesentationsUebung.tsx");
    expect(inhalt).toMatch(/data-testid="uebungs-moderation" data-praesentation="moderation"/);
    expect(inhalt).not.toMatch(/data-testid="uebungs-buehne"[^>]*data-praesentation/);
  });
});

describe("Liquid Glass auf den Praesentationen: Grenzen der Schicht", () => {
  it("liest Regeln aus der Datei", () => {
    expect(alle.length).toBeGreaterThan(10);
  });

  it("haengt jede Regel an Liquid Glass", () => {
    // Im PDF-Export steht `data-glas` auf `an`: Dann greift keine Zeile.
    const ohneAnker = alle.filter((r) =>
      teile(r.selektor).some(
        (teil) => !/^\[data-glas="liquid"\](:not\(\.dark\)|\.dark)? /.test(teil),
      ),
    );
    expect(ohneAnker.map((r) => r.selektor)).toEqual([]);
  });

  it("wirkt nur auf dem Bildschirm", () => {
    const ohneScreen = alle.filter((r) => !r.rahmen.some((k) => k.startsWith("@media") && k.includes("screen")));
    expect(ohneScreen.map((r) => r.selektor)).toEqual([]);
  });

  it("neigt keine Kachel", () => {
    expect(regelwerk).not.toMatch(/rotate[XY]|perspective\(|--rx|--ry|data-lg-neigung/);
  });

  it("zeichnet nur ueber die Tokens der Schicht weich", () => {
    // So gelten deren Ruecksichten mit: am Handy keine Weichzeichnung auf Karten, bei weniger Transparenz keine.
    const weich = alle.filter((r) => /backdrop-filter:(?!\s*none)/.test(r.inhalt));
    expect(weich.length).toBeGreaterThan(0);
    for (const r of weich) {
      expect(r.inhalt, r.selektor).toMatch(/(^|;)\s*backdrop-filter:\s*var\(--lg-filter-(karte|leiste|schwebend)\)/);
    }
  });

  it("bringt keine eigene Farbe mit", () => {
    // Keine Hex- und keine rgb-Werte in den Werten. Jeder feste hsl-Wert und jeder
    // rohe Tokenwert steht genau so schon in der gemeinsamen Schicht.
    const werte = alle.map((r) => r.inhalt).join("\n");
    expect(werte).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(werte).not.toMatch(/rgba?\(/);
    const fest = [...werte.matchAll(/hsl\((\d[^)]*)\)/g)].map((m) => m[0]);
    expect(fest.filter((wert) => !schicht.includes(wert))).toEqual([]);
    const roh = [...werte.matchAll(/--[a-z-]+:\s*(\d+ \d+% \d+%)/g)].map((m) => m[1]);
    expect(roh.length).toBeGreaterThan(0);
    expect(roh.filter((wert) => !schicht.includes(wert))).toEqual([]);
  });

  it("macht Huelle und Kopfleiste nicht selbst zu Glas, das ist Sache der gemeinsamen Schicht", () => {
    expect(regelwerk).not.toContain('[data-lg="seite"]');
    expect(regelwerk).not.toContain('[data-lg="kopfscheibe"]');
    expect(alle.filter((r) => r.selektor.endsWith("> header")).map((r) => r.selektor)).toEqual([]);
  });
});

describe("Liquid Glass auf den Praesentationen: was Glas wird und was bleibt", () => {
  const karte = alle.find((r) => r.selektor.includes(".beratung-apple :is(div, details, article, li):is(") && /--lg-filter-karte/.test(r.inhalt));

  it("macht die Karten unter dem Hero mit dem Karten-Token zu Glas, in der Deckkraft der Schicht", () => {
    expect(karte?.inhalt).toMatch(/backdrop-filter:\s*var\(--lg-filter-karte\)/);
    expect(karte?.inhalt).toMatch(/background-color:\s*hsl\(var\(--lg-glas\) \/ var\(--lg-deckkraft\)\)/);
  });

  it("gibt es unter dem Hero nur im Hellen, dort ist `.beratung-apple` auch im Dunkeln eine weisse Flaeche", () => {
    const glasUnterHero = alle.filter((r) => r.selektor.includes(".beratung-apple") && /backdrop-filter:(?!\s*none)|--lg-glas/.test(r.inhalt));
    expect(glasUnterHero.length).toBeGreaterThan(0);
    for (const r of glasUnterHero) expect(r.selektor, r.selektor).toMatch(/^\[data-glas="liquid"\]:not\(\.dark\) /);
  });

  it("laesst die dunklen Abschnitte dunkel", () => {
    expect(karte?.selektor).toContain(":is(.beratung-dark, #kontakt) *");
    expect(karte?.selektor).toMatch(/:not\([^]*\.beratung-dark,/);
  });

  it("schreibt Blau auf Glas in Blau 700, nicht im hellen Blau der Apple-Flaeche", () => {
    const blau = alle.find((r) => r.selektor.includes("h2 .italic"));
    expect(blau?.inhalt).toMatch(/color:\s*hsl\(var\(--lg-schrift-blau\)\) !important/);
    // Auf dunklen Flaechen bleibt das helle Blau.
    expect(blau?.selektor).toContain(":is(.beratung-dark, #kontakt,");
  });

  it("setzt im Dunkeln auf der weissen Flaeche das Blau der hellen Schicht", () => {
    const hellesBlauHell = schicht.match(/\[data-glas="liquid"\] \{[^}]*--lg-schrift-blau:\s*([^;]+);/)?.[1].trim();
    const dunkel = alle.find((r) => r.selektor === '[data-glas="liquid"].dark [data-praesentation="beratung"] .beratung-apple');
    expect(hellesBlauHell).toBeDefined();
    expect(dunkel?.inhalt).toContain(`--lg-schrift-blau: ${hellesBlauHell}`);
  });

  it("holt die dunklere Grauschrift der Schicht, statt sie zu wiederholen", () => {
    const flaeche = alle.find((r) => r.selektor.endsWith(".beratung-apple") && r.selektor.includes(":not(.dark)"));
    expect(flaeche?.inhalt).toMatch(/--b-ink-muted:\s*var\(--muted-foreground\)/);
  });

  it("fasst die Folien der Moderation nicht an", () => {
    // Die Buehnen sind bewusst dunkel, dieselben Folien wie unter /closing-praesentation-entwurf.
    const moderation = alle.filter((r) => r.selektor.includes('[data-praesentation="moderation"]') && /background-color/.test(r.inhalt));
    expect(moderation.length).toBeGreaterThan(0);
    for (const r of moderation) expect(r.selektor).toContain('[data-testid="uebungs-vorschau"] *');
    expect(regelwerk).not.toMatch(/uebungs-buehne|druckstapel|cp-glanz/i);
  });
});

/*
 * jsdom (nwsapi) kennt keine Nachfahren-Selektoren in `:not()`, etwa
 * `:not(:is(.beratung-dark, #kontakt) *)`; die Browser koennen das seit
 * Jahren. Fuer den DOM-Nachweis fallen genau diese Eintraege weg. Dass sie
 * dastehen, pruefen die Tests oben am Text.
 */
function ohneNachfahrenAusschluss(selektor: string): string {
  let ergebnis = "";
  let i = 0;
  while (i < selektor.length) {
    if (selektor.startsWith(":not(", i)) {
      let tiefe = 1;
      let j = i + 5;
      while (j < selektor.length && tiefe > 0) {
        if (selektor[j] === "(") tiefe++;
        if (selektor[j] === ")") tiefe--;
        j++;
      }
      const innen = selektor.slice(i + 5, j - 1);
      const eintraege = teile(innen).filter((e) => {
        for (const [z, t] of tiefen(e)) if (z === " " && t === 0) return false;
        return true;
      });
      if (eintraege.length) ergebnis += `:not(${eintraege.map(ohneNachfahrenAusschluss).join(", ")})`;
      i = j;
    } else {
      ergebnis += selektor[i];
      i++;
    }
  }
  return ergebnis;
}

/*
 * Der Nachweis am DOM: eine kleine Praesentation und eine Moderation, einmal
 * mit Liquid Glass, einmal als Kopie des PDF-Exports. Mit Glas findet jede
 * Regel ihre Flaeche, in der Kopie keine einzige.
 */
describe("Liquid Glass auf den Praesentationen: PDF-Export", () => {
  function baue(): Document {
    const doc = document.implementation.createHTMLDocument("probe");
    doc.documentElement.dataset.glas = "liquid";
    doc.body.innerHTML = `
      <div class="lg-grund"></div>
      <div data-lg="seite" data-praesentation="beratung">
        <header class="sticky"><div class="bg-background">Menue</div></header>
        <section id="hero"><div class="rounded-3xl bg-card border"><div class="rounded-2xl bg-muted">Logo</div></div></section>
        <div class="beratung-apple">
          <section class="bg-muted/30">
            <div class="text-primary font-semibold uppercase">Augenbraue</div>
            <h2>Titel <span class="italic">Akzent</span></h2>
            <div class="rounded-2xl border border-border bg-card"><div class="rounded-xl border border-border bg-muted/40">Einlage</div></div>
            <div class="rounded-2xl border bg-primary/5">Getoent</div>
            <div class="bg-primary/10 text-center">Zeile</div>
            <p class="text-muted-foreground/70">Quelle</p>
            <table><tr><td style="color: rgb(24, 127, 88);">Blau</td></tr></table>
          </section>
          <section class="beratung-dark"><div class="rounded-2xl border border-border bg-card">Dunkel</div></section>
        </div>
        <footer>Fuss</footer>
        <button class="fixed bg-primary">Zur Selbstauskunft</button>
      </div>
      <main data-praesentation="moderation">
        <div data-testid="uebungs-vorschau" class="rounded-lg border bg-[#070D1A]"><div class="rounded-lg border">Folie</div></div>
        <div class="rounded-lg border bg-amber-50/60"><div class="rounded-md border bg-primary/5">Sprechtext</div></div>
        <div class="rounded-md border bg-red-50">Einwand</div>
        <div class="rounded-md border bg-green-50">Erledigt</div>
        <div data-ui="card"><div class="rounded-lg border">In der Karte</div></div>
      </main>`;
    return doc;
  }

  // Nur die Selektoren ohne Zustand (`:hover`), die an einem Element haengen.
  const selektoren = alle
    .flatMap((r) => teile(r.selektor))
    .filter((s) => !s.includes(":hover"))
    .map(ohneNachfahrenAusschluss);

  /*
   * Auch in `:is()` kennt nwsapi weder Nachfahren (`h2 .italic`) noch ein
   * `:not()`, und verschachtelte `:is()`/`:not()` beantwortet es falsch,
   * obwohl es jeden Teil fuer sich richtig auswertet (geprueft am
   * 24.09.2026). Solche Selektoren beantwortet es stumm mit "kein Treffer".
   * Fuer den Nachweis "mit Glas greift es" zaehlen deshalb nur die anderen;
   * fuer "in der Kopie greift nichts" zaehlen alle, dort sichert der
   * Ankertest oben zusaetzlich ab. Die ausgenommenen Kartenregeln sind im
   * Browser nachgesehen (Aufnahmen unter /private/tmp/liquid-praesentationen).
   */
  /** Ob ein `:is(` oder `:not(` innerhalb eines anderen steht. */
  const verschachtelt = (s: string) => {
    let offen = 0;
    const stapel: boolean[] = [];
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "(") {
        const pseudo = /:(is|not)$/.test(s.slice(0, i));
        if (pseudo && offen > 0) return true;
        stapel.push(pseudo);
        if (pseudo) offen++;
      } else if (s[i] === ")") {
        if (stapel.pop()) offen--;
      }
    }
    return false;
  };
  const jsdomKann = (s: string) => {
    if (verschachtelt(s)) return false;
    for (const m of s.matchAll(/:is\(/g)) {
      let tiefe = 1;
      let j = (m.index ?? 0) + 4;
      let innen = "";
      while (j < s.length && tiefe > 0) {
        if (s[j] === "(") tiefe++;
        if (s[j] === ")") tiefe--;
        if (tiefe > 0) innen += s[j];
        j++;
      }
      if (innen.includes(":not(") || teile(innen).some((e) => [...tiefen(e)].some(([z, t]) => z === " " && t === 0))) return false;
    }
    return true;
  };

  it("findet mit Liquid Glass fuer jede Regel ihre Flaeche, hell und dunkel", () => {
    for (const dunkel of [false, true]) {
      const doc = baue();
      doc.documentElement.classList.toggle("dark", dunkel);
      const gueltig = selektoren
        .filter((s) => !s.startsWith(dunkel ? '[data-glas="liquid"]:not(.dark) ' : '[data-glas="liquid"].dark '))
        .filter(jsdomKann);
      // Kopfleiste, Hero, Fusszeile, Knopf, Flaeche, Streifen, Tabelle, Grau, Moderation und ihre Toenungen.
      expect(gueltig.length).toBeGreaterThanOrEqual(dunkel ? 10 : 14);
      expect(gueltig.filter((s) => doc.querySelector(s) === null)).toEqual([]);
    }
  });

  it("laesst Kaesten mit ui-Haken aus, die macht die gemeinsame Schicht", () => {
    const doc = baue();
    const moderation = alle.find((r) => r.selektor.startsWith('[data-glas="liquid"] [data-praesentation="moderation"] :is(div, section, details, li)'))!;
    const kaesten = [...doc.querySelectorAll(ohneNachfahrenAusschluss(moderation.selektor))];
    expect(kaesten.map((el) => el.textContent?.trim())).toContain("Einwand");
    expect(kaesten.some((el) => el.hasAttribute("data-ui"))).toBe(false);
    expect(kaesten.some((el) => el.getAttribute("data-testid") === "uebungs-vorschau")).toBe(false);
  });

  it("greift in der fotografierten Kopie nirgends, hell wie dunkel", () => {
    for (const dunkel of [false, true]) {
      const doc = baue();
      doc.documentElement.classList.toggle("dark", dunkel);
      ohneLiquidGlasInKopie(doc);
      expect(doc.documentElement.dataset.glas).toBe("an");
      expect(doc.querySelector(".lg-grund")).toBeNull();
      expect(selektoren.filter((s) => doc.querySelector(s) !== null)).toEqual([]);
    }
  });
});
