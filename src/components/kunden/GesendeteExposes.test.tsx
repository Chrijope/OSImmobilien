import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

/**
 * „Gesendete Links“ im Kundenprofil, beim Investment unter der
 * Objektauswahl: Zeilen beider Arten, Knöpfe, Rückfrage vor dem
 * Zurückziehen, Senderecht für die Objektübersicht.
 */

const t = vi.hoisted(() => ({
  eintraege: [] as unknown[],
  migrationFehlt: false,
  laden: vi.fn(),
  zurueck: vi.fn(),
  senden: vi.fn(),
  bestaetigen: vi.fn(),
  hinweis: vi.fn(),
  kopieren: vi.fn(),
  toast: vi.fn(),
  bezeichnung: vi.fn(),
  rolle: "admin" as string | null,
}));

vi.mock("@/contexts/UserContext", () => ({
  useOptionalUser: () => (t.rolle ? { user: { role: t.rolle } } : null),
}));

vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => t.toast(...a) }));
vi.mock("@/lib/confirm", () => ({
  confirmDialog: (...a: unknown[]) => t.bestaetigen(...a),
  hinweisDialog: (...a: unknown[]) => t.hinweis(...a),
}));
vi.mock("@/lib/loadAllUsers", () => ({ loadAllUsers: () => [{ id: "u1", name: "Paula Partner" }] }));
vi.mock("@/lib/textKopieren", () => ({ kopiereText: (...a: unknown[]) => t.kopieren(...a) }));
vi.mock("@/lib/dataCache", () => ({ cacheGet: () => [], onCacheChange: () => () => undefined, cacheGetById: () => undefined }));
vi.mock("@/lib/objektExposeStore", async (original) => ({
  ...(await original<typeof import("@/lib/objektExposeStore")>()),
  ladeGesendeteExposes: (...a: unknown[]) => { t.laden(...a); return Promise.resolve({ eintraege: t.eintraege, migrationFehlt: t.migrationFehlt, fehler: null }); },
  zieheExposeZurueck: (...a: unknown[]) => t.zurueck(...a),
  sendeKundenExpose: (...a: unknown[]) => t.senden(...a),
  exposeBezeichnungAusCache: (...a: unknown[]) => { t.bezeichnung(...a); return "Wohnung 7, Parkstraße 8, Augsburg"; },
}));

const { GesendeteExposes } = await import("./GesendeteExposes");

const IN_60_TAGEN = new Date(Date.now() + 60 * 86400000).toISOString();
const GESTERN = new Date(Date.now() - 86400000).toISOString();

function zeile(extra: Record<string, unknown> = {}) {
  return {
    id: "e1", art: "expose", objekt_id: "o1", wohnung_id: "w7", einstieg_wohnung_id: null, kontakt_id: "k1", investment_id: "i1", token: "tok",
    gueltig_bis: IN_60_TAGEN, gesendet_am: "2026-09-23T10:00:00Z", gesendet_von: "u1", versandweg: "mail",
    zurueckgezogen_am: null, aufrufe: 3, erstmals_aufgerufen_am: "2026-09-23T11:00:00Z", zuletzt_aufgerufen_am: "2026-09-24T09:15:00Z",
    ...extra,
  };
}

/** Eine gesendete Objektübersicht: ohne Einheit, Einstieg bei Wohnung 9. */
function uebersicht(extra: Record<string, unknown> = {}) {
  return zeile({ id: "u1", art: "objektuebersicht", wohnung_id: null, einstieg_wohnung_id: "w9", ...extra });
}

beforeEach(() => {
  t.eintraege = [];
  t.migrationFehlt = false;
  t.rolle = "admin";
  for (const f of [t.laden, t.zurueck, t.senden, t.bestaetigen, t.hinweis, t.kopieren, t.toast, t.bezeichnung]) f.mockReset();
  t.kopieren.mockResolvedValue("kopiert");
});

describe("Gesendete Links", () => {
  it("zeichnet nichts, solange nichts gesendet wurde oder die Migration fehlt", async () => {
    const { container, rerender } = render(<GesendeteExposes anfangsOffen kontaktId="k1" investmentId="i1" />);
    await waitFor(() => expect(t.laden).toHaveBeenCalledWith("k1", "i1"));
    expect(container).toBeEmptyDOMElement();
    t.migrationFehlt = true;
    rerender(<GesendeteExposes kontaktId="k1" investmentId="i2" />);
    await waitFor(() => expect(t.laden).toHaveBeenCalledWith("k1", "i2"));
    expect(container).toBeEmptyDOMElement();
  });

  // Seit dem 05.10.2026 ein einklappbarer Link unter dem Terminknopf, standardmäßig zu.
  it("steht eingeklappt als „Gesendete Links (N)“ und klappt erst auf Klick auf", async () => {
    t.eintraege = [zeile(), zeile({ id: "e2" }), uebersicht()];
    render(<GesendeteExposes kontaktId="k1" investmentId="i1" />);
    const knopf = await screen.findByRole("button", { name: "Gesendete Links (3)" });
    expect(knopf).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("gesendetes-expose")).not.toBeInTheDocument();
    fireEvent.click(knopf);
    expect(screen.getAllByTestId("gesendetes-expose")).toHaveLength(3);
    expect(knopf).toHaveAttribute("aria-expanded", "true");
  });

  it("heißt „Gesendete Links“ und zeigt Art, Einheit, gesendet am und von, gültig bis, Aufrufe und zuletzt geöffnet", async () => {
    t.eintraege = [zeile()];
    render(<GesendeteExposes anfangsOffen kontaktId="k1" investmentId="i1" />);
    const eintrag = await screen.findByTestId("gesendetes-expose");
    expect(screen.getByRole("button", { name: "Gesendete Links (1)" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("kundenlink-art-marke")).toHaveTextContent("Exposé");
    expect(eintrag).toHaveTextContent("Wohnung 7, Parkstraße 8, Augsburg");
    expect(eintrag).toHaveTextContent("Per Mail gesendet am 23.09.2026 von Paula Partner");
    expect(eintrag).toHaveTextContent("gültig bis");
    expect(eintrag).toHaveTextContent("Aktiv");
    expect(screen.getByTestId("expose-aufrufe")).toHaveTextContent("3 Aufrufe · zuletzt geöffnet 24.09.2026");
    for (const knopf of ["Öffnen", "Link kopieren", "Erneut senden", "Zurückziehen"]) {
      expect(screen.getByRole("button", { name: new RegExp(knopf) })).toBeInTheDocument();
    }
  });

  it("lässt den Text in schmalen Spalten stehen: Knöpfe brechen darunter um, statt ihn auf null zu drücken", async () => {
    // Gemeldet am 24.09.2026: Im Kundenprofil stand der Text nur einen Buchstaben breit,
    // weil die Knopfgruppe „shrink-0“ trug und die Zeile ab sm fest als Reihe lief.
    t.eintraege = [zeile()];
    render(<GesendeteExposes anfangsOffen kontaktId="k1" investmentId="i1" />);
    const eintrag = await screen.findByTestId("gesendetes-expose");
    expect(eintrag).toHaveClass("flex-wrap");
    expect(eintrag.className).not.toMatch(/sm:flex-row/);
    const text = screen.getByTestId("gesendetes-expose-text");
    expect(text).toHaveClass("min-w-0", "flex-[1_1_16rem]");
    const knoepfe = screen.getByTestId("gesendetes-expose-knoepfe");
    expect(knoepfe).toHaveClass("flex-wrap");
    expect(knoepfe).not.toHaveClass("shrink-0");
    // Touchziel auf dem Handy mindestens 40px (h-10).
    for (const knopf of within(knoepfe).getAllByRole("button")) expect(knopf).toHaveClass("h-10");
  });

  it("öffnet den Link als Vorschau, die nicht mitzählt", async () => {
    t.eintraege = [zeile()];
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(<GesendeteExposes anfangsOffen kontaktId="k1" investmentId="i1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Öffnen/ }));
    expect(open).toHaveBeenCalledWith("https://osimmobilien.netlify.app/expose/o1/wohnung/w7?token=tok&vorschau=1", "_blank", "noopener");
    open.mockRestore();
  });

  it("kopiert einen gültigen Link direkt, ohne neuen Versand", async () => {
    t.eintraege = [zeile()];
    render(<GesendeteExposes anfangsOffen kontaktId="k1" investmentId="i1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Link kopieren/ }));
    await waitFor(() => expect(t.kopieren).toHaveBeenCalledWith("https://osimmobilien.netlify.app/expose/o1/wohnung/w7?token=tok"));
    expect(t.senden).not.toHaveBeenCalled();
  });

  it("erneuert einen abgelaufenen Link, bevor er kopiert wird", async () => {
    t.eintraege = [zeile({ gueltig_bis: GESTERN })];
    t.senden.mockResolvedValue({ ok: true, link: "https://osimmobilien.netlify.app/expose/o1/wohnung/w7?token=tok", gueltigBis: IN_60_TAGEN, migrationFehlt: false, fehler: null });
    render(<GesendeteExposes anfangsOffen kontaktId="k1" investmentId="i1" />);
    expect(await screen.findByText("Abgelaufen")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Link kopieren/ }));
    await waitFor(() => expect(t.senden).toHaveBeenCalledWith({ modus: "link", art: "expose", kontaktId: "k1", investmentId: "i1", objektId: "o1", wohnungId: "w7" }));
    await waitFor(() => expect(t.kopieren).toHaveBeenCalled());
  });

  it("fragt vor dem Zurückziehen mit „Zurückziehen“ und „Behalten“ und zieht dann zurück", async () => {
    t.eintraege = [zeile()];
    t.bestaetigen.mockResolvedValue(true);
    t.zurueck.mockResolvedValue({ erfolg: true, migrationFehlt: false, fehler: null });
    render(<GesendeteExposes anfangsOffen kontaktId="k1" investmentId="i1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Zurückziehen/ }));
    await waitFor(() => expect(t.zurueck).toHaveBeenCalledWith("e1"));
    expect(t.bestaetigen).toHaveBeenCalledWith(expect.objectContaining({ confirmText: "Zurückziehen", cancelText: "Behalten" }));
  });

  it("zieht bei „Behalten“ nichts zurück", async () => {
    t.eintraege = [zeile()];
    t.bestaetigen.mockResolvedValue(false);
    render(<GesendeteExposes anfangsOffen kontaktId="k1" investmentId="i1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Zurückziehen/ }));
    await waitFor(() => expect(t.bestaetigen).toHaveBeenCalled());
    expect(t.zurueck).not.toHaveBeenCalled();
  });

  it("sendet nach Rückfrage erneut per Mail", async () => {
    t.eintraege = [zeile()];
    t.bestaetigen.mockResolvedValue(true);
    t.senden.mockResolvedValue({ ok: true, link: "x", gueltigBis: IN_60_TAGEN, migrationFehlt: false, fehler: null });
    render(<GesendeteExposes anfangsOffen kontaktId="k1" investmentId="i1" kundeName="Martina Brandl" />);
    fireEvent.click(await screen.findByRole("button", { name: /Erneut senden/ }));
    await waitFor(() => expect(t.senden).toHaveBeenCalledWith(expect.objectContaining({ modus: "mail" })));
    expect(t.bestaetigen).toHaveBeenCalledWith(expect.objectContaining({ confirmText: "Erneut senden", cancelText: "Nicht senden" }));
  });

  it("zeigt an einem zurückgezogenen Link nur noch „Öffnen“", async () => {
    t.eintraege = [zeile({ zurueckgezogen_am: "2026-09-25T08:00:00Z" })];
    render(<GesendeteExposes anfangsOffen kontaktId="k1" investmentId="i1" />);
    expect(await screen.findByText("Zurückgezogen")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Öffnen/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Link kopieren/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Erneut senden/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Zurückziehen/ })).not.toBeInTheDocument();
  });

  it("zeigt eine Objektübersicht mit Art und Einstiegswohnung", async () => {
    t.eintraege = [uebersicht()];
    render(<GesendeteExposes anfangsOffen kontaktId="k1" investmentId="i1" />);
    expect(await screen.findByTestId("kundenlink-art-marke")).toHaveTextContent("Objektübersicht");
    expect(t.bezeichnung).toHaveBeenCalledWith("o1", "w9");
  });

  it("öffnet und kopiert bei der Objektübersicht den Link auf /immobilie", async () => {
    t.eintraege = [uebersicht()];
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(<GesendeteExposes anfangsOffen kontaktId="k1" investmentId="i1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Öffnen/ }));
    expect(open).toHaveBeenCalledWith("https://osimmobilien.netlify.app/immobilie/tok?vorschau=1", "_blank", "noopener");
    open.mockRestore();
    fireEvent.click(screen.getByRole("button", { name: /Link kopieren/ }));
    await waitFor(() => expect(t.kopieren).toHaveBeenCalledWith("https://osimmobilien.netlify.app/immobilie/tok"));
    expect(t.senden).not.toHaveBeenCalled();
  });

  it("sendet eine Objektübersicht erneut mit derselben Art und derselben Einstiegswohnung", async () => {
    t.eintraege = [uebersicht()];
    t.bestaetigen.mockResolvedValue(true);
    t.senden.mockResolvedValue({ ok: true, link: "x", gueltigBis: IN_60_TAGEN, migrationFehlt: false, fehler: null });
    render(<GesendeteExposes anfangsOffen kontaktId="k1" investmentId="i1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Erneut senden/ }));
    await waitFor(() => expect(t.senden).toHaveBeenCalledWith({ modus: "mail", art: "objektuebersicht", kontaktId: "k1", investmentId: "i1", objektId: "o1", wohnungId: "w9" }));
    expect(t.bestaetigen).toHaveBeenCalledWith(expect.objectContaining({ title: "Objektübersicht erneut senden?" }));
  });

  it("zeigt Vertriebspartnern an der Objektübersicht kein Erneut senden, bis Christian sie freigibt", async () => {
    t.rolle = "vertriebspartner";
    t.eintraege = [uebersicht(), zeile({ id: "e2" })];
    render(<GesendeteExposes anfangsOffen kontaktId="k1" investmentId="i1" />);
    const [zeileUebersicht, zeileExpose] = await screen.findAllByTestId("gesendetes-expose");
    expect(within(zeileUebersicht).queryByRole("button", { name: /Erneut senden/ })).not.toBeInTheDocument();
    expect(within(zeileUebersicht).getByRole("button", { name: /Link kopieren/ })).toBeInTheDocument();
    expect(within(zeileUebersicht).getByRole("button", { name: /Zurückziehen/ })).toBeInTheDocument();
    // Das Exposé bleibt, wie es war.
    expect(within(zeileExpose).getByRole("button", { name: /Erneut senden/ })).toBeInTheDocument();
  });

  it("lässt Vertriebspartner eine abgelaufene Objektübersicht nicht über Kopieren erneuern", async () => {
    t.rolle = "vertriebspartner";
    t.eintraege = [uebersicht({ gueltig_bis: GESTERN })];
    render(<GesendeteExposes anfangsOffen kontaktId="k1" investmentId="i1" />);
    expect(await screen.findByText("Abgelaufen")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Link kopieren/ })).not.toBeInTheDocument();
  });

  it("zeigt „noch nicht geöffnet“, solange der Kunde den Link nicht aufgerufen hat", async () => {
    t.eintraege = [zeile({ aufrufe: 0, erstmals_aufgerufen_am: null, zuletzt_aufgerufen_am: null, versandweg: "link" })];
    render(<GesendeteExposes anfangsOffen kontaktId="k1" investmentId="i1" />);
    expect(await screen.findByTestId("expose-aufrufe")).toHaveTextContent("0 Aufrufe · noch nicht geöffnet");
    expect(screen.getByTestId("gesendetes-expose")).toHaveTextContent("Link erzeugt am");
  });
});
