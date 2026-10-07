import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MUSTER_OBJEKT, MUSTER_WE7 } from "@/test/musterobjektWe7";

/**
 * Der Dialog „Kundenlink senden“: Art wählen (Standard Objektübersicht),
 * Kunde und Investment wählen, dann per Mail senden oder den Link kopieren.
 * Die Empfängeradresse schickt der Dialog nie mit, die nimmt die Function aus
 * dem Kontakt.
 */

const t = vi.hoisted(() => ({
  senden: vi.fn(),
  kopieren: vi.fn(),
  investments: [] as Array<{ id: string; nummer: number; objektTitel?: string; weNr?: string; meta?: Record<string, unknown> }>,
  mitEmail: true,
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  kontakte: [] as Array<{ id: string; meta?: Record<string, unknown> }>,
  englischFehlt: false,
  englischAnfordern: vi.fn(),
  bestehend: { vorhanden: false, auswahl: null } as { vorhanden: boolean; auswahl: string[] | null },
  rolle: "admin",
  // Für die Zuständigkeit beim Vertriebspartner: k1 gehört „ich“, k2 einem anderen Partner.
  zustaendig: { k1: "ich", k2: "anderer" } as Record<string, string>,
  vertretungFuer: new Set<string>(),
}));

vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { role: t.rolle, name: "Ich Selbst" }, authUser: { id: "ich" } }),
}));
vi.mock("@/hooks/useVertretungen", () => ({ useVertretungen: () => t.vertretungFuer }));
vi.mock("@/lib/kundenStore", () => ({
  getKontaktById: (id: string) => (t.zustaendig[id] ? { id, zustaendig_id: t.zustaendig[id] } : undefined),
}));

vi.mock("sonner", () => ({ toast: t.toast }));
vi.mock("@/lib/dataCache", () => ({
  cacheGet: (tabelle: string) => (tabelle === "kontakte" ? t.kontakte : []),
  onCacheChange: () => () => undefined,
  cacheGetById: () => undefined,
}));
vi.mock("@/lib/objektTexteKi", () => ({
  englischeObjektTexteFehlen: () => t.englischFehlt,
  englischeObjektTexteAnfordern: (...a: unknown[]) => t.englischAnfordern(...a),
}));
vi.mock("@/lib/investmentsStore", () => ({
  getInvestmentsByKontakt: () => t.investments,
  // Für den Vermerk „Kunde finanziert selbst“ (`selbstauskunftEntfaellt`).
  getInvestmentMeta: (id: string, key: string, fallback: unknown) => t.investments.find((i) => i.id === id)?.meta?.[key] ?? fallback,
  setInvestmentMeta: vi.fn(),
}));
vi.mock("@/lib/textKopieren", () => ({ kopiereText: (...a: unknown[]) => t.kopieren(...a) }));
vi.mock("@/lib/objektExposeStore", async (original) => ({
  ...(await original<typeof import("@/lib/objektExposeStore")>()),
  kundenZurAuswahl: () => [
    { id: "k1", name: "Martina Brandl", hatSelbstauskunft: true },
    { id: "k2", name: "Otto Fremd", hatSelbstauskunft: false },
  ],
  kundeHatEmail: () => t.mitEmail,
  sendeKundenExpose: (...a: unknown[]) => t.senden(...a),
  ladeKundenlinkAuswahl: async () => t.bestehend,
}));

const { ExposeErzeugenDialog } = await import("./ExposeErzeugenDialog");

function oeffnen(extra: Partial<Parameters<typeof ExposeErzeugenDialog>[0]> = {}) {
  const onOpenChange = vi.fn();
  render(<ExposeErzeugenDialog objekt={MUSTER_OBJEKT} vorgewaehlteWohnungId={MUSTER_WE7.id} offen onOpenChange={onOpenChange} {...extra} />);
  return { onOpenChange };
}

/** Danach lädt der Dialog die Auswahl eines bestehenden Links; bis dahin ist Senden gesperrt. */
async function kundeWaehlen() {
  fireEvent.change(screen.getByPlaceholderText("Name suchen…"), { target: { value: "Mart" } });
  fireEvent.click(screen.getByRole("button", { name: /Martina Brandl/ }));
  await geladen();
}

async function geladen() {
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  t.senden.mockReset();
  t.kopieren.mockReset();
  t.kopieren.mockResolvedValue("kopiert");
  t.investments = [{ id: "i1", nummer: 1, objektTitel: "Musterstraße 12", weNr: "7" }];
  t.mitEmail = true;
  t.toast.success.mockReset(); t.toast.error.mockReset(); t.toast.info.mockReset();
  t.kontakte = [];
  t.englischFehlt = false;
  t.englischAnfordern.mockReset();
  t.englischAnfordern.mockResolvedValue(undefined);
  t.bestehend = { vorhanden: false, auswahl: null };
  t.rolle = "admin";
  t.vertretungFuer = new Set();
});

function nurExposeWaehlen() {
  fireEvent.click(screen.getByRole("radio", { name: /nur Exposé dieser Wohnung/ }));
}

describe("Kundenlink senden", () => {
  it("heißt „Kundenlink senden“ und steht auf der Objektübersicht", async () => {
    oeffnen();
    expect(screen.getByRole("heading", { name: "Kundenlink senden" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Objektübersicht mit freien Wohnungen/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /nur Exposé dieser Wohnung/ })).not.toBeChecked();
    expect(screen.getByLabelText("Öffnet bei")).toBeInTheDocument();
    nurExposeWaehlen();
    expect(screen.getByRole("radio", { name: /nur Exposé dieser Wohnung/ })).toBeChecked();
    expect(screen.getByLabelText("Einheit")).toBeInTheDocument();
  });

  it("sendet die Objektübersicht mit der Wohnung als Einstieg", async () => {
    t.senden.mockResolvedValue({ ok: true, link: "https://osimmobilien.netlify.app/immobilie/t", gueltigBis: "2026-11-22T10:00:00Z", migrationFehlt: false, fehler: null });
    oeffnen();
    await kundeWaehlen();
    fireEvent.click(screen.getByRole("button", { name: /Link kopieren/ }));
    await waitFor(() => expect(t.senden).toHaveBeenCalledWith({ modus: "link", art: "objektuebersicht", kontaktId: "k1", investmentId: "i1", objektId: MUSTER_OBJEKT.id, wohnungId: MUSTER_WE7.id }));
    await waitFor(() => expect(t.kopieren).toHaveBeenCalledWith("https://osimmobilien.netlify.app/immobilie/t"));
  });

  it("sendet nach der Wahl „nur Exposé“ das Exposé dieser Wohnung", async () => {
    t.senden.mockResolvedValue({ ok: true, link: "https://osimmobilien.netlify.app/expose/x?token=t", gueltigBis: null, migrationFehlt: false, fehler: null });
    oeffnen();
    nurExposeWaehlen();
    await kundeWaehlen();
    fireEvent.click(screen.getByRole("button", { name: /Per Mail senden/ }));
    await waitFor(() => expect(t.senden).toHaveBeenCalledWith(expect.objectContaining({ art: "expose", wohnungId: MUSTER_WE7.id })));
    await waitFor(() => expect(String(t.toast.success.mock.calls[0]?.[0])).toContain("Exposé an Martina Brandl gesendet"));
  });

  it("übernimmt Kunde und Investment aus der Objektauswahl", async () => {
    t.investments = [{ id: "i1", nummer: 1 }, { id: "i2", nummer: 2, objektTitel: "Parkstraße 8" }];
    oeffnen({ vorgewaehlterKundeId: "k1", vorgewaehltesInvestmentId: "i2" });
    await geladen();
    expect(screen.getByTestId("expose-kunde-gewaehlt")).toHaveTextContent("Martina Brandl");
    expect(screen.getByRole("button", { name: /Per Mail senden/ })).toBeEnabled();
  });

  it("sendet erst, wenn Kunde und Investment feststehen", async () => {
    oeffnen();
    expect(screen.getByRole("button", { name: /Per Mail senden/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Link kopieren/ })).toBeDisabled();
    await kundeWaehlen();
    // Genau ein Investment: es wird gesetzt und benannt.
    expect(screen.getByTestId("expose-investment-einziges")).toHaveTextContent("Investment 1");
    expect(screen.getByRole("button", { name: /Per Mail senden/ })).toBeEnabled();
  });

  it("schickt per Mail ohne Empfängeradresse und schließt mit Rückmeldung", async () => {
    t.senden.mockResolvedValue({ ok: true, link: "https://osimmobilien.netlify.app/expose/x?token=t", gueltigBis: "2026-11-22T10:00:00Z", migrationFehlt: false, fehler: null });
    const { onOpenChange } = oeffnen();
    await kundeWaehlen();
    fireEvent.click(screen.getByRole("button", { name: /Per Mail senden/ }));
    await waitFor(() => expect(t.senden).toHaveBeenCalledTimes(1));
    expect(t.senden).toHaveBeenCalledWith({ modus: "mail", art: "objektuebersicht", kontaktId: "k1", investmentId: "i1", objektId: MUSTER_OBJEKT.id, wohnungId: MUSTER_WE7.id });
    await waitFor(() => expect(t.toast.success).toHaveBeenCalled());
    expect(String(t.toast.success.mock.calls[0][0])).toContain("Objektübersicht an Martina Brandl gesendet");
    expect(String(t.toast.success.mock.calls[0][0])).toContain("Gesendete Links");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("kopiert den Link, zeigt ihn an und legt beim zweiten Klick keinen zweiten Versand an", async () => {
    const link = "https://osimmobilien.netlify.app/expose/o/wohnung/w?token=abc";
    t.senden.mockResolvedValue({ ok: true, link, gueltigBis: "2026-11-22T10:00:00Z", migrationFehlt: false, fehler: null });
    oeffnen();
    await kundeWaehlen();
    fireEvent.click(screen.getByRole("button", { name: /Link kopieren/ }));
    await waitFor(() => expect(t.kopieren).toHaveBeenCalledWith(link));
    expect(t.senden).toHaveBeenCalledWith(expect.objectContaining({ modus: "link" }));
    expect(screen.getByTestId("expose-link")).toHaveValue(link);
    fireEvent.click(screen.getByRole("button", { name: /Link kopieren/ }));
    await waitFor(() => expect(t.kopieren).toHaveBeenCalledTimes(2));
    expect(t.senden).toHaveBeenCalledTimes(1);
  });

  it("sperrt die Mail, wenn am Kunden keine Adresse steht, der Link geht trotzdem", async () => {
    t.mitEmail = false;
    oeffnen();
    await kundeWaehlen();
    expect(screen.getByTestId("expose-ohne-email")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Per Mail senden/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Link kopieren/ })).toBeEnabled();
  });

  it("sagt ohne Investment, wo es anzulegen ist", async () => {
    t.investments = [];
    oeffnen();
    await kundeWaehlen();
    expect(screen.getByTestId("expose-kein-investment")).toHaveTextContent("Leg es im Kundenprofil an");
    expect(screen.getByRole("button", { name: /Per Mail senden/ })).toBeDisabled();
  });

  it("meldet die fehlende Migration", async () => {
    t.senden.mockResolvedValue({ ok: false, link: null, gueltigBis: null, migrationFehlt: true, fehler: "Migration Exposé-Versand noch nicht ausgeführt" });
    oeffnen();
    await kundeWaehlen();
    fireEvent.click(screen.getByRole("button", { name: /Per Mail senden/ }));
    await waitFor(() => expect(t.toast.error).toHaveBeenCalledWith("Migration Exposé-Versand noch nicht ausgeführt"));
  });

  it("meldet die fehlende Migration der Objektübersicht", async () => {
    t.senden.mockResolvedValue({ ok: false, link: null, gueltigBis: null, migrationFehlt: true, fehler: "Migration Kundenlink noch nicht ausgeführt" });
    oeffnen();
    await kundeWaehlen();
    fireEvent.click(screen.getByRole("button", { name: /Per Mail senden/ }));
    await waitFor(() => expect(t.toast.error).toHaveBeenCalledWith("Migration Kundenlink noch nicht ausgeführt"));
  });

  it("sendet beim ganzen Objekt ohne Einheit, als Objektübersicht oder Exposé", async () => {
    t.senden.mockResolvedValue({ ok: true, link: "https://osimmobilien.netlify.app/expose/o?token=t", gueltigBis: null, migrationFehlt: false, fehler: null });
    oeffnen({ ganzesObjekt: true, vorgewaehlteWohnungId: undefined, vorgewaehlterKundeId: "k1" });
    expect(screen.getByText(/Ganzes Objekt/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Einheit")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Öffnet bei")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Objektübersicht des ganzen Hauses/ })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: /Per Mail senden/ }));
    await waitFor(() => expect(t.senden).toHaveBeenCalledWith(expect.objectContaining({ art: "objektuebersicht", wohnungId: null, kontaktId: "k1" })));
    fireEvent.click(screen.getByRole("radio", { name: /nur Exposé des ganzen Objekts/ }));
    fireEvent.click(screen.getByRole("button", { name: /Per Mail senden/ }));
    await waitFor(() => expect(t.senden).toHaveBeenLastCalledWith(expect.objectContaining({ art: "expose", wohnungId: null })));
  });

  it("öffnet bei der Objektübersicht die interne Vorschau der Kundenansicht", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    oeffnen();
    await kundeWaehlen();
    fireEvent.click(screen.getByRole("button", { name: /Vorschau öffnen/ }));
    // Mit dem Investment: Daraus kennt die Vorschau den Kunden und seinen Partner.
    expect(open).toHaveBeenCalledWith(`/objekte/${MUSTER_OBJEKT.id}/einheiten/${MUSTER_WE7.id}/kundenansicht?investmentId=i1`, "_blank", "noopener");
    open.mockRestore();
  });

  it("öffnet beim ganzen Haus die Vorschau der Hausebene", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    oeffnen({ ganzesObjekt: true, vorgewaehlteWohnungId: undefined });
    fireEvent.click(screen.getByRole("button", { name: /Vorschau öffnen/ }));
    expect(open).toHaveBeenCalledWith(`/objekte/${MUSTER_OBJEKT.id}/kundenansicht`, "_blank", "noopener");
    open.mockRestore();
  });

  it("öffnet bei „nur Exposé“ die Vorschau des Exposés, als Kundenansicht ohne interne Leiste", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    oeffnen();
    nurExposeWaehlen();
    await kundeWaehlen();
    fireEvent.click(screen.getByRole("button", { name: /Vorschau öffnen/ }));
    // `ansicht=kunde` seit dem 23.09.2026: Die Vorschau sieht aus wie der Kundenlink.
    expect(open).toHaveBeenCalledWith(`/objekte/${MUSTER_OBJEKT.id}/einheiten/${MUSTER_WE7.id}/expose?kunde=k1&ansicht=kunde`, "_blank", "noopener");
    open.mockRestore();
  });
});

/*
 * Christian am 23.09.2026: Der Dialog war zu schmal, rechts wurden Text,
 * Auswahlfelder und „Per Mail senden“ abgeschnitten. Ursache war die
 * Knopfzeile, deren drei nicht umbrechende Knöpfe die Rasterspalte breiter
 * machten als das Fenster. Geprüft wird an den Klassen, jsdom misst nicht.
 */
describe("Kundenlink senden, die Breite", () => {
  it("ist breit genug, auf dem Handy mit Rand, und lässt die Spalte nie breiter werden als das Fenster", async () => {
    oeffnen();
    const fenster = screen.getByRole("dialog");
    const klassen = fenster.className.split(/\s+/);
    expect(klassen).toContain("max-w-2xl");
    expect(klassen).not.toContain("max-w-lg");
    expect(klassen).not.toContain("sm:max-w-lg");
    expect(klassen).toContain("w-[calc(100%-2rem)]");
    expect(klassen).toContain("grid-cols-1");
    // Die Ebene über der Kopfleiste bleibt (siehe FensterUeberKopfleiste.test.ts).
    expect(klassen).toContain("z-[80]");
  });

  it("bricht lange Namen in der Kundenliste um und die Knopfzeile sauber", async () => {
    oeffnen();
    fireEvent.change(screen.getByPlaceholderText("Name suchen…"), { target: { value: "Mart" } });
    expect(screen.getByTestId("expose-kunde-name").className).toMatch(/(?:^|\s)min-w-0(?:\s|$)/);
    expect(screen.getByTestId("expose-kunde-name").className).toContain("break-words");
    const knoepfe = screen.getByTestId("kundenlink-knoepfe");
    expect(knoepfe.className).toContain("sm:flex-wrap");
    // `space-x` und Umbruch vertragen sich nicht, der Abstand kommt nur aus `gap`.
    expect(knoepfe.className).not.toContain("sm:space-x-2");
    expect(knoepfe).toHaveTextContent("Per Mail senden");
  });

  it("hält auf dem Handy Kopf und Knöpfe fest, nur die Mitte scrollt, der Desktop bleibt", async () => {
    /*
     * Handyprüfung vom 23.09.2026: Vorher scrollte das ganze Fenster, das
     * Schließen-Kreuz verschwand nach oben und „Vorschau öffnen“ stand erst
     * ganz unten. jsdom misst nicht, deshalb wachen die Klassen.
     */
    oeffnen();
    const fenster = screen.getByRole("dialog");
    const klassen = (el: Element) => el.className.split(/\s+/);
    // Das Fenster selbst scrollt auf dem Handy nicht, es teilt sich in drei Zonen.
    expect(klassen(fenster)).toEqual(expect.arrayContaining(["max-sm:flex", "max-sm:flex-col", "max-sm:overflow-hidden"]));
    expect(klassen(screen.getByTestId("kundenlink-kopf"))).toContain("max-sm:shrink-0");
    const inhalt = screen.getByTestId("kundenlink-inhalt");
    expect(klassen(inhalt)).toEqual(expect.arrayContaining(["max-sm:min-h-0", "max-sm:overflow-y-auto"]));
    // Der lange Erklärsatz scrollt mit und bleibt die Beschreibung des Dialogs.
    const satz = screen.getByText(/Wähle, was der Kunde bekommt/);
    expect(inhalt).toContainElement(satz);
    expect(fenster.getAttribute("aria-describedby")).toBe(satz.id);
    // Ab sm steht er mit dem alten Abstand unter der Überschrift.
    expect(klassen(satz)).toEqual(expect.arrayContaining(["sm:-mt-2.5", "sm:text-left"]));
    const knoepfe = screen.getByTestId("kundenlink-knoepfe");
    expect(klassen(knoepfe)).toEqual(expect.arrayContaining(["max-sm:shrink-0", "max-sm:grid", "max-sm:grid-cols-2"]));
    expect(klassen(screen.getByRole("button", { name: /Per Mail senden/ }))).toContain("max-sm:col-span-2");
    // Alle drei Knöpfe stehen in der festen Leiste, nicht im scrollenden Teil.
    for (const name of [/Vorschau öffnen/, /Link kopieren/, /Per Mail senden/]) {
      const knopf = screen.getByRole("button", { name });
      expect(knoepfe).toContainElement(knopf);
      expect(inhalt).not.toContainElement(knopf);
    }
  });
});

/*
 * Christian am 23.09.2026: „Link kopieren“ brachte eine 404. Der Dialog zeigt
 * jetzt den Satz, den `sendeKundenExpose` liefert, und kopiert dann nichts.
 * Und: Ein aus der Lovable-Vorschau kopierter Link zur Objektübersicht führt
 * auf osimmobilien.netlify.app, wo die Seite erst nach dem Veröffentlichen existiert.
 */
describe("Kundenlink senden, wenn es hakt", () => {
  it("zeigt „nicht ausgerollt“ statt einer 404 und kopiert nichts", async () => {
    const meldung = "Die Function send-kunden-expose ist noch nicht ausgerollt. Roll sie in Lovable aus, dann klappt es.";
    t.senden.mockResolvedValue({ ok: false, link: null, gueltigBis: null, migrationFehlt: false, fehler: meldung });
    oeffnen();
    await kundeWaehlen();
    fireEvent.click(screen.getByRole("button", { name: /Link kopieren/ }));
    await waitFor(() => expect(t.toast.error).toHaveBeenCalledWith(meldung));
    expect(t.kopieren).not.toHaveBeenCalled();
    expect(screen.queryByTestId("expose-link")).not.toBeInTheDocument();
  });

  it("sagt unter einem Link zur Objektübersicht, dass er erst nach dem Veröffentlichen öffnet", async () => {
    // Der Test läuft auf localhost, also wie in der Lovable-Vorschau nicht auf osimmobilien.netlify.app.
    t.senden.mockResolvedValue({ ok: true, link: "https://osimmobilien.netlify.app/immobilie/t", gueltigBis: null, migrationFehlt: false, fehler: null });
    oeffnen();
    await kundeWaehlen();
    fireEvent.click(screen.getByRole("button", { name: /Link kopieren/ }));
    const hinweis = await screen.findByTestId("expose-link-veroeffentlichen");
    expect(hinweis).toHaveTextContent("osimmobilien.netlify.app");
    expect(hinweis).toHaveTextContent("veröffentlicht");
    expect(hinweis.textContent).not.toMatch(/ – | — /);
  });

  it("braucht den Hinweis beim Exposé nicht, dessen Seite gibt es auf osimmobilien.netlify.app schon", async () => {
    t.senden.mockResolvedValue({ ok: true, link: "https://osimmobilien.netlify.app/expose/o/wohnung/w?token=t", gueltigBis: null, migrationFehlt: false, fehler: null });
    oeffnen();
    nurExposeWaehlen();
    await kundeWaehlen();
    fireEvent.click(screen.getByRole("button", { name: /Link kopieren/ }));
    await screen.findByTestId("expose-link");
    expect(screen.queryByTestId("expose-link-veroeffentlichen")).not.toBeInTheDocument();
  });
});

/*
 * Kundensprache: Objekte, deren Texte vor dem 25.09.2026 entstanden, haben
 * keine englische Fassung. Ein englischer Kunde sah dann hinter seinem Link
 * die Beschreibung deutsch mit „Description available in German only“,
 * obwohl sich die Fassung nachholen lässt. Das tat bisher nur das PDF im
 * internen Exposé.
 */
describe("Kundenlink senden an einen englischen Kunden", () => {
  const erfolg = { ok: true, link: "https://osimmobilien.netlify.app/immobilie/t", gueltigBis: null, migrationFehlt: false, fehler: null };
  const englisch = { kundenSprache: "en", kundenSpracheGesetztAm: "2026-09-25T10:00:00Z" };

  it("holt die englische Fassung der Objekttexte nach, wenn sie fehlt", async () => {
    t.kontakte = [{ id: "k1", meta: englisch }];
    t.englischFehlt = true;
    t.senden.mockResolvedValue(erfolg);
    oeffnen();
    await kundeWaehlen();
    fireEvent.click(screen.getByRole("button", { name: /Link kopieren/ }));
    await waitFor(() => expect(t.englischAnfordern).toHaveBeenCalledWith(MUSTER_OBJEKT.id));
    expect(t.englischAnfordern).toHaveBeenCalledTimes(1);
  });

  it("fragt nicht, wenn die englische Fassung schon da ist", async () => {
    t.kontakte = [{ id: "k1", meta: englisch }];
    t.senden.mockResolvedValue(erfolg);
    oeffnen();
    await kundeWaehlen();
    fireEvent.click(screen.getByRole("button", { name: /Link kopieren/ }));
    await waitFor(() => expect(t.kopieren).toHaveBeenCalled());
    expect(t.englischAnfordern).not.toHaveBeenCalled();
  });

  it("fragt beim deutschen Kunden nie", async () => {
    t.kontakte = [{ id: "k1", meta: {} }];
    t.englischFehlt = true;
    t.senden.mockResolvedValue(erfolg);
    oeffnen();
    await kundeWaehlen();
    fireEvent.click(screen.getByRole("button", { name: /Link kopieren/ }));
    await waitFor(() => expect(t.kopieren).toHaveBeenCalled());
    expect(t.englischAnfordern).not.toHaveBeenCalled();
  });

  it("fragt nicht, wenn der Versand scheitert", async () => {
    t.kontakte = [{ id: "k1", meta: englisch }];
    t.englischFehlt = true;
    t.senden.mockResolvedValue({ ok: false, link: null, gueltigBis: null, migrationFehlt: false, fehler: "geht nicht" });
    oeffnen();
    await kundeWaehlen();
    fireEvent.click(screen.getByRole("button", { name: /Link kopieren/ }));
    await waitFor(() => expect(t.toast.error).toHaveBeenCalledWith("geht nicht"));
    expect(t.englischAnfordern).not.toHaveBeenCalled();
  });
});

/*
 * Wohnungsauswahl (Christian, 05.10.2026): Bei der Objektübersicht wählt man,
 * welche Wohnungen der Kunde sieht. Vorgewählt nur die eigene, „Öffnet bei“
 * nur aus den gewählten, mindestens eine, ein bestehender Link belegt vor.
 */
describe("Kundenlink senden: Wohnungsauswahl", () => {
  const WE8 = { ...MUSTER_WE7, id: "11111111-1111-4111-8111-000000000008", weNr: "WE 8" };
  const WE9 = { ...MUSTER_WE7, id: "11111111-1111-4111-8111-000000000009", weNr: "WE 9" };
  const HAUS = { ...MUSTER_OBJEKT, wohnungen: [MUSTER_WE7, WE8, WE9] };
  const OK = { ok: true, link: "https://osimmobilien.netlify.app/immobilie/t", gueltigBis: null, migrationFehlt: false, fehler: null };

  function oeffnenHaus() {
    render(<ExposeErzeugenDialog objekt={HAUS} vorgewaehlteWohnungId={WE8.id} offen onOpenChange={vi.fn()} />);
  }
  const kaestchen = (name: string) => screen.getByRole("checkbox", { name });

  it("wählt nur die eigene Wohnung vor und schickt genau sie mit", async () => {
    t.senden.mockResolvedValue(OK);
    oeffnenHaus();
    expect(screen.getByTestId("kundenlink-wohnungen")).toBeInTheDocument();
    expect(kaestchen("WE 8")).toBeChecked();
    expect(kaestchen("WE 7")).not.toBeChecked();
    expect(kaestchen("WE 9")).not.toBeChecked();
    await kundeWaehlen();
    fireEvent.click(screen.getByRole("button", { name: /Link kopieren/ }));
    await waitFor(() => expect(t.senden).toHaveBeenCalledWith(expect.objectContaining({ art: "objektuebersicht", wohnungId: WE8.id, wohnungAuswahl: [WE8.id] })));
  });

  it("schickt bei allen angehakten Wohnungen keine Einschränkung", async () => {
    t.senden.mockResolvedValue(OK);
    oeffnenHaus();
    fireEvent.click(screen.getByRole("button", { name: "Alle auswählen" }));
    for (const n of ["WE 7", "WE 8", "WE 9"]) expect(kaestchen(n)).toBeChecked();
    await kundeWaehlen();
    fireEvent.click(screen.getByRole("button", { name: /Link kopieren/ }));
    await waitFor(() => expect(t.senden).toHaveBeenCalledWith(expect.objectContaining({ wohnungAuswahl: null })));
  });

  it("verlangt mindestens eine Wohnung und leert mit „Keine“ auch „Öffnet bei“", async () => {
    oeffnenHaus();
    await kundeWaehlen();
    expect(screen.getByRole("button", { name: /Link kopieren/ })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Keine" }));
    expect(kaestchen("WE 8")).not.toBeChecked();
    expect(screen.getByText("Wähle mindestens eine Wohnung.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Link kopieren/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Per Mail senden/ })).toBeDisabled();
    // Das erste neue Häkchen wird zum Einstieg.
    fireEvent.click(kaestchen("WE 9"));
    expect(screen.getByRole("button", { name: /Link kopieren/ })).toBeEnabled();
  });

  it("nimmt beim Abwählen des Einstiegs die nächste gewählte Wohnung für „Öffnet bei“", async () => {
    t.senden.mockResolvedValue(OK);
    oeffnenHaus();
    fireEvent.click(kaestchen("WE 9"));
    fireEvent.click(kaestchen("WE 8"));
    await kundeWaehlen();
    fireEvent.click(screen.getByRole("button", { name: /Link kopieren/ }));
    await waitFor(() => expect(t.senden).toHaveBeenCalledWith(expect.objectContaining({ wohnungId: WE9.id, wohnungAuswahl: [WE9.id] })));
  });

  it("belegt die Auswahl eines bestehenden Links vor, samt der eigenen Wohnung, und sagt es", async () => {
    t.bestehend = { vorhanden: true, auswahl: [MUSTER_WE7.id] };
    oeffnenHaus();
    await kundeWaehlen();
    await waitFor(() => expect(kaestchen("WE 7")).toBeChecked());
    expect(kaestchen("WE 8")).toBeChecked();
    expect(kaestchen("WE 9")).not.toBeChecked();
    expect(screen.getByTestId("kundenlink-wohnungen")).toHaveTextContent("Die Auswahl gilt für den bestehenden Link dieses Kunden.");
  });

  it("hakt bei einem bestehenden Link ohne Auswahl alle an, so wie der Kunde es heute sieht", async () => {
    t.bestehend = { vorhanden: true, auswahl: null };
    oeffnenHaus();
    await kundeWaehlen();
    await waitFor(() => expect(kaestchen("WE 9")).toBeChecked());
    expect(kaestchen("WE 7")).toBeChecked();
  });

  it("zeigt die Auswahl nicht beim Exposé und schickt dort keine mit", async () => {
    t.senden.mockResolvedValue({ ...OK, link: "https://osimmobilien.netlify.app/expose/x?token=t" });
    oeffnenHaus();
    nurExposeWaehlen();
    expect(screen.queryByTestId("kundenlink-wohnungen")).not.toBeInTheDocument();
    await kundeWaehlen();
    fireEvent.click(screen.getByRole("button", { name: /Link kopieren/ }));
    await waitFor(() => expect(t.senden).toHaveBeenCalled());
    expect(t.senden.mock.calls[0][0]).not.toHaveProperty("wohnungAuswahl");
  });

  it("nimmt die Auswahl in die Vorschau mit", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    oeffnenHaus();
    fireEvent.click(kaestchen("WE 9"));
    fireEvent.click(screen.getByRole("button", { name: /Vorschau öffnen/ }));
    expect(open).toHaveBeenCalledWith(`/objekte/${HAUS.id}/einheiten/${WE8.id}/kundenansicht?wohnungen=${WE8.id}%2C${WE9.id}`, "_blank", "noopener");
    open.mockRestore();
  });
});

describe("Kundenlink senden: Wohnungsauswahl, Nachprüfung", () => {
  const WE8 = { ...MUSTER_WE7, id: "11111111-1111-4111-8111-000000000008", weNr: "WE 8" };
  const WE9 = { ...MUSTER_WE7, id: "11111111-1111-4111-8111-000000000009", weNr: "WE 9" };
  const OK = { ok: true, link: "https://osimmobilien.netlify.app/immobilie/t", gueltigBis: null, migrationFehlt: false, fehler: null };

  it("sperrt Kästchen und Senden, bis die gespeicherte Auswahl geladen ist", async () => {
    let fertig: (v: { vorhanden: boolean; auswahl: string[] | null }) => void = () => undefined;
    const original = t.bestehend;
    // Eine Antwort, die erst später kommt.
    t.bestehend = new Promise((r) => { fertig = r; }) as unknown as typeof original;
    render(<ExposeErzeugenDialog objekt={{ ...MUSTER_OBJEKT, wohnungen: [MUSTER_WE7, WE8, WE9] }} vorgewaehlteWohnungId={WE8.id} offen onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Name suchen…"), { target: { value: "Mart" } });
    fireEvent.click(screen.getByRole("button", { name: /Martina Brandl/ }));
    expect(screen.getByText("Bisherige Auswahl wird geladen…")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "WE 9" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Alle auswählen" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Link kopieren/ })).toBeDisabled();
    await act(async () => { fertig({ vorhanden: true, auswahl: [WE9.id] }); await Promise.resolve(); });
    expect(screen.getByRole("checkbox", { name: "WE 9" })).toBeChecked();
    expect(screen.getByRole("button", { name: /Link kopieren/ })).toBeEnabled();
  });

  it("zeigt die Liste auch bei nur einer Wohnung im Angebot, wenn der Link schon eingeschränkt ist, und schickt die Auswahl mit", async () => {
    t.bestehend = { vorhanden: true, auswahl: [MUSTER_WE7.id] };
    t.senden.mockResolvedValue(OK);
    render(<ExposeErzeugenDialog objekt={MUSTER_OBJEKT} vorgewaehlteWohnungId={MUSTER_WE7.id} offen onOpenChange={vi.fn()} />);
    expect(screen.queryByTestId("kundenlink-wohnungen")).not.toBeInTheDocument();
    await kundeWaehlen();
    expect(screen.getByTestId("kundenlink-wohnungen")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Link kopieren/ }));
    await waitFor(() => expect(t.senden).toHaveBeenCalledWith(expect.objectContaining({ wohnungAuswahl: null })));
  });

  it("sagt, wenn alle angehakt sind, dass auch später frei werdende Wohnungen sichtbar sind", async () => {
    render(<ExposeErzeugenDialog objekt={{ ...MUSTER_OBJEKT, wohnungen: [MUSTER_WE7, WE8] }} vorgewaehlteWohnungId={WE8.id} offen onOpenChange={vi.fn()} />);
    expect(screen.getByTestId("kundenlink-wohnungen")).toHaveTextContent("Der Kunde sieht nur die angehakten Wohnungen");
    fireEvent.click(screen.getByRole("button", { name: "Alle auswählen" }));
    expect(screen.getByTestId("kundenlink-wohnungen")).toHaveTextContent("Alle angehakt: Der Kunde sieht auch Wohnungen, die später frei werden.");
  });
});

/*
 * Seit dem 05.10.2026 senden auch Vertriebspartner und Vertriebsleitung
 * (Christians Go). Der Partner wählt nur eigene und vertretene Kunden, die
 * Leitung alle. Der Server prüft dasselbe noch einmal.
 */
describe("Kundenlink senden: Kundenauswahl nach aktiver Rolle", () => {
  it("zeigt dem Vertriebspartner nur eigene Kunden", () => {
    t.rolle = "vertriebspartner";
    oeffnen();
    expect(screen.getByRole("button", { name: /Martina Brandl/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Otto Fremd/ })).not.toBeInTheDocument();
  });

  it("zeigt dem Vertriebspartner auch die Kunden, die er gerade vertritt", () => {
    t.rolle = "vertriebspartner";
    t.vertretungFuer = new Set(["anderer"]);
    oeffnen();
    expect(screen.getByRole("button", { name: /Otto Fremd/ })).toBeInTheDocument();
  });

  it("zeigt der Vertriebsleitung und dem Admin alle Kunden", () => {
    for (const rolle of ["vertriebsleiter", "admin"]) {
      t.rolle = rolle;
      const { unmount } = render(<ExposeErzeugenDialog objekt={MUSTER_OBJEKT} vorgewaehlteWohnungId={MUSTER_WE7.id} offen onOpenChange={vi.fn()} />);
      expect(screen.getByRole("button", { name: /Otto Fremd/ }), rolle).toBeInTheDocument();
      unmount();
    }
  });

  it("übernimmt beim Vertriebspartner keinen vorbelegten fremden Kunden", () => {
    t.rolle = "vertriebspartner";
    oeffnen({ vorgewaehlterKundeId: "k2" });
    expect(screen.queryByTestId("expose-kunde-gewaehlt")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Name suchen…")).toBeInTheDocument();
  });
});

describe("Kundenlink senden: Stand der Selbstauskunft je Investment", () => {
  const DREI = [
    { id: "i1", nummer: 1, meta: { saSigned: true } },
    { id: "i2", nummer: 2, objektTitel: "Parkstraße 8" },
    { id: "i3", nummer: 3, meta: { selbstauskunftEntfaellt: { aktiv: true } } },
  ];
  // Die geöffnete Radix-Liste scrollt zum gewählten Eintrag, jsdom kennt das nicht.
  beforeEach(() => { Element.prototype.scrollIntoView = vi.fn(); });

  it("zeigt den Stand im geschlossenen Feld beim vorgewählten Investment", async () => {
    t.investments = DREI;
    oeffnen({ vorgewaehlterKundeId: "k1", vorgewaehltesInvestmentId: "i2" });
    await geladen();
    expect(screen.getByRole("combobox", { name: "Investment" })).toHaveTextContent("Investment 2, Parkstraße 8 · noch keine Selbstauskunft");
  });

  it("zeigt den Stand je Eintrag und lässt alle wählbar", async () => {
    t.investments = DREI;
    oeffnen({ vorgewaehlterKundeId: "k1", vorgewaehltesInvestmentId: "i1" });
    await geladen();
    expect(screen.getByRole("combobox", { name: "Investment" })).toHaveTextContent("Investment 1 · Selbstauskunft liegt vor");
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Investment" }), { key: "Enter" });
    const eintraege = await screen.findAllByRole("option");
    expect(eintraege.map((e) => e.textContent)).toEqual([
      "Investment 1 · Selbstauskunft liegt vor",
      "Investment 2, Parkstraße 8 · noch keine Selbstauskunft",
      "Investment 3 · Selbstfinanzierer, keine Selbstauskunft nötig",
    ]);
    for (const e of eintraege) expect(e).not.toHaveAttribute("aria-disabled", "true");
    fireEvent.click(eintraege[1]);
    await geladen();
    expect(screen.getByRole("combobox", { name: "Investment" })).toHaveTextContent("noch keine Selbstauskunft");
    expect(screen.getByRole("button", { name: /Per Mail senden/ })).toBeEnabled();
  });

  it("färbt den Punkt rot, solange die Selbstauskunft fehlt", async () => {
    t.investments = [DREI[1]];
    oeffnen({ vorgewaehlterKundeId: "k1" });
    await geladen();
    const einziges = screen.getByTestId("expose-investment-einziges");
    expect(einziges).toHaveTextContent("noch keine Selbstauskunft");
    expect(einziges.querySelector(".bg-alert-red")).not.toBeNull();
  });

  it("zählt eine im Bonitätscheck hochgeladene Selbstauskunft als vorliegend", async () => {
    t.investments = [{ id: "i1", nummer: 1, meta: { docStatuses: { Selbstauskunft: "approved" } } }];
    oeffnen({ vorgewaehlterKundeId: "k1" });
    await geladen();
    const einziges = screen.getByTestId("expose-investment-einziges");
    expect(einziges).toHaveTextContent("Selbstauskunft liegt vor");
    expect(einziges.querySelector(".bg-alert-green")).not.toBeNull();
  });
});
