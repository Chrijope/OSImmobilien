import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * Der Rückweg steht oben links, überall gleich.
 *
 * Christians Befund vom 22.09.2026: Zurück-Knöpfe standen an vielen Stellen
 * oben rechts, zusammen mit den Handlungsknöpfen. Dort werden sie schlecht
 * gefunden. Sie gehören im ganzen System nach oben links, über oder neben die
 * Überschrift, wie die `ZurueckLeiste` in `EinheitSeite.tsx`.
 *
 * Diese Zusage lässt sich in einer gerenderten Seite kaum prüfen: Die
 * betroffenen Seiten sind groß, hängen am Zwischenspeicher und an der
 * Anmeldung. Deshalb liest dieser Test die Quelltexte, wie es
 * `objektauswahlEineStelle.test.ts` und `objektauswahlImmerSichtbar.test.ts`
 * schon tun. Er kann den Rückweg nicht sehen, aber er merkt, wenn wieder
 * einer in einer rechtsbündigen Knopfgruppe landet.
 */

const wurzel = process.cwd();
const lies = (pfad: string) => readFileSync(resolve(wurzel, pfad), "utf8");

/** Alle Seitendateien unter `src/pages`, ohne die Testdateien daneben. */
function alleSeiten(verzeichnis = "src/pages"): string[] {
  const gefunden: string[] = [];
  for (const eintrag of readdirSync(resolve(wurzel, verzeichnis), { withFileTypes: true })) {
    const pfad = join(verzeichnis, eintrag.name);
    if (eintrag.isDirectory()) gefunden.push(...alleSeiten(pfad));
    else if (eintrag.name.endsWith(".tsx") && !eintrag.name.endsWith(".test.tsx")) gefunden.push(pfad);
  }
  return gefunden.sort();
}

/** Klassen, die eine Knopfgruppe an den rechten Rand schieben. */
const RECHTSBUENDIG = /justify-end|ml-auto/;

/**
 * Eine Zeile, die zwei Gruppen auseinanderzieht: links die Überschrift,
 * rechts die Knöpfe. Hier ist nicht die Gruppe rechts, sondern alles, was
 * hinter der Überschrift kommt.
 */
const AUSEINANDER = /justify-between/;

/** Die Überschrift einer Seite oder eines Abschnitts. */
const UEBERSCHRIFT = /<h1|<h2|<PageHeader|<DialogTitle/;

/**
 * Ein Rückweg mit Ziel, also „Zurück zum Objekt“ und Verwandte.
 *
 * Bewusst mit Ziel und nicht nur „Zurück“: Ein nacktes „Zurück“ ist meistens
 * ein Schritt in einem Formularassistenten oder eine Folie in einer
 * Präsentation, und die gehören neben ihr „Weiter“ und nicht nach links.
 */
const RUECKWEG_MIT_ZIEL = /(?:Zurück zu[rm]\s|ZURÜCK ZU[MR]\s|Zur Objektliste|Zur Akademie|Zur Objektübersicht)/;

/**
 * Wo darf ein Rückweg rechts stehen, obwohl die Regel links sagt.
 *
 * Was hier steht, ist kein Seitenkopf, sondern Folien- oder
 * Schrittnavigation, bei der „Zurück“ zu seinem „Weiter“ gehört.
 *
 * Nicht in dieser Liste, weil der Melder sie ohnehin nicht erfasst, aber
 * ausdrücklich entschieden: Die öffentlichen Karriereseiten `BewerbenPage`
 * und `KarrierePage` behalten ihren Rückweg rechts. Christian am 22.09.2026.
 * Sie tragen eine Marken-Kopfleiste statt einer Überschrift, und links sitzt
 * dort das Logo.
 */
const AUSNAHMEN = new Set([
  "src/pages/ClosingModeration.tsx",
  "src/pages/ClosingPraesentationEntwurf.tsx",
  "src/pages/BewerberVideocallModeration.tsx",
  "src/pages/BewerberVideocallPraesentation.tsx",
  "src/pages/PraesentationsUebung.tsx",
  "src/pages/ObjektNeu.tsx",
]);

/** Wie viele Leerzeichen eine Zeile eingerückt ist. */
const einrueckung = (zeile: string) => zeile.length - zeile.trimStart().length;

/**
 * Alle Zeilen, die zu dem Block ab `start` gehören.
 *
 * Über die Einrückung und nicht über eine Klammerzählung: Der Quelltext im
 * Projekt ist durchgehend gleichmäßig eingerückt, und eine Zählung müsste
 * Zeichenketten und Kommentare mitlesen, in denen ebenfalls Klammern stehen.
 */
function block(zeilen: string[], start: number): string[] {
  const tiefe = einrueckung(zeilen[start]);
  const raus: string[] = [];
  for (let i = start + 1; i < zeilen.length; i++) {
    if (zeilen[i].trim() === "") continue;
    if (einrueckung(zeilen[i]) <= tiefe) break;
    raus.push(zeilen[i]);
  }
  return raus;
}

/**
 * Sucht Rückwege, die rechts stehen.
 *
 * Zwei Formen kommen im Projekt vor. Erstens die eigene rechtsbündige
 * Knopfgruppe (`justify-end`, `ml-auto`): Dort gehört gar kein Rückweg hin.
 * Zweitens die auseinandergezogene Kopfzeile (`justify-between`): Dort ist
 * links die Überschrift und rechts die Knopfgruppe, ein Rückweg hinter der
 * Überschrift steht also rechts.
 */
function rechtsbuendigeRueckwege(quelle: string): string[] {
  const zeilen = quelle.split("\n");
  const treffer: string[] = [];
  zeilen.forEach((zeile, i) => {
    if (RECHTSBUENDIG.test(zeile)) {
      if (RUECKWEG_MIT_ZIEL.test(zeile)) treffer.push(zeile.trim());
      for (const z of block(zeilen, i)) if (RUECKWEG_MIT_ZIEL.test(z)) treffer.push(z.trim());
      return;
    }
    if (AUSEINANDER.test(zeile)) {
      const inhalt = block(zeilen, i);
      const kopf = inhalt.findIndex((z) => UEBERSCHRIFT.test(z));
      if (kopf < 0) return;
      for (const z of inhalt.slice(kopf + 1)) if (RUECKWEG_MIT_ZIEL.test(z)) treffer.push(z.trim());
    }
  });
  return [...new Set(treffer)];
}

describe("Kein Rückweg mehr in einer rechtsbündigen Knopfgruppe", () => {
  for (const seite of alleSeiten()) {
    if (AUSNAHMEN.has(seite)) continue;
    it(`${seite} hält den Rückweg aus der rechten Gruppe heraus`, () => {
      expect(rechtsbuendigeRueckwege(lies(seite))).toEqual([]);
    });
  }
});

describe("Die Seiten aus Christians Befund vom 22.09.2026", () => {
  /**
   * `ObjektDetail` war das Gegenbeispiel: zwei Rückwege rechts in derselben
   * Knopfgruppe, „ZURÜCK ZUM KUNDEN“ und „Zurück zur Objektübersicht“.
   */
  it("ObjektDetail führt beide Rückwege vor der Kopfzeile", () => {
    const quelle = lies("src/pages/ObjektDetail.tsx");
    const kopfzeile = quelle.indexOf("{/* Header */}");
    const ueberschrift = quelle.indexOf(">Objektseite<");
    expect(kopfzeile).toBeGreaterThan(-1);
    expect(kopfzeile).toBeLessThan(ueberschrift);

    // Beide Rückwege stehen im Block vor der Kopfzeile, nicht darin.
    const leiste = quelle.lastIndexOf("Die Rückwege stehen oben links", kopfzeile);
    expect(leiste).toBeGreaterThan(-1);
    const davor = quelle.slice(leiste, kopfzeile);
    expect(davor).toContain("Zurück zum Kunden");
    expect(davor).toContain("Zurück zur Objektliste");
  });

  /**
   * Dasselbe im Fenster zur Wohneinheit: Dort standen „ZURÜCK ZUM KUNDEN“
   * und „ZURÜCK ZUM OBJEKT“ rechts neben dem Fenstertitel.
   */
  it("Das Wohneinheiten-Fenster führt beide Rückwege vor dem Titel", () => {
    const quelle = lies("src/pages/ObjektDetail.tsx");
    const titel = quelle.indexOf("<DialogTitle className=\"text-xl\">Wohneinheit");
    expect(titel).toBeGreaterThan(-1);
    const kopf = quelle.slice(quelle.lastIndexOf("<DialogHeader>", titel), titel);
    expect(kopf).toContain("Zurück zum Kunden");
    expect(kopf).toContain("Zurück zum Objekt");
  });

  it("ObjektSeite führt den Rückweg vor dem Objekttitel", () => {
    const quelle = lies("src/pages/ObjektSeite.tsx");
    // Seit dem 24.09.2026 heißt der Rückweg überall „Zurück zur Objektliste“.
    const rueckweg = quelle.indexOf("Zurück zur Objektliste");
    const titel = quelle.indexOf("{objekt.titel || \"Objekt\"}</h1>");
    expect(rueckweg).toBeGreaterThan(-1);
    expect(titel).toBeGreaterThan(-1);
    expect(rueckweg).toBeLessThan(titel);
  });

  it("WohnungDetail führt alle Rückwege vor der Knopfgruppe", () => {
    const quelle = lies("src/pages/WohnungDetail.tsx");
    const rechteGruppe = quelle.indexOf("justify-end");
    for (const label of ["Zurück zur Kundenansicht", "Zurück zur Wohnungsübersicht", "Zurück zur Objektliste", "Zurück zum Objekt"]) {
      const stelle = quelle.indexOf(label);
      expect(stelle, label).toBeGreaterThan(-1);
      expect(stelle, label).toBeLessThan(rechteGruppe);
    }
  });

  /*
   * Die Investment-Analyse trug den Rückweg doppelt: links als Pfeil ohne
   * Beschriftung, rechts noch einmal mit Text, beide zum selben Ziel.
   * Geblieben ist einer, links und beschriftet. (Immorechner und
   * Musterkalkulation hatten denselben Befund, sind aber seit dem 30.09.2026
   * entfernt.)
   */
  for (const seite of [
    "src/pages/InvestmentAnalyse.tsx",
  ]) {
    it(`${seite} trägt den Rückweg im Kopf nur noch einmal, links und beschriftet`, () => {
      const quelle = lies(seite);
      /*
       * Nur der Seitenkopf, also alles bis zur Überschrift. Was darunter
       * folgt, gehört zum Rechner selbst.
       */
      const kopf = quelle.slice(0, quelle.indexOf("<PageHeader"));
      expect(kopf).toContain("Zurück zu");
      expect(kopf).not.toContain("← Zurück");
      expect(kopf).not.toContain("ml-auto");
      // Der Pfeil ohne Beschriftung ist weg, die Beschriftung steht am Knopf.
      expect(kopf).not.toContain("size=\"icon\" aria-label=\"Zurück\"");
    });
  }

  it("Der Übungsplatz der Akademie trägt den Rückweg nicht mehr im PageHeader", () => {
    const quelle = lies("src/pages/vertriebsakademie/VertriebsakademieTraining.tsx");
    const rueckweg = quelle.indexOf("Zurück zur Vertriebsakademie");
    const kopf = quelle.indexOf("<PageHeader");
    expect(rueckweg).toBeGreaterThan(-1);
    expect(rueckweg).toBeLessThan(kopf);
  });
});

describe("Das Vorbild bleibt, wie es ist", () => {
  it("EinheitSeite führt den Rückweg weiterhin oben links", () => {
    const quelle = lies("src/pages/EinheitSeite.tsx");
    expect(quelle).toContain("function ZurueckLeiste");
    // Seit dem 24.09.2026 können dort zwei Rückwege stehen (Kunde und Objekt),
    // deshalb sitzt `-ml-2` wie in ObjektDetail am Rahmen der Zeile.
    expect(quelle).toMatch(/className="mb-3 -ml-2 flex/);
  });
});
