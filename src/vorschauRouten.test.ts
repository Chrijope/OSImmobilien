import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

/*
 * Die lokale Vorschau ohne Anmeldung darf es nur im Entwicklungsmodus geben.
 * Im Produktions-Build ist `import.meta.env.DEV` false und die Seite fehlt.
 */
describe("Vorschau-Route der Investmentkalkulation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("existiert im Entwicklungsmodus", async () => {
    vi.stubEnv("DEV", true);
    const { VorschauInvestmentrechner } = await import("./vorschauRouten");
    expect(VorschauInvestmentrechner).not.toBeNull();
  });

  it("fehlt im Produktions-Build", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("PROD", true);
    const { VorschauInvestmentrechner, VorschauProvision, VorschauRechnungsvorlage } = await import("./vorschauRouten");
    expect(VorschauInvestmentrechner).toBeNull();
    expect(VorschauProvision).toBeNull();
    expect(VorschauRechnungsvorlage).toBeNull();
  });

  it("App.tsx bindet die Seite nur über den abgesicherten Weg ein", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    expect(app).not.toMatch(/pages\/VorschauInvestmentrechner/);
    expect(app).not.toMatch(/pages\/VorschauProvision/);
    expect(app).toMatch(/\{VorschauProvision && </);
    expect(app).toMatch(/\{VorschauInvestmentrechner && \(/);
    const routen = readFileSync("src/vorschauRouten.ts", "utf8");
    expect(routen).toMatch(/import\.meta\.env\.DEV\s*\?\s*lazy\(\(\) => import\("\.\/pages\/VorschauInvestmentrechner"\)\)/);
  });

  it("die Entwürfe Beratungspräsentation und Erstgespräch hängen ebenso nur am Entwicklungsmodus", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("PROD", true);
    const routen = await import("./vorschauRouten");
    expect(routen.VorschauBeratungspraesentation).toBeNull();
    expect(routen.VorschauErstgespraech).toBeNull();
    const app = readFileSync("src/App.tsx", "utf8");
    expect(app).not.toMatch(/pages\/Vorschau(Beratungspraesentation|Erstgespraech)/);
    expect(app).toMatch(/\{VorschauBeratungspraesentation && VorschauErstgespraech && \(/);
  });
});
