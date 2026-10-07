import { describe, it, expect } from "vitest";
import { rollenLabel, ROLLEN_VARIANTE_LEAD_BERATER } from "./rollenLabel";
import { ROLES } from "@/types/user";

/**
 * Lead-Berater ist eine reine Anzeige-Variante der Rolle Vertriebspartner.
 * Diese Tests sichern, dass die Variante NUR den Anzeigenamen aendert und
 * alle anderen Rollen unveraendert ihr Basis-Label behalten.
 */
describe("rollenLabel", () => {
  it("zeigt Vertriebspartner ohne Variante wie bisher", () => {
    expect(rollenLabel("vertriebspartner")).toBe("Vertriebspartner");
    expect(rollenLabel("vertriebspartner", null)).toBe("Vertriebspartner");
    expect(rollenLabel("vertriebspartner", undefined)).toBe("Vertriebspartner");
  });

  it("zeigt Vertriebspartner mit Variante lead_berater als Lead-Berater", () => {
    expect(rollenLabel("vertriebspartner", ROLLEN_VARIANTE_LEAD_BERATER)).toBe("Lead-Berater");
  });

  it("ignoriert die Variante bei allen anderen Rollen", () => {
    expect(rollenLabel("admin", ROLLEN_VARIANTE_LEAD_BERATER)).toBe("Admin");
    expect(rollenLabel("inhaber", ROLLEN_VARIANTE_LEAD_BERATER)).toBe("Inhaber");
    expect(rollenLabel("kunde", ROLLEN_VARIANTE_LEAD_BERATER)).toBe("Kunde");
  });

  it("ignoriert unbekannte Variantenwerte", () => {
    expect(rollenLabel("vertriebspartner", "irgendwas")).toBe("Vertriebspartner");
  });

  it("liefert fuer jede bekannte Rolle das Label aus ROLES", () => {
    for (const r of ROLES) {
      expect(rollenLabel(r.id)).toBe(r.label);
    }
  });

  it("macht unbekannte Kennungen lesbar statt leer", () => {
    expect(rollenLabel("sonderrolle")).toBe("Sonderrolle");
    expect(rollenLabel("")).toBe("");
  });
});
