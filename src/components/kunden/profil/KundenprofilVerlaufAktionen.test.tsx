/**
 * Loeschdialog und Stern im Verlauf des Kundenprofils (Auftrag vom 28.09.2026).
 *
 * Der Dialog lief bei langem Text ohne Leerzeichen rechts ueber, Text und
 * Knoepfe waren nur mit seitlichem Scrollen zu sehen.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EintragEntfernenDialog, NotizFavoritStern } from "./KundenprofilVerlaufAktionen";
import type { AktivitaetEntry } from "@/lib/aktivitaetenStore";

const LANGES_WORT = "dfsödfihdsishsdoöihsdoifs".repeat(20);

const notiz: AktivitaetEntry = {
  id: "n1",
  kundeId: "k1",
  art: "notiz",
  beschreibung: LANGES_WORT,
  von: "Testperson A",
  datum: "2026-09-28T10:15:00.000Z",
};

function zeigeDialog(overrides: Partial<Parameters<typeof EintragEntfernenDialog>[0]> = {}) {
  const props = { eintrag: notiz, loescht: false, onSchliessen: vi.fn(), onLoeschen: vi.fn(), ...overrides };
  render(<EintragEntfernenDialog {...props} />);
  return props;
}

describe("EintragEntfernenDialog", () => {
  // jsdom misst nichts; der Test mit „mehr“ legt die Höhen auf
  // HTMLElement.prototype fest, danach gilt wieder die von Element.
  afterEach(() => {
    delete (HTMLElement.prototype as { scrollHeight?: number }).scrollHeight;
    delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight;
  });

  it("zeigt Titel, Hinweis mit echten Umlauten, Autor und beide Knöpfe", () => {
    zeigeDialog();
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("Eintrag entfernen")).toBeInTheDocument();
    expect(within(dialog).getByText(/Das lässt sich nicht rückgängig machen\./)).toBeInTheDocument();
    expect(dialog.textContent).not.toMatch(/laesst|rueckgaengig|Endgueltig/);
    expect(within(dialog).getByText(/Testperson A/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Löschen" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Behalten" })).toBeInTheDocument();
  });

  it("bricht langen Text ohne Leerzeichen um, statt den Dialog zu sprengen", () => {
    zeigeDialog();
    const dialog = screen.getByRole("alertdialog");
    // Die Spalte des Dialogs darf nicht mit dem längsten Wort wachsen.
    expect(dialog.className).toContain("grid-cols-[minmax(0,1fr)]");
    expect(dialog.className).toMatch(/max-w-\[min\(32rem,calc\(100vw-2rem\)\)\]/);
    const text = screen.getByText(LANGES_WORT);
    expect(text.className).toContain("[overflow-wrap:anywhere]");
    expect(text.className).toContain("break-words");
    expect(text.className).toContain("min-w-0");
    expect(screen.getByTestId("eintrag-vorschau").className).toContain("min-w-0");
  });

  it("zeigt langen Text auf drei Zeilen und klappt mit mehr und weniger", () => {
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get: () => 200 });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 60 });
    zeigeDialog();
    const text = screen.getByText(LANGES_WORT);
    expect(text.className).toContain("line-clamp-3");
    fireEvent.click(screen.getByRole("button", { name: "mehr" }));
    expect(text.className).not.toContain("line-clamp-3");
    fireEvent.click(screen.getByRole("button", { name: "weniger" }));
    expect(text.className).toContain("line-clamp-3");
  });

  it("zeigt bei kurzem Text kein mehr", () => {
    zeigeDialog({ eintrag: { ...notiz, beschreibung: "Kurz notiert" } });
    expect(screen.queryByRole("button", { name: "mehr" })).toBeNull();
  });

  it("Löschen ruft den Aufrufer", () => {
    const props = zeigeDialog();
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    expect(props.onLoeschen).toHaveBeenCalledTimes(1);
  });

  it("sperrt beide Knöpfe, solange gelöscht wird", () => {
    zeigeDialog({ loescht: true });
    expect(screen.getByRole("button", { name: "Wird gelöscht …" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Behalten" })).toBeDisabled();
  });
});

describe("NotizFavoritStern", () => {
  function zeigeStern(props: { angepinnt: boolean; darf: boolean }) {
    const onUmschalten = vi.fn();
    render(
      <TooltipProvider>
        <NotizFavoritStern {...props} onUmschalten={onUmschalten} />
      </TooltipProvider>,
    );
    return onUmschalten;
  }

  it("setzt den Favoriten mit einem Klick", () => {
    const onUmschalten = zeigeStern({ angepinnt: false, darf: true });
    const knopf = screen.getByRole("button", { name: "Als Favorit anpinnen" });
    expect(knopf).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(knopf);
    expect(onUmschalten).toHaveBeenCalledTimes(1);
  });

  it("zeigt den gesetzten Favoriten gefüllt und hebt ihn per Klick auf", () => {
    const onUmschalten = zeigeStern({ angepinnt: true, darf: true });
    const knopf = screen.getByRole("button", { name: "Nicht mehr anpinnen" });
    expect(knopf).toHaveAttribute("aria-pressed", "true");
    expect(knopf.querySelector("svg")?.getAttribute("class")).toContain("fill-current");
    fireEvent.click(knopf);
    expect(onUmschalten).toHaveBeenCalledTimes(1);
  });

  it("ohne Recht zum Bearbeiten ist kein Stern klickbar", () => {
    zeigeStern({ angepinnt: true, darf: false });
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("img", { name: "Angepinnt" })).toBeInTheDocument();
  });

  it("ohne Recht und ohne Favorit steht gar nichts da", () => {
    zeigeStern({ angepinnt: false, darf: false });
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("img", { name: "Angepinnt" })).toBeNull();
  });
});
