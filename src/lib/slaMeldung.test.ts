import { describe, it, expect } from "vitest";
import { slaMeldung, altesSlaZiel } from "../../supabase/functions/_shared/sla-meldung.ts";

/**
 * Die SLA-Glocke führte bis zum 31.10.2026 immer aufs Dashboard ("/").
 * Der Klick soll zum betroffenen Lead führen, bei mehreren zur Pipeline.
 */
describe("slaMeldung", () => {
  it("führt bei einem Lead direkt zum Kontakt, Text im Singular", () => {
    const m = slaMeldung([{ kontakt_id: "k1", vorname: "Eva", nachname: "Muster", days_inactive: 16 }]);
    expect(m.link).toBe("/kunden/k1");
    expect(m.titel).toBe("⚠️ SLA-Verstoß: 1 Lead vernachlässigt");
    expect(m.nachricht).toBe("Eva Muster hat seit 16 Tagen keine Aktivität. Bitte zeitnah kontaktieren.");
    expect(m.meta).toEqual({ notif_type: "sla_verstoss", kontakt_ids: ["k1"] });
  });

  it("führt bei mehreren Leads zur Pipeline, Text im Plural", () => {
    const m = slaMeldung([{ kontakt_id: "a" }, { kontakt_id: "b" }]);
    expect(m.link).toBe("/pipeline");
    expect(m.titel).toBe("⚠️ SLA-Verstoß: 2 Leads vernachlässigt");
    expect(m.nachricht).toContain("Du hast 2 Leads, die");
    expect(m.meta.kontakt_ids).toEqual(["a", "b"]);
  });
});

describe("altesSlaZiel", () => {
  it("leitet alte SLA-Meldungen mit Link '/' zur Pipeline um", () => {
    expect(altesSlaZiel("⚠️ SLA-Verstoß: 1 Lead vernachlässigt", "/")).toBe("/pipeline");
  });
  it("lässt neue Ziele und andere Meldungen unberührt", () => {
    expect(altesSlaZiel("⚠️ SLA-Verstoß: 1 Lead vernachlässigt", "/kunden/k1")).toBeNull();
    expect(altesSlaZiel("Neuer Lead", "/")).toBeNull();
  });
});
