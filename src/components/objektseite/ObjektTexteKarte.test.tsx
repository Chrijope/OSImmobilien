import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

/**
 * Die Karte mit Kurzbeschreibung und Standortargumenten.
 *
 * Seit dem Wegfall der Freigabe sind drei Dinge wichtiger als das Aussehen:
 * Der Lauf startet von selbst, aber nur wenn etwas fehlt. Es ist zu sehen,
 * woher der Text stammt. Und ein von Hand geschriebener Text gewinnt.
 *
 * Seit dem 23.09.2026 (Christians Vorgabe) kommt hinzu: Es gibt keine Knöpfe
 * mehr zum Erzeugen, Neuerzeugen, Selbstschreiben oder Wiederherstellen. Die
 * Texte sind immer automatisch vorausgefüllt, und nur der Admin ändert sie,
 * über den Stift und den Dialog `ObjektTexteDialog`.
 */

const attrappen = vi.hoisted(() => ({
  starten: vi.fn(),
  erzeugen: vi.fn(),
  speichern: vi.fn(),
  erfolg: vi.fn(),
  fehler: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock("@/lib/objekteStore", () => ({ updateObjektFieldFast: vi.fn(), getObjektById: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: attrappen.erfolg, error: attrappen.fehler, warning: vi.fn() } }));
vi.mock("@/lib/objektTexteKi", async (echt) => ({
  ...(await echt<Record<string, unknown>>()),
  starteObjektTexteBeiBedarf: attrappen.starten,
  erzeugeObjektTexte: attrappen.erzeugen,
  speichereGepflegteTexte: attrappen.speichern,
}));

const { OBJEKT_TEXTE_META_SCHLUESSEL, OBJEKT_TEXTE_SCHEMA } = await import("@/lib/objektTexteKi");
const { ObjektTexteKarte } = await import("./ObjektTexteKarte");

const VORSCHLAG = {
  schema: OBJEKT_TEXTE_SCHEMA,
  kurzbeschreibung: "Mehrfamilienhaus von 1962 in ruhiger Seitenstraße.",
  standortargumente: [
    { argument: "Kurze Wege. Supermarkt in 280 m.", beleg: "Einkaufen in der Nähe: Supermarkt Nord" },
    { argument: "Anbindung. Straßenbahn in 150 m.", beleg: "ÖPNV in der Nähe: Haltestelle Musterweg" },
    { argument: "Drei.", beleg: "x" },
    { argument: "Vier.", beleg: "x" },
    { argument: "Fünf.", beleg: "x" },
  ],
  sanierungen: [],
  erzeugtAm: "2026-09-22T10:00:00.000Z",
  modell: "google/gemini-2.5-flash",
  quellenStand: "abc",
  quellen: ["Titel: Musterhaus", "Einwohner der Gemeinde: 301000 (Stand 2024)"],
  beanstandungen: [],
};
const AUTOMATISCHE_ARGUMENTE = VORSCHLAG.standortargumente.map((a) => a.argument);

function objekt(weiteresMeta: Record<string, unknown> = {}, texte: unknown = undefined, weiteres: Record<string, unknown> = {}) {
  return {
    id: "o1",
    dokumente: [],
    ...weiteres,
    meta: { ...weiteresMeta, ...(texte ? { [OBJEKT_TEXTE_META_SCHLUESSEL]: texte } : {}) },
  } as never;
}

const STIFT = "Beschreibung und Standort bearbeiten";

/** Alle Knöpfe, die es seit dem 23.09.2026 nicht mehr geben darf. */
function keineAltenKnoepfe() {
  for (const name of [/erzeugen/i, /Selbst schreiben/, /wiederherstellen/i, /^Bearbeiten$/, /löschen/i, /verwerfen/i]) {
    expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
  }
}

function dialog() {
  return within(screen.getByRole("dialog"));
}

describe("Karte mit Beschreibung und Standortargumenten", () => {
  beforeEach(() => {
    attrappen.starten.mockReset().mockResolvedValue(undefined);
    attrappen.erzeugen.mockReset();
    attrappen.speichern.mockReset();
    attrappen.erfolg.mockReset();
    attrappen.fehler.mockReset();
  });

  it("stößt den selbsttätigen Lauf beim Aufbau genau einmal an", async () => {
    render(<ObjektTexteKarte objekt={objekt()} />);
    await waitFor(() => expect(attrappen.starten).toHaveBeenCalledTimes(1));
    // Die Entscheidung, ob wirklich etwas läuft, trifft die Lib, nicht die Karte.
    expect(attrappen.erzeugen).not.toHaveBeenCalled();
  });

  it("zeigt den erzeugten Text ohne Beleg im Kästchen und ohne Kennzeichnung als automatisch erstellt", async () => {
    render(<ObjektTexteKarte objekt={objekt({}, VORSCHLAG)} />);
    expect(screen.getByText(/Mehrfamilienhaus von 1962/)).toBeInTheDocument();
    expect(screen.getByText("Kurze Wege. Supermarkt in 280 m.")).toBeInTheDocument();
    // Christians Vorgabe vom 01.10.2026: Belege nur unter „Grundlage ansehen“.
    expect(screen.queryByText(/Beleg:/)).not.toBeInTheDocument();
    // Christians Vorgabe vom 24.09.2026: kein Chip, kein Datum, kein Hinweissatz.
    expect(screen.queryByText("Automatisch")).not.toBeInTheDocument();
    expect(screen.queryByText(/Automatisch erstellt/)).not.toBeInTheDocument();
    expect(screen.queryByText(/erstellt am/)).not.toBeInTheDocument();
  });

  it("zeigt den von Hand gepflegten Text und kennzeichnet ihn als solchen", () => {
    render(
      <ObjektTexteKarte
        objekt={objekt({ kurzbeschreibung: "Von Hand geschrieben.", standortargumente: ["Eins", "Zwei"] }, VORSCHLAG)}
      />,
    );
    expect(screen.getByText("Von Hand geschrieben.")).toBeInTheDocument();
    expect(screen.queryByText(/Mehrfamilienhaus von 1962/)).not.toBeInTheDocument();
    expect(screen.getAllByText("Von Hand").length).toBeGreaterThan(0);
    // Ohne automatisch entstandenen Text steht auch kein Automatikvermerk da.
    expect(screen.queryByText(/Automatisch erstellt aus Objektangaben/)).not.toBeInTheDocument();
  });

  /*
   * Seit Fassung 4 (Christian, 23.09.2026): kein Warnkasten „Bitte ansehen“
   * mehr, für niemanden. Was die Prüfung findet und ob die Umgebung gemessen
   * wurde, sehen nur Admin und Inhaber, eingeklappt am Fuß der Karte.
   */
  const MIT_BEFUND = {
    ...VORSCHLAG,
    beanstandungen: ["Argument 1: „Rendite“ nennt eine Rendite. Bitte prüfen."],
    umgebung: { gemessen: false, grund: "OpenStreetMap (Overpass) war nicht erreichbar.", art: "dienst" },
  };

  it("zeigt Vertrieb und Kunden keinen Warnkasten und keinen Vermerk", () => {
    render(<ObjektTexteKarte objekt={objekt({}, MIT_BEFUND)} />);
    expect(screen.queryByText("Bitte ansehen")).not.toBeInTheDocument();
    expect(screen.queryByText(/ließ sich nicht messen/)).not.toBeInTheDocument();
    expect(screen.queryByText(/nennt eine Rendite/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("interner-vermerk")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Erneut versuchen/ })).not.toBeInTheDocument();
    // Der Text selbst steht trotzdem da.
    expect(screen.getByText(/Mehrfamilienhaus von 1962/)).toBeInTheDocument();
  });

  it("zeigt Admin und Inhaber einen eingeklappten internen Vermerk mit Grund", () => {
    render(<ObjektTexteKarte objekt={objekt({}, MIT_BEFUND)} darfBearbeiten />);
    expect(screen.queryByText("Bitte ansehen")).not.toBeInTheDocument();
    const vermerk = screen.getByTestId("interner-vermerk");
    expect(vermerk).toHaveTextContent("Interner Vermerk, nur für Admin und Inhaber (2)");
    // Eingeklappt: Der Grund steht erst nach dem Aufklappen da.
    expect(screen.queryByText(/ließ sich nicht messen/)).not.toBeInTheDocument();
    fireEvent.click(vermerk);
    expect(screen.getByText(/Die Umgebung ließ sich nicht messen: OpenStreetMap \(Overpass\) war nicht erreichbar/)).toBeInTheDocument();
    expect(screen.getByText(/nennt eine Rendite/)).toBeInTheDocument();
  });

  it("lässt den Admin Texte und Messung erneut anstoßen", async () => {
    attrappen.erzeugen.mockResolvedValue({ neu: true, gespeichert: true, fehler: "", texte: { ...VORSCHLAG, kurzbeschreibung: "Neu gemessen und neu geschrieben." } });
    const geaendert = vi.fn();
    render(<ObjektTexteKarte objekt={objekt({}, MIT_BEFUND)} darfBearbeiten onGeaendert={geaendert} />);
    fireEvent.click(screen.getByTestId("interner-vermerk"));
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    await waitFor(() => expect(attrappen.erzeugen).toHaveBeenCalledWith("o1", { neuErzeugen: true, neuMessen: true }));
    await waitFor(() => expect(screen.getByText("Neu gemessen und neu geschrieben.")).toBeInTheDocument());
    expect(attrappen.erfolg).toHaveBeenCalledWith("Die Texte sind neu erstellt.");
    expect(geaendert).toHaveBeenCalled();
  });

  it("nennt im Vermerk auch eine Messung nur ab dem Postleitzahlgebiet und den letzten Fehler", () => {
    const grob = { ...VORSCHLAG, umgebung: { gemessen: true, genauigkeit: "plz" } };
    const meta = { letzterFehler: { zeitpunkt: "2026-09-23T18:00:00.000Z", grund: "Status 400", version: 4 } };
    render(<ObjektTexteKarte objekt={objekt({}, { ...grob, ...meta })} darfBearbeiten />);
    fireEvent.click(screen.getByTestId("interner-vermerk"));
    expect(screen.getByText(/nur ab dem Postleitzahlgebiet gemessen/)).toBeInTheDocument();
    expect(screen.getByText(/ist gescheitert: Status 400/)).toBeInTheDocument();
  });

  it("zeigt ohne Befund auch dem Admin keinen Vermerk", () => {
    render(<ObjektTexteKarte objekt={objekt({}, { ...VORSCHLAG, umgebung: { gemessen: true, genauigkeit: "adresse" } })} darfBearbeiten />);
    expect(screen.queryByTestId("interner-vermerk")).not.toBeInTheDocument();
  });

  it("nennt den Grund, wenn ein Lauf bewusst nichts erzeugt hat", () => {
    render(
      <ObjektTexteKarte
        objekt={objekt({}, {
          ...VORSCHLAG,
          kurzbeschreibung: "",
          standortargumente: [],
          ohneErgebnis: "Für die Standortargumente fehlt die Grundlage.",
        })}
      />,
    );
    expect(screen.getByText(/fehlt die Grundlage/)).toBeInTheDocument();
  });

  it("zeigt ohne Text einen ruhigen Hinweis statt eines Knopfes, auch dem Admin", async () => {
    render(<ObjektTexteKarte objekt={objekt({}, undefined, { titel: "Musterhaus" })} darfBearbeiten />);
    await waitFor(() => expect(screen.getByText(/werden automatisch erstellt/)).toBeInTheDocument());
    keineAltenKnoepfe();
    // Der Admin kann trotzdem selbst schreiben, über den Stift.
    expect(screen.getByRole("button", { name: STIFT })).toBeEnabled();
  });

  it("sperrt den Stift, solange der selbsttätige Lauf unterwegs ist", async () => {
    let fertig: (wert: undefined) => void = () => undefined;
    attrappen.starten.mockReturnValue(new Promise((r) => { fertig = r; }));
    render(<ObjektTexteKarte objekt={objekt({}, undefined, { titel: "Musterhaus" })} darfBearbeiten />);
    expect(screen.getByText(/werden gerade erstellt/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: STIFT })).toBeDisabled();
    fertig(undefined);
    await waitFor(() => expect(screen.getByRole("button", { name: STIFT })).toBeEnabled());
  });

  it("hat keine Knöpfe mehr zum Erzeugen, Selbstschreiben oder Wiederherstellen", () => {
    render(<ObjektTexteKarte objekt={objekt({ kurzbeschreibung: "Von Hand." }, VORSCHLAG)} darfBearbeiten />);
    keineAltenKnoepfe();
  });

  it("zeigt den Stift nur, wenn die Seite es ausdrücklich erlaubt", () => {
    const { unmount } = render(<ObjektTexteKarte objekt={objekt({}, VORSCHLAG)} />);
    // Ohne Angabe kein Stift: Eine neue Seite soll ihn nicht versehentlich jedem zeigen.
    expect(screen.queryByRole("button", { name: STIFT })).not.toBeInTheDocument();
    expect(screen.getByText(/Mehrfamilienhaus von 1962/)).toBeInTheDocument();
    unmount();

    render(<ObjektTexteKarte objekt={objekt({}, VORSCHLAG)} darfBearbeiten={false} />);
    expect(screen.queryByRole("button", { name: STIFT })).not.toBeInTheDocument();
  });
});

describe("Dialog zum Bearbeiten von Beschreibung und Standort", () => {
  beforeEach(() => {
    attrappen.starten.mockReset().mockResolvedValue(undefined);
    attrappen.speichern.mockReset();
    attrappen.erfolg.mockReset();
    attrappen.fehler.mockReset();
  });

  function oeffne(o = objekt({}, VORSCHLAG)) {
    const ergebnis = render(<ObjektTexteKarte objekt={o} darfBearbeiten />);
    fireEvent.click(screen.getByRole("button", { name: STIFT }));
    return ergebnis;
  }

  it("ist mit dem angezeigten Text vorbelegt, genau fünf Argumentfelder", () => {
    oeffne();
    expect((dialog().getByLabelText("Beschreibung") as HTMLTextAreaElement).value).toBe(VORSCHLAG.kurzbeschreibung);
    for (let i = 0; i < 5; i++) {
      expect((dialog().getByLabelText(`Argument ${i + 1}`) as HTMLTextAreaElement).value).toBe(AUTOMATISCHE_ARGUMENTE[i]);
    }
    expect(dialog().queryByLabelText("Argument 6")).not.toBeInTheDocument();
    expect(dialog().getByText(`${VORSCHLAG.kurzbeschreibung.length} von 1000 Zeichen.`)).toBeInTheDocument();
  });

  it("speichert den geänderten Text als von Hand gepflegt", async () => {
    attrappen.speichern.mockResolvedValue({
      ok: true, fehler: "",
      meta: { kurzbeschreibung: "Von Hand überarbeitet.", standortargumente: ["A", "B", "C", "D", "E"], [OBJEKT_TEXTE_META_SCHLUESSEL]: VORSCHLAG },
    });
    oeffne();
    fireEvent.change(dialog().getByLabelText("Beschreibung"), { target: { value: "  Von Hand überarbeitet.  " } });
    ["A", "B", "C", "D", "E"].forEach((wert, i) => {
      fireEvent.change(dialog().getByLabelText(`Argument ${i + 1}`), { target: { value: wert } });
    });
    fireEvent.click(dialog().getByRole("button", { name: "Speichern" }));

    await waitFor(() => expect(attrappen.speichern).toHaveBeenCalledTimes(1));
    expect(attrappen.speichern.mock.calls[0][1]).toEqual({
      kurzbeschreibung: "Von Hand überarbeitet.",
      standortargumente: ["A", "B", "C", "D", "E"],
      marktargumente: [],
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // Die Karte zeigt den neuen Stand sofort, ohne auf die Seite zu warten.
    expect(screen.getByText("Von Hand überarbeitet.")).toBeInTheDocument();
    expect(screen.getAllByText("Von Hand").length).toBeGreaterThan(0);
  });

  it("speichert auf dem aktuellen meta der Seite, nicht auf einem alten Stand der Karte", async () => {
    attrappen.speichern.mockResolvedValue({
      ok: true, fehler: "",
      meta: { kurzbeschreibung: "Erste Fassung.", standortargumente: AUTOMATISCHE_ARGUMENTE, [OBJEKT_TEXTE_META_SCHLUESSEL]: VORSCHLAG },
    });
    const { rerender } = oeffne();
    fireEvent.change(dialog().getByLabelText("Beschreibung"), { target: { value: "Erste Fassung." } });
    fireEvent.click(dialog().getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    // Inzwischen hat jemand über den Stift an den Objektdetails den
    // Energieausweis gepflegt, und die Seite hat das neue Objekt geladen.
    rerender(<ObjektTexteKarte objekt={objekt({ energieausweis: { klasse: "B" } }, VORSCHLAG)} darfBearbeiten />);
    fireEvent.click(screen.getByRole("button", { name: STIFT }));
    // Vorbelegt ist weiter der eben gespeicherte Text.
    expect((dialog().getByLabelText("Beschreibung") as HTMLTextAreaElement).value).toBe("Erste Fassung.");
    fireEvent.change(dialog().getByLabelText("Beschreibung"), { target: { value: "Zweite Fassung." } });
    fireEvent.click(dialog().getByRole("button", { name: "Speichern" }));

    await waitFor(() => expect(attrappen.speichern).toHaveBeenCalledTimes(2));
    const meta = (attrappen.speichern.mock.calls[1][0] as { meta: Record<string, unknown> }).meta;
    expect(meta.energieausweis).toEqual({ klasse: "B" });
    expect(meta.kurzbeschreibung).toBe("Erste Fassung.");
  });

  it("zählt bis 1000 Zeichen und lässt einen zu langen Text nicht speichern", () => {
    oeffne();
    fireEvent.change(dialog().getByLabelText("Beschreibung"), { target: { value: "x".repeat(1001) } });
    expect(dialog().getByText("1001 von 1000 Zeichen.")).toHaveClass("text-destructive");
    expect(dialog().getByText(/länger als 1000 Zeichen/)).toBeInTheDocument();
    expect(dialog().getByRole("button", { name: "Speichern" })).toBeDisabled();
  });

  it("verlangt eine Beschreibung und alle fünf Argumente", () => {
    oeffne();
    fireEvent.change(dialog().getByLabelText("Argument 3"), { target: { value: "  " } });
    expect(dialog().getByText(/Zum Speichern fehlt noch Argument 3/)).toBeInTheDocument();
    expect(dialog().getByRole("button", { name: "Speichern" })).toBeDisabled();

    fireEvent.change(dialog().getByLabelText("Beschreibung"), { target: { value: "" } });
    expect(dialog().getByText(/fehlt noch die Beschreibung und Argument 3/)).toBeInTheDocument();
  });

  it("stellt den automatischen Text wieder her, gespeichert wird erst mit Speichern", async () => {
    attrappen.speichern.mockResolvedValue({ ok: true, fehler: "", meta: {} });
    oeffne(objekt({ kurzbeschreibung: "Von Hand.", standortargumente: ["Eins", "Zwei", "Drei", "Vier", "Fünf"] }, VORSCHLAG));
    expect((dialog().getByLabelText("Beschreibung") as HTMLTextAreaElement).value).toBe("Von Hand.");

    fireEvent.click(dialog().getByRole("button", { name: /Automatischen Text wiederherstellen/ }));
    expect((dialog().getByLabelText("Beschreibung") as HTMLTextAreaElement).value).toBe(VORSCHLAG.kurzbeschreibung);
    expect((dialog().getByLabelText("Argument 2") as HTMLTextAreaElement).value).toBe(AUTOMATISCHE_ARGUMENTE[1]);
    expect(attrappen.speichern).not.toHaveBeenCalled();
    expect(dialog().getByRole("button", { name: /Automatischen Text wiederherstellen/ })).toBeDisabled();

    fireEvent.click(dialog().getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(attrappen.speichern).toHaveBeenCalledTimes(1));
    /*
     * Zurückgeschrieben wird der erzeugte Text, nicht nichts.
     *
     * Objektseite und Exposé lesen aus denselben Feldern. Ein bloßes Leeren
     * ließe dort gar nichts stehen. Wortgleich gilt er wieder als automatisch.
     */
    expect(attrappen.speichern.mock.calls[0][1]).toEqual({
      kurzbeschreibung: VORSCHLAG.kurzbeschreibung,
      standortargumente: AUTOMATISCHE_ARGUMENTE,
      marktargumente: [],
    });
    expect(attrappen.erfolg).toHaveBeenCalledWith("Der automatische Text steht wieder.");
  });

  it("lässt den automatischen Stand speichern, auch wenn der Lauf weniger als fünf Argumente belegen konnte", async () => {
    attrappen.speichern.mockResolvedValue({ ok: true, fehler: "", meta: {} });
    const knapp = { ...VORSCHLAG, standortargumente: VORSCHLAG.standortargumente.slice(0, 3) };
    oeffne(objekt({ kurzbeschreibung: "Von Hand." }, knapp));
    fireEvent.click(dialog().getByRole("button", { name: /Automatischen Text wiederherstellen/ }));
    expect(dialog().getByRole("button", { name: "Speichern" })).toBeEnabled();
  });

  it("bietet den Weg zurück nicht an, wenn es keinen automatischen Text gibt", () => {
    oeffne(objekt({ kurzbeschreibung: "Von Hand.", standortargumente: ["Eins"] }));
    expect(dialog().queryByRole("button", { name: /wiederherstellen/i })).not.toBeInTheDocument();
  });

  it("verwirft ohne zu speichern", async () => {
    oeffne();
    fireEvent.change(dialog().getByLabelText("Beschreibung"), { target: { value: "Nicht speichern." } });
    fireEvent.click(dialog().getByRole("button", { name: "Verwerfen" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(attrappen.speichern).not.toHaveBeenCalled();
    expect(screen.getByText(/Mehrfamilienhaus von 1962/)).toBeInTheDocument();
  });

  it("bleibt offen und meldet den Fehler, wenn das Speichern scheitert", async () => {
    attrappen.speichern.mockResolvedValue({ ok: false, fehler: "Fehlt die Berechtigung, dieses Objekt zu ändern?" });
    oeffne();
    fireEvent.change(dialog().getByLabelText("Beschreibung"), { target: { value: "Neu." } });
    fireEvent.click(dialog().getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(attrappen.fehler).toHaveBeenCalledWith("Fehlt die Berechtigung, dieses Objekt zu ändern?"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect((dialog().getByLabelText("Beschreibung") as HTMLTextAreaElement).value).toBe("Neu.");
  });
});

describe("Markt und Standort", () => {
  beforeEach(() => {
    attrappen.starten.mockReset().mockResolvedValue(undefined);
    attrappen.speichern.mockReset();
  });

  const MARKT = [
    { argument: "Große Stadt. Augsburg zählt 301.033 Einwohner, Destatis, Stand 07/2026.", beleg: "Markt Augsburg, Einwohner: 301.033 (Destatis, Stand 07/2026)" },
    { argument: "Gefragter Arbeitsmarkt. Arbeitslosenquote 4,1 Prozent, Destatis, Stand 07/2026.", beleg: "Markt Augsburg, Arbeitslosenquote: 4,1 Prozent (Destatis, Stand 07/2026)" },
  ];
  const MIT_MARKT = { ...VORSCHLAG, marktargumente: MARKT };

  it("zeigt die Marktargumente unter den Standortargumenten, ohne Beleg", () => {
    render(<ObjektTexteKarte objekt={objekt({}, MIT_MARKT)} />);
    const block = within(screen.getByTestId("markt-und-standort"));
    expect(block.getByText("Markt und Standort")).toBeInTheDocument();
    expect(block.getByText(MARKT[0].argument)).toBeInTheDocument();
    expect(block.queryByText(/Beleg:/)).not.toBeInTheDocument();
  });

  it("sagt ohne Marktdaten, warum der Block leer ist", () => {
    render(<ObjektTexteKarte objekt={objekt({}, { ...VORSCHLAG, marktargumente: [] })} />);
    expect(screen.getByText(/keine erhobenen Kennzahlen/)).toBeInTheDocument();
  });

  it("bietet im Dialog drei Felder, vorbelegt, leere erlaubt, und speichert sie mit", async () => {
    attrappen.speichern.mockResolvedValue({ ok: true, fehler: "", meta: {} });
    render(<ObjektTexteKarte objekt={objekt({}, MIT_MARKT)} darfBearbeiten />);
    fireEvent.click(screen.getByRole("button", { name: STIFT }));
    expect((dialog().getByLabelText("Marktargument 1") as HTMLTextAreaElement).value).toBe(MARKT[0].argument);
    expect((dialog().getByLabelText("Marktargument 2") as HTMLTextAreaElement).value).toBe(MARKT[1].argument);
    expect((dialog().getByLabelText("Marktargument 3") as HTMLTextAreaElement).value).toBe("");
    // Ein leeres drittes Feld hält das Speichern nicht auf.
    expect(dialog().getByRole("button", { name: "Speichern" })).toBeEnabled();

    fireEvent.change(dialog().getByLabelText("Marktargument 3"), { target: { value: "Von Hand ergänzt." } });
    fireEvent.click(dialog().getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(attrappen.speichern).toHaveBeenCalledTimes(1));
    expect(attrappen.speichern.mock.calls[0][1].marktargumente).toEqual([MARKT[0].argument, MARKT[1].argument, "Von Hand ergänzt."]);
  });

  it("lässt ein zu langes Marktargument nicht speichern", () => {
    render(<ObjektTexteKarte objekt={objekt({}, MIT_MARKT)} darfBearbeiten />);
    fireEvent.click(screen.getByRole("button", { name: STIFT }));
    fireEvent.change(dialog().getByLabelText("Marktargument 1"), { target: { value: "x".repeat(161) } });
    expect(dialog().getByRole("button", { name: "Speichern" })).toBeDisabled();
  });
});

