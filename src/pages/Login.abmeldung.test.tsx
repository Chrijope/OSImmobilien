import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import i18n from "@/i18n";
import Login from "./Login";

/*
 * Seit dem 26.09.2026 gibt es kein Häkchen „Angemeldet bleiben“ mehr. Es
 * setzte nur einen Merker, den nichts las. Stattdessen steht unter dem
 * Anmeldeknopf, dass Partner und Team jede Nacht abgemeldet werden.
 */

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: vi.fn() },
    auth: { signOut: vi.fn(async () => ({ error: null })) },
  },
}));

vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ isLoggedIn: false }),
}));

afterEach(async () => {
  await i18n.changeLanguage("de");
});

function zeige() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>,
  );
}

it("zeigt kein Häkchen mehr und nennt die nächtliche Abmeldung", () => {
  zeige();
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(screen.queryByText(/Angemeldet bleiben/i)).toBeNull();
  expect(
    screen.getByText("Aus Sicherheitsgründen melden wir Vertriebspartner und Team jede Nacht automatisch ab."),
  ).toBeInTheDocument();
});

it("hat den Satz auch auf Englisch", async () => {
  await i18n.changeLanguage("en");
  zeige();
  expect(screen.getByText(/signed out automatically every night/)).toBeInTheDocument();
});
