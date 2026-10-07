import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * Waechter fuer den Reiterwechsel auf dem Telefon.
 *
 * Christian am 17.09.2026: Nach jedem Reiterwechsel stand er wieder ganz oben
 * im Kundenprofil und musste erneut bis zur Reiterleiste hinunterrollen. Der
 * Grund war ein `rolleNachDemZeichnenNachOben` im Reiterwechsel. Am
 * Schreibtisch faellt das nicht auf, dort steht die Leiste ohnehin oben.
 *
 * Die Loesung haengt an drei Dingen, die zusammenpassen muessen und in zwei
 * verschiedenen Dateien stehen. Genau deshalb dieser Waechter:
 *  1. Die Reiterleiste traegt die Kennung `kundenprofil-reiterleiste`.
 *  2. Der Reiterwechsel rollt zu dieser Kennung und nicht mehr nach oben.
 *  3. Gerollt wird nur so weit wie noetig (`block: "nearest"`), sonst
 *     verschoebe sich am Schreibtisch die Ansicht, obwohl die Leiste dort
 *     bereits zu sehen ist.
 */
const wurzel = process.cwd();
const navigation = readFileSync(
  resolve(wurzel, "src/components/kunden/profil/KundenprofilNavigation.tsx"),
  "utf8",
);
const profil = readFileSync(resolve(wurzel, "src/pages/KundenDetail.tsx"), "utf8");

describe("Reiterwechsel bleibt bei der Reiterleiste", () => {
  it("die Reiterleiste traegt die Kennung, auf die gerollt wird", () => {
    expect(navigation).toContain('id="kundenprofil-reiterleiste"');
  });

  it("der Reiterwechsel rollt zur Leiste statt an den Seitenanfang", () => {
    const wechsel = profil.slice(
      profil.indexOf("const wechsleReiter = (reiter: string) => {"),
    );
    const rumpf = wechsel.slice(0, wechsel.indexOf("};") + 2);
    expect(rumpf).toContain("rolleZurReiterleiste()");
    expect(rumpf).not.toContain("rolleNachDemZeichnenNachOben");
  });

  it("rollt nur so weit wie noetig, damit der Schreibtisch unveraendert bleibt", () => {
    expect(profil).toContain('document.getElementById("kundenprofil-reiterleiste")');
    expect(profil).toContain('block: "nearest"');
  });
});

/**
 * Waechter fuer die gestauchten Dokumentenzeilen.
 *
 * In Bonitaetscheck und Bankpruefung stand jedes Dokument ueber drei bis vier
 * Zeilen. Christian am 17.09.2026: "Datei anzeigen, bearbeiten und den
 * Papierkorb in eine Zeile", und zwar "in jeder Endversion, also Browser, iPad
 * und Mobilversion". Stift und Papierkorb tragen deshalb kein Wort mehr,
 * sondern nur ihr Symbol.
 *
 * Ein Symbol ohne Wort ist fuer einen Bildschirmleser stumm. Der gemeinsame
 * Knopf `DokumentSymbolKnopf` traegt den vollen Namen im `aria-label` und
 * zeigt ihn als Tooltip. Genau das sichert dieser Waechter ab, zusammen damit,
 * dass wirklich jede Dokumentenzeile ueber diesen einen Knopf laeuft.
 */
describe("Dokumentenzeilen stehen in einer Zeile", () => {
  const knopf = profil.slice(
    profil.indexOf("function DokumentSymbolKnopf("),
    profil.indexOf("function DokumentSymbolKnopf(") + 1200,
  );

  it("der Symbolknopf ist fuer Bildschirmleser beschriftet", () => {
    expect(knopf).toContain("aria-label={titel}");
    expect(knopf).toContain("<TooltipContent");
    // Das Symbol selbst wird nicht mitgelesen, sonst kaeme der Name doppelt.
    expect(knopf).toContain('aria-hidden="true"');
  });

  it("kein Dokumentenknopf traegt sein Wort noch neben dem Symbol", () => {
    expect(profil).not.toContain('<Pencil className="h-3 w-3" /> Bearbeiten</button>');
    expect(profil).not.toContain('<Trash2 className="h-3 w-3" /> Löschen</button>');
  });

  it("jeder Loeschknopf laeuft ueber den Symbolknopf", () => {
    const symbolknoepfe = profil.split('<DokumentSymbolKnopf art="loeschen"').length - 1;
    const loeschknoepfe = profil.split("onClick={() => setDeleteDocDialog({").length - 1;
    expect(loeschknoepfe).toBeGreaterThan(0);
    expect(symbolknoepfe).toBe(loeschknoepfe);
  });
});
