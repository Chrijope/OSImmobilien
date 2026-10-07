import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Die Handy-Unterschrift in der Kundensprache.
 *
 * Die Seite kennt den Kunden nicht. Die Sprache reist deshalb im QR-Link mit
 * (`lang=en`), die Beschriftung übersetzt schon das Formular. Ohne `lang`
 * bleibt alles deutsch wie bisher.
 */

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { channel: () => ({ subscribe: () => ({}), send: async () => ({}) }), removeChannel: async () => {} },
}));

import SaMobileSign from "./SaMobileSign";

function zeige(adresse: string) {
  return render(
    <MemoryRouter initialEntries={[adresse]}>
      <SaMobileSign />
    </MemoryRouter>,
  );
}

describe("Handy-Unterschrift", () => {
  beforeEach(() => {
    cleanup();
    document.title = "";
    document.documentElement.lang = "de";
  });

  it("mit lang=en englisch, samt Titel und Seitensprache", () => {
    zeige(`/sa-mobile-sign?ch=sa-sig-abc-p1&label=${encodeURIComponent("Signature Person 1")}&lang=en`);
    expect(screen.getByText("Signature Person 1")).toBeTruthy();
    expect(screen.getByText(/Please sign below with your finger/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Transfer signature/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Clear/ })).toBeTruthy();
    expect(document.title).toBe("Signature | OS Immobilien");
    expect(document.documentElement.lang).toBe("en");
  });

  it("ohne lang deutsch wie bisher", () => {
    zeige(`/sa-mobile-sign?ch=sa-sig-abc-p1&label=${encodeURIComponent("Unterschrift Person 1")}`);
    expect(screen.getByText("Unterschrift Person 1")).toBeTruthy();
    expect(screen.getByText(/Unterschreiben Sie unten mit dem Finger/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Unterschrift übertragen/ })).toBeTruthy();
    expect(document.title).toBe("Unterschrift – OS Immobilien");
  });

  it("unbekannte Sprache fällt auf Deutsch zurück, fehlende Beschriftung wird übersetzt", () => {
    zeige("/sa-mobile-sign?ch=x&lang=fr");
    expect(screen.getByText("Unterschrift")).toBeTruthy();
    cleanup();
    zeige("/sa-mobile-sign?ch=x&lang=en");
    expect(screen.getByText("Signature")).toBeTruthy();
  });

  it("ungültiger Link auf Englisch", () => {
    zeige("/sa-mobile-sign?lang=en");
    expect(screen.getByText("Invalid link.")).toBeTruthy();
  });
});
