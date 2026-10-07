import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { KundenprofilKennzahlen } from "./KundenprofilKennzahlen";
import type { GeplanteAktion } from "@/lib/kundenNaechsteAktion";

/**
 * Der Haken in der Aktionsliste, von aussen betrachtet.
 *
 * Geprueft wird hier die Oberflaeche: dass es den Haken gibt, dass er den
 * Eintrag weiterreicht, dass eine Rolle ohne Recht keinen bekommt und dass
 * der Sammelweg erst ab zwei ueberfaelligen Aufgaben erscheint. Was danach
 * geschieht, steht in `aktionAbschluss.test.ts`.
 */

const grund = {
  schritt: null,
  letzter: undefined,
  onUebersicht: () => {},
  onVerlauf: () => {},
  onAufgaben: () => {},
  aufgabenAnzahl: 0,
  ueberfaellig: 0,
  aufgaben: [],
  listeOffen: false,
  onListeUmschalten: () => {},
};

function aktion(teil: Partial<GeplanteAktion> & Pick<GeplanteAktion, "schluessel" | "art" | "titel">): GeplanteAktion {
  return {
    zeitpunkt: Date.now() - 1000,
    hatUhrzeit: false,
    ueberfaellig: true,
    sprungziel: null,
    ...teil,
  };
}

const AUFGABE = aktion({ schluessel: "aufgabe:1", art: "aufgabe", titel: "Unterlagen nachfordern" });
const FOLLOW_UP = aktion({ schluessel: "follow_up:2", art: "follow_up", titel: "Nachfassen" });
const TERMIN = aktion({ schluessel: "aktivitaet:3", art: "termin", titel: "Beratungsgespräch", aktivitaetId: "3" });

/** Die Kacheln mit aufgeklappter Aktionsliste. */
function zeige(props: Partial<React.ComponentProps<typeof KundenprofilKennzahlen>> = {}) {
  function Beispiel() {
    const [offen, setOffen] = useState(true);
    return (
      <KundenprofilKennzahlen
        {...grund}
        aktionenOffen={offen}
        onAktionenUmschalten={() => setOffen((o) => !o)}
        {...props}
      />
    );
  }
  return render(<Beispiel />);
}

describe("Der Haken an einem Eintrag", () => {
  it("reicht eine Aufgabe mit einem Klick weiter, ohne Rückfrage", async () => {
    const abschliessen = vi.fn();
    zeige({ aktionen: [AUFGABE], onAktionAbschliessen: abschliessen });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Unterlagen nachfordern abschließen" }));
    });
    expect(abschliessen).toHaveBeenCalledTimes(1);
    expect(abschliessen.mock.calls[0][0].schluessel).toBe("aufgabe:1");
    // Nichts fragt nach, das Häkchen schreibt sofort.
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("trägt beim Termin eine andere Beschriftung als beim Abhaken", () => {
    zeige({ aktionen: [AUFGABE, TERMIN], onAktionAbschliessen: () => {} });
    expect(screen.getByRole("button", { name: "Unterlagen nachfordern abschließen" }).getAttribute("title"))
      .toBe("Erledigt");
    // Der Termin sagt, dass ein Ergebnis eingetragen wird, er wird nicht abgehakt.
    expect(screen.getByRole("button", { name: "Beratungsgespräch abschließen" }).getAttribute("title"))
      .toBe("Ergebnis eintragen");
  });

  it("fehlt ganz, wo die Rolle nichts abschließen darf", () => {
    zeige({ aktionen: [AUFGABE, TERMIN] });
    expect(screen.queryByRole("button", { name: /abschließen$/ })).toBeNull();
  });

  it("fehlt an dem Eintrag, den dieser Nutzer nicht abschließen darf", () => {
    zeige({
      aktionen: [AUFGABE, TERMIN],
      onAktionAbschliessen: () => {},
      // Fremder Termin: die Aufgabe bleibt, der Termin verliert den Haken.
      darfAktionAbschliessen: (a) => a.art === "aufgabe" || a.art === "follow_up",
    });
    expect(screen.getByRole("button", { name: "Unterlagen nachfordern abschließen" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Beratungsgespräch abschließen" })).toBeNull();
  });

  it("fehlt an der ausstehenden Unterschrift, die Kachel nennt sie trotzdem", () => {
    const unterschrift = aktion({
      schluessel: "unterschrift:inv-1",
      art: "unterschrift",
      titel: "Reservierungsvereinbarung wartet seit 3 Tagen auf Unterschrift",
      zeitpunkt: Date.now() - 3 * 86_400_000,
    });
    zeige({ aktionen: [unterschrift, AUFGABE], onAktionAbschliessen: () => {} });
    // Zugeklappt und in der Liste: derselbe Satz, einmal je Stelle.
    expect(screen.getAllByText("Reservierungsvereinbarung wartet seit 3 Tagen auf Unterschrift").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Unterschrift offen").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^versendet am \S+ \d{2}\.\d{2}\.$/).length).toBeGreaterThan(0);
    // Die Aufgabe daneben ist "überfällig seit heute"; ein Wochentag davor
    // könnte nur vom Versandtag der Unterschrift stammen.
    expect(screen.queryByText(/überfällig seit (Mo|Di|Mi|Do|Fr|Sa|So) /)).toBeNull();
    // Kein Haken daneben, die Aufgabe behält ihren.
    expect(screen.queryByRole("button", { name: /Reservierungsvereinbarung.*abschließen/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Unterlagen nachfordern abschließen" })).toBeTruthy();
  });

  it("lässt den Sprung zur Aktion daneben bestehen", () => {
    const springen = vi.fn();
    zeige({ aktionen: [AUFGABE], onAktionAbschliessen: () => {}, onAktionSpringen: springen });
    fireEvent.click(screen.getByTitle("Zur Aktion springen"));
    expect(springen).toHaveBeenCalledTimes(1);
  });
});

describe("Der Sammelweg", () => {
  const knopf = /Alle überfälligen Aufgaben erledigen/;

  it("fehlt bei einer einzigen überfälligen Aufgabe", () => {
    zeige({ aktionen: [AUFGABE], onAlleAufgabenErledigen: () => {} });
    expect(screen.queryByRole("button", { name: knopf })).toBeNull();
  });

  it("erscheint ab zwei und ruft den Sammelweg", async () => {
    const alle = vi.fn();
    zeige({ aktionen: [AUFGABE, FOLLOW_UP, TERMIN], onAlleAufgabenErledigen: alle });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: knopf }));
    });
    expect(alle).toHaveBeenCalledTimes(1);
  });

  it("erscheint nicht, wenn nur Termine überfällig sind", () => {
    const zweiTermine = [
      TERMIN,
      aktion({ schluessel: "aktivitaet:4", art: "videotermin", titel: "Videocall", aktivitaetId: "4" }),
    ];
    zeige({ aktionen: zweiTermine, onAlleAufgabenErledigen: () => {} });
    expect(screen.queryByRole("button", { name: knopf })).toBeNull();
  });

  it("sagt ausdrücklich, dass Termine unberührt bleiben", () => {
    zeige({ aktionen: [AUFGABE, FOLLOW_UP], onAlleAufgabenErledigen: () => {} });
    expect(screen.getByText(/Termine und Videomeetings bleiben stehen/)).toBeTruthy();
  });
});
