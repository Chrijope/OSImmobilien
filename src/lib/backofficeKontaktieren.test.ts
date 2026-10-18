import { describe, expect, it } from "vitest";
import { navigationsGruppen } from "./sidebarNavigation";

/*
 * Christian, 18.10.2026: Der Eintrag heißt in der Seitenleiste
 * „Backoffice kontaktieren“, nicht mehr „Support kontaktieren“. Die Adresse
 * bleibt /support-kontaktieren, daran hängen Glocke, Mail-Links und der
 * Zähler für ungelesene Antworten.
 */
describe("Seitenleiste: Backoffice kontaktieren", () => {
  it("zeigt den neuen Namen unter der alten Adresse", () => {
    const eintrag = navigationsGruppen({ rolle: "vertriebspartner" })
      .flatMap((g) => g.items)
      .find((i) => i.url === "/support-kontaktieren");
    expect(eintrag?.title).toBe("Backoffice kontaktieren");
    expect(eintrag?.suchbegriffe).toContain("support");
  });
});
