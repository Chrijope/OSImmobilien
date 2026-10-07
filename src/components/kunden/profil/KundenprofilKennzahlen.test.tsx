import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { KundenprofilKennzahlen } from "./KundenprofilKennzahlen";
import { baueKundenAufgabenListe } from "@/lib/kundenAufgabenListe";
import { baueGeplanteAktionen } from "@/lib/kundenNaechsteAktion";
import type { Aufgabe } from "@/lib/aufgabenStore";

const JETZT = new Date(2026, 8, 15, 14, 0);

function liste(teile: Array<Partial<Aufgabe> & { id: string }>) {
  return baueKundenAufgabenListe(
    teile.map((t) => ({
      benutzerId: "u1",
      kontaktId: "k1",
      typ: "aufgabe",
      prioritaet: "mittel",
      status: "offen",
      titel: "Aufgabe",
      ...t,
    }) as Aufgabe),
    [],
    JETZT,
  );
}

const grund = {
  schritt: null,
  letzter: undefined,
  onUebersicht: () => {},
  onVerlauf: () => {},
  onAufgaben: () => {},
};

/** Geplante Aktionen aus Aufgaben mit Fälligkeit, gerechnet gegen JETZT. */
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
  );
}

/** Die Kacheln mit echtem Auf- und Zuklappen, wie im Kundenprofil. */
function Beispiel(props: Partial<React.ComponentProps<typeof KundenprofilKennzahlen>> = {}) {
  const [offen, setOffen] = useState(false);
  const [aktionenOffen, setAktionenOffen] = useState(false);
  const aufgaben = props.aufgaben ?? [];
  return (
    <KundenprofilKennzahlen
      {...grund}
      aufgabenAnzahl={aufgaben.length}
      ueberfaellig={aufgaben.filter((a) => a.ueberfaellig).length}
      aufgaben={aufgaben}
      listeOffen={offen}
      onListeUmschalten={() => setOffen((o) => !o)}
      aktionenOffen={aktionenOffen}
      onAktionenUmschalten={() => setAktionenOffen((o) => !o)}
      {...props}
    />
  );
}

it("klappt die Liste auf und wieder zu", () => {
  render(<Beispiel aufgaben={liste([{ id: "a1", titel: "Unterlagen prüfen", faelligAm: "2026-09-20" }])} />);
  expect(screen.queryByText("Unterlagen prüfen")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Aufgaben anzeigen" }));
  expect(screen.getByText("Unterlagen prüfen")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Liste ausblenden" }));
  expect(screen.queryByText("Unterlagen prüfen")).not.toBeInTheDocument();
});

it("zeigt überfällige zuerst und benennt sie als überfällig", () => {
  render(
    <Beispiel
      aufgaben={liste([
        { id: "a1", titel: "Später", faelligAm: "2026-09-30" },
        { id: "a2", titel: "Längst fällig", faelligAm: "2026-09-01" },
      ])}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Aufgaben anzeigen" }));
  const zeilen = screen.getAllByRole("listitem").map((li) => li.textContent || "");
  expect(zeilen[0]).toContain("Längst fällig");
  expect(zeilen[0]).toContain("überfällig seit 01.09.2026");
  expect(zeilen[1]).toContain("Später");
});

it("sagt bei nichts Offenem ruhig Bescheid", () => {
  render(<Beispiel aufgaben={[]} />);
  fireEvent.click(screen.getByRole("button", { name: "Aufgaben anzeigen" }));
  expect(screen.getByText("Nichts offen.")).toBeInTheDocument();
});

it("reicht das Abhaken mit dem richtigen Eintrag weiter", async () => {
  const erledigen = vi.fn().mockResolvedValue(undefined);
  render(<Beispiel aufgaben={liste([{ id: "a1", titel: "Anrufen" }])} onErledigen={erledigen} />);
  fireEvent.click(screen.getByRole("button", { name: "Aufgaben anzeigen" }));
  fireEvent.click(screen.getByRole("button", { name: "Anrufen als erledigt markieren" }));
  await waitFor(() => expect(erledigen).toHaveBeenCalledTimes(1));
  expect(erledigen.mock.calls[0][0]).toMatchObject({ id: "a1", quelle: "aufgabe" });
});

it("zeigt ohne Erledigen-Recht kein Häkchen und keinen Anlegen-Knopf", () => {
  render(<Beispiel aufgaben={liste([{ id: "a1", titel: "Anrufen" }])} />);
  fireEvent.click(screen.getByRole("button", { name: "Aufgaben anzeigen" }));
  expect(screen.getByText("Anrufen")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /als erledigt markieren/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Aufgabe hinzufügen/ })).not.toBeInTheDocument();
});

describe("Kachel Nächste Aktion", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(JETZT);
  });
  afterEach(() => {
    vi.useRealTimers();
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

  it("nennt einen verstrichenen Schritt überfällig, wenn nichts mehr bevorsteht", () => {
    render(<Beispiel aktionen={aktionen([{ id: "a1", titel: "Rückruf", faelligAm: "2026-09-10", uhrzeit: "09:30" }])} />);
    expect(screen.getByText("überfällig seit Do 10.09., 09:30")).toHaveClass("text-destructive");
  });

  it("sagt in Rot Bescheid, wenn nichts geplant ist, und zeigt den Ampeltext", () => {
    render(<Beispiel ampel={{ ton: "rot", titel: "Handlungsbedarf", kurztext: "5d inaktiv" }} />);
    expect(screen.getByText("Nichts geplant")).toHaveClass("text-destructive");
    expect(screen.getByText("5d inaktiv")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Status: Handlungsbedarf" })).toHaveClass("bg-red-500");
  });

  it("klappt die Liste chronologisch auf und reicht den Sprung mit dem richtigen Eintrag weiter", () => {
    const springen = vi.fn();
    render(
      <Beispiel
        aktionen={aktionen([
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
    fireEvent.click(screen.getByRole("button", { name: /Später/ }));
    expect(springen).toHaveBeenCalledTimes(1);
    expect(springen.mock.calls[0][0]).toMatchObject({ schluessel: "aufgabe:a1" });
    fireEvent.click(screen.getByRole("button", { name: "Aktionen ausblenden" }));
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("zeigt Aktion erstellen nur mit Recht und stellt beide Listen untereinander, erst Aktionen, dann Aufgaben", () => {
    const { rerender } = render(
      <Beispiel
        aktionen={aktionen([{ id: "a1", titel: "Geplant", faelligAm: "2026-09-20" }])}
        aufgaben={liste([{ id: "b1", titel: "Offen" }])}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Aktionen anzeigen" }));
    fireEvent.click(screen.getByRole("button", { name: "Aufgaben anzeigen" }));
    expect(screen.queryByRole("button", { name: /Aktion erstellen/ })).not.toBeInTheDocument();
    // "Geplant" steht zweimal: in der Kachel und in der Liste. Gemeint ist die Liste.
    const geplant = screen.getAllByText("Geplant").at(-1)!;
    const offen = screen.getByText("Offen");
    // Node.DOCUMENT_POSITION_FOLLOWING: "Offen" kommt im Dokument nach "Geplant".
    expect(geplant.compareDocumentPosition(offen) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

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
