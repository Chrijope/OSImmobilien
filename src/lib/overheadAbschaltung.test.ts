import { describe, it, expect } from "vitest";
import { getLizenzPaket, OVERHEAD_AKTIV } from "@/lib/lizenzPakete";
import { KARRIERE_STUFEN, formatStufenProvision } from "@/lib/karriereStufeHelper";
import { calculateJuniorOverride } from "@/lib/juniorOverrideLogic";
import { getVertragsAnhaenge } from "@/lib/vertragAnhaenge";
import { renderHauptvertrag, type KlauselTools } from "@/lib/vertragKlauseln";
import type { Bewerber } from "@/lib/bewerbungStore";

/**
 * Die Overhead-/Strukturprovision ist über den zentralen Schalter
 * OVERHEAD_AKTIV (lizenzPakete.ts) abgeschaltet. Diese Tests sichern ab,
 * dass sie dann nirgendwo mehr berechnet, angezeigt oder in neu erzeugte
 * Verträge gedruckt wird. Sie laufen nur, solange der Schalter aus ist;
 * nach einer Reaktivierung entfallen sie automatisch.
 */

function makeCapture() {
  const texte: string[] = [];
  const tools: KlauselTools = {
    h1: (t) => { texte.push(t); },
    p: (t) => { texte.push(t); },
    bullet: (items) => { texte.push(...items); },
    spacer: () => { /* nichts */ },
    ensure: () => { /* nichts */ },
    infoBox: (titel, untertitel) => { texte.push(titel, untertitel); },
  };
  return { texte, tools };
}

const bewerberStub = (extra: Partial<Bewerber> = {}): Bewerber =>
  ({ vorname: "Max", nachname: "Mustermann", ...extra }) as unknown as Bewerber;

describe.runIf(!OVERHEAD_AKTIV)("Overhead-Provision abgeschaltet (OVERHEAD_AKTIV = false)", () => {
  it("kein Paket führt einen Junior-Override oder eine Overhead-Leistungszeile", () => {
    for (const id of ["team_builder", "enterprise"] as const) {
      const paket = getLizenzPaket(id)!;
      expect(paket.juniorOverride).toBeUndefined();
      expect(paket.features.join("\n")).not.toContain("Overhead");
    }
  });

  it("keine Karrierestufe führt einen Junior-Override", () => {
    for (const stufe of KARRIERE_STUFEN) {
      expect(stufe.juniorOverride).toBeUndefined();
      expect(formatStufenProvision(stufe)).not.toContain("Override");
    }
  });

  it("calculateJuniorOverride liefert immer null", () => {
    expect(calculateJuniorOverride("irgendein-user", 250000)).toBeNull();
  });

  it("die Anhangliste enthält keine Anlage 7, auch nicht für Altpakete", () => {
    for (const id of ["junior", "lead_berater", "team_builder", "enterprise"]) {
      const anhaenge = getVertragsAnhaenge(id).join("\n");
      expect(anhaenge).not.toContain("Anlage 7");
      expect(anhaenge).not.toContain("Overhead");
    }
  });

  it("der neu erzeugte Hauptvertrag erwähnt weder Overhead noch Strukturvergütung noch Anlage 7", () => {
    for (const id of ["junior", "lead_berater", "team_builder"] as const) {
      const paket = getLizenzPaket(id)!;
      const { texte, tools } = makeCapture();
      renderHauptvertrag(tools, {
        bewerber: bewerberStub(),
        paket,
        hasCrmGebuehr: paket.monatlich > 0,
        hasOverride: false,
        effektiverSatzText: `${paket.provisionssatz}%`,
      });
      const alles = texte.join("\n");
      expect(alles).not.toContain("Overhead");
      expect(alles).not.toContain("Strukturvergütung");
      expect(alles).not.toContain("Anlage 7");
    }
  });

  // Der Prueffall "die Wissenswelt liefert den Override-Artikel nicht mehr
  // aus" ist am 10.09.2026 mit der Wissenswelt selbst entfallen. Es gibt
  // keinen Artikelbestand mehr, in dem eine Strukturprovision auftauchen
  // koennte.
});
