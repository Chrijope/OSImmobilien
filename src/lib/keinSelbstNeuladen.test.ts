import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { istChunkLadefehler } from "./chunkLadefehler";

/**
 * Waechter: Das CRM laedt nie von selbst neu (Christians Vorgabe vom
 * 26.10.2026). Ein Neuladen ohne Klick hat Eingaben in Formularen,
 * Protokollen und offenen Dialogen gekostet.
 *
 * Erlaubt ist `location.reload/replace/assign(` nur
 *  - in einer Zeile mit `onClick` (der Nutzer klickt selbst) oder
 *  - in einer der unten begruendeten Dateien.
 * Wer eine neue Stelle braucht, traegt sie hier mit Grund ein.
 */
const AUSNAHMEN: Record<string, string> = {
  "src/components/RouteFallback.tsx": "handleReload, nur ueber den Knopf „Seite neu laden“",
  "src/components/RouteErrorBoundary.tsx": "Knopf „Zum Dashboard“",
  "src/components/ErrorBoundary.tsx": "Knopf „Fehler melden“ (Dialog nach dem Neuladen)",
  "src/components/VersionsHinweis.tsx": "laden(), nur ueber den Knopf „Jetzt neu laden“",
  "src/components/kunde/KundenMfaGuard.tsx": "nach Eingabe des Zwei-Faktor-Codes, damit die neue Sitzung greift",
  "src/lib/metaPixel.ts": "Datenschutz: Meta-Skript nach Widerruf entfernen, wartet auf offene Formulare; nur oeffentliche Partnerseiten",
  "src/pages/VorschauBeratungspraesentation.tsx": "zuruecksetzen(), Knopf in der lokalen Vorschau",
  "src/pages/ObjektNeu.tsx": "Knopf „Entwurf verwerfen“ nach Rueckfrage",
};

const NEULADEN = /location\.(reload|replace|assign)\(|history\.go\(0\)/;

function quelldateien(ordner: string): string[] {
  return readdirSync(ordner).flatMap((name) => {
    const pfad = join(ordner, name);
    if (statSync(pfad).isDirectory()) return quelldateien(pfad);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [pfad] : [];
  });
}

describe("kein Neuladen ohne Klick", () => {
  it("findet location.reload/replace/assign nur in Klick-Handlern oder begruendeten Ausnahmen", () => {
    const verstoesse: string[] = [];
    for (const datei of quelldateien("src")) {
      const pfad = datei.split("\\").join("/");
      if (AUSNAHMEN[pfad]) continue;
      readFileSync(datei, "utf8").split("\n").forEach((zeile, i) => {
        if (NEULADEN.test(zeile) && !zeile.includes("onClick")) verstoesse.push(`${pfad}:${i + 1}`);
      });
    }
    expect(verstoesse).toEqual([]);
  });

  it("die Ausnahmen gibt es noch (sonst Eintrag loeschen)", () => {
    for (const pfad of Object.keys(AUSNAHMEN)) {
      expect(NEULADEN.test(readFileSync(pfad, "utf8")), pfad).toBe(true);
    }
  });

  it("lazyRoute und die Fehlergrenzen laden bei Chunk-Fehlern nicht mehr selbst neu", () => {
    for (const pfad of ["src/App.tsx", "src/components/ErrorBoundary.tsx", "src/components/RouteErrorBoundary.tsx", "src/components/kunde/KundeErrorBoundary.tsx"]) {
      expect(readFileSync(pfad, "utf8"), pfad).not.toContain("__reload");
    }
  });

  it("index.html enthaelt kein meta refresh", () => {
    expect(readFileSync("index.html", "utf8")).not.toMatch(/http-equiv=["']?refresh/i);
  });
});

describe("istChunkLadefehler", () => {
  it("erkennt die Meldungen der Browser und von Vite", () => {
    expect(istChunkLadefehler(new Error("Failed to fetch dynamically imported module: /assets/x.js"))).toBe(true);
    expect(istChunkLadefehler(new Error("Importing a module script failed."))).toBe(true);
    expect(istChunkLadefehler(new Error("Unable to preload CSS for /assets/y.css"))).toBe(true);
    expect(istChunkLadefehler(new Error("Loading chunk timeout"))).toBe(true);
  });

  it("laesst andere Fehler in Ruhe", () => {
    expect(istChunkLadefehler(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(istChunkLadefehler(undefined)).toBe(false);
  });
});
