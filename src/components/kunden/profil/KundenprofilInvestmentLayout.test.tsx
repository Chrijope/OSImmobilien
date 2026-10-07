import { fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { KundenprofilInvestmentLayout } from "./KundenprofilInvestmentLayout";

const css = readFileSync(resolve(process.cwd(), "src/components/kunden/profil/kundenprofil.css"), "utf8");

beforeEach(() => {
  // jsdom kennt kein Scrollen.
  Element.prototype.scrollIntoView = vi.fn();
});

it("behält Investment und Sprungziel beim Umschalten der Symbolleiste bei", () => {
  const abschnitt = { key: "bonitaet", label: "Bonität und Bankprüfung", karten: ["bestehendes-sprungziel"] };
  const { container } = render(<TooltipProvider><KundenprofilInvestmentLayout abschnitte={[abschnitt]} zaehler={{ bonitaet: "3 von 15" }} investmentId="i1"><input aria-label="Bestehendes Investmentfeld" /><div id="bestehendes-sprungziel-i1" data-ui="card" /></KundenprofilInvestmentLayout></TooltipProvider>);
  const feld = screen.getByRole("textbox");
  fireEvent.change(feld, { target: { value: "Unverändert" } });
  fireEvent.click(screen.getByRole("button", { name: "Abschnitte ausklappen" }));
  fireEvent.click(screen.getByRole("button", { name: "Abschnitte einklappen" }));
  expect(screen.getByRole("textbox")).toBe(feld);
  expect(feld).toHaveValue("Unverändert");
  fireEvent.click(screen.getByRole("button", { name: "Bonität und Bankprüfung: 3 von 15" }));
  expect(container.querySelector("#bestehendes-sprungziel-i1")).toHaveAttribute("data-profil-sprungziel", "aktiv");
});

/*
 * Wunsch vom 05.10.2026: kein Hinweisfenster mehr. Ein Klick rahmt genau den
 * Kasten des Abschnitts orange, bis ein anderer angeklickt wird. Gesperrte
 * Phasen mit eigenem Kasten werden ebenso angesprungen, Abschnitte ohne
 * Kasten sind gedämpft und tun nichts.
 */
describe("Sprung über die Abschnittsleiste", () => {
  const abschnitte = [
    { key: "reservierung", label: "Reservierung", karten: ["card-reservierung"] },
    { key: "notar", label: "Notar", karten: ["card-notar"] },
    { key: "bonitaet", label: "Bonität und Bankprüfung", karten: ["card-bonitaet"] },
  ];
  const zeichne = () => render(<TooltipProvider><KundenprofilInvestmentLayout abschnitte={abschnitte} zaehler={{}} investmentId="i1">
    <div id="card-reservierung-i1" data-ui="card">Reservierung</div>
    {/* Gesperrter Kasten wie LockedPhaseCard, mit derselben Kennung. */}
    <div id="card-notar-i1" data-ui="card">Notar gesperrt</div>
  </KundenprofilInvestmentLayout></TooltipProvider>);

  it("rahmt den Zielkasten bleibend, immer nur einen, und öffnet kein Fenster", () => {
    vi.useFakeTimers();
    try {
      const { container } = zeichne();
      const reservierung = container.querySelector("#card-reservierung-i1")!;
      const notar = container.querySelector("#card-notar-i1")!;
      fireEvent.click(screen.getByRole("button", { name: "Reservierung" }));
      expect(reservierung).toHaveAttribute("data-profil-sprungziel", "aktiv");
      expect(reservierung.scrollIntoView).toHaveBeenCalled();
      vi.advanceTimersByTime(10_000);
      expect(reservierung).toHaveAttribute("data-profil-sprungziel", "aktiv");
      fireEvent.click(screen.getByRole("button", { name: "Notar" }));
      expect(notar).toHaveAttribute("data-profil-sprungziel", "aktiv");
      expect(reservierung).not.toHaveAttribute("data-profil-sprungziel");
      expect(container.querySelectorAll("[data-profil-sprungziel]")).toHaveLength(1);
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(screen.queryByRole("dialog")).toBeNull();
    } finally { vi.useRealTimers(); }
  });

  it("dämpft einen Abschnitt ohne Kasten, mit Schloss, ohne Fenster und ohne Sprung", () => {
    const { container } = zeichne();
    const knopf = screen.getByRole("button", { name: "Bonität und Bankprüfung: Noch nicht freigeschaltet" });
    expect(knopf).toHaveAttribute("aria-disabled", "true");
    expect(knopf).toHaveAttribute("title", "Noch nicht freigeschaltet");
    expect(knopf.querySelector("svg.lucide-lock")).not.toBeNull();
    fireEvent.click(knopf);
    expect(container.querySelectorAll("[data-profil-sprungziel]")).toHaveLength(0);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    // Abschnitte mit Kasten bleiben normal klickbar.
    expect(screen.getByRole("button", { name: "Reservierung" })).not.toHaveAttribute("aria-disabled");
  });

  it("der Rahmen ist das Projekt-Orange", () => {
    expect(css).toContain('.kundenprofil [data-profil-sprungziel="aktiv"] {\n  outline: 3px solid hsl(var(--brand-orange));');
  });
});

/*
 * Auf dem Telefon blendet `kundenprofil.css` die Abschnittsleiste aus. Ohne
 * einen zweiten Weg zum selben Ziel wäre ein Abschnitt dort nur noch durch
 * langes Wischen erreichbar. Der Test hält fest, dass dieser Weg da ist und
 * an der Stelle hängt, die das Stylesheet auf dem Telefon einblendet.
 *
 * Bewusst ohne das Öffnen des Menüs: Ein offenes Radix-Menü lässt die
 * Testumgebung hier hängen, an derselben Stelle wie im bekannt roten
 * `SidebarRoleSelector.test.tsx`. Dass die Einträge dieselbe Funktion rufen
 * wie die Leiste, sichert der Test darüber ab; beide bekommen `onAbschnitt`.
 */
it("bietet auf dem Telefon einen zweiten Weg zu den Abschnitten", () => {
  const abschnitt = { key: "objektauswahl", label: "Objektauswahl", karten: ["card-objektauswahl"] };
  const { container } = render(<TooltipProvider><KundenprofilInvestmentLayout abschnitte={[abschnitt]} zaehler={{}} investmentId="i1"><p>Inhalt</p></KundenprofilInvestmentLayout></TooltipProvider>);
  const menue = container.querySelector(".kundenprofil-abschnitte-mobil");
  expect(menue).not.toBeNull();
  expect(menue).toContainElement(screen.getByRole("button", { name: "Zum Abschnitt springen" }));
});

/*
 * Seit dem 05.10.2026 steht das Investment untereinander in voller Breite,
 * nur Bonitätscheck und Bankprüfung bleiben zweispaltig.
 */
describe("Investment untereinander", () => {
  it("legt die zweispaltigen Raster auf eine Spalte, außer Bonität und Bankprüfung", () => {
    expect(css).toContain('.kundenprofil-investment-layout .grid.lg\\:grid-cols-2:not(.kp-zwei-spalten) { grid-template-columns: minmax(0, 1fr); }');
  });

  it("lässt die Kundenleiste links auch bei offenem Investment stehen", () => {
    expect(css).not.toContain("> .kundenprofil-stammdaten { display: none; }");
  });
});

/*
 * Die Leiste trug `sticky`, klebte aber nicht: Der Arbeitsbereich war mit
 * `overflow-x: auto` ein Rollbereich. Im Investment steht dort jetzt `clip`.
 */
it("die Abschnittsleiste bleibt beim Rollen stehen, auf dem Telefon bleibt sie ausgeblendet", () => {
  expect(css).toContain(".kundenprofil-abschnitte { position: sticky; top: 8px;");
  expect(css).toContain(".kundenprofil-inhalt:has(.kundenprofil-investment-layout) { overflow-x: clip; }");
  const telefon = css.slice(css.indexOf("@container kundenprofil-mitte (max-width: 600px)"));
  expect(telefon.slice(0, telefon.indexOf("\n}"))).toContain(".kundenprofil-abschnitte { display: none; }");
});
