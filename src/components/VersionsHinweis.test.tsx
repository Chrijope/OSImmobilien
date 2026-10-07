import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";

/**
 * Der Warnstreifen darf nur zwei Dinge tun: auf Klick neu laden und sich
 * wegklicken lassen. Das stille Neuladen darf nur beim Seitenwechsel
 * geschehen, nie mitten auf einer Seite und nie im Videogespraech. Beides
 * kostet sonst Arbeit oder einen Kunden, deshalb steht es hier abgesichert.
 */

const pruefung = vi.hoisted(() => ({
  sichtbar: true,
  still: false,
  ausblenden: vi.fn(),
  merkeStill: vi.fn(),
}));

const videoraum = vi.hoisted(() => ({
  wert: null as { aktiv: unknown } | null,
}));

const dialog = vi.hoisted(() => ({
  antwort: true,
  aufrufe: [] as unknown[],
}));

vi.mock("@/lib/versionspruefung", () => ({
  useVersionsHinweis: () => ({
    sichtbar: pruefung.sichtbar,
    still: pruefung.still,
    ausblenden: pruefung.ausblenden,
    merkeStill: pruefung.merkeStill,
  }),
}));

vi.mock("@/contexts/VideoraumContext", () => ({
  useVideoraumOptional: () => videoraum.wert,
}));

vi.mock("@/lib/confirm", () => ({
  confirmDialog: async (opts: unknown) => { dialog.aufrufe.push(opts); return dialog.antwort; },
}));

import { VersionsHinweis } from "./VersionsHinweis";

/** Ein Knopf, der wie ein Klick in der Seitenleiste die Route wechselt. */
function Wechsler() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate("/news")}>wechseln</button>;
}

function mitRouter() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <VersionsHinweis />
      <Wechsler />
    </MemoryRouter>,
  );
}

const neuLaden = vi.fn();

beforeEach(() => {
  pruefung.sichtbar = true;
  pruefung.still = false;
  pruefung.ausblenden.mockClear();
  pruefung.merkeStill.mockClear();
  videoraum.wert = null;
  dialog.antwort = true;
  dialog.aufrufe = [];
  neuLaden.mockClear();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { reload: neuLaden },
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("VersionsHinweis", () => {
  it("steht nicht da, solange keine neue Fassung bereitliegt", () => {
    pruefung.sichtbar = false;
    const { container } = render(<VersionsHinweis />);
    expect(container).toBeEmptyDOMElement();
  });

  it("zeigt Text, Knopf und Kreuz", () => {
    render(<VersionsHinweis />);
    expect(screen.getByText("Bitte kurz neu laden, damit alles richtig gespeichert wird.")).toBeTruthy();
    // Kein Verweis auf die News-Seite, nur der Knopf.
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByRole("button", { name: "Jetzt laden" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hinweis ausblenden" })).toBeTruthy();
  });

  it("laedt von selbst nichts neu, sondern erst auf Klick", async () => {
    render(<VersionsHinweis />);
    expect(neuLaden).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Jetzt laden" }));
    await waitFor(() => expect(neuLaden).toHaveBeenCalledTimes(1));
    // Ohne laufendes Gespraech gibt es keine Rueckfrage.
    expect(dialog.aufrufe).toHaveLength(0);
  });

  it("blendet sich auf das Kreuz hin aus", () => {
    render(<VersionsHinweis />);
    fireEvent.click(screen.getByRole("button", { name: "Hinweis ausblenden" }));
    expect(pruefung.ausblenden).toHaveBeenCalledTimes(1);
    expect(neuLaden).not.toHaveBeenCalled();
  });

  it("fragt im laufenden Videogespraech zuerst nach", async () => {
    videoraum.wert = { aktiv: { raumId: "raum-1" } };
    dialog.antwort = false;

    render(<VersionsHinweis />);
    fireEvent.click(screen.getByRole("button", { name: "Jetzt laden" }));

    await waitFor(() => expect(dialog.aufrufe).toHaveLength(1));
    // Abgelehnt heisst: Das Gespraech laeuft weiter.
    expect(neuLaden).not.toHaveBeenCalled();
  });

  it("laedt im Gespraech erst nach ausdruecklicher Zustimmung", async () => {
    videoraum.wert = { aktiv: { raumId: "raum-1" } };
    dialog.antwort = true;

    render(<VersionsHinweis />);
    fireEvent.click(screen.getByRole("button", { name: "Jetzt laden" }));

    await waitFor(() => expect(neuLaden).toHaveBeenCalledTimes(1));
  });

  it("laedt still genau einmal beim naechsten Seitenwechsel, vorher nicht", () => {
    pruefung.sichtbar = false;
    pruefung.still = true;
    mitRouter();
    expect(neuLaden).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();

    act(() => { fireEvent.click(screen.getByText("wechseln")); });
    expect(pruefung.merkeStill).toHaveBeenCalledTimes(1);
    expect(neuLaden).toHaveBeenCalledTimes(1);
  });

  it("laedt im laufenden Videogespraech auch beim Seitenwechsel nicht still", () => {
    videoraum.wert = { aktiv: { raumId: "raum-1" } };
    pruefung.sichtbar = false;
    pruefung.still = true;
    mitRouter();
    act(() => { fireEvent.click(screen.getByText("wechseln")); });
    expect(neuLaden).not.toHaveBeenCalled();
  });
});
