import { describe, it, expect, vi, beforeEach } from "vitest";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

/**
 * Der Punkt macht ein Bildschirmfoto der Seite, auf der der Nutzer steht.
 * Zwei Dinge muessen deshalb stimmen: Der Aufruf muss das Foto anfordern, und
 * das Menue muss dabei zufallen. Ein Foto mit offenem Menue waere haesslich,
 * ein Foto der falschen Seite waere wertlos.
 *
 * Geprueft wird hier die Zusage, die unser Code gibt, und nicht das Verhalten
 * von Radix. Radix schliesst das Menue nach `onSelect` von selbst, es sei
 * denn, jemand ruft darin `preventDefault`. Genau das tun wir nicht, und
 * genau das steht hier fest.
 *
 * Bewusst ohne gezeichnetes Menue: Das erste Radix-Menue in jsdom aufzubauen
 * dauert mehrere Sekunden und lief auf einer ausgelasteten Maschine in jede
 * Zeitgrenze. Ein Test, der mal grün und mal rot ist, sagt nichts.
 */

const melden = vi.hoisted(() => vi.fn());

vi.mock("@/lib/fehlerMelden", () => ({
  oeffneFehlerMeldung: (vorgabe: unknown) => melden(vorgabe),
}));

import { FehlerMeldenEintrag } from "./FehlerMeldenEintrag";

/** Der Menuepunkt als Element, ohne ihn zu zeichnen. */
function eintrag() {
  const el = FehlerMeldenEintrag();
  expect(el.type).toBe(DropdownMenuItem);
  return el.props as { onSelect: (e: Event) => void };
}

beforeEach(() => {
  melden.mockClear();
});

describe("FehlerMeldenEintrag", () => {
  it("fordert beim Auswaehlen das Bildschirmfoto an", () => {
    eintrag().onSelect(new Event("select"));
    expect(melden).toHaveBeenCalledWith({ screenshot: true });
  });

  it("haelt das Menue nicht offen, damit es nicht auf dem Foto landet", () => {
    const ereignis = new Event("select", { cancelable: true });
    eintrag().onSelect(ereignis);

    // `preventDefault` waere das Einzige, was das Menue offen liesse.
    expect(ereignis.defaultPrevented).toBe(false);
  });

  it("traegt eine Beschriftung, die sagt, was passiert", () => {
    const el = FehlerMeldenEintrag();
    const text = JSON.stringify(el, (_schluessel, wert) =>
      typeof wert === "function" ? undefined : wert,
    );
    expect(text).toContain("Fehler melden");
  });
});
