import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { kundenansichtVorschauPfad, kundenansichtZiel, onlineExposePfad } from "@/lib/kundenansichtZiel";

/**
 * Die alte Kundenansicht ist abgelöst (Bauplan Kundenansicht, Frage 11,
 * Freigabe von Christian am 23.09.2026):
 *   - alte Adressen leiten weiter, Admin und Inhaber in die neue Vorschau,
 *     alle anderen aufs öffentliche Online-Exposé;
 *   - der Knopf „Kundenansicht“ in der Verwaltungsansicht folgt derselben
 *     Regel.
 */

const t = vi.hoisted(() => ({
  nutzer: null as null | { loading: boolean; isLoggedIn: boolean; user: { role: string } },
}));

vi.mock("@/contexts/UserContext", () => ({ useOptionalUser: () => t.nutzer }));

const { default: KundenansichtObjekt } = await import("./KundenansichtObjekt");
const { default: KundenansichtWohnung } = await import("./KundenansichtWohnung");

const O = "11111111-1111-4111-8111-111111111111";
const W = "22222222-2222-4222-8222-222222222222";
const K = "33333333-3333-4333-8333-333333333333";
const I = "44444444-4444-4444-8444-444444444444";

function Ziel() {
  const ort = useLocation();
  return <p data-testid="ziel">{`${ort.pathname}${ort.search}`}</p>;
}

function aufrufen(adresse: string) {
  render(
    <MemoryRouter initialEntries={[adresse]}>
      <Routes>
        <Route path="/kundenansicht/objekt/:id" element={<KundenansichtObjekt />} />
        <Route path="/kundenansicht/objekt/:id/wohnung/:weId" element={<KundenansichtWohnung />} />
        <Route path="*" element={<Ziel />} />
      </Routes>
    </MemoryRouter>,
  );
}

function angemeldet(role: string) {
  t.nutzer = { loading: false, isLoggedIn: true, user: { role } };
}

beforeEach(() => {
  t.nutzer = { loading: false, isLoggedIn: false, user: { role: "kunde" } };
});

describe("alte Adressen der Kundenansicht", () => {
  it("schicken Besucher ohne Anmeldung aufs öffentliche Exposé, ohne Name und Rahmen aus der Adresse", () => {
    aufrufen(`/kundenansicht/objekt/${O}?kunde=Martina%20Brandl&kundeId=${K}&investmentId=${I}&minRahmen=200000&maxRahmen=300000`);
    expect(screen.getByTestId("ziel")).toHaveTextContent(`/expose/${O}`);
    expect(screen.getByTestId("ziel").textContent).toBe(`/expose/${O}`);
  });

  it("schicken die Wohnungsseite aufs öffentliche Exposé dieser Wohnung", () => {
    aufrufen(`/kundenansicht/objekt/${O}/wohnung/${W}`);
    expect(screen.getByTestId("ziel").textContent).toBe(`/expose/${O}/wohnung/${W}`);
  });

  it("schicken Vertriebspartner bis zu ihrer Freigabe aufs öffentliche Exposé", () => {
    angemeldet("vertriebspartner");
    aufrufen(`/kundenansicht/objekt/${O}?kundeId=${K}&investmentId=${I}`);
    expect(screen.getByTestId("ziel").textContent).toBe(`/expose/${O}`);
  });

  it("schicken Admin in die neue Vorschau, mit dem Investment aus der Objektauswahl, ohne Namen", () => {
    angemeldet("admin");
    aufrufen(`/kundenansicht/objekt/${O}?kunde=Martina%20Brandl&kundeId=${K}&investmentId=${I}&minRahmen=1`);
    expect(screen.getByTestId("ziel").textContent).toBe(`/objekte/${O}/kundenansicht?investmentId=${I}`);
  });

  it("schicken Inhaber von der Wohnungsseite in die Vorschau dieser Wohnung", () => {
    angemeldet("inhaber");
    aufrufen(`/kundenansicht/objekt/${O}/wohnung/${W}`);
    expect(screen.getByTestId("ziel").textContent).toBe(`/objekte/${O}/einheiten/${W}/kundenansicht`);
  });

  it("übernehmen ein Investment in falscher Form nicht", () => {
    angemeldet("admin");
    aufrufen(`/kundenansicht/objekt/${O}?investmentId=1%20OR%201`);
    expect(screen.getByTestId("ziel").textContent).toBe(`/objekte/${O}/kundenansicht`);
  });

  it("warten, bis die Anmeldung feststeht, statt Admin aufs öffentliche Exposé zu schicken", () => {
    t.nutzer = { loading: true, isLoggedIn: false, user: { role: "kunde" } };
    aufrufen(`/kundenansicht/objekt/${O}`);
    expect(screen.getByTestId("alte-kundenansicht-laedt")).toBeInTheDocument();
    expect(screen.queryByTestId("ziel")).not.toBeInTheDocument();
  });

  it("funktionieren auch ganz ohne Anmeldekontext", () => {
    t.nutzer = null;
    aufrufen(`/kundenansicht/objekt/${O}`);
    expect(screen.getByTestId("ziel").textContent).toBe(`/expose/${O}`);
  });
});

describe("Ziel des Knopfs „Kundenansicht“", () => {
  it("führt Admin und Inhaber in die Vorschau, alle anderen aufs Online-Exposé", () => {
    expect(kundenansichtZiel({ rolle: "admin", objektId: O })).toBe(`/objekte/${O}/kundenansicht`);
    expect(kundenansichtZiel({ rolle: "inhaber", objektId: O, investmentId: I, beraterId: "u1" })).toBe(`/objekte/${O}/kundenansicht?investmentId=${I}`);
    expect(kundenansichtZiel({ rolle: "vertriebspartner", objektId: O, investmentId: I, beraterId: "u1" })).toBe(`/expose/${O}?berater=u1`);
    expect(kundenansichtZiel({ rolle: "objektpartner", objektId: O })).toBe(`/expose/${O}`);
    expect(kundenansichtZiel({ rolle: null, objektId: O })).toBe(`/expose/${O}`);
  });

  it("baut die Pfade mit und ohne Wohnung", () => {
    expect(kundenansichtVorschauPfad(O, W)).toBe(`/objekte/${O}/einheiten/${W}/kundenansicht`);
    expect(kundenansichtVorschauPfad(O, null, I)).toBe(`/objekte/${O}/kundenansicht?investmentId=${I}`);
    expect(onlineExposePfad(O, W)).toBe(`/expose/${O}/wohnung/${W}`);
  });

  it("ist in der Verwaltungsansicht an beiden Knöpfen umgestellt", () => {
    const quelle = readFileSync(resolve(process.cwd(), "src/pages/ObjektDetail.tsx"), "utf8");
    expect(quelle).not.toContain("/kundenansicht/objekt/");
    expect(quelle.match(/kundenansichtZiel\(\{ rolle: user\.role, objektId: objekt\.id/g)).toHaveLength(2);
  });
});
