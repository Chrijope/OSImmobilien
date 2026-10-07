/**
 * Die Kampagnenkennung im Kundenprofil: sichtbar für Admin, Inhaber,
 * Vertriebsleitung und Marketing, nicht für den Vertriebspartner.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const zeilen: Record<string, unknown>[] = [];
vi.mock("@/lib/dataCache", () => ({
  cacheGet: () => zeilen,
}));

import { KampagnenZeile } from "@/components/kunden/KampagnenZeile";

afterEach(() => {
  cleanup();
  zeilen.length = 0;
});

function mitKontakt(meta: Record<string, unknown>) {
  zeilen.push({ id: "k1", quelle: "Meta Ads: München", meta });
}

describe("Die Kampagne im Kundenprofil", () => {
  it("steht neben der Quelle, mit Anzeige und Anzeigengruppe", () => {
    mitKontakt({
      kampagne: {
        utmSource: "facebook",
        utmMedium: "paid_social",
        utmCampaign: "meta_herbst_steuer_video2",
        utmContent: "video2",
        utmTerm: "Muenchen 30 bis 45",
        erfasstAm: "2026-09-20T10:00:00.000Z",
      },
    });
    render(<KampagnenZeile kontaktId="k1" rolle="admin" />);
    expect(screen.getByText("Kampagne:")).toBeTruthy();
    const feld = screen.getByTestId("kampagnenkennung");
    expect(feld.textContent).toContain("meta_herbst_steuer_video2");
    expect(feld.textContent).toContain("Quelle/Medium: facebook / paid_social");
    expect(feld.textContent).toContain("Anzeige: video2");
    expect(feld.textContent).toContain("Anzeigengruppe/Begriff: Muenchen 30 bis 45");
  });

  it("nennt einen abweichenden letzten Kontakt", () => {
    mitKontakt({ kampagne: { utmCampaign: "Erste", zuletzt: { utmCampaign: "Zweite" } } });
    render(<KampagnenZeile kontaktId="k1" rolle="vertriebsleiter" />);
    expect(screen.getByTestId("kampagnenkennung").textContent).toContain("Zuletzt über: Zweite");
  });

  it("bleibt leer statt zu raten, wenn nur eine Quelle da ist", () => {
    mitKontakt({});
    render(<KampagnenZeile kontaktId="k1" rolle="inhaber" />);
    expect(screen.getByTestId("kampagnenkennung").textContent).toBe("–");
  });

  it("ist nur lesbar, es gibt kein Eingabefeld", () => {
    mitKontakt({ kampagne: { utmCampaign: "Herbst" } });
    const { container } = render(<KampagnenZeile kontaktId="k1" rolle="marketing" />);
    expect(container.querySelector("input, select, textarea, button")).toBeNull();
  });

  it("fehlt für den Vertriebspartner ganz", () => {
    mitKontakt({ kampagne: { utmCampaign: "Herbst" } });
    render(<KampagnenZeile kontaktId="k1" rolle="vertriebspartner" />);
    expect(screen.queryByText("Kampagne:")).toBeNull();
    expect(screen.queryByText("Herbst")).toBeNull();
  });
});
