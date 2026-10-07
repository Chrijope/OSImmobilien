/**
 * Die Pflichtschranke des MORE Lotsen: Ohne gespeicherte Zustimmung zum
 * Hinweis „Umgang mit KI“ ist die Eingabe gesperrt, der Knopf erst mit
 * Häkchen aktiv. Fehlt die Migration, steht „wird gerade eingerichtet“.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const store = vi.hoisted(() => ({
  zustimmung: { akzeptiert: false, migrationFehlt: false, fehler: null as string | null },
  speichern: vi.fn(async () => ({ akzeptiert: true, migrationFehlt: false, fehler: null })),
  fragen: vi.fn(),
  vorbereiten: vi.fn(),
  name: "Test",
  verlauf: [] as Array<{ id: string; rolle: "user" | "assistant"; inhalt: string; quellen: string[]; erstelltAm: string }>,
}));

vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { name: store.name, role: "admin" }, authUser: { id: "u1" } }),
}));

// Das Radix-Popover rechnet in jsdom seine Lage fortlaufend neu und hält act
// sekundenlang fest (wie in SteuerCockpitEigen.test.tsx). Für die Logik genügt
// ein schlichtes Auf und Zu.
vi.mock("@/components/ui/popover", async () => {
  const React = await import("react");
  const Ctx = React.createContext<{ open: boolean; setOpen: (o: boolean) => void }>({ open: false, setOpen: () => {} });
  return {
    Popover: ({ children }: { children: React.ReactNode }) => {
      const [open, setOpen] = React.useState(false);
      return React.createElement(Ctx.Provider, { value: { open, setOpen } }, children);
    },
    PopoverTrigger: ({ children }: { children: React.ReactElement }) => {
      const c = React.useContext(Ctx);
      return React.cloneElement(children, { onClick: () => c.setOpen(!c.open) });
    },
    PopoverContent: ({ children }: { children: React.ReactNode }) => (React.useContext(Ctx).open ? React.createElement("div", null, children) : null),
  };
});

vi.mock("@/lib/lotseStore", async () => {
  const regeln = await import("../../../../supabase/functions/_shared/lotse-regeln");
  return {
    lotseVorschlaege: regeln.lotseVorschlaege,
    trenneQuellen: regeln.trenneQuellen,
    frageMitKundendaten: regeln.frageMitKundendaten,
    LOTSE_KUNDENDATEN_TEXT: regeln.LOTSE_KUNDENDATEN_TEXT,
    frageMitKundennamen: regeln.frageMitKundennamen,
    LOTSE_KUNDENNAME_TEXT: regeln.LOTSE_KUNDENNAME_TEXT,
    ladeZustimmung: async () => store.zustimmung,
    ladeVerlauf: async () => ({ nachrichten: store.verlauf, migrationFehlt: store.zustimmung.migrationFehlt, fehler: null }),
    speichereZustimmung: store.speichern,
    frageLotse: store.fragen,
    bereiteLotseVor: store.vorbereiten,
  };
});

const { ObjektLotse } = await import("./ObjektLotse");

function zeige() {
  return render(<ObjektLotse objektId="o1" wohnungId="w1" bezeichnung="Wohnung 9, Beispielweg 1" kalkulation={null} />);
}

describe("ObjektLotse, Pflichtschranke", () => {
  beforeEach(() => {
    store.zustimmung = { akzeptiert: false, migrationFehlt: false, fehler: null };
    store.speichern.mockClear();
    store.fragen.mockReset();
    store.vorbereiten.mockReset();
    store.verlauf = [];
    store.name = "Test";
  });

  it("sperrt die Eingabe bis zur Zustimmung, der Knopf braucht das Häkchen", async () => {
    zeige();
    const knopf = await screen.findByRole("button", { name: /Verstanden und akzeptiert/ });
    expect(store.vorbereiten).not.toHaveBeenCalled();
    const feld = screen.getByLabelText("Frage an den Lotsen");
    expect(feld).toBeDisabled();
    expect(knopf).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(knopf).toBeEnabled();
    fireEvent.click(knopf);

    await waitFor(() => expect(screen.getByLabelText("Frage an den Lotsen")).toBeEnabled());
    expect(store.speichern).toHaveBeenCalledTimes(1);
    // Erst nach der Zustimmung werden die Unterlagen im Hintergrund vorbereitet.
    await waitFor(() => expect(store.vorbereiten).toHaveBeenCalledWith({ rolle: "admin", objektId: "o1", wohnungId: "w1" }));
    expect(screen.queryByTestId("lotse-hinweis")).toBeNull();
    // Leerer Verlauf: die drei Vorschlagsfragen.
    expect(screen.getByTestId("lotse-vorschlaege").querySelectorAll("button")).toHaveLength(3);
  });

  it("nach der Zustimmung öffnet das i den Hinweis nur zum Lesen", async () => {
    store.zustimmung = { akzeptiert: true, migrationFehlt: false, fehler: null };
    zeige();
    await waitFor(() => expect(screen.getByLabelText("Frage an den Lotsen")).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Umgang mit KI anzeigen" }));
    expect(screen.getByTestId("lotse-hinweis")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    expect(screen.queryByTestId("lotse-hinweis")).toBeNull();
  });

  it("ohne Migration: Hinweis auf die Einrichtung, keine Eingabe", async () => {
    store.zustimmung = { akzeptiert: false, migrationFehlt: true, fehler: null };
    zeige();
    expect(await screen.findByTestId("lotse-migration")).toHaveTextContent("Der Lotse wird gerade eingerichtet");
    expect(screen.getByLabelText("Frage an den Lotsen")).toBeDisabled();
  });

  it("zeigt die Antwort mit Quellen als Chips und der Kennzeichnung", async () => {
    store.zustimmung = { akzeptiert: true, migrationFehlt: false, fehler: null };
    const text = "Das nicht umlagefähige Hausgeld liegt bei 35,52 Euro.\nQUELLEN: Objektdaten, Stand 28.09.2026 | fehlt: ETV-Protokolle";
    let fertig!: (a: { ok: true; text: string }) => void;
    store.fragen.mockImplementation(() => new Promise((r) => { fertig = r; }));
    zeige();
    const feld = await screen.findByLabelText("Frage an den Lotsen");
    await waitFor(() => expect(feld).toBeEnabled());
    fireEvent.change(feld, { target: { value: "Wie hoch ist das Hausgeld?" } });
    fireEvent.click(screen.getByRole("button", { name: "Senden" }));
    // Sofort nach dem Absenden: die Frage und die Statuszeile.
    expect(screen.getByText("Wie hoch ist das Hausgeld?")).toBeInTheDocument();
    expect(await screen.findByTestId("lotse-denkt")).toHaveTextContent("Der Lotse liest die Objektdaten …");
    await act(async () => fertig({ ok: true, text }));

    const quellen = await screen.findByTestId("lotse-quellen");
    expect(quellen).toHaveTextContent("Objektdaten, Stand 28.09.2026");
    expect(quellen).toHaveTextContent("fehlt: ETV-Protokolle");
    expect(screen.getByText(/KI-Antwort aus den genannten Quellen, Stand .*, nicht geprüft\./)).toBeInTheDocument();
    expect(screen.queryByText(/QUELLEN:/)).toBeNull();
    expect(store.fragen).toHaveBeenCalledWith(expect.objectContaining({ rolle: "admin", objektId: "o1", wohnungId: "w1" }));
  });

  it("die Statuszeile folgt den Stufen, geprüfte Blöcke ersetzen sie, die fertige Antwort ersetzt die Blöcke", async () => {
    store.zustimmung = { akzeptiert: true, migrationFehlt: false, fehler: null };
    type Aufruf = { beiStufe: (s: string) => void; beiBlock: (b: string) => void };
    let aufruf!: Aufruf;
    let fertig!: (a: { ok: true; text: string }) => void;
    store.fragen.mockImplementation((f: Aufruf) => { aufruf = f; return new Promise((r) => { fertig = r; }); });
    zeige();
    const feld = await screen.findByLabelText("Frage an den Lotsen");
    await waitFor(() => expect(feld).toBeEnabled());
    fireEvent.change(feld, { target: { value: "Was bleibt monatlich?" } });
    fireEvent.click(screen.getByRole("button", { name: "Senden" }));
    await screen.findByTestId("lotse-denkt");
    await act(async () => aufruf.beiStufe("unterlagen"));
    expect(screen.getByTestId("lotse-denkt")).toHaveTextContent("Der Lotse wertet eine neue Unterlage aus …");
    await act(async () => aufruf.beiStufe("formuliert"));
    expect(screen.getByTestId("lotse-denkt")).toHaveTextContent("Der Lotse formuliert die Antwort …");

    await act(async () => aufruf.beiBlock("Das Hausgeld liegt bei 210 €."));
    expect(screen.queryByTestId("lotse-denkt")).toBeNull();
    expect(screen.getByText("Das Hausgeld liegt bei 210 €.")).toBeInTheDocument();
    expect(screen.getByTestId("lotse-laeuft")).toBeInTheDocument();
    expect(screen.queryByText(/nicht geprüft\./)).toBeNull();

    await act(async () => fertig({ ok: true, text: "Das Hausgeld liegt bei 210 €.\n\nDie Kaltmiete beträgt 850 €.\nQUELLEN: Objektdaten" }));
    expect(screen.getAllByText("Das Hausgeld liegt bei 210 €.")).toHaveLength(1);
    expect(screen.getByText("Die Kaltmiete beträgt 850 €.")).toBeInTheDocument();
    expect(screen.queryByTestId("lotse-laeuft")).toBeNull();
    expect(screen.getByText(/KI-Antwort aus den genannten Quellen, Stand .*, nicht geprüft\./)).toBeInTheDocument();
  });

  it("bricht der Strom ab, bleiben gezeigte Blöcke als unvollständig markiert stehen", async () => {
    store.zustimmung = { akzeptiert: true, migrationFehlt: false, fehler: null };
    store.fragen.mockImplementation(async (f: { beiBlock: (b: string) => void }) => {
      f.beiBlock("Das Hausgeld liegt bei 210 €.");
      return { ok: false, code: "unvollstaendig", meldung: "Die Antwort ist unvollständig, bitte frag noch einmal.", text: "" };
    });
    zeige();
    const feld = await screen.findByLabelText("Frage an den Lotsen");
    await waitFor(() => expect(feld).toBeEnabled());
    fireEvent.change(feld, { target: { value: "Was bleibt monatlich?" } });
    fireEvent.click(screen.getByRole("button", { name: "Senden" }));
    expect(await screen.findByTestId("lotse-unvollstaendig")).toHaveTextContent("nicht gespeichert");
    expect(screen.getByText("Das Hausgeld liegt bei 210 €.")).toBeInTheDocument();
    expect(screen.getByTestId("lotse-meldung")).toHaveTextContent("Die Antwort ist unvollständig");
    expect(screen.queryByText(/nicht geprüft\./)).toBeNull();
  });

  it("eine Frage mit Kundendaten geht nicht hinaus, der Hinweis hat nur „Frage ändern“ (LOTSE3-002)", async () => {
    store.zustimmung = { akzeptiert: true, migrationFehlt: false, fehler: null };
    zeige();
    const feld = await screen.findByLabelText("Frage an den Lotsen");
    await waitFor(() => expect(feld).toBeEnabled());
    fireEvent.change(feld, { target: { value: "Mein Kunde verdient 4.500 € brutto, was bleibt ihm?" } });
    fireEvent.click(screen.getByRole("button", { name: "Senden" }));
    const hinweis = await screen.findByTestId("lotse-kundendaten");
    expect(hinweis).toHaveTextContent("Bitte gib hier keine Daten deiner Kunden ein. Die Rechnung für einen Kunden steht in der Investmentkalkulation seines Investments.");
    expect(store.fragen).not.toHaveBeenCalled();
    expect(hinweis.querySelectorAll("button")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Trotzdem/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Frage ändern" }));
    expect(screen.queryByTestId("lotse-kundendaten")).toBeNull();
    // Der Text bleibt stehen, der Fokus liegt wieder im Feld.
    expect(feld).toHaveValue("Mein Kunde verdient 4.500 € brutto, was bleibt ihm?");
    expect(document.activeElement).toBe(feld);
    expect(screen.queryByText("Mein Kunde verdient 4.500 € brutto, was bleibt ihm?", { selector: "div" })).toBeNull();
  });

  it("eine unvollständige Antwort gilt nicht als Antwort", async () => {
    store.zustimmung = { akzeptiert: true, migrationFehlt: false, fehler: null };
    store.fragen.mockResolvedValue({ ok: false, code: "unvollstaendig", meldung: "Die Antwort ist unvollständig, bitte frag noch einmal.", text: "" });
    zeige();
    const feld = await screen.findByLabelText("Frage an den Lotsen");
    await waitFor(() => expect(feld).toBeEnabled());
    fireEvent.change(feld, { target: { value: "Wie hoch ist das Hausgeld?" } });
    fireEvent.click(screen.getByRole("button", { name: "Senden" }));
    expect(await screen.findByTestId("lotse-meldung")).toHaveTextContent("Die Antwort ist unvollständig, bitte frag noch einmal.");
    expect(screen.queryByText("Das Hausgeld liegt bei")).toBeNull();
    expect(screen.queryByText(/nicht geprüft\./)).toBeNull();
  });

  it("eine ersetzte Provisionsantwort zeigt nur den festen Text, nie die Teilantwort", async () => {
    store.zustimmung = { akzeptiert: true, migrationFehlt: false, fehler: null };
    store.fragen.mockResolvedValue({ ok: false, code: "provision", meldung: "Zu Provisionen gibt der Lotse keine Auskunft.", text: "" });
    zeige();
    const feld = await screen.findByLabelText("Frage an den Lotsen");
    await waitFor(() => expect(feld).toBeEnabled());
    fireEvent.change(feld, { target: { value: "Was verdient MOREImmo an der Einheit?" } });
    fireEvent.click(screen.getByRole("button", { name: "Senden" }));
    expect(await screen.findByText("Zu Provisionen gibt der Lotse keine Auskunft.")).toBeInTheDocument();
    expect(screen.queryByText(/Die Provision liegt bei 3/)).toBeNull();
  });

  it("das Tageslimit erscheint als ruhiger Hinweis", async () => {
    store.zustimmung = { akzeptiert: true, migrationFehlt: false, fehler: null };
    store.fragen.mockResolvedValue({ ok: false, code: "tageslimit", meldung: "Du hast heute schon 60 Fragen gestellt. Morgen geht es weiter.", text: "" });
    zeige();
    const feld = await screen.findByLabelText("Frage an den Lotsen");
    await waitFor(() => expect(feld).toBeEnabled());
    fireEvent.click(screen.getAllByRole("button", { name: /Ist die Wohnung vermietet/ })[0]);
    expect(await screen.findByTestId("lotse-meldung")).toHaveTextContent("60 Fragen");
  });

  it("die Vorschläge bleiben nach einer Frage stehen und sind während der Antwort gesperrt", async () => {
    store.zustimmung = { akzeptiert: true, migrationFehlt: false, fehler: null };
    let fertig!: (a: { ok: true; text: string }) => void;
    store.fragen.mockImplementation(() => new Promise((r) => { fertig = r; }));
    zeige();
    await waitFor(() => expect(screen.getByLabelText("Frage an den Lotsen")).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /Ist die Wohnung vermietet/ }));

    await screen.findByTestId("lotse-denkt");
    const knoepfe = () => Array.from(screen.getByTestId("lotse-vorschlaege").querySelectorAll("button"));
    expect(knoepfe()).toHaveLength(3);
    knoepfe().forEach((k) => expect(k).toBeDisabled());

    await act(async () => fertig({ ok: true, text: "Es liegen vor: Teilungserklärung." }));
    expect(knoepfe()).toHaveLength(3);
    knoepfe().forEach((k) => expect(k).toBeEnabled());
    const gestellt = knoepfe().filter((k) => k.hasAttribute("data-gestellt"));
    expect(gestellt).toHaveLength(1);
    expect(gestellt[0]).toHaveTextContent("Ist die Wohnung vermietet");
  });

  it("mit vorhandenem Verlauf stehen die Vorschläge trotzdem da", async () => {
    store.zustimmung = { akzeptiert: true, migrationFehlt: false, fehler: null };
    store.verlauf = [
      { id: "f1", rolle: "user", inhalt: "Wie hoch ist das Hausgeld?", quellen: [], erstelltAm: "2026-09-27T10:00:00Z" },
      { id: "a1", rolle: "assistant", inhalt: "35,52 Euro.", quellen: [], erstelltAm: "2026-09-27T10:00:05Z" },
    ];
    zeige();
    await waitFor(() => expect(screen.getByLabelText("Frage an den Lotsen")).toBeEnabled());
    const knoepfe = screen.getByTestId("lotse-vorschlaege").querySelectorAll("button");
    expect(knoepfe).toHaveLength(3);
    knoepfe.forEach((k) => expect(k).toBeEnabled());
  });

  it("die Quelle Kalkulation erklärt nur an Antworten, deren Kalkulation bekannt ist (LOTSE2-004)", async () => {
    store.zustimmung = { akzeptiert: true, migrationFehlt: false, fehler: null };
    const inhalt = "Es bleibt ein Eigenanteil von 184,16 €.\nQUELLEN: Kalkulation, Standardannahmen | Musterkalkulation.pdf | Objektdaten, Stand 28.09.2026";
    // Eine geladene ältere Antwort: ihre Kalkulation ist unbekannt.
    store.verlauf = [
      { id: "f1", rolle: "user", inhalt: "Was bleibt monatlich?", quellen: [], erstelltAm: "2026-09-28T10:00:00Z" },
      { id: "a1", rolle: "assistant", quellen: [], erstelltAm: "2026-09-28T10:00:05Z", inhalt },
    ];
    const kalkulation = {
      annahmen: "standard" as const, kaltmiete_monat: 360.14, nicht_umlagefaehig_monat: 69.26, ruecklage_monat: 17.17,
      rate_monat: 457.87, cashflow_vor_steuer_monat: -184.16, eigenanteil_monat: 184.16,
    };
    store.fragen.mockResolvedValue({ ok: true, text: inhalt });
    render(<ObjektLotse objektId="o1" wohnungId="w1" bezeichnung="Wohnung 9, Beispielweg 1" kalkulation={kalkulation} />);
    const feld = await screen.findByLabelText("Frage an den Lotsen");
    await waitFor(() => expect(feld).toBeEnabled());
    expect(screen.queryByLabelText("Kalkulation, Standardannahmen: so kommen die Zahlen zustande")).toBeNull();

    fireEvent.change(feld, { target: { value: "Was bleibt monatlich?" } });
    fireEvent.click(screen.getByRole("button", { name: "Senden" }));
    const chip = await screen.findByLabelText("Kalkulation, Standardannahmen: so kommen die Zahlen zustande");
    expect(store.fragen).toHaveBeenCalledWith(expect.objectContaining({ kalkulation }));
    // Genau ein erklärender Chip, an der neuen Antwort; die geladene und das Dokument „Musterkalkulation.pdf“ bleiben schlicht.
    expect(screen.getAllByLabelText(/so kommen die Zahlen zustande/)).toHaveLength(1);
    expect(screen.getAllByText("Musterkalkulation.pdf").every((el) => el.tagName === "SPAN")).toBe(true);
    fireEvent.click(chip);
    const erklaerung = await screen.findByTestId("lotse-kalkulation-erklaerung");
    expect(erklaerung).toHaveTextContent("minus Kreditrate");
    expect(erklaerung).toHaveTextContent("ergibt Cashflow vor Steuer");
  });

  it("begrüßt mit dem ersten Vornamen aus dem Profil und nennt die Wohnung", async () => {
    store.zustimmung = { akzeptiert: true, migrationFehlt: false, fehler: null };
    store.name = "Anna-Lena Beispiel";
    zeige();
    expect(await screen.findByText(/^Hallo Anna-Lena,$/)).toBeInTheDocument();
    expect(screen.getByText(/ich kenne diese Wohnung und das Haus: Kaufpreis/)).toBeInTheDocument();
    expect(screen.getByText(/Zu Provisionen und zu einzelnen Kunden gebe ich keine Auskunft\./)).toBeInTheDocument();
    expect(screen.queryByText(/Beispiel,/)).toBeNull();
  });

  it("ohne Einheit und ohne Profilnamen: Hallo, und dieses Objekt mit seinen Einheiten", async () => {
    store.zustimmung = { akzeptiert: true, migrationFehlt: false, fehler: null };
    for (const name of ["", "Laden...", "Nutzer"]) {
      store.name = name;
      const { unmount } = render(<ObjektLotse objektId="o1" bezeichnung="Beispielweg 1" kalkulation={null} />);
      expect(await screen.findByText(/^Hallo,$/), name).toBeInTheDocument();
      expect(screen.getByText(/ich kenne dieses Objekt und seine Einheiten:/)).toBeInTheDocument();
      unmount();
    }
  });

  it("Startfragen: vermietet mit Mietfrage, leer mit Lagefrage", async () => {
    store.zustimmung = { akzeptiert: true, migrationFehlt: false, fehler: null };
    const texte = () => Array.from(screen.getByTestId("lotse-vorschlaege").querySelectorAll("button")).map((k) => k.textContent);
    const vermietet = render(<ObjektLotse objektId="o1" wohnungId="w1" bezeichnung="Wohnung 9" kalkulation={null} vermietet />);
    await waitFor(() => expect(screen.getByLabelText("Frage an den Lotsen")).toBeEnabled());
    expect(texte()).toEqual([
      "Was bleibt monatlich nach Hausgeld, Verwaltung und Finanzierung?",
      "Welche Sanierungen sind erledigt, welche stehen an?",
      "Ist die Wohnung vermietet, seit wann und zu welcher Miete?",
    ]);
    vermietet.unmount();

    render(<ObjektLotse objektId="o1" wohnungId="w1" bezeichnung="Wohnung 9" kalkulation={null} vermietet={false} />);
    await waitFor(() => expect(screen.getByLabelText("Frage an den Lotsen")).toBeEnabled());
    expect(texte()[2]).toBe("Wie ist die Lage: Bus und Bahn, Einkauf, Schulen?");
    expect(texte()).toHaveLength(3);
  });

  it("die neuen Startfragen gehen hinaus, die Kundendatensperre hält sie nicht an", async () => {
    store.zustimmung = { akzeptiert: true, migrationFehlt: false, fehler: null };
    store.fragen.mockResolvedValue({ ok: true, text: "Antwort." });
    render(<ObjektLotse objektId="o1" wohnungId="w1" bezeichnung="Wohnung 9" kalkulation={null} vermietet={false} />);
    await waitFor(() => expect(screen.getByLabelText("Frage an den Lotsen")).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /Wie ist die Lage/ }));
    await waitFor(() => expect(store.fragen).toHaveBeenCalledWith(expect.objectContaining({ frage: "Wie ist die Lage: Bus und Bahn, Einkauf, Schulen?" })));
    expect(screen.queryByTestId("lotse-kundendaten")).toBeNull();
  });
});
