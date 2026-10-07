import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  beurteileRahmen,
  einbettungErlaubt,
  istErlaubterEinbetter,
  istVorschauHost,
  type RahmenLage,
} from "@/lib/einbettungsschutz";
import { EinbettungsHinweis } from "@/components/EinbettungsHinweis";

const PORTAL = "https://osimmobilien.netlify.app";
const VORSCHAU = "https://id-preview--cd62347b-9ef0-43fe-a989-4d4a53a8c4ef.lovable.app";

function lage(teil: Partial<RahmenLage>): RahmenLage {
  return { eigeneHerkunft: PORTAL, imRahmen: true, vorfahren: null, elternHerkunft: null, referrer: "", ...teil };
}

describe("Einbettungsschutz", () => {
  it("eigenes Fenster: Portal erscheint normal", () => {
    expect(beurteileRahmen(lage({ imRahmen: false })).erlaubt).toBe(true);
  });

  it("fremder Rahmen: Hinweis statt Portal", () => {
    const urteil = beurteileRahmen(lage({ vorfahren: ["https://boese.example"] }));
    expect(urteil).toEqual({ erlaubt: false, einbetter: "https://boese.example" });
  });

  it("fremder Rahmen ohne ancestorOrigins wird über den Referrer erkannt (Firefox)", () => {
    expect(beurteileRahmen(lage({ referrer: "https://boese.example/seite" })).erlaubt).toBe(false);
  });

  it("fremder Rahmen, der den Referrer unterdrückt, bleibt auf der echten Adresse gesperrt", () => {
    expect(beurteileRahmen(lage({})).erlaubt).toBe(false);
  });

  it("Rahmen mit sandbox (Herkunft null) ist fremd", () => {
    expect(beurteileRahmen(lage({ vorfahren: ["null"] })).erlaubt).toBe(false);
  });

  it("Lovable-Vorschau im Editor: Portal erscheint normal", () => {
    const vorschau = lage({ eigeneHerkunft: VORSCHAU, vorfahren: ["https://lovable.dev"] });
    expect(beurteileRahmen(vorschau).erlaubt).toBe(true);
    // Auch ohne jede Angabe zum Einbetter, etwa in Firefox mit unterdrücktem Referrer.
    expect(beurteileRahmen(lage({ eigeneHerkunft: VORSCHAU })).erlaubt).toBe(true);
  });

  it("eigene Domain im Rahmen, etwa die Präsentation im Trainingscockpit: normal", () => {
    expect(beurteileRahmen(lage({ vorfahren: [PORTAL] })).erlaubt).toBe(true);
    expect(beurteileRahmen(lage({ elternHerkunft: PORTAL })).erlaubt).toBe(true);
  });

  it("eigene Seite im Rahmen, die selbst in einer fremden Seite steckt: Hinweis", () => {
    expect(beurteileRahmen(lage({ vorfahren: [PORTAL, "https://boese.example"] })).erlaubt).toBe(false);
  });

  it("die Website osimmobilien.netlify.app darf einbetten", () => {
    expect(beurteileRahmen(lage({ vorfahren: ["https://osimmobilien.netlify.app"] })).erlaubt).toBe(true);
    expect(beurteileRahmen(lage({ referrer: "https://osimmobilien.netlify.app/steuer" })).erlaubt).toBe(true);
  });

  it("fremde Lovable-Apps dürfen das Live-Portal nicht einbetten, nur die Vorschau", () => {
    expect(istErlaubterEinbetter("https://fremd.lovable.app", PORTAL)).toBe(false);
    expect(istErlaubterEinbetter("https://x.lovableproject.com", PORTAL)).toBe(false);
    expect(istErlaubterEinbetter("https://x.lovableproject.com", VORSCHAU)).toBe(true);
  });

  it("verlangt https und genaue Hosts", () => {
    expect(istErlaubterEinbetter("http://lovable.dev", PORTAL)).toBe(false);
    expect(istErlaubterEinbetter("https://lovable.dev.boese.example", PORTAL)).toBe(false);
    expect(istErlaubterEinbetter("https://boesemore.immo", PORTAL)).toBe(false);
    expect(istErlaubterEinbetter("https://app.lovable.dev", PORTAL)).toBe(true);
  });

  it("erkennt Vorschauadressen, aber nicht das veröffentlichte Portal", () => {
    expect(istVorschauHost(new URL(VORSCHAU).hostname)).toBe(true);
    expect(istVorschauHost("preview--moreimmo.lovable.app")).toBe(true);
    expect(istVorschauHost("moreimmo.lovable.app")).toBe(false);
    expect(istVorschauHost("osimmobilien.netlify.app")).toBe(false);
  });
});

describe("einbettungErlaubt liest das echte Fenster", () => {
  it("im Testfenster (oberstes Fenster) ist alles erlaubt", () => {
    expect(einbettungErlaubt(window)).toBe(true);
  });

  it("in einem fremden Rahmen, dessen Eltern nicht lesbar sind, nicht", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const oben = {} as Window;
    const fenster = {
      top: oben,
      self: {} as Window,
      parent: {
        get location(): Location {
          throw new DOMException("Blocked a frame with origin", "SecurityError");
        },
      },
      location: { origin: PORTAL, ancestorOrigins: ["https://boese.example"] },
      document: { referrer: "https://boese.example/" },
    } as unknown as Window;
    expect(einbettungErlaubt(fenster)).toBe(false);
  });
});

describe("Hinweisseite", () => {
  it("zeigt den Link in ein eigenes Fenster, deutsch und englisch", () => {
    render(<EinbettungsHinweis adresse="https://osimmobilien.netlify.app/login" />);
    const link = screen.getByRole("link", { name: /In neuem Fenster öffnen/ });
    expect(link).toHaveAttribute("href", "https://osimmobilien.netlify.app/login");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: "Open in new window" })).toBeInTheDocument();
    expect(screen.getAllByText("osimmobilien.netlify.app").length).toBeGreaterThan(0);
  });

  it("enthält keine Gedankenstriche", () => {
    const { container } = render(<EinbettungsHinweis adresse="https://osimmobilien.netlify.app/" />);
    expect(container.textContent).not.toMatch(/[–—]/);
  });
});
