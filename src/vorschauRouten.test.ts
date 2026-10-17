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
    const { VorschauInvestmentrechner, VorschauProvision, VorschauMikroseite, VorschauRechnungsvorlage, VorschauKundeKomplett, VorschauKundenchat, VorschauObjektAnlegen, VorschauHandbuchEntwurf } = await import("./vorschauRouten");
    expect(VorschauInvestmentrechner).toBeNull();
    expect(VorschauProvision).toBeNull();
    expect(VorschauMikroseite).toBeNull();
    expect(VorschauRechnungsvorlage).toBeNull();
    expect(VorschauKundeKomplett).toBeNull();
    expect(VorschauKundenchat).toBeNull();
    expect(VorschauObjektAnlegen).toBeNull();
    expect(VorschauHandbuchEntwurf).toBeNull();
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

describe("Vorschau-Route der Kachel Nächste Aktionen", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("existiert nur im Entwicklungsmodus", async () => {
    vi.stubEnv("DEV", true);
    expect((await import("./vorschauRouten")).VorschauNaechsteAktionen).not.toBeNull();
    vi.resetModules();
    vi.stubEnv("DEV", false);
    vi.stubEnv("PROD", true);
    expect((await import("./vorschauRouten")).VorschauNaechsteAktionen).toBeNull();
  });

  it("App.tsx bindet die Seite nur über den abgesicherten Weg ein", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    expect(app).not.toMatch(/pages\/VorschauNaechsteAktionen/);
    expect(app).toMatch(/\{VorschauNaechsteAktionen && \(/);
  });
});

describe("Vorschau-Route Pipeline am Investment", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("existiert nur im Entwicklungsmodus", async () => {
    vi.stubEnv("DEV", true);
    expect((await import("./vorschauRouten")).VorschauPipeline).not.toBeNull();
    vi.resetModules();
    vi.stubEnv("DEV", false);
    vi.stubEnv("PROD", true);
    expect((await import("./vorschauRouten")).VorschauPipeline).toBeNull();
  });

  it("App.tsx bindet sie nur über den abgesicherten Weg ein", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    expect(app).not.toMatch(/pages\/VorschauPipeline/);
    expect(app).toMatch(/\{VorschauPipeline && <Route path="\/vorschau\/pipeline"/);
  });
});
