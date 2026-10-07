import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/*
 * Die Closing-Seiten gehören zum Bewerberweg. Seit dem 27.09.2026 gibt die
 * Datenbank Bewerbungen nur an hr, admin, inhaber und backoffice heraus,
 * also lässt der Guard mit `nurBewerberprozess` auch nur diese vier hinein.
 * Die Beratungspräsentationen bleiben allen internen Rollen offen.
 */

const zustand = vi.hoisted(() => ({ rolle: "admin" }));
vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ isLoggedIn: true, loading: false, user: { name: "Test", role: zustand.rolle } }),
}));

const { PraesentationGuard } = await import("./PraesentationGuard");

function zeige(rolle: string, nurBewerberprozess: boolean) {
  zustand.rolle = rolle;
  return render(
    <MemoryRouter initialEntries={["/seite"]}>
      <Routes>
        <Route path="/" element={<p>Startseite</p>} />
        <Route
          path="/seite"
          element={
            <PraesentationGuard nurBewerberprozess={nurBewerberprozess}>
              <p>Inhalt</p>
            </PraesentationGuard>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PraesentationGuard mit nurBewerberprozess (Closing-Seiten)", () => {
  it.each(["hr", "admin", "inhaber", "backoffice"])("%s sieht den Inhalt", (rolle) => {
    const { unmount } = zeige(rolle, true);
    expect(screen.getByText("Inhalt")).toBeTruthy();
    unmount();
  });

  it.each(["vertriebspartner", "vertriebsleiter", "setterin"])("%s landet auf der Startseite", (rolle) => {
    const { unmount } = zeige(rolle, true);
    expect(screen.queryByText("Inhalt")).toBeNull();
    expect(screen.getByText("Startseite")).toBeTruthy();
    unmount();
  });
});

describe("PraesentationGuard ohne Schalter (Beratungspräsentationen)", () => {
  it("lässt den Vertriebspartner weiter hinein", () => {
    const { unmount } = zeige("vertriebspartner", false);
    expect(screen.getByText("Inhalt")).toBeTruthy();
    unmount();
  });

  it("sperrt Kunden weiterhin aus", () => {
    const { unmount } = zeige("kunde", false);
    expect(screen.queryByText("Inhalt")).toBeNull();
    unmount();
  });
});
