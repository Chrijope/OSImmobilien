import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * Wächter „kein Geodienst im Browser“ (Christian, 23.09.2026: keine
 * unnötigen Aufrufe, keine IP-Adressen und Adressen an fremde Dienste).
 *
 * Lage und Umgebung eines Objekts werden beim Investagon-Import einmal
 * gemessen und am Objekt gespeichert. Exposé, Kundenlink, Kundenansicht,
 * Objekt- und Einheitsseite, Objektkarte und Objektempfehlungen lesen nur noch
 * diesen Stand. Dieser Test durchsucht den ganzen `src/`-Baum: Keine Datei
 * nennt die Adresse eines Geodienstes oder ruft eine Adresssuche auf.
 *
 * Ausgenommen ist nur, was unten in `NOCH_OFFEN` steht, jeweils mit Grund.
 * Das sind Funktionen mit Adressen von Personen, keine Objektadressen, und
 * über sie entscheidet Christian. Kommt eine neue Stelle dazu, schlägt der
 * Test fehl.
 */

const wurzel = resolve(__dirname, "../..");

/** Dateien, die noch einen Geodienst fragen dürfen, mit Grund. */
const NOCH_OFFEN: Record<string, string> = {
  "src/lib/umgebung.ts": "Adresssuche (Photon) und Umgebung (Overpass). Einziger Aufrufer ist die Wohnort-Entfernung.",
  "src/lib/wohnortKoordinate.ts": "Wohnort des Kunden (nur PLZ und Ort) für die Entfernung in den Objektempfehlungen. Offene Entscheidung.",
  "src/lib/geocodeCache.ts": "Nachschlagen bei Nominatim. Aufrufer ist nur noch die Lead-Karte im Marketing; Objektkarte und Empfehlungen lesen nur den Zwischenspeicher.",
  "src/pages/Marketing.tsx": "Lead-Karte im Marketing: schlägt Adressen von Kontakten bei Nominatim nach. Offene Entscheidung.",
  "src/components/ui/address-autocomplete.tsx": "Adressvorschläge beim Tippen (Selbstauskunft, Einstellungen, Kundenakte) über Nominatim. Offene Entscheidung.",
  "src/lib/umgebungVorladen.ts": "Ohne Aufrufer seit dem 23.09.2026, zur Löschung vorgeschlagen.",
  "src/lib/googleMapsLoader.ts": "Lädt Google Maps, hat keinen Aufrufer. Zur Löschung vorgeschlagen.",
};

const DIENST_ADRESSE = /photon\.komoot|komoot\.io|nominatim\.openstreetmap|overpass-api\.de|overpass\.kumi|overpass\.private\.coffee|api\.mapbox|maps\.googleapis|geocode\.maps\.co/i;
const ADRESSSUCHE = /\b(geocode|geocodeAddress|umgebung|umgebungVorladen|findeAdresse|findeLage|geokodiere|messeStandort|holeOverpassElemente)\s*\(/;

function quellDateien(): string[] {
  const dateien: string[] = [];
  const sammeln = (ordner: string) => {
    for (const name of readdirSync(ordner)) {
      const pfad = join(ordner, name);
      if (statSync(pfad).isDirectory()) {
        // Testhilfen enthalten nur Attrappen und Musterdaten.
        if (relative(wurzel, pfad) !== "src/test") sammeln(pfad);
      } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) {
        dateien.push(relative(wurzel, pfad));
      }
    }
  };
  sammeln(resolve(wurzel, "src"));
  return dateien;
}

const inhalt = (datei: string) => readFileSync(resolve(wurzel, datei), "utf-8");

describe("kein Geodienst im Browser", () => {
  const dateien = quellDateien();

  it("durchsucht den ganzen src-Baum", () => {
    expect(dateien.length).toBeGreaterThan(300);
    for (const offen of Object.keys(NOCH_OFFEN)) expect(dateien, offen).toContain(offen);
  });

  it("nennt außerhalb der offenen Liste keine Dienstadresse und ruft keine Adresssuche auf", () => {
    const funde = dateien
      .filter((d) => !(d in NOCH_OFFEN))
      .flatMap((d) => {
        const code = inhalt(d);
        return [
          ...(DIENST_ADRESSE.test(code) ? [`${d}: Dienstadresse`] : []),
          ...(ADRESSSUCHE.test(code) ? [`${d}: Adresssuche ${code.match(ADRESSSUCHE)?.[0]}`] : []),
        ];
      });
    expect(funde).toEqual([]);
  });

  it("hält die offenen Stellen klein: Wer sie aufruft, steht fest", () => {
    const importiert = (modul: string) =>
      dateien.filter((d) => new RegExp(`from\\s+["']${modul.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`).test(inhalt(d)));
    // Das Vorladen und der Google-Maps-Lader haben keinen Aufrufer.
    expect(importiert("@/lib/umgebungVorladen")).toEqual([]);
    expect(importiert("@/lib/googleMapsLoader")).toEqual([]);
    // Die Wohnort-Entfernung hängt nur an den Objektempfehlungen. Der Objektscore
    // (seit dem 04.10.2026) liest dort nur die am Investment gemerkte Lage.
    expect(importiert("@/lib/wohnortKoordinate").sort()).toEqual(["src/components/kunden/ObjektEmpfehlungen.tsx", "src/lib/objektScoreDaten.ts"]);
    expect(inhalt("src/lib/objektScoreDaten.ts")).not.toMatch(/wohnortKoordinateErmitteln|wohnortGeoMerken/);
    // Die Adresssuche aus `umgebung.ts` nutzen nur die beiden offenen Stellen.
    const suchen = dateien.filter((d) => /import\s*\{[^}]*\b(geocode|umgebung)\b[^}]*\}\s*from\s*["']@\/lib\/umgebung["']/.test(inhalt(d)));
    expect(suchen.sort()).toEqual(["src/lib/umgebungVorladen.ts", "src/lib/wohnortKoordinate.ts"]);
    // Nominatim fragt außer dem Marketing niemand mehr; die übrigen lesen nur den Zwischenspeicher.
    const nachschlagen = dateien.filter((d) => d !== "src/lib/geocodeCache.ts" && /\bgeocodeAddress\b/.test(inhalt(d)));
    expect(nachschlagen).toEqual(["src/pages/Marketing.tsx"]);
  });

  it("lässt Objekt- und Einheitsseite, Objektkarte und Empfehlungen ohne Anfrage arbeiten", () => {
    for (const d of [
      "src/components/maps/UmgebungsKarte.tsx", "src/components/maps/UmgebungsKarteButton.tsx", "src/components/objektseite/Galerie.tsx",
      "src/components/objekte/DeutschlandKarte.tsx", "src/components/kunden/ObjektEmpfehlungen.tsx", "src/pages/Objekte.tsx",
    ]) {
      const code = inhalt(d);
      expect(code, d).not.toMatch(/\bgeocode(Address)?\s*\(|\bumgebung\s*\(|umgebungVorladen\s*\(|\bfetch\s*\(/);
    }
  });
});
