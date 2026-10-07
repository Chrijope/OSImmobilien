import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Die großen Fenster liegen über der Kopfleiste, und was sich in ihnen öffnet,
 * liegt wiederum über ihnen.
 *
 * Christian am 23.09.2026: Beim Fenster „Objektauswahl vergrößern" schob sich
 * die Kopfleiste über den oberen Rand, der Titel „Objektauswahl für Otto"
 * klebte an der Oberkante. Dieselbe Falle wie am Vortag bei der
 * Vollbildansicht der Galerie (siehe `GalerieVollbildEbene.test.ts`): Die
 * Kopfleiste liegt auf `z-[60]`, ein Dialog bringt von Haus aus nur `z-50` mit.
 *
 * Wird ein Fenster angehoben, entsteht die zweite Falle: Auswahllisten und
 * Rückfragen bringen ebenfalls nur `z-50` mit und öffnen dann hinter dem
 * Fenster. Deshalb prüft dieser Test beide Richtungen.
 *
 * Geprüft wird am Quelltext, nicht am Aussehen: Ob etwas sichtbar ist, hängt an
 * Zahlen in verschiedenen Dateien. Genau deren Verhältnis hält der Test fest.
 */

const lies = (pfad: string) => readFileSync(resolve(process.cwd(), pfad), "utf8");

/** Die höchste `z-[...]`-Angabe einer Datei, als Zahl. */
function hoechsteEbene(quelle: string): number {
  const treffer = [...quelle.matchAll(/z-\[(\d+)\]/g)].map((m) => Number(m[1]));
  return treffer.length ? Math.max(...treffer) : 0;
}

/** Die Klassen am ersten Element dieses Namens, auch wenn ein Kommentar davorsteht. */
function klassenAn(quelle: string, element: string): string[] {
  return [...quelle.matchAll(new RegExp(`<${element}\\b([^>]*)>`, "g"))].map((m) => m[1].match(/className="([^"]*)"/)?.[1] ?? "");
}

function ebene(klassen: string): number {
  const m = klassen.match(/(?:^|\s)z-\[(\d+)\]/);
  return m ? Number(m[1]) : 50;
}

const kopfleiste = hoechsteEbene(lies("src/components/HeaderBar.tsx"));
const rueckfrage = lies("src/lib/confirm.tsx");

describe.each([
  ["Objektauswahl vergrößern", "src/components/kunden/ObjektauswahlFenster.tsx"],
  ["Für Kunden reservieren", "src/components/reservierung/KundeZuordnenDialog.tsx"],
  ["Exposé für Kunden", "src/components/expose/ExposeErzeugenDialog.tsx"],
])("%s", (_name, pfad) => {
  const quelle = lies(pfad);
  const fenster = klassenAn(quelle, "DialogContent")[0];

  it("liegt höher als die Kopfleiste", () => {
    expect(fenster).toMatch(/(?:^|\s)z-\[\d+\]/);
    expect(ebene(fenster)).toBeGreaterThan(kopfleiste);
  });

  it("lässt oben und unten einen Streifen frei", () => {
    const hoehe = Number(fenster.match(/max-h-\[(\d+)d?vh\]/)?.[1]);
    expect(hoehe).toBeLessThanOrEqual(90);
    expect(hoehe).toBeGreaterThanOrEqual(80);
  });

  it("öffnet Auswahllisten und Menüs über sich, nicht dahinter", () => {
    const innen = ["SelectContent", "PopoverContent", "DropdownMenuContent"].flatMap((e) => klassenAn(quelle, e));
    for (const klassen of innen) expect(ebene(klassen)).toBeGreaterThan(ebene(fenster));
  });

  it("stellt Rückfragen über sich, nicht dahinter", () => {
    if (!/\b(confirmDialog|hinweisDialog|abfrageDialog|auswahlDialog)\b/.test(quelle)) return;
    const ebenen = klassenAn(rueckfrage, "AlertDialogContent").map(ebene);
    // Vier Helfer: Rückfrage, Hinweis, Auswahl (seit 25.09.2026, „Deutsch oder English?“), Eingabe.
    expect(ebenen).toHaveLength(4);
    for (const e of ebenen) expect(e).toBeGreaterThan(ebene(fenster));
  });
});

describe("Objektauswahl vergrößern, der Aufbau", () => {
  const fenster = klassenAn(lies("src/components/kunden/ObjektauswahlFenster.tsx"), "DialogContent")[0];

  it("hat eine feste Höhe, damit die Bedienleiste beim Filtern nicht springt", () => {
    expect(fenster).toMatch(/(?:^|\s)h-\[\d+d?vh\]/);
  });

  it("scrollt als Ganzes nicht, nur die Liste darin", () => {
    expect(fenster).toContain("overflow-hidden");
  });
});
