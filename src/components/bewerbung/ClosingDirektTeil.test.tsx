import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Feld-Synchronisation mit dem ClosingTab: Der Direktweg schreibt Entscheidung,
// Paketwahl, Zahlungsweise und Adressen über updateBewerber in EXAKT dieselben
// Bewerber-Felder. Store und Toast werden gemockt, damit kein Cache-Zugriff
// passiert; geprüft wird, WOMIT der Store aufgerufen wird.

vi.mock("@/lib/bewerbungStore", () => ({
  updateBewerber: vi.fn(),
  changeBewerberStatus: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

// Der Startfahrplan-Versand läuft über die gemeinsame Versandlogik; hier wird
// nur geprüft, DASS sie mit dem richtigen Bewerber aufgerufen wird.
vi.mock("@/lib/startfahrplanVersand", () => ({
  sendeStartfahrplan: vi.fn().mockResolvedValue(undefined),
}));

import { ClosingDirektTeil } from "./ClosingDirektTeil";
import { updateBewerber, changeBewerberStatus, type Bewerber } from "@/lib/bewerbungStore";
import { sendeStartfahrplan } from "@/lib/startfahrplanVersand";
import type { ClosingDirektDaten } from "@/lib/closingDirektSkript";

function baueBewerber(teil: Partial<Bewerber> = {}): Bewerber {
  return {
    id: "direkt-1",
    vorname: "Max",
    nachname: "Muster",
    email: "max@example.com",
    telefon: "", ort: "", quelle: "", beworben: "", stelleId: "", stelleTitel: "",
    status: "Erstgespraech",
    bewertung: 0,
    erstelltAm: new Date().toISOString(),
    typ: "", typLabel: "", typBeschreibung: "", typEignung: "", erfahrung: "",
    motivation: "", notizen: "", ziele: "", beschaeftigungsart: "", onboardingTerminId: "",
    lebenslaufUrl: "", dokumente: [], vertragStatus: "nicht_gesendet", vertragDatum: "",
    benachrichtigungen: [], chatVerknuepft: false,
    ausgangslage: "", zielBest: "", wieStarten: "",
    notizenLog: [], adresse: "", rechnungsAdresse: "",
    closingTerminDatum: "", closingTerminUhrzeit: "",
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

const renderTeil = (bewerber: Bewerber, daten: ClosingDirektDaten = { aktiv: true }) =>
  render(
    <ClosingDirektTeil
      bewerber={bewerber}
      canEdit={true}
      daten={daten}
      onDatenChange={() => {}}
      onRefresh={() => {}}
    />,
  );

beforeEach(() => {
  vi.mocked(updateBewerber).mockClear();
  vi.mocked(changeBewerberStatus).mockClear();
  vi.mocked(sendeStartfahrplan).mockClear();
});

describe("ClosingDirektTeil", () => {
  it("rendert alle 16 Gesprächsabschnitte mit Abhak-Kästchen", () => {
    renderTeil(baueBewerber());
    expect(screen.getByText(/Abschnitt 1 von 16 · Der Direktvorschlag/)).toBeInTheDocument();
    expect(screen.getByText(/Abschnitt 15 von 16 · Die Entscheidung/)).toBeInTheDocument();
    expect(screen.getByText(/Abschnitt 16 von 16 · Der Gesprächsabschluss/)).toBeInTheDocument();
    // 16 Abhak-Kästchen der Abschnitte plus die Adress-Checkbox gibt es hier
    // noch nicht (Entscheidung steht auf leer), also genau 16.
    expect(screen.getAllByRole("checkbox")).toHaveLength(16);
    // Ohne Entscheidung zeigt der Gesprächsabschluss alle vier Varianten.
    expect(screen.getByText(/Bei Ja: Vertrag kommt per Mail/)).toBeInTheDocument();
    expect(screen.getByText(/Bei Unterlagen-Wunsch: Zusammenfassung kommt/)).toBeInTheDocument();
    expect(screen.getByText(/Bei Bedenkzeit: fester Rückruf/)).toBeInTheDocument();
    expect(screen.getByText(/Bei Nein: wertschätzende Verabschiedung/)).toBeInTheDocument();
  });

  it("Einwandbehandlungen erscheinen an den passenden Abschnitten", () => {
    renderTeil(baueBewerber());
    // Seit dem 07.09.2026 gibt es keine Monatsgebühr und keine Laufzeit mehr;
    // die Einwände fragen nach dem Haken und nach einer Mindestbindung.
    expect(screen.getByText(/„Wo ist der Haken\?/)).toBeInTheDocument();
    expect(screen.getByText(/„Gibt es eine Laufzeit oder eine Mindestbindung\?/)).toBeInTheDocument();
    expect(screen.getByText(/„Schaffe ich das überhaupt neben meinem Hauptjob\?"/)).toBeInTheDocument();
  });

  it("der Folge-Call ist standardmäßig nicht eingeblendet, der Anbieten-Knopf steht zweimal bereit", () => {
    renderTeil(baueBewerber());
    // Einmal an der Lead-Thematik (Preis), einmal am Ende des Skripts.
    expect(screen.getAllByRole("button", { name: /Folge-Call anbieten/ })).toHaveLength(2);
    expect(screen.queryByText(/Folge-Call bei Christian Kurz buchen/)).not.toBeInTheDocument();
  });

  it("eingeblendeter Folge-Call zeigt den Buchungslink von Christian Kurz", () => {
    renderTeil(baueBewerber(), { aktiv: true, qualiCallAngeboten: true });
    const links = screen.getAllByRole("link", { name: /Folge-Call bei Christian Kurz buchen/ });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute(
      "href",
      "https://calendly.com/office-more/vertriebspartnerschaft-more-immo",
    );
  });

  it("der Erklärtext des Folge-Calls trägt die neue Logik: gestellte Leads, Leadkauf bleibt offen", () => {
    renderTeil(baueBewerber());
    const erklaerungen = screen.getAllByText(/Reine Ermessenssache, nur bei richtig starken Kandidaten anbieten/);
    expect(erklaerungen).toHaveLength(2);
    expect(erklaerungen[0].textContent).toContain("Leads gestellt bekommt, ohne dafür zu");
    expect(erklaerungen[0].textContent).toContain("Der Leadkauf steht davon unabhängig jedem Partner offen");
  });

  it("Startfahrplan-Weiche: bei direktem Start kein Versand-Block", () => {
    renderTeil(baueBewerber(), { aktiv: true, startWeiche: "direkt" });
    expect(screen.getByText(/Kein Versand nötig/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Startfahrplan jetzt senden/ })).not.toBeInTheDocument();
  });

  it("Unterlagen-Weiche: Startfahrplan geht über die gemeinsame Versandlogik raus", () => {
    renderTeil(baueBewerber(), { aktiv: true, startWeiche: "unterlagen" });
    fireEvent.click(screen.getByRole("button", { name: /Startfahrplan jetzt senden/ }));
    expect(sendeStartfahrplan).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendeStartfahrplan).mock.calls[0][0].id).toBe("direkt-1");
  });

  it("Unterlagen-Weiche: kein Fassungshinweis mehr, die erweiterte Fassung haengt am Inhalt, nicht am Abschluss-Klick", () => {
    renderTeil(baueBewerber(), { aktiv: true, startWeiche: "unterlagen" });
    expect(screen.queryByTestId("startfahrplan-fassung-hinweis")).not.toBeInTheDocument();
  });

  it("Unterlagen-Weiche: auch nach dem Abschluss des Erstgesprächs kein Hinweis", () => {
    renderTeil(
      baueBewerber({
        erstgespraechSkript: {
          ausgangslage: "", ziele: "", motivation: "", vorErfahrung: "",
          einwand: "", budget: "", naechsterSchritt: "", durchgefuehrtVon: "Sarah",
          durchgefuehrtAm: "2026-09-01T10:00:00.000Z",
        },
      }),
      { aktiv: true, startWeiche: "unterlagen" },
    );
    expect(screen.queryByTestId("startfahrplan-fassung-hinweis")).not.toBeInTheDocument();
  });

  it("im Profil hinterlegte andere Vertriebe: Schalter steht auf nicht exklusiv, Feld ist vorbelegt", () => {
    renderTeil(baueBewerber({ closingEntscheidung: "ja", andereVertriebe: "XY Vertrieb GmbH" }));
    expect(screen.getByDisplayValue("XY Vertrieb GmbH")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /Exklusive Zusammenarbeit/ })).not.toBeChecked();
  });

  it("ohne hinterlegte andere Vertriebe bleibt der Schalter exklusiv und das Feld verborgen", () => {
    renderTeil(baueBewerber({ closingEntscheidung: "ja" }));
    expect(screen.getByRole("switch", { name: /Exklusive Zusammenarbeit/ })).toBeChecked();
    expect(screen.queryByPlaceholderText("Muster Vertriebs GmbH, München")).not.toBeInTheDocument();
  });

  it("Unterlagen-Weiche: Follow-up schreibt die bestehenden Felder und setzt den Status Follow-Up", () => {
    renderTeil(
      baueBewerber({ followUpDatum: "05.09.2026", followUpUhrzeit: "10:00" }),
      { aktiv: true, startWeiche: "unterlagen" },
    );
    fireEvent.click(screen.getByRole("button", { name: /Follow-up planen/ }));
    expect(updateBewerber).toHaveBeenCalledWith("direkt-1", {
      followUpDatum: "05.09.2026",
      followUpUhrzeit: "10:00",
      followUpNotiz: "Startfahrplan gesendet, ruft wegen der Entscheidung an.",
    });
    expect(changeBewerberStatus).toHaveBeenCalledWith("direkt-1", "FollowUp");
  });

  it("Unterlagen-Weiche: aus späteren Stufen wird der Status nicht mehr gewechselt", () => {
    renderTeil(
      baueBewerber({ status: "Paketwahl", followUpDatum: "05.09.2026" }),
      { aktiv: true, startWeiche: "unterlagen" },
    );
    fireEvent.click(screen.getByRole("button", { name: /Follow-up planen/ }));
    expect(updateBewerber).toHaveBeenCalled();
    expect(changeBewerberStatus).not.toHaveBeenCalled();
  });

  it("Unterlagen-Weiche: der Gesprächsabschluss zeigt nur die Unterlagen-Variante", () => {
    renderTeil(baueBewerber(), { aktiv: true, startWeiche: "unterlagen" });
    expect(screen.getByText(/Bei Unterlagen-Wunsch: Zusammenfassung kommt/)).toBeInTheDocument();
    expect(screen.queryByText(/Bei Ja: Vertrag kommt per Mail/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Bei Bedenkzeit: fester Rückruf/)).not.toBeInTheDocument();
  });

  it("Entscheidung Ja schreibt closingEntscheidung, springt aber ohne Paket noch nicht", () => {
    renderTeil(baueBewerber());
    fireEvent.click(screen.getByRole("button", { name: /Ja, will starten/ }));
    expect(updateBewerber).toHaveBeenCalledWith("direkt-1", { closingEntscheidung: "ja" });
    expect(changeBewerberStatus).not.toHaveBeenCalled();
  });

  it("Ja plus Paketwahl schreibt dieselben Felder wie der ClosingTab und springt auf Paketwahl", () => {
    renderTeil(baueBewerber({ closingEntscheidung: "ja" }));
    // "Vertriebspartner" steht auch in der Zielgruppe des Lead-Beraters,
    // deshalb die eindeutige Zielgruppen-Zeile der Vertriebspartner-Karte.
    fireEvent.click(screen.getByRole("button", { name: /Alle neuen Vertriebspartner/ }));
    expect(updateBewerber).toHaveBeenCalledWith("direkt-1", { paketwahl: "junior", zahlungsweise: "einmal" });
    expect(changeBewerberStatus).toHaveBeenCalledWith("direkt-1", "Paketwahl");
  });

  it("auch die Wahl des Lead-Beraters führt zum Sprung auf Paketwahl", () => {
    renderTeil(baueBewerber({ closingEntscheidung: "ja" }));
    fireEvent.click(screen.getByRole("button", { name: /Lead-Berater/ }));
    expect(updateBewerber).toHaveBeenCalledWith("direkt-1", { paketwahl: "lead_berater", zahlungsweise: "einmal" });
    expect(changeBewerberStatus).toHaveBeenCalledWith("direkt-1", "Paketwahl");
  });

  it("aus einer späteren Stufe heraus wird der Status nicht angefasst", () => {
    renderTeil(baueBewerber({ closingEntscheidung: "ja", status: "Vertrag" }));
    fireEvent.click(screen.getByRole("button", { name: /Alle neuen Vertriebspartner/ }));
    expect(changeBewerberStatus).not.toHaveBeenCalled();
  });

  it("die Vertragsanschrift landet im selben Feld wie im ClosingTab (vertragsAdresse)", () => {
    renderTeil(baueBewerber({ closingEntscheidung: "ja" }));
    const strasse = screen.getAllByPlaceholderText("z. B. Musterstraße 12")[0];
    fireEvent.change(strasse, { target: { value: "Teststraße 7" } });
    fireEvent.blur(strasse);
    expect(updateBewerber).toHaveBeenCalledWith("direkt-1", {
      vertragsAdresse: "Max Muster\nTeststraße 7",
      // Rechnungsadresse ist standardmäßig identisch mit der Vertragsanschrift.
      rechnungsAdresse: "Max Muster\nTeststraße 7",
    });
  });

  it("Bedenkzeit verlangt einen Rückruftermin und setzt dann den Status Bedenkzeit", () => {
    renderTeil(baueBewerber({ closingEntscheidung: "bedenkzeit", bedenkzeitRueckrufAm: "01.10.2026" }));
    fireEvent.click(screen.getByRole("button", { name: /Auf Bedenkzeit setzen/ }));
    expect(updateBewerber).toHaveBeenCalledWith("direkt-1", {
      closingEntscheidung: "bedenkzeit",
      bedenkzeitRueckrufAm: "01.10.2026",
      bedenkzeitGrund: "",
    });
    expect(changeBewerberStatus).toHaveBeenCalledWith("direkt-1", "Bedenkzeit");
  });

  it("bei Nein verweist der Abschnitt auf den Absage-Weg in Punkt 9", () => {
    renderTeil(baueBewerber({ closingEntscheidung: "nein" }));
    expect(screen.getByText(/über die Knöpfe in Punkt 9/)).toBeInTheDocument();
  });

  it("es gibt keinen Knopf zum Vertrag erzeugen, nur den Hinweis im Gesprächsabschluss", () => {
    renderTeil(baueBewerber({ closingEntscheidung: "ja", paketwahl: "junior" }));
    expect(screen.queryByRole("button", { name: /Vertrag erstellen/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Weiter im Reiter Closing: Vertrag erzeugen und senden/)).toBeInTheDocument();
    // Bei erfasster Entscheidung erscheint nur die passende Abschluss-Variante.
    expect(screen.getByText(/Bei Ja: Vertrag kommt per Mail/)).toBeInTheDocument();
    expect(screen.queryByText(/Bei Nein: wertschätzende Verabschiedung/)).not.toBeInTheDocument();
  });
});
