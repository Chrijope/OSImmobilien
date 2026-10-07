/**
 * Das Feld „Sprache“ im Kundenprofil, der Hinweis „Geht auf Englisch raus“
 * am Versandknopf, das Kürzel „EN“ am Namen und die Rückfrage im
 * Projektstil (Plan Kundensprache vom 25.09.2026, Etappe 0).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const t = vi.hoisted(() => ({
  zeilen: [] as Array<{ id: string; meta?: unknown }>,
  hoerer: [] as Array<(tabelle: string) => void>,
}));

vi.mock("@/lib/dataCache", () => ({
  cacheGet: () => t.zeilen,
  onCacheChange: (h: (tabelle: string) => void) => {
    t.hoerer.push(h);
    return () => { t.hoerer = t.hoerer.filter((x) => x !== h); };
  },
}));
vi.mock("@/lib/kundenStore", () => ({ mergeKontaktMetaMitGrund: vi.fn() }));

const { KundenspracheFeld } = await import("./KundenspracheFeld");
const { KundenspracheHinweis, KundenspracheKuerzel } = await import("../KundenspracheHinweis");
const { auswahlDialog } = await import("@/lib/confirm");

beforeEach(() => {
  t.zeilen = [];
  t.hoerer = [];
});

describe("KundenspracheFeld", () => {
  it("zeigt zwei Pillen, die gewählte ist markiert", () => {
    render(<KundenspracheFeld wert="en" onWahl={() => undefined} />);
    expect(screen.getByRole("radio", { name: "Deutsch" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: "English" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByText(/noch nicht gewählt/)).toBeNull();
  });

  it("noch nie gewählt: beide leer und der Hinweis", () => {
    render(<KundenspracheFeld wert={null} onWahl={() => undefined} />);
    for (const r of screen.getAllByRole("radio")) expect(r).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("Sprache noch nicht gewählt, gilt als Deutsch")).toBeInTheDocument();
  });

  it("meldet einen Klick, aber nicht auf die schon gewählte Pille", () => {
    const wahl = vi.fn();
    render(<KundenspracheFeld wert="de" onWahl={wahl} />);
    fireEvent.click(screen.getByRole("radio", { name: "Deutsch" }));
    fireEvent.click(screen.getByRole("radio", { name: "English" }));
    expect(wahl).toHaveBeenCalledTimes(1);
    expect(wahl).toHaveBeenCalledWith("en");
  });

  it("ohne Recht nur Text, keine Pillen", () => {
    render(<KundenspracheFeld wert="en" />);
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.getByText("English")).toBeInTheDocument();
  });

  it("ohne Recht und nie gewählt: Deutsch mit Hinweis", () => {
    render(<KundenspracheFeld wert={null} />);
    expect(screen.getByText("Deutsch")).toBeInTheDocument();
    expect(screen.getByText(/noch nicht gewählt/)).toBeInTheDocument();
  });
});

describe("KundenspracheHinweis und Kürzel", () => {
  it("bei Deutsch steht nichts", () => {
    t.zeilen = [{ id: "k1", meta: {} }];
    const { container } = render(<><KundenspracheHinweis kontaktId="k1" /><KundenspracheKuerzel kontaktId="k1" /></>);
    expect(container).toBeEmptyDOMElement();
  });

  it("bei Englisch: „Geht auf Englisch raus“ und „EN“", () => {
    t.zeilen = [{ id: "k1", meta: { kundenSprache: "en" } }];
    render(<><KundenspracheHinweis kontaktId="k1" /><KundenspracheKuerzel kontaktId="k1" /></>);
    expect(screen.getByText("Geht auf Englisch raus")).toBeInTheDocument();
    expect(screen.getByText("EN")).toBeInTheDocument();
  });

  it("folgt dem Zwischenspeicher, sobald jemand Englisch wählt", () => {
    t.zeilen = [{ id: "k1", meta: {} }];
    render(<KundenspracheHinweis kontaktId="k1" />);
    expect(screen.queryByText("Geht auf Englisch raus")).toBeNull();
    t.zeilen = [{ id: "k1", meta: { kundenSprache: "en", kundenSpracheGesetztAm: "2026-09-25" } }];
    act(() => { for (const h of t.hoerer) h("kontakte"); });
    expect(screen.getByText("Geht auf Englisch raus")).toBeInTheDocument();
  });

  it("das Kürzel geht in Listen auch ohne Suche im Zwischenspeicher", () => {
    render(<KundenspracheKuerzel sprache="en" />);
    expect(screen.getByLabelText("Kundensprache Englisch")).toHaveTextContent("EN");
  });
});

describe("auswahlDialog im Projektstil", () => {
  it("zeigt Titel und benannte Knöpfe und liefert die Wahl", async () => {
    const wahl = auswahlDialog({
      title: "Deutsch oder English?",
      description: "Für Max ist noch keine Sprache gewählt.",
      optionen: [{ wert: "de", text: "Deutsch" }, { wert: "en", text: "English" }],
    });
    const knopf = await screen.findByRole("button", { name: "English" });
    expect(screen.getByText("Deutsch oder English?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deutsch" })).toBeInTheDocument();
    // Keine fremden Beschriftungen wie „OK“ oder „Abbrechen“.
    expect(screen.queryByRole("button", { name: /OK|Abbrechen/ })).toBeNull();
    fireEvent.click(knopf);
    await expect(wahl).resolves.toBe("en");
  });

  it("Escape schließt ohne Wahl", async () => {
    const wahl = auswahlDialog({ title: "Deutsch oder English?", optionen: [{ wert: "de", text: "Deutsch" }] });
    await screen.findByRole("alertdialog");
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await expect(wahl).resolves.toBeNull();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });
});
