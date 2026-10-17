import { describe, expect, it, vi } from "vitest";

vi.mock("./abwicklungStore", () => ({ abwicklungGespeichert: vi.fn(async () => true) }));
vi.mock("./bellNotifications", () => ({ notifyKundePipelineStufe: vi.fn() }));
vi.mock("./investmentsStore", () => ({ updateInvestment: vi.fn(async () => true) }));
vi.mock("./kundenStore", () => ({ updateKontakt: vi.fn(async () => true) }));

const { zielStufeNachAbwicklung, abwicklungStufeNachziehen } = await import("./abwicklungStufe");
const { updateInvestment } = await import("./investmentsStore");
const { notifyKundePipelineStufe } = await import("./bellNotifications");

describe("Stufe nach der Abwicklung (Christian, 17.10.2026)", () => {
  it("Kaufpreis eingegangen setzt Abrechnung, mit Grundbucheintrag Abgeschlossen, nur für Geldrollen", () => {
    expect(zielStufeNachAbwicklung({ kaufpreisEingegangen: true }, "faelligkeit", true)).toBe("abrechnung");
    expect(zielStufeNachAbwicklung({ kaufpreisEingegangen: true }, "notar", true)).toBe("abrechnung");
    expect(zielStufeNachAbwicklung({ kaufpreisEingegangen: true, grundbuchEingetragen: true }, "abrechnung", true)).toBe("abgeschlossen");
    expect(zielStufeNachAbwicklung({ grundbuchEingetragen: true }, "faelligkeit", true)).toBeNull();
    expect(zielStufeNachAbwicklung({ kaufpreisEingegangen: true, grundbuchEingetragen: true }, "faelligkeit", false)).toBeNull();
    expect(zielStufeNachAbwicklung({ kaufpreisEingegangen: true, grundbuchEingetragen: true }, "abgeschlossen", true)).toBeNull();
  });

  it("stellt nach und meldet dem Kunden den Abschluss", async () => {
    const neu = await abwicklungStufeNachziehen({ id: "i", kontaktId: "k", pipelineStufe: "abrechnung" }, { kaufpreisEingegangen: true, grundbuchEingetragen: true }, true);
    expect(neu).toBe("abgeschlossen");
    expect(updateInvestment).toHaveBeenCalledWith("i", { pipelineStufe: "abgeschlossen" });
    expect(notifyKundePipelineStufe).toHaveBeenCalledWith("k", "abgeschlossen");
  });
});
