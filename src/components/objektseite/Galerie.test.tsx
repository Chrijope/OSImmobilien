import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { Galerie } from "./Galerie";
import type { ObjektBild } from "@/lib/objekteStore";

vi.mock("@/lib/objekteStore", async (echt) => ({
  ...(await echt<Record<string, unknown>>()),
  setObjektTitelbild: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/components/maps/UmgebungsKarte", () => ({ UmgebungsKarte: () => <div>Karte</div> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// Die Dokumentvorschau holt eine befristete Adresse. Im Test kommt sie ohne Netz.
vi.mock("@/lib/storage", async (echt) => ({
  ...(await echt<Record<string, unknown>>()),
  resolveUnterlagenUrl: vi.fn().mockResolvedValue("https://x.supabase.co/storage/v1/object/sign/objekt-dokumente/t.pdf?token=t"),
}));

const ADRESSE = "Musterweg 1, 12345 Musterstadt";

function bilder(anzahl: number): ObjektBild[] {
  return Array.from({ length: anzahl }, (_, i) => ({
    id: `b${i + 1}`,
    url: `https://beispiel.test/bild-${i + 1}.jpg`,
    alt: "",
    reihenfolge: i + 1,
  }));
}

/** Der Alternativtext des Bildes, das gerade im Wechselfeld steht. */
function wechselfeldBild(): HTMLImageElement | undefined {
  const knopf = screen.getByRole("button", { name: /Fotos ansehen/ });
  return Array.from(knopf.querySelectorAll("img")).find((b) => b.getAttribute("alt")) as HTMLImageElement | undefined;
}

/** Stellt „Bewegung reduzieren" ein oder aus. */
function bewegungReduzieren(an: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: an && query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    }),
  });
}

beforeEach(() => {
  bewegungReduzieren(false);
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Galerie", () => {
  it("zeigt fünf Felder und die Zahl der übrigen Bilder", () => {
    render(<Galerie bilder={bilder(8)} adresse={ADRESSE} titel="Musterhaus" />);
    // Ein großes Feld, drei feste kleine, ein Wechselfeld.
    expect(screen.getAllByRole("button", { name: /Vollbild öffnen/ })).toHaveLength(4);
    // Acht Bilder, fünf sichtbar, also drei weitere.
    expect(screen.getByRole("button", { name: /3 weitere sind gerade nicht zu sehen/ })).toBeInTheDocument();
  });

  it("zeigt das große Foto auf dem Handy als Kachel im Format 4:3", () => {
    /*
     * Christian am 23.09.2026: Auf dem Handy war das große Foto ein schmaler
     * Streifen. jsdom rechnet kein Layout, deshalb wachen hier die Klassen.
     */
    render(<Galerie bilder={bilder(8)} adresse={ADRESSE} titel="Musterhaus" />);
    const gross = screen.getAllByRole("button", { name: /Vollbild öffnen/ })[0];
    expect(gross.className).toContain("aspect-[4/3]");
    expect(gross.className).toContain("sm:h-80");
  });

  it("nennt im Alternativtext die Adresse", () => {
    render(<Galerie bilder={bilder(8)} adresse={ADRESSE} titel="Musterhaus" />);
    expect(screen.getByAltText(`Foto der Immobilie ${ADRESSE}, Bild 1 von 8`)).toBeInTheDocument();
  });

  it("wechselt das Feld rechts unten nach drei Sekunden", () => {
    render(<Galerie bilder={bilder(8)} adresse={ADRESSE} titel="Musterhaus" />);
    expect(wechselfeldBild()?.alt).toContain("Bild 5 von 8");
    act(() => { vi.advanceTimersByTime(3000); });
    expect(wechselfeldBild()?.alt).toContain("Bild 6 von 8");
  });

  it("wechselt nicht, wenn Bewegung reduziert werden soll", () => {
    bewegungReduzieren(true);
    render(<Galerie bilder={bilder(8)} adresse={ADRESSE} titel="Musterhaus" />);
    expect(wechselfeldBild()?.alt).toContain("Bild 5 von 8");
    act(() => { vi.advanceTimersByTime(9000); });
    expect(wechselfeldBild()?.alt).toContain("Bild 5 von 8");
    // Der Zähler bleibt trotzdem stehen.
    expect(screen.getByText("+3")).toBeInTheDocument();
  });

  it("hält an, solange die Maus auf dem Feld steht", () => {
    render(<Galerie bilder={bilder(8)} adresse={ADRESSE} titel="Musterhaus" />);
    const feld = screen.getByRole("button", { name: /Fotos ansehen/ });
    fireEvent.mouseEnter(feld);
    act(() => { vi.advanceTimersByTime(9000); });
    expect(wechselfeldBild()?.alt).toContain("Bild 5 von 8");
    fireEvent.mouseLeave(feld);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(wechselfeldBild()?.alt).toContain("Bild 6 von 8");
  });

  it("hält an, solange das Feld den Tastaturfokus hat", () => {
    render(<Galerie bilder={bilder(8)} adresse={ADRESSE} titel="Musterhaus" />);
    const feld = screen.getByRole("button", { name: /Fotos ansehen/ });
    fireEvent.focus(feld);
    act(() => { vi.advanceTimersByTime(9000); });
    expect(wechselfeldBild()?.alt).toContain("Bild 5 von 8");
  });

  it("hält an, wenn der Tab in den Hintergrund geht", () => {
    render(<Galerie bilder={bilder(8)} adresse={ADRESSE} titel="Musterhaus" />);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    act(() => { vi.advanceTimersByTime(9000); });
    expect(wechselfeldBild()?.alt).toContain("Bild 5 von 8");
  });

  it("öffnet die Vollbildansicht, blättert mit den Pfeiltasten und schließt mit Escape", async () => {
    render(<Galerie bilder={bilder(8)} adresse={ADRESSE} titel="Musterhaus" />);
    const grossesFeld = screen.getAllByRole("button", { name: /Vollbild öffnen/ })[0];
    fireEvent.click(grossesFeld);

    const ansicht = await screen.findByRole("dialog");
    expect(ansicht).toHaveTextContent("Bild 1 von 8");
    // Der Fokus liegt in der Ansicht, nicht auf der Seite dahinter.
    expect(ansicht.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(ansicht, { key: "ArrowRight" });
    expect(await screen.findByRole("dialog")).toHaveTextContent("Bild 2 von 8");
    fireEvent.keyDown(ansicht, { key: "ArrowLeft" });
    expect(await screen.findByRole("dialog")).toHaveTextContent("Bild 1 von 8");

    fireEvent.keyDown(ansicht, { key: "Escape" });
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("zerfällt nicht bei wenigen Bildern und zeigt kein leeres Feld", () => {
    for (const anzahl of [1, 2, 3, 4]) {
      const { unmount } = render(<Galerie bilder={bilder(anzahl)} adresse={ADRESSE} titel="Musterhaus" />);
      expect(screen.getAllByRole("button", { name: /Vollbild öffnen/ })).toHaveLength(anzahl);
      expect(screen.queryByRole("button", { name: /Fotos ansehen/ })).not.toBeInTheDocument();
      unmount();
    }
  });

  it("zeigt ohne Bilder einen Leerzustand statt eines leeren Kastens", () => {
    render(<Galerie bilder={[]} adresse={ADRESSE} titel="Musterhaus" />);
    expect(screen.getByText("Noch keine Fotos hinterlegt")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Vollbild öffnen/ })).not.toBeInTheDocument();
  });

  it("hat seit dem 01.10.2026 keine Reiter mehr, Dokumente und Karte liegen oben auf der Seite", () => {
    render(<Galerie bilder={bilder(6)} adresse={ADRESSE} titel="Musterhaus" />);
    for (const name of [/^Fotos/, /^Dokumente/, /^Karte/]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
  });

  it("blättert das große Bild mit den Pfeilen, zeigt den Zähler und springt am Ende nach vorn", () => {
    render(<Galerie bilder={bilder(3)} adresse={ADRESSE} titel="Musterhaus" />);
    const gross = screen.getByTestId("galerie-gross");
    expect(within(gross).getByText("1 / 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Nächstes Bild" }));
    expect(within(gross).getByAltText(/Bild 2 von 3/)).toBeInTheDocument();
    expect(within(gross).getByText("2 / 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Vorheriges Bild" }));
    fireEvent.click(screen.getByRole("button", { name: "Vorheriges Bild" }));
    expect(within(gross).getByText("3 / 3")).toBeInTheDocument();
  });

  it("blättert mit den Pfeiltasten und per Wischen", () => {
    render(<Galerie bilder={bilder(4)} adresse={ADRESSE} titel="Musterhaus" />);
    const gross = screen.getByTestId("galerie-gross");
    const knopf = screen.getAllByRole("button", { name: /Vollbild öffnen/ })[0];

    fireEvent.keyDown(knopf, { key: "ArrowRight" });
    expect(within(gross).getByText("2 / 4")).toBeInTheDocument();
    fireEvent.keyDown(knopf, { key: "ArrowLeft" });
    expect(within(gross).getByText("1 / 4")).toBeInTheDocument();

    // Nach links wischen heißt: das nächste Bild.
    fireEvent.touchStart(knopf, { touches: [{ clientX: 200 }] });
    fireEvent.touchEnd(knopf, { changedTouches: [{ clientX: 100 }] });
    expect(within(gross).getByText("2 / 4")).toBeInTheDocument();
    // Der Klick am Ende des Wischens öffnet keine Vollbildansicht.
    fireEvent.click(knopf);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("zeigt bei nur einem Bild weder Pfeile noch Zähler", () => {
    render(<Galerie bilder={bilder(1)} adresse={ADRESSE} titel="Musterhaus" />);
    expect(screen.queryByRole("button", { name: "Nächstes Bild" })).not.toBeInTheDocument();
    expect(screen.queryByText("1 / 1")).not.toBeInTheDocument();
  });

  it("öffnet die Vollbildansicht beim gerade gezeigten großen Bild", async () => {
    render(<Galerie bilder={bilder(8)} adresse={ADRESSE} titel="Musterhaus" />);
    fireEvent.click(screen.getByRole("button", { name: "Nächstes Bild" }));
    fireEvent.click(screen.getByRole("button", { name: "Nächstes Bild" }));
    fireEvent.click(screen.getAllByRole("button", { name: /Vollbild öffnen/ })[0]);
    expect(await screen.findByRole("dialog")).toHaveTextContent("Bild 3 von 8");
  });

  it("öffnet beim Klick auf ein kleines Bild die Vollbildansicht bei genau diesem Bild", async () => {
    render(<Galerie bilder={bilder(8)} adresse={ADRESSE} titel="Musterhaus" />);
    fireEvent.click(screen.getByRole("button", { name: /Vollbild öffnen: .*Bild 3 von 8/ }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Bild 3 von 8");
  });
});
