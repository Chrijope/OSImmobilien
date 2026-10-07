import { describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, fireEvent, within } from "@testing-library/react";

/*
 * Der Namenskopf schreibt über den Store, das Löschen hängt an einer
 * Rückfrage. Beides wird hier gemockt: Geprüft wird die Spalte, nicht der
 * Store.
 */
vi.mock("@/lib/bewerbungStore", async () => {
  const echt = await vi.importActual<Record<string, unknown>>("@/lib/bewerbungStore");
  return { ...echt, updateBewerber: vi.fn(), changeBewerberStatus: vi.fn(), addNotizEntry: vi.fn() };
});
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn(), useToast: () => ({ toast: vi.fn() }) }));

import { BewerberprofilPerson } from "./BewerberprofilPerson";
import type { Bewerber } from "@/lib/bewerbungStore";

/** Ein schlichtes Eingabefeld, das dem `EditableField` der Seite entspricht. */
function Feld({ value, onSave, placeholder }: { value: string; onSave: (v: string) => void; placeholder?: string }) {
  return <input aria-label={placeholder || "Feld"} defaultValue={value} onBlur={(e) => onSave(e.target.value)} />;
}

function baueBewerber(teil: Partial<Bewerber> = {}): Bewerber {
  return {
    id: "b-1",
    vorname: "Michael",
    nachname: "Beispiel",
    email: "m.beispiel@example.de",
    telefon: "+49 170 1234567",
    ort: "Hamburg",
    quelle: "Meta",
    beworben: "02.09.2026",
    stelleId: "",
    stelleTitel: "Vertriebspartner",
    status: "Closing",
    bewertung: 0,
    erstelltAm: "2026-09-02T10:00:00.000Z",
    typ: "", typLabel: "", typBeschreibung: "", typEignung: "", erfahrung: "",
    motivation: "", notizen: "", ziele: "", beschaeftigungsart: "", onboardingTerminId: "",
    lebenslaufUrl: "", dokumente: [], vertragStatus: "nicht_gesendet", vertragDatum: "",
    benachrichtigungen: [], chatVerknuepft: false,
    ausgangslage: "", zielBest: "", wieStarten: "",
    notizenLog: [], adresse: "Musterweg 1", rechnungsAdresse: "",
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
    vertriebserfahrung: "Fünf Jahre",
    ...teil,
  } as Bewerber;
}

function zeichne(teil: Partial<Bewerber> = {}, canEdit = true, onLoeschen = vi.fn(), nichtErreicht = 0) {
  const onFeld = vi.fn();
  const onWhatsappAngeschrieben = vi.fn();
  const onBewertung = vi.fn();
  render(
    <BewerberprofilPerson
      b={baueBewerber(teil)}
      canEdit={canEdit}
      beschreibung="Vertriebspartner · Meta"
      schnellaktionen={<button type="button">Drei Knöpfe</button>}
      feldKomponente={Feld}
      onNameSpeichern={vi.fn()}
      onFeld={onFeld}
      onStammdatenBearbeiten={vi.fn()}
      onLoeschen={onLoeschen}
      onWhatsappAngeschrieben={canEdit ? onWhatsappAngeschrieben : undefined}
      onBewertung={canEdit ? onBewertung : undefined}
      vorabScore={<span>Abzeichen</span>}
      nichtErreichtVersuche={nichtErreicht}
    />,
  );
  return { onFeld, onLoeschen, onWhatsappAngeschrieben, onBewertung };
}

describe("BewerberprofilPerson", () => {
  it("zeigt Name, Kontaktdaten und Bewerbungsangaben in der linken Spalte", () => {
    zeichne();
    const karte = screen.getByTestId("bewerberprofil-person");
    expect(within(karte).getByText("Michael Beispiel")).toBeInTheDocument();
    expect(within(karte).getByText("m.beispiel@example.de")).toBeInTheDocument();
    expect(within(karte).getByText("Vertriebspartner")).toBeInTheDocument();
    expect(within(karte).getByText("02.09.2026")).toBeInTheDocument();
    expect(within(karte).getByText("Meta")).toBeInTheDocument();
  });

  it("stellt die drei Schnellaktionen über die Kontaktdaten", () => {
    zeichne();
    expect(screen.getByRole("button", { name: "Drei Knöpfe" })).toBeInTheDocument();
  });

  it("zeigt alle sieben Meta-Bewerbungsfragen", () => {
    zeichne();
    const karte = screen.getByTestId("bewerberprofil-metafragen");
    expect(within(karte).getByText("Wie viel Vertriebserfahrung bringst du mit?")).toBeInTheDocument();
    expect(within(karte).getByText("Wie alt bist du?")).toBeInTheDocument();
    expect(within(karte).getAllByRole("textbox")).toHaveLength(7);
  });

  it("gibt eine geänderte Antwort mit ihrem Feldnamen nach oben", () => {
    const { onFeld } = zeichne();
    const karte = screen.getByTestId("bewerberprofil-metafragen");
    const feld = within(karte).getAllByRole("textbox")[0];
    fireEvent.blur(feld, { target: { value: "Zehn Jahre" } });
    expect(onFeld).toHaveBeenCalledWith("vertriebserfahrung", "Zehn Jahre");
  });

  it("ruft beim Löschen nur den Aufrufer, der selbst zurückfragt", () => {
    const onLoeschen = vi.fn();
    zeichne({}, true, onLoeschen);
    fireEvent.click(screen.getByRole("button", { name: /Bewerber löschen/ }));
    expect(onLoeschen).toHaveBeenCalledTimes(1);
  });

  it("zeigt ohne Verwaltungsrecht weder Löschknopf noch Eingabefelder", () => {
    zeichne({}, false);
    expect(screen.queryByRole("button", { name: /Bewerber löschen/ })).not.toBeInTheDocument();
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.getByText("Fünf Jahre")).toBeInTheDocument();
  });

  it("sagt bei fehlender Angabe „Nicht hinterlegt“ statt nichts", () => {
    zeichne({ email: "", telefon: "" });
    const karte = screen.getByTestId("bewerberprofil-person");
    expect(within(karte).getAllByText("Nicht hinterlegt").length).toBeGreaterThanOrEqual(2);
  });
});

/*
 * ─── Was Christian am 17.09.2026 in der linken Spalte bestellt hat ───
 *
 * Der Löschknopf gehört an den Fuss der Kontaktdaten, das WhatsApp-Zeichen und
 * der Vermerk „schon angeschrieben" an die Telefonnummer, und die Sterne sollen
 * auch hier stehen, dort aber nur zum Ansehen.
 */
/*
 * jsdom kennt keine `PointerEvent` und wirft bei `fireEvent.pointerDown` die
 * Koordinaten weg. Ein `MouseEvent` mit dem Namen des Zeigerereignisses trägt
 * sie, und React hört ohnehin nur auf den Namen.
 */
function tippe(el: Element, vonX: number, vonY: number, bisX: number, bisY: number) {
  fireEvent(el, new MouseEvent("pointerdown", { bubbles: true, clientX: vonX, clientY: vonY }));
  fireEvent(el, new MouseEvent("pointerup", { bubbles: true, clientX: bisX, clientY: bisY }));
}

describe("Kontaktdaten, Fuss und Sterne", () => {
  it("stellt den Löschknopf an den Fuss der Kontaktdaten", () => {
    zeichne();
    const karte = screen.getByTestId("bewerberprofil-person");
    expect(within(karte).getByRole("button", { name: /Bewerber löschen/ })).toBeInTheDocument();
    // Und nicht mehr unter den Meta-Bewerbungsfragen.
    const meta = screen.getByTestId("bewerberprofil-metafragen");
    expect(within(meta).queryByRole("button", { name: /Bewerber löschen/ })).not.toBeInTheDocument();
  });

  it("zeigt den Löschknopf nur, wer auch löschen darf", () => {
    zeichne({}, false);
    expect(screen.queryByRole("button", { name: /Bewerber löschen/ })).not.toBeInTheDocument();
  });

  it("stellt WhatsApp zur Telefonnummer, Zeichen und Vermerk", () => {
    const { onWhatsappAngeschrieben } = zeichne();
    expect(screen.getByRole("link", { name: "WhatsApp öffnen" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Über WhatsApp angeschrieben" }));
    expect(onWhatsappAngeschrieben).toHaveBeenCalledWith(true);
  });

  /*
   * Die Sterne stehen hier nur zum Ansehen. Vergeben werden sie im Reiter
   * Übersicht, weil dort Vorab-Score und Assessment danebenstehen und man erst
   * damit sieht, wogegen man bewertet. Zwei bedienbare Sternreihen für
   * denselben Wert laden dazu ein, beim Rollen auf dem Handy versehentlich
   * eine Bewertung zu setzen.
   */
  /*
   * Seit dem 17.09.2026 ist das die einzige Stelle, an der bewertet wird: Der
   * Kasten „Deine Bewertung" im Reiter Übersicht ist entfallen.
   */
  it("lässt hier bewerten und zeigt den Wert", () => {
    const { onBewertung } = zeichne({ bewertung: 4 });
    const bewertung = screen.getByTestId("bewerberprofil-bewertung");
    expect(bewertung).toHaveTextContent("4/5");
    tippe(screen.getByRole("button", { name: /^2 von 5 Sternen vergeben/ }), 10, 10, 11, 10);
    expect(onBewertung).toHaveBeenCalledWith(2);
  });

  /*
   * Das war das Bedenken, das gegen eine zweite bedienbare Sternreihe sprach:
   * Wer auf dem Telefon durch die Spalte rollt, setzt sonst irgendwann eine
   * Bewertung, die niemand setzen wollte.
   */
  it("setzt nichts, wenn der Finger gerollt statt getippt hat", () => {
    const { onBewertung } = zeichne({ bewertung: 0 });
    // Aufgesetzt bei 200, losgelassen bei 140: Das ist ein Rollen.
    tippe(screen.getByRole("button", { name: /^3 von 5 Sternen vergeben/ }), 10, 200, 12, 140);
    expect(onBewertung).not.toHaveBeenCalled();
  });

  it("nimmt einen gesetzten Wert auf demselben Stern wieder zurück", () => {
    const { onBewertung } = zeichne({ bewertung: 3 });
    tippe(screen.getByRole("button", { name: /^3 von 5 Sternen, noch einmal tippen/ }), 5, 5, 5, 5);
    expect(onBewertung).toHaveBeenCalledWith(0);
  });

  it("bietet zusätzlich einen ausgeschriebenen Knopf zum Zurücknehmen", () => {
    const { onBewertung } = zeichne({ bewertung: 2 });
    fireEvent.click(screen.getByRole("button", { name: "Zurücknehmen" }));
    expect(onBewertung).toHaveBeenCalledWith(0);
  });

  it("zeigt die Sterne ohne Recht nur zum Ansehen", () => {
    zeichne({ bewertung: 4 }, false);
    const bewertung = screen.getByTestId("bewerberprofil-bewertung");
    expect(bewertung).toHaveTextContent("4/5");
    expect(within(bewertung).queryByRole("button")).not.toBeInTheDocument();
  });

  /*
   * Score und Sterne stehen jetzt untereinander. Dass der eine gerechnet und
   * die anderen von Hand vergeben sind, muss trotzdem dastehen.
   */
  it("hält Score und Sterne auseinander", () => {
    zeichne({ bewertung: 4 });
    expect(screen.getByText("Gerechnet aus dem eingereichten Bogen")).toBeInTheDocument();
    expect(screen.getByText("Von Hand vergeben")).toBeInTheDocument();
  });

  it("nennt die erfolglosen Anrufe an der Telefonnummer, aber keine Null", () => {
    zeichne({}, true, vi.fn(), 3);
    expect(screen.getByTestId("bewerberprofil-nicht-erreicht")).toHaveTextContent("3 erfolglose Anrufe");
    cleanup();
    zeichne({}, true, vi.fn(), 0);
    expect(screen.queryByTestId("bewerberprofil-nicht-erreicht")).not.toBeInTheDocument();
  });

  it("zeigt bei Leads aus „Partner werden“ Rolle und Antworten statt der Meta-Fragen", () => {
    zeichne({
      partnerWerden: {
        rolleText: "Versicherungsmakler",
        wegText: "Tippgeber",
        firma: "Muster GmbH",
        kampagne: "partner_p1",
        lesbar: [{ frage: "Wie viele Kunden betreust du heute?", antwort: "100 bis 500" }],
      },
    });
    const karte = screen.getByTestId("bewerberprofil-partner-werden");
    expect(karte).toHaveTextContent("Versicherungsmakler");
    expect(karte).toHaveTextContent("Muster GmbH");
    expect(karte).toHaveTextContent("partner_p1");
    expect(karte).toHaveTextContent("100 bis 500");
    expect(screen.queryByTestId("bewerberprofil-metafragen")).not.toBeInTheDocument();
  });
});
