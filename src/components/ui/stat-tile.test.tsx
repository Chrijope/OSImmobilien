/**
 * StatTile und Kennzahl sind zwei Bausteine fuer dieselbe Sache: die eine
 * bringt ihre Huelle mit, die andere nicht. Damit sie nicht auseinanderlaufen,
 * muessen beide dieselben Haken tragen. Verschwindet hier einer, faellt die
 * Kachel im neuen Design still auf das alte Aussehen zurueck.
 */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatTile } from "./stat-tile";

describe("StatTile", () => {
  it("traegt dieselben Haken wie die Kennzahlkachel", () => {
    const { container } = render(<StatTile label="Vermittelt" value="12" hint="3 mehr als im Vormonat" trend="up" />);
    expect(container.querySelector('[data-ui="kennzahl"]')).not.toBeNull();
    expect(container.querySelector('[data-ui="kennzahl-label"]')).not.toBeNull();
    expect(container.querySelector('[data-ui="kennzahl-wert"]')).not.toBeNull();
    expect(container.querySelector('[data-ui="kennzahl-zusatz"]')).not.toBeNull();
  });

  it("ist selbst eine Karte, damit Glas und Lichtkante auch hier greifen", () => {
    // Der Kennzahl-Haken sitzt innen: Er steckt auch in Innenteilen echter
    // Karten und darf deshalb nicht selbst zur Glasflaeche werden.
    const { container } = render(<StatTile label="a" value="1" />);
    const huelle = container.firstElementChild as HTMLElement;
    expect(huelle.dataset.ui).toBe("card");
    expect(huelle.querySelector(':scope > [data-ui="kennzahl"]')).not.toBeNull();
  });

  it("uebersetzt den Trend in denselben Ton, den die Kennzahlkachel benutzt", () => {
    // "up" heisst gut, "down" heisst Warnung, alles andere ist neutral. Die
    // Designschicht liest ausschliesslich data-ton, nicht den Trend.
    const hoch = render(<StatTile label="a" value="1" trend="up" />);
    expect(hoch.container.querySelector('[data-ton="gut"]')).not.toBeNull();

    const runter = render(<StatTile label="b" value="2" trend="down" />);
    expect(runter.container.querySelector('[data-ton="warn"]')).not.toBeNull();

    const ohne = render(<StatTile label="c" value="3" />);
    expect(ohne.container.querySelector('[data-ton="neutral"]')).not.toBeNull();
  });
});
