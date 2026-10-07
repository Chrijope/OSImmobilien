import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Datenschutz from "@/pages/Datenschutz";
import { CookieBanner } from "@/components/cookie/CookieBanner";
import { setzeSpeicherAttrappe } from "@/test/speicherAttrappe";
import { _einwilligungVergessen, speichereCookieEinwilligung } from "@/lib/cookieEinwilligung";

function zeige(pfad: string) {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <Datenschutz />
    </MemoryRouter>,
  );
}

describe("Datenschutzseite", () => {
  it("zeigt ein Inhaltsverzeichnis mit Sprungmarken zu jedem Abschnitt", () => {
    const { container } = zeige("/datenschutz");
    const inhalt = screen.getByRole("navigation", { name: "Inhalt" });
    const links = inhalt.querySelectorAll("a[href^='#']");
    expect(links.length).toBeGreaterThan(20);
    for (const link of links) {
      const ziel = link.getAttribute("href")!.slice(1);
      expect(container.querySelector(`[id="${ziel}"]`)).not.toBeNull();
    }
  });

  it("zeigt den Stand und öffnet die Cookie-Einstellungen aus dem Abschnitt Cookies", () => {
    zeige("/datenschutz");
    expect(screen.getByText("Stand: September 2026")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "3.1 Hosting und Datenbank" })).toBeInTheDocument();
    const cookies = document.getElementById("cookies")!;
    expect(cookies.querySelector("button")?.textContent).toBe("Cookie-Einstellungen");
  });

  it("zeigt keine Platzhalter und verlinkt Mailadressen", () => {
    zeige("/datenschutz");
    expect(document.querySelectorAll("mark").length).toBe(0);
    expect(document.querySelector("a[href='mailto:os@os-immobilien.com']")).not.toBeNull();
  });

  it("zeigt mit ?lang=en die englische Fassung mit denselben Sprungmarken", () => {
    zeige("/datenschutz?lang=en");
    expect(screen.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Contents" })).toBeInTheDocument();
    expect(document.getElementById("cookies")?.querySelector("button")?.textContent).toBe("Cookie settings");
  });
});

describe("Cookie-Einstellungen aus der Datenschutzseite (27.09.2026, Punkt 14)", () => {
  afterEach(() => {
    cleanup();
    _einwilligungVergessen();
    document.documentElement.lang = "de";
  });

  function mitBanner(pfad: string) {
    setzeSpeicherAttrappe();
    setzeSpeicherAttrappe("sessionStorage");
    _einwilligungVergessen();
    // Eine Wahl liegt vor, damit der Banner zu ist und erst der Link ihn öffnet.
    speichereCookieEinwilligung({ statistik: false, marketing: false });
    return render(
      <MemoryRouter initialEntries={[pfad]}>
        <Datenschutz />
        <CookieBanner />
      </MemoryRouter>,
    );
  }

  it("öffnet auf der englischen Seite die Einstellungen auf Englisch", () => {
    mitBanner("/datenschutz?lang=en");
    expect(document.documentElement.lang).toBe("en");
    fireEvent.click(within(document.getElementById("cookies")!).getByRole("button", { name: "Cookie settings" }));
    expect(screen.getByRole("button", { name: "Save selection" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Auswahl speichern" })).toBeNull();
  });

  it("öffnet auf der deutschen Seite die Einstellungen auf Deutsch", () => {
    mitBanner("/datenschutz");
    expect(document.documentElement.lang).toBe("de");
    fireEvent.click(within(document.getElementById("cookies")!).getByRole("button", { name: "Cookie-Einstellungen" }));
    expect(screen.getByRole("button", { name: "Auswahl speichern" })).toBeInTheDocument();
  });
});
