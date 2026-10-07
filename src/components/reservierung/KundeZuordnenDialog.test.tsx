import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";

/*
 * Der Dialog „Für Kunden reservieren“ auf der Einheitsseite.
 *
 * Geprüft wird, was Christian am 23.09.2026 festgelegt hat: Kunde suchen,
 * Investment mit Ampel wählen („bereit“, „Selbstauskunft fehlt“, „hat schon
 * eine Reservierung“), beim Ersetzen eines von Hand eingetragenen Objekts
 * nachfragen, dann weiter ins Formular für genau diese Einheit. Mit
 * `?empfehlung=` sind Kunde und Investment vorgewählt.
 */

const t = vi.hoisted(() => ({
  investments: [] as Array<Record<string, unknown> & { id: string; kontaktId: string }>,
  meta: {} as Record<string, Record<string, unknown>>,
  saOk: new Set<string>(),
  eingetragen: {} as Record<string, { strasse: string; plz: string; ort: string; weNr: string }>,
  rueckfrage: true,
  fragen: [] as Array<{ title: string; description?: unknown; confirmText?: string; cancelText?: string }>,
  verschoben: [] as Array<{ id: string; von?: string }>,
}));

vi.mock("@/hooks/useCacheReady", () => ({ useCacheReady: () => true }));
vi.mock("@/lib/dataCache", () => ({ onCacheChange: () => () => {} }));
vi.mock("@/lib/objektExposeStore", () => ({
  kundenZurAuswahl: () => [
    { id: "k-1", name: "Anna Beispiel", hatSelbstauskunft: true },
    { id: "k-2", name: "Bernd Muster", hatSelbstauskunft: false },
  ],
}));
vi.mock("@/lib/investmentsStore", () => ({
  getInvestmentsByKontakt: (k: string) => t.investments.filter((i) => i.kontaktId === k),
  getInvestmentById: (id: string) => t.investments.find((i) => i.id === id),
  getInvestmentMetaField: (id: string, key: string, fallback: unknown) => t.meta[id]?.[key] ?? fallback,
}));
vi.mock("@/lib/objektauswahlWaechter", () => ({ darfAufObjektauswahl: (id: string) => t.saOk.has(id) }));
vi.mock("@/lib/objektDatenPflicht", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/objektDatenPflicht")>();
  return {
    istAnderesObjekt: echt.istAnderesObjekt,
    objektBezeichnung: echt.objektBezeichnung,
    vorhandeneObjektDaten: (id: string) => t.eingetragen[id] || {},
    objektBereitsEingetragen: (id: string) => !!t.eingetragen[id],
    objektInVerlaufVerschieben: (id: string, o?: { gewechseltVon?: string }) => { t.verschoben.push({ id, von: o?.gewechseltVon }); return true; },
  };
});
vi.mock("@/lib/confirm", () => ({
  confirmDialog: async (o: { title: string; description?: unknown; confirmText?: string; cancelText?: string }) => { t.fragen.push(o); return t.rueckfrage; },
  hinweisDialog: async () => {},
}));

const { KundeZuordnenDialog } = await import("@/components/reservierung/KundeZuordnenDialog");

const wohnung = { id: "we-6", weNr: "WE 6", status: "frei" } as unknown as ObjektWohnung;
const objekt = { id: "obj-1", titel: "Roonstraße", adresse: "Roonstraße 3", plz: "95028", ort: "Hof", wohnungen: [wohnung] } as unknown as ObjektData;

function Ziel() {
  const l = useLocation();
  return <p data-testid="ziel">{l.pathname}{l.search}</p>;
}

function zeige(vorwahl?: string) {
  const zu = vi.fn();
  render(
    <MemoryRouter initialEntries={["/objekte/obj-1/einheiten/we-6"]}>
      <Routes>
        <Route path="/objekte/:id/einheiten/:weId" element={
          <KundeZuordnenDialog objekt={objekt} wohnung={wohnung} offen onOpenChange={zu}
            vorgewaehltesInvestmentId={vorwahl} bearbeiterName="Chris Admin" />
        } />
        <Route path="/reservierung" element={<Ziel />} />
      </Routes>
    </MemoryRouter>,
  );
  return zu;
}

const weiterKnopf = () => screen.getByRole("button", { name: /Weiter zur Reservierungsvereinbarung/ });

beforeEach(() => {
  cleanup();
  t.investments = [
    { id: "inv-bereit", kontaktId: "k-1", nummer: 1, label: "Investment 1", pipelineStufe: "objektauswahl" },
    { id: "inv-ohne-sa", kontaktId: "k-1", nummer: 2, label: "Investment 2", pipelineStufe: "beratungsgespraech" },
    { id: "inv-reserviert", kontaktId: "k-1", nummer: 3, label: "Investment 3", pipelineStufe: "reservierung" },
  ];
  t.meta = {};
  t.saOk = new Set(["inv-bereit", "inv-reserviert"]);
  t.eingetragen = {};
  t.rueckfrage = true;
  t.fragen = [];
  t.verschoben = [];
});

describe("Kunde suchen und Investment mit Ampel wählen", () => {
  it("zeigt je Investment die Ampel und lässt nur „bereit“ wählen", () => {
    zeige();
    fireEvent.change(screen.getByPlaceholderText("Name suchen…"), { target: { value: "anna" } });
    fireEvent.click(screen.getByRole("button", { name: "Anna Beispiel" }));

    const bereit = screen.getByRole("radio", { name: /Investment 1/ });
    const ohneSa = screen.getByRole("radio", { name: /Investment 2/ });
    const reserviert = screen.getByRole("radio", { name: /Investment 3/ });
    expect(bereit.textContent).toContain("bereit");
    expect(ohneSa.textContent).toContain("Selbstauskunft fehlt");
    expect(reserviert.textContent).toContain("hat schon eine Reservierung");
    expect(bereit).not.toBeDisabled();
    expect(ohneSa).toBeDisabled();
    expect(reserviert).toBeDisabled();

    expect(weiterKnopf()).toBeDisabled();
    fireEvent.click(bereit);
    expect(weiterKnopf()).not.toBeDisabled();
  });

  it("zeigt den Weg zu neuen Kunden, legt sie aber nicht selbst an", () => {
    zeige();
    expect(screen.getByRole("link", { name: "„Neuen Kontakt anlegen“" })).toHaveAttribute("href", "/alle-kontakte?neu=1");
  });

  it("verweist ohne Investment auf das Kundenprofil", () => {
    zeige();
    fireEvent.change(screen.getByPlaceholderText("Name suchen…"), { target: { value: "bernd" } });
    fireEvent.click(screen.getByRole("button", { name: "Bernd Muster" }));
    expect(screen.getByText(/noch kein Investment/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Kundenprofil" })).toHaveAttribute("href", "/kunden/k-2");
  });
});

describe("Vorwahl über ?empfehlung=", () => {
  it("wählt Kunde und Investment vor und führt ins Formular für genau diese Einheit", async () => {
    zeige("inv-bereit");
    await waitFor(() => expect(screen.getByText("Anna Beispiel")).toBeTruthy());
    expect(screen.getByRole("radio", { name: /Investment 1/ })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(weiterKnopf());
    await waitFor(() => expect(screen.getByTestId("ziel")).toBeTruthy());
    const ziel = new URL(`https://x${screen.getByTestId("ziel").textContent}`);
    expect(ziel.pathname).toBe("/reservierung");
    expect(ziel.searchParams.get("kunde")).toBe("k-1");
    expect(ziel.searchParams.get("investmentId")).toBe("inv-bereit");
    expect(ziel.searchParams.get("objektId")).toBe("obj-1");
    expect(ziel.searchParams.get("wohnungId")).toBe("we-6");
    expect(ziel.searchParams.get("zurueck")).toBe("/objekte/obj-1/einheiten/we-6");
  });

  it("ignoriert ein unbekanntes Investment in der Adresse", () => {
    zeige("gibt-es-nicht");
    expect(screen.getByPlaceholderText("Name suchen…")).toBeTruthy();
  });
});

describe("Ein von Hand eingetragenes Objekt wird nicht stillschweigend ersetzt", () => {
  it("fragt nach, und „Behalten“ bricht ab", async () => {
    t.eingetragen["inv-bereit"] = { strasse: "Andere Gasse 9", plz: "10115", ort: "Berlin", weNr: "12" };
    t.rueckfrage = false;
    zeige("inv-bereit");
    await waitFor(() => expect(weiterKnopf()).not.toBeDisabled());
    fireEvent.click(weiterKnopf());
    await waitFor(() => expect(t.fragen).toHaveLength(1));
    expect(t.fragen[0].confirmText).toBe("Ersetzen");
    expect(t.fragen[0].cancelText).toBe("Behalten");
    expect(String(t.fragen[0].description)).toContain("Andere Gasse 9");
    expect(t.verschoben).toHaveLength(0);
    expect(screen.queryByTestId("ziel")).toBeNull();
  });

  it("legt mit „Ersetzen“ das alte Objekt in den Verlauf und geht weiter", async () => {
    t.eingetragen["inv-bereit"] = { strasse: "Andere Gasse 9", plz: "10115", ort: "Berlin", weNr: "12" };
    zeige("inv-bereit");
    await waitFor(() => expect(weiterKnopf()).not.toBeDisabled());
    fireEvent.click(weiterKnopf());
    await waitFor(() => expect(screen.getByTestId("ziel")).toBeTruthy());
    expect(t.verschoben).toEqual([{ id: "inv-bereit", von: "Chris Admin" }]);
  });

  it("fragt nicht, wenn schon genau diese Einheit eingetragen ist", async () => {
    t.eingetragen["inv-bereit"] = { strasse: "Roonstraße 3", plz: "95028", ort: "Hof", weNr: "6" };
    zeige("inv-bereit");
    await waitFor(() => expect(weiterKnopf()).not.toBeDisabled());
    fireEvent.click(weiterKnopf());
    await waitFor(() => expect(screen.getByTestId("ziel")).toBeTruthy());
    expect(t.fragen).toHaveLength(0);
  });
});
