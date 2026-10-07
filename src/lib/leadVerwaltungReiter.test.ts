import { describe, expect, it } from "vitest";
import { istMetaQuelle, quellenGruppe } from "./leadVerwaltungReiter";
import type { KundeData } from "./kundenStore";

const ohneHandbuch = { ausHandbuch: false, kampagne: null };
const gruppe = (quelle: string, leadTyp: KundeData["leadTyp"] = "meta") => quellenGruppe({ quelle, leadTyp }, ohneHandbuch);

describe("Quellen-Filter der Lead-Verwaltung", () => {
  it("erkennt Meta an der Quelle wie submit-lead", () => {
    expect(istMetaQuelle("Meta Ads: Nürnberg")).toBe(true);
    expect(istMetaQuelle("Meta Kampagne")).toBe(true);
    expect(istMetaQuelle("Facebook Lead Form")).toBe(true);
    expect(istMetaQuelle("Analysetool")).toBe(false);
    expect(istMetaQuelle(undefined)).toBe(false);
  });

  it("ordnet die vorkommenden Quellen einer Gruppe zu", () => {
    expect(gruppe("Meta Ads: Nürnberg")).toBe("meta");
    expect(gruppe("Meta Kampagne", "manuell")).toBe("meta");
    expect(gruppe("Analysetool")).toBe("rechner");
    expect(gruppe("Steuerrechner")).toBe("rechner");
    expect(gruppe("EXPATS Calculator")).toBe("rechner");
    expect(gruppe("Website more.immo")).toBe("website");
    expect(gruppe("Microseite Beispiel")).toBe("website");
    expect(gruppe("", "website")).toBe("website");
    expect(gruppe("Instagram")).toBe("sonstige");
    expect(gruppe("Netzwerk", "manuell")).toBe("sonstige");
    expect(gruppe("", "google")).toBe("sonstige");
  });

  it("Handbuch-Leads stehen unter Handbuch-Seite, auch mit Meta-Kampagne", () => {
    expect(quellenGruppe({ quelle: "Konfigurator" }, { ausHandbuch: true, kampagne: { utmSource: "ig" } })).toBe("handbuch");
  });

  it("ein Zapier-Lead ohne Meta-Quelle, aber mit Plattform ig, zählt zu Meta", () => {
    expect(quellenGruppe({ quelle: "Funnel Lead" }, { ausHandbuch: false, kampagne: { utmSource: "ig" } })).toBe("meta");
    expect(quellenGruppe({ quelle: "Funnel Lead" }, { ausHandbuch: false, kampagne: { fbclid: "abc" } })).toBe("meta");
    expect(quellenGruppe({ quelle: "Funnel Lead" }, { ausHandbuch: false, kampagne: { gclid: "abc" } })).toBe("sonstige");
  });
});
