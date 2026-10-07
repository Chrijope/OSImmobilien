import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TeilnehmerListe } from "./TeilnehmerListe";
import type { Gegenstelle } from "@/lib/videoraumVerbindung";

/**
 * Stummschalten aus der Teilnehmerliste heraus.
 *
 * Christian am 18.09.2026: „wenn ich unten auf teilnehmer klicke so soll ich
 * dort auch mit klick auf stumm schalten … da soll ich zumindest nur mit Klick
 * auf Stumm schalten, den Teilnehmer stumm schalten koennen."
 *
 * Zwei Grenzen gehoeren dazu, und beide stehen hier als Test: Ein Gast darf
 * niemanden stummschalten, und aufheben kann es auch der Gastgeber nicht.
 */

const gast = (kennung: string, name: string): Gegenstelle => ({
  kennung, name, stream: null, zustand: "verbunden",
});

const grund = {
  gegenstellen: [gast("gast-a", "Martina Brandl"), gast("gast-b", "Peter Huber")],
  staende: {},
  eigenerStand: { tonAn: true, bildAn: true },
  eigenerName: "Christian Peetz",
};

function knoepfe() {
  return [...document.querySelectorAll<HTMLElement>('[data-pruefung="zeile-stumm"]')];
}

describe("TeilnehmerListe, Stummschalten", () => {
  it("macht beim Gastgeber das Mikrofon jedes Gastes anklickbar", () => {
    const aufStumm = vi.fn();
    render(<TeilnehmerListe {...grund} aufStumm={aufStumm} />);

    // Zwei Gaeste, zwei Knoepfe. Die eigene Zeile ist keiner davon: Sich
    // selbst schaltet man in der Knopfleiste, dort geht auch das Zurueck.
    expect(knoepfe()).toHaveLength(2);
    expect(screen.queryByLabelText("Christian Peetz stummschalten")).toBeNull();

    fireEvent.click(screen.getByLabelText("Peter Huber stummschalten"));
    expect(aufStumm).toHaveBeenCalledWith("gast-b");
    expect(aufStumm).toHaveBeenCalledTimes(1);
  });

  it("laesst beim Gast alles Anzeige", () => {
    // Ohne `aufStumm` gibt es keinen Knopf. Das ist Bauplan, nicht Ausblenden.
    render(<TeilnehmerListe {...grund} />);
    expect(knoepfe()).toHaveLength(0);
    expect(document.querySelector('[data-pruefung="stumm-hinweis"]')).toBeNull();
  });

  it("bietet bei einem schon stummen Gast keinen Knopf an", () => {
    /*
     * Ein fremdes Mikrofon laesst sich nur ausschalten, nie wieder ein. Ein
     * Knopf, der aussieht, als koennte er es, waere schlimmer als gar keiner.
     */
    render(
      <TeilnehmerListe
        {...grund}
        staende={{ "gast-a": { tonAn: false, bildAn: true } }}
        aufStumm={vi.fn()}
      />,
    );

    expect(knoepfe()).toHaveLength(1);
    expect(screen.queryByLabelText("Martina Brandl stummschalten")).toBeNull();
    // Und es steht daneben, warum nicht.
    expect(screen.getByTitle("Mikrofon aus. Nur der Teilnehmer selbst kann es wieder einschalten."))
      .toBeTruthy();
  });

  it("laesst die Kamera Anzeige, auch beim Gastgeber", () => {
    // Christian hat sie ausdruecklich offengelassen.
    render(<TeilnehmerListe {...grund} aufStumm={vi.fn()} />);
    const alleKnoepfe = [...document.querySelectorAll("button")];
    expect(alleKnoepfe.every((k) => k.dataset.pruefung === "zeile-stumm")).toBe(true);
  });

  it("gibt dem Knopf 44 mal 44 Pixel, in festen Pixeln", () => {
    // `index.css` schlaegt unter 768 Pixeln jedes `min-h-` mit 40 Pixeln.
    render(<TeilnehmerListe {...grund} aufStumm={vi.fn()} />);
    expect(knoepfe()[0].className).toContain("h-[44px]");
    expect(knoepfe()[0].className).toContain("w-[44px]");
  });

  it("sagt dazu, dass der Klick beim Teilnehmer wirkt", () => {
    render(<TeilnehmerListe {...grund} aufStumm={vi.fn()} />);
    const hinweis = document.querySelector('[data-pruefung="stumm-hinweis"]');
    expect(hinweis?.textContent).toContain("wirkt bei ihm");
    expect(hinweis?.textContent).toContain("selbst wieder einschalten");
  });
});
