import { describe, it, expect, vi } from "vitest";

// Keine Nutzer im Zwischenspeicher: Namen gelten dann als eindeutig unbekannt.
vi.mock("@/lib/dataCache", () => ({ cacheGet: () => [], onCacheChange: () => () => {} }));

import { getKontaktTyp, getKontaktTypBadge, kontaktTypFilterWert } from "@/lib/kontaktTypHelper";
import { kontaktTypBeimAnlegen, type KundeData } from "@/lib/kundenStore";

const PARTNER = "11111111-1111-1111-1111-111111111111";
const ADMIN = "22222222-2222-2222-2222-222222222222";

const kontakt = (extra: Partial<KundeData> & Record<string, unknown> = {}): KundeData =>
  ({ id: "k1", vorname: "A", nachname: "B", quelle: "", berater: "", zustaendig_id: PARTNER, setter: "", meta: {}, ...extra }) as unknown as KundeData;

describe("getKontaktTyp: Eigenkontakt nur aus eigener Anlage (Freigabe 29.09.2026)", () => {
  it("vom zuständigen Partner selbst angelegt: Eigenkontakt", () => {
    expect(getKontaktTyp(kontakt({ erstelltVonId: PARTNER }))).toBe("eigen");
  });

  it("zuständig, aber von jemand anderem angelegt: Lead der Gesellschaft", () => {
    expect(getKontaktTyp(kontakt({ erstelltVonId: ADMIN }))).toBe("lead");
  });

  it("ein gespeichertes meta.kontaktTyp 'eigen' allein macht keinen Eigenkontakt", () => {
    expect(getKontaktTyp(kontakt({ erstelltVonId: ADMIN, meta: { kontaktTyp: "eigen" } }))).toBe("lead");
    expect(getKontaktTyp(kontakt({ meta: { kontaktTyp: "eigen" } }))).toBe("lead");
  });

  it("mit Setter immer Lead der Gesellschaft, auch bei eigener Anlage", () => {
    expect(getKontaktTyp(kontakt({ erstelltVonId: PARTNER, setter: "Setterin" }))).toBe("lead");
  });

  it("Schnittstellen- und Kampagnenquellen bleiben Lead der Gesellschaft", () => {
    expect(getKontaktTyp(kontakt({ erstelltVonId: PARTNER, quelle: "Meta Lead Ads" }))).toBe("lead");
  });

  it("ohne Kennung zählt nur ein eindeutiger Name des Erstellers, der zum Betreuer passt", () => {
    expect(getKontaktTyp(kontakt({ zustaendig_id: "", berater: "Max Muster", erstelltVonName: "Max Muster" }))).toBe("eigen");
    expect(getKontaktTyp(kontakt({ zustaendig_id: "", berater: "Max Muster", erstelltVonName: "Erika Beispiel" }))).toBe("lead");
    expect(getKontaktTyp(kontakt({ zustaendig_id: "", berater: "Max Muster" }))).toBe("lead");
  });
});

describe("Etiketten und Tooltips", () => {
  it("Eigenkontakt", () => {
    const b = getKontaktTypBadge("eigen");
    expect(b.label).toBe("Eigenkontakt");
    expect(b.shortLabel).toBe("Eigen");
    expect(b.tooltip).toBe("Von dir selbst angelegt (§ 7 Absatz 3). Bleibt dein Kontakt, auch nach Vertragsende.");
  });

  it("Lead der Gesellschaft", () => {
    const b = getKontaktTypBadge("lead");
    expect(b.label).toBe("Lead der Gesellschaft");
    expect(b.shortLabel).toBe("Lead");
    expect(b.tooltip).toBe("Lead der Gesellschaft (§ 5 Absatz 1, § 7 Absatz 2). Bleibt Kontakt der Gesellschaft.");
  });

  it("ein gespeicherter Filter 'team' wird zu 'Alle'", () => {
    expect(kontaktTypFilterWert("team")).toBe("-");
    expect(kontaktTypFilterWert(null)).toBe("-");
    expect(kontaktTypFilterWert("eigen")).toBe("eigen");
    expect(kontaktTypFilterWert("lead")).toBe("lead");
  });
});

describe("kontaktTypBeimAnlegen", () => {
  it("'eigen' nur, wenn jemand für sich selbst anlegt", () => {
    expect(kontaktTypBeimAnlegen(PARTNER, PARTNER, "")).toBe("eigen");
    expect(kontaktTypBeimAnlegen(ADMIN, PARTNER, "")).toBe("gesellschaft");
    expect(kontaktTypBeimAnlegen(PARTNER, "", "")).toBe("gesellschaft");
    expect(kontaktTypBeimAnlegen(undefined, PARTNER, "")).toBe("gesellschaft");
    expect(kontaktTypBeimAnlegen(PARTNER, PARTNER, "Setterin")).toBe("gesellschaft");
  });
});
