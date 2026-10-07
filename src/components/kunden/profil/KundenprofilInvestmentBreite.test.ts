import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * Waechter gegen Inhalte, die im Investment ueber den Kartenrand laufen.
 *
 * Christian am 17.09.2026 mit drei Bildschirmfotos aus dem Reiter Investments:
 * die Knoepfe der Reservierung standen ueber dem Kastenrand, und "Ausstehend"
 * brach mitten im Wort um.
 *
 * Dahinter steckt mehr als Kosmetik. Der Arbeitsbereich `.kundenprofil-inhalt`
 * ist ein waagerecht rollender Bereich (`overflow-x: auto`, fuer breite
 * Investmenttabellen). Sobald irgendein Inhalt breiter ist als die Spalte,
 * laesst er sich seitlich verschieben. Die Karten sind genau so breit wie
 * dieser Bereich, also verschwindet beim Verschieben zuerst ihr linker Rand,
 * waehrend rechts, oben und unten stehen bleiben. Genau das war auf Christians
 * viertem Bildschirmfoto zu sehen. Wer hier also etwas herausragen laesst,
 * schneidet nebenbei allen Karten den linken Rand ab.
 */
const wurzel = process.cwd();
const profil = readFileSync(resolve(wurzel, "src/pages/KundenDetail.tsx"), "utf8");
const css = readFileSync(
  resolve(wurzel, "src/components/kunden/profil/kundenprofil.css"),
  "utf8",
);
const eigenfinanzierung = readFileSync(
  resolve(wurzel, "src/components/finanzierung/EigenfinanzierungSection.tsx"),
  "utf8",
);

/** Die Reservierungskarte, ohne die Finanzierungskarte dahinter. */
const reservierung = profil.slice(
  profil.indexOf("<Card id={`card-reservierung-${inv.id}`}"),
  profil.indexOf("<Card id={`card-finanzierung-${inv.id}`}"),
);

describe("Reservierung: die Knoepfe bleiben im Kasten", () => {
  it("jede Knopfreihe der Karte traegt die gemeinsame Klasse", () => {
    expect(reservierung).toContain('className="kundenprofil-kartenaktionen');
    // `shrink-0` hielt die Gruppe auf ihrer vollen Breite fest, dann half auch
    // das Umbrechen nichts mehr.
    expect(reservierung).not.toContain("flex shrink-0 flex-wrap");
    expect(reservierung).not.toContain('className="mt-3 flex gap-2"');
  });

  it("die Klasse laesst die Reihe umbrechen und den Knopf mitwachsen", () => {
    const regel = css.slice(css.indexOf(".kundenprofil-kartenaktionen {"));
    expect(regel).toContain("flex-wrap: wrap");
    expect(regel).toContain("white-space: normal");
    expect(regel).toContain("height: auto");
    // Sonst waeren die Knoepfe am Schreibtisch ploetzlich flacher als bisher.
    expect(regel).toContain("min-height");
  });
});

describe("Eigenfinanzierung: das Kennzeichen bleibt einzeilig", () => {
  it("Ausstehend und Hochgeladen brechen nicht mehr um", () => {
    const kennzeichen = eigenfinanzierung
      .split("\n")
      .filter((z) => z.includes("<Badge variant=\"outline\""));
    expect(kennzeichen.length).toBeGreaterThan(0);
    for (const zeile of kennzeichen) {
      expect(zeile).toContain("shrink-0");
      expect(zeile).toContain("whitespace-nowrap");
    }
  });

  it("nachgeben soll die Beschriftung links", () => {
    expect(eigenfinanzierung).toContain(
      '<span className="min-w-0 text-xs font-medium [overflow-wrap:break-word]">{label}</span>',
    );
  });
});

/**
 * Christian am 23.09.2026: Die Hochladeknoepfe der Eigenfinanzierung standen
 * je nach Fensterbreite ueber dem Rand ihrer Karte, am deutlichsten bei
 * „Finanzierungsangebot (Gegenangebot) hochladen“. Ein Knopf kann von Haus aus
 * nicht umbrechen und nicht schmaler werden als seine Beschriftung.
 */
describe("Eigenfinanzierung: die Knoepfe bleiben im Kasten", () => {
  const konstante = (name: string) =>
    eigenfinanzierung.match(new RegExp(`const ${name} = "([^"]+)"`))?.[1]?.split(" ") ?? [];

  /** Jeder `<Button …>…</Button>` der Datei als ein Textstueck. */
  const knoepfe = eigenfinanzierung
    .split("<Button")
    .slice(1)
    .map((stueck) => stueck.slice(0, stueck.indexOf("</Button>")));

  it("Hochladeknoepfe: volle Kastenbreite, Umbruch erlaubt, Hoehe waechst mit", () => {
    const klassen = konstante("HOCHLADE_KNOPF");
    expect(klassen).toEqual(expect.arrayContaining(["w-full", "whitespace-normal", "h-auto"]));
    // Keine feste Breite. Und keine eigene Mindesthoehe: Die schaltet auf dem
    // Telefon die 40 Pixel der Mobilschicht in index.css ab.
    expect(klassen.filter((k) => /^(min-|max-)?w-\[|^min-h-|^h-\d/.test(k))).toEqual([]);
  });

  it("jeder Hochladeknopf traegt diese Klassen", () => {
    const hochladen = knoepfe.filter((k) => /hochladen/.test(k));
    // Bankzusage, Darlehensvertrag und die beiden Gegenangebote (ein Knopf fuer beide)
    expect(hochladen.length).toBe(3);
    for (const knopf of hochladen) expect(knopf).toContain("className={HOCHLADE_KNOPF}");
  });

  it("der Bestaetigungsknopf bricht um statt ueberzustehen", () => {
    const klassen = konstante("UMBRECHENDER_KNOPF");
    expect(klassen).toEqual(expect.arrayContaining(["whitespace-normal", "h-auto"]));
    const bestaetigen = knoepfe.find((k) => k.includes("Finanzierung bestätigen und weiter zum Notar"));
    expect(bestaetigen).toContain("className={`${UMBRECHENDER_KNOPF} w-full`}");
  });

  it("Titel und „Aktiv“: der Titel gibt nach, das Kennzeichen bleibt einzeilig", () => {
    expect(eigenfinanzierung).toContain('<div className="flex min-w-0 items-center gap-2">');
    expect(eigenfinanzierung).toContain('<Badge className="bg-primary text-primary-foreground shrink-0">Aktiv</Badge>');
  });
});

/**
 * Keine Gedankenstriche und Pfeile in Texten, die Nutzer sehen: auf der Karte,
 * in Hinweisen, im Verlauf, in der Glocke und in Aufgaben. Kommentare zaehlen
 * nicht. Das einzelne „–“ fuer ein fehlendes Datum ist ein Platzhalter und
 * steht ohne Leerzeichen, es faellt deshalb nicht unter die Regel.
 */
describe("Eigenfinanzierung: Texte ohne Gedankenstrich und Pfeil", () => {
  it("nur Kommentare duerfen sie enthalten", () => {
    const ohneKommentare = eigenfinanzierung
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/\s\/\/ .*$/gm, "");
    expect(ohneKommentare).not.toMatch(/—| – |→/);
  });
});
