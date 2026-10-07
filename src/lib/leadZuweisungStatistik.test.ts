import { describe, expect, it } from "vitest";
import {
  partnerUebersicht,
  rueckgabeGrund,
  statusGruppe,
  umhaengungAusLog,
  zuweisungenAuswerten,
  type Umhaengung,
} from "./leadZuweisungStatistik";
import { getVisibleStatistikTabs } from "./statistikenTabs";

// "chef" hat eine Leitungsrolle, "anna" und "ben" sind Partner.
const istLeitung = (id: string) => id === "chef";
const u = (kontaktId: string, actorId: string | null, alt: string | null, neu: string | null, am: string): Umhaengung => ({
  kontaktId,
  actorId,
  alt,
  neu,
  am: `2026-09-${am}T10:00:00+00:00`,
});

describe("Zuweisungen der Zentrale", () => {
  it("zählt die Zuweisung aus dem Pool und lässt den Lead beim Partner", () => {
    const z = zuweisungenAuswerten([u("k1", "chef", null, "anna", "01")], istLeitung);
    expect(z).toEqual([
      expect.objectContaining({ kontaktId: "k1", partnerId: "anna", durchId: "chef", verbleib: "bei_ihm" }),
    ]);
  });

  it("erkennt die Rückgabe an die Zentrale durch den Partner selbst", () => {
    const z = zuweisungenAuswerten(
      [u("k1", "chef", null, "anna", "01"), u("k1", "anna", "anna", null, "05")],
      istLeitung,
    );
    expect(z).toHaveLength(1);
    expect(z[0].verbleib).toBe("zurueckgegeben");
    expect(z[0].endeAm).toContain("2026-09-05");
  });

  it("zählt die Weitergabe unter Partnern beim Abgebenden und nicht als Zuweisung beim Empfänger", () => {
    const z = zuweisungenAuswerten(
      [u("k1", "chef", null, "anna", "01"), u("k1", "anna", "anna", "ben", "03")],
      istLeitung,
    );
    expect(z).toHaveLength(1);
    expect(z[0]).toMatchObject({ partnerId: "anna", verbleib: "weitergegeben" });
  });

  it("wertet das Umhängen durch die Leitung als neue Zuweisung und beim Vorgänger als abgezogen", () => {
    const z = zuweisungenAuswerten(
      [u("k1", "chef", null, "anna", "01"), u("k1", "chef", "anna", "ben", "04")],
      istLeitung,
    );
    expect(z.map((x) => [x.partnerId, x.verbleib])).toEqual([
      ["ben", "bei_ihm"],
      ["anna", "abgezogen"],
    ]);
  });

  it("zählt einen Eigenkontakt und das Selbstnehmen nicht", () => {
    // Ein Eigenkontakt erzeugt gar kein Umhängen. Nimmt sich jemand einen
    // Lead selbst, ist der Handelnde der neue Zuständige.
    const z = zuweisungenAuswerten([u("k2", "anna", null, "anna", "02")], istLeitung);
    expect(z).toEqual([]);
  });

  it("zählt Systemläufe ohne Handelnden als Zuweisung der Zentrale", () => {
    const z = zuweisungenAuswerten([u("k3", null, null, "anna", "02")], istLeitung);
    expect(z[0]).toMatchObject({ partnerId: "anna", durchId: null, verbleib: "bei_ihm" });
  });

  it("wertet zwei Zuweisungen desselben Leads einzeln", () => {
    const z = zuweisungenAuswerten(
      [
        u("k1", "chef", null, "anna", "01"),
        u("k1", "anna", "anna", null, "02"),
        u("k1", "chef", null, "anna", "03"),
      ],
      istLeitung,
    );
    expect(z.map((x) => x.verbleib)).toEqual(["bei_ihm", "zurueckgegeben"]);
  });
});

describe("Übersicht je Partner", () => {
  it("teilt die Zuweisungen so auf, dass die Summe aufgeht, und lässt gelöschte Kontakte weg", () => {
    const z = zuweisungenAuswerten(
      [
        u("k1", "chef", null, "anna", "01"),
        u("k2", "chef", null, "anna", "01"),
        u("k3", "chef", null, "anna", "01"),
        u("k3", "anna", "anna", null, "02"),
        u("weg", "chef", null, "anna", "01"),
      ],
      istLeitung,
    );
    const stufen: Record<string, string> = { k1: "reservierung", k2: "neuer_lead", k3: "neuer_lead" };
    const [anna] = partnerUebersicht(z, (id) => stufen[id]);
    expect(anna.zuweisungen).toHaveLength(3);
    expect(anna.jeStatus.kaufphase).toBe(1);
    expect(anna.jeStatus.neu).toBe(1);
    expect(anna.zurueckgegeben).toBe(1);
    const summe =
      Object.values(anna.jeStatus).reduce((s, n) => s + n, 0) + anna.zurueckgegeben + anna.weitergegeben + anna.abgezogen;
    expect(summe).toBe(anna.zuweisungen.length);
  });

  it("gruppiert die Pipeline-Stufen", () => {
    expect(statusGruppe(undefined)).toBe("neu");
    expect(statusGruppe("nicht_erreicht")).toBe("neu");
    expect(statusGruppe("follow_up")).toBe("bearbeitung");
    expect(statusGruppe("bg_noshow")).toBe("termin");
    expect(statusGruppe("selbstauskunft")).toBe("objektauswahl");
    expect(statusGruppe("notar")).toBe("kaufphase");
    expect(statusGruppe("abrechnung")).toBe("abgeschlossen");
    expect(statusGruppe("archiviert")).toBe("verloren");
  });
});

describe("Protokollzeile und Rückgabegrund", () => {
  it("liest nur Umhängungen aus dem Protokoll", () => {
    expect(
      umhaengungAusLog({
        action: "kontakt_reassigned",
        kontakt_id: "k1",
        actor_id: "chef",
        created_at: "2026-09-01T10:00:00+00:00",
        changes: { zustaendig_id: { old: null, new: "anna" } },
      }),
    ).toEqual({ kontaktId: "k1", actorId: "chef", alt: null, neu: "anna", am: "2026-09-01T10:00:00+00:00" });
    expect(umhaengungAusLog({ action: "kontakt_updated", kontakt_id: "k1", created_at: "x" })).toBeNull();
  });

  it("findet den Grund am passenden Eintrag der Verlaufsspur", () => {
    const historie = [
      { name: "Alt", von: "2026-08-01", bis: "2026-08-02T00:00:00Z", grund: "auslastung" },
      { name: "Anna", von: "2026-09-01", bis: "2026-09-05T10:00:30Z", grund: "sonstiges", grundText: "Kunde will warten" },
    ];
    expect(rueckgabeGrund(historie, "2026-09-05T10:00:00+00:00")).toBe("Sonstiges: Kunde will warten");
    expect(rueckgabeGrund(historie, "2026-09-20T10:00:00+00:00")).toBe("");
    expect(rueckgabeGrund(undefined, "2026-09-05T10:00:00+00:00")).toBe("");
  });
});

describe("Sichtbarkeit des Reiters", () => {
  it("zeigt die Lead-Zuweisung nur der Leitung", () => {
    for (const rolle of ["admin", "inhaber", "vertriebsleiter"] as const) {
      expect(getVisibleStatistikTabs(rolle)).toContain("leadzuweisung");
    }
    for (const rolle of ["vertriebspartner", "setterin", "backoffice", "marketing"] as const) {
      expect(getVisibleStatistikTabs(rolle)).not.toContain("leadzuweisung");
    }
  });
});
