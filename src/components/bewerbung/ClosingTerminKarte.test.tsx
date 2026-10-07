import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Die Karte schreibt über EXAKT dieselben Store-Funktionen wie Punkt 10 des
// Erstgesprächsskripts (updateBewerber + changeBewerberStatus). Store und
// Toast werden gemockt; geprüft wird, WOMIT der Store aufgerufen wird und
// dass der Status-Sprung ausschließlich über den Haken-Weg läuft.

vi.mock("@/lib/bewerbungStore", () => ({
  updateBewerber: vi.fn(),
  changeBewerberStatus: vi.fn(),
  addNotizEntry: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import { ClosingTerminKarte } from "./ClosingTerminKarte";
import { updateBewerber, changeBewerberStatus, addNotizEntry, type Bewerber } from "@/lib/bewerbungStore";
import type { BewerberBuchungZeile } from "@/lib/bewerberTerminStore";

function baueBewerber(teil: Partial<Bewerber> = {}): Bewerber {
  return {
    id: "selbst-1",
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

/** Ein selbst gebuchter Termin, wie ihn `ladeBewerberBuchungen` liefert. */
const buchung = (startAt: string, status = "offen"): BewerberBuchungZeile => ({
  id: "buchung-1",
  bewerbungId: "selbst-1",
  startAt,
  endeAt: "",
  dauerMinuten: 35,
  status,
  abgesagtAt: status === "abgesagt" ? "2026-09-16T10:00:00.000Z" : "",
  bezeichnung: "Persönliches Gespräch",
  raumPfad: "/raum/abc",
});

const renderKarte = (
  b: Bewerber,
  canEdit = true,
  gebuchterTermin?: BewerberBuchungZeile | null,
  abgesagterTermin?: BewerberBuchungZeile | null,
) =>
  render(
    <ClosingTerminKarte
      b={b}
      canEdit={canEdit}
      beraterName="Hanna HR"
      beraterEmail="hanna@more.de"
      autorId="MI-1"
      onRefresh={() => {}}
      gebuchterTermin={gebuchterTermin}
      abgesagterTermin={abgesagterTermin}
    />,
  );


const tippeTermin = (isoDatum: string, uhrzeit: string) => {
  fireEvent.change(screen.getByLabelText("Datum"), { target: { value: isoDatum } });
  fireEvent.change(screen.getByLabelText("Uhrzeit"), { target: { value: uhrzeit } });
};

beforeEach(() => {
  vi.mocked(updateBewerber).mockClear();
  vi.mocked(changeBewerberStatus).mockClear();
  vi.mocked(addNotizEntry).mockClear();
});

describe("ClosingTerminKarte", () => {
  /*
   * Seit dem 16.09.2026 steht das Eintragen offen, ohne dass vorher etwas
   * angekreuzt werden muss. Vorher pruefte hier ein Test das Gegenteil: dass es
   * ohne Haken keine Felder gibt. Genau das war die Klemme, die Christian
   * gemeldet hat, als die HR-Managerin einen selbst vereinbarten Termin hinterlegen wollte.
   */
  it("Datum und Uhrzeit stehen ohne jeden Haken zum Eintragen bereit", () => {
    renderKarte(baueBewerber({ closingTerminDatum: "10.09.2026", closingTerminUhrzeit: "14:00" }));
    expect(screen.getByText(/10\.09\.2026/)).toBeInTheDocument();
    expect(screen.getByLabelText("Datum")).toBeInTheDocument();
    expect(screen.getByLabelText("Uhrzeit")).toBeInTheDocument();
    // Nur ansehen schreibt nichts.
    expect(updateBewerber).not.toHaveBeenCalled();
    expect(changeBewerberStatus).not.toHaveBeenCalled();
  });

  it("es gibt keinen Haken mehr, nur noch Datum und Uhrzeit", () => {
    renderKarte(baueBewerber());
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Datum")).toBeInTheDocument();
    expect(screen.getByLabelText("Uhrzeit")).toBeInTheDocument();
  });

  it("nur Datum ohne Uhrzeit: Speichern gesperrt, kein Status-Sprung", () => {
    renderKarte(baueBewerber());
    fireEvent.change(screen.getByLabelText("Datum"), { target: { value: "2030-09-10" } });
    expect(screen.getByRole("button", { name: /Termin speichern/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Termin speichern/ }));
    expect(updateBewerber).not.toHaveBeenCalled();
    expect(changeBewerberStatus).not.toHaveBeenCalled();
  });

  it("vollständiger Termin: gleiche Felder wie Punkt 10, Sprung auf Closing, Notiz", () => {
    renderKarte(baueBewerber({ status: "Erstgespraech" }));
    tippeTermin("2030-09-10", "14:30");
    fireEvent.click(screen.getByRole("button", { name: /Termin speichern/ }));
    expect(updateBewerber).toHaveBeenCalledWith("selbst-1", {
      closingTerminDatum: "10.09.2030",
      closingTerminUhrzeit: "14:30",
      // Was hier eingetragen wird, ist nie selbst gebucht: Bei einer Buchung
      // gäbe es die Felder gar nicht.
      closingTerminSelbstGebucht: false,
      closingBeraterName: "Hanna HR",
      closingBeraterEmail: "hanna@more.de",
      closingRemindersSent: [],
    });
    expect(changeBewerberStatus).toHaveBeenCalledWith("selbst-1", "Closing");
    expect(addNotizEntry).toHaveBeenCalledWith(
      "selbst-1",
      "Closing-Termin am 10.09.2030 um 14:30 Uhr, von Hand eingetragen.",
      "Hanna HR",
      "MI-1",
    );
  });

  it("aus späteren Phasen (z. B. Paketwahl) gibt es keinen Status-Sprung", () => {
    renderKarte(baueBewerber({ status: "Paketwahl" }));
    tippeTermin("2030-09-10", "14:30");
    fireEvent.click(screen.getByRole("button", { name: /Termin speichern/ }));
    expect(updateBewerber).toHaveBeenCalled();
    expect(changeBewerberStatus).not.toHaveBeenCalled();
  });

  it("vergangenes Datum warnt dezent, blockiert das Speichern aber nicht", () => {
    renderKarte(baueBewerber());
    tippeTermin("2020-01-15", "10:00");
    expect(screen.getByText(/liegt in der Vergangenheit/)).toBeInTheDocument();
    const speichern = screen.getByRole("button", { name: /Termin speichern/ });
    expect(speichern).toBeEnabled();
    fireEvent.click(speichern);
    expect(updateBewerber).toHaveBeenCalled();
    expect(changeBewerberStatus).toHaveBeenCalledWith("selbst-1", "Closing");
  });

  it("bestehender Termin bleibt editierbar, ohne den früheren Vermerk", () => {
    renderKarte(baueBewerber({
      closingTerminDatum: "10.09.2030",
      closingTerminUhrzeit: "14:30",
      closingTerminSelbstGebucht: true,
      status: "Closing",
    }));
    // Der Vermerk "Vom Bewerber selbst gebucht" ist bewusst entfallen: Datum und
    // Uhrzeit sagen dasselbe.
    expect(screen.queryByText(/Vom Bewerber selbst gebucht/)).not.toBeInTheDocument();
    // Felder sind bereits sichtbar und vorbelegt, unverändert ist nichts zu speichern.
    expect(screen.getByLabelText("Uhrzeit")).toHaveValue("14:30");
    expect(screen.getByRole("button", { name: /Termin speichern/ })).toBeDisabled();
    // Termin verschieben: speichert neu, aber kein weiterer Statuswechsel aus "Closing".
    fireEvent.change(screen.getByLabelText("Uhrzeit"), { target: { value: "16:00" } });
    fireEvent.click(screen.getByRole("button", { name: /Termin speichern/ }));
    expect(updateBewerber).toHaveBeenCalledWith("selbst-1", expect.objectContaining({
      closingTerminUhrzeit: "16:00",
      closingRemindersSent: [],
    }));
    expect(changeBewerberStatus).not.toHaveBeenCalled();
  });

  it("ohne Bearbeitungsrecht gibt es keine Felder", () => {
    renderKarte(baueBewerber(), false);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Datum")).not.toBeInTheDocument();
  });

  it("heißt Videocall Termin und nicht mehr Closing-Termin", () => {
    renderKarte(baueBewerber());
    expect(screen.getByText("Videocall Termin")).toBeInTheDocument();
    expect(screen.queryByText("Closing-Termin")).not.toBeInTheDocument();
  });
});

describe("ClosingTerminKarte mit selbst gebuchtem Termin", () => {
  // 10.09.2030, 14:30 deutscher Zeit (Sommerzeit, also 12:30 UTC).
  const START = "2030-09-10T12:30:00.000Z";

  it("zeigt Datum und Uhrzeit der Buchung", () => {
    renderKarte(baueBewerber(), true, buchung(START));
    expect(screen.getByTestId("videocall-termin-gebucht")).toHaveTextContent("10.9.2030 um 14:30 Uhr");
  });

  it("blendet die Eingabefelder aus, es gibt nichts von Hand einzutragen", () => {
    renderKarte(baueBewerber(), true, buchung(START));
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Datum")).not.toBeInTheDocument();
    expect(screen.queryByText(/Wird im Erstgesprächs-Skript gesetzt/)).not.toBeInTheDocument();
  });

  it("ohne Buchung bleiben die Felder von Hand bedienbar", () => {
    renderKarte(baueBewerber({ closingTerminDatum: "10.09.2026", closingTerminUhrzeit: "14:00" }), true, null);
    expect(screen.queryByTestId("videocall-termin-gebucht")).not.toBeInTheDocument();
    expect(screen.getByText(/10\.09\.2026/)).toBeInTheDocument();
    expect(screen.getByLabelText("Datum")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});

/**
 * Sagt der Bewerber ab, räumt `bewerber_termin_absagen` Datum und Uhrzeit in
 * der Akte. Ohne die abgesagte Buchungszeile stünde die Karte danach da wie bei
 * jemandem, der nie einen Termin hatte.
 */
describe("ClosingTerminKarte nach einer Absage", () => {
  const START = "2030-09-10T12:30:00.000Z";
  const abgesagt = () => buchung(START, "abgesagt");

  it("zeigt den abgesagten Termin samt Abzeichen", () => {
    renderKarte(baueBewerber(), true, null, abgesagt());
    expect(screen.getByTestId("videocall-termin-abgesagt")).toHaveTextContent("10.9.2030 um 14:30 Uhr");
    expect(screen.getByText("Abgesagt")).toBeInTheDocument();
  });

  it("das Abzeichen sagt als Satz, was es bedeutet, nicht nur über die Farbe", () => {
    renderKarte(baueBewerber(), true, null, abgesagt());
    expect(screen.getByLabelText(/Termin wurde abgesagt/)).toBeInTheDocument();
    expect(screen.getByLabelText(/bleibt im Closing/)).toBeInTheDocument();
  });

  it("ein neuer Termin lässt das Abzeichen verschwinden", () => {
    // Der Anschlussfall: Er bucht nach der Absage erneut. Dann liefert
    // `ladeBewerberBuchungen` die stehende Buchung, und die Karte zeigt sie.
    renderKarte(baueBewerber(), true, buchung(START), null);
    expect(screen.queryByText("Abgesagt")).not.toBeInTheDocument();
    expect(screen.getByTestId("videocall-termin-gebucht")).toBeInTheDocument();
  });

  it("ein von Hand gepflegter Termin schlägt die Absage", () => {
    // Nach der Absage hat HR einen neuen Termin vereinbart und eingetragen.
    renderKarte(
      baueBewerber({ closingTerminDatum: "20.09.2030", closingTerminUhrzeit: "09:00" }),
      true,
      null,
      abgesagt(),
    );
    expect(screen.queryByText("Abgesagt")).not.toBeInTheDocument();
    expect(screen.getByText(/20\.09\.2030/)).toBeInTheDocument();
  });

  it("der Weg zu einem neuen Termin von Hand bleibt offen", () => {
    renderKarte(baueBewerber(), true, null, abgesagt());
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
