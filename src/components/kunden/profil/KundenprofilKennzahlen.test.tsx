import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { KundenprofilKennzahlen } from "./KundenprofilKennzahlen";
import { baueGeplanteAktionen } from "@/lib/kundenNaechsteAktion";
import type { Aufgabe } from "@/lib/aufgabenStore";

const JETZT = new Date(2026, 8, 15, 14, 0);

const grund = {
  schritt: null,
  letzter: undefined,
  onUebersicht: () => {},
  onVerlauf: () => {},
};

/** Alle offenen Aktionen aus Aufgaben, gerechnet gegen JETZT, wie die Kachel im Profil. */
function aktionen(teile: Array<Partial<Aufgabe> & { id: string }>) {
  return baueGeplanteAktionen(
    {
      aufgaben: teile.map((t) => ({
        benutzerId: "u1",
        kontaktId: "k1",
        typ: "aufgabe",
        prioritaet: "mittel",
        status: "offen",
        titel: "Aufgabe",
        ...t,
      }) as Aufgabe),
    },
    JETZT,
    { alleOffenen: true },
  );
}

/** Die Kacheln mit echtem Auf- und Zuklappen, wie im Kundenprofil. */
function Beispiel(props: Partial<React.ComponentProps<typeof KundenprofilKennzahlen>> = {}) {
  const [aktionenOffen, setAktionenOffen] = useState(false);
  return (
    <KundenprofilKennzahlen
      {...grund}
      aktionenOffen={aktionenOffen}
      onAktionenUmschalten={() => setAktionenOffen((o) => !o)}
      {...props}
    />
  );
}

describe("Kachel Nächste Aktionen", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(JETZT);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("ist die einzige Aktionskachel, die frühere Kachel Offene Aufgaben gibt es nicht mehr", () => {
    render(<Beispiel />);
    expect(screen.getByText("Nächste Aktionen")).toBeInTheDocument();
    expect(screen.queryByText("Offene Aufgaben")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aufgaben anzeigen" })).not.toBeInTheDocument();
  });

  it("zeigt zugeklappt den nächsten Schritt mit Art, Datum und Uhrzeit sowie den Ampelpunkt", () => {
    render(
      <Beispiel
        aktionen={aktionen([
          { id: "a1", titel: "Später", faelligAm: "2026-09-30" },
          { id: "a2", titel: "Beratung", typ: "meeting", faelligAm: "2026-09-17", uhrzeit: "14:00" },
        ])}
        ampel={{ ton: "gruen", titel: "Termin geplant", kurztext: "Termin geplant" }}
      />,
    );
    expect(screen.getByText("Beratung")).toBeInTheDocument();
    expect(screen.getByText("Termin")).toBeInTheDocument();
    expect(screen.getByText("Do 17.09., 14:00")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Status: Termin geplant" })).toHaveClass("bg-emerald-500");
    expect(screen.queryByText("Später")).not.toBeInTheDocument();
  });

  it("zählt offen und überfällig, überfällig in Rot", () => {
    const { rerender } = render(<Beispiel aktionen={aktionen([{ id: "a1", faelligAm: "2026-09-30" }])} />);
    expect(screen.getByText("1 offen")).not.toHaveClass("text-destructive");
    rerender(
      <Beispiel
        aktionen={aktionen([
          { id: "a1", faelligAm: "2026-09-30" },
          { id: "a2", faelligAm: "2026-09-01" },
          { id: "a3" },
        ])}
      />,
    );
    expect(screen.getByText("3 offen, 1 überfällig")).toHaveClass("text-destructive");
  });

  it("nennt einen verstrichenen Schritt überfällig, wenn nichts mehr bevorsteht", () => {
    render(<Beispiel aktionen={aktionen([{ id: "a1", titel: "Rückruf", faelligAm: "2026-09-10", uhrzeit: "09:30" }])} />);
    expect(screen.getByText("überfällig seit Do 10.09., 09:30")).toHaveClass("text-destructive");
  });

  it("zeigt einen Eintrag ohne Termin nur, wenn es sonst nichts gibt", () => {
    const { rerender } = render(<Beispiel aktionen={aktionen([{ id: "a1", titel: "Irgendwann" }])} />);
    expect(screen.getByText("Irgendwann")).toBeInTheDocument();
    expect(screen.getByText("Ohne Termin")).toBeInTheDocument();
    rerender(<Beispiel aktionen={aktionen([{ id: "a1", titel: "Irgendwann" }, { id: "a2", titel: "Datiert", faelligAm: "2026-09-20" }])} />);
    expect(screen.getByText("Datiert")).toBeInTheDocument();
    expect(screen.queryByText("Irgendwann")).not.toBeInTheDocument();
  });

  it("sagt in Rot Bescheid, wenn nichts geplant ist, und zeigt den Ampeltext", () => {
    render(<Beispiel ampel={{ ton: "rot", titel: "Handlungsbedarf", kurztext: "5d inaktiv" }} />);
    expect(screen.getByText("Nichts geplant")).toHaveClass("text-destructive");
    expect(screen.getByText("5d inaktiv")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Status: Handlungsbedarf" })).toHaveClass("bg-red-500");
  });

  it("klappt die Liste chronologisch auf, Ohne Termin am Ende, und reicht den Sprung weiter", () => {
    const springen = vi.fn();
    render(
      <Beispiel
        aktionen={aktionen([
          { id: "a0", titel: "Ohne Datum" },
          { id: "a1", titel: "Später", faelligAm: "2026-09-30" },
          { id: "a2", titel: "Früher", faelligAm: "2026-09-20" },
        ])}
        onAktionSpringen={springen}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Aktionen anzeigen" }));
    const zeilen = screen.getAllByRole("listitem").map((li) => li.textContent || "");
    expect(zeilen[0]).toContain("Früher");
    expect(zeilen[1]).toContain("Später");
    expect(zeilen[2]).toContain("Ohne Datum");
    expect(zeilen[2]).toContain("Ohne Termin");
    fireEvent.click(screen.getByRole("button", { name: /Später/ }));
    expect(springen).toHaveBeenCalledTimes(1);
    expect(springen.mock.calls[0][0]).toMatchObject({ schluessel: "aufgabe:a1" });
    fireEvent.click(screen.getByRole("button", { name: "Aktionen ausblenden" }));
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("trägt bei Aufgaben die Priorität als Marke, ohne Angabe Mittel", () => {
    render(
      <Beispiel
        aktionen={aktionen([
          { id: "a1", titel: "Eilig", faelligAm: "2026-09-20", prioritaet: "dringend" },
          { id: "a2", titel: "Normal", faelligAm: "2026-09-21", prioritaet: undefined },
          { id: "a3", titel: "Treffen", typ: "meeting", faelligAm: "2026-09-22", prioritaet: "hoch" },
        ])}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Aktionen anzeigen" }));
    const zeilen = screen.getAllByRole("listitem").map((li) => li.textContent || "");
    expect(zeilen[0]).toContain("Dringend");
    expect(zeilen[1]).toContain("Mittel");
    // Termine tragen keine Priorität.
    expect(zeilen[2]).not.toContain("Hoch");
  });

  it("hakt den nächsten Eintrag direkt in der zugeklappten Kachel ab", async () => {
    const abschliessen = vi.fn();
    render(<Beispiel aktionen={aktionen([{ id: "a1", titel: "Anrufen", faelligAm: "2026-09-20" }])} onAktionAbschliessen={abschliessen} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Nächste Aktion abschließen: Anrufen" }));
    });
    expect(abschliessen.mock.calls[0][0].schluessel).toBe("aufgabe:a1");
  });

  it("zeigt ohne Recht weder Haken noch Aktion erstellen", () => {
    const { rerender } = render(<Beispiel aktionen={aktionen([{ id: "a1", titel: "Geplant", faelligAm: "2026-09-20" }])} />);
    fireEvent.click(screen.getByRole("button", { name: "Aktionen anzeigen" }));
    expect(screen.queryByRole("button", { name: /Aktion erstellen/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /abschließen/ })).not.toBeInTheDocument();

    rerender(
      <Beispiel
        aktionen={aktionen([{ id: "a1", titel: "Geplant", faelligAm: "2026-09-20" }])}
        onAktionErstellen={() => {}}
        aktionArten={[{ art: "aufgabe", label: "Aufgabe erstellen" }, { art: "meeting", label: "Meeting erstellen" }]}
      />,
    );
    // Die Liste bleibt beim Neuzeichnen offen.
    expect(screen.getByRole("button", { name: /Aktion erstellen/ })).toBeInTheDocument();
  });
});
