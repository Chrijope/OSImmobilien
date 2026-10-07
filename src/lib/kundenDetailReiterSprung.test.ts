import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Der Reiter darf nur einmal springen.
 *
 * Gemeldet an Kunde Mark Eichholz: Wer aus der Pipeline in ein Investment kam
 * und dann auf Stammdaten klickte, wurde sofort wieder ins Investment geworfen.
 *
 * Die Ursache liegt zwischen zwei Stellen, deshalb prüft der Test am Quelltext.
 * Die Adresse behält den Parameter `investment`, und `investments` ist nach
 * jedem `setInvestments` ein neues Feld. Der Effekt hängt an `investments` und
 * lief deshalb bei jeder Aktualisierung aus dem Zwischenspeicher erneut, und
 * `setInvestments` steht an acht Stellen in der Datei. Ein Wechsel auf einen
 * anderen Reiter hielt keine Sekunde.
 *
 * Betroffen war jeder Kunde mit Investment, der über die Pipeline geöffnet
 * wurde, nicht nur der gemeldete.
 */

// Pfad ab dem Projektstamm, dort läuft Vitest. Eine Adresse über
// `import.meta.url` ist in dieser Umgebung keine Dateiadresse.
const lies = () => readFileSync("src/pages/KundenDetail.tsx", "utf-8");

describe("Der Sprung ins Investment geschieht einmal", () => {
  it("merkt sich, dass er schon gesprungen ist", () => {
    expect(lies()).toContain("investmentSprungGetan");
    expect(lies()).toContain("if (investmentSprungGetan.current) return;");
  });

  it("setzt den Merker, bevor der Reiter wechselt", () => {
    // Umgekehrte Reihenfolge wäre wirkungslos: Der Reiterwechsel löst ein
    // neues Rendern aus, und der Effekt liefe erneut, bevor der Merker steht.
    const quelle = lies();
    const block = quelle.slice(
      quelle.indexOf("if (investmentSprungGetan.current) return;"),
      quelle.indexOf("}, [kunde, investments]);", quelle.indexOf("investmentSprungGetan")),
    );
    expect(block.indexOf("investmentSprungGetan.current = true"))
      .toBeLessThan(block.indexOf("setActiveTab("));
  });

  it("hängt weiterhin am Parameter der Adresse, springt also nur wenn gewollt", () => {
    expect(lies()).toContain('new URLSearchParams(window.location.search).get("investment")');
  });
});

describe("Der Ankersprung geschieht ebenfalls einmal", () => {
  it("merkt sich, dass er schon gesprungen ist", () => {
    expect(lies()).toContain("ankerSprungGetan");
    expect(lies()).toContain("if (ankerSprungGetan.current) return;");
  });
});
