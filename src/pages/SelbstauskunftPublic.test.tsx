import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";

/**
 * Die Kundenseite /sa/:token in der Kundensprache.
 *
 * Die Sprache kommt aus `get_sa_fill_token` (Feld `sprache`). Fehlt das Feld,
 * weil die Migration noch nicht gelaufen ist, bleibt es bei Deutsch.
 */

let tokenZeile: Record<string, unknown> | null = null;
/*
 * Weitere Antworten je Funktion, für Weiterleitung, Netzfehler und „Neuen
 * Link anfordern“. Ohne Eintrag: die Antwort wie vor der Migration
 * 20261007100000, also kein Nachfolger.
 */
let rpcAntwort: Record<string, (args: Record<string, unknown>) => unknown> = {};
const rpcAufrufe = vi.hoisted(() => [] as { name: string; args: Record<string, unknown> }[]);

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcAufrufe.push({ name, args });
      if (rpcAntwort[name]) return rpcAntwort[name](args);
      return name === "get_sa_fill_token" ? { data: tokenZeile ? [tokenZeile] : [], error: null } : { data: null, error: null };
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  },
}));

// Das Formular selbst ist hier nicht Gegenstand, nur was die Seite ihm mitgibt.
const formularProps: Record<string, unknown>[] = [];
vi.mock("@/components/selbstauskunft/SelbstauskunftForm", () => ({
  SelbstauskunftForm: (props: Record<string, unknown>) => {
    formularProps.push(props);
    return <div data-testid="formular" />;
  },
  SelbstauskunftHinweise: ({ sprache }: { sprache?: string }) => <div data-testid="hinweise" data-sprache={sprache} />,
  loescheLokalenSaEntwurf: (...a: unknown[]) => loeschen(...a),
}));
const loeschen = vi.hoisted(() => vi.fn());

import SelbstauskunftPublic from "./SelbstauskunftPublic";

const zukunft = new Date(Date.now() + 86_400_000).toISOString();
const vergangenheit = new Date(Date.now() - 86_400_000).toISOString();

/** Zeigt den Token der aktuellen Adresse, um die Weiterleitung zu sehen. */
function AdressToken() {
  return <span data-testid="adress-token">{useParams().token}</span>;
}

function zeige(adresse = "/sa/tok123") {
  return render(
    <MemoryRouter initialEntries={[adresse]}>
      <Routes>
        <Route path="/sa/:token" element={<><AdressToken /><SelbstauskunftPublic /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Kundenseite der Selbstauskunft", () => {
  beforeEach(() => {
    cleanup();
    formularProps.length = 0;
    rpcAntwort = {};
    rpcAufrufe.length = 0;
    document.documentElement.lang = "de";
  });

  it("englischer Kunde: Begrüßung, Hinweise und Formular auf Englisch, Datenschutz mit lang=en", async () => {
    tokenZeile = { id: "t1", kontakt_id: "k1", investment_id: "i1", status: "pending", expires_at: zukunft, name: "Jane Doe", sprache: "en" };
    zeige();
    await screen.findByText("Welcome, Jane Doe");
    expect(screen.getByText(/Please complete the following self-disclosure \(Selbstauskunft\) carefully/)).toBeTruthy();
    expect(screen.getByText("⏱ Duration: approx. 10 to 15 minutes")).toBeTruthy();
    expect(formularProps.at(-1)?.sprache).toBe("en");
    expect(screen.getByTestId("hinweise").getAttribute("data-sprache")).toBe("en");
    const links = screen.getAllByRole("link", { name: "Privacy policy" });
    expect(links[0].getAttribute("href")).toBe("/datenschutz?lang=en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("ohne Feld sprache (Migration offen): Deutsch wie bisher", async () => {
    tokenZeile = { id: "t1", kontakt_id: "k1", investment_id: "i1", status: "pending", expires_at: zukunft, name: "Max Muster" };
    zeige();
    await screen.findByText("Willkommen, Max Muster");
    expect(formularProps.at(-1)?.sprache).toBe("de");
    expect(screen.getAllByRole("link", { name: "Datenschutzerklärung" })[0].getAttribute("href")).toBe("/datenschutz");
    expect(document.documentElement.lang).toBe("de");
  });

  it("abgelaufener Link auf Englisch", async () => {
    tokenZeile = { id: "t1", kontakt_id: "k1", status: "pending", expires_at: vergangenheit, name: "Jane Doe", sprache: "en" };
    zeige();
    await screen.findByText("Link expired");
    expect(screen.getByText(/Your contact person at MOREImmo can send you a new link/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Request a new link" })).toBeTruthy();
  });

  /*
   * Seit Migration 20260928220000 leert `get_sa_fill_token` bei geschlossenem
   * Link Stand, Name, E-Mail und Zuordnung. Die Seite muss mit dieser Form
   * dieselben Hinweise zeigen und darf kein Formular aufbauen.
   */
  const geschlossen = { id: "t1", kontakt_id: null, investment_id: null, created_by: null, email: "", name: "", prefill_data: null };

  it("offener Link: der gespeicherte Stand kommt im Formular an", async () => {
    tokenZeile = {
      id: "t1", kontakt_id: "k1", investment_id: "i1", status: "pending", expires_at: zukunft,
      name: "Max Muster", email: "max@example.org", prefill_data: { vorname: "Max", nachname: "Muster", beruf: "Angestellt" },
    };
    zeige();
    await screen.findByText("Willkommen, Max Muster");
    expect(formularProps.at(-1)?.prefillSaData).toEqual({ vorname: "Max", nachname: "Muster", beruf: "Angestellt" });
    expect((formularProps.at(-1)?.prefillKontakt as { email?: string }).email).toBe("max@example.org");
  });

  it("abgeschickter Link ohne Daten: Bereits ausgefüllt, kein Formular", async () => {
    tokenZeile = { ...geschlossen, status: "used", expires_at: zukunft, sprache: "de" };
    zeige();
    await screen.findByText("Bereits ausgefüllt");
    expect(formularProps).toHaveLength(0);
    expect(screen.queryByTestId("formular")).toBeNull();
  });

  it("abgelaufener Link ohne Daten: Link abgelaufen in der Kundensprache, kein Formular", async () => {
    tokenZeile = { ...geschlossen, status: "pending", expires_at: vergangenheit, sprache: "en" };
    zeige();
    await screen.findByText("Link expired");
    expect(formularProps).toHaveLength(0);
  });

  it("abgeschlossener Link: spricht vom Berater und entfernt einen alten Entwurf auf dem Gerät (29.09.2026)", async () => {
    loeschen.mockClear();
    tokenZeile = { id: "t1", kontakt_id: "k1", investment_id: "i1", status: "used", expires_at: zukunft, name: "Max" };
    zeige();
    await screen.findByText("Bereits ausgefüllt");
    expect(screen.getByText("Diese Selbstauskunft wurde bereits ausgefüllt und eingereicht. Bei Fragen wenden Sie sich bitte an Ihren Berater.")).toBeTruthy();
    expect(loeschen).toHaveBeenCalledWith("k1", "i1");
    expect(document.body.textContent).not.toContain("Vertriebspartner");
  });

  it("abgelaufener Link: spricht vom Berater und entfernt einen alten Entwurf", async () => {
    loeschen.mockClear();
    tokenZeile = { id: "t1", kontakt_id: "k1", investment_id: "i1", status: "pending", expires_at: vergangenheit, name: "Max" };
    zeige();
    await screen.findByText("Link abgelaufen");
    expect(screen.getByText("Dieser Link ist nicht mehr gültig. Ihr Berater kann Ihnen einen neuen Link senden, Ihre bisherigen Angaben bleiben erhalten.")).toBeTruthy();
    expect(loeschen).toHaveBeenCalledWith("k1", "i1");
  });

  it("offener Link: nur der alte dauerhafte Entwurf geht, der Sitzungsentwurf bleibt", async () => {
    loeschen.mockClear();
    tokenZeile = { id: "t1", kontakt_id: "k1", investment_id: "i1", status: "pending", expires_at: zukunft, name: "Max Muster" };
    zeige();
    await screen.findByText("Willkommen, Max Muster");
    expect(loeschen).toHaveBeenCalledTimes(1);
    expect(loeschen).toHaveBeenCalledWith("k1", "i1", true);
  });

  it("bereits ausgefüllt auf Deutsch, unbekannte Sprache fällt auf Deutsch zurück", async () => {
    tokenZeile = { id: "t1", kontakt_id: "k1", status: "used", expires_at: zukunft, name: "Max", sprache: "xx" };
    zeige();
    await waitFor(() => expect(screen.getByText("Bereits ausgefüllt")).toBeTruthy());
  });

  /* ── Fester Link, klare Meldungen (07.10.2026) ─────────────────────── */

  it("älterer Link mit neuerem für dieselbe Selbstauskunft: leitet auf den aktuellen weiter", async () => {
    tokenZeile = { ...geschlossen, status: "pending", expires_at: vergangenheit, sprache: "de" };
    rpcAntwort.sa_link_nachfolger = () => ({ data: "tokNEU", error: null });
    zeige("/sa/tok123?lang=en");
    await waitFor(() => expect(screen.getByTestId("adress-token").textContent).toBe("tokNEU"));
    expect(rpcAufrufe.some((a) => a.name === "sa_link_nachfolger" && a.args._token === "tok123")).toBe(true);
    expect(rpcAufrufe.some((a) => a.name === "get_sa_fill_token" && a.args._token === "tokNEU")).toBe(true);
  });

  it("Nachfolger ist der Link selbst: keine Schleife, das Formular steht", async () => {
    tokenZeile = { id: "t1", kontakt_id: "k1", investment_id: "i1", status: "pending", expires_at: zukunft, name: "Max Muster" };
    rpcAntwort.sa_link_nachfolger = (a) => ({ data: a._token, error: null });
    zeige();
    await screen.findByText("Willkommen, Max Muster");
    expect(screen.getByTestId("adress-token").textContent).toBe("tok123");
  });

  it("ohne Migration (Funktion fehlt): abgelaufen wie bisher, kein Absturz", async () => {
    tokenZeile = { ...geschlossen, status: "pending", expires_at: vergangenheit };
    rpcAntwort.sa_link_nachfolger = () => ({ data: null, error: { code: "PGRST202", message: "not found" } });
    zeige();
    await screen.findByText("Link abgelaufen");
  });

  it("abgelaufen ohne Nachfolger: Neuen Link anfordern benachrichtigt einmal und bestätigt", async () => {
    tokenZeile = { ...geschlossen, status: "pending", expires_at: vergangenheit };
    rpcAntwort.sa_neuen_link_anfordern = () => ({ data: "angefordert", error: null });
    zeige();
    const knopf = await screen.findByRole("button", { name: "Neuen Link anfordern" });
    fireEvent.click(knopf);
    fireEvent.click(knopf);
    await screen.findByText("Ihr Berater ist benachrichtigt und sendet Ihnen einen neuen Link.");
    expect(rpcAufrufe.filter((a) => a.name === "sa_neuen_link_anfordern")).toEqual([{ name: "sa_neuen_link_anfordern", args: { _token: "tok123" } }]);
    expect(screen.queryByRole("button", { name: "Neuen Link anfordern" })).toBeNull();
  });

  it("schon angefordert und Fehler beim Anfordern: eigene ruhige Hinweise", async () => {
    tokenZeile = { ...geschlossen, status: "pending", expires_at: vergangenheit };
    rpcAntwort.sa_neuen_link_anfordern = () => ({ data: "schon_angefordert", error: null });
    zeige();
    fireEvent.click(await screen.findByRole("button", { name: "Neuen Link anfordern" }));
    await screen.findByText("Sie haben bereits einen neuen Link angefordert. Ihr Berater meldet sich bei Ihnen.");

    cleanup();
    rpcAntwort.sa_neuen_link_anfordern = () => ({ data: null, error: { message: "Failed to fetch" } });
    zeige();
    fireEvent.click(await screen.findByRole("button", { name: "Neuen Link anfordern" }));
    await screen.findByText("Die Anfrage konnte gerade nicht gesendet werden. Bitte wenden Sie sich direkt an Ihren Berater.");
  });

  it("unbekannter Link: nennt die neueste E-Mail, nicht „ungültig“", async () => {
    tokenZeile = null;
    zeige();
    await screen.findByText("Link nicht bekannt");
    expect(screen.getByText("Dieser Link ist nicht bekannt. Bitte nutzen Sie den Link aus Ihrer neuesten E-Mail von MOREImmo oder wenden Sie sich an Ihren Berater.")).toBeTruthy();
    expect(document.body.textContent).not.toContain("ungültig");
  });

  it("Netzfehler: eigene Meldung mit Erneut versuchen, danach lädt die Seite", async () => {
    let erster = true;
    rpcAntwort.get_sa_fill_token = () => {
      if (erster) { erster = false; return { data: null, error: { message: "Failed to fetch" } }; }
      return { data: [{ id: "t1", kontakt_id: "k1", investment_id: "i1", status: "pending", expires_at: zukunft, name: "Max Muster" }], error: null };
    };
    zeige();
    await screen.findByText("Die Seite konnte gerade nicht geladen werden. Bitte versuchen Sie es in einem Moment erneut.");
    expect(screen.queryByText("Link nicht bekannt")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    await screen.findByText("Willkommen, Max Muster");
  });

  it("Netzfehler als Ausnahme (fetch wirft) und auf Englisch", async () => {
    rpcAntwort.get_sa_fill_token = () => { throw new TypeError("Failed to fetch"); };
    zeige("/sa/tok123?lang=en");
    await screen.findByText("The page could not be loaded just now. Please try again in a moment.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("widerrufener Link (anderer Empfänger): kein Formular, kein Nachfolger, kein Knopf", async () => {
    tokenZeile = { ...geschlossen, status: "widerrufen", expires_at: zukunft, sprache: "de" };
    rpcAntwort.sa_link_nachfolger = () => ({ data: "tokNEU", error: null });
    zeige();
    await screen.findByText("Link nicht mehr gültig");
    expect(formularProps).toHaveLength(0);
    expect(screen.getByTestId("adress-token").textContent).toBe("tok123");
    expect(rpcAufrufe.some((a) => a.name === "sa_link_nachfolger")).toBe(false);
    expect(rpcAufrufe.some((a) => a.name === "mark_sa_link_opened")).toBe(false);
    expect(screen.queryByRole("button", { name: "Neuen Link anfordern" })).toBeNull();
  });

  it("Link für Person 2: freundlich abgewiesen, kein Formular, kein Öffnen, kein Knopf, DE und EN", async () => {
    tokenZeile = { id: "t1", kontakt_id: "k1", investment_id: "i1", status: "pending", person_nr: 2, expires_at: zukunft, name: "Erika", sprache: "de" };
    zeige();
    await screen.findByText("Bitte füllen Sie die Selbstauskunft gemeinsam über den Link von Person 1 aus.");
    expect(formularProps).toHaveLength(0);
    expect(rpcAufrufe.some((a) => a.name === "mark_sa_link_opened")).toBe(false);
    expect(screen.queryByRole("button", { name: "Neuen Link anfordern" })).toBeNull();

    cleanup();
    tokenZeile = { ...tokenZeile, sprache: "en" };
    zeige();
    await screen.findByText("Please complete the self-disclosure together using the link sent to Person 1.");
  });

  it("widerrufener Link auf Englisch", async () => {
    tokenZeile = { ...geschlossen, status: "widerrufen", expires_at: zukunft, sprache: "en" };
    zeige();
    await screen.findByText("Link no longer valid");
  });

  it("unbekannter Link auf Englisch", async () => {
    tokenZeile = null;
    zeige("/sa/tok123?lang=en");
    await screen.findByText("Link not recognised");
  });
});
