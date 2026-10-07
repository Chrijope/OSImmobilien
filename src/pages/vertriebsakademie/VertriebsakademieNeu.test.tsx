import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Neu from "./VertriebsakademieNeu";
import { getKapitelBySlug } from "@/lib/vertriebsakademieContent";
const fixture = vi.hoisted(() => ({
  state: {
    checks: {},
    uebungen: {},
    sectionsDone: {},
    kapitelDone: {},
    answers: {},
    aufgaben: {},
    abwaegung: {},
    aktiveTage: [],
  } as any,
  listeners: new Set<() => void>(),
}));
vi.mock("@/lib/vertriebsakademieProgress", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/vertriebsakademieProgress")
  >("@/lib/vertriebsakademieProgress");
  const React = await import("react");
  return {
    ...actual,
    useVaFortschrittGeladen: () => true,
    useVaProgress: () =>
      React.useSyncExternalStore(
        (cb) => {
          fixture.listeners.add(cb);
          return () => {
            fixture.listeners.delete(cb);
          };
        },
        () => fixture.state,
      ),
    vaProgress: {
      toggleSectionDone: (slug: string, id: string) => {
        fixture.state = {
          ...fixture.state,
          sectionsDone: {
            ...fixture.state.sectionsDone,
            [`${slug}::${id}`]: true,
          },
        };
        fixture.listeners.forEach((f) => f());
      },
      setKapitelDone: vi.fn(),
    },
  };
});
vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: any) => <main>{children}</main>,
}));
vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({
    authUser: { id: "partner-a" },
    user: { role: "vertriebspartner" },
  }),
}));
vi.mock("@/lib/vertriebsakademieZielgruppe", async () => ({
  ...(await vi.importActual<any>("@/lib/vertriebsakademieZielgruppe")),
  useZielgruppe: () => ["alle"],
}));
vi.mock("./VertriebsakademieKapitel", () => ({
  SectionBlock: ({ section }: any) => (
    <div>
      {section.intro}
      {section.uebungen?.map((u: any) => (
        <p key={u.id}>
          {u.titel}: {fixture.state.answers[`kultur::${u.id}`]}
        </p>
      ))}
    </div>
  ),
}));
vi.mock("@/components/vertriebsakademie/ZielgruppenFilter", () => ({
  ZielgruppenFilter: () => null,
}));
vi.mock(
  "@/components/vertriebsakademie/aufgaben/AkademieAbschlusstest",
  () => ({ AkademieAbschlusstest: () => null }),
);
vi.mock(
  "@/components/vertriebsakademie/aufgaben/AkademieAbwaegungsfall",
  () => ({ AkademieAbwaegungsfall: () => null }),
);
vi.mock("@/components/vertriebsakademie/AkademieSiegel", () => ({
  AkademieSiegel: () => null,
}));
vi.mock("@/components/vertriebsakademie/AkademieTeamVergleich", () => ({
  AkademieTeamVergleich: () => null,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: vi.fn().mockResolvedValue({ data: null }) },
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
  },
}));
const speicher = new Map<string, string>();
Object.defineProperty(window, "localStorage", {
  configurable: true,
  writable: true,
  value: {
    getItem: (k: string) => speicher.get(k) ?? null,
    setItem: (k: string, v: string) => speicher.set(k, String(v)),
    removeItem: (k: string) => speicher.delete(k),
    clear: () => speicher.clear(),
  },
});
beforeEach(() => {
  localStorage.clear();
  fixture.state = {
    checks: {},
    uebungen: {},
    sectionsDone: {},
    kapitelDone: {},
    answers: {},
    aufgaben: {},
    abwaegung: {},
    aktiveTage: [],
  };
});
function show(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/vertriebsakademie" element={<Neu />} />
        <Route path="/vertriebsakademie/:slug" element={<Neu />} />
      </Routes>
    </MemoryRouter>,
  );
}
describe("Neuer Lernraum", () => {
  it("zeigt gespeicherte Praxisantworten unter ihren bestehenden Kennungen", () => {
    fixture.state.answers["kultur::glaubenssatz-anwenden"] =
      "Meine bestehende persönliche Antwort";
    show(
      "/vertriebsakademie/kultur?lektion=kultur-glaubenssaetze&schritt=praxis",
    );
    expect(
      screen.getByText(/Meine bestehende persönliche Antwort/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Bisherige Ansicht vergleichen/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Vertriebsakademie", level: 1 }),
    ).toBeInTheDocument();
  });
  it("schließt die gewählte Lektion ab, ohne beim Rendern eine andere abzuhaken oder weiterzuspringen", () => {
    show("/vertriebsakademie/kultur?lektion=kultur-warum&schritt=mitnehmen");
    expect(fixture.state.sectionsDone).toEqual({});
    fireEvent.click(
      screen.getByRole("button", { name: "Als abgeschlossen markieren" }),
    );
    expect(fixture.state.sectionsDone).toEqual({
      "kultur::kultur-warum": true,
    });
    expect(
      screen.getByRole("button", { name: "Als bearbeitet gespeichert" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: getKapitelBySlug("kultur")!.sections[0].ueberschrift,
      }),
    ).toHaveTextContent(getKapitelBySlug("kultur")!.sections[0].ueberschrift);
  });
  it("lässt unbekannte Kapitel ohne Absturz zurück zum Lernweg führen", () => {
    show("/vertriebsakademie/unbekannt");
    expect(
      screen.getByRole("heading", { name: "Kapitel nicht gefunden" }),
    ).toBeInTheDocument();
  });
  it("bietet alle Kapitel und eine Suche mit passenden Abschnittslinks an", () => {
    show("/vertriebsakademie");
    expect(
      screen.getByRole("link", { name: /Dein 90-Tage-Programm/ }),
    ).toHaveAttribute("href", "/vertriebsakademie/quereinstieg-90-tage");
    fireEvent.change(
      screen.getByLabelText("Kapitel, Begriff oder Thema suchen"),
      { target: { value: "Cashflow" } },
    );
    expect(screen.getByRole("status")).toHaveTextContent("passende Lektionen");
    expect(
      screen
        .getAllByRole("link")
        .some((a) => a.getAttribute("href")?.includes("lektion=cashflow")),
    ).toBe(true);
  });
});
