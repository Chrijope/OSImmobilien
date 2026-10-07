/**
 * Die Zwei-Klick-Lösung für eingebettete Kalender: Die fremde Seite lädt erst
 * nach dem Klick, vorher erfährt der Anbieter nichts.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ZweiKlickEinbettung, _zweiKlickVergessen, anbieterAusAdresse } from "@/components/cookie/ZweiKlickEinbettung";

const CALENDLY = "https://calendly.com/moreimmo/kennenlernen";

function zeige(url = CALENDLY, sprache: "de" | "en" = "de") {
  return render(
    <ZweiKlickEinbettung url={url} sprache={sprache}>
      <iframe title="Kalender" src={url} />
    </ZweiKlickEinbettung>,
  );
}

afterEach(() => {
  cleanup();
  _zweiKlickVergessen();
});

describe("ZweiKlickEinbettung", () => {
  it("lädt die fremde Seite nicht von selbst", () => {
    zeige();
    expect(screen.queryByTitle("Kalender")).toBeNull();
    expect(screen.getByText(/Terminkalender von Calendly/)).toBeTruthy();
  });

  it("lädt sie nach dem Klick", () => {
    zeige();
    fireEvent.click(screen.getByRole("button", { name: "Kalender laden" }));
    expect(screen.getByTitle("Kalender")).toBeTruthy();
  });

  it("fragt beim selben Anbieter in dieser Sitzung nicht noch einmal", () => {
    const { unmount } = zeige();
    fireEvent.click(screen.getByRole("button", { name: "Kalender laden" }));
    unmount();
    zeige(`${CALENDLY}/anderer-anlass`);
    expect(screen.getByTitle("Kalender")).toBeTruthy();
  });

  it("spricht Englisch, wenn die Seite es tut", () => {
    zeige(CALENDLY, "en");
    expect(screen.getByRole("button", { name: "Load calendar" })).toBeTruthy();
  });

  it("nennt den Anbieter nach der Adresse", () => {
    expect(anbieterAusAdresse("https://calendly.com/x")).toBe("Calendly");
    expect(anbieterAusAdresse("https://calendar.google.com/x")).toBe("Google");
    expect(anbieterAusAdresse("https://www.tidycal.com/x")).toBe("tidycal.com");
    expect(anbieterAusAdresse("kaputt")).toBe("einem externen Anbieter");
  });
});
