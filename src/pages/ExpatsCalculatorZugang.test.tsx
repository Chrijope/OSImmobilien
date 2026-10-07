/**
 * Waechter fuer den Zugang zum EXPATS Calculator.
 *
 * Die Seite ist seit dem 17.09.2026 die Zielseite bezahlter Anzeigen. Damit
 * haengen drei Dinge daran, und alle drei sind stille Fehler, wenn sie kippen:
 *
 *   1  Die neue Adresse `/expats-calculator` muss OHNE Anmeldung erreichbar
 *      sein. Rutschte die Route in `App.tsx` versehentlich wieder unter
 *      `<Route element={<AppShell />}>`, landete jeder Besucher aus der
 *      Anzeige auf der Anmeldeseite. Die Anzeige liefe weiter, das Geld waere
 *      weg, und niemand bekaeme einen Fehler zu sehen.
 *   2  Die alte Adresse `/steuerrechner-kompakt` muss weiterleiten. Sie stand
 *      in Tooltips, Notizen und moeglicherweise in schon gesetzten Links.
 *   3  Der Lead darf weiterhin ohne Berater rausgehen, sonst verschwindet er
 *      aus der Lead-Verwaltung.
 *
 * Geprueft wird der Wortlaut von `App.tsx`, nicht ein nachgebauter Router:
 * Ein nachgebauter Router wuerde nur die eigene Nachbildung bestaetigen. Das
 * ist dasselbe Vorgehen wie im Waechter `routenTabellen.test.ts`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";

// Der Supabase-Client wird ueber `sidebarPermissions` mitgezogen und wuerde im
// Test einen Realtime-Kanal oeffnen. Fuer die reine Regellogik reicht eine
// Attrappe, so wie in `sidebarPermissions.test.ts`.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: async () => ({ data: null, error: new Error("offline") }) }),
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
  },
}));

const { isUrlAllowedForRole, istRouteGesperrt } = await import("@/lib/sidebarPermissions");
const { default: ExpatsRechner } = await import("@/pages/ExpatsRechner");
const { sendeExpatsLead } = await import("@/lib/expatsRechnerLead");
const { berechneExpats } = await import("@/lib/expatsRechner");

const APP_TSX = readFileSync(resolve(__dirname, "../App.tsx"), "utf8");
// Die Eintraege der Seitenleiste stehen seit dem 28.09.2026 in `sidebarNavigation.ts`.
const SIDEBAR_TSX = readFileSync(resolve(__dirname, "../lib/sidebarNavigation.ts"), "utf8");

/** Alles, was vor dem Anmeldeschutz steht. Danach faengt `AppShell` an. */
const OEFFENTLICHER_TEIL = APP_TSX.split("<Route element={<AppShell />}>")[0];

describe("Die neue Adresse ist ohne Anmeldung erreichbar", () => {
  it("steht in App.tsx vor dem Anmeldeschutz, dort wo auch /steuer steht", () => {
    // Der Anmeldeschutz muss ueberhaupt gefunden worden sein, sonst waere der
    // Test immer gruen.
    expect(APP_TSX).toContain("<Route element={<AppShell />}>");
    expect(OEFFENTLICHER_TEIL).toContain('<Route path="/steuer" element={<SteuerrechnerPublic />} />');
    expect(OEFFENTLICHER_TEIL).toContain('<Route path="/expats-calculator" element={<ExpatsRechner />} />');
  });

  it("steht nicht mehr im geschuetzten Bereich", () => {
    const geschuetzterTeil = APP_TSX.split("<Route element={<AppShell />}>")[1] ?? "";
    expect(geschuetzterTeil).not.toContain("ExpatsRechner");
    expect(geschuetzterTeil).not.toContain("expats-calculator");
  });

  it("ist fuer keine Rolle gesperrt, auch nicht ueber NUR_ADMIN_ROUTEN", () => {
    const rollen = [
      "admin",
      "inhaber",
      "vertriebspartner",
      "vertriebsleiter",
      "backoffice",
      "hausverwaltung",
      "hr",
    ] as const;
    for (const rolle of rollen) {
      expect(istRouteGesperrt("/expats-calculator", rolle), rolle).toBe(false);
    }
    // Der Riegel darf auch die alte Adresse nicht mehr sperren, sonst liefe
    // die Weiterleitung fuer angemeldete Nicht-Admins ins Leere.
    expect(istRouteGesperrt("/steuerrechner-kompakt", "vertriebspartner")).toBe(false);
  });
});

describe("Der Menuepunkt bleibt trotzdem den Admins vorbehalten", () => {
  it("traegt in der Seitenleiste die neue Adresse mit adminOnly und Abzeichen", () => {
    const zeile = SIDEBAR_TSX.split("\n").find((z) => z.includes('url: "/expats-calculator"'));
    expect(zeile, "Eintrag EXPATS Calculator in AppSidebar.tsx").toBeDefined();
    expect(zeile).toContain("adminOnly: true");
    expect(zeile).toContain("adminBadge: true");
  });

  it("nennt die alte Adresse nirgends mehr als Ziel", () => {
    expect(SIDEBAR_TSX).not.toContain('url: "/steuerrechner-kompakt"');
  });

  it("sichtbarer Menuepunkt und erreichbare Adresse sind zwei verschiedene Dinge", () => {
    // Die Adresse ist offen. Dass ein Vertriebspartner sie nach der
    // Rollenliste nicht "darf", blendet nur den Menuepunkt aus und hat auf
    // den Aufruf der oeffentlichen Seite keine Wirkung mehr.
    expect(istRouteGesperrt("/expats-calculator", "vertriebspartner")).toBe(false);
    expect(isUrlAllowedForRole("/expats-calculator", "admin")).toBe(true);
  });
});

describe("Die alte Adresse leitet weiter", () => {
  it("zeigt in App.tsx eine Weiterleitung statt der Seite", () => {
    const ohneUmbrueche = APP_TSX.replace(/\s+/g, " ");
    expect(ohneUmbrueche).toContain(
      '<Route path="/steuerrechner-kompakt" element={<Navigate to="/expats-calculator" replace />} />',
    );
  });
});

describe("Die Seite selbst braucht keine Anmeldung", () => {
  it("laesst sich ohne Nutzerkontext und ohne Router zeichnen", () => {
    render(<ExpatsRechner />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("zeigt Impressum und Datenschutz, wie es eine oeffentliche Seite muss", () => {
    render(<ExpatsRechner />);
    // Seit Etappe 6 (Plan Kundensprache) mit `?lang=en`, die Seite ist englisch.
    expect(screen.getByRole("link", { name: /Legal notice/i })).toHaveAttribute("href", "/impressum?lang=en");
    const datenschutz = screen.getAllByRole("link", { name: /Privacy policy/i });
    expect(datenschutz.length).toBeGreaterThan(0);
    expect(datenschutz[0]).toHaveAttribute("href", "/datenschutz?lang=en");
  });

  it("traegt den internen Warnkasten nicht mehr", () => {
    render(<ExpatsRechner />);
    expect(screen.queryByText(/Admin only/i)).toBeNull();
  });

  it("setzt einen eigenen Titel im Browsertab statt 'OS Immobilien CRM'", () => {
    render(<ExpatsRechner />);
    expect(document.title).toContain("EXPATS Calculator");
    expect(document.title).not.toContain("CRM");
  });

  it("zeigt die Angaben der Vorlage statt der gestrichelten Platzhalter", () => {
    render(<ExpatsRechner />);
    expect(screen.getByText("1,000+ investors")).toBeInTheDocument();
    expect(screen.getByText("1,000+ expats already use this with us")).toBeInTheDocument();
    expect(screen.queryByText(/placeholder/i)).toBeNull();
  });
});

describe("Der Lead geht weiterhin ohne Berater raus", () => {
  /* Die ausfuehrlichen Pruefungen dazu stehen in `expatsRechnerLead.test.ts`.
     Hier steht nur die eine Zusage, die durch die Oeffnung der Seite haette
     kippen koennen: Ein angemeldeter Admin, der die Seite oeffnet, darf den
     Lead nicht auf sich selbst ziehen. */
  let letzterAufruf: Record<string, unknown> | null = null;

  beforeEach(() => {
    letzterAufruf = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        letzterAufruf = JSON.parse(init.body);
        return { ok: true, json: async () => ({ kontaktId: "k1" }) } as Response;
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("schickt weder Beraterkennung noch Beraternamen mit", async () => {
    const eingabe = { eigenkapital: 50000, jahresbrutto: 100000, verheiratet: false };
    await sendeExpatsLead(
      { vorname: "Jane", nachname: "Doe", email: "jane@example.com", telefon: "+49 170 1234567", einwilligung: true },
      eingabe,
      berechneExpats(eingabe),
    );
    expect(letzterAufruf?.beraterUserId).toBe("");
    expect(letzterAufruf?.beraterName).toBe("");
  });
});
