import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";

/**
 * Der Streifen darf nur zwei Dinge tun: auf Klick neu laden und sich
 * wegklicken lassen. Von selbst laedt er nie neu, auch nicht beim
 * Seitenwechsel (seit 26.10.2026). Das kostet sonst Eingaben oder im
 * Videogespraech einen Kunden, deshalb steht es hier abgesichert.
 */

const pruefung = vi.hoisted(() => ({
  sichtbar: true,
  kritisch: true,
  ausblenden: vi.fn(),
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
    kritisch: pruefung.kritisch,
    ausblenden: pruefung.ausblenden,
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
  pruefung.kritisch = true;
  pruefung.ausblenden.mockClear();
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
    expect(screen.getByRole("button", { name: "Jetzt neu laden" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hinweis ausblenden" })).toBeTruthy();
  });

  it("laedt von selbst nichts neu, sondern erst auf Klick", async () => {
    render(<VersionsHinweis />);
    expect(neuLaden).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Jetzt neu laden" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Jetzt neu laden" }));

    await waitFor(() => expect(dialog.aufrufe).toHaveLength(1));
    // Abgelehnt heisst: Das Gespraech laeuft weiter.
    expect(neuLaden).not.toHaveBeenCalled();
  });

  it("laedt im Gespraech erst nach ausdruecklicher Zustimmung", async () => {
    videoraum.wert = { aktiv: { raumId: "raum-1" } };
    dialog.antwort = true;

    render(<VersionsHinweis />);
    fireEvent.click(screen.getByRole("button", { name: "Jetzt neu laden" }));

    await waitFor(() => expect(neuLaden).toHaveBeenCalledTimes(1));
  });

  it("zeigt bei einem normalen Update den dezenten Hinweis mit Knopf", () => {
    pruefung.kritisch = false;
    render(<VersionsHinweis />);
    expect(screen.getByText("Neue Version verfügbar. Lade neu, wenn es dir passt.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Jetzt neu laden" })).toBeTruthy();
    expect(neuLaden).not.toHaveBeenCalled();
  });

  it("laedt auch beim Seitenwechsel nicht von selbst neu", () => {
    pruefung.kritisch = false;
    mitRouter();
    act(() => { fireEvent.click(screen.getByText("wechseln")); });
    expect(neuLaden).not.toHaveBeenCalled();
    // Der Hinweis steht weiter da.
    expect(screen.getByRole("status")).toBeTruthy();
  });
});
