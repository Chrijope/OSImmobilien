import { describe, it, expect } from "vitest";
import { sichtfenster } from "./pipelineSichtfenster";

const kachel = (id: string, investmentId?: string) => ({ kunde: { id }, investmentId });

const viele = Array.from({ length: 60 }, (_, i) => kachel(`k${i}`));

describe("Sichtfenster einer Pipelinespalte", () => {
  it("gibt kurze Spalten unverändert zurück", () => {
    const kurz = [kachel("a"), kachel("b")];
    expect(sichtfenster(kurz, 25)).toBe(kurz);
  });

  it("schneidet lange Spalten auf das Fenster zu", () => {
    const gezeigt = sichtfenster(viele, 25);
    expect(gezeigt).toHaveLength(25);
    expect(gezeigt[0].kunde.id).toBe("k0");
    expect(gezeigt[24].kunde.id).toBe("k24");
  });

  it("ändert die Gesamtzahl nicht, die Quelle bleibt unangetastet", () => {
    sichtfenster(viele, 25);
    expect(viele).toHaveLength(60);
  });

  it("holt eine gerade verschobene Kachel von hinten nach vorn", () => {
    const gezeigt = sichtfenster(viele, 25, { kundeId: "k40" });
    expect(gezeigt[0].kunde.id).toBe("k40");
    expect(gezeigt).toHaveLength(26);
  });

  it("verschiebt nichts, wenn die Kachel ohnehin im Fenster steht", () => {
    const gezeigt = sichtfenster(viele, 25, { kundeId: "k3" });
    expect(gezeigt).toHaveLength(25);
    expect(gezeigt[0].kunde.id).toBe("k0");
  });

  it("lässt Spalten in Ruhe, in denen die verschobene Kachel gar nicht steht", () => {
    const gezeigt = sichtfenster(viele, 25, { kundeId: "fremd" });
    expect(gezeigt).toHaveLength(25);
    expect(gezeigt[0].kunde.id).toBe("k0");
  });

  it("unterscheidet zwei Investments desselben Kunden", () => {
    const eintraege = [
      ...Array.from({ length: 30 }, (_, i) => kachel(`x${i}`)),
      kachel("doppel", "inv-1"),
      kachel("doppel", "inv-2"),
    ];
    const gezeigt = sichtfenster(eintraege, 25, { kundeId: "doppel", investmentId: "inv-2" });
    expect(gezeigt[0].investmentId).toBe("inv-2");
  });
});
