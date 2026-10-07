import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const lies = (pfad: string) => readFileSync(resolve(__dirname, "..", "..", pfad), "utf8");

describe("Kundenportal, Fehler vom 24.09.2026", () => {
  it("die Investments-Übersicht greift nicht vor seiner Anlage auf activeInv zu", () => {
    const code = lies("src/pages/KundeInvestments.tsx");
    const anlage = code.indexOf("const activeInv =");
    expect(anlage).toBeGreaterThan(0);
    // Jeder Zugriff vor der Anlage wirft zur Laufzeit und legt die ganze Seite lahm.
    expect(code.slice(0, anlage)).not.toMatch(/\bactiveInv\b/);
  });

  it("die Glocke fragt die Spalte nachricht ab, die es in benachrichtigungen gibt", () => {
    const code = lies("src/components/kunde/portal/KundePortalLayout.tsx");
    const abfrage = code.match(/\.from\("benachrichtigungen"\)\s*\.select\("([^"]+)"\)/);
    expect(abfrage?.[1].split(",").map((s) => s.trim())).toContain("nachricht");
    expect(abfrage?.[1]).not.toMatch(/\bbeschreibung\b/);
  });

  it("Prozente im Portal stehen mit Komma, nicht roh aus toFixed", () => {
    const dateien = [
      "src/pages/KundeInvestments.tsx",
      "src/pages/KundeSteuerCockpit.tsx",
      "src/components/kunde/EigeneInvestmentsTab.tsx",
      "src/components/kunde/SteuerCockpitCard.tsx",
      "src/components/kunde/eigene/MarktwertCard.tsx",
    ];
    for (const datei of dateien) {
      const code = lies(datei);
      // toFixed direkt vor einem Prozentzeichen ohne Komma-Ersatz
      expect(code, datei).not.toMatch(/toFixed\(\d\)\}\s*%/);
      expect(code, datei).not.toMatch(/toFixed\(\d\)\s*\}\s*\)\s*\}/);
    }
  });

  it("Kunden und Tippgeber laden keine CRM-Seiten vor", () => {
    const code = lies("src/components/DashboardLayout.tsx");
    const stelle = code.indexOf("prefetchCriticalRoutes();");
    expect(stelle).toBeGreaterThan(0);
    const davor = code.slice(Math.max(0, stelle - 900), stelle);
    expect(davor).toMatch(/user\.role !== "kunde"/);
    expect(davor).toMatch(/isTippgeberRole\(user\.role\)/);
  });

  it("die Investments-Seite lädt nicht bei jedem neuen authUser-Objekt neu", () => {
    const code = lies("src/pages/KundeInvestments.tsx");
    expect(code).toMatch(/reload\(\)\.finally\(\(\) => setLoading\(false\)\);[\s\S]{0,120}\}, \[authUser\?\.id\]\);/);
  });
});

describe("Kundenportal, CI-Prüfung vom 25.09.2026", () => {
  const ohneKommentare = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
  const portalCss = () => ohneKommentare(lies("src/styles/kundenportal.css"));
  const portalBlockIndex = () => {
    const css = ohneKommentare(lies("src/index.css"));
    return css.slice(css.indexOf('[data-portal="kunde"] {'), css.indexOf("@layer components {"));
  };

  it("das Portal setzt keine eigene Schrift, es nimmt die des CRM vom body", () => {
    expect(portalCss()).not.toMatch(/font-family/);
    expect(portalBlockIndex()).not.toMatch(/font-family/);
  });

  it("Grundradius und Fokusring sind die des CRM", () => {
    const css = portalCss();
    const huelle = css.slice(css.indexOf('.portal-ui[data-portal="kunde"] {'), css.indexOf("}"));
    expect(huelle).toMatch(/--radius:\s*0\.75rem/);
    const fokus = css.slice(css.indexOf(":focus-visible {"), css.indexOf("}", css.indexOf(":focus-visible {")));
    // Wie design-neu.css: 2 px im Rington, 2 px Abstand.
    expect(fokus).toMatch(/outline:\s*2px solid hsl\(var\(--ring\)\)/);
    expect(fokus).toMatch(/outline-offset:\s*2px/);
  });

  it("keine ungültigen Farbklassen mit der Deckkraft hinter der Klammer", () => {
    for (const datei of ["src/pages/KundeKundenordner.tsx", "src/pages/KundeStammdaten.tsx", "src/components/kunde/portal/PortalVpContact.tsx"]) {
      expect(lies(datei), datei).not.toMatch(/\[hsl\(var\(--[a-z-]+\)\)\/[0-9.]+\]/);
    }
  });

  it("keine Emojis in den Benachrichtigungen an den Berater", () => {
    expect(lies("src/pages/KundeEmpfehlungen.tsx")).not.toMatch(/🎁/);
    expect(lies("src/pages/KundeInvestments.tsx")).not.toMatch(/🎯/);
  });
});
