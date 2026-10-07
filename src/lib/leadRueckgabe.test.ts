import { describe, it, expect } from "vitest";
import { istRuecklaeufer, kennungAusProtokoll, rueckgabeInfo } from "./leadRueckgabe";

/**
 * Die Erkennung eines Rückläufers.
 *
 * Christian hat den Ablauf am 21.09.2026 umgestellt: Ein Vertriebspartner gibt
 * einen Lead nicht mehr an einen Kollegen weiter, sondern an uns zurück. Daran
 * hängen zwei Dinge, die ohne diese Erkennung nicht funktionieren:
 *
 *   1. Der Lead bleibt in der Lead-Verwaltung sichtbar, auch wenn die
 *      Kontaktversuche ausgeschöpft sind. Sonst käme ausgerechnet der
 *      häufigste Rückgabegrund, "Kein Kontakt zustande gekommen", zurück und
 *      wäre sofort wieder unsichtbar.
 *   2. Die Liste kennzeichnet ihn, damit der Nächste sieht, dass hier schon
 *      jemand angerufen hat.
 *
 * Unterschieden wird an der Verlaufsspur, nicht an einem neuen Feld.
 */

/** Ein Lead, wie er im Zwischenspeicher liegt. */
const lead = (felder: Record<string, unknown>) => felder as never;

describe("istRuecklaeufer", () => {
  it("erkennt den zurückgegebenen Lead an der geschlossenen Verlaufsspur", () => {
    expect(
      istRuecklaeufer(
        lead({
          zustaendig_id: "",
          beraterHistorie: [
            { name: "Partner A", von: "2026-09-01T08:00:00Z", bis: "2026-09-20T08:00:00Z" },
          ],
        }),
      ),
    ).toBe(true);
  });

  it("hält einen nie verteilten Lead nicht für einen Rückläufer", () => {
    expect(istRuecklaeufer(lead({ zustaendig_id: "", beraterHistorie: [] }))).toBe(false);
    expect(istRuecklaeufer(lead({ zustaendig_id: "" }))).toBe(false);
  });

  it("hält einen zugewiesenen Lead nicht für einen Rückläufer", () => {
    expect(
      istRuecklaeufer(
        lead({
          zustaendig_id: "11111111-1111-1111-1111-111111111111",
          beraterHistorie: [
            { name: "Partner A", von: "2026-09-01T08:00:00Z", bis: "2026-09-20T08:00:00Z" },
          ],
        }),
      ),
    ).toBe(false);
  });

  it("schließt einen halb gespeicherten Zustand aus, bei dem noch ein Eintrag offen ist", () => {
    expect(
      istRuecklaeufer(
        lead({
          zustaendig_id: "",
          beraterHistorie: [
            { name: "Partner A", von: "2026-09-01T08:00:00Z", bis: "2026-09-10T08:00:00Z" },
            { name: "Partner B", von: "2026-09-10T08:00:00Z" },
          ],
        }),
      ),
    ).toBe(false);
  });
});

describe("rueckgabeInfo", () => {
  it("nennt den letzten Partner, den Grund im Klartext und die Kontaktversuche", () => {
    const info = rueckgabeInfo(
      lead({
        zustaendig_id: "",
        nichtErreichtCount: 5,
        beraterHistorie: [
          { name: "Partner A", von: "2026-08-01T08:00:00Z", bis: "2026-09-01T08:00:00Z" },
          {
            name: "Partner B",
            von: "2026-09-01T08:00:00Z",
            bis: "2026-09-20T09:30:00Z",
            grund: "kein_kontakt",
          },
        ],
      }),
    );

    expect(info).not.toBeNull();
    expect(info!.vonName).toBe("Partner B");
    expect(info!.am).toBe("2026-09-20T09:30:00Z");
    expect(info!.grundText).toBe("Kein Kontakt zustande gekommen");
    expect(info!.nichtErreicht).toBe(5);
  });

  it("hängt den Freitext an, wo einer erfasst wurde", () => {
    const info = rueckgabeInfo(
      lead({
        zustaendig_id: "",
        beraterHistorie: [
          {
            name: "Partner A",
            von: "2026-09-01T08:00:00Z",
            bis: "2026-09-20T08:00:00Z",
            grund: "sonstiges",
            grundText: "Kunde zieht ins Ausland",
          },
        ],
      }),
    );

    expect(info!.grundText).toBe("Sonstiges: Kunde zieht ins Ausland");
  });

  it("kommt ohne Grund aus, statt undefined in die Anzeige zu schreiben", () => {
    const info = rueckgabeInfo(
      lead({
        zustaendig_id: "",
        beraterHistorie: [
          { name: "Partner A", von: "2026-09-01T08:00:00Z", bis: "2026-09-20T08:00:00Z" },
        ],
      }),
    );

    expect(info!.grundText).toBe("");
    expect(info!.nichtErreicht).toBe(0);
  });

  it("gibt null zurück, wo es kein Rückläufer ist", () => {
    expect(rueckgabeInfo(lead({ zustaendig_id: "", beraterHistorie: [] }))).toBeNull();
  });
});

describe("rueckgabeInfo: wer, wie oft", () => {
  it("liefert die Kennung und zählt nur Rückgaben, keine Übergaben", () => {
    const info = rueckgabeInfo(
      lead({
        zustaendig_id: "",
        beraterHistorie: [
          // Rückgabe durch A, später neu zugewiesen an B (ohne Eintrag, wie
          // leadZuweisenWennFrei), B hängt an C um, C gibt zurück.
          { name: "Partner A", id: "id-a", von: "2026-09-01T08:00:00Z", bis: "2026-09-05T08:00:00Z" },
          { name: "Partner B", id: "id-b", von: "2026-09-06T08:00:00Z", bis: "2026-09-10T08:00:00Z" },
          { name: "Partner C", id: "id-c", von: "2026-09-10T08:00:00Z", bis: "2026-09-20T08:00:00Z" },
        ],
      }),
    );
    expect(info!.vonName).toBe("Partner C");
    expect(info!.vonId).toBe("id-c");
    expect(info!.anzahl).toBe(2);
    expect(info!.verlauf.map((v) => v.name)).toEqual(["Partner A", "Partner C"]);
  });

  it("lässt die Kennung bei Altfällen leer statt sie aus dem Namen zu raten", () => {
    const info = rueckgabeInfo(
      lead({
        zustaendig_id: "",
        beraterHistorie: [{ name: "Partner A", von: "2026-09-01T08:00:00Z", bis: "2026-09-20T08:00:00Z" }],
      }),
    );
    expect(info!.vonId).toBeUndefined();
    expect(info!.anzahl).toBe(1);
  });
});

describe("kennungAusProtokoll", () => {
  const u = (felder: Partial<{ kontaktId: string; alt: string | null; neu: string | null; am: string }>) => ({
    kontaktId: "k1",
    actorId: "x",
    alt: "id-a",
    neu: null,
    am: "2026-09-20T08:00:05Z",
    ...felder,
  });

  it("findet den Wechsel auf niemanden zur Rückgabezeit", () => {
    expect(kennungAusProtokoll("k1", "2026-09-20T08:00:00Z", [u({})])).toBe("id-a");
  });

  it("nimmt den zeitlich nächsten und ignoriert fremde Kontakte und Zuweisungen", () => {
    const zeilen = [
      u({ alt: "id-alt", am: "2026-09-20T07:55:00Z" }),
      u({ alt: "id-nah", am: "2026-09-20T08:00:01Z" }),
      u({ kontaktId: "k2", alt: "id-fremd", am: "2026-09-20T08:00:00Z" }),
      u({ alt: "id-zuw", neu: "id-neu", am: "2026-09-20T08:00:00Z" }),
    ];
    expect(kennungAusProtokoll("k1", "2026-09-20T08:00:00Z", zeilen)).toBe("id-nah");
  });

  it("liefert nichts, wenn nichts in der Nähe liegt", () => {
    expect(kennungAusProtokoll("k1", "2026-09-20T08:00:00Z", [u({ am: "2026-09-20T09:00:00Z" })])).toBeUndefined();
    expect(kennungAusProtokoll("k1", "", [u({})])).toBeUndefined();
  });
});
