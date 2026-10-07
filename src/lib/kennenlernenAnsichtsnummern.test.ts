import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ansichtenFuer, WEGE } from "@/lib/bewerberKennenlernen";

/**
 * Keine Ansichtsnummer von Hand.
 *
 * Der Bogen hat zwanzig Ansichten, auf Weg 2 einundzwanzig, und beide Zahlen
 * verschieben sich, sobald eine Ansicht dazukommt, wegfällt oder umsortiert
 * wird. Wer eine Nummer als feste Zahl in einen Text schreibt, hat sie beim
 * nächsten Umbau falsch, ohne dass irgendetwas rot wird. Genau das ist bis
 * zum 08.09.2026 passiert: Die Folien des Gesprächs nannten feste Zahlen, und
 * die Hälfte davon zeigte auf die falsche Ansicht.
 *
 * Deshalb dieser Test. Er liest die Quelltexte, wirft die Kommentare weg und
 * sucht in dem, was übrig bleibt, nach „Ansicht 12" und Ähnlichem. Kommentare
 * dürfen Nummern nennen, sie erklären den Aufbau und stehen vor niemandes
 * Augen. Alles andere ist entweder eine Zeichenkette, die ein Bewerber liest,
 * oder ein Text im Bildschirmaufbau, und dort gehört die Nummer berechnet:
 * über `ansichtNummer` beziehungsweise die Helfer `nr` und `nrFrage` in
 * `bewerberVideocall.ts`.
 *
 * Was der Test bewusst nicht kann: Er sieht nur Nummern, die zusammen mit dem
 * Wort „Ansicht" dastehen. Eine nackte Zahl irgendwo im Text erkennt er nicht.
 * Dafür schlägt er auch nicht bei jedem Kommentar an.
 */

const lies = (pfad: string) => readFileSync(new URL(pfad, import.meta.url), "utf-8");

/**
 * Die Dateien, die dem Bewerber Ansichtsnummern zeigen können: der Bogen
 * selbst, seine Oberfläche, die Folien des Gesprächs und die beiden
 * Deno-Funktionen, die zum Bogen gehören.
 */
const QUELLEN = [
  "bewerberKennenlernen.ts",
  "bewerberVideocall.ts",
  "../pages/BewerberKennenlernen.tsx",
  "../components/bewerberformular/FragebogenBausteine.tsx",
  "../components/bewerberformular/KennenlernenMotive.tsx",
  "../../supabase/functions/_shared/bewerber-kennenlernen-ueberblick.ts",
  "../../supabase/functions/send-bewerber-kennenlernen/index.ts",
];

/**
 * Der Quelltext ohne seine Kommentare.
 *
 * Ein einfaches Wegschneiden mit einem Suchmuster genügt nicht: In einer
 * Zeichenkette steht irgendwann ein „//" oder ein Schrägstrich, und dann wäre
 * der halbe Text weg. Deshalb läuft der Text hier einmal Zeichen für Zeichen
 * durch und merkt sich, ob er gerade in Code, in einem Kommentar oder in einer
 * Zeichenkette steht.
 */
function ohneKommentare(quelle: string): string {
  type Lage = "code" | "zeile" | "block" | "'" | '"' | "`";
  let lage: Lage = "code";
  let raus = "";
  let i = 0;

  while (i < quelle.length) {
    const zeichen = quelle[i];
    const zwei = quelle.slice(i, i + 2);

    if (lage === "code") {
      if (zwei === "//") { lage = "zeile"; i += 2; continue; }
      if (zwei === "/*") { lage = "block"; i += 2; continue; }
      if (zeichen === "'" || zeichen === '"' || zeichen === "`") lage = zeichen;
      raus += zeichen;
      i += 1;
      continue;
    }

    if (lage === "zeile") {
      if (zeichen === "\n") { lage = "code"; raus += "\n"; }
      i += 1;
      continue;
    }

    if (lage === "block") {
      if (zwei === "*/") { lage = "code"; i += 2; } else i += 1;
      continue;
    }

    // In einer Zeichenkette. Ein maskiertes Zeichen beendet sie nicht.
    if (zeichen === "\\") { raus += quelle.slice(i, i + 2); i += 2; continue; }
    if (zeichen === lage) lage = "code";
    raus += zeichen;
    i += 1;
  }

  return raus;
}

/** „Ansicht 12", „Ansichten 3 bis 5", auch über einen Zeilenumbruch hinweg. */
const FESTE_NUMMER = /Ansicht(?:en)?\s+\d+/g;

describe("Ansichtsnummern werden gerechnet, nicht geschrieben", () => {
  it("erkennt eine von Hand geschriebene Nummer überhaupt", () => {
    // Sicherung gegen einen Test, der aus Versehen nichts findet: erst der
    // Nachweis, dass das Suchmuster und das Wegschneiden zusammen tun, was sie
    // sollen.
    const probe = [
      '// Auf Ansicht 5 steht die Weiche.',
      '/* Und Ansicht 12 fragt nach der Zeit. */',
      'const gut = `Ansicht ${nr("weiche")}`;',
      'const schlecht = "Das steht auf Ansicht 7";',
    ].join("\n");
    const treffer = ohneKommentare(probe).match(FESTE_NUMMER) ?? [];
    expect(treffer).toEqual(["Ansicht 7"]);
  });

  it("nennt in keiner Quelle eine feste Ansichtsnummer", () => {
    for (const pfad of QUELLEN) {
      const treffer = ohneKommentare(lies(pfad)).match(FESTE_NUMMER) ?? [];
      expect(
        treffer,
        `${pfad} schreibt eine Ansichtsnummer von Hand: ${treffer.join(", ")}. ` +
          "Nummern gehören berechnet, sonst zeigen sie nach dem nächsten Umbau auf die falsche Ansicht.",
      ).toEqual([]);
    }
  });

  it("hat für jede Ansicht auch wirklich eine berechnete Nummer", () => {
    // Ohne diese Zusage wäre der Test oben auch dann grün, wenn gar keine
    // Nummer mehr entstünde.
    for (const weg of WEGE) {
      const ansichten = ansichtenFuer({ weg: weg.id });
      expect(ansichten.map((a) => a.nummer), weg.id).toEqual(
        ansichten.map((_, i) => i + 1),
      );
    }
  });
});
