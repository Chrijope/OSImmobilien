/**
 * Die anonymen öffentlichen Seiten in beiden Sprachen (Plan Kundensprache,
 * Etappe 6): Steuerrechner, Analysetool, Linkseite und die Bausteine der
 * Berater-Mikroseite.
 *
 * Geprüft wird je Seite: Mit `?lang=en` englisch samt Umschalter und
 * `<html lang="en">`, ohne Parameter mit deutschem Browser deutsch wie bisher.
 * Die Mikroseite selbst braucht den angemeldeten Nutzer und die Edge Function,
 * deshalb stehen hier ihre Bausteine im Provider.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import SteuerrechnerPublic from "@/pages/SteuerrechnerPublic";
import AnalysePublic from "@/pages/AnalysePublic";
import LinksPublic from "@/pages/LinksPublic";
import AppleHeroSection from "@/components/landing/apple/AppleHeroSection";
import FloatingBeraterBadge from "@/components/landing/FloatingBeraterBadge";
import { SeitenSpracheProvider } from "@/components/SeitenSprache";

beforeEach(() => {
  const werte = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => werte.get(k) ?? null,
    setItem: (k: string, v: string) => void werte.set(k, String(v)),
    removeItem: (k: string) => void werte.delete(k),
  });
  // Kein Netz: Ereignisprotokolle der Rechner laufen ins Leere.
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }) as Response));
  vi.spyOn(window.navigator, "languages", "get").mockReturnValue(["de-DE"]);
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  // jsdom kennt beide Beobachter nicht, die Seiten brauchen sie nur für Bewegung.
  const Beobachter = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  };
  if (!("IntersectionObserver" in window)) vi.stubGlobal("IntersectionObserver", Beobachter);
  if (!("ResizeObserver" in window)) vi.stubGlobal("ResizeObserver", Beobachter);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.lang = "de";
});

async function seite(pfad: string, adresse: string, inhalt: ReactNode) {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[adresse]}>
        <Routes>
          <Route path={pfad} element={inhalt} />
        </Routes>
      </MemoryRouter>,
    );
  });
}

describe("Steuerrechner öffentlich", () => {
  it("englisch mit Hinweis auf deutsches Steuerrecht und Verweis auf den EXPATS Calculator", async () => {
    await seite("/steuer", "/steuer?lang=en", <SteuerrechnerPublic />);
    expect(screen.getByText("Free tax calculator")).toBeInTheDocument();
    expect(screen.getByText(/This calculator is based on German tax law\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /EXPATS Calculator/ })).toHaveAttribute("href", expect.stringContaining("/expats-calculator"));
    expect(screen.getByTestId("sprachwechsel")).toHaveTextContent("EN");
    expect(document.documentElement.lang).toBe("en");
  });

  it("deutsch ohne Parameter, ohne den Hinweis", async () => {
    await seite("/steuer", "/steuer", <SteuerrechnerPublic />);
    expect(screen.getByText("Kostenloser Steuerrechner")).toBeInTheDocument();
    expect(screen.queryByText(/German tax law/)).toBeNull();
    expect(document.documentElement.lang).toBe("de");
  });
});

describe("Analysetool öffentlich", () => {
  it("englisch mit ?lang=en", async () => {
    await seite("/analyse", "/analyse?lang=en", <AnalysePublic />);
    expect(screen.getAllByText(/investment analysis/i).length).toBeGreaterThan(0);
    expect(screen.getByTestId("sprachwechsel")).toHaveTextContent("EN");
  });

  it("englisch bei klar englischem Browser ohne Parameter", async () => {
    vi.spyOn(window.navigator, "languages", "get").mockReturnValue(["en-GB", "de"]);
    await seite("/analyse", "/analyse", <AnalysePublic />);
    expect(screen.getByTestId("sprachwechsel")).toHaveTextContent("EN");
  });

  it("deutsch ohne Parameter mit deutschem Browser", async () => {
    await seite("/analyse", "/analyse", <AnalysePublic />);
    expect(screen.getByTestId("sprachwechsel")).toHaveTextContent("DE");
    expect(screen.queryAllByText(/investment analysis/i)).toHaveLength(0);
  });
});

describe("Linkseite", () => {
  it("englisch: Titel übersetzt, der Steuerrechner öffnet englisch, Impressum mit lang=en", async () => {
    await seite("/links", "/links?lang=en", <LinksPublic />);
    expect(screen.getByText("Property as an investment")).toBeInTheDocument();
    const steuer = screen.getByRole("link", { name: /Tax calculator/ });
    expect(steuer.getAttribute("href")).toMatch(/^\/steuer\?/);
    expect(steuer.getAttribute("href")).toContain("lang=en");
    expect(steuer.getAttribute("href")).toContain("utm_source=");
    expect(screen.getByRole("link", { name: "Legal notice" })).toHaveAttribute("href", "/impressum?lang=en");
    expect(screen.queryByText("in English")).toBeNull();
  });

  it("deutsch wie bisher", async () => {
    await seite("/links", "/links", <LinksPublic />);
    expect(screen.getByText("Immobilie als Kapitalanlage")).toBeInTheDocument();
    const steuer = screen.getByRole("link", { name: /Steuerrechner/ });
    expect(steuer.getAttribute("href")).not.toContain("lang=");
    expect(screen.getByText("in English")).toBeInTheDocument();
  });
});

describe("Berater-Mikroseite, Bausteine", () => {
  const berater = { name: "Maria Muster", position: "Immobilienberaterin", telefon: "+49 911 123456", email: "maria@example.com" };

  it("englisch im Provider", async () => {
    await seite(
      "/vp/:slug",
      "/vp/maria?lang=en",
      <SeitenSpracheProvider>
        <AppleHeroSection berater={berater} onOpenFunnel={() => {}} />
        <FloatingBeraterBadge berater={berater} onContactClick={() => {}} />
      </SeitenSpracheProvider>,
    );
    expect(screen.getByRole("link", { name: "Calculate my tax relief" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Book a free initial meeting" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Your contact person" })).toBeInTheDocument();
  });

  it("ohne Provider deutsch, so wie in Vorschau und Beratungspräsentation", async () => {
    await seite("/vp/:slug", "/vp/maria?lang=en", <AppleHeroSection berater={berater} onOpenFunnel={() => {}} />);
    expect(screen.getByRole("link", { name: "Meine Steuerersparnis berechnen" })).toBeInTheDocument();
  });
});
