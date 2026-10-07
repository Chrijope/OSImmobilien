import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { EINWILLIGUNG_VERSION, getFrage, type FormularAntworten } from "@/lib/bewerberFormular";
import { speichereFragebogenEntwurf, ladeFragebogenEntwurf } from "@/lib/bewerberFormularEntwurf";
import { BEWERBER_BUCHUNGSLINK } from "../../supabase/functions/_shared/bewerber-eingangsmail";

/**
 * Der Fragebogen als Wizard: Start, eine Frage je Schritt, Pflichtantworten,
 * bedingte Zusatzfragen, Zwischenstand auf dem Gerät, Abschluss mit
 * Einwilligung. Und vor allem: Das Antwortobjekt, das an die Function geht,
 * hat dieselben Schlüssel und Typen wie zuvor.
 */

/** jsdom bringt hier keinen localStorage mit, deshalb ein kleiner In-Memory-Ersatz wie in metaPixel.test.ts. */
function stubLocalStorage() {
  const speicher = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => (speicher.has(k) ? (speicher.get(k) as string) : null),
      setItem: (k: string, v: string) => { speicher.set(k, String(v)); },
      removeItem: (k: string) => { speicher.delete(k); },
      clear: () => speicher.clear(),
    },
  });
}

const TOKEN = "f".repeat(64);

vi.mock("react-router-dom", async () => {
  const echt = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...echt, useParams: () => ({ token: TOKEN }) };
});

const rpc = vi.hoisted(() => vi.fn());
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc, functions: { invoke } },
}));

import { MemoryRouter } from "react-router-dom";
import BewerberFormularPublic from "./BewerberFormularPublic";

const IN_ZWEI_WOCHEN = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();

async function oeffne() {
  await act(async () => {
    render(<MemoryRouter><BewerberFormularPublic /></MemoryRouter>);
  });
  await act(async () => { await Promise.resolve(); });
}

/** Der Zähler "Frage n von N" steht in einem Span mit drei Textknoten. */
function zaehler(text: string) {
  return screen.getByText((_, el) => el?.tagName === "SPAN" && el.textContent === text);
}

const weiterKnopf = () => screen.getByRole("button", { name: /^Weiter$/ });

beforeEach(() => {
  vi.clearAllMocks();
  stubLocalStorage();
  window.scrollTo = vi.fn();
  rpc.mockResolvedValue({
    data: [{ vorname: "Max", status: "offen", expires_at: IN_ZWEI_WOCHEN, telefon: "+49 176 12345678" }],
    error: null,
  });
  invoke.mockResolvedValue({ data: { ok: true }, error: null });
});

describe("BewerberFormularPublic als Wizard", () => {
  it("begrüßt mit Vorname, nennt 13 Fragen und startet mit der ersten Frage", async () => {
    await oeffne();

    expect(screen.getByRole("heading", { name: /Hallo Max, schön, dass du da bist/ })).toBeInTheDocument();
    expect(screen.getByText("13 Fragen")).toBeInTheDocument();
    expect(screen.getByText(/Link gilt bis/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Los geht's/ }));

    expect(zaehler("Frage 1 von 13")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Wo bist du zu Hause?" })).toBeInTheDocument();
    expect(screen.getByText("Wer du bist und woher")).toBeInTheDocument();
  });

  it("sperrt Weiter bei einer Pflichtfrage, bis eine Antwort da ist", async () => {
    await oeffne();
    fireEvent.click(screen.getByRole("button", { name: /Los geht's/ }));

    expect(weiterKnopf()).toBeDisabled();
    // Kein Überspringen bei Pflichtfragen.
    expect(screen.queryByRole("button", { name: /überspringen/i })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "83022 Rosenheim" } });
    expect(weiterKnopf()).toBeEnabled();

    fireEvent.click(weiterKnopf());
    expect(zaehler("Frage 2 von 13")).toBeInTheDocument();
  });

  it("blättert bei Einzelauswahl nach dem Antippen von selbst weiter, Zurück bleibt", async () => {
    speichereFragebogenEntwurf(TOKEN, { frageKey: "beschaeftigung", antworten: { region: "Rosenheim" }, telefon: "" });
    await oeffne();

    expect(zaehler("Frage 2 von 13")).toBeInTheDocument();
    const kachel = screen.getByRole("radio", { name: "Angestellt" });
    fireEvent.click(kachel);
    expect(kachel).toHaveAttribute("aria-checked", "true");

    await waitFor(() => expect(zaehler("Frage 3 von 13")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Zurück/ }));
    expect(zaehler("Frage 2 von 13")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Angestellt" })).toHaveAttribute("aria-checked", "true");
  });

  it("fügt bei Erfahrung die Zusatzfragen ein und lässt den Balken wachsen", async () => {
    speichereFragebogenEntwurf(TOKEN, {
      frageKey: "hintergrund",
      antworten: { region: "Rosenheim", beschaeftigung: "angestellt", taetigkeit: "Berater" },
      telefon: "",
    });
    await oeffne();

    expect(zaehler("Frage 4 von 13")).toBeInTheDocument();
    expect(screen.queryByTestId("segment-erfahrungsdauer")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /Finanz- oder Versicherungsberatung/ }));

    expect(zaehler("Frage 4 von 15")).toBeInTheDocument();
    expect(screen.getByTestId("segment-erfahrungsdauer")).toHaveAttribute("data-zustand", "zusatz");
    expect(screen.getByTestId("segment-findiSparten")).toHaveAttribute("data-zustand", "zusatz");
    expect(screen.getByText(/passen 2 kurze Zusatzfragen/)).toBeInTheDocument();

    // Mehrfachauswahl geht über Weiter, nicht von selbst.
    expect(zaehler("Frage 4 von 15")).toBeInTheDocument();
    fireEvent.click(weiterKnopf());
    expect(screen.getByRole("heading", { name: "Wie lange machst du das schon?" })).toBeInTheDocument();
    expect(zaehler("Frage 5 von 15")).toBeInTheDocument();
  });

  it("lässt nur die beiden Freitexte überspringen", async () => {
    speichereFragebogenEntwurf(TOKEN, { frageKey: "erwartung", antworten: { region: "Rosenheim" }, telefon: "" });
    await oeffne();

    expect(screen.getByRole("heading", { name: /Was erwartest du von uns als Partner/ })).toBeInTheDocument();
    expect(screen.getByText("freiwillig")).toBeInTheDocument();
    expect(weiterKnopf()).toBeEnabled();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Ehrliches Feedback." } });
    fireEvent.click(screen.getByRole("button", { name: "Überspringen" }));

    // Die Überschrift trägt die Marke "freiwillig" mit im Namen.
    expect(screen.getByRole("heading", { name: /Und was bringst du dafür ein\?/ })).toBeInTheDocument();
    // Überspringen verwirft den Text, er darf nicht mitgesendet werden.
    expect(ladeFragebogenEntwurf(TOKEN)?.antworten.erwartung).toBeUndefined();
  });

  it("merkt sich den Zwischenstand auf dem Gerät und macht dort weiter", async () => {
    await oeffne();
    fireEvent.click(screen.getByRole("button", { name: /Los geht's/ }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "83022 Rosenheim" } });
    fireEvent.click(weiterKnopf());

    const entwurf = ladeFragebogenEntwurf(TOKEN);
    expect(entwurf?.frageKey).toBe("beschaeftigung");
    expect(entwurf?.antworten).toEqual({ region: "83022 Rosenheim" });
    expect(screen.getByText("Zwischenstand auf diesem Gerät gespeichert")).toBeInTheDocument();
  });

  it("verlangt am Ende die Einwilligung und sendet dann das bekannte Antwortobjekt", async () => {
    const antworten: FormularAntworten = {
      region: "83022 Rosenheim",
      beschaeftigung: "angestellt",
      taetigkeit: "Baufinanzierungsberater",
      hintergrund: ["findi", "netzwerk"],
      erfahrungsdauer: "3_bis_10",
      findiSparten: ["baufinanzierung"],
      zeitProWoche: "10_bis_20",
      perspektive: "spaeter_haupt",
      leadPraeferenz: "beides",
      einkommensziel: "5000_10000",
      erwartung: "Klare Abläufe.",
      gewerbe34c: "keines",
      startzeitpunkt: "vier_wochen",
      erreichbarkeit: ["nachmittags"],
    };
    speichereFragebogenEntwurf(TOKEN, { frageKey: "abschluss", antworten, telefon: "" });
    await oeffne();

    expect(screen.getByRole("heading", { name: "Unter dieser Nummer, richtig?" })).toBeInTheDocument();
    expect(screen.getByText("Fast geschafft")).toBeInTheDocument();
    // Die Nummer aus der Bewerbung ist vorbelegt und bleibt bearbeitbar.
    const telefon = screen.getByPlaceholderText("Deine Telefonnummer") as HTMLInputElement;
    expect(telefon.value).toBe("+49 176 12345678");
    expect(screen.getByText(/Nachmittags zwischen 14 und 18 Uhr hast du angegeben/)).toBeInTheDocument();
    expect(screen.getByText(/13 Fragen plus 2 Zusatzfragen durchgesehen, 14 beantwortet, 1 übersprungen/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Antworten absenden/ }));
    expect(invoke).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/Einverständnis/);

    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Antworten absenden/ }));
    });

    expect(invoke).toHaveBeenCalledTimes(1);
    const [name, aufruf] = invoke.mock.calls[0];
    expect(name).toBe("submit-bewerber-formular");
    expect(aufruf.body).toEqual({
      token: TOKEN,
      antworten,
      telefon: "+49 176 12345678",
      einwilligung: true,
      einwilligungVersion: EINWILLIGUNG_VERSION,
      hp: "",
    });
    // Jeder Schlüssel ist eine Katalogfrage, Mehrfachauswahl als Liste, alles andere als Text.
    for (const [key, wert] of Object.entries(aufruf.body.antworten as FormularAntworten)) {
      const frage = getFrage(key)!;
      expect(frage).toBeTruthy();
      expect(Array.isArray(wert)).toBe(frage.typ === "mehrfach");
    }

    // Danke-Seite mit der HR-Managerin, der Wunschzeit und dem Buchungslink aus der Mail.
    expect(await screen.findByRole("heading", { name: "Vielen Dank, Max." })).toBeInTheDocument();
    expect(screen.getByText("Sarah Kaiser-Thom")).toBeInTheDocument();
    expect(screen.getByText("nachmittags zwischen 14 und 18 Uhr")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Gesprächstermin buchen/ })).toHaveAttribute("href", BEWERBER_BUCHUNGSLINK);
    expect(ladeFragebogenEntwurf(TOKEN)).toBeNull();
  });

  it("zeigt bei einem bereits ausgefüllten Fragebogen die Danke-Seite ohne Fragen", async () => {
    rpc.mockResolvedValue({ data: [{ vorname: "Max", status: "eingereicht", expires_at: IN_ZWEI_WOCHEN }], error: null });
    await oeffne();

    expect(screen.getByRole("heading", { name: "Vielen Dank, Max." })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Los geht's/ })).not.toBeInTheDocument();
  });

  it("kommt ohne Telefonnummer aus der Datenbank aus", async () => {
    rpc.mockResolvedValue({ data: [{ vorname: "Max", status: "offen", expires_at: IN_ZWEI_WOCHEN }], error: null });
    speichereFragebogenEntwurf(TOKEN, { frageKey: "abschluss", antworten: { region: "Rosenheim" }, telefon: "" });
    await oeffne();

    expect((screen.getByPlaceholderText("Deine Telefonnummer") as HTMLInputElement).value).toBe("");
  });
});
