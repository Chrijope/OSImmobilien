import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useParams } from "react-router-dom";

/**
 * Die Stellenanzeige: beide Stellen, Aufklappen, „Jetzt bewerben" und die
 * Überleitung nach dem Absenden.
 *
 * Abgefangen wird nur der Versand selbst (`sendePartnerBewerbung`). Es geht
 * keine Bewerbung hinaus und keine Mail. Das Formular ist das echte, so wie
 * es auch die Landingpage benutzt.
 */

/*
 * `sende` zeichnet nur auf, `antwort` liefert das Ergebnis. Getrennt, weil ein
 * Vitest-Spion, der selbst eine abgelehnte Zusage liefert, sie ein zweites Mal
 * unbehandelt meldet, obwohl die Seite sie abfängt.
 */
const sende = vi.fn();
let antwort: () => Promise<unknown> = async () => ({ seiteToken: "", kennenlernenToken: "" });
vi.mock("@/lib/partnerBewerbung", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/partnerBewerbung")>();
  return {
    ...echt,
    sendePartnerBewerbung: (daten: unknown) => {
      sende(daten);
      return antwort();
    },
  };
});
vi.mock("@/lib/recaptcha", () => ({ ladeRecaptcha: () => {}, executeRecaptcha: async () => "x".repeat(20) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: async () => ({ data: null, error: new Error("darf im Test nicht laufen") }) },
    from: () => ({ select: async () => ({ data: null, error: new Error("offline") }) }),
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
  },
}));

const { default: StellenanzeigePage } = await import("@/pages/StellenanzeigePage");
const { STELLENANZEIGEN, TIPPGEBER_BESTAETIGUNG } = await import("@/lib/stellenanzeigen");
const { Toaster } = await import("@/components/ui/toaster");

const BERATER = STELLENANZEIGEN.find((s) => s.weg === "vertriebspartner")!;
const TIPPGEBER = STELLENANZEIGEN.find((s) => s.weg === "tippgeber")!;
const FINANZ = STELLENANZEIGEN.find((s) => s.weg === "finanzdienstleister")!;
const TOKEN = "0123456789abcdef".repeat(4);

function Bogen() {
  const { token } = useParams();
  const { search } = useLocation();
  return <div>Kennenlernbogen {token}{search ? ` ${search}` : ""}</div>;
}

function zeige(pfad = "/karriere/stellenanzeige") {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <Routes>
        <Route path="/karriere/stellenanzeige" element={<StellenanzeigePage />} />
        <Route path="/kennenlernen/:token" element={<Bogen />} />
      </Routes>
      <Toaster />
    </MemoryRouter>,
  );
}

function absenden(): HTMLElement {
  return Array.from(screen.getByRole("dialog").querySelectorAll<HTMLElement>('button[type="submit"]'))
    .find((b) => b.textContent?.includes("Bewerbung absenden"))!;
}

function kachel(titel: string): HTMLElement {
  return screen.getByRole("button", { name: new RegExp(titel.replace(/[()/]/g, "\\$&")) });
}

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
  // Radix misst die Einwilligungsbox; jsdom kennt keinen ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => sende.mockReset());
afterEach(cleanup);

/** Füllt das Formular im offenen Dialog vollständig aus. */
async function fuelleFormularAus({ mitLebenslauf = true } = {}) {
  const dialog = screen.getByRole("dialog");
  const feld = (label: string) =>
    within(dialog).getByText(label).parentElement!.querySelector("input, textarea") as HTMLElement;

  fireEvent.change(feld("Vorname *"), { target: { value: "Max" } });
  fireEvent.change(feld("Nachname *"), { target: { value: "Muster" } });
  fireEvent.change(feld("E-Mail *"), { target: { value: "max@example.org" } });
  fireEvent.change(feld("Handynummer *"), { target: { value: "1701234567" } });
  fireEvent.change(feld("Erfahrung *"), { target: { value: "3 Jahre Vertrieb" } });
  fireEvent.change(dialog.querySelector("textarea")!, { target: { value: "Ich will mein eigenes Geschäft." } });

  /*
   * Die Auswahl „Wie bist du auf uns aufmerksam geworden?". Radix legt im
   * Formular ein verstecktes natives `select` an und übernimmt dessen Wert.
   * Darüber zu wählen ist derselbe Weg wie beim automatischen Ausfüllen des
   * Browsers und kostet in jsdom keine elf Sekunden wie das Aufklappen.
   */
  const nativ = within(dialog).getByText("Wie bist Du auf uns aufmerksam geworden? *")
    .parentElement!.querySelector("select")!;
  fireEvent.change(nativ, { target: { value: "LinkedIn" } });

  if (mitLebenslauf) {
    const datei = new File(["%PDF-1.4"], "lebenslauf.pdf", { type: "application/pdf" });
    fireEvent.change(dialog.querySelector('input[type="file"]')!, { target: { files: [datei] } });
    await within(dialog).findByText("lebenslauf.pdf");
  }

  fireEvent.click(dialog.querySelector<HTMLElement>('[role="checkbox"]')!);
}

describe("Die Seite", () => {
  it("zeigt beide Stellen als Kacheln, geschlossen", () => {
    zeige();
    for (const s of STELLENANZEIGEN) {
      const knopf = kachel(s.titel);
      expect(knopf).toHaveAttribute("aria-expanded", "false");
      expect(within(knopf).getByText("Remote")).toBeInTheDocument();
      expect(within(knopf).getByText("Freie Zeiteinteilung")).toBeInTheDocument();
      expect(within(knopf).getByText("Vertrieb")).toBeInTheDocument();
      expect(within(knopf).getByText("Ab sofort")).toBeInTheDocument();
    }
    expect(screen.queryByText("Deine Aufgaben")).toBeNull();
    // Die Werte des Hauses stehen oben.
    expect(screen.getByText("Ehrlich rechnen")).toBeInTheDocument();
  });

  it("klappt eine Stelle mit allen fünf Abschnitten auf und wieder zu", () => {
    zeige();
    fireEvent.click(kachel(BERATER.titel));
    expect(kachel(BERATER.titel)).toHaveAttribute("aria-expanded", "true");
    const inhalt = screen.getByRole("region", { name: new RegExp("Immobilienberater") });
    for (const abschnitt of ["Wer wir sind", "Deine Rolle", "Deine Aufgaben", "Das bringst du mit", "Was wir dir bieten"]) {
      expect(within(inhalt).getByText(abschnitt)).toBeInTheDocument();
    }
    expect(within(inhalt).getByText(BERATER.aufgaben[0])).toBeInTheDocument();
    // Am Ende steht der Knopf, keine Mailadresse.
    expect(within(inhalt).getByRole("button", { name: /Jetzt bewerben/ })).toBeInTheDocument();
    expect(within(inhalt).queryByText(/@osimmobilien\.netlify\.app/)).toBeNull();

    fireEvent.click(kachel(BERATER.titel));
    expect(kachel(BERATER.titel)).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Deine Aufgaben")).toBeNull();
  });

  it("hält höchstens eine Stelle offen", () => {
    zeige();
    fireEvent.click(kachel(BERATER.titel));
    fireEvent.click(kachel(TIPPGEBER.titel));
    expect(kachel(BERATER.titel)).toHaveAttribute("aria-expanded", "false");
    expect(kachel(TIPPGEBER.titel)).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByText("Deine Aufgaben")).toHaveLength(1);
  });

  it("öffnet eine Stelle direkt über den Adresszusatz", () => {
    zeige("/karriere/stellenanzeige#tippgeber");
    expect(kachel(TIPPGEBER.titel)).toHaveAttribute("aria-expanded", "true");
  });

  it("Jetzt bewerben öffnet das Bewerbungsformular", () => {
    zeige();
    fireEvent.click(kachel(TIPPGEBER.titel));
    fireEvent.click(screen.getByRole("button", { name: /Jetzt bewerben/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(`Bewerbung: ${TIPPGEBER.titel}`)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /Bewerbung absenden/ })).toBeInTheDocument();
    expect(within(dialog).getByText("Warum möchtest Du Tippgeber werden? *")).toBeInTheDocument();
  });
});

describe("Nach dem Absenden", () => {
  it("leitet den Berater direkt in seinen eigenen Kennenlernbogen", async () => {
    antwort = async () => ({ seiteToken: "", kennenlernenToken: TOKEN });
    zeige();
    fireEvent.click(kachel(BERATER.titel));
    fireEvent.click(screen.getByRole("button", { name: /Jetzt bewerben/ }));
    await fuelleFormularAus();
    fireEvent.click(absenden());

    expect(await screen.findByText(`Kennenlernbogen ${TOKEN}`)).toBeInTheDocument();
    expect(sende).toHaveBeenCalledTimes(1);
    expect(sende.mock.calls[0][0]).toMatchObject({
      vorname: "Max",
      stelleId: BERATER.stelleId,
      stelleTitel: BERATER.titel,
      beschaeftigungsart: BERATER.taetigkeit,
      quelle: "Website Stellenanzeige",
      aufmerksamDurch: "LinkedIn",
      lebenslaufName: "lebenslauf.pdf",
      kennenlernLink: true,
    });
  });

  it("zeigt den Rückfall mit dem Postfach, wenn kein Schlüssel zurückkommt", async () => {
    antwort = async () => ({ seiteToken: "", kennenlernenToken: "" });
    zeige();
    fireEvent.click(kachel(BERATER.titel));
    fireEvent.click(screen.getByRole("button", { name: /Jetzt bewerben/ }));
    await fuelleFormularAus();
    fireEvent.click(absenden());

    expect(await screen.findByText(/Schau bitte in dein Postfach, dort liegt dein Kennenlernbogen/)).toBeInTheDocument();
    expect(screen.queryByText(/^Kennenlernbogen /)).toBeNull();
    // Die Mail kommt, also auch der Hinweis auf Absender und Spam-Ordner.
    expect(screen.getByTestId("spam-hinweis")).toHaveTextContent("Unsere Mail kommt von noreply@os-immobilien.com.");
  });

  it("folgt keinem verbogenen Schlüssel", async () => {
    antwort = async () => ({ seiteToken: "", kennenlernenToken: "../../admin" });
    zeige();
    fireEvent.click(kachel(BERATER.titel));
    fireEvent.click(screen.getByRole("button", { name: /Jetzt bewerben/ }));
    await fuelleFormularAus();
    fireEvent.click(absenden());

    expect(await screen.findByText(/Schau bitte in dein Postfach/)).toBeInTheDocument();
  });

  it("bleibt im Formular, wenn der Versand scheitert", async () => {
    antwort = async () => {
      throw new Error("Speichern fehlgeschlagen");
    };
    const fehler = vi.spyOn(console, "error").mockImplementation(() => {});
    zeige();
    fireEvent.click(kachel(BERATER.titel));
    fireEvent.click(screen.getByRole("button", { name: /Jetzt bewerben/ }));
    await fuelleFormularAus();
    fireEvent.click(absenden());

    expect(await screen.findByText("Senden fehlgeschlagen")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Bewerbung absenden/ })).toBeInTheDocument();
    fehler.mockRestore();
  });

  it("nimmt den Tippgeber ohne Lebenslauf an und kündigt den Anruf an", async () => {
    antwort = async () => ({ seiteToken: "", kennenlernenToken: "" });
    zeige();
    fireEvent.click(kachel(TIPPGEBER.titel));
    fireEvent.click(screen.getByRole("button", { name: /Jetzt bewerben/ }));
    const dialog = screen.getByRole("dialog");
    // Für Tippgeber gibt es kein Lebenslauf-Feld.
    expect(dialog.querySelector('input[type="file"]')).toBeNull();
    expect(within(dialog).queryByText("Lebenslauf (PDF) *")).toBeNull();

    await fuelleFormularAus({ mitLebenslauf: false });
    fireEvent.click(absenden());

    expect(await screen.findByText("Danke, Max!")).toBeInTheDocument();
    expect(screen.getByText(TIPPGEBER_BESTAETIGUNG)).toBeInTheDocument();
    expect(TIPPGEBER_BESTAETIGUNG).toBe("Wir melden uns in den nächsten Tagen telefonisch bei dir.");
    // Keine Mail, also auch kein Hinweis aufs Postfach.
    expect(screen.queryByText(/Postfach/)).toBeNull();
    expect(screen.queryByTestId("spam-hinweis")).toBeNull();
    expect(sende).toHaveBeenCalledTimes(1);
    expect(sende.mock.calls[0][0]).toMatchObject({
      stelleId: TIPPGEBER.stelleId,
      stelleTitel: TIPPGEBER.titel,
      stelle: "tippgeber",
      lebenslaufUrl: "",
      lebenslaufName: "",
      kennenlernLink: false,
    });
  });

  it("verlangt vom Tippgeber die Handynummer, weil das Team anruft", async () => {
    zeige();
    fireEvent.click(kachel(TIPPGEBER.titel));
    fireEvent.click(screen.getByRole("button", { name: /Jetzt bewerben/ }));
    await fuelleFormularAus({ mitLebenslauf: false });
    const dialog = screen.getByRole("dialog");
    const telefon = within(dialog).getByText("Handynummer *").parentElement!.querySelector("input")!;
    // Leer hält schon das Pflichtfeld des Browsers an. Eine Nummer, die nur
    // aus der Vorwahl und zwei Ziffern besteht, fängt die Ziffernprüfung.
    fireEvent.change(telefon, { target: { value: "12" } });
    fireEvent.click(absenden());

    expect(await screen.findByText("Bitte gib Deine Handynummer an.")).toBeInTheDocument();
    expect(sende).not.toHaveBeenCalled();
  });

  it("lehnt den Berater ohne Lebenslauf weiterhin ab", async () => {
    zeige();
    fireEvent.click(kachel(BERATER.titel));
    fireEvent.click(screen.getByRole("button", { name: /Jetzt bewerben/ }));
    expect(screen.getByRole("dialog").querySelector('input[type="file"]')).not.toBeNull();
    await fuelleFormularAus({ mitLebenslauf: false });
    fireEvent.click(absenden());

    expect(await screen.findByText("Bitte lade Deinen Lebenslauf als PDF hoch.")).toBeInTheDocument();
    expect(sende).not.toHaveBeenCalled();
  });
});

describe("Die Stelle für Finanzdienstleister", () => {
  it("steht als dritte Kachel mit eigenem Etikett auf der Seite", () => {
    zeige();
    const knopf = kachel(FINANZ.titel);
    expect(knopf).toHaveAttribute("aria-expanded", "false");
    expect(within(knopf).getByText("Für Finanzprofis")).toBeInTheDocument();
    expect(within(knopf).getByText("Remote")).toBeInTheDocument();
    expect(screen.queryByText(/police/i)).toBeNull();
  });

  it("klappt auf, mit dem zweiten Produkt und dem Risikohinweis unter der Rendite", () => {
    zeige("/karriere/stellenanzeige#finanzdienstleister");
    const inhalt = screen.getByRole("region", { name: /Finanzdienstleistung/ });
    for (const abschnitt of ["Wer wir sind", "Deine Rolle", "Deine Aufgaben", "Das bringst du mit", "Was wir dir bieten"]) {
      expect(within(inhalt).getByText(abschnitt)).toBeInTheDocument();
    }
    const kasten = within(inhalt).getByRole("region", { name: "Ein zweites Produkt neben der Immobilie" });
    expect(within(kasten).getByText("Stornofreie Provision")).toBeInTheDocument();
    expect(within(kasten).getByText("Sehr gute Bestandsprovision")).toBeInTheDocument();
    expect(within(kasten).getByText("Mit Renditechancen im zweistelligen Bereich pro Jahr.")).toBeInTheDocument();
    expect(within(kasten).getByTestId("risikohinweis")).toHaveTextContent("Renditen sind nicht garantiert.");
    // Die übrigen Stellen haben keinen solchen Kasten.
    expect(screen.getAllByText("Ein zweites Produkt neben der Immobilie")).toHaveLength(1);
  });

  it("verlangt den Lebenslauf und leitet mit Weg 2 in den Kennenlernbogen", async () => {
    antwort = async () => ({ seiteToken: "", kennenlernenToken: TOKEN });
    zeige("/karriere/stellenanzeige#finanzdienstleister");
    fireEvent.click(screen.getByRole("button", { name: /Jetzt bewerben/ }));
    expect(screen.getByRole("dialog").querySelector('input[type="file"]')).not.toBeNull();
    await fuelleFormularAus();
    fireEvent.click(absenden());

    expect(await screen.findByText(`Kennenlernbogen ${TOKEN} ?weg=weg2`)).toBeInTheDocument();
    expect(sende.mock.calls[0][0]).toMatchObject({
      stelleId: FINANZ.stelleId,
      stelleTitel: FINANZ.titel,
      stelle: "finanzdienstleister",
      kennenlernLink: true,
      lebenslaufName: "lebenslauf.pdf",
    });
  });
});
