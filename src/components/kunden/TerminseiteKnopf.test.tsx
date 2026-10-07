import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * Der Knopf, der die eigene Terminseite für genau ein Gespräch öffnet.
 *
 * Christian am 21.09.2026: In der Objektauswahl und in der Finanzierung soll je
 * ein Knopf stehen, der auf die Terminseite mit dem hinterlegten Kalender führt.
 *
 * Geprüft wird vor allem, was hier still schiefgehen kann: ein zweiter Link je
 * Klick, eine Adresse auf die Vorschau statt auf das Portal, und ein Knopf, der
 * ins Leere führt, weil gar kein Kalender hinterlegt ist.
 */

const spione = vi.hoisted(() => ({
  ladeLinks: vi.fn(),
  erstelleLink: vi.fn(),
  toast: vi.fn(),
  hinweis: vi.fn(),
  links: { erstgespraech: "", beratung: "", objektvorstellung: "", finanzierungsgespraech: "" },
}));

vi.mock("@/lib/buchungStore", async (original) => ({
  istExternerLink: (await original<typeof import("@/lib/buchungStore")>()).istExternerLink,
  ladeLinks: spione.ladeLinks,
  erstelleLink: spione.erstelleLink,
}));
vi.mock("@/lib/buchungZeitenMeldung", () => ({
  buchungFehlerMeldung: () => ({ titel: "Ging nicht", text: "Grund" }),
}));
vi.mock("@/hooks/use-toast", () => ({ toast: spione.toast }));
vi.mock("@/lib/confirm", () => ({ hinweisDialog: spione.hinweis }));
vi.mock("@/lib/eigeneBuchungslinks", async () => {
  const echt = await vi.importActual<typeof import("@/lib/eigeneBuchungslinks")>("@/lib/eigeneBuchungslinks");
  /*
    Der Mock muss dieselbe Form liefern wie der echte Hook, sonst prueft der
    Test eine Fiktion. Genau das ist am 21.09.2026 passiert: Der Hook bekam ein
    `laedt` dazu und gab ab da `{ links, laedt }` zurueck, der Mock blieb beim
    nackten Objekt. Der Knopf las `links[anlass]`, bekam `undefined`, rief
    darauf `.trim()` und warf. Im Browser passierte auf einen Klick gar nichts,
    und der Test blieb gruen.

    Die Typpruefung faengt das nicht: `strict` und `noImplicitAny` stehen in
    `tsconfig.app.json` auf false.
  */
  return { ...echt, useEigeneBuchungslinks: () => ({ links: spione.links, laedt: false }) };
});

import { TerminseiteKnopf } from "./TerminseiteKnopf";
import { BuchungskalenderListe } from "./BuchungskalenderListe";

const geoeffnet: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  geoeffnet.length = 0;
  spione.links = {
    erstgespraech: "", beratung: "",
    objektvorstellung: "https://calendly.com/x/objekt",
    finanzierungsgespraech: "",
  };
  spione.ladeLinks.mockResolvedValue([]);
  spione.erstelleLink.mockResolvedValue({ link: { id: "l1", token: "neu-tok", aktiv: true }, fehler: null });
  vi.stubGlobal("open", (url: string) => { geoeffnet.push(url); return null; });
  Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => {}) } });
});

function zeichne() {
  return render(
    <TerminseiteKnopf
      kontaktId="k1"
      kontaktName="Testkunde"
      kontaktEmail="test@example.de"
      investmentId="inv-1"
      anlass="objektvorstellung"
      beschriftung="Objektvorstellungsgespräch vereinbaren"
    />,
  );
}

describe("Die Adresse, die entsteht", () => {
  /*
    Die eigene Ansicht oeffnet auf der Adresse, auf der der Partner angemeldet
    ist. Nur dort gibt die Datenbank ihm die Kundendaten (29.09.2026).
  */
  it("öffnet die Seite auf der aktuellen Adresse und nennt den Anlass", async () => {
    zeichne();
    fireEvent.click(screen.getByText("Objektvorstellungsgespräch vereinbaren"));
    await waitFor(() => expect(geoeffnet).toHaveLength(1));
    expect(geoeffnet[0]).toBe(`${window.location.origin}/terminwahl/neu-tok?anlass=objektvorstellung`);
  });

  /*
    Seit dem 29.09.2026 ist die Seite nur noch für den Partner selbst. Eine
    Adresse zum Weitergeben gibt es nicht mehr.
  */
  it("legt nichts in die Zwischenablage", async () => {
    zeichne();
    fireEvent.click(screen.getByText("Objektvorstellungsgespräch vereinbaren"));
    await waitFor(() => expect(geoeffnet).toHaveLength(1));
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });
});

describe("Kein zweiter Link je Klick", () => {
  /*
    Wuerde jeder Klick einen neuen Link erzeugen, sammelten sich in der Akte
    Dutzende, und ein bereits verschickter zeigte auf einen anderen Vorgang als
    der zuletzt geoeffnete.
  */
  it("nimmt den vorhandenen Link ohne Terminart", async () => {
    spione.ladeLinks.mockResolvedValue([
      { id: "alt", token: "alt-tok", aktiv: true, terminart_id: null, einmalig: false },
    ]);
    zeichne();
    fireEvent.click(screen.getByText("Objektvorstellungsgespräch vereinbaren"));
    await waitFor(() => expect(geoeffnet).toHaveLength(1));
    expect(spione.erstelleLink).not.toHaveBeenCalled();
    expect(geoeffnet[0]).toContain("/terminwahl/alt-tok");
  });

  it("lässt einen Link unserer eigenen Buchungsstrecke liegen", async () => {
    spione.ladeLinks.mockResolvedValue([
      { id: "alt", token: "alt-tok", aktiv: true, terminart_id: "art-1", einmalig: false },
    ]);
    zeichne();
    fireEvent.click(screen.getByText("Objektvorstellungsgespräch vereinbaren"));
    await waitFor(() => expect(spione.erstelleLink).toHaveBeenCalled());
    expect(geoeffnet[0]).toContain("/terminwahl/neu-tok");
  });

  it("lässt einen internen Link ohne Terminart liegen und legt einen externen an", async () => {
    // Seit dem 27.09.2026 entscheidet `ziel`. Ein interner Link, dessen
    // Terminart geloescht wurde, fuehrt in unsere Strecke mit Videoraum und
    // gehoert nicht auf die Terminseite.
    spione.ladeLinks.mockResolvedValue([
      { id: "alt", token: "alt-tok", aktiv: true, terminart_id: null, einmalig: false, ziel: "intern" },
    ]);
    zeichne();
    fireEvent.click(screen.getByText("Objektvorstellungsgespräch vereinbaren"));
    await waitFor(() => expect(spione.erstelleLink).toHaveBeenCalled());
    expect(spione.erstelleLink.mock.calls[0][0]).toMatchObject({ ziel: "extern", terminartId: null });
  });

  /*
    Das Investment am Link geht in der Datenbank jeder Auswahl vor, und die
    Seite fragt dann nicht mehr „Gehört zu“. Ein Link eines anderen
    Investments haengte den Termin an das falsche Objekt (29.09.2026).
  */
  it("lässt einen Link liegen, der an einem anderen Investment hängt", async () => {
    spione.ladeLinks.mockResolvedValue([
      { id: "alt", token: "alt-tok", aktiv: true, terminart_id: null, einmalig: false, investment_id: "inv-2" },
    ]);
    zeichne();
    fireEvent.click(screen.getByText("Objektvorstellungsgespräch vereinbaren"));
    await waitFor(() => expect(spione.erstelleLink).toHaveBeenCalled());
    expect(spione.erstelleLink.mock.calls[0][0]).toMatchObject({ investmentId: "inv-1" });
    expect(geoeffnet[0]).toContain("/terminwahl/neu-tok");
  });

  it("nimmt einen Link desselben Investments", async () => {
    spione.ladeLinks.mockResolvedValue([
      { id: "alt", token: "alt-tok", aktiv: true, terminart_id: null, einmalig: false, investment_id: "inv-1" },
    ]);
    zeichne();
    fireEvent.click(screen.getByText("Objektvorstellungsgespräch vereinbaren"));
    await waitFor(() => expect(geoeffnet).toHaveLength(1));
    expect(spione.erstelleLink).not.toHaveBeenCalled();
    expect(geoeffnet[0]).toContain("/terminwahl/alt-tok");
  });

  it("lässt einen einmaligen Link liegen, er wäre nach dem ersten Termin tot", async () => {
    spione.ladeLinks.mockResolvedValue([
      { id: "alt", token: "alt-tok", aktiv: true, terminart_id: null, einmalig: true },
    ]);
    zeichne();
    fireEvent.click(screen.getByText("Objektvorstellungsgespräch vereinbaren"));
    await waitFor(() => expect(spione.erstelleLink).toHaveBeenCalled());
  });
});

describe("Ohne hinterlegten Kalender", () => {
  /*
    Die Terminseite zeigte dem Kunden sonst eine leere Auswahl. Der Hinweis
    nennt die Stelle, an der es fehlt.
  */
  it("erklärt es und erzeugt keinen Link", async () => {
    spione.links = { erstgespraech: "", beratung: "", objektvorstellung: "", finanzierungsgespraech: "" };
    zeichne();
    fireEvent.click(screen.getByText("Objektvorstellungsgespräch vereinbaren"));
    await waitFor(() => expect(spione.hinweis).toHaveBeenCalled());
    expect(spione.erstelleLink).not.toHaveBeenCalled();
    expect(geoeffnet).toHaveLength(0);
  });
});

/*
  Im Meeting-Dialog stand bis zum 21.09.2026 in jeder der vier Zeilen ein
  eigener Knopf. Christian wollte einen einzigen Klick auf die allgemeine
  Terminseite, und die Wahl des Anliegens faellt dort.
*/
describe("Die Liste im Meeting-Dialog", () => {
  function zeichneListe() {
    return render(
      <BuchungskalenderListe
        links={spione.links}
        kontaktId="k1"
        kontaktName="Testkunde"
        kontaktEmail="test@example.de"
        investmentId="inv-1"
      />,
    );
  }

  it("hat nur noch einen Knopf zur Terminseite", () => {
    zeichneListe();
    expect(screen.getAllByText("Terminseite öffnen")).toHaveLength(1);
    expect(screen.queryByText("Terminseite")).not.toBeInTheDocument();
  });

  it("zeigt die vier Gesprächsarten weiter als Hinweis", () => {
    zeichneListe();
    expect(screen.getByText("Erstgespräch")).toBeInTheDocument();
    expect(screen.getByText("Objektgespräch")).toBeInTheDocument();
    // Ein fehlender Kalender bleibt sichtbar, samt Weg in die Einstellungen.
    expect(screen.getAllByText("Hinterlegen")).toHaveLength(3);
  });

  it("öffnet die Terminseite ohne vorgewähltes Anliegen", async () => {
    zeichneListe();
    fireEvent.click(screen.getByText("Terminseite öffnen"));
    await waitFor(() => expect(geoeffnet).toHaveLength(1));
    // Nur öffnen, nichts kopieren; der neue Link trägt das Investment aus dem Dialog.
    expect(geoeffnet[0]).toBe(`${window.location.origin}/terminwahl/neu-tok`);
    expect(spione.erstelleLink.mock.calls[0][0]).toMatchObject({ investmentId: "inv-1", ziel: "extern", einmalig: false });
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });

  /*
    Ohne einen einzigen hinterlegten Kalender fuehrt die Terminseite in eine
    leere Auswahl. Dann erklaert der Hinweis, wo es fehlt.
  */
  it("erklärt es, wenn gar kein Kalender hinterlegt ist", async () => {
    spione.links = { erstgespraech: "", beratung: "", objektvorstellung: "", finanzierungsgespraech: "" };
    zeichneListe();
    fireEvent.click(screen.getByText("Terminseite öffnen"));
    await waitFor(() => expect(spione.hinweis).toHaveBeenCalled());
    expect(geoeffnet).toHaveLength(0);
  });
});

describe("Wenn das Anlegen scheitert", () => {
  it("meldet den Grund und öffnet nichts", async () => {
    spione.erstelleLink.mockResolvedValue({ link: null, fehler: new Error("keine Rechte") });
    zeichne();
    fireEvent.click(screen.getByText("Objektvorstellungsgespräch vereinbaren"));
    await waitFor(() => expect(spione.toast).toHaveBeenCalled());
    expect(geoeffnet).toHaveLength(0);
  });
});
