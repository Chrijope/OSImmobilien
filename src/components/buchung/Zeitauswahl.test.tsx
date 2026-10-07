import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Zeitauswahl } from "./Zeitauswahl";

/**
 * Die Zeitauswahl ist die Stelle, an der eine Buchung entweder zustande kommt
 * oder abbricht. Deshalb hier abgesichert: dass die Zeiten in der Zone des
 * Beraters unter dem richtigen Tag stehen, dass die Vorausschau nicht
 * überblättert wird und dass die gewählte Zeit auch als gewählt gemeldet wird.
 */

const BERLIN = "Europe/Berlin";
// Dienstag, 4. August 2026, 08:00 Uhr in Berlin.
const JETZT = new Date("2026-08-04T06:00:00Z");

function zeichne(ueberschreibungen: Partial<React.ComponentProps<typeof Zeitauswahl>> = {}) {
  const lade = ueberschreibungen.lade ?? vi.fn().mockResolvedValue([]);
  const aufWahl = ueberschreibungen.aufWahl ?? vi.fn();
  const ergebnis = render(
    <Zeitauswahl
      zeitzone={BERLIN}
      vorausschauTage={60}
      lade={lade}
      gewaehlt={null}
      aufWahl={aufWahl}
      jetzt={JETZT}
      {...ueberschreibungen}
    />,
  );
  return { ...ergebnis, lade, aufWahl };
}

describe("Zeitauswahl", () => {
  it("fragt die Zeiten für die laufende Woche ab heute an", async () => {
    const lade = vi.fn().mockResolvedValue([]);
    zeichne({ lade });
    await waitFor(() => expect(lade).toHaveBeenCalled());
    // Die Woche begann am Montag, aber vor heute wird nichts angeboten.
    // Deshalb laufen die sieben Tage ab heute.
    expect(lade).toHaveBeenCalledWith("2026-08-04", "2026-08-10");
  });

  it("stellt jede Zeit als Knopf unter ihren Tag", async () => {
    const lade = vi.fn().mockResolvedValue([
      "2026-08-04T07:00:00Z", // 09:00 Berlin
      "2026-08-04T07:30:00Z", // 09:30 Berlin
      "2026-08-05T08:00:00Z", // 10:00 Berlin
    ]);
    zeichne({ lade });

    expect(await screen.findByRole("button", { name: "Dienstag, 4. August 2026, 09:00 Uhr" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dienstag, 4. August 2026, 09:30 Uhr" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mittwoch, 5. August 2026, 10:00 Uhr" })).toBeInTheDocument();
  });

  it("meldet die angeklickte Zeit und zeigt sie als gedrückt", async () => {
    const lade = vi.fn().mockResolvedValue(["2026-08-04T07:00:00Z"]);
    const aufWahl = vi.fn();
    const { rerender } = zeichne({ lade, aufWahl });

    const knopf = await screen.findByRole("button", { name: "Dienstag, 4. August 2026, 09:00 Uhr" });
    expect(knopf).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(knopf);
    expect(aufWahl).toHaveBeenCalledWith("2026-08-04T07:00:00Z");

    rerender(
      <Zeitauswahl
        zeitzone={BERLIN}
        vorausschauTage={60}
        lade={lade}
        gewaehlt="2026-08-04T07:00:00Z"
        aufWahl={aufWahl}
        jetzt={JETZT}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Dienstag, 4. August 2026, 09:00 Uhr" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("blättert vorwärts und lädt die nächste Woche", async () => {
    const lade = vi.fn().mockResolvedValue([]);
    zeichne({ lade });
    await waitFor(() => expect(lade).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Eine Woche vor" }));
    await waitFor(() => expect(lade).toHaveBeenCalledTimes(2));
    expect(lade).toHaveBeenLastCalledWith("2026-08-11", "2026-08-17");
  });

  it("lässt nicht vor den heutigen Tag zurückblättern", async () => {
    const lade = vi.fn().mockResolvedValue([]);
    zeichne({ lade });
    await waitFor(() => expect(lade).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Eine Woche zurück" })).toBeDisabled();
  });

  it("blättert nicht über das Ende der Vorausschau hinaus", async () => {
    const lade = vi.fn().mockResolvedValue([]);
    zeichne({ lade, vorausschauTage: 3 });
    await waitFor(() => expect(lade).toHaveBeenCalled());
    // Nur noch der 4. bis 7. August, danach kommt nichts mehr.
    expect(lade).toHaveBeenCalledWith("2026-08-04", "2026-08-07");
    expect(screen.getByRole("button", { name: "Eine Woche vor" })).toBeDisabled();
  });

  it("sagt es, wenn im Zeitraum nichts frei ist", async () => {
    zeichne({ lade: vi.fn().mockResolvedValue([]) });
    expect(await screen.findByText(/In diesem Zeitraum ist nichts frei/)).toBeInTheDocument();
  });

  it("bleibt stehen, wenn die Zeiten nicht geladen werden können", async () => {
    zeichne({ lade: vi.fn().mockRejectedValue(new Error("Netz weg")) });
    expect(await screen.findByText(/konnten nicht geladen werden/)).toBeInTheDocument();
  });

  it("holt die Zeiten neu, wenn der Zähler hochgeht", async () => {
    const lade = vi.fn().mockResolvedValue([]);
    const { rerender, aufWahl } = zeichne({ lade, neuLaden: 0 });
    await waitFor(() => expect(lade).toHaveBeenCalledTimes(1));

    rerender(
      <Zeitauswahl
        zeitzone={BERLIN}
        vorausschauTage={60}
        lade={lade}
        gewaehlt={null}
        aufWahl={aufWahl}
        jetzt={JETZT}
        neuLaden={1}
      />,
    );
    await waitFor(() => expect(lade).toHaveBeenCalledTimes(2));
  });
});
