/**
 * Lead-Verwaltung mit zwei Reitern (seit 01.10.2026): „Leads“ (vorausgewählt)
 * mit allen offenen Leads außer Rückläufern, samt Quellen-Filter und
 * Konfigurator-Stand der Handbuch-Leads, und „Rückläufer“. Foto-Upload und
 * Powerdialer gibt es hier nicht mehr. Die Zeilen bleiben wie seit dem
 * 30.09.2026: rundes Auswahlfeld vor „Eingang“, „Zuweisen an“ erst nach dem
 * Anhaken, „Zurückgegeben von <Name>“ unter dem Kennzeichen „Rückläufer“.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import type { KundeData } from "@/lib/kundenStore";
import { setzeSpeicherAttrappe } from "@/test/speicherAttrappe";

const leads = [
  {
    id: "k-zapier", vorname: "Zora", nachname: "Zapier", email: "z@example.test", telefon: "", ort: "",
    quelle: "Meta Ads: Nürnberg", leadTyp: "meta", erstellt_am: "2026-10-01T08:00:00Z", zustaendig_id: "", beraterHistorie: [],
  },
  {
    id: "k-meta2", vorname: "Mia", nachname: "Meta", email: "m@example.test", telefon: "", ort: "",
    quelle: "Meta Kampagne", leadTyp: "manuell", erstellt_am: "2026-09-29T08:00:00Z", zustaendig_id: "", beraterHistorie: [],
  },
  {
    id: "k-rueck", vorname: "Rudi", nachname: "Rueck", email: "r@example.test", telefon: "", ort: "",
    quelle: "Meta Ads: Nürnberg", leadTyp: "meta", erstellt_am: "2026-09-20T08:00:00Z", zustaendig_id: "",
    beraterHistorie: [{ name: "Partner A", id: "p-a", von: "2026-09-21T08:00:00Z", bis: "2026-09-28T08:00:00Z" }],
  },
  {
    id: "k-ohne", vorname: "Otto", nachname: "Ohne", email: "o@example.test", telefon: "", ort: "",
    quelle: "Analysetool", leadTyp: "meta", erstellt_am: "2026-09-25T08:00:00Z", zustaendig_id: "", beraterHistorie: [],
  },
  {
    id: "k-hand", vorname: "Hanna", nachname: "Hand", email: "h@example.test", telefon: "", ort: "",
    quelle: "Konfigurator", leadTyp: "meta", erstellt_am: "2026-09-27T08:00:00Z", zustaendig_id: "", beraterHistorie: [],
  },
  {
    id: "k-hrueck", vorname: "Rita", nachname: "Rueck", email: "rr@example.test", telefon: "", ort: "",
    quelle: "Konfigurator", leadTyp: "meta", erstellt_am: "2026-09-22T08:00:00Z", zustaendig_id: "",
    beraterHistorie: [{ name: "Partner B", id: "p-b", von: "2026-09-23T08:00:00Z", bis: "2026-09-26T08:00:00Z" }],
  },
] as unknown as KundeData[];

vi.mock("@/components/DashboardLayout", () => ({ DashboardLayout: ({ children }: { children: ReactNode }) => <>{children}</> }));
const rolle = vi.hoisted(() => ({ aktiv: "admin" }));
vi.mock("@/contexts/UserContext", () => ({ useUser: () => ({ user: { role: rolle.aktiv, name: "Test" } }) }));
vi.mock("@/hooks/useCacheReady", () => ({ useCacheReady: () => true }));
vi.mock("@/hooks/useLiveData", () => ({ useLiveVersion: () => 0 }));
vi.mock("@/lib/currentUser", () => ({ getCurrentUserId: () => "u-admin" }));
vi.mock("@/lib/dataCache", () => ({
  cacheGet: () => [],
  cacheGetById: () => undefined,
  cacheLadeZeilenFuer: vi.fn(async () => {}),
  cacheRefreshTable: vi.fn(async () => {}),
}));
vi.mock("@/lib/kundenStore", () => ({
  getKontakte: () => leads,
  addKontakt: vi.fn(),
  deleteKontakte: vi.fn(),
  leadZuweisenWennFrei: vi.fn(),
}));
// Admin sieht hier alles; für die Vertriebsleitung gilt die echte Regel.
vi.mock("@/lib/leadPool", async (original) => {
  const echt = await original<typeof import("@/lib/leadPool")>();
  return {
    ...echt,
    istOffenerPoolLead: (k: KundeData, sicht: { rolle: string; benutzerId: string | null }) =>
      sicht.rolle === "vertriebsleiter" ? echt.istOffenerPoolLead(k, sicht) : true,
  };
});
vi.mock("@/lib/handbuch/leadStand", async (original) => ({
  ...(await original<typeof import("@/lib/handbuch/leadStand")>()),
  ladeLeadStaende: vi.fn(async () => ({ status: "ok", zeilen: new Map() })),
}));
vi.mock("@/lib/leadPaketStore", async (original) => ({
  ...(await original<typeof import("@/lib/leadPaketStore")>()),
  ladeLeadPakete: vi.fn(async () => null),
}));
vi.mock("@/integrations/supabase/client", () => {
  const kette: Record<string, unknown> = {};
  for (const m of ["select", "in", "eq"]) kette[m] = () => kette;
  kette.then = (fertig: (r: unknown) => unknown) => fertig({ data: [], error: null });
  return { supabase: { from: () => kette, functions: { invoke: vi.fn(async () => ({})) } } };
});
vi.mock("@/components/kunden/DuplikatBanner", () => ({ DuplikatBanner: () => null }));
vi.mock("@/components/kunden/ImportExportButton", () => ({ ImportExportButton: () => null }));

import LeadVerwaltung from "./LeadVerwaltung";

function oeffne(reiter: RegExp) {
  render(<MemoryRouter><LeadVerwaltung /></MemoryRouter>);
  fireEvent.mouseDown(screen.getByRole("tab", { name: reiter }), { button: 0 });
}
const namenInTabelle = () => screen.getAllByRole("row").slice(1).map((z) => z.textContent || "");

describe("Lead-Verwaltung, zwei Reiter", () => {
  beforeEach(() => {
    rolle.aktiv = "admin";
    setzeSpeicherAttrappe("localStorage");
    setzeSpeicherAttrappe("sessionStorage");
  });

  it("hat genau Leads und Rückläufer, Leads ist vorausgewählt", () => {
    render(<MemoryRouter><LeadVerwaltung /></MemoryRouter>);
    const reiter = screen.getAllByRole("tab").map((t) => t.textContent?.replace(/\d+$/, "").trim());
    expect(reiter).toEqual(["Leads", "Rückläufer"]);
    expect(screen.getByRole("tab", { name: /^Leads/ })).toHaveAttribute("aria-selected", "true");
  });

  it("zeigt unter Leads alle offenen Leads jeder Quelle, ohne Rückläufer", () => {
    render(<MemoryRouter><LeadVerwaltung /></MemoryRouter>);
    const zeilen = namenInTabelle().join(" | ");
    for (const name of ["Zora", "Mia", "Otto", "Hanna"]) expect(zeilen).toContain(name);
    expect(zeilen).not.toContain("Rudi");
    expect(zeilen).not.toContain("Rita");
    expect(screen.queryByText(/in keinen Reiter/)).toBeNull();
  });

  it("zeigt bei Handbuch-Leads den Konfigurator-Stand in der Zeile", () => {
    render(<MemoryRouter><LeadVerwaltung /></MemoryRouter>);
    const zeile = screen.getAllByRole("row").find((z) => z.textContent?.includes("Hanna"))!;
    expect(within(zeile).getByTestId("handbuch-stand")).toBeInTheDocument();
    const andere = screen.getAllByRole("row").find((z) => z.textContent?.includes("Zora"))!;
    expect(within(andere).queryByTestId("handbuch-stand")).toBeNull();
  });

  it("hat einen Quellen-Filter", () => {
    render(<MemoryRouter><LeadVerwaltung /></MemoryRouter>);
    expect(screen.getByRole("combobox", { name: "Quelle filtern" })).toHaveTextContent("Alle");
  });

  it("zeigt unter Rückläufer nur zurückgegebene Leads, aus Meta wie aus dem Handbuch", () => {
    oeffne(/Rückläufer/);
    const zeilen = namenInTabelle().join(" | ");
    expect(zeilen).toContain("Rudi");
    expect(zeilen).toContain("Rita");
    expect(namenInTabelle()).toHaveLength(2);
    const zeileRudi = screen.getAllByRole("row").find((z) => z.textContent?.includes("Rudi"))!;
    const kennzeichen = within(zeileRudi).getByText("Rückläufer", { selector: "div" });
    expect((kennzeichen.nextElementSibling as HTMLElement).textContent).toMatch(/^Zurückgegeben von Partner A/);
  });

  it("die Vertriebsleitung sieht wie bisher nur Handbuch-Leads", () => {
    rolle.aktiv = "vertriebsleiter";
    render(<MemoryRouter><LeadVerwaltung /></MemoryRouter>);
    const zeilen = namenInTabelle().join(" | ");
    expect(zeilen).toContain("Hanna");
    for (const name of ["Zora", "Mia", "Otto"]) expect(zeilen).not.toContain(name);
  });

  it("hat keinen Foto-Upload und keinen Powerdialer mehr", () => {
    render(<MemoryRouter><LeadVerwaltung /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: /Foto-Upload/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Powerdialer/ })).toBeNull();
  });

  it("hat die Auswahl ganz vorne und keine Spalte „Zurückgegeben von“ mehr", () => {
    oeffne(/^Leads/);
    const koepfe = screen.getAllByRole("columnheader").map((th) => th.textContent?.trim());
    expect(koepfe[0]).toBe("Auswahl");
    expect(koepfe[1]).toBe("Eingang");
    expect(koepfe).not.toContain("Zurückgegeben von");
  });

  it("hat rechts keinen Zuweisen-Knopf mehr, „Zuweisen an“ erscheint erst nach dem Anhaken", () => {
    oeffne(/^Leads/);
    for (const zeile of screen.getAllByRole("row").slice(1)) {
      expect(within(zeile).queryByRole("button", { name: /Zuweisen/ })).toBeNull();
    }
    expect(screen.queryByRole("button", { name: "Zuweisen an" })).toBeNull();

    const auswahl = screen.getByRole("checkbox", { name: "Zora Zapier auswählen" });
    fireEvent.click(auswahl);
    expect(auswahl).toHaveAttribute("aria-checked", "true");

    // Einzelauswahl: ein anderer Haken ersetzt den ersten.
    fireEvent.click(screen.getByRole("checkbox", { name: "Mia Meta auswählen" }));
    expect(auswahl).toHaveAttribute("aria-checked", "false");

    fireEvent.click(screen.getByRole("button", { name: "Zuweisen an" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Lead zuweisen")).toBeInTheDocument();
    expect(within(dialog).getByText("Mia Meta")).toBeInTheDocument();
  });

  it("öffnet den Zuweisen-Dialog auch unter Rückläufer, mit dem Rückgabe-Hinweis", () => {
    oeffne(/Rückläufer/);
    fireEvent.click(screen.getByRole("checkbox", { name: "Rudi Rueck auswählen" }));
    fireEvent.click(screen.getByRole("button", { name: "Zuweisen an" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Rudi Rueck")).toBeInTheDocument();
    expect(within(dialog).getByText(/Zuletzt zurückgegeben von/)).toBeInTheDocument();
  });

  it("nimmt den Knopf wieder weg, wenn der Haken entfernt wird", () => {
    oeffne(/^Leads/);
    const auswahl = screen.getByRole("checkbox", { name: "Zora Zapier auswählen" });
    fireEvent.click(auswahl);
    expect(screen.getByRole("button", { name: "Zuweisen an" })).toBeInTheDocument();
    fireEvent.click(auswahl);
    expect(screen.queryByRole("button", { name: "Zuweisen an" })).toBeNull();
  });
});
