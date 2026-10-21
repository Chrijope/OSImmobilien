import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import BeratungspraesentationHV, { kaufkraftVerlauf } from "./BeratungspraesentationHV";
import { OS_TEXTE } from "@/lib/beratungOsDaten";

/*
 * Abschnitte 12 und 13 (16.10.2026), in A und B: Knopf „Objektvorstellung
 * buchen“ mit dem Link des zuständigen Partners, keine Ja/Nein-Knöpfe mehr,
 * Kundenportal erst nach der unterschriebenen Selbstauskunft. Ohne
 * verbundenen Kunden (Sidebar, Unterlagen) entfallen Selbstauskunft und
 * Kundenportal ganz.
 */

const zustand = vi.hoisted(() => ({
  profile: [] as Array<Record<string, unknown>>,
  saSigned: false,
  portalStatus: "none",
  freischalten: vi.fn(async () => true),
}));

vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { name: "Maria Muster", role: "vertriebspartner" }, authUser: { id: "nutzer-1" } }),
}));
vi.mock("@/hooks/useCacheReady", () => ({ useCacheReady: () => true }));
vi.mock("@/lib/dataCache", () => ({
  onCacheChange: () => () => {},
  cacheGet: (t: string) => (t === "profiles" ? zustand.profile : []),
}));
vi.mock("@/lib/kundenStore", () => ({
  getKontaktById: (id: string) =>
    id === "k-1" ? { anrede: "Frau", vorname: "Anna", nachname: "Muster", email: "anna@example.com", zustaendig_id: "partner-2" } : undefined,
}));
vi.mock("@/lib/investmentsStore", () => ({
  getInvestmentMetaField: (_id: string, feld: string, rueckfall: unknown) => (feld === "saSigned" ? zustand.saSigned : rueckfall),
  getInvestmentsByKontakt: () => [{ id: "i-1" }],
}));
vi.mock("@/lib/kundenportalFreischalten", () => ({
  portalMetaLesen: () => ({ status: zustand.portalStatus }),
  kundenportalFreischalten: zustand.freischalten,
}));

class Beobachter {
  observe() {}
  unobserve() {}
  disconnect() {}
}
const ablage = new Map<string, string>();
beforeEach(() => {
  ablage.clear();
  zustand.profile = [];
  zustand.saSigned = false;
  zustand.portalStatus = "none";
  zustand.freischalten.mockClear();
  vi.stubGlobal("IntersectionObserver", Beobachter);
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => ablage.get(k) ?? null,
    setItem: (k: string, v: string) => void ablage.set(k, v),
    removeItem: (k: string) => void ablage.delete(k),
    clear: () => ablage.clear(),
  });
});
afterEach(() => vi.unstubAllGlobals());

const MIT_KUNDE = "/x?kundeId=k-1&investmentId=i-1";

function zeige(adresse: string, variante: "a" | "b") {
  return render(
    <MemoryRouter initialEntries={[adresse]}>
      <Routes>
        <Route path="*" element={<BeratungspraesentationHV variante={variante} />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe.each(["a", "b"] as const)("Beratungspräsentation %s, Abschnitte 12 und 13", (variante) => {
  it("lässt ohne Kunde (Sidebar, Unterlagen) Selbstauskunft und Kundenportal weg, Objektvorstellung bleibt", () => {
    zustand.profile = [{ id: "nutzer-1", name: "Maria Muster", objektlink: "https://termin.example/eigen" }];
    zeige("/x", variante);
    expect(screen.queryByRole("button", { name: /Selbstauskunft jetzt gemeinsam ausfüllen/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Kundenportal freigeben/ })).toBeNull();
    expect(screen.queryByText(/Gerechnet mit deiner Selbstauskunft/)).toBeNull();
    expect(screen.getByText(/Dann vereinbaren wir Ihre Objektvorstellung/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Objektvorstellung buchen/ })).toHaveAttribute("href", "https://termin.example/eigen");
  });

  it("zeigt in der eigenständigen Fassung „Weiter zur Selbstauskunft“ statt Objektvorstellung", () => {
    zustand.profile = [{ id: "nutzer-1", name: "Maria Muster", objektlink: "https://termin.example/eigen" }];
    const weiter = vi.fn();
    render(
      <MemoryRouter initialEntries={["/x"]}>
        <BeratungspraesentationHV
          variante={variante}
          vorschau={{ schluessel: "", kundenName: "", kontakt: {}, skript: null }}
          weiterZurSelbstauskunft={weiter}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/Objektvorstellung buchen/)).toBeNull();
    expect(screen.queryByText(/Kein Buchungslink/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Weiter zur Selbstauskunft/ }));
    expect(weiter).toHaveBeenCalledWith("/selbstauskunft");
  });

  it("öffnet mit Kunde den Objektvorstellungs-Link des zuständigen Partners im neuen Tab", () => {
    zustand.profile = [
      { id: "nutzer-1", name: "Maria Muster", objektlink: "https://termin.example/eigen" },
      { id: "partner-2", name: "Paul Partner", objektlink: "https://termin.example/paul" },
    ];
    zeige(MIT_KUNDE, variante);
    const link = screen.getByRole("link", { name: /Objektvorstellung buchen/ });
    expect(link).toHaveAttribute("href", "https://termin.example/paul");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("nimmt ohne Kunde den Link des Angemeldeten", () => {
    zustand.profile = [
      { id: "nutzer-1", name: "Maria Muster", objektlink: "https://termin.example/eigen" },
      { id: "partner-2", name: "Paul Partner", objektlink: "https://termin.example/paul" },
    ];
    zeige("/x", variante);
    expect(screen.getByRole("link", { name: /Objektvorstellung buchen/ })).toHaveAttribute("href", "https://termin.example/eigen");
  });

  it("graut den Knopf ohne Link aus und sagt warum", () => {
    zustand.profile = [{ id: "partner-2", name: "Paul Partner", objektlink: "" }];
    zeige(MIT_KUNDE, variante);
    expect(screen.queryByRole("link", { name: /Objektvorstellung buchen/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Objektvorstellung buchen/ })).toBeDisabled();
    expect(screen.getByText("Kein Buchungslink für die Objektvorstellung in den Einstellungen hinterlegt")).toBeInTheDocument();
  });

  it("hat keine Knöpfe Ja, Nein und Ja unter Bedingung mehr", () => {
    zeige(MIT_KUNDE, variante);
    expect(screen.queryByRole("button", { name: "Ja unter Bedingung" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Nein" })).toBeNull();
    expect(screen.queryByText(/Antwort festhalten/)).toBeNull();
    expect(screen.queryByText("Bitte bis zum Termin bereitlegen")).toBeNull();
  });

  it("graut das Kundenportal vor der Unterschrift aus", () => {
    zeige(MIT_KUNDE, variante);
    expect(screen.getByText(/Nach der gemeinsam ausgefüllten und von Ihnen unterschriebenen Selbstauskunft/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Kundenportal freigeben/ })).toBeDisabled();
    expect(screen.getByText("Erst nach der unterschriebenen Selbstauskunft")).toBeInTheDocument();
  });

  it("zeigt das Kundenportal ohne Investment gar nicht, auch wenn etwas unterschrieben wäre", () => {
    zustand.saSigned = true;
    zeige("/x?kundeId=k-1", variante);
    expect(screen.queryByRole("button", { name: /Kundenportal freigeben/ })).toBeNull();
  });

  it("gibt nach der Unterschrift über den Weg des Kundenprofils frei", async () => {
    zustand.saSigned = true;
    zeige(MIT_KUNDE, variante);
    const knopf = screen.getByRole("button", { name: /Kundenportal freigeben/ });
    expect(knopf).toBeEnabled();
    fireEvent.click(knopf);
    await waitFor(() => expect(zustand.freischalten).toHaveBeenCalledTimes(1));
    expect(zustand.freischalten).toHaveBeenCalledWith(
      expect.objectContaining({ kontaktId: "k-1", investmentIds: ["i-1"], vonName: "Maria Muster" }),
    );
  });

  it("simuliert die Freigabe in der Vorschau und versendet nichts", () => {
    render(
      <MemoryRouter>
        <BeratungspraesentationHV
          variante={variante}
          vorschau={{ schluessel: "vorschau-t", kundenName: "Anna", kontakt: {}, skript: null, saUnterschrieben: true }}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Kundenportal freigeben/ }));
    expect(zustand.freischalten).not.toHaveBeenCalled();
    expect(screen.getByText("Kundenportal ist freigegeben")).toBeInTheDocument();
    expect(screen.getByTestId("vorschau-portal")).toBeInTheDocument();
  });

  it("zeigt „Kundenportal ist freigegeben“ statt Knopf, wenn es schon offen ist", () => {
    zustand.saSigned = true;
    zustand.portalStatus = "eingeladen";
    zeige(MIT_KUNDE, variante);
    expect(screen.queryByRole("button", { name: /Kundenportal freigeben/ })).toBeNull();
    expect(screen.getByText("Kundenportal ist freigegeben")).toBeInTheDocument();
  });
});

describe("Zweite Stufe vom 20.10.2026", () => {
  const ohneKunde = { schluessel: "", kundenName: "", kontakt: {}, skript: null };

  it("rechnet die Kaufkraft-Grafik mit denselben Zahlen wie die Karten in Abschnitt 04", () => {
    const g = OS_TEXTE.nichtstun.grafik;
    const ende = kaufkraftVerlauf(g).at(-1)!;
    // Seit 21.10.2026 ohne Kontostand: Karte 2 ist die Kaufkraft mit Zinsen, Karte 3 ohne Zinsen.
    const karte = Number(OS_TEXTE.nichtstun.karten[1].wert.replace(/\D/g, ""));
    expect(Math.abs(ende.kaufkraft - karte)).toBeLessThanOrEqual(1);
    const ohne = Number(OS_TEXTE.nichtstun.karten[2].wert.replace(/\D/g, ""));
    expect(Math.round(g.start / Math.pow(1 + g.inflation, g.jahre))).toBe(ohne);
    expect(OS_TEXTE.nichtstun.karten.map((k) => k.wert)).not.toContain("164.061 €");
  });

  it("zeigt ohne Profil einen Platzhalter statt Ansprechpartner, ohne Kontaktdaten", () => {
    render(
      <MemoryRouter>
        <BeratungspraesentationHV vorschau={{ ...ohneKunde, ansprechpartner: { name: "Alex Beispiel", rolle: "", telefon: "+49 30 1", email: "a@example.com" } }} ohneProfil />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("ansprechpartner-platzhalter")).toHaveTextContent("Persönlich an Ihrer Seite");
    // Der Kunde sieht die Seite: kein Hinweis an den Berater.
    expect(screen.getByTestId("ansprechpartner-platzhalter")).not.toHaveTextContent(/Berater/);
    expect(screen.queryByTestId("ansprechpartner")).toBeNull();
    expect(document.querySelector('a[href^="tel:"], a[href^="mailto:"]')).toBeNull();
  });

  it("zeigt bei Altersvorsorge drei Wohnungen im Zeitstrahl, die neue Folie „Mit einer Wohnung beginnen“ und keine Folie „Die nächsten Schritte mit uns“", () => {
    render(
      <MemoryRouter>
        <BeratungspraesentationHV vorschau={ohneKunde} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("konzept-inhalt-alter")).toBeInTheDocument();
    // Folie 08 ist seit dem 21.10.2026 „Mit einer Wohnung beginnen, mit uns drei aufbauen“ (PDF-Präsentation Folie 24).
    expect(document.getElementById("alter-8")).toHaveTextContent("Mit einer Wohnung beginnen, mit uns drei aufbauen.");
    expect(screen.getByTestId("aufbau-schritte").querySelectorAll("li")).toHaveLength(5);
    expect(screen.queryByText(/Die nächsten Schritte mit uns/)).toBeNull();
    expect(screen.getByTestId("rente-zeitstrahl")).toHaveTextContent(/Wohnung 1.*Wohnung 2.*Wohnung 3/);
    // Zahlen stehen auch ohne meldenden Beobachter auf dem Endwert.
    expect(document.getElementById("alter-7")).toHaveTextContent("≈ 1.710.000 €");
    expect(document.getElementById("alter-4")).toHaveTextContent("629.300 €");
  });

  it("erzeugt die Antworten als PDF mit Frage und Antwort", async () => {
    const gespeichert = vi.fn(async () => undefined);
    ablage.set("beratung-antworten-ohne-kunde", JSON.stringify({ erwartung: "Klarheit über die Rente" }));
    render(
      <MemoryRouter>
        <BeratungspraesentationHV vorschau={ohneKunde} speichereDatei={gespeichert} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Antworten als PDF/ }));
    await waitFor(() => expect(gespeichert).toHaveBeenCalledTimes(1));
    const [name, blob] = gespeichert.mock.calls[0] as unknown as [string, Blob];
    expect(name).toMatch(/^Beratung_Antworten_\d{4}-\d{2}-\d{2}\.pdf$/);
    const text = await new Promise<string>((fertig) => {
      const leser = new FileReader();
      leser.onload = () => fertig(String(leser.result));
      leser.readAsText(blob);
    });
    // Der Inhalt ist komprimiert; geprüft wird, dass ein PDF entsteht (Inhalt per pdftotext im Browser-Test geprüft).
    expect(text.startsWith("%PDF-")).toBe(true);
  });
});
