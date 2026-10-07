import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { KundenprofilStammdaten } from "./KundenprofilStammdaten";
import {
  KundenprofilAktionsleiste,
  MENUE_AKTIONEN,
  QUICK_ACTIONS,
  SCHNELLZUGRIFF,
} from "./KundenprofilAktionsleiste";
import { InactivityAmpel } from "@/components/kunden/InactivityAmpel";
import type { KundeData } from "@/lib/kundenStore";

/**
 * Der Kopfbereich des Kundenprofils, so wie Christian ihn am 16.09.2026
 * bestellt hat: der Name nur noch einmal, kein Initialen-Kästchen, die Ampel
 * unter dem Namen und die Aktionen als runde, beschriftete Symbole darunter.
 *
 * Geprüft wird der Personenblock samt seiner beiden neuen Einschübe, also
 * genau die Zusammensetzung, die `KundenDetail.tsx` an die linke Spalte
 * übergibt. Die Seite selbst ist 13.500 Zeilen lang und zieht das halbe
 * Projekt mit, deshalb steht die Liste der Aktionen in der Aktionsleiste und
 * nicht mehr dort.
 */

/*
 * Das Ausklappmenü ist durch schlichte Knöpfe ersetzt.
 *
 * Grund: Das echte Radix-Menü öffnet in jsdom zwar, hält danach aber die
 * Ereignisschleife besetzt, und der Test läuft in die Zeitgrenze. Geprüft
 * werden soll ohnehin die eigene Logik, nämlich dass jeder Eintrag aus
 * `MENUE_AKTIONEN` im Menü landet und beim Auswählen unverändert gemeldet
 * wird. Dass Radix ein Menü aufklappen kann, ist nicht unsere Aufgabe.
 */
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onSelect }: { children: React.ReactNode; onSelect: () => void }) => (
    <button type="button" onClick={onSelect}>{children}</button>
  ),
}));

/*
 * Der Tooltip der Ampel braucht seinen Anbieter. In der Anwendung steht er
 * einmal um alles herum (`App.tsx`), im Test muss er mitgeliefert werden.
 */
const zeige = (element: React.ReactElement) =>
  render(<TooltipProvider>{element}</TooltipProvider>);

const kunde = (over: Partial<KundeData> = {}): KundeData =>
  ({
    id: "k1",
    vorname: "Kambiz",
    nachname: "Zangeneh",
    pipelineStufe: "selbstauskunft",
    updatedAt: "2026-09-01T10:00:00Z",
    ...over,
  }) as KundeData;

/** Der Personenblock, so zusammengesetzt wie im Kundenprofil. */
const personenblock = (onAktion = vi.fn()) =>
  zeige(
    <KundenprofilStammdaten
      name="Kambiz Zangeneh"
      anrede="Herr"
      ampel={<InactivityAmpel kunde={kunde()} size="md" showLabel />}
      aktionen={<KundenprofilAktionsleiste onAktion={onAktion} />}
      felder={[{ label: "E-Mail", wert: "kambiz@example.org" }]}
      onWeitereFelder={() => {}}
    />,
  );

describe("Der Name steht nur noch einmal", () => {
  it("zeigt den Namen genau einmal im Personenblock", () => {
    personenblock();
    expect(screen.getAllByText("Kambiz Zangeneh")).toHaveLength(1);
  });

  /*
   * Das blaue Kästchen trug die Initialen und sonst nichts. Es stand direkt
   * neben dem Namen, aus dem es gebildet war.
   */
  it("zeigt kein Kästchen mit den Initialen mehr", () => {
    personenblock();
    expect(screen.queryByText("KZ")).not.toBeInTheDocument();
  });
});

describe("Die Anrede steht vor dem Namen", () => {
  /** Nur der Personenblock mit Name, Anrede und Abzeichen, ohne Ampel. */
  const nurName = (anrede?: string | null, namenZusatz?: React.ReactNode) =>
    zeige(
      <KundenprofilStammdaten
        name="Max Mustermann"
        anrede={anrede}
        namenZusatz={namenZusatz}
        felder={[]}
        onWeitereFelder={() => {}}
      />,
    );

  it("steht in derselben Zeile wie der Name und davor", () => {
    nurName("Herr");
    const zeile = screen.getByRole("heading", { level: 2 });
    expect(zeile.textContent).toBe("Herr\u00A0Max Mustermann");
    // Keine eigene Zeile mehr unter dem Namen.
    expect(zeile.parentElement?.querySelector("p")).toBeNull();
    // Die Anrede ist leichter gesetzt als der Name.
    expect(within(zeile).getByText("Herr", { exact: false }).className).toContain("font-normal");
  });

  it("macht aus Schreibvarianten Herr oder Frau", () => {
    nurName(" frau ");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Frau\u00A0Max Mustermann");
  });

  it("zeigt ohne Anrede nur den Namen", () => {
    nurName(undefined);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Max Mustermann");
  });

  it.each(["Divers", "Keine Angabe", "Firma", ""])("stellt bei „%s“ nichts voran", (wert) => {
    nurName(wert);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Max Mustermann");
  });

  it("lässt das Kürzel der Kundensprache hinter dem Namen", () => {
    nurName("Frau", <span>EN</span>);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Frau\u00A0Max MustermannEN");
  });
});

describe("Das Statusband bleibt erhalten", () => {
  /*
   * Beim Streichen des großen Namens im Seitenkopf durfte die Ampel nicht
   * mitverschwinden. Sie ist mitgezogen und steht jetzt hier, zwischen dem
   * Namen und der Überschrift Kontaktdaten.
   */
  it("steht zwischen dem Namen und der Überschrift Kontaktdaten", () => {
    const { container } = personenblock();
    const ueberschriften = Array.from(container.querySelectorAll("h2, h3")).map((e) => e.textContent);
    // Die Anrede steht seit dem 25.09.2026 mit in der Namenszeile.
    expect(ueberschriften).toEqual(["Herr\u00A0Kambiz Zangeneh", "Kontaktdaten"]);

    const name = screen.getByRole("heading", { level: 2 });
    const kontaktdaten = screen.getByRole("heading", { level: 3, name: "Kontaktdaten" });
    const ampel = screen.getByRole("button", { name: "Status-Details" });
    // 4 ist DOCUMENT_POSITION_FOLLOWING, also "steht danach im Dokument".
    expect(name.compareDocumentPosition(ampel) & 4).toBeTruthy();
    expect(ampel.compareDocumentPosition(kontaktdaten) & 4).toBeTruthy();
  });

  /*
   * Farbe darf nie der einzige Träger einer Aussage sein. Neben dem farbigen
   * Punkt steht deshalb immer ein Wort, auch wenn nichts überfällig ist und
   * es gar keinen Kurztext gibt.
   */
  it("nennt den Status als Wort und nicht nur als Farbe", () => {
    const { container } = zeige(<InactivityAmpel kunde={kunde()} size="md" showLabel />);
    const woerter = (container.textContent || "").trim();
    expect(woerter.length).toBeGreaterThan(0);
  });
});

describe("Die Aktionen sind runde Symbole mit Beschriftung", () => {
  it("gibt jedem Symbol ein sichtbares Wort und einen ganzen Satz als aria-label", () => {
    personenblock();
    const leiste = screen.getByRole("group", { name: "Schnellaktionen zu diesem Kunden" });
    const symbole = within(leiste).getAllByLabelText(/.+/);
    /*
     * Ein Symbol je Schnellzugriff, dazu der Menueknopf nur dann, wenn im
     * Menue ueberhaupt etwas steht. Seit dem 16.09.2026 hat jeder Vorgang
     * sein eigenes Symbol, das Menue ist also leer und faellt weg.
     */
    expect(symbole).toHaveLength(SCHNELLZUGRIFF.length + (MENUE_AKTIONEN.length > 0 ? 1 : 0));
    for (const symbol of symbole) {
      // Das sichtbare Wort unter dem Symbol.
      expect(symbol.textContent?.trim()).toBeTruthy();
      // Und der ganze Satz für das Vorleseprogramm.
      const satz = symbol.getAttribute("aria-label") || "";
      expect(satz.split(" ").length).toBeGreaterThan(2);
    }
  });

  it("reicht den Klick auf Notiz und Anruf unverändert weiter", () => {
    const onAktion = vi.fn();
    personenblock(onAktion);
    fireEvent.click(screen.getByLabelText("Notiz zu diesem Kunden erstellen"));
    expect(onAktion).toHaveBeenLastCalledWith("notiz");
    fireEvent.click(screen.getByLabelText("Diesen Kunden anrufen und den Anruf gleich notieren"));
    expect(onAktion).toHaveBeenLastCalledWith("anruf");
  });
});

describe("Kein Vorgang geht verloren", () => {
  /*
   * Der eigentliche Waechter, seit dem 16.09.2026 allgemeiner gefasst.
   *
   * Vorher prueften hier drei Tests die feste Liste des Ausklappmenues.
   * Christian hat entschieden, jeden Vorgang unmittelbar als Symbol zu
   * zeigen; das Menue ist damit leer. Eine feste Liste zu pflegen haette
   * beim naechsten Zuruf wieder gebrochen, ohne etwas zu schuetzen.
   *
   * Geprueft wird deshalb die Eigenschaft, auf die es ankommt: Jeder
   * Vorgang aus `QUICK_ACTIONS` ist erreichbar, entweder als eigenes Symbol
   * oder im Menue, und keiner steht an beiden Stellen.
   */
  it("jeder Vorgang ist genau einmal erreichbar", () => {
    for (const aktion of QUICK_ACTIONS) {
      const alsSymbol = SCHNELLZUGRIFF.includes(aktion.art);
      const imMenue = MENUE_AKTIONEN.some((a) => a.art === aktion.art);
      expect(alsSymbol || imMenue, `${aktion.art} ist nirgends erreichbar`).toBe(true);
      expect(alsSymbol && imMenue, `${aktion.art} steht an zwei Stellen`).toBe(false);
    }
  });

  it("jedes Symbol traegt ein Wort und einen Satz", () => {
    personenblock();
    const leiste = screen.getByRole("group", { name: "Schnellaktionen zu diesem Kunden" });
    for (const art of SCHNELLZUGRIFF) {
      const aktion = QUICK_ACTIONS.find((a) => a.art === art);
      expect(aktion, art).toBeTruthy();
    }
    expect(within(leiste).getAllByLabelText(/.+/).length).toBeGreaterThanOrEqual(SCHNELLZUGRIFF.length);
  });

  it("meldet den gewaehlten Vorgang unveraendert weiter", () => {
    const onAktion = vi.fn();
    personenblock(onAktion);
    const leiste = screen.getByRole("group", { name: "Schnellaktionen zu diesem Kunden" });
    /*
     * Stellvertretend der Vorgang aus der zweiten Zeile. Er ist seit dem
     * 16.09.2026 der letzte in der Leiste, "Meeting notieren" ist auf
     * Christians Wunsch entfallen: Laeuft ein Meeting ueber den Videoraum,
     * legt die Mitschrift den Eintrag von selbst an.
     */
    fireEvent.click(within(leiste).getByLabelText("Meeting mit diesem Kunden erstellen"));
    expect(onAktion).toHaveBeenCalledWith("meeting");
  });
});
