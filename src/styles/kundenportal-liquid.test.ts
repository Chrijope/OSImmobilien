/**
 * Waechter ueber das Kundenportal in Liquid Glass (`kundenportal-liquid.css`).
 *
 * Dieselben Grenzen wie fuer die Berater-Mikroseite in `design-liquid.test.ts`:
 * jede Regel an Liquid Glass, nur auf dem Bildschirm, keine Neigung,
 * Weichzeichnung nur ueber die Tokens der Schicht, keine eigenen Farben.
 * Dazu, was das Portal besonders braucht: Es muss die Tokens des CRM
 * zurueckholen, sonst bleibt es im Dunkeln hell und das Grau auf Glas zu blass.
 */
import { describe, expect, it } from "vitest";

import { lies, ohneKommentare, regeln, teile, token } from "./glasTesthilfe";

const regelwerk = ohneKommentare(lies("kundenportal-liquid.css"));
const portal = regeln(regelwerk);
const schichtRegelwerk = ohneKommentare(lies("design-liquid.css"));
const alt = regeln(ohneKommentare(lies("kundenportal.css")));

const HUELLE = '[data-glas="liquid"] .portal-ui[data-portal="kunde"]';
const HUELLE_DUNKEL = '[data-glas="liquid"].dark .portal-ui[data-portal="kunde"]';
const DIALOGE = '[data-glas="liquid"] body:has(.portal-ui[data-portal="kunde"]) :is([role="dialog"], [role="alertdialog"], [data-radix-popper-content-wrapper])';

describe("Liquid Glass im Kundenportal: Einbindung", () => {
  it.each([
    ["components/kunde/portal/KundePortalLayout.tsx"],
    ["pages/PortalAktivieren.tsx"],
  ])("wird von %s nach kundenportal.css geladen", (datei) => {
    const inhalt = lies(`../${datei}`);
    const altIndex = inhalt.indexOf('import "@/styles/kundenportal.css"');
    const glas = inhalt.indexOf('import "@/styles/kundenportal-liquid.css"');
    expect(altIndex).toBeGreaterThan(-1);
    expect(glas).toBeGreaterThan(altIndex);
  });
});

describe("Liquid Glass im Kundenportal: Grenzen", () => {
  it("haengt jede Regel an Liquid Glass und an das Portal", () => {
    expect(portal.length).toBeGreaterThan(0);
    const ohneAnker = portal.filter((r) =>
      teile(r.selektor).some(
        (teil) =>
          !teil.startsWith('[data-glas="liquid"] .portal-ui[data-portal="kunde"]') &&
          !teil.startsWith('[data-glas="liquid"].dark .portal-ui[data-portal="kunde"]') &&
          !teil.startsWith('[data-glas="liquid"] body:has(.portal-ui[data-portal="kunde"])'),
      ),
    );
    expect(ohneAnker.map((r) => r.selektor)).toEqual([]);
  });

  it("wirkt nur auf dem Bildschirm", () => {
    const ohneScreen = portal.filter((r) => !r.rahmen.some((k) => k.startsWith("@media") && k.includes("screen")));
    expect(ohneScreen.map((r) => r.selektor)).toEqual([]);
  });

  it("neigt keine Kachel", () => {
    expect(regelwerk).not.toMatch(/rotate[XY]|perspective\(|--rx|--ry|data-lg-neigung/);
  });

  it("zeichnet nur ueber die Tokens der Schicht weich", () => {
    const weich = portal.filter((r) => /backdrop-filter:(?!\s*none)/.test(r.inhalt));
    expect(weich.length).toBeGreaterThan(0);
    for (const r of weich) {
      expect(r.inhalt, r.selektor).toMatch(/(^|;)\s*backdrop-filter:\s*var\(--lg-filter-(karte|leiste|schwebend)\)/);
    }
  });

  it("bringt keine eigene Farbe mit", () => {
    const werte = portal.map((r) => r.inhalt).join("\n");
    expect(werte).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(werte).not.toMatch(/rgba?\(/);
    const fest = [...werte.matchAll(/hsl\((\d[^)]*)\)/g)].map((m) => m[0]);
    expect(fest.filter((wert) => !schichtRegelwerk.includes(wert))).toEqual([]);
  });

  it("setzt !important nur gegen das !important der Vorlage", () => {
    const mit = portal.filter((r) => r.inhalt.includes("!important"));
    expect(mit.map((r) => r.selektor)).toEqual([`${HUELLE}.portal-activation button[style]`]);
    const vorlage = alt.find((r) => r.selektor === '.portal-ui[data-portal="kunde"].portal-activation button[style]');
    expect(vorlage?.inhalt).toContain("!important");
  });
});

describe("Liquid Glass im Kundenportal: die Tokens des CRM", () => {
  it("holt jedes Farbtoken der Huelle vom Wurzelelement zurueck", () => {
    // Was `kundenportal.css` auf die Huelle schreibt, muss hier `inherit` sein.
    // Ausnahmen: der Rand der Eingabefelder (hell bewusst kraeftiger), die
    // Rundung und die eigenen Portal-Tokens, die unten eigens geregelt sind.
    const altHuelle = alt.find((r) => r.selektor === '.portal-ui[data-portal="kunde"]' && r.rahmen.length === 0)!;
    const namen = [...altHuelle.inhalt.matchAll(/--([a-z-]+):/g)].map((m) => m[1]);
    const zurueck = namen.filter((n) => n !== "input" && n !== "radius" && !n.startsWith("portal-"));
    expect(zurueck.length).toBeGreaterThan(8);
    const huelle = portal.find((r) => r.selektor === HUELLE)!;
    for (const name of zurueck) expect(token(huelle.inhalt, name), name).toBe("inherit");
  });

  it("holt auch die Tokens aus index.css zurueck, die dort am Portal haengen", () => {
    const huelle = portal.find((r) => r.selektor === HUELLE)!;
    for (const name of ["popover", "popover-foreground", "accent", "accent-foreground", "ring", "secondary", "secondary-foreground"]) {
      expect(token(huelle.inhalt, name), name).toBe("inherit");
    }
  });

  it("macht die Huelle ueber die Seitenregel der Schicht durchsichtig, nicht mit einer eigenen", () => {
    // Kein zweites System: Die Huelle traegt den Haken `data-lg="seite"`,
    // die Regel dazu steht in `design-liquid.css`.
    expect(lies("../components/kunde/portal/KundePortalLayout.tsx")).toMatch(/<div data-lg="seite" data-portal="kunde" className="portal-ui /);
    expect(lies("../pages/PortalAktivieren.tsx")).toMatch(/<div data-lg="seite" data-portal=\{portal\} className="portal-ui /);
    expect(portal.find((r) => r.selektor === HUELLE)?.inhalt).not.toMatch(/(^|;)\s*background(-color)?\s*:/);
  });

  it("schreibt die blaue Akzentschrift in Blau 700 der Schicht", () => {
    expect(token(portal.find((r) => r.selektor === HUELLE)!.inhalt, "portal-akzent-deep")).toBe("var(--lg-schrift-blau)");
  });

  it("wechselt im Dunkeln auch Eingabefeld und helle Akzentflaeche", () => {
    const dunkel = portal.find((r) => r.selektor === HUELLE_DUNKEL)!;
    expect(token(dunkel.inhalt, "input")).toBe("inherit");
    expect(token(dunkel.inhalt, "portal-akzent-soft")).toBe("var(--accent)");
  });

  it("gibt Dialogen und Menues des Portals die Tokens des CRM, nicht die festen hellen", () => {
    const altDialoge = alt.find((r) => r.selektor.startsWith('body:has(.portal-ui[data-portal="kunde"])') && r.inhalt.includes("--foreground"))!;
    const namen = [...altDialoge.inhalt.matchAll(/--([a-z-]+):/g)].map((m) => m[1]);
    const neu = portal.find((r) => r.selektor === DIALOGE)!;
    for (const name of namen) expect(token(neu.inhalt, name), name).toBe("inherit");
  });
});

describe("Liquid Glass im Kundenportal: Flaechen", () => {
  const karte = portal.find((r) => r.selektor.includes(".portal-content :is(.portal-card") && /backdrop-filter:\s*var\(--lg-filter-karte\)/.test(r.inhalt));

  it("macht die Karten mit dem Karten-Token zu Glas, in der Deckkraft der Schicht", () => {
    expect(karte?.inhalt).toMatch(/background-color:\s*hsl\(var\(--lg-glas\) \/ var\(--lg-deckkraft\)\)/);
  });

  it("ist staerker als die deckende Kartenregel aus kundenportal.css", () => {
    // Die alte Regel zaehlt im :is() wie drei Klassen. Dieselbe Alternative
    // steht deshalb auch hier im :is(), dazu `.portal-content` davor.
    expect(karte?.selektor).toContain(`${HUELLE} .portal-content :is(`);
    expect(karte?.selektor).toContain(".rounded-2xl.border.bg-card");
  });

  it("zeichnet in einer Karte nicht noch einmal weich", () => {
    const innen = portal.find((r) => /\) :is\(\.portal-card/.test(r.selektor));
    expect(innen?.inhalt).toMatch(/backdrop-filter:\s*none/);
  });

  it("verzichtet auf Weichzeichnung, wenn ein festes Element darin steht", () => {
    expect(portal.find((r) => r.selektor.includes(":has(.fixed)"))?.inhalt).toMatch(/backdrop-filter:\s*none/);
  });

  it("laesst Kopfleiste und Menue am Handy als Scheiben schweben", () => {
    for (const teil of [".portal-header", ".portal-mobile-nav"]) {
      const r = portal.find((x) => x.selektor === `${HUELLE} ${teil}` && x.rahmen.join() === "@media screen");
      expect(r?.inhalt, teil).toMatch(/backdrop-filter:\s*var\(--lg-filter-leiste\)/);
    }
  });

  it("nimmt fuer gefuellte Flaechen nie --primary selbst als oberen Stopp", () => {
    expect(regelwerk).not.toMatch(/linear-gradient\(180deg,\s*hsl\(var\(--primary\)\)/);
  });
});
