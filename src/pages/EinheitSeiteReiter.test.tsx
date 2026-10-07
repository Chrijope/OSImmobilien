import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";
import { FINANZEN_ERKLAERUNG } from "@/components/objektseite/EinheitFinanzen";
import { INVESTMENTKALKULATION_ERKLAERUNG } from "@/components/objektseite/EinheitInvestmentrechner";

/**
 * Die Reiter „Finanzen" und „Investmentkalkulation" tragen seit dem
 * 23.09.2026 ein Info-Symbol mit einem Satz Erklärung. Christian: „Finanzen"
 * ist die allgemeine Rechnung für jeden, die Investmentkalkulation die
 * genauere für einen bestimmten Kunden. Das soll man sehen, bevor man klickt.
 *
 * Das Aufklappen des Tooltips selbst wird hier nicht geprüft: Ein geöffneter
 * Radix-Tooltip hält jsdom mehrere Sekunden fest, im Browser ist er derselbe
 * wie beim `InfoSymbol`. Geprüft wird, dass Symbol und Satz am richtigen
 * Reiter hängen.
 */

const stand = vi.hoisted(() => ({ liste: {} as Record<string, unknown>, rolle: "admin" }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: async () => ({ data: null, error: new Error("offline") }) }),
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
    removeChannel: () => undefined,
  },
}));
vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { role: stand.rolle, name: "Test", email: "" }, authUser: null }),
}));
vi.mock("@/lib/objektTexteKi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/objektTexteKi")>()),
  brauchtObjektTexte: () => false,
  starteObjektTexteBeiBedarf: async () => undefined,
}));
vi.mock("@/components/objektseite/ObjektseiteZugang", () => ({
  ObjektseiteZugang: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/useLiveData", () => ({ useLiveVersion: () => 0 }));
vi.mock("@/hooks/useCacheReady", () => ({ useCacheReady: () => true }));
vi.mock("@/components/objektseite/Galerie", () => ({ Galerie: () => <div>Galerie</div> }));
vi.mock("@/lib/objekteStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/objekteStore")>()),
  getObjektById: (id: string) => stand.liste[id],
}));

const { default: EinheitSeite } = await import("./EinheitSeite");

const wohnung: ObjektWohnung = {
  id: "w1", weNr: "WE 1", etage: "EG", lage: "", groesse: 50, zimmer: 2, mieteGesamt: 600, vkGesamt: 200000,
  qmPreis: 0, rendite: 0, vermietet: true, status: "frei",
};

stand.liste = {
  o1: {
    id: "o1", titel: "Haus o1", adresse: "Teststraße 1", plz: "80331", ort: "München", beschreibung: "", highlights: [],
    bildUrl: "", bilder: [], dokumente: [], wohnungen: [wohnung], videoUrl: "", videoSichtbar: false, badge: "",
    groesseVon: 0, groesseBis: 0, preisVon: 0, preisBis: 0, renditeVon: 0, renditeBis: 0, sichtbar: true,
    erstellt_am: "2026-01-01", meta: {},
  } as unknown as ObjektData,
};

function zeigeSeite() {
  return render(
    <MemoryRouter initialEntries={["/objekte/o1/einheiten/w1"]}>
      <Routes>
        <Route path="/objekte/:id/einheiten/:weId" element={<EinheitSeite />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Reiter-Beschriftungen der Einheitsseite", () => {
  it("tragen an Finanzen und Investmentkalkulation je ein Info-Symbol, die Namen bleiben", () => {
    zeigeSeite();
    const finanzen = screen.getByRole("tab", { name: "Finanzen" });
    const kalkulation = screen.getByRole("tab", { name: "Investmentkalkulation" });
    expect(finanzen.querySelector("[data-testid=reiter-info]")).not.toBeNull();
    expect(kalkulation.querySelector("[data-testid=reiter-info]")).not.toBeNull();
    // Das Symbol ist Auslöser eines Tooltips (Radix setzt den Zustand), anfangs zu.
    expect(finanzen.querySelector("[data-testid=reiter-info]")).toHaveAttribute("data-state", "closed");
    // Kein Knopf im Reiterknopf, das wäre ungültiges HTML.
    expect(finanzen.querySelector("button")).toBeNull();
    expect(kalkulation.querySelector("button")).toBeNull();
    // Übersicht und Dokumente brauchen keine Erklärung.
    expect(screen.getByRole("tab", { name: "Übersicht" }).querySelector("[data-testid=reiter-info]")).toBeNull();
  });

  it("nennt in den Sätzen den Unterschied der beiden Reiter, ohne Gedankenstriche", () => {
    expect(FINANZEN_ERKLAERUNG).toMatch(/Musterrechnung.*Standardannahmen/);
    expect(INVESTMENTKALKULATION_ERKLAERUNG).toMatch(/bestimmten Kunden.*Selbstauskunft/);
    expect(INVESTMENTKALKULATION_ERKLAERUNG).toContain("Berechnungs-PDF");
    expect(`${FINANZEN_ERKLAERUNG}${INVESTMENTKALKULATION_ERKLAERUNG}`).not.toMatch(/[–—]/);
  });

  // Der Vertriebspartner hat den Reiter seit dem 05.10.2026, das Backoffice nicht.
  it("zeigt ohne Recht auf die Kalkulation nur den Reiter Finanzen mit Symbol", () => {
    stand.rolle = "backoffice";
    try {
      zeigeSeite();
      expect(screen.queryByRole("tab", { name: "Investmentkalkulation" })).not.toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Finanzen" }).querySelector("[data-testid=reiter-info]")).not.toBeNull();
    } finally {
      stand.rolle = "admin";
    }
  });
});

describe("Einheitsseite auf dem Handy (Handyprüfung vom 23.09.2026)", () => {
  /*
   * jsdom rechnet kein Layout, deshalb wachen hier die Klassen über zwei
   * Befunde, die auf dem Handy die ganze Seite seitlich verschoben haben.
   */
  it("gibt dem Übersichtsraster eine feste Spalte und kürzt den langen Rückweg", () => {
    zeigeSeite();
    // Ohne grid-cols-1 bemaß sich das Raster an der breitesten Tabelle.
    const uebersicht = screen.getByRole("tabpanel");
    expect(uebersicht.firstElementChild?.className).toMatch(/(^|\s)grid-cols-1(\s|$)/);
    // Der Rückweg mit dem Objekttitel bricht nicht über den Rand.
    const zurueck = screen.getByRole("button", { name: /Zurück zu/ });
    expect(zurueck.className).toContain("max-w-full");
    expect(zurueck.querySelector(".truncate")).not.toBeNull();
  });

  it("zeigt die sechs Reiter auf dem Handy zu zweit, ab sm zu dritt, ab lg nebeneinander", () => {
    // Bei 768 px steht die Seitenleiste daneben, dort passte „Investmentkalkulation“ nicht in ein Viertel.
    // Seit dem 28.09.2026 kommt für Admin und Inhaber der Reiter „MORE Lotse“ dazu, seit dem 01.10.2026 die Karte.
    zeigeSeite();
    const leiste = screen.getByRole("tablist");
    expect(leiste.className).toContain("grid-cols-2");
    expect(leiste.className).toContain("sm:grid-cols-3");
    expect(leiste.className).toContain("lg:grid-cols-[repeat(6,auto)]");
    expect(leiste.className).toContain("h-auto");
  });

  it("hält jeden Reiter in seiner Zelle, damit der aktive Kasten kein Info-Symbol überdeckt", () => {
    // Befund vom 28.09.2026: Mit nowrap lief „Investmentkalkulation“ aus der Zelle, der aktive Lotse lag über dem Symbol.
    zeigeSeite();
    expect(screen.getByRole("tablist").className).toContain("gap-1");
    for (const reiter of screen.getAllByRole("tab")) {
      expect(reiter.className).toContain("whitespace-normal");
      expect(reiter.className).not.toContain("whitespace-nowrap");
      expect(reiter.className).toContain("[overflow-wrap:anywhere]");
    }
  });
});

describe("Reiter Karte (seit dem 01.10.2026)", () => {
  it("zeigt die Karte im eigenen Reiter oben statt unter der Galerie", async () => {
    zeigeSeite();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Karte" }));
    expect(await screen.findByTestId("umgebungskarte-ohne-lage")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Fotos/ })).not.toBeInTheDocument();
  });

  it("steht auch ohne Recht auf die Kalkulation vor dem Lotsen", () => {
    stand.rolle = "vertriebspartner";
    try {
      zeigeSeite();
      expect(screen.getAllByRole("tab").map((t) => t.textContent?.trim()).slice(-2)).toEqual(["Karte", "MORE Lotse KI"]);
    } finally {
      stand.rolle = "admin";
    }
  });
});

describe("Reiter MORE Lotse (seit dem 28.09.2026)", () => {
  it("steht nach Investmentkalkulation und Karte, mit KI-Abzeichen", () => {
    zeigeSeite();
    const namen = screen.getAllByRole("tab").map((t) => t.textContent?.trim());
    // Die Karte sitzt seit dem 01.10.2026 oben zwischen Investmentkalkulation und Lotse, ein Reiter „Fotos“ fehlt bewusst.
    expect(namen).toEqual(["Übersicht", "Dokumente", "Finanzen", "Investmentkalkulation", "Karte", "MORE Lotse KI"]);
  });

  it("richtet sich nach der aktiven Rolle", () => {
    for (const [rolle, sichtbar] of [["inhaber", true], ["backoffice", true], ["hr", false], ["tippgeber", false], ["kunde", false]] as const) {
      stand.rolle = rolle;
      try {
        const { unmount } = zeigeSeite();
        expect(screen.queryByTestId("reiter-lotse") !== null).toBe(sichtbar);
        unmount();
      } finally {
        stand.rolle = "admin";
      }
    }
  });
});
