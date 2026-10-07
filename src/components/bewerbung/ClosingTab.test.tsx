import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";

// Der Reiter Closing in seinen fünf Zuständen (Anhang B der Strategie).
// Store, Toast, Supabase und die Versandwege werden gemockt; geprüft wird,
// welche Karten gesperrt, offen oder eingeklappt sind, dass eingeklappte
// Karten per Stift wieder aufgehen, und WOMIT der Store aufgerufen wird.

vi.mock("@/lib/bewerbungStore", () => ({
  updateBewerber: vi.fn(),
  changeBewerberStatus: vi.fn(),
}));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@/lib/vertragGenerator", () => ({ buildVertragPdf: vi.fn(), uploadVertragPdf: vi.fn() }));
vi.mock("@/lib/bewerberAbsageMail", () => ({ sendeBewerberAbsageMail: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/startfahrplanVersand", () => ({
  sendeStartfahrplan: vi.fn().mockResolvedValue({ fassung: "standard" }),
  waehleStartfahrplanFassung: vi.fn(() => "standard"),
}));
vi.mock("@/integrations/supabase/client", () => {
  const abfrage = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  const kanal = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() };
  return {
    supabase: {
      from: vi.fn(() => abfrage),
      channel: vi.fn(() => kanal),
      removeChannel: vi.fn(),
    },
  };
});

import { ClosingTab } from "./ClosingTab";
import { updateBewerber, changeBewerberStatus, type Bewerber } from "@/lib/bewerbungStore";
import { supabase } from "@/integrations/supabase/client";
import { VERTRAGS_FASSUNG, VERTRAGS_FASSUNG_ALT } from "@/lib/vertragKonditionen";
import { moderationsUrl, praesentationsUrl } from "@/lib/praesentationsKopplung";

function baueBewerber(teil: Partial<Bewerber> = {}): Bewerber {
  return {
    id: "closing-1",
    vorname: "Max",
    nachname: "Muster",
    email: "max@example.com",
    telefon: "", ort: "", quelle: "", beworben: "", stelleId: "", stelleTitel: "",
    status: "Closing",
    bewertung: 0,
    erstelltAm: new Date().toISOString(),
    typ: "", typLabel: "", typBeschreibung: "", typEignung: "", erfahrung: "",
    motivation: "", notizen: "", ziele: "", beschaeftigungsart: "", onboardingTerminId: "",
    lebenslaufUrl: "", dokumente: [], vertragStatus: "nicht_gesendet", vertragDatum: "",
    benachrichtigungen: [], chatVerknuepft: false,
    ausgangslage: "", zielBest: "", wieStarten: "",
    notizenLog: [], adresse: "", rechnungsAdresse: "",
    closingTerminDatum: "01.09.2026", closingTerminUhrzeit: "14:00",
    erstgespraechSkript: {
      ausgangslage: "", ziele: "", motivation: "", vorErfahrung: "",
      einwand: "", budget: "", naechsterSchritt: "",
      durchgefuehrtAm: "", durchgefuehrtVon: "",
    },
    paketwahl: "", zahlungsweise: "",
    vertragPdfUrl: "", vertragSignedPdfUrl: "", vertragSignedAt: "", vertragHrName: "",
    vertragVersion: 0, rechnungNr: "", rechnungPdfUrl: "", rechnungErstelltAm: "",
    rechnungBezahltBestaetigungen: [], rechnungBezahltAm: "",
    userAccountId: "", userInviteSentAt: "", karriereStufe: "",
    onboardingChecklist: [], academyPflichtModule: [], aktivAm: "",
    geworbenVonUserId: "", geworbenVonName: "",
    ...teil,
  } as Bewerber;
}

const ADRESSEN = {
  vertragsAdresse: "Max Muster\nMusterstraße 12\n15749 Mittenwalde",
  rechnungsAdresse: "Muster Consulting GmbH\nGewerbepark 3\n83022 Rosenheim\nUSt-IdNr.: DE123456789",
};

// Das Tracking wird nach dem ersten Rendern asynchron geladen; darauf warten,
// damit keine act-Warnungen entstehen.
const renderTab = async (b: Bewerber, canEdit = true) => {
  await act(async () => {
    render(<ClosingTab bewerber={b} canEdit={canEdit} hrName="Sarah HR" onRefresh={() => {}} />);
  });
};

const karte = (nr: number) => screen.getByTestId(`closing-karte-${nr}`);
const zustandVon = (nr: number) => karte(nr).getAttribute("data-zustand");

/**
 * Einträge der Mail-Verfolgung für den nächsten Aufbau festlegen. Die
 * Abfragekette des Mocks endet in `order`, deshalb hängt die Antwort dort.
 */
const setzeTrackings = (zeilen: unknown[]) => {
  const abfrage = (supabase.from as unknown as ReturnType<typeof vi.fn>)("bewerber_mail_tracking") as {
    order: ReturnType<typeof vi.fn>;
  };
  abfrage.order.mockResolvedValue({ data: zeilen, error: null });
};

beforeEach(() => {
  vi.mocked(updateBewerber).mockClear();
  vi.mocked(changeBewerberStatus).mockClear();
});

describe("ClosingTab, Zustand a: Ausgangszustand nach dem Erstgespräch", () => {
  it("zeigt Termin, nächsten Schritt, Karte 1 offen und die Karten 3, 4 und 6 gesperrt", async () => {
    await renderTab(baueBewerber());
    expect(screen.getByText(/Closing-Termin: 01\.09\.2026 um 14:00 Uhr/)).toBeInTheDocument();
    expect(screen.getByTestId("closing-naechster-schritt")).toHaveTextContent("Präsentation starten (Teil 2) und Entscheidung erfassen");
    expect(zustandVon(1)).toBe("offen");
    expect(zustandVon(2)).toBe("offen");
    expect(zustandVon(3)).toBe("gesperrt");
    expect(zustandVon(4)).toBe("gesperrt");
    expect(zustandVon(5)).toBe("offen");
    expect(zustandVon(6)).toBe("gesperrt");
  });

  it("Karte 1 öffnet Präsentation und Moderation des Videocalls, ohne die alten Sprechsätze", async () => {
    await renderTab(baueBewerber());
    const praes = screen.getByRole("link", { name: /Videocall: Präsentation öffnen/ });
    expect(praes.getAttribute("href")).toContain("/closing-praesentation-entwurf");
    expect(praes.getAttribute("href")).toContain("bewerberId=closing-1");
    const mod = screen.getByRole("link", { name: /Moderation öffnen/ });
    expect(mod.getAttribute("href")).toContain("/closing-moderation");
    expect(mod.getAttribute("href")).toContain("bewerberId=closing-1");
    // Die alte Closing-Präsentation ist entfernt, samt ihrer Wahl zwischen Teil 1 und Teil 2.
    expect(screen.queryByRole("link", { name: /Closing-Präsentation öffnen/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId("closing-einstieg")).not.toBeInTheDocument();
    expect(screen.queryByText(/22 Folien/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Schön, dass wir uns heute in einem Zoom sehen/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Lass uns gemeinsam durch unsere Closing-Präsentation gehen/)).not.toBeInTheDocument();
    expect(screen.getByText(/Videocall: Präsentationsfenster teilen/)).toBeInTheDocument();
  });

  /*
   * Bis zum 23.09.2026 hing am Stand des Erstgesprächs, ob die alte
   * Präsentation ab Teil 1 oder nur mit Teil 2 startete, samt Knopf zum
   * Übersteuern. Der Videocall kennt keine Teile mehr: Dieselben Adressen, ob
   * das Skript leer, angefangen oder abgeschlossen ist.
   */
  it("der Stand des Erstgesprächs ändert nichts mehr an den beiden Adressen", async () => {
    const praes = praesentationsUrl("closing-1", 1, "Max Muster");
    const mod = moderationsUrl("closing-1", 1);
    const skripte: Partial<Bewerber["erstgespraechSkript"]>[] = [
      { durchgefuehrtAm: "", assessment: { ersteindruck: "offen", pfade: ["vertrieb"] } },
      { durchgefuehrtAm: "2026-09-01T10:00:00.000Z" },
    ];
    for (const teil of skripte) {
      const { unmount } = render(
        <ClosingTab
          bewerber={baueBewerber({
            erstgespraechSkript: {
              ausgangslage: "", ziele: "", motivation: "", vorErfahrung: "",
              einwand: "", budget: "", naechsterSchritt: "", durchgefuehrtVon: "", durchgefuehrtAm: "",
              ...teil,
            },
          })}
          canEdit
          hrName="Sarah HR"
          onRefresh={() => {}}
        />,
      );
      await act(async () => {});
      expect(screen.getByRole("link", { name: /Videocall: Präsentation öffnen/ })).toHaveAttribute("href", praes);
      expect(screen.getByRole("link", { name: /Moderation öffnen/ })).toHaveAttribute("href", mod);
      expect(screen.queryByTestId("closing-einstieg")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Trotzdem ab Teil 1 starten/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Nur Teil 2/ })).not.toBeInTheDocument();
      unmount();
    }
  });

  it("Ja, will starten wird sofort gespeichert, wie in Teil 2", async () => {
    await renderTab(baueBewerber());
    fireEvent.click(screen.getByRole("button", { name: /Ja, will starten/ }));
    expect(updateBewerber).toHaveBeenCalledWith("closing-1", { closingEntscheidung: "ja" });
  });

  it("Nein blendet den Verlust-Grund ein und den Startfahrplan aus", async () => {
    await renderTab(baueBewerber());
    fireEvent.click(screen.getByRole("button", { name: /Nein, möchte nicht starten/ }));
    expect(screen.getByTestId("nein-block")).toBeInTheDocument();
    expect(screen.queryByTestId("closing-karte-5")).not.toBeInTheDocument();
    expect(updateBewerber).not.toHaveBeenCalled();
  });

  it("ohne Bearbeitungsrecht sind die Entscheidungsknöpfe gesperrt", async () => {
    await renderTab(baueBewerber(), false);
    expect(screen.getByRole("button", { name: /Ja, will starten/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Braucht Bedenkzeit/ })).toBeDisabled();
  });
});

/**
 * Seit dem 23.09.2026 öffnet Karte 1 für jeden Bewerber denselben Videocall,
 * die alte Closing-Präsentation ist entfernt. Das Kennzeichen des Bewerbers
 * (bewerberprozessZuordnung.ts, abgeleitet über bewerberArbeitsplatz.ts)
 * entscheidet nur noch über den Hinweis unter den Knöpfen.
 */
describe("ClosingTab, Karte 1: welcher Ablauf hinter den Knöpfen liegt", () => {
  it("ohne Kennzeichen öffnen beide Knöpfe den Videocall, ohne ablauf in der Adresse", async () => {
    await renderTab(baueBewerber());
    const praes = screen.getByRole("link", { name: /Videocall: Präsentation öffnen/ });
    const mod = screen.getByRole("link", { name: /Moderation öffnen/ });
    expect(praes).toHaveAttribute("href", praesentationsUrl("closing-1", 1, "Max Muster"));
    expect(mod).toHaveAttribute("href", moderationsUrl("closing-1", 1));
    expect(praes.getAttribute("href")).not.toContain("ablauf");
    expect(mod.getAttribute("href")).not.toContain("ablauf");
    // Keine Wahl zwischen Teil 1 und Teil 2 mehr, dafür der ehrliche Hinweis,
    // dass die Folien am Kennenlernbogen hängen.
    expect(screen.queryByTestId("closing-einstieg")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Nur Teil 2/ })).not.toBeInTheDocument();
    const hinweis = screen.getByTestId("closing-einstieg-videocall");
    expect(hinweis).toHaveTextContent("Präsentation im Videocall");
    expect(hinweis).toHaveTextContent("Kennenlernbogen");
    expect(screen.queryByTestId("closing-einstieg-neu")).not.toBeInTheDocument();
  });

  it("ein leeres Kennzeichen zählt wie gar keins", async () => {
    await renderTab(baueBewerber({ prozess: "" }));
    expect(screen.getByTestId("closing-einstieg-videocall")).toBeInTheDocument();
    expect(screen.queryByTestId("closing-einstieg-neu")).not.toBeInTheDocument();
  });

  it("mit prozess neu führen die Knöpfe an dieselben Adressen, nur der Hinweis ist ein anderer", async () => {
    await renderTab(baueBewerber({ prozess: "neu" }));
    const praes = screen.getByRole("link", { name: /Videocall: Präsentation öffnen/ });
    const mod = screen.getByRole("link", { name: /Moderation öffnen/ });
    expect(praes).toHaveAttribute("href", praesentationsUrl("closing-1", 1, "Max Muster"));
    expect(mod).toHaveAttribute("href", moderationsUrl("closing-1", 1));
    expect(praes.getAttribute("href")).not.toContain("ablauf");
    // Nur noch ein Termin, also keine Wahl zwischen Teil 1 und Teil 2 mehr.
    expect(screen.queryByTestId("closing-einstieg")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Nur Teil 2/ })).not.toBeInTheDocument();
    expect(screen.getByTestId("closing-einstieg-neu")).toHaveTextContent("Ein Termin, eine Präsentation");
    expect(screen.queryByTestId("closing-einstieg-videocall")).not.toBeInTheDocument();
  });

  it("der Rest des Reiters bleibt im neuen Ablauf unangetastet", async () => {
    await renderTab(baueBewerber({ prozess: "neu" }));
    // Entscheidung, Bedenkzeit samt Pflichttermin (Frage W2) und Paketwahl
    // stehen weiter da, sie gehören nicht zur Präsentation.
    expect(screen.getByRole("button", { name: /Ja, will starten/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Nein, möchte nicht starten/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Braucht Bedenkzeit/ }));
    expect(screen.getByTestId("bedenkzeit-block")).toBeInTheDocument();
  });
});

describe("ClosingTab, Zustand b: Ja mit Paket", () => {
  const b = () => baueBewerber({ status: "Paketwahl", closingEntscheidung: "ja", paketwahl: "junior" });

  it("Karten 1 bis 3 sind eingeklappt, Adressen offen, Vertrag gesperrt", async () => {
    await renderTab(b());
    expect(zustandVon(1)).toBe("kompakt");
    expect(zustandVon(2)).toBe("kompakt");
    expect(zustandVon(3)).toBe("kompakt");
    expect(zustandVon(4)).toBe("offen");
    expect(zustandVon(6)).toBe("gesperrt");
    // Die Balken tragen nur Nummer, Namen und den Knopf. Alle Ergebnisse
    // stehen in der Seitenleiste.
    expect(within(karte(2)).queryByText("Ja, will starten")).not.toBeInTheDocument();
    expect(within(karte(3)).queryByText(/Vertriebspartner/)).not.toBeInTheDocument();
    expect(within(karte(4)).queryByText("Pflicht vor dem Vertrag")).not.toBeInTheDocument();
    const stand = screen.getByTestId("closing-seitenleiste-fortschritt");
    expect(stand).toHaveTextContent("Ja, will starten");
    expect(stand).toHaveTextContent("Vertriebspartner");
    expect(stand).toHaveTextContent("4 % Provision · kein laufendes Entgelt");
    expect(changeBewerberStatus).not.toHaveBeenCalled();
  });

  it("der Stift klappt Karte 3 auf, Einklappen schließt sie wieder", async () => {
    await renderTab(b());
    // Bis zum 06.09.2026 hieß der erste Kasten "Vertragsschalter" (Servicevereinbarung,
    // Mindestlaufzeit). Beides ist entfallen; die Wettbewerbsklausel steht weiter in Karte 3.
    expect(screen.queryByText(/Wettbewerbsklausel/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Schritt 3 bearbeiten" }));
    expect(zustandVon(3)).toBe("offen");
    expect(screen.getByText(/Wettbewerbsklausel/)).toBeInTheDocument();
    expect(screen.getByText(/Individuelle Provisionssätze/)).toBeInTheDocument();
    expect(screen.getByText("Lead-Paket (optional)")).toBeInTheDocument();
    expect(screen.getByText(/Erhaltene Leistungen/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Schritt 3 einklappen" }));
    expect(zustandVon(3)).toBe("kompakt");
  });

  it("Speichern in Karte 3 schreibt Paket und Konditionen über den Store", async () => {
    await renderTab(b());
    fireEvent.click(screen.getByRole("button", { name: "Schritt 3 bearbeiten" }));
    fireEvent.click(screen.getByRole("button", { name: "Paket und Konditionen speichern" }));
    expect(updateBewerber).toHaveBeenCalledWith("closing-1", expect.objectContaining({
      paketwahl: "junior",
      closingEntscheidung: "ja",
    }));
  });

  it("Teil 2 im Gespräch: Werte sind als übernommen gekennzeichnet", async () => {
    await renderTab(baueBewerber({
      status: "Paketwahl", closingEntscheidung: "ja", paketwahl: "junior",
      erstgespraechSkript: {
        ausgangslage: "", ziele: "", motivation: "", vorErfahrung: "",
        einwand: "", budget: "", naechsterSchritt: "", durchgefuehrtAm: "", durchgefuehrtVon: "",
        closingDirekt: { aktiv: true },
      },
    }));
    expect(screen.getAllByTitle("aus dem Gespräch übernommen").length).toBeGreaterThanOrEqual(2);
  });

  it("Teil 2 komplett, aber Erstgespräch nicht abgeschlossen: Karte 1 erledigt, mit Hinweis zum Abschließen", async () => {
    await renderTab(baueBewerber({
      status: "Paketwahl", closingEntscheidung: "ja", paketwahl: "junior",
      erstgespraechSkript: {
        ausgangslage: "", ziele: "", motivation: "", vorErfahrung: "",
        einwand: "", budget: "", naechsterSchritt: "", durchgefuehrtAm: "", durchgefuehrtVon: "",
        closingDirekt: { aktiv: true },
      },
    }));
    expect(zustandVon(1)).toBe("kompakt");
    // Ohne Abschluss des Erstgesprächs nennt der Fortschritt nur den Termin.
    expect(screen.getByTestId("closing-seitenleiste-fortschritt")).toHaveTextContent("Termin 01.09.2026 um 14:00 Uhr");
    expect(screen.getByTestId("closing-seitenleiste-fortschritt")).not.toHaveTextContent("Closing-Gespräch geführt am");
    fireEvent.click(screen.getByRole("button", { name: "Schritt 1 bearbeiten" }));
    expect(screen.getByTestId("closing-karte-1-gespraech")).toHaveTextContent("Aus Teil 2 bereits übernommen");
    expect(screen.getByTestId("closing-karte-1-gespraech")).toHaveTextContent("noch nicht abgeschlossen");
    // Der Hinweis sagt, was das Abschließen bringt. Eine Teilwahl gibt es nicht mehr.
    expect(screen.getByTestId("closing-karte-1-gespraech")).toHaveTextContent("dann steht hier das Datum des Gesprächs");
    expect(screen.queryByTestId("closing-einstieg")).not.toBeInTheDocument();
  });

  it("Teil 1 abgeschlossen und Teil 2 komplett: Karte 1 eingeklappt mit Datum, Einstieg nur Teil 2", async () => {
    await renderTab(baueBewerber({
      status: "Paketwahl", closingEntscheidung: "ja", paketwahl: "junior",
      erstgespraechSkript: {
        ausgangslage: "", ziele: "", motivation: "", vorErfahrung: "",
        einwand: "", budget: "", naechsterSchritt: "", durchgefuehrtVon: "Sarah",
        durchgefuehrtAm: "2026-09-01T10:00:00.000Z",
        closingDirekt: { aktiv: true, qualiCallAngeboten: true, notizen: { rechnerAbschluesse: "2" } },
      },
    }));
    expect(zustandVon(1)).toBe("kompakt");
    expect(within(karte(1)).queryByText(/geführt am/)).not.toBeInTheDocument();
    expect(screen.getByTestId("closing-seitenleiste-fortschritt"))
      .toHaveTextContent("Erstgespräch und Closing-Gespräch geführt am 01.09.2026");
    fireEvent.click(screen.getByRole("button", { name: "Schritt 1 bearbeiten" }));
    expect(screen.getByTestId("closing-karte-1-gespraech")).toHaveTextContent("Erstgespräch und Closing-Gespräch bereits geführt am 01.09.2026");
    expect(screen.getByTestId("closing-karte-1-gespraech")).not.toHaveTextContent("noch nicht abgeschlossen");
    expect(screen.queryByTestId("closing-einstieg")).not.toBeInTheDocument();
    // Rechnerwert und Folge-Call aus Teil 2 sind sichtbar.
    expect(screen.getByTestId("closing-seitenleiste-erstgespraech")).toHaveTextContent("2 Abschlüsse pro Monat");
    fireEvent.click(screen.getByRole("button", { name: "Schritt 3 bearbeiten" }));
    expect(screen.getByText("im Gespräch angeboten")).toBeInTheDocument();
  });

  it("Nachtrag aus Präsentation oder Teil 2: Paket, Zahlungsweise und andere Vertriebe ziehen ohne Neuladen nach", async () => {
    const start = baueBewerber();
    let ansicht: ReturnType<typeof render> | undefined;
    await act(async () => {
      ansicht = render(<ClosingTab bewerber={start} canEdit hrName="Sarah HR" onRefresh={() => {}} />);
    });
    expect(zustandVon(3)).toBe("gesperrt");
    // Dieselbe Bewerber-Id, neue gespeicherte Werte (Realtime aus dem zweiten Fenster).
    await act(async () => {
      ansicht!.rerender(
        <ClosingTab
          bewerber={{ ...start, closingEntscheidung: "ja", paketwahl: "junior", zahlungsweise: "einmal", andereVertriebe: "XY Vertrieb GmbH" }}
          canEdit hrName="Sarah HR" onRefresh={() => {}}
        />,
      );
    });
    expect(zustandVon(3)).toBe("kompakt");
    expect(screen.getByTestId("closing-seitenleiste-fortschritt")).toHaveTextContent("Vertriebspartner");
    expect(screen.getByTestId("closing-seitenleiste-fortschritt")).not.toHaveTextContent("Paket wählen, Schalter prüfen");
    fireEvent.click(screen.getByRole("button", { name: "Schritt 3 bearbeiten" }));
    expect(screen.getByText(/NICHT exklusiv zu arbeiten: XY Vertrieb GmbH/)).toBeInTheDocument();
  });

  it("Vertrag erstellen: die Vertragsschalter gehen als Formularwerte in Speicherung und Stempel", async () => {
    await renderTab(baueBewerber({
      status: "Paketwahl", closingEntscheidung: "ja", paketwahl: "junior", laufzeitOffen: true,
      ...ADRESSEN,
    }));
    fireEvent.click(screen.getByRole("button", { name: /Paket bestätigen & Vertrag erstellen/ }));
    await act(async () => {});
    /*
     * Die Rechnungsadresse wird ohne die Zeile mit der
     * Umsatzsteuer-Identifikationsnummer gespeichert. Das Feld ist am
     * 07.09.2026 entfallen; wird eine alte Adresse erneut gespeichert, fällt
     * die Zeile dabei weg. Das ist gewollt, sie soll nicht mehr auf der
     * Rechnung erscheinen.
     */
    expect(updateBewerber).toHaveBeenCalledWith("closing-1", expect.objectContaining({
      paketwahl: "junior", zahlungsweise: "einmal", ohneCrmGebuehr: false, laufzeitOffen: true,
      vertragsAdresse: ADRESSEN.vertragsAdresse,
      rechnungsAdresse: "Muster Consulting GmbH\nGewerbepark 3\n83022 Rosenheim",
    }));
  });
});

describe("ClosingTab, Karte 3: Closing-Sperre der Provisionssätze", () => {
  const b = () => baueBewerber({ status: "Paketwahl", closingEntscheidung: "ja", paketwahl: "junior" });
  // Die Felder tragen keine htmlFor-Verknüpfung; sie werden über die
  // Platzhalter gefunden: Lead "z. B. 3", Eigen und Bestand "z. B. 5" (in
  // dieser Reihenfolge), Neubau "z. B. 4,5".
  const felder = () => {
    const [eigen, bestand] = screen.getAllByPlaceholderText("z. B. 5") as HTMLInputElement[];
    return {
      lead: screen.getByPlaceholderText("z. B. 3") as HTMLInputElement,
      eigen,
      bestand,
      neubau: screen.getByPlaceholderText("z. B. 4,5") as HTMLInputElement,
    };
  };

  it("Eigen-Satz sperrt Bestand und Neubau, Lead-Satz bleibt möglich", async () => {
    await renderTab(b());
    fireEvent.click(screen.getByRole("button", { name: "Schritt 3 bearbeiten" }));
    const f = felder();
    expect(f.bestand).toBeEnabled();
    fireEvent.change(f.eigen, { target: { value: "5" } });
    expect(felder().bestand).toBeDisabled();
    expect(felder().neubau).toBeDisabled();
    expect(felder().lead).toBeEnabled();
    expect(screen.getByText(/Gesperrt: Eigen-Satz eingetragen, Objektart-Sätze/)).toBeInTheDocument();
    fireEvent.change(felder().eigen, { target: { value: "" } });
    expect(felder().bestand).toBeEnabled();
  });

  it("Bestand oder Neubau sperren den Eigen-Satz, Lead-Satz bleibt möglich", async () => {
    await renderTab(b());
    fireEvent.click(screen.getByRole("button", { name: "Schritt 3 bearbeiten" }));
    fireEvent.change(felder().neubau, { target: { value: "4,5" } });
    expect(felder().eigen).toBeDisabled();
    expect(felder().lead).toBeEnabled();
    expect(screen.getByText(/Gesperrt: Bestand\/Neubau eingetragen/)).toBeInTheDocument();
    fireEvent.change(felder().lead, { target: { value: "3" } });
    expect(felder().neubau).toBeEnabled();
  });

  it("der Hilfetext zur Individualfassung nennt die Eigentumsregel statt alter Fristen", async () => {
    await renderTab(b());
    fireEvent.click(screen.getByRole("button", { name: "Schritt 3 bearbeiten" }));
    expect(screen.getByText(/Eigentumsregel für Kontakte/)).toBeInTheDocument();
    expect(screen.queryByText(/36 Monate/)).not.toBeInTheDocument();
    expect(screen.queryByText(/24 Monate Kundenschutz/)).not.toBeInTheDocument();
    expect(screen.queryByText(/15\.000/)).not.toBeInTheDocument();
  });
});

describe("ClosingTab, Zustand c: Adressen vollständig", () => {
  it("Paket bestätigen speichert für einen neuen Bewerber die kompakte Fassung", async () => {
    await renderTab(baueBewerber({ status: "Paketwahl", closingEntscheidung: "ja", paketwahl: "junior", ...ADRESSEN }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Paket bestätigen & Vertrag erstellen/ }));
    });
    expect(updateBewerber).toHaveBeenCalledWith("closing-1", expect.objectContaining({
      vertragFassung: VERTRAGS_FASSUNG,
      vertragStatus: "nicht_gesendet",
    }));
  });

  it("Karte 4 ist eingeklappt, Karte 6 offen mit dem Erzeugen-Knopf", async () => {
    await renderTab(baueBewerber({ status: "Paketwahl", closingEntscheidung: "ja", paketwahl: "junior", ...ADRESSEN }));
    expect(zustandVon(4)).toBe("kompakt");
    expect(screen.getByTestId("closing-seitenleiste-fortschritt")).toHaveTextContent("Musterstraße 12, 15749 Mittenwalde");
    expect(zustandVon(6)).toBe("offen");
    expect(screen.getByRole("button", { name: /Paket bestätigen & Vertrag erstellen/ })).toBeEnabled();
    expect(screen.getByTestId("closing-naechster-schritt")).toHaveTextContent("Paket bestätigen und Vertrag erstellen");
  });

  it("aufgeklappte Adresskarte zeigt beide Blöcke mit vorbelegten Feldern", async () => {
    await renderTab(baueBewerber({ status: "Paketwahl", closingEntscheidung: "ja", paketwahl: "junior", ...ADRESSEN }));
    fireEvent.click(screen.getByRole("button", { name: "Schritt 4 bearbeiten" }));
    expect(screen.getByDisplayValue("Musterstraße 12")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Muster Consulting GmbH")).toBeInTheDocument();
    /*
     * Die Umsatzsteuer-Identifikationsnummer ist am 07.09.2026 entfallen. In
     * alten Adressen steht sie noch als vierte Zeile; sie wird beim Einlesen
     * erkannt und verworfen, damit sie nicht als Ortszeile auftaucht.
     */
    expect(screen.queryByDisplayValue("DE123456789")).not.toBeInTheDocument();
    expect(screen.queryByText(/USt-IdNr/i)).not.toBeInTheDocument();
  });
});

describe("ClosingTab, Zustand d: Vertrag erzeugt", () => {
  const b = (teil: Partial<Bewerber> = {}) => baueBewerber({
    status: "Vertrag", closingEntscheidung: "ja", paketwahl: "junior", ...ADRESSEN,
    paketUebersichtSentAt: "2026-09-01T13:12:00.000Z",
    paketBestaetigtAm: "2026-09-02T08:15:00.000Z", vertragStatus: "gesendet", vertragVersion: 1,
    ...teil,
  });

  it("Karten 1 bis 5 eingeklappt, Stempel und Neu-erstellen-Knopf in Karte 6, Hinweis zum Aufklappen", async () => {
    await renderTab(b());
    [1, 2, 3, 4, 5].forEach((nr) => expect(zustandVon(nr)).toBe("kompakt"));
    expect(zustandVon(6)).toBe("offen");
    expect(screen.getByText(/Paket bestätigt & Vertrag erstellt/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Vertrag mit aktuellem Paket neu erstellen/ })).toBeInTheDocument();
    expect(screen.getByText(/Eingeklappte Karten bleiben änderbar/)).toBeInTheDocument();
    expect(screen.getByTestId("closing-naechster-schritt")).toHaveTextContent("Unterschrift abwarten");
  });

  it("eingeklappte Karten lassen sich auch nach dem Vertrag wieder öffnen", async () => {
    await renderTab(b());
    fireEvent.click(screen.getByRole("button", { name: "Schritt 2 bearbeiten" }));
    expect(zustandVon(2)).toBe("offen");
    expect(screen.getByRole("button", { name: /Braucht Bedenkzeit/ })).toBeEnabled();
  });

  it("der Konditionen-Wächter meldet einen veralteten Vertrag", async () => {
    await renderTab(b({ vertragKonditionenStand: JSON.stringify({ paket: "tippgeber" }) }));
    expect(screen.getByTestId("konditionen-waechter")).toHaveTextContent(/veraltet/);
  });

  /*
   * Bis zum 10.09.2026 galt: gesendeter Vertrag ohne Kennzeichen bedeutet
   * Bestandspartner, also Altfassung. Das war fuer die Umstellungszeit
   * gedacht und hat einmal zugeschlagen, wo es nicht sollte: Ein heute
   * angelegter Bewerber bekam einen Vertrag ohne den Taetigkeitsmassstab.
   * Seither entscheidet zuerst das Anlagedatum.
   */
  it("Neu erstellen bei einem heute angelegten Bewerber speichert die aktuelle Fassung", async () => {
    await renderTab(b());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Vertrag mit aktuellem Paket neu erstellen/ }));
    });
    expect(updateBewerber).toHaveBeenCalledWith("closing-1", expect.objectContaining({
      vertragFassung: VERTRAGS_FASSUNG,
      vertragStatus: "nicht_gesendet",
    }));
  });

  it("Neu erstellen bei einem Bestandsbewerber von vor dem Stichtag bleibt bei der Altfassung", async () => {
    await renderTab(b({ erstelltAm: "2026-08-15T09:00:00.000Z" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Vertrag mit aktuellem Paket neu erstellen/ }));
    });
    expect(updateBewerber).toHaveBeenCalledWith("closing-1", expect.objectContaining({
      vertragFassung: VERTRAGS_FASSUNG_ALT,
      vertragStatus: "nicht_gesendet",
    }));
  });

  it("nach der Unterschrift gibt es keinen Neu-erstellen-Knopf mehr", async () => {
    await renderTab(b({ vertragStatus: "unterschrieben" }));
    expect(screen.queryByRole("button", { name: /Vertrag mit aktuellem Paket neu erstellen/ })).not.toBeInTheDocument();
  });
});

describe("ClosingTab, Zustand e: Bedenkzeit", () => {
  const b = () => baueBewerber({
    status: "Bedenkzeit", closingEntscheidung: "bedenkzeit",
    bedenkzeitRueckrufAm: "09.09.2026", bedenkzeitGrund: "Rücksprache mit Partnerin",
  });

  it("Karte 2 bleibt offen mit dem Bedenkzeit-Block, 3, 4 und 6 gesperrt", async () => {
    await renderTab(b());
    expect(zustandVon(1)).toBe("kompakt");
    expect(zustandVon(2)).toBe("offen");
    expect(screen.getByTestId("bedenkzeit-block")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Rücksprache mit Partnerin")).toBeInTheDocument();
    expect(zustandVon(3)).toBe("gesperrt");
    expect(zustandVon(4)).toBe("gesperrt");
    expect(zustandVon(6)).toBe("gesperrt");
    expect(screen.getByTestId("closing-naechster-schritt")).toHaveTextContent("Rückruf am 09.09.2026, danach Entscheidung erfassen");
  });

  it("die Follow-up-Karte zeigt Uhrzeit, Kanal, Erinnerung und Vorbereitung mit den Standardwerten", async () => {
    await renderTab(b());
    const karte2 = screen.getByTestId("bedenkzeit-follow-up");
    expect(within(karte2).getByLabelText("Uhrzeit")).toHaveValue("");
    expect(within(karte2).getByRole("combobox", { name: "Kanal" })).toHaveTextContent("Telefon");
    expect(within(karte2).getByRole("combobox", { name: "Erinnerung" })).toHaveTextContent("1 Tag vorher");
    expect(within(karte2).getByText(/erscheint am 08\.09\.2026 in der Inbox/)).toBeInTheDocument();
    expect(within(karte2).getByLabelText("Vorbereitung für den Rückruf")).toBeInTheDocument();
    expect(within(karte2).getByText(/Bedenkzeit und Follow-Up bleiben getrennte Status/)).toBeInTheDocument();
  });

  it("Auf Bedenkzeit setzen speichert Rückruf samt Follow-up und wechselt den Status einmal", async () => {
    await renderTab(baueBewerber({ status: "Closing" }));
    fireEvent.click(screen.getByRole("button", { name: /Braucht Bedenkzeit/ }));
    fireEvent.change(screen.getByLabelText("Uhrzeit"), { target: { value: "10:00" } });
    fireEvent.change(screen.getByLabelText("Vorbereitung für den Rückruf"), { target: { value: "Zwei Exposés" } });
    // Ohne Datum bleibt der Knopf gesperrt.
    expect(screen.getByRole("button", { name: /Auf Bedenkzeit setzen/ })).toBeDisabled();
  });

  it("Rückruf speichern schreibt alle Bedenkzeit-Felder, bei Status Bedenkzeit ohne erneuten Statuswechsel", async () => {
    await renderTab(b());
    fireEvent.change(screen.getByLabelText("Uhrzeit"), { target: { value: "10:00" } });
    fireEvent.change(screen.getByLabelText("Vorbereitung für den Rückruf"), { target: { value: "Zwei Exposés mitschicken" } });
    fireEvent.click(screen.getByRole("button", { name: /Rückruf speichern/ }));
    expect(updateBewerber).toHaveBeenCalledWith("closing-1", {
      closingEntscheidung: "bedenkzeit",
      bedenkzeitRueckrufAm: "09.09.2026",
      bedenkzeitGrund: "Rücksprache mit Partnerin",
      bedenkzeitRueckrufUhrzeit: "10:00",
      bedenkzeitKanal: "telefon",
      bedenkzeitErinnerungTage: 1,
      bedenkzeitVorbereitung: "Zwei Exposés mitschicken",
    });
    expect(changeBewerberStatus).not.toHaveBeenCalled();
  });

  it("aus dem Status Closing heraus setzt der Knopf den Status auf Bedenkzeit", async () => {
    await renderTab(baueBewerber({ status: "Closing", closingEntscheidung: "bedenkzeit", bedenkzeitRueckrufAm: "09.09.2026" }));
    fireEvent.click(screen.getByRole("button", { name: /Rückruf speichern/ }));
    expect(changeBewerberStatus).toHaveBeenCalledWith("closing-1", "Bedenkzeit");
  });

  it("Rückruf erledigt gibt die Entscheidungsknöpfe wieder frei", async () => {
    await renderTab(b());
    fireEvent.click(screen.getByRole("button", { name: /Rückruf erledigt: Entscheidung erfassen/ }));
    expect(screen.queryByTestId("bedenkzeit-block")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ja, will starten/ })).toBeEnabled();
    expect(updateBewerber).not.toHaveBeenCalled();
  });
});

// ── Eine Quelle für Balken und Fortschritt ───────────────────────────────
//
// Vorher hatte jede der beiden Anzeigen ihre eigene Herleitung: Der Balken
// las den Formularzustand beziehungsweise den Verfolgungseintrag der Mail,
// die Seitenleiste den gespeicherten Stand. Diese Tests halten fest, dass
// beide jetzt dasselbe sagen, und zwar den gespeicherten Stand.
describe("ClosingTab, Balken und Fortschritt sagen dasselbe", () => {
  const fortschritt = () => screen.getByTestId("closing-seitenleiste-fortschritt");

  it("Startfahrplan: ohne bestätigten Versand sagen Balken und Fortschritt beide nicht versendet", async () => {
    // Der Verfolgungseintrag entsteht VOR dem Absenden. Scheitert der Versand,
    // gibt es den Eintrag, aber keinen Zeitstempel am Bewerber.
    setzeTrackings([{
      token: "t1", bewerber_id: "closing-1", kind: "paket_uebersicht",
      paket: null, paket_titel: null,
      sent_at: "2026-09-02T07:14:00.000Z", opened_at: null, clicked_at: null, tracked: true,
    }]);
    await renderTab(baueBewerber({ status: "Paketwahl", closingEntscheidung: "ja", paketwahl: "junior" }));
    expect(within(karte(5)).queryByText("optional, noch nicht versendet")).not.toBeInTheDocument();
    expect(fortschritt()).toHaveTextContent("optional, noch nicht versendet");
    expect(fortschritt()).not.toHaveTextContent("versendet 02.09.2026");
    // Der Verlauf weist auf den unbestätigten Versand hin.
    expect(within(karte(5)).getByText("Versand nicht bestätigt")).toBeInTheDocument();
    setzeTrackings([]);
  });

  it("Startfahrplan: mit Zeitstempel am Bewerber gilt er beiden als versendet, geöffnet kommt aus der Verfolgung", async () => {
    // Seit dem 26.09.2026 zählt nur der Aufruf des PDF-Links, kein Zählpixel.
    setzeTrackings([{
      token: "t1", bewerber_id: "closing-1", kind: "paket_uebersicht",
      paket: null, paket_titel: null,
      sent_at: "2026-09-02T07:14:00.000Z", opened_at: "2026-09-02T09:00:00.000Z", clicked_at: "2026-09-02T09:00:00.000Z", tracked: true,
    }]);
    await renderTab(baueBewerber({
      status: "Paketwahl", closingEntscheidung: "ja", paketwahl: "junior",
      paketUebersichtSentAt: "2026-09-02T07:14:30.000Z",
    }));
    expect(within(karte(5)).queryByText(/^versendet 02\.09\.2026$/)).not.toBeInTheDocument();
    expect(fortschritt()).toHaveTextContent("versendet 02.09.2026");
    expect(fortschritt()).toHaveTextContent("PDF-Link vom Bewerber geöffnet");
    expect(within(karte(5)).queryByText("Versand nicht bestätigt")).not.toBeInTheDocument();
    setzeTrackings([]);
  });

  it("Paket gewählt, aber nicht gespeichert: der Balken bleibt beim gespeicherten Stand und weist darauf hin", async () => {
    await renderTab(baueBewerber({ status: "Paketwahl", closingEntscheidung: "ja", paketwahl: "junior" }));
    fireEvent.click(screen.getByRole("button", { name: "Schritt 3 bearbeiten" }));
    fireEvent.click(screen.getByRole("button", { name: /Tippgeber/ }));
    // Die Seitenleiste zeigt weiter das gespeicherte Paket. Im aufgeklappten
    // Inhalt steht "Vertriebspartner" als Auswahlknopf, im Balken aber kein
    // Ergebnis mehr.
    expect(within(karte(3)).queryByText("Vertriebspartner, 4 % Provision · kein laufendes Entgelt")).not.toBeInTheDocument();
    expect(fortschritt()).toHaveTextContent("Vertriebspartner");
    expect(fortschritt()).not.toHaveTextContent("Tippgeber");
    // Die getroffene Auswahl bleibt trotzdem sichtbar.
    expect(within(karte(3)).getByText("nicht gespeichert")).toBeInTheDocument();
  });

  it("die Herkunft steht als Zeichen an der Karte und im Fortschritt, nicht mehr als Text im Balken", async () => {
    await renderTab(baueBewerber({
      status: "Paketwahl", closingEntscheidung: "ja", paketwahl: "junior", ...ADRESSEN,
      erstgespraechSkript: {
        ausgangslage: "", ziele: "", motivation: "", vorErfahrung: "",
        einwand: "", budget: "", naechsterSchritt: "", durchgefuehrtVon: "Sarah",
        durchgefuehrtAm: "2026-09-01T10:00:00.000Z",
        closingDirekt: { aktiv: true },
      },
    }));
    // An den Karten steht das Zeichen nicht mehr, nur noch im Fortschritt.
    expect(within(karte(2)).queryByTitle("aus dem Gespräch übernommen")).not.toBeInTheDocument();
    expect(within(karte(3)).queryByTitle("aus dem Gespräch übernommen")).not.toBeInTheDocument();
    expect(within(fortschritt()).getAllByTitle("aus dem Gespräch übernommen").length).toBeGreaterThanOrEqual(3);
    // Der ausgeschriebene Vermerk steht nur noch einmal im Kopf.
    expect(screen.getByTestId("closing-kopf-stand")).toHaveTextContent("aus dem Gespräch vom 01.09.2026 übernommen");
  });

  it("der Kopf zeigt keine zweite Schrittliste mehr, sondern nur den Stand", async () => {
    await renderTab(baueBewerber({ status: "Paketwahl", closingEntscheidung: "ja", paketwahl: "junior" }));
    const kopf = screen.getByTestId("closing-kopf");
    expect(kopf).toHaveTextContent("Schritt 4 von 6");
    // Die sechs Kästchen mit den Schrittnamen sind weg.
    expect(within(kopf).queryByText("Adressen und Vertragsdaten")).not.toBeInTheDocument();
    expect(within(kopf).queryByText("Vertrag erzeugen und senden")).not.toBeInTheDocument();
  });

  it("jeder Balken nennt genau das, was im Fortschritt zu diesem Schritt steht", async () => {
    await renderTab(baueBewerber({
      status: "Vertrag", closingEntscheidung: "ja", paketwahl: "junior", ...ADRESSEN,
      paketUebersichtSentAt: "2026-09-02T07:14:00.000Z",
      paketBestaetigtAm: "2026-09-03T08:15:00.000Z", vertragStatus: "gesendet", vertragVersion: 1,
    }));
    // Ein Ergebnis je Balken, und es taucht in der Seitenleiste wieder auf.
    // Die Seitenleiste bricht dieselbe Aussage auf eigene Zeilen um.
    for (const text of ["Ja, will starten", "Vertriebspartner", "4 % Provision · kein laufendes Entgelt", "versendet 02.09.2026"]) {
      expect(fortschritt()).toHaveTextContent(text);
    }
    // Die Balken 1 bis 5 tragen kein Ergebnis mehr, nur Karte 6 behält ihren Stempel.
    for (const nr of [1, 2, 3, 4, 5]) {
      const kopfzeile = within(karte(nr)).getByRole("heading");
      expect(kopfzeile).toHaveTextContent(`${nr} `);
      expect(karte(nr).querySelectorAll("[title='aus dem Gespräch übernommen']").length).toBe(0);
    }
    expect(within(karte(2)).queryByText("Ja, will starten")).not.toBeInTheDocument();
    expect(within(karte(5)).queryByText(/^versendet 02\.09\.2026$/)).not.toBeInTheDocument();
    expect(within(karte(6)).getByText("Vertrag v1 versendet, wartet auf Unterschrift")).toBeInTheDocument();
    expect(fortschritt()).toHaveTextContent("v1 versendet, wartet auf Unterschrift");
  });

  it("ein Klick im Fortschritt öffnet die zugehörige Karte", async () => {
    await renderTab(baueBewerber({ status: "Paketwahl", closingEntscheidung: "ja", paketwahl: "junior" }));
    expect(zustandVon(3)).toBe("kompakt");
    fireEvent.click(within(fortschritt()).getByTitle("Zu Schritt 3 springen"));
    expect(zustandVon(3)).toBe("offen");
  });
});
